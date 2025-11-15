// commands/lib.js
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'lib',
    aliases: ['library', 'biblioteca', 'musicas', 'cache'],
    description: 'Lista todas as músicas salvas no cache',
    inVoiceChannel: false,
    
    execute: async (message, client, args) => {
        try {
            const cacheDir = './music_cache';
            
            // Verificar se a pasta existe
            if (!fs.existsSync(cacheDir)) {
                return message.channel.send('❌ | Nenhuma música encontrada no cache!');
            }

            // Ler todos os arquivos MP3
            const files = fs.readdirSync(cacheDir)
                .filter(file => file.endsWith('.mp3'))
                .sort(); // Ordenar alfabeticamente

            if (files.length === 0) {
                return message.channel.send('❌ | Nenhuma música encontrada no cache!');
            }

            await message.channel.send(`📚 **Biblioteca de Músicas** - **${files.length}** músicas encontradas`);

            // Dividir em grupos de 5
            const chunkSize = 5;
            const chunks = [];
            
            for (let i = 0; i < files.length; i += chunkSize) {
                chunks.push(files.slice(i, i + chunkSize));
            }

            // Enviar cada bloco com delay
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embed = {
                    color: 0x0099ff,
                    title: `📦 Bloco ${i + 1}/${chunks.length}`,
                    description: chunk.map((file, index) => {
                        const fileNumber = (i * chunkSize) + index + 1;
                        const fileName = path.basename(file, '.mp3');
                        
                        // Limitar nome muito longo
                        const displayName = fileName.length > 50 
                            ? fileName.substring(0, 47) + '...' 
                            : fileName;
                            
                        return `**${fileNumber}.** ${displayName}`;
                    }).join('\n'),
                    footer: {
                        text: `Total: ${files.length} músicas • Use ($/#)play <nome> para tocar`
                    },
                    timestamp: new Date()
                };

                await message.channel.send({ embeds: [embed] });
                
                // Delay entre mensagens para não sobrecarregar
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

        } catch (error) {
            console.error('❌ Erro no comando lib:', error);
            message.channel.send('❌ | Erro ao listar músicas: ' + error.message);
        }
    }
};
