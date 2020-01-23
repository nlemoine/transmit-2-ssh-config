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
const deepEqual = require('deep-equal')

const cli = meow(`
	Usage
	  $ t2sc
`);

/**
 * Get favorite ID
 * @param {Object} favorite
 */
const getFavoriteId = favorite => {
	if (favorite.param !== 'Host') {
		return false;
	}
	if (!favorite.hasOwnProperty('config') && favorite.config.length === 0) {
		return false;
	}

	const transmitIdPattern = /^#[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;
	let id = false;
	favorite.config.forEach(line => {
		if (line.type !== SSHConfig.COMMENT) {
			return;
		}

		if (!transmitIdPattern.test(line.content)) {
			return;
		}
		id = line.content;
	});
	return id;
}

/**
 * Get Host
 * @param {Object} favorite
 */
const getHost = favorite => {
	if (favorite.param !== 'Host') {
		return false;
	}
	return favorite.value;
}

/**
 * Get favorite param
 * @param {Object} favorite
 * @param {String} param
 */
const getParam = (favorite, param) => {
	if (!favorite.hasOwnProperty('config') && favorite.config.length === 0) {
		return false;
	}
	let value = false;
	favorite.config.forEach(line => {
		if (line.type !== SSHConfig.DIRECTIVE) {
			return;
		}
		if (line.param !== param) {
			return;
		}
		value = line.value;
	});
	return value;
}

/**
 * Get favorite param
 * @param {Object} favorite
 * @param {String} param
 */
const sanitizeFavorite = favorite => {
	const f = JSON.parse(JSON.stringify(favorite));
	delete f.before;
	delete f.after;
	delete f.separator;
	f.config.forEach(line => {
		delete line.before;
		delete line.after;
		delete line.separator;
	});
	return f;
}

/**
 * Get host log
 * @param {Object} favorite
 */
const getHostLog = favorite => {
	return `${getParam(favorite, 'User')}@${getParam(favorite, 'HostName')} [${getHost(favorite)}]`;
}

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
				name: `${slugify(f[0])}`,
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

	// Get favorites from Transmit
	const favoritesFromTransmit = favorites.map((f, i) => {
		let favorite = `Host ${f.name}
  #${f.id}
  HostName ${f.address}
  User ${f.username}
`;
		if (f.port) {
			favorite += `  Port ${f.port}\n`;
		}
		favorite += '\n';
		const favoriteParsed = SSHConfig.parse(favorite);

		return favoriteParsed[0];
	});

	const counts = {
		'deleted': 0,
		'updated': 0,
		'added': 0,
	};

	// Delete
	config.forEach((fc, i) => {
		const fcId = getFavoriteId(fc);
		if (!fcId) {
			return false;
		}
		const removeFavorite = favoritesFromTransmit.every(ft => {
			const ftId = getFavoriteId(ft);
			if (fcId !== ftId) {
				return true;
			}
			return false;
		});

		if (removeFavorite) {
			counts['deleted'] += 1;
			console.log(`${chalk.red('✓')} Removing ${getHostLog(fc)}`);
			config.splice(i, 1);
		}
	});

	// Update
	favoritesFromTransmit.forEach((ft, i) => {
		const ftId = getFavoriteId(ft);
		const updateFavorite = config.some(fc => {
			const fcId = getFavoriteId(fc);
			if (!fcId) {
				return false;
			}
			if (fcId === ftId && !deepEqual(sanitizeFavorite(ft), sanitizeFavorite(fc))) {
				return true;
			}
		});

		if (updateFavorite) {
			console.log(`${chalk.blue('✓')} Updating ${getHostLog(ft)}`);
			counts['updated'] += 1;
			config.forEach((fc, k) => {
				const fcId = getFavoriteId(fc);
				if (ftId === fcId) {
					config[k] = ft;
				}
			});
		}
	});

	// Add
	favoritesFromTransmit.forEach((ft, i) => {
		const ftId = getFavoriteId(ft);
		const addFavorite = config.every(fc => {
			const fcId = getFavoriteId(fc);
			if (!fcId) {
				return true;
			}
			return fcId !== ftId;
		});

		if (addFavorite) {
			counts['added'] += 1;
			console.log(`${chalk.green('✓')} Adding ${getHostLog(ft)}`);
			config.push(ft);
		}

	});

	await fs.promises.writeFile(sshConfigFile, SSHConfig.stringify(config));

	// Summary
	Object.keys(counts)
		.forEach(key => {
			if (counts[key] === 0) {
				return;
			}
			console.log(chalk.green.bold(`\n✓ ${counts[key]} Transmit favorites have been successfully ${key} in your SSH config file.`));
		});

	// Nothing happened
	const nothing = Object.keys(counts).every(key => counts[key] === 0);
	if (nothing) {
		console.log(chalk.blue.bold(`\n✓ No Transmit favorites to add, update or delete.\n`));
	}

	// Quit Transmit
	try {
		await appleScriptPromise.default.execString(`tell application "Transmit"
	quit
end tell`);
	} catch (error) {
		console.error(chalk.red(`\n${error}\n`));
		process.exit(1);
	}

	process.exit(1);

})();
