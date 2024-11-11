#!/usr/bin/env node

import { intro, outro, spinner, log, note } from '@clack/prompts';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import SSHConfig, { parse } from 'ssh-config';
import deepEqual from 'deep-equal';
import { ZodError } from 'zod';

import getTransmitFavorites from './src/transmit.js';
import { getFavoriteId, normalizeFavorite, favoriteToSshConfig, formatFavorite } from './src/favorite.js';
import { addIncludeDirective, ensureDirectoryExists } from './src/sshconfig.js';

// Welcome message
intro('Transmit → SSH Config Sync');

// Ensure SSH directories exist with proper permissions
const sshDir = join(homedir(), '.ssh');
const sshConfigDDir = join(sshDir, 'config.d');

try {
	const sshDirResult = await ensureDirectoryExists(sshDir, 0o700);
	const configDirResult = await ensureDirectoryExists(sshConfigDDir, 0o700);

	// Show details with appropriate log methods
	if (sshDirResult.created) {
		log.success(`Created ${sshDirResult.path}`);
	}

	if (configDirResult.created) {
		log.success(`Created ${configDirResult.path}`);
	}
} catch (error) {
	log.error(`Failed to setup SSH directories: ${error.message}`);
	outro('Setup failed');
	process.exit(1);
}

const transmitSshConfigPath = join(homedir(), '.ssh', 'config.d', 'transmit');

let transmitSshConfig = new SSHConfig.default();

// Read existing config or create if doesn't exist
try {
	transmitSshConfig = parse(
		await readFile(transmitSshConfigPath, 'utf8'),
	);
} catch (error) {
	if (error.code === 'ENOENT') {
		// File doesn't exist, create it
		try {
			await writeFile(transmitSshConfigPath, '', 'utf8');
			await chmod(transmitSshConfigPath, 0o600);
		} catch (createError) {
			log.error(`Failed to create SSH config file: ${createError.message}`);
			outro('Setup failed');
			process.exit(1);
		}
	} else {
		// File exists but not readable
		log.error(`Error reading SSH config file: ${error.message}`);
		outro('Read failed');
		process.exit(1);
	}
}

// Fetch Transmit favorites
const fetchSpinner = spinner();
fetchSpinner.start('Fetching Transmit favorites');

let transmitFavorites = [];
try {
	transmitFavorites = await getTransmitFavorites();
	fetchSpinner.stop(`Found ${transmitFavorites.length} favorite${transmitFavorites.length !== 1 ? 's' : ''}`);
} catch (error) {
	fetchSpinner.stop('Failed to fetch Transmit favorites', 1);
	if (error instanceof ZodError) {
		log.error('Invalid favorite data found:');
		for (const issue of error.issues) {
			log.error(`  ${issue.path.join('.')}: ${issue.message}`);
		}
	} else {
		log.error(`Error: ${error.message}`);
	}
	outro('Fetch failed');
	process.exit(1);
}

// Convert transmit favorites to ssh config
const favoritesSshConfig = new SSHConfig.default();
favoritesSshConfig.push(...transmitFavorites.map(favoriteToSshConfig));

// Write ssh config file
try {
	await writeFile(transmitSshConfigPath, favoritesSshConfig.toString(), 'utf8');
	// Set proper permissions on the transmit config file
	await chmod(transmitSshConfigPath, 0o600);
	log.success(`Saved to ${transmitSshConfigPath}`);
} catch (error) {
	log.error(`Error: ${error.message}`);
	outro('Write failed');
	process.exit(1);
}

// Get Ids from transmit and ssh config
const favoritesIds = favoritesSshConfig.map(getFavoriteId);
const transmitSshConfigIds = transmitSshConfig.map(getFavoriteId);

const report = {
	added: favoritesSshConfig.filter(
		(c) => !transmitSshConfigIds.includes(getFavoriteId(c)),
	),
	deleted: transmitSshConfig.filter(
		(c) => !favoritesIds.includes(getFavoriteId(c)),
	),
	updated: favoritesSshConfig.filter((c) => {
		const id = getFavoriteId(c);
		if (!transmitSshConfigIds.includes(id)) {
			return false;
		}

		return !deepEqual(
			normalizeFavorite(c),
			normalizeFavorite(
				transmitSshConfig[transmitSshConfigIds.indexOf(id)] || {},
			),
		);
	}),
};

// Display sync summary
const summaryLines = [];

if (report.added.length > 0) {
	summaryLines.push(`Added (${report.added.length}):`);
	report.added.forEach((fav) => {
		summaryLines.push(`  + ${formatFavorite(fav)}`);
	});
}

if (report.deleted.length > 0) {
	if (summaryLines.length > 0) summaryLines.push('');
	summaryLines.push(`Deleted (${report.deleted.length}):`);
	report.deleted.forEach((fav) => {
		summaryLines.push(`  - ${formatFavorite(fav)}`);
	});
}

if (report.updated.length > 0) {
	if (summaryLines.length > 0) summaryLines.push('');
	summaryLines.push(`Updated (${report.updated.length}):`);
	report.updated.forEach((fav) => {
		summaryLines.push(`  ~ ${formatFavorite(fav)}`);
	});
}

if (summaryLines.length === 0) {
	summaryLines.push('No changes detected');
}

note(summaryLines.join('\n'), 'Sync Summary');

// Add Include directive to main SSH config
const mainSshConfigFile = join(homedir(), '.ssh', 'config');
try {
	const includeResult = await addIncludeDirective(mainSshConfigFile);

	// Show details with appropriate log methods
	if (includeResult.fileCreated) {
		log.success(`Created ${includeResult.path}`);
	}
	if (includeResult.added) {
		log.success('Added "Include config.d/*" directive');
	}
} catch (error) {
	log.error(`Error: ${error.message}`);
	outro('Update failed');
	process.exit(1);
}

outro('Sync completed successfully!');

process.exit(0);
