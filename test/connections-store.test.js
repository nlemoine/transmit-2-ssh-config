import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
	getFavoriteFolders,
	parseFavoriteFolders,
} from '../src/connections-store.js';

const fixturePath = join(
	import.meta.dirname,
	'fixtures',
	'Connections.transmitstore',
);

describe('parseFavoriteFolders', () => {
	it('should map favorites to their folder by identifier', async () => {
		const folders = parseFavoriteFolders(await readFile(fixturePath));

		assert.deepEqual(folders.get('11111111-1111-4111-8111-111111111111'), [
			'Acme',
		]);
		// Same favorite name in another folder
		assert.deepEqual(folders.get('33333333-3333-4333-8333-333333333333'), [
			'Other',
		]);
	});

	it('should return nested folders outermost first', async () => {
		const folders = parseFavoriteFolders(await readFile(fixturePath));

		assert.deepEqual(folders.get('22222222-2222-4222-8222-222222222222'), [
			'Acme',
			'Client Sites',
		]);
	});

	it('should not treat the root group as a folder', async () => {
		const folders = parseFavoriteFolders(await readFile(fixturePath));

		assert.deepEqual(folders.get('44444444-4444-4444-8444-444444444444'), []);
	});

	it('should return no folder for favorites without parent', async () => {
		const folders = parseFavoriteFolders(await readFile(fixturePath));

		assert.deepEqual(folders.get('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'), []);
	});

	it('should throw on invalid content', () => {
		assert.throws(() => parseFavoriteFolders(Buffer.from('not a plist')));
	});
});

describe('getFavoriteFolders', () => {
	it('should read folders from the given store', async () => {
		const folders = await getFavoriteFolders(fixturePath);

		assert.equal(folders.size, 5);
	});

	it('should return null when the store does not exist', async () => {
		const folders = await getFavoriteFolders(
			join(import.meta.dirname, 'fixtures', 'missing.transmitstore'),
		);

		assert.equal(folders, null);
	});
});
