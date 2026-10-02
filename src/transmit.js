import { execString } from 'applescript';
import { promisify } from 'node:util';
import slugify from '@sindresorhus/slugify';

import { getFavoriteFolders } from './connections-store.js';
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

	// Folders are optional, fall back to flat names if the store can't be read
	const folders = await getFavoriteFolders();

	const favorites = favoritesRaw
		.map(([Name, HostName, User, Port, Protocol, RemotePath, Id]) => {
			const folderNames = folders?.get(String(Id).toUpperCase()) ?? [];
			const fullName = [...folderNames, Name].join('/');

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
