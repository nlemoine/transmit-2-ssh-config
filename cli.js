#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import meow from 'meow';
import ora from 'ora';
import consola from 'consola';
import chalk from 'chalk';
import SSHConfig from 'ssh-config';
import slugify from '@sindresorhus/slugify';
import deepEqual from 'deep-equal';
import { runAppleScript } from 'run-applescript';
import { execString } from 'applescript';

const cli = meow(
  `
	Usage
	  $ t2sc
`,
  {
    importMeta: import.meta,
  }
);

const transmitFavoritesScript = `
tell application "Transmit"
	set favoriteItems to {}
	set listSize to count of favorites
	repeat with counter from 1 to listSize
		set fav to {}
		set end of fav to name of item counter of favorites
		set end of fav to address of item counter of favorites
		set end of fav to user name of item counter of favorites
		set end of fav to port of item counter of favorites
		set end of fav to protocol of item counter of favorites as string
		set end of fav to remote path of item counter of favorites
		set end of fav to identifier of item counter of favorites
		set end of favoriteItems to fav
	end repeat
	favoriteItems
end tell`;

const transmitFavoritesFoldersScript = `
tell application "System Events"
	set menuItems to every menu item of menu 1 of menu bar item 8 of menu bar 1 of process "Transmit"
	set favoritesFolders to {}
	set separators to {}
	repeat with menuItem in menuItems
		set favFolder to {}
		set menuTilte to title of menuItem
		if menuTilte = "" then
			set end of separators to menuTilte
		end if
		-- Only get favorites, after the second separator
		if count of separators > 2 then exit repeat

		-- Get sub menus
		set subMenuItemsCount to count of menu items of menu of menuItem
		if subMenuItemsCount >= 1 then
			set subMenuItems to every menu item of menu 1 of menuItem
			set end of favFolder to menuTilte
			set menuChildren to {}
			repeat with subMenuItem in subMenuItems
				set subMenuTilte to title of subMenuItem
				-- Exit repeat before "Open in tabs"
				if subMenuTilte is equal to "" then exit repeat
				set end of menuChildren to subMenuTilte
			end repeat
			set end of favFolder to menuChildren
			set end of favoritesFolders to favFolder
		end if
	end repeat
	favoritesFolders
end tell`;

const execStringPromise = util.promisify(execString);

// Get SSH config path
const sshConfigFile = path.join(process.env['HOME'], '.ssh', 'config');

/**
 * Get favorite ID
 * @param {Object} favorite
 */
const getFavoriteId = (favorite) => {
  if (favorite.param !== 'Host') {
    return false;
  }
  if (!favorite.hasOwnProperty('config') && favorite.config.length === 0) {
    return false;
  }

  const transmitIdPattern =
    /^#[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;
  let id = false;
  favorite.config.forEach((line) => {
    if (line.type !== SSHConfig.COMMENT) {
      return;
    }

    if (!transmitIdPattern.test(line.content)) {
      return;
    }
    id = line.content;
  });
  return id;
};

/**
 * Get Host
 * @param {Object} favorite
 */
const getHost = (favorite) => {
  if (favorite.param !== 'Host') {
    return false;
  }
  return favorite.value;
};

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
  favorite.config.forEach((line) => {
    if (line.type !== SSHConfig.DIRECTIVE) {
      return;
    }
    if (line.param !== param) {
      return;
    }
    value = line.value;
  });
  return value;
};

/**
 * Get favorite param
 * @param {Object} favorite
 * @param {String} param
 */
const sanitizeFavorite = (favorite) => {
  const f = JSON.parse(JSON.stringify(favorite));
  delete f.before;
  delete f.after;
  delete f.separator;
  f.config.forEach((line) => {
    delete line.before;
    delete line.after;
    delete line.separator;
  });
  return f;
};

/**
 * Get the SSH config items
 *
 * @returns {Array}
 */
const getSSHConfig = async (configFile) => {
  // Check if SSH config is readable/writable
  try {
    await fs.promises.access(configFile, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    console.error(chalk.red(`Could not read/write ${configFile}`));
    process.exit(1);
  }

  try {
    const SSHConfigContents = await fs.promises.readFile(configFile, 'utf8');
    return SSHConfig.parse(SSHConfigContents);
  } catch (error) {
    console.error(chalk.red(`${error.message}`));
    process.exit(1);
  }
};

/**
 * Get host log
 * @param {Object} favorite
 */
const getHostLog = (favorite) => {
  return `${getParam(favorite, 'User')}@${getParam(
    favorite,
    'HostName'
  )} [${getHost(favorite)}]`;
};

/**
 * Get favorite folder name
 * @param {String} favorite
 * @param {Array} folder
 */
const getFavoriteFolderName = (favoriteName, folders) => {
  for(let i = 0; i < folders.length; i++) {
    /**
     * Folder name
     * @type {String}
     */
    const folderName = folders[i][0];
    /**
     * Folder favorites
     * @type {Array}
     */
    const folderFavorites = folders[i][1];
    if(folderFavorites.includes(favoriteName)) {
      return folderName;
    }
  }
  return null;
}

/**
 * Get Transmit favorites
 *
 * @returns {Array}
 */
const getTransmitFavorites = async () => {
  const favoritesRaw = await execStringPromise(transmitFavoritesScript);
  if (!favoritesRaw) {
    return [];
  }

  const folders = await execStringPromise(transmitFavoritesFoldersScript);

  const favorites = favoritesRaw
    .map((f) => {
      const folderName = Array.isArray(folders) ? getFavoriteFolderName(f[0], folders) : null;
      const name = folderName ? `${folderName}/${f[0]}` : f[0];
      return {
        name: `${name
          .split('/')
          .map((p) => slugify(p))
          .join('/')}`,
        address: f[1],
        username: f[2],
        port: f[3],
        protocol: f[4],
        remote_path: f[5] === 'missing value' ? null : f[5],
        id: f[6],
      };
    })
    .filter((f) => f.protocol === 'SFTP');

  return favorites;
};

(async () => {
  const spinner = ora('Fetching Transmit favorites...').start();

  const appStatus = await execStringPromise(
    'application "Transmit" is running'
  );

  let favorites = [];
  try {
    favorites = await getTransmitFavorites();
  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`\n${error}\n`));
    process.exit(1);
  }
  spinner.stop();

  // SFTP Favorites ?
  if (!favorites.length) {
    consola.warn(`No Transmit SFTP favorites were found`);
    process.exit(1);
  }

  let config;
  try {
    await fs.promises.access(sshConfigFile, fs.constants.R_OK);
    config = await getSSHConfig(sshConfigFile);
  } catch (error) {
    consola.info(
      `No SSH config file was found, it will be created at: ${sshConfigFile}`
    );
    config = new SSHConfig();
  }

  // Convert favorites from Transmit into SSH config
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
    deleted: 0,
    updated: 0,
    added: 0,
  };

  // Delete
  config.forEach((fc, i) => {
    const fcId = getFavoriteId(fc);
    if (!fcId) {
      return false;
    }
    const removeFavorite = favoritesFromTransmit.every((ft) => {
      const ftId = getFavoriteId(ft);
      if (fcId !== ftId) {
        return true;
      }
      return false;
    });

    if (removeFavorite) {
      counts['deleted'] += 1;
      consola.warn(`Removed ${getHostLog(fc)}`);
      config.splice(i, 1);
    }
  });

  // Update
  favoritesFromTransmit.forEach((ft, i) => {
    const ftId = getFavoriteId(ft);
    const updateFavorite = config.some((fc) => {
      const fcId = getFavoriteId(fc);
      if (!fcId) {
        return false;
      }
      if (
        fcId === ftId &&
        !deepEqual(sanitizeFavorite(ft), sanitizeFavorite(fc))
      ) {
        return true;
      }
    });

    if (updateFavorite) {
      consola.info(`Updated ${getHostLog(ft)}`);
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
    const addFavorite = config.every((fc) => {
      const fcId = getFavoriteId(fc);
      if (!fcId) {
        return true;
      }
      return fcId !== ftId;
    });

    if (addFavorite) {
      counts['added'] += 1;
      consola.success(`Added ${getHostLog(ft)}`);
      config.push(ft);
    }
  });

  // Nothing happened
  const nothing = Object.keys(counts).every((key) => counts[key] === 0);
  if (nothing) {
    consola.info(`No Transmit favorites to add, update or delete.`);
  } else {
    // Sort alphabetically
    config.sort((a, b) => {
      let comparison = 0;
      if (a.value > b.value) {
        comparison = 1;
      } else if (a.value < b.value) {
        comparison = -1;
      }
      return comparison;
    });

    // Write file
    await fs.promises.writeFile(sshConfigFile, SSHConfig.stringify(config));

    // Fix permissions
    await fs.promises.chmod(sshConfigFile, 0o644);

    // Summary
    Object.keys(counts).forEach((key) => {
      if (counts[key] === 0) {
        return;
      }
      consola.success(
        `${counts[key]} Transmit favorite${counts[key] > 1 ? 's' : ''} ${
          counts[key] > 1 ? 'have' : 'has'
        } been successfully ${key} in your SSH config file.`
      );
    });
  }

  // Quit Transmit if it was not running at launch
  if (appStatus === 'false' || !appStatus) {
    try {
      await runAppleScript(`quit app "Transmit"`);
    } catch (error) {
      consola.error(error);
      process.exit(1);
    }
  }

  process.exit(0);
})();
