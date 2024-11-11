import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	ensureDirectoryExists,
	ensureSshConfigExists,
	getOrCreateSshConfig,
	addIncludeDirective,
} from '../src/sshconfig.js';

describe('ensureDirectoryExists', () => {
	let testDir;

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), 'sshconfig-test-'));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it('should create directory if it does not exist', async () => {
		const newDir = join(testDir, 'new-directory');

		const result = await ensureDirectoryExists(newDir, 0o700);

		assert.equal(result.created, true);
		assert.equal(result.path, newDir);

		const stats = await stat(newDir);
		assert.ok(stats.isDirectory());
	});

	it('should return created: false if directory already exists', async () => {
		const existingDir = join(testDir, 'existing');
		await ensureDirectoryExists(existingDir, 0o700);

		const result = await ensureDirectoryExists(existingDir, 0o700);

		assert.equal(result.created, false);
		assert.equal(result.path, existingDir);
	});

	it('should create nested directories recursively', async () => {
		const nestedDir = join(testDir, 'level1', 'level2', 'level3');

		const result = await ensureDirectoryExists(nestedDir, 0o700);

		assert.equal(result.created, true);

		const stats = await stat(nestedDir);
		assert.ok(stats.isDirectory());
	});
});

describe('ensureSshConfigExists', () => {
	let testDir;

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), 'sshconfig-test-'));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it('should create empty config file if it does not exist', async () => {
		const configPath = join(testDir, 'config');

		const result = await ensureSshConfigExists(configPath);

		assert.equal(result.created, true);
		assert.equal(result.path, configPath);

		const content = await readFile(configPath, 'utf8');
		assert.equal(content, '');
	});

	it('should return created: false if file already exists', async () => {
		const configPath = join(testDir, 'config');
		await ensureSshConfigExists(configPath);

		const result = await ensureSshConfigExists(configPath);

		assert.equal(result.created, false);
		assert.equal(result.path, configPath);
	});
});

describe('getOrCreateSshConfig', () => {
	let testDir;

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), 'sshconfig-test-'));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it('should create and parse empty config', async () => {
		const configPath = join(testDir, 'config');

		const result = await getOrCreateSshConfig(configPath);

		assert.ok(result);
		assert.ok(Array.isArray(result));
		assert.equal(result.length, 0);
	});

	it('should parse existing config', async () => {
		const configPath = join(testDir, 'config');
		const configContent = `Host example
  HostName example.com
  User john
`;
		await ensureSshConfigExists(configPath);
		await writeFile(configPath, configContent, 'utf8');

		const result = await getOrCreateSshConfig(configPath);

		assert.ok(result);
		assert.ok(result.length > 0);

		const host = result.find((entry) => entry.param === 'Host');
		assert.ok(host);
		assert.equal(host.value, 'example');
	});
});

describe('addIncludeDirective', () => {
	let testDir;

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), 'sshconfig-test-'));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it('should add Include directive to new file', async () => {
		const configPath = join(testDir, 'config');

		const result = await addIncludeDirective(configPath);

		assert.equal(result.added, true);
		assert.equal(result.fileCreated, true);
		assert.equal(result.path, configPath);

		const content = await readFile(configPath, 'utf8');
		assert.ok(content.includes('Include config.d/*'));
	});

	it('should add Include directive to existing file', async () => {
		const configPath = join(testDir, 'config');
		const initialContent = `Host example
  HostName example.com
`;
		await ensureSshConfigExists(configPath);
		await writeFile(configPath, initialContent, 'utf8');

		const result = await addIncludeDirective(configPath);

		assert.equal(result.added, true);
		assert.equal(result.fileCreated, false);

		const content = await readFile(configPath, 'utf8');
		assert.ok(content.includes('Include config.d/*'));
	});

	it('should not add duplicate Include directive', async () => {
		const configPath = join(testDir, 'config');

		await addIncludeDirective(configPath);
		const result = await addIncludeDirective(configPath);

		assert.equal(result.added, false);

		const content = await readFile(configPath, 'utf8');
		const matches = content.match(/Include config\.d\/\*/g);
		assert.equal(matches.length, 1);
	});

	it('should prepend Include directive to config', async () => {
		const configPath = join(testDir, 'config');
		const initialContent = `Host example
  HostName example.com
`;
		await ensureSshConfigExists(configPath);
		await writeFile(configPath, initialContent, 'utf8');

		await addIncludeDirective(configPath);

		const content = await readFile(configPath, 'utf8');
		const includeIndex = content.indexOf('Include');
		const hostIndex = content.indexOf('Host example');

		assert.ok(includeIndex < hostIndex, 'Include should come before existing config');
	});
});

// Helper function for tests
async function writeFile(path, content, encoding) {
	const { writeFile: fsWriteFile } = await import('node:fs/promises');
	return fsWriteFile(path, content, encoding);
}
