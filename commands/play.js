const queueManager = require('../utils/queueManager');
const dibuiador = require('../utils/dibuiador');
const downloadManager = require('../utils/download');
const { joinVoiceChannel } = require('@discordjs/voice');

// 🆕 FUNÇÃO PARA DETECTAR PLAYLIST (fora do module.exports)
function isPlaylistUrl(url) {
    return url.includes('list=') || 
           url.includes('playlist?') || 
           url.includes('/playlist/') ||
           url.includes('&start_radio=');
}

// 🆕 FUNÇÃO PARA TRATAR PLAYLIST (fora do module.exports)
async function handlePlaylist(message, guildId, playlistUrl, voiceChannel) {
    try {
        console.log('📚 Carregando playlist...');
        const loadingMsg = await message.channel.send('🔄 | Loading playlist...');

        const playlist = await dibuiador.buscarPlaylist(playlistUrl);
        
        if (!playlist || !playlist.videos || playlist.videos.length === 0) {
            await loadingMsg.edit('❌ | Playlist vazia ou não encontrada!');
            return;
        }

        let adicionadas = 0;
        let falhas = 0;

        // Adicionar cada música da playlist
        for (const video of playlist.videos) {
            try {
                const downloadResult = await downloadManager.downloadSong(
                    video.url,
                    video.videoId,
                    video.title
                );

                if (downloadResult.success) {
                    const songInfo = {
                        url: video.url,
                        title: video.title,
                        videoId: video.videoId,
                        requestedBy: message.author.tag,
                        channel: message.channel,
                        fromCache: downloadResult.fromCache,
                        file: downloadResult.file
                    };

                    await queueManager.addToQueue(guildId, songInfo, voiceChannel);
                    adicionadas++;
                } else {
                    falhas++;
                }
            } catch (err) {
                falhas++;
            }
            
            // Delay para não sobrecarregar
            await new Promise(res => setTimeout(res, 500));
        }

        // 🆕 MENSAGEM DISCRETA PARA PLAYLIST
        await loadingMsg.edit(`✅ | **Playlist added:** ${adicionadas} songs to queue${falhas > 0 ? ` (${falhas} failed)` : ''}`);

        // Atualizar controles se for a primeira música
        const queue = queueManager.getQueue(guildId);
        if (queue?.songs?.length === adicionadas) {
            setTimeout(async () => {
                const controlManager = require('../index.js').controlManager;
                if (controlManager) {
                    await controlManager.updateOrCreateControlMessage(guildId, message.channel);
                }
            }, 2000);
        }

    } catch (error) {
        console.error('❌ Erro ao carregar playlist:', error);
        
        // Fallback: tentar como música única
        try {
            const resultado = await dibuiador.buscarMusica(playlistUrl);
            if (resultado) {
                await message.channel.send('🔁 | Playing as single track...');
                
                const downloadResult = await downloadManager.downloadSong(
                    resultado.url, 
                    resultado.videoId, 
                    resultado.title
                );

                if (downloadResult.success) {
                    const songInfo = {
                        url: resultado.url,
                        title: resultado.title,
                        videoId: resultado.videoId,
                        requestedBy: message.author.tag,
                        channel: message.channel,
                        fromCache: downloadResult.fromCache,
                        file: downloadResult.file
                    };

                    await queueManager.addToQueue(guildId, songInfo, voiceChannel);
                    
                    // Mensagem discreta para fallback
                    const artistMatch = resultado.title.match(/(.+?)\s+[-–]/);
                    const artist = artistMatch ? artistMatch[1].trim() : 'Unknown Artist';
                    const songName = resultado.title.replace(/^.+\s[-–]\s*/, '').trim();
                    
                    // 🆕 REMOVER INFORMAÇÕES TÉCNICAS DO TÍTULO
                    const cleanSongName = songName
                        .replace(/\s*\[[^\]]*\]/g, '') // Remove [videoId]
                        .replace(/\s*\([^)]*\)/g, '')  // Remove (Official Video)
                        .replace(/\s*[-–].*$/, '')     // Remove tudo depois de - ou –
                        .trim();
                    
                    await message.channel.send(`**Started playing** ${cleanSongName} **by** ${artist}`);
                }
            } else {
                await message.channel.send('❌ | Could not load playlist or track.');
            }
        } catch (fallbackError) {
            await message.channel.send('❌ | Error processing the link.');
        }
    }
}

module.exports = {
    name: 'play',
    aliases: ['p'],
    inVoiceChannel: true,

    execute: async (message, client, args) => {
        if (!args[0])
            return message.channel.send('❌ | Entre com um link ou nome da música!');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel)
            return message.channel.send('❌ | Entre em um canal de voz!');

        const permissions = voiceChannel.permissionsFor(message.guild.members.me);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return message.channel.send('❌ | Não tenho permissão para entrar/falar nesse canal!');
        }

        let connection = queueManager.connections.get(message.guild.id);
        if (!connection) {
            try {
                connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: false
                });
                queueManager.connections.set(message.guild.id, connection);
            } catch (err) {
                console.error('❌ Falha ao conectar:', err);
                return message.channel.send('❌ | Não consegui entrar no canal de voz.');
            }
        }

        const guildId = message.guild.id;
        const query = args.join(" ");

        try {
            // 🆕 DETECTAR SE É PLAYLIST (usando a função externa)
            if (isPlaylistUrl(query)) {
                console.log('🎵 Detectada playlist, carregando...');
                return await handlePlaylist(message, guildId, query, voiceChannel);
            }

            // Busca normal de música única
            let resultado = await dibuiador.buscarMusica(query);
            if (!resultado) return message.channel.send('❌ | Não encontrei nada!');

            const downloadResult = await downloadManager.downloadSong(
                resultado.url, 
                resultado.videoId, 
                resultado.title
            );

            if (!downloadResult.success) {
                return message.channel.send('❌ | Erro ao baixar a música: ' + downloadResult.error);
            }

            const songInfo = {
                url: resultado.url,
                title: resultado.title,
                videoId: resultado.videoId,
                requestedBy: message.author.tag,
                channel: message.channel,
                fromCache: downloadResult.fromCache,
                file: downloadResult.file
            };

            const position = await queueManager.addToQueue(guildId, songInfo, voiceChannel);
            
            // 🆕 MENSAGEM DISCRETA - apenas se for a primeira da fila
            const queue = queueManager.getQueue(guildId);
            if (position === 1) {
                // 🎵 Formato discreto: "Started playing Música by Artista"
                const artistMatch = resultado.title.match(/(.+?)\s+[-–]/);
                const artist = artistMatch ? artistMatch[1].trim() : 'Unknown Artist';
                const songName = resultado.title.replace(/^.+\s[-–]\s*/, '').trim();
                
                // 🆕 REMOVER INFORMAÇÕES TÉCNICAS DO TÍTULO
                const cleanSongName = songName
                    .replace(/\s*\[[^\]]*\]/g, '') // Remove [videoId]
                    .replace(/\s*\([^)]*\)/g, '')  // Remove (Official Video)
                    .replace(/\s*[-–].*$/, '')     // Remove tudo depois de - ou –
                    .trim();
                
                await message.channel.send(`**Started playing** ${cleanSongName} **by** ${artist}`);
            } else {
                // Se não for a primeira, mensagem ainda mais discreta
                const cleanTitle = resultado.title
                    .replace(/\s*\[[^\]]*\]/g, '')
                    .replace(/\s*\([^)]*\)/g, '')
                    .replace(/\s*[-–].*$/, '')
                    .trim();
                
                await message.channel.send(`✅ | **${cleanTitle}** added to queue (#${position})`);
            }

            if (queue?.songs?.length === 1) {
                setTimeout(async () => {
                    const controlManager = require('../index.js').controlManager;
                    if (controlManager) {
                        await controlManager.updateOrCreateControlMessage(guildId, message.channel);
                    }
                }, 2000);
            }

        } catch (err) {
            console.error("❌ Play Error:", err);
            return message.channel.send('❌ | Ocorreu um erro: ' + err.message);
        }
    }
};
