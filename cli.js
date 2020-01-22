#!/usr/bin/env node

'use strict';
const meow = require('meow');
const ora = require('ora');
const appleScriptPromise = require('applescript-promise');
const chalk = require('chalk');
const SSHConfig = require('ssh-config');
const fs = require('fs');
const path = require('path');
const slugify = require('@sindresorhus/slugify');

const cli = meow(`
	Usage
	  $ t2sc
`);

(async () => {

	const spinner = ora('Fetching Transmit favorites...').start();

	let favoritesRaw;
	try {
		favoritesRaw = await appleScriptPromise.default.execFile('favorites.applescript');
	} catch (error) {
		spinner.stop();
		console.error(chalk.red(`\n${error}\n`));
		process.exit(1);
	}

	spinner.stop();

	const favorites = favoritesRaw
		.map(f => {
			return {
				name: `${slugify(f[0])}-[${f[6]}]`,
				address: f[1],
				username: f[2],
				port: f[3],
				protocol: f[4],
				remote_path: f[5] === 'missing value' ? null : f[5],
				id: f[6]
			}
		})
		.filter(f => f.protocol === 'SFTP')

	// SFTP Favorites ?
	if (!favorites.length) {
		console.error(chalk.red(`\nCould not find any Transmit SFTP favorites\n`));
		process.exit(1);
	}

	const sshConfigFile = path.join(process.env['HOME'], '.ssh', 'config');

	// Check SSH config file
	let SSHConfigContents = '';
	try {
		await fs.promises.access(sshConfigFile);
		SSHConfigContents = await fs.promises.readFile(sshConfigFile, 'utf8');
	} catch (error) {}

	let config = SSHConfig.parse(SSHConfigContents);

	// Remove every Transmit favorites from existing ssh config
	config = config.filter((line) => {
		if (line.param !== 'Host') {
			return true;
		}
		return !/-\[[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}\]$/.test(line.value);
	});

	// Merge SSH config objects & Transmit favorites
	favorites.forEach(f => {
		const favorite = {
			Host: f.name,
			HostName: f.address,
			User: f.username
		};
		if (f.port) {
			favorite.Port = f.port;
		}
		config.append(favorite);
		console.log(`${chalk.green('✓')} Adding ${favorite.Host} - ${favorite.HostName}`);
	});

	await fs.promises.writeFile(sshConfigFile, SSHConfig.stringify(config));

	console.log(chalk.green.bold(`\n✓ ${favorites.length} Transmit favorites have been successfully added to your ~/.ssh/config file.\n`));

})();
