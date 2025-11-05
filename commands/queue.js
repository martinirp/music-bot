const queueManager = require('../utils/queueManager');

module.exports = {
    name: 'queue',
    aliases: ['q', 'fila'],
    inVoiceChannel: false,
    execute: async (message, client, args) => {
        const guildId = message.guild.id;
        const queueInfo = queueManager.getQueueInfo(guildId);

        if (queueInfo.queue.length === 0 && !queueInfo.current) {
            return message.channel.send('📭 | A fila está vazia!');
        }

        let queueText = '';
        
        if (queueInfo.current) {
            queueText += `**🎶 Tocando agora:** ${queueInfo.current.title} (por ${queueInfo.current.requestedBy})\n\n`;
        }

        if (queueInfo.queue.length > 0) {
            queueText += '**📋 Próximas na fila:**\n';
            queueInfo.queue.forEach((song, index) => {
                queueText += `**${index + 1}.** ${song.title} (por ${song.requestedBy})\n`;
            });
        } else {
            queueText += '\n📭 | Nenhuma música na fila.';
        }

        message.channel.send(queueText);
    },
};