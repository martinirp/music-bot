const queueManager = require('../utils/queueManager');

module.exports = {
    name: 'stats',
    aliases: ['estatisticas', 'info'],
    inVoiceChannel: false,
    execute: async (message, client, args) => {
        try {
            const stats = queueManager.getStats();
            const { EmbedBuilder } = require('discord.js');
            
            // Calcular eficiência do cache
            const totalCacheAccess = stats.cacheHits + stats.cacheMisses;
            const cacheEfficiency = totalCacheAccess > 0 
                ? ((stats.cacheHits / totalCacheAccess) * 100).toFixed(1)
                : 0;

            // Calcular uso de memória
            const memoryUsage = process.memoryUsage();
            const usedMemory = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
            const totalMemory = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);

            // Calcular uptime
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

            const embed = new EmbedBuilder()
                .setTitle('📊 Estatísticas do Bot de Música')
                .setColor('#0099ff')
                .addFields(
                    { 
                        name: '🎵 Estatísticas de Cache', 
                        value: `• Hits: ${stats.cacheHits}\n• Misses: ${stats.cacheMisses}\n• Eficiência: ${cacheEfficiency}%\n• Downloads: ${stats.totalDownloads}\n• Cache: ${stats.cacheSize}/${stats.cacheLimit}`,
                        inline: true 
                    },
                    { 
                        name: '🖥️ Sistema', 
                        value: `• Servidores: ${stats.totalServers}\n• Conexões: ${stats.totalConnections}\n• Players: ${stats.totalPlayers}\n• Memória: ${usedMemory}MB\n• Uptime: ${uptimeString}`,
                        inline: true 
                    },
                    { 
                        name: '⚡ Performance', 
                        value: `• Erros: ${stats.errors}\n• Node.js: ${process.version}\n• Plataforma: ${process.platform}`,
                        inline: false 
                    }
                )
                .setFooter({ text: `Estatísticas atualizadas em ${new Date().toLocaleString('pt-BR')}` })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('❌ Stats Error:', error);
            await message.channel.send('❌ | Erro ao buscar estatísticas!');
        }
    },
};