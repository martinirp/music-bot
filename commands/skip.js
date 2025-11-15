const queueManager = require('../utils/queueManager');

module.exports = {
    name: 'skip',
    aliases: ['s', 'pular', 'next'],
    inVoiceChannel: true,

    execute: async (message, client, args) => {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.channel.send('❌ | Você precisa estar em um canal de voz!');
        }

        const guildId = message.guild.id;
        const queue = queueManager.getQueue(guildId);

        if (!queue || !queue.isPlaying) {
            return message.channel.send('❌ | Nenhuma música tocando no momento!');
        }

        const currentSong = queue.currentSong;
        
        try {
            // Pular a música
            queueManager.skipSong(guildId);
            
            // 🆕 MOSTRAR INFORMAÇÃO DA PRÓXIMA MÚSICA
            const nextSong = queue.songs[0]; // Próxima música na fila
            
            if (nextSong) {
                // Limpar título da próxima música
                const cleanNextTitle = nextSong.title
                    .replace(/\s*\[[^\]]*\]/g, '')
                    .replace(/\s*\([^)]*\)/g, '')
                    .replace(/\s*[-–].*$/, '')
                    .trim();
                    
                const artistMatch = cleanNextTitle.match(/(.+?)\s+[-–]/);
                const artist = artistMatch ? artistMatch[1].trim() : 'Unknown Artist';
                const songName = cleanNextTitle.replace(/^.+\s[-–]\s*/, '').trim();
                
                await message.channel.send(`⏭️ | **Pulando...**\n🎵 | **Próxima:** ${songName} **by** ${artist}`);
            } else {
                await message.channel.send('⏭️ | **Pulando...**\n📭 | **Fila vazia**');
            }

        } catch (error) {
            console.error('❌ Erro no skip:', error);
            await message.channel.send('❌ | Erro ao pular a música!');
        }
    }
};

