const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.commands = new Collection();
client.aliases = new Collection();

// Registrar comandos
const registerCommands = require('./registers/commands-register');
registerCommands(client);

// Player global
client.audioPlayers = new Map();

client.once(Events.ClientReady, (c) => {
    console.log(`✅ Ready! Logged in as ${c.user.tag}`);
});

client.on('messageCreate', async (message) => {
    const prefix = '$';

    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const commandTyped = args.shift().toLowerCase();

    const cmd = client.commands.get(commandTyped) || 
                client.commands.get(client.aliases.get(commandTyped));

    if (!cmd) return;

    if (cmd.inVoiceChannel && !message.member.voice.channel) {
        return message.channel.send('❌ | You must be in a voice channel!');
    }

    try {
        console.log(`🔧 Executando comando: ${commandTyped} com args:`, args);
        await cmd.execute(message, client, args);
    } catch (e) {
        console.error('❌ Erro no comando:', e);
        message.channel.send(`❌ | Error: \`${e.message}\``);
    }
});

client.login(token);
