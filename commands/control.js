const queueManager = require('../utils/queueManager');

module.exports = {
    name: 'controls',
    aliases: ['panel', 'controles'],
    inVoiceChannel: true,
    execute: async (message, client, args) => {
        const guildId = message.guild.id;
        
        // Verificar se está tocando algo
        const currentSong = queueManager.getCurrentSong(guildId);
        if (!currentSong) {
            return message.channel.send('❌ | Nenhuma música tocando no momento!');
        }

        try {
            // Criar mensagem de controles
            const controlMessage = queueManager.createControlMessage(guildId);
            if (!controlMessage) {
                return message.channel.send('❌ | Erro ao criar controles!');
            }

            // Enviar mensagem com controles
            const sentMessage = await message.channel.send(controlMessage);
            
            // Opcional: Deletar mensagem do comando
            setTimeout(() => {
                message.delete().catch(() => {});
            }, 1000);

        } catch (error) {
            console.error('❌ Controls Error:', error);
            message.channel.send('❌ | Erro ao criar painel de controle!');
        }
    },
};