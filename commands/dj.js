// commands/dj.js - VERSÃO SIMPLIFICADA
const queueManager = require('../utils/queueManager');

module.exports = {
    name: 'dj',
    aliases: ['effects', 'efeitos'],
    description: 'Aplica efeitos DJ na música atual',
    inVoiceChannel: true,
    
    execute: async (message, client, args) => {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.channel.send('❌ | Entre em um canal de voz!');

        const guildId = message.guild.id;
        
        // Verificar se tem música tocando
        const currentSong = queueManager.getCurrentSong(guildId);
        if (!currentSong) {
            return message.channel.send('❌ | Nenhuma música tocando no momento!');
        }

        const effect = args[0]?.toLowerCase();
        const effects = {
            'bassboost': '🎸 **Bass Boost**',
            'nightcore': '⚡ **Nightcore**', 
            'vaporwave': '🌊 **Vaporwave**',
            '8d': '🌀 **8D Audio**',
            'normal': '🔁 **Normal**'
        };

        if (!effect || !effects[effect]) {
            const availableEffects = Object.keys(effects).map(e => `\`${e}\``).join(', ');
            return message.channel.send(
                `🎛️ **Efeitos DJ Disponíveis:**\n${availableEffects}\n\n` +
                `**Exemplo:** \`$dj bassboost\``
            );
        }

        try {
            // 🔥 SIMPLES: Apenas registra o efeito no queueManager
            queueManager.setDJEffects(guildId, effect);
            
            if (effect === 'normal') {
                await message.channel.send('✅ | **Efeitos removidos!** Som normal.');
            } else {
                await message.channel.send(`✅ | ${effects[effect]} **ativado!**\n*Efeito aplicado na próxima música*`);
            }
            
        } catch (error) {
            console.error('❌ Erro no comando DJ:', error);
            message.channel.send('❌ | Erro ao aplicar efeito: ' + error.message);
        }
    }
};


