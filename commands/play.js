const queueManager = require('../utils/queueManager');
const dibuiador = require('../utils/dibuiador');

module.exports = {
    name: 'play',
    aliases: ['p'],
    inVoiceChannel: true,
    execute: async (message, client, args) => {
        if (!args[0]) return message.channel.send('❌ | Entre com um link ou nome da música!');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.channel.send('❌ | Entre em um canal de voz!');

        // 🔥 VERIFICAR SE O BOT PODE ENTRAR NO CANAL
        const botPermissions = voiceChannel.permissionsFor(message.guild.members.me);
        if (!botPermissions.has('Connect') || !botPermissions.has('Speak')) {
            return message.channel.send('❌ | Não tenho permissão para entrar/falar nesse canal!');
        }

        const guildId = message.guild.id;
        const input = args.join(' ');

        try {
            let url;
            let title;
            let resultado;

            if (isYouTubeLink(input)) {
                url = normalizeYouTubeUrl(input);
                title = "Música do YouTube";
                
                const videoId = extractVideoId(url);
                
                console.log('🔗 Usando link direto (normalizado):', url, 'VideoID:', videoId);
                
                resultado = {
                    title: title,
                    url: url,
                    videoId: videoId,
                    query: input
                };
            } else {
                await message.channel.send('🔍 | Procurando música...');
                
                resultado = await dibuiador.buscarMusica(input);
                if (!resultado) {
                    return message.channel.send('❌ | Música não encontrada! Tente outro nome ou use um link direto do YouTube.');
                }

                url = resultado.url;
                title = resultado.title;
                
                console.log('✅ Música encontrada:', title);
                await message.channel.send(`✅ | **Encontrado:** ${title}`);
            }

            if (!url || !url.startsWith('https://')) {
                console.error('❌ URL inválida:', url);
                return message.channel.send('❌ | URL inválida encontrada!');
            }

            const songInfo = {
                url: url,
                title: title,
                videoId: resultado.videoId,
                requestedBy: message.author.tag,
                channel: message.channel,
                position: 0
            };

            const position = await queueManager.addToQueue(guildId, songInfo, voiceChannel);
            songInfo.position = position;
            
            await message.channel.send(`✅ | Adicionado à fila na posição **#${position}**`);

            // 🎮 CRIAR CONTROLES AUTOMATICAMENTE SE FOR A PRIMEIRA MÚSICA
            const queueInfo = queueManager.getQueueInfo(guildId);
            if (queueInfo.total === 1) { // Se é a primeira música
                setTimeout(async () => {
                    try {
                        // Usar o controlManager do index.js
                        const controlManager = require('../index.js').controlManager;
                        if (controlManager) {
                            await controlManager.updateOrCreateControlMessage(guildId, message.channel);
                        }
                    } catch (error) {
                        console.log('⚠️ Erro ao criar controles automáticos:', error.message);
                    }
                }, 2000);
            }

        } catch (error) {
            console.error('❌ Play Error:', error);
            message.channel.send(`❌ | Erro: ${error.message}`);
        }
    },
};

function isYouTubeLink(input) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return youtubeRegex.test(input);
}

function normalizeYouTubeUrl(url) {
    if (url.includes('youtu.be/')) {
        const videoId = url.split('youtu.be/')[1].split('?')[0];
        return `https://www.youtube.com/watch?v=${videoId}`;
    }
    
    if (url.includes('&list=')) {
        return url.split('&list=')[0];
    }
    
    return url;
}

function extractVideoId(url) {
    try {
        if (url.includes('youtu.be/')) {
            return url.split('youtu.be/')[1].split('?')[0];
        }
        
        if (url.includes('v=')) {
            return url.split('v=')[1].split('&')[0];
        }
        
        return `direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
        return `fallback_${Date.now()}`;
    }
}