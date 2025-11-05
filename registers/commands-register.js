module.exports = (client) => {
	// Dependences for get all commands in commands and slash-commands folders
	const fs = require('node:fs');
	const path = require('node:path');

	const commandsPath = path.join(__dirname, '../commands');
	const commandFiles = fs
		.readdirSync(commandsPath)
		.filter((file) => file.endsWith('.js'));

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);

		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('name' in command && 'execute' in command) {
			client.commands.set(command.name, command);

			if (command.aliases && command.aliases.length) {
				command.aliases.forEach((alias) =>
					client.aliases.set(alias, command.name)
				);
			}
		} else {
			console.log(
				`[WARNING] The command at ${filePath} is missing a required "name" or "execute" property.`
			);
		}
	}
};
