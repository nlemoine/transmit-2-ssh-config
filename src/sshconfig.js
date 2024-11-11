import { mkdir, chmod, stat, readFile, writeFile } from "node:fs/promises";
import { parse } from "ssh-config";

/**
 * Ensure a directory exists with proper permissions
 * @param {string} dirPath - Directory path to create
 * @param {number} mode - Permissions mode (e.g., 0o700)
 * @returns {Promise<{created: boolean, path: string}>}
 */
export async function ensureDirectoryExists(dirPath, mode = 0o700) {
	try {
		const stats = await stat(dirPath);
		if (!stats.isDirectory()) {
			throw new Error(`${dirPath} exists but is not a directory`);
		}
		// Only chmod if permissions differ
		if ((stats.mode & 0o777) !== mode) {
			await chmod(dirPath, mode);
		}
		return { created: false, path: dirPath };
	} catch (error) {
		if (error.code === "ENOENT") {
			// Directory doesn't exist, create it
			await mkdir(dirPath, { recursive: true, mode });
			return { created: true, path: dirPath };
		}
		throw error;
	}
}

/**
 * Ensure SSH config file exists with proper permissions
 * @param {string} configPath - Path to SSH config file
 * @returns {Promise<{created: boolean, path: string}>}
 */
export async function ensureSshConfigExists(configPath) {
	try {
		const stats = await stat(configPath);
		if (!stats.isFile()) {
			throw new Error(`${configPath} exists but is not a file`);
		}
		// Only chmod if permissions differ
		if ((stats.mode & 0o777) !== 0o600) {
			await chmod(configPath, 0o600);
		}
		return { created: false, path: configPath };
	} catch (error) {
		if (error.code === "ENOENT") {
			// File doesn't exist, create empty config
			await writeFile(configPath, "", "utf8");
			await chmod(configPath, 0o600);
			return { created: true, path: configPath };
		}
		throw error;
	}
}

/**
 * Get SSH config or create if it doesn't exist
 *
 * @param {string} sshConfigFile - Path to SSH config file
 * @returns {Promise<SSHConfig>} Parsed SSH config object
 */
export async function getOrCreateSshConfig(sshConfigFile) {
	await ensureSshConfigExists(sshConfigFile);
	const content = await readFile(sshConfigFile, "utf8");
	return parse(content || "");
}

/**
 * Add Include directive to SSH config file
 * Creates the config file if it doesn't exist, and adds "Include config.d/*" directive if not already present
 *
 * @param {string} sshConfigFile - Path to SSH config file
 * @returns {Promise<{added: boolean, fileCreated: boolean, path: string}>} Result object with operation details
 */
export async function addIncludeDirective(sshConfigFile) {
	// Ensure the config file exists
	const fileInfo = await ensureSshConfigExists(sshConfigFile);

	const sshConfig = parse(await readFile(sshConfigFile, "utf8"));

	const hasIncludeDirective = sshConfig.find(
		(entry) =>
			"param" in entry &&
			"value" in entry &&
			entry.param === "Include" &&
			entry.value === "config.d/*",
	);

	if (hasIncludeDirective) {
		// Already exists, no need to add
		return {
			added: false,
			fileCreated: fileInfo.created,
			path: sshConfigFile,
		};
	}

	sshConfig.prepend({
		Include: "config.d/*",
	});

	await writeFile(sshConfigFile, sshConfig.toString(), "utf8");
	await chmod(sshConfigFile, 0o600);

	return {
		added: true,
		fileCreated: fileInfo.created,
		path: sshConfigFile,
	};
}
