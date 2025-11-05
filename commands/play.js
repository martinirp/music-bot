const queueManager = require('../utils/queueManager');
const dibuiador = require('../utils/dibuiador');
const path = require('path');
const fs = require('fs');

module.exports = {
    name: 'play',
    aliases: ['p'],
    inVoiceChannel: true,
    execute: async (message, client, args) => {
        if (!args[0]) return message.channel.send('❌ | Entre com um link ou nome da música!');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.channel.send('❌ | Entre em um canal de voz!');

        const guildId = message.guild.id;
        const input = args.join(' ');

        try {
            let url;
            let title;

            // VERIFICAR SE É LINK OU BUSCA
            if (isYouTubeLink(input)) {
                url = input;
                title = "Música do YouTube";
                console.log('🔗 Usando link direto:', url);
            } else {
                await message.channel.send('🔍 | Procurando música...');
                
                const resultado = await dibuiador.buscarMusica(input);
                if (!resultado) {
                    return message.channel.send('❌ | Música não encontrada! Tente outro nome ou use um link direto do YouTube.');
                }

                url = resultado.url;
                title = resultado.title;
                
                console.log('✅ Música encontrada:', title);
                await message.channel.send(`✅ | **Encontrado:** ${title}`);
            }

            // Criar arquivo temporário
            const tempDir = '/tmp/bot_music';
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const tempFile = path.join(tempDir, `audio_${Date.now()}.mp3`);

            // Criar info da música
            const songInfo = {
                url: url,
                file: tempFile,
                requestedBy: message.author.tag,
                channel: message.channel,
                title: title,
                position: 0
            };

            // Adicionar à fila
            const position = await queueManager.addToQueue(guildId, songInfo, voiceChannel);
            songInfo.position = position;
            
            await message.channel.send(`✅ | Adicionado à fila na posição **#${position}**`);

        } catch (error) {
            console.error('❌ Play Error:', error);
            message.channel.send(`❌ | Erro: ${error.message}`);
        }
    },
};

// FUNÇÃO PARA VERIFICAR SE É LINK DO YOUTUBE
function isYouTubeLink(input) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return youtubeRegex.test(input);
}