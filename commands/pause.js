const queueManager = require('../utils/queueManager');

module.exports = {
    name: 'resume',
    aliases: ['continuar'],
    inVoiceChannel: true,
    execute: async (message, client, args) => {
        const guildId = message.guild.id;
        const player = queueManager.getPlayer(guildId);
        
        if (player && player.state.status === 'paused') {
            player.unpause();
            await message.channel.send('▶️ | Música continuando...');
            
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
            }, 500);
        } else {
            await message.channel.send('❌ | Nenhuma música pausada no momento');
        }
    },
};