// commands/reverse.js - VERSÃO SIMPLIFICADA  
const queueManager = require('../utils/queueManager');

module.exports = {
    name: 'reverse',
    aliases: ['reverso', 'backwards'],
    description: 'Alterna efeito de música reversa',
    inVoiceChannel: true,
    
    execute: async (message, client, args) => {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.channel.send('❌ | Entre em um canal de voz!');

        const guildId = message.guild.id;
        const currentSong = queueManager.getCurrentSong(guildId);
        
        if (!currentSong) {
            return message.channel.send('❌ | Nenhuma música tocando no momento!');
        }

        try {
            const currentEffect = queueManager.getDJEffects(guildId);
            const isReversed = currentEffect === 'reverse';
            
            if (isReversed) {
                queueManager.setDJEffects(guildId, 'normal');
                await message.channel.send('✅ | **Efeito reverso DESATIVADO!** ↩️');
            } else {
                queueManager.setDJEffects(guildId, 'reverse');
                await message.channel.send('✅ | **Efeito reverso ATIVADO!** ↪️\n*Próxima música tocará com efeito reverso*');
            }
            
        } catch (error) {
            console.error('❌ Erro no comando Reverse:', error);
            message.channel.send('❌ | Erro: ' + error.message);
        }
    }
};

