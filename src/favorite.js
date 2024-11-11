import { z } from 'zod';
import SSHConfig, { parse, LineType } from 'ssh-config';

const IdSchema = z.string().uuid();

const FavoriteSchema = z.object({
	Id: IdSchema,
	Host: z.string(),
	HostName: z.string(),
	User: z.string(),
	Port: z.number(),
	Protocol: z.string(),
	RemotePath: z.string().optional(),
});

/**
 * Convert favorite to SSHConfig object
 *
 * @param {Object} param0
 * @returns {SSHConfig}
 */
export function favoriteToSshConfig({ Id, Host, HostName, User, Port }) {
	let favorite = `Host ${Host}
  #${Id}
  HostName ${HostName}
  User ${User}
`;

	if (Port) {
		favorite += `  Port ${Port}`;
	}

	favorite += `
`;

	return parse(favorite)[0];
}

/**
 * Get favorite param
 *
 * @param {SSHConfig} sshConfig
 * @returns {SSHConfig}
 */
export function normalizeFavorite(sshConfig) {
	const sshConfigClone = JSON.parse(JSON.stringify(sshConfig));

	sshConfigClone.before = undefined;
	sshConfigClone.after = undefined;
	sshConfigClone.separator = undefined;
	const { config } = sshConfigClone;
	if (config) {
		sshConfigClone.config = config.map(normalizeFavorite);
	}

	return sshConfigClone;
}

/**
 * Get favorite ID from SSHConfig object
 *
 * @param {Object} param0 - SSHConfig object
 * @param {Array} param0.config - SSH config entries
 * @returns {string|undefined} UUID string if found, undefined otherwise
 */
export function getFavoriteId({ config = [] }) {
	return config
		.filter(({ type }) => type === LineType.COMMENT)
		.reduce((acc, { content }) => {
			try {
				const Id = content.substring(1);
				IdSchema.parse(Id);
				return Id;
			} catch (_error) {
				return acc;
			}
		}, undefined);
}

/**
 * Extract favorite details for display
 *
 * @param {SSHConfig} sshConfig
 * @returns {Object} { alias, user, host, port }
 */
export function getFavoriteDetails(sshConfig) {
	const config = sshConfig.config || [];

	const alias = sshConfig.value || 'unknown';
	const user = config.find((c) => c.param === 'User')?.value || 'unknown';
	const host = config.find((c) => c.param === 'HostName')?.value || 'unknown';
	const port = config.find((c) => c.param === 'Port')?.value;

	return { alias, user, host, port };
}

/**
 * Format favorite details as a string
 *
 * @param {SSHConfig} sshConfig
 * @returns {string} formatted as "alias (user@host:port)" or "alias (user@host)"
 */
export function formatFavorite(sshConfig) {
	const { alias, user, host, port } = getFavoriteDetails(sshConfig);
	const hostPart = port ? `${host}:${port}` : host;
	return `${alias} (${user}@${hostPart})`;
}

export default FavoriteSchema;
