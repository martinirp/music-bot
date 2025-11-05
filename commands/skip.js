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

        // 🔥 VERIFICAR SE HÁ PRÓXIMA MÚSICA NA FILA
        if (queueInfo.queue.length === 0) {
            return message.channel.send('❌ | Não há próxima música na fila!');
        }

        queueManager.skipSong(guildId);
        message.channel.send('⏭️ | Pulando para próxima música...');

        // Atualizar controles
        setTimeout(async () => {
            try {
                const controlManager = require('../index.js').controlManager;
                if (controlManager) {
                    await controlManager.updateOrCreateControlMessage(guildId, message.channel);
                }
            } catch (error) {
                console.log('⚠️ Não foi possível atualizar controles:', error.message);
            }
        }, 1000);
    },
};