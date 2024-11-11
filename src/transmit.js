import { execString } from 'applescript';
import { promisify } from 'node:util';
import slugify from '@sindresorhus/slugify';

import FavoriteSchema from './favorite.js';

const execStringPromise = promisify(execString);

const transmitFavoritesScript = `
tell application "Transmit"
	try
		set favoriteItems to {}
		set listSize to count of favorites

		if listSize is 0 then
			return favoriteItems
		end if

		repeat with counter from 1 to listSize
			try
				set fav to {}
				set currentFav to item counter of favorites
				set end of fav to name of currentFav
				set end of fav to address of currentFav
				set end of fav to user name of currentFav
				set end of fav to port of currentFav
				set end of fav to protocol of currentFav as string
				set end of fav to remote path of currentFav
				set end of fav to identifier of currentFav
				set end of favoriteItems to fav
			on error errMsg
				-- Skip this favorite if there's an error, continue with next
				log "Warning: Failed to process favorite " & counter & ": " & errMsg
			end try
		end repeat

		return favoriteItems
	on error errMsg
		error "Failed to get Transmit favorites: " & errMsg
	end try
end tell`;

const transmitFavoritesFoldersScript = `
tell application "System Events"
	try
		tell process "Transmit"
			-- Try to find the Go menu (more reliable than hardcoded index)
			set goMenuIndex to 0
			try
				set menuBarCount to count of menu bar items of menu bar 1
				repeat with i from 1 to menuBarCount
					try
						set menuTitle to title of menu bar item i of menu bar 1
						if menuTitle is "Go" then
							set goMenuIndex to i
							exit repeat
						end if
					end try
				end repeat
			end try

			-- Fallback to hardcoded index if Go menu not found
			if goMenuIndex is 0 then
				set goMenuIndex to 8
			end if

			set menuItems to every menu item of menu 1 of menu bar item goMenuIndex of menu bar 1
			set favoritesFolders to {}
			set separators to {}

			repeat with menuItem in menuItems
				try
					set favFolder to {}
					set menuTitle to title of menuItem
					if menuTitle = "" then
						set end of separators to menuTitle
					end if
					-- Only get favorites, after the second separator
					if count of separators > 2 then exit repeat

					-- Get sub menus
					set subMenuItemsCount to count of menu items of menu of menuItem
					if subMenuItemsCount >= 1 then
						set subMenuItems to every menu item of menu 1 of menuItem
						set end of favFolder to menuTitle
						set menuChildren to {}
						repeat with subMenuItem in subMenuItems
							try
								set subMenuTitle to title of subMenuItem
								-- Exit repeat before "Open in tabs"
								if subMenuTitle is equal to "" then exit repeat
								set end of menuChildren to subMenuTitle
							end try
						end repeat
						set end of favFolder to menuChildren
						set end of favoritesFolders to favFolder
					end if
				on error
					-- Skip this menu item if there's an error
				end try
			end repeat

			return favoritesFolders
		end tell
	on error errMsg
		error "Failed to get folder structure: " & errMsg
	end try
end tell`;

/**
 * Get favorite folder name
 *
 * @param {String} favorite
 * @param {Array} folders
 * @returns {String | undefined}
 */
const getFavoriteFolderName = (favoriteName, folders) => {
	for (let i = 0; i < folders.length; i++) {
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
		if (folderFavorites.includes(favoriteName)) {
			return folderName;
		}
	}

	return undefined;
};

/**
 * Maybe quit Transmit
 * Re-checks app status to avoid race conditions
 *
 * @param {String} wasRunning - Original app status before operations
 */
const maybeQuit = async (wasRunning) => {
	// Only quit if app wasn't running before
	if (wasRunning === 'false' || !wasRunning) {
		// Re-check current status to avoid race condition
		const currentStatus = await execStringPromise(
			'application "Transmit" is running',
		);
		// Only quit if it's still running (we started it)
		if (currentStatus === 'true') {
			await execStringPromise('quit app "Transmit"');
		}
	}
};

/**
 * Get Transmit favorites
 *
 * @returns {Array}
 */
const getTransmitFavorites = async () => {
	const appStatus = await execStringPromise(
		'application "Transmit" is running',
	);

	const favoritesRaw = await execStringPromise(transmitFavoritesScript);
	if (!favoritesRaw) {
		await maybeQuit(appStatus);
		return [];
	}

	// Try to get folders, but don't fail if it doesn't work
	let folders = null;
	try {
		folders = await execStringPromise(transmitFavoritesFoldersScript);
		if (!Array.isArray(folders) || folders.length === 0) {
			folders = null;
		}
	} catch (_error) {
		// Silently fall back to flat names if folder extraction fails
		folders = null;
	}

	const favorites = favoritesRaw
		.map(([Name, HostName, User, Port, Protocol, RemotePath, Id]) => {
			// Gracefully handle missing folder info
			const folderName = folders ? getFavoriteFolderName(Name, folders) : null;
			const fullName = folderName ? `${folderName}/${Name}` : Name;

			return FavoriteSchema.parse({
				Id,
				Host: fullName
					.split('/')
					.map((p) => slugify(p))
					.join('/'),
				HostName,
				User,
				Port,
				Protocol,
				RemotePath: RemotePath === 'missing value' ? undefined : RemotePath,
			});
		})
		.filter(({ Protocol }) => Protocol === 'SFTP');

	await maybeQuit(appStatus);

	return favorites;
};

export default getTransmitFavorites;
