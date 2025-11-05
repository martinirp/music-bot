const { REST, Routes } = require('discord.js');

const dotenv = require('dotenv');

dotenv.config();

const { DISCORD_TOKEN, CLIENT_ID } = process.env;

const fs = require('node:fs');
const path = require('node:path');
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
	.readdirSync(commandsPath)
	.filter((file) => file.endsWith('.js'));

const commands = [];

for (const file of commandFiles) {
	const command = require(`./slash-commands/${file}`);
	commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

const deployFunction = async () => {
	try {
		console.log(`Resetando ${commands.length} comandos...`);

		const data = await rest.put(Routes.applicationCommands(CLIENT_ID), {
			body: commands,
		});

		console.log('Slash commands registrados com sucesso!');
	} catch (error) {
		console.error(error);
	}
};

deployFunction();
