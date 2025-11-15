// commands/catalog.js
const listManager = require('../utils/listManager');

module.exports = {
    name: 'catalog',
    aliases: ['cat', 'library'],
    execute: async (message, client, args) => {
        const subcommand = args[0]?.toLowerCase();

        switch (subcommand) {
            case 'stats':
                const stats = listManager.getStats();
                const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
                
                message.channel.send({
                    embeds: [{
                        title: '📊 Estatísticas do Catálogo',
                        fields: [
                            { name: '🎵 Músicas', value: stats.totalSongs.toString(), inline: true },
                            { name: '🎤 Artistas', value: stats.artists.toString(), inline: true },
                            { name: '💾 Tamanho', value: `${sizeMB} MB`, inline: true }
                        ],
                        color: 0x00FF00
                    }]
                });
                break;

            case 'cleanup':
                message.channel.send('🧹 Limpando catálogo...');
                const removed = listManager.cleanupCatalog();
                message.channel.send(`✅ Catálogo limpo! ${removed} entradas inválidas removidas.`);
                break;

            case 'search':
                if (!args[1]) {
                    return message.channel.send('❌ Digite o que quer buscar: `!catalog search <nome>`');
                }
                
                const searchQuery = args.slice(1).join(' ');
                const results = listManager.searchInCatalog(searchQuery);
                
                if (results.length === 0) {
                    return message.channel.send('❌ Nenhuma música encontrada no catálogo.');
                }
                
                const resultsList = results.slice(0, 10).map((entry, i) => 
                    `${i + 1}. **${entry.title}**${entry.artist ? ` - ${entry.artist}` : ''}`
                ).join('\n');
                
                message.channel.send({
                    embeds: [{
                        title: `🔍 Resultados para "${searchQuery}"`,
                        description: resultsList,
                        color: 0x0099FF,
                        footer: { text: `${results.length} músicas encontradas` }
                    }]
                });
                break;

            default:
                message.channel.send({
                    embeds: [{
                        title: '📚 Comandos do Catálogo',
                        description: `
                        **!catalog stats** - Ver estatísticas
                        **!catalog search <nome>** - Buscar música
                        **!catalog cleanup** - Limpar entradas inválidas
                        **!catalog help** - Esta mensagem
                        `,
                        color: 0x0099FF
                    }]
                });
        }
    }
};
