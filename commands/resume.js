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
                    const messages = await message.channel.messages.fetch({ limit: 10 });
                    const controlMessage = messages.find(msg => 
                        msg.components.length > 0 && 
                        msg.components[0].components.some(comp => comp.customId === 'music_pause')
                    );
                    
                    if (controlMessage && controlMessage.editable) {
                        const newControlMessage = queueManager.createControlMessage(guildId);
                        if (newControlMessage) {
                            await controlMessage.edit(newControlMessage);
                        }
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