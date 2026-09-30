require('dotenv').config({ path: 'konfigurasi.env' }); // <-- Bagian ini disesuaikan
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Menambahkan .trim() untuk mencegah error karakter tersembunyi
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());

// MENGGANTI MODEL MENJADI FLASH-LATEST AGAR TIDAK ERROR 404 DI RAILWAY
const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// Memori obrolan sementara (RAM) untuk tiap user
const userSessions = new Map();

client.once('ready', () => {
    console.log(`✅ Bot Gemini Ultimate online sebagai ${client.user.tag}`);
});

async function urlToGenerativePart(url, mimeType) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return {
        inlineData: {
            data: Buffer.from(response.data).toString("base64"),
            mimeType
        }
    };
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const prefix = '!ai ';
    if (!message.content.startsWith(prefix)) return;

    const commandString = message.content.slice(prefix.length).trim();
    if (!commandString) return message.reply('Silakan masukkan pertanyaan atau perintahmu.');

    try {
        await message.channel.sendTyping();
        const lowerCommand = commandString.toLowerCase();

        // 0. FITUR BANTUAN (HELP COMMAND)
        if (lowerCommand === 'help' || lowerCommand === 'bantuan') {
            const pesanBantuan = 
                `🤖 **Panduan Penggunaan Bot Gemini Ultimate** 🤖\n\n` +
                `**1. Ngobrol Biasa (Chat)**\n` +
                `Gunakan awalan \`!ai\` diikuti pertanyaanmu.\n` +
                `> *Contoh:* \`!ai halo, ceritakan lelucon lucu\`\n\n` +
                `**2. Membuat Gambar (Image Generation)**\n` +
                `Gunakan awalan \`!ai buatkan gambar\` atau \`!ai generate image\`.\n` +
                `> *Contoh:* \`!ai buatkan gambar kucing memakai kacamata hitam\`\n\n` +
                `**3. Menganalisis Gambar (Vision)**\n` +
                `Upload file gambar (JPG/PNG), lalu beri caption dengan awalan \`!ai\`.\n` +
                `> *Contoh caption:* \`!ai tolong jelaskan apa yang ada di gambar ini\``;
                
            return message.reply(pesanBantuan);
        }

        // 1. FITUR PEMBUATAN GAMBAR (Imagen)
        if (lowerCommand.startsWith('buatkan gambar') || lowerCommand.startsWith('generate image')) {
            const imagePrompt = commandString.replace(/buatkan gambar|generate image/i, '').trim();
            // Menambahkan .trim() pada URL Imagen
            const imagenEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${process.env.GEMINI_API_KEY.trim()}`;
            
            const response = await axios.post(imagenEndpoint, {
                instances: [{ prompt: imagePrompt }],
                parameters: { sampleCount: 1 }
            });

            const base64Data = response.data.predictions[0].bytesBase64Encoded;
            const buffer = Buffer.from(base64Data, 'base64');
            const attachment = new AttachmentBuilder(buffer, { name: `gemini-generate-${Date.now()}.png` });

            return message.reply({ content: `🎨 Hasil gambar untuk: **${imagePrompt}**`, files: [attachment] });
        }

        // 2. FITUR VISION (Membaca Gambar yang di-upload)
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            if (!attachment.contentType.startsWith('image/')) {
                return message.reply('Sistem hanya mendukung analisis untuk file gambar (JPG/PNG).');
            }

            const imagePart = await urlToGenerativePart(attachment.url, attachment.contentType);
            const result = await textModel.generateContent([commandString, imagePart]);
            return message.reply(result.response.text().substring(0, 1995));
        }

        // 3. FITUR MEMORI TEKS CHAT
        const userId = message.author.id;
        if (!userSessions.has(userId)) {
            const chatSession = textModel.startChat({
                history: [
                    { role: "user", parts: [{ text: "Mulai sekarang, kamu adalah asisten AI yang pintar dan menggunakan bahasa yang santai." }] },
                    { role: "model", parts: [{ text: "Siap! Aku akan mengingat instruksi ini untuk obrolan kita ke depannya." }] },
                ],
            });
            userSessions.set(userId, chatSession);
        }

        const chat = userSessions.get(userId);
        const result = await chat.sendMessage(commandString);
        
        let responseText = result.response.text();
        if (responseText.length > 2000) responseText = responseText.substring(0, 1995) + '...';
        
        await message.reply(responseText);

    } catch (error) {
        console.error("Terjadi error pada sistem:", error?.response?.data || error.message);
        message.reply('⚠️ Terjadi kendala saat memproses permintaan. Pastikan API key memiliki izin atau coba gunakan prompt yang berbeda.');
    }
});

client.login(process.env.DISCORD_TOKEN.trim());
