import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LineType } from 'ssh-config';
import {
	favoriteToSshConfig,
	normalizeFavorite,
	getFavoriteId,
	getFavoriteDetails,
	formatFavorite,
} from '../src/favorite.js';

describe('favoriteToSshConfig', () => {
	it('should convert favorite to SSH config format', () => {
		const favorite = {
			Id: '550e8400-e29b-41d4-a716-446655440000',
			Host: 'my-server',
			HostName: 'example.com',
			User: 'john',
			Port: 22,
		};

		const result = favoriteToSshConfig(favorite);

		assert.equal(result.value, 'my-server');
		assert.ok(result.config);
		assert.ok(Array.isArray(result.config));

		const hostname = result.config.find((c) => c.param === 'HostName');
		assert.equal(hostname.value, 'example.com');

		const user = result.config.find((c) => c.param === 'User');
		assert.equal(user.value, 'john');

		const port = result.config.find((c) => c.param === 'Port');
		assert.equal(port.value, '22');
	});

	it('should include comment with ID', () => {
		const favorite = {
			Id: '550e8400-e29b-41d4-a716-446655440000',
			Host: 'test',
			HostName: 'test.com',
			User: 'user',
			Port: 22,
		};

		const result = favoriteToSshConfig(favorite);
		const comment = result.config.find((c) => c.type === LineType.COMMENT);

		assert.ok(comment);
		assert.equal(comment.content, '#550e8400-e29b-41d4-a716-446655440000');
	});

	it('should handle custom port', () => {
		const favorite = {
			Id: '550e8400-e29b-41d4-a716-446655440000',
			Host: 'custom-port',
			HostName: 'example.com',
			User: 'admin',
			Port: 2222,
		};

		const result = favoriteToSshConfig(favorite);
		const port = result.config.find((c) => c.param === 'Port');

		assert.equal(port.value, '2222');
	});
});

describe('normalizeFavorite', () => {
	it('should remove before, after, and separator fields', () => {
		const config = {
			param: 'Host',
			value: 'test',
			before: 'some value',
			after: 'some value',
			separator: '=',
			config: [],
		};

		const result = normalizeFavorite(config);

		assert.equal(result.before, undefined);
		assert.equal(result.after, undefined);
		assert.equal(result.separator, undefined);
		assert.equal(result.param, 'Host');
		assert.equal(result.value, 'test');
	});

	it('should normalize nested config arrays recursively', () => {
		const config = {
			param: 'Host',
			value: 'test',
			config: [
				{
					param: 'HostName',
					value: 'example.com',
					before: 'nested before',
					after: 'nested after',
				},
			],
		};

		const result = normalizeFavorite(config);

		assert.ok(result.config);
		assert.equal(result.config[0].before, undefined);
		assert.equal(result.config[0].after, undefined);
		assert.equal(result.config[0].param, 'HostName');
	});
});

describe('getFavoriteId', () => {
	it('should extract valid UUID from comment', () => {
		const sshConfig = {
			config: [
				{ type: LineType.COMMENT, content: '#550e8400-e29b-41d4-a716-446655440000' },
				{ param: 'HostName', value: 'example.com' },
			],
		};

		const result = getFavoriteId(sshConfig);

		assert.equal(result, '550e8400-e29b-41d4-a716-446655440000');
	});

	it('should return undefined for invalid UUID', () => {
		const sshConfig = {
			config: [
				{ type: LineType.COMMENT, content: '#not-a-uuid' },
				{ param: 'HostName', value: 'example.com' },
			],
		};

		const result = getFavoriteId(sshConfig);

		assert.equal(result, undefined);
	});

	it('should return undefined when no comment present', () => {
		const sshConfig = {
			config: [{ param: 'HostName', value: 'example.com' }],
		};

		const result = getFavoriteId(sshConfig);

		assert.equal(result, undefined);
	});

	it('should return last valid UUID when multiple comments exist', () => {
		const sshConfig = {
			config: [
				{ type: LineType.COMMENT, content: '#invalid' },
				{ type: LineType.COMMENT, content: '#550e8400-e29b-41d4-a716-446655440000' },
				{ type: LineType.COMMENT, content: '#650e8400-e29b-41d4-a716-446655440000' },
			],
		};

		const result = getFavoriteId(sshConfig);

		assert.equal(result, '650e8400-e29b-41d4-a716-446655440000');
	});
});

describe('getFavoriteDetails', () => {
	it('should extract details from SSH config', () => {
		const sshConfig = {
			value: 'my-server',
			config: [
				{ param: 'User', value: 'john' },
				{ param: 'HostName', value: 'example.com' },
				{ param: 'Port', value: '2222' },
			],
		};

		const result = getFavoriteDetails(sshConfig);

		assert.equal(result.alias, 'my-server');
		assert.equal(result.user, 'john');
		assert.equal(result.host, 'example.com');
		assert.equal(result.port, '2222');
	});

	it('should use defaults for missing values', () => {
		const sshConfig = {
			config: [],
		};

		const result = getFavoriteDetails(sshConfig);

		assert.equal(result.alias, 'unknown');
		assert.equal(result.user, 'unknown');
		assert.equal(result.host, 'unknown');
		assert.equal(result.port, undefined);
	});

	it('should handle missing port', () => {
		const sshConfig = {
			value: 'test',
			config: [
				{ param: 'User', value: 'admin' },
				{ param: 'HostName', value: 'test.com' },
			],
		};

		const result = getFavoriteDetails(sshConfig);

		assert.equal(result.port, undefined);
	});
});

describe('formatFavorite', () => {
	it('should format favorite with port', () => {
		const sshConfig = {
			value: 'my-server',
			config: [
				{ param: 'User', value: 'john' },
				{ param: 'HostName', value: 'example.com' },
				{ param: 'Port', value: '2222' },
			],
		};

		const result = formatFavorite(sshConfig);

		assert.equal(result, 'my-server (john@example.com:2222)');
	});

	it('should format favorite without port', () => {
		const sshConfig = {
			value: 'my-server',
			config: [
				{ param: 'User', value: 'john' },
				{ param: 'HostName', value: 'example.com' },
			],
		};

		const result = formatFavorite(sshConfig);

		assert.equal(result, 'my-server (john@example.com)');
	});

	it('should handle unknown values', () => {
		const sshConfig = {
			config: [],
		};

		const result = formatFavorite(sshConfig);

		assert.equal(result, 'unknown (unknown@unknown)');
	});
});
