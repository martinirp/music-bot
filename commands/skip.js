const queueManager = require('../utils/queueManager');

module.exports = {
    name: 'skip',
    aliases: ['s', 'pular'],
    inVoiceChannel: true,
    execute: async (message, client, args) => {
        const guildId = message.guild.id;
        const queueInfo = queueManager.getQueueInfo(guildId);
        
        if (!queueInfo.isPlaying) {
            return message.channel.send('❌ | Não há música tocando no momento!');
        }

        queueManager.skipSong(guildId);
        message.channel.send('⏭️ | Pulando para próxima música...');
    },
};