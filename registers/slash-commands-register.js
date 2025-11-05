module.exports = (client) => {
	// Dependences for get all commands in commands and slash-commands folders

	const fs = require('node:fs');
	const path = require('node:path');

	const slashCommandsPath = path.join(__dirname, '../slash-commands');
	const slashCommandFiles = fs
		.readdirSync(slashCommandsPath)
		.filter((file) => file.endsWith('.js'));

	for (const file of slashCommandFiles) {
		const filePath = path.join(slashCommandsPath, file);
		const command = require(filePath);

		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.slashCommands.set(command.data.name, command);
		} else {
			console.log(
				`[WARNING] The command at ${filePath} is missing a required "name" or "execute" property.`
			);
		}
	}
};
