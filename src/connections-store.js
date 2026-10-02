import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseBuffer, UID } from 'bplist-parser';

/**
 * Transmit 5 favorites store (NSKeyedArchiver binary plist)
 */
export const connectionsStorePath = join(
	homedir(),
	'Library',
	'Application Support',
	'Transmit',
	'Connections.transmitstore',
);

/**
 * Parse favorite folders from a Transmit connections store
 *
 * Favorites are `TRConnectionItem` objects and folders are
 * `TRConnectionGroup` objects, both pointing to their parent folder.
 * The top-level group (no parent) is Transmit's root and is not a folder.
 *
 * @param {Buffer} buffer - Content of Connections.transmitstore
 * @returns {Map<string, string[]>} Favorite identifier => folder names, outermost first
 */
export function parseFavoriteFolders(buffer) {
	const [archive] = parseBuffer(buffer);
	const objects = archive?.$objects;
	if (!Array.isArray(objects)) {
		throw new Error('Not a keyed archive');
	}

	const resolve = (value) => {
		const object = value instanceof UID ? objects[value.UID] : value;
		return object === '$null' ? undefined : object;
	};
	const className = (object) => resolve(object?.$class)?.$classname;
	const string = (value) => {
		const object = resolve(value);
		return typeof object === 'string' ? object : object?.['NS.string'];
	};

	const folders = new Map();
	for (const object of objects) {
		if (className(object) !== 'TRConnectionItem') {
			continue;
		}

		const path = [];
		const seen = new Set();
		let group = resolve(object.parent);
		while (className(group) === 'TRConnectionGroup' && !seen.has(group)) {
			seen.add(group);
			const parent = resolve(group.parent);
			// Skip the root group
			if (className(parent) === 'TRConnectionGroup') {
				path.unshift(string(group.name));
			}
			group = parent;
		}

		const identifier = string(object.identifier);
		if (identifier) {
			folders.set(identifier.toUpperCase(), path.filter(Boolean));
		}
	}

	return folders;
}

/**
 * Get favorite folders from Transmit's connections store
 *
 * @param {string} [path]
 * @returns {Promise<Map<string, string[]> | null>} null if the store can't be read
 */
export async function getFavoriteFolders(path = connectionsStorePath) {
	try {
		return parseFavoriteFolders(await readFile(path));
	} catch (_error) {
		return null;
	}
}
