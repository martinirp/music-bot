// commands/reload.js - VERSÃO COMPLETA
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'reload',
    aliases: ['rl'],
    description: 'Recarrega TODOS os comandos e utilitários',
    permission: 'ADMINISTRATOR',
    
    execute: async (message, client, args) => {
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.channel.send('❌ | Permissão negada!');
        }

        try {
            await message.channel.send('🔄 | **Recarregando comandos E utilitários...**');

            // 🔥 RECARREGAR COMANDOS
            const commandsPath = path.join(__dirname);
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

            const newCommands = new Map();
            let commandsLoaded = 0;
            let commandsErrors = 0;

            for (const file of commandFiles) {
                try {
                    const filePath = path.join(commandsPath, file);
                    
                    // Limpar cache do comando
                    delete require.cache[require.resolve(filePath)];
                    
                    const command = require(filePath);
                    
                    if (!command.name || typeof command.execute !== 'function') {
                        throw new Error('Estrutura inválida');
                    }
                    
                    // Registrar comando principal
                    newCommands.set(command.name, command);
                    
                    // Registrar aliases
                    if (Array.isArray(command.aliases)) {
                        for (const alias of command.aliases) {
                            newCommands.set(alias, command);
                        }
                    }
                    
                    console.log(`✅ Comando carregado: ${command.name}`);
                    commandsLoaded++;
                    
                } catch (error) {
                    console.error(`❌ Erro em ${file}:`, error.message);
                    commandsErrors++;
                }
            }

            // Substituir commands antigos
            client.commands = newCommands;

            // 🔥 RECARREGAR UTILS
            const utilsPath = path.join(__dirname, '../utils');
            const utilFiles = fs.readdirSync(utilsPath).filter(file => file.endsWith('.js'));
            
            let utilsLoaded = 0;
            let utilsErrors = 0;
            const reloadedUtils = [];

            for (const file of utilFiles) {
                try {
                    const utilName = file.replace('.js', '');
                    const filePath = path.join(utilsPath, file);
                    
                    // Limpar cache do utilitário
                    delete require.cache[require.resolve(filePath)];
                    
                    // Recarregar o utilitário
                    require(filePath);
                    
                    console.log(`✅ Utilitário recarregado: ${utilName}`);
                    utilsLoaded++;
                    reloadedUtils.push(utilName);
                    
                } catch (error) {
                    console.error(`❌ Erro em utils/${file}:`, error.message);
                    utilsErrors++;
                }
            }

            // 🔥 RELATÓRIO FINAL
            let resultMessage = `✅ | **Recarregamento completo!**\n` +
                              `📥 | **${commandsLoaded}** comandos carregados\n` +
                              `🔧 | **${utilsLoaded}** utilitários recarregados\n` +
                              `📊 | **${client.commands.size}** entradas totais`;

            if (commandsErrors > 0 || utilsErrors > 0) {
                resultMessage += `\n❌ | **${commandsErrors + utilsErrors}** erros totais`;
            }

            if (reloadedUtils.length > 0) {
                resultMessage += `\n\n🔧 **Utils recarregados:** ${reloadedUtils.join(', ')}`;
            }

            await message.channel.send(resultMessage);

            // 🔥 LOG DETALHADO
            console.log('🎯 Comandos + aliases carregados:', Array.from(client.commands.keys()));
            console.log('🔧 Utilitários recarregados:', reloadedUtils);

        } catch (error) {
            console.error('❌ Erro fatal no reload:', error);
            message.channel.send('❌ | Erro fatal: ' + error.message);
        }
    }
};

