const queueManager = require('../utils/queueManager');
const dibuiador = require('../utils/dibuiador');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'stats',
    aliases: ['estatisticas', 'info', 'status'],
    inVoiceChannel: false,

    execute: async (message, client, args) => {
        try {
            const stats = queueManager.getStats();

            // 🎵 Dados do cache local
            const cacheDir = './music_cache';
            let totalFiles = 0;
            let totalSize = 0;
            if (fs.existsSync(cacheDir)) {
                const files = fs.readdirSync(cacheDir);
                totalFiles = files.length;
                totalSize = files.reduce((acc, file) => {
                    const filePath = path.join(cacheDir, file);
                    try {
                        const stats = fs.statSync(filePath);
                        return acc + stats.size;
                    } catch {
                        return acc;
                    }
                }, 0);
                totalSize = (totalSize / 1024 / 1024).toFixed(2);
            }

            // 📈 Calcular eficiência do cache
            const totalCacheAccess = stats.cacheHits + stats.cacheMisses;
            const cacheEfficiency = totalCacheAccess > 0
                ? ((stats.cacheHits / totalCacheAccess) * 100).toFixed(1)
                : 0;

            // 🧠 Uso de memória
            const memoryUsage = process.memoryUsage();
            const usedMemory = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
            const totalMemory = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);

            // ⏱️ Tempo de atividade
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

            // 📊 Embed
            const embed = new EmbedBuilder()
                .setTitle('📊 Estatísticas do Bot de Música')
                .setColor('#00BFFF')
                .addFields(
                    {
                        name: '🎵 Cache Local',
                        value: `• Arquivos: **${totalFiles}**\n• Espaço: **${totalSize}MB**\n• Limite: 
**${stats.cacheLimit}**`,
                        inline: true
                    },
                    {
                        name: '💾 Desempenho do Cache',
                        value: `• Hits: **${stats.cacheHits}**\n• Misses: **${stats.cacheMisses}**\n• Eficiência: 
**${cacheEfficiency}%**\n• Downloads: **${stats.totalDownloads}**`,
                        inline: true
                    },
                    {
                        name: '🖥️ Sistema',
                        value: `• Servidores ativos: **${stats.totalServers}**\n• Cache em memória: 
**${stats.cacheSize}**\n• Erros: **${stats.errors}**`,
                        inline: true
                    },
                    {
                        name: '⚙️ Recursos',
                        value: `• Memória: **${usedMemory} / ${totalMemory}MB**\n• Node.js: **${process.version}**\n• 
Plataforma: **${process.platform}**`,
                        inline: true
                    },
                    {
                        name: '⏱️ Uptime',
                        value: `${uptimeString}`,
                        inline: true
                    }
                )
                .setFooter({ text: `📅 Atualizado em ${new Date().toLocaleString('pt-BR')}` })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('❌ Stats Error:', error);
            await message.channel.send('❌ | Erro ao buscar estatísticas!');
        }
    },
};
