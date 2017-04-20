#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { parseXml } from 'libxmljs';
import slug from 'slugg';
import sshConfigParser from 'ssh-config';
import prog from 'caporal';
import chalk from 'chalk';
import { version, description } from '../package.json';

// Prevent execution on non Mac OS platform
if (process.platform !== 'darwin') {
  console.log(chalk.blue('Sorry, this program is Mac OS only'));
  process.exit(1);
}

/**
 * Sync Transmit favorites with ssh config
 * @param  {Object} args
 * @param  {Object} options
 * @param  {Object} logger
 */
const syncFavorites = (args, options, logger) => {

  // Get XML file
  const transmitFavoritesFile = path.join(process.env['HOME'], 'Library/Application Support/Transmit/Favorites/Favorites.xml');
  const favoritesFile         = options.file || transmitFavoritesFile;
  if( !fs.existsSync(favoritesFile) ) {
    logger.error(chalk.red(`No favorites file could be found at ${favoritesFile}`));
    return;
  }

  // Parse XML file
  const favoritesXML      = fs.readFileSync(favoritesFile);
  const xmlDoc            = parseXml(favoritesXML);
  const transmitFavorites = xmlDoc.find("//object[@type = 'FAVORITE'][.//attribute[@name = 'protocol' and text() = 'SFTP']]");
  if( !transmitFavorites ) {
    logger.error(chalk.red(`No SFTP favorites have been in ${favoritesFile}`));
    return;
  }

  // Build SSH config objects
  const favorites = [];
  transmitFavorites.forEach((obj) => {

    const id       = obj.attr('id').value();
    const name     = obj.get("./attribute[@name='nickname']").text();
    const server   = obj.get("./attribute[@name='server']").text();
    const user     = obj.get("./attribute[@name='username']").text();
    const port     = parseInt(obj.get("./attribute[@name='port']").text());

    const collectionId   = obj.get("./relationship[@name = 'collection']/@idrefs").value();
    const collectionName = xmlDoc.get(`//object[@type = 'COLLECTION' and @id = '${collectionId}']/attribute[@name = 'name']`);

    // Prevent history collection parsing
    if( collectionName === undefined ) {
      return;
    }
    const favoriteSlug = slug(collectionName.text()) + '/' + slug(name) + '[tf-' + id + ']';

    const favorite = {
      type: 1,
      param: 'Host',
      separator: ' ',
      value: favoriteSlug,
      before: '',
      after: '\n\t',
      config: [
        {
          type: 1,
          param: 'HostName',
          value: server,
          separator: ' ',
          before: '',
          after: '\n\t'
        },
        {
          type: 1,
          param: 'User',
          value: user,
          separator: ' ',
          before: '',
          after: port ? '\n\t' : '\n\n'
        }
      ]
    }
    if( port ) {
      favorite.config.push({
        type: 1,
        param: 'Port',
        value: port,
        separator: ' ',
        before: '',
        after: '\n\n'
      });
    }

    favorites.push(favorite);
    console.log(chalk.blue(`Adding ${favoriteSlug} - ${server}`));

  });

  if( !favorites.length ) {
    logger.error(chalk.red(`Could not find any SFTP favorites in ${favoritesFile}`));
    return;
  }

  // Get existing SSH config
  const sshConfigFile = path.join(process.env['HOME'], '.ssh', 'config');
  const configFile    = fs.existsSync(sshConfigFile) ? fs.readFileSync(sshConfigFile, 'utf-8') : '';
  let sshConfig       = sshConfigParser.parse(configFile);

  // @todo Prompt are you sure?

  // Remove every Transmit favorites from existing ssh config
  sshConfig = sshConfig.filter((line) => {
    if( line.param !== 'Host' ) {
      return true;
    }
    return !/\[tf-z\d+\]$/.test(line.value);
  });

  // Merge SSH config objects & Transmit favorites
  sshConfig = sshConfig.concat(favorites);

  // Write file
  fs.writeFileSync(sshConfigFile, sshConfigParser.stringify(sshConfig));

  console.log(chalk.green.bold(`\n✓ ${favorites.length} Transmit favorites have been successfully added to your ~/.ssh/config file.\n`));
}

prog
  .name('t2sc')
  .version(version)
  .description(description)
  .option('-f, --file <file>', 'XML Transmit favorites file to import', prog.STRING)
  .action(syncFavorites);

prog.parse(process.argv);
