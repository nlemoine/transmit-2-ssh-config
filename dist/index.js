#!/usr/bin/env node
'use strict';

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _libxmljs = require('libxmljs');

var _slugg = require('slugg');

var _slugg2 = _interopRequireDefault(_slugg);

var _sshConfig = require('ssh-config');

var _sshConfig2 = _interopRequireDefault(_sshConfig);

var _caporal = require('caporal');

var _caporal2 = _interopRequireDefault(_caporal);

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _package = require('../package.json');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Prevent execution on non Mac OS platform
if (process.platform !== 'darwin') {
  console.log(_chalk2.default.blue('Sorry, this program is Mac OS only'));
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
  const transmitFavoritesFile = _path2.default.join(process.env['HOME'], 'Library/Application Support/Transmit/Favorites/Favorites.xml');
  const favoritesFile = options.file || transmitFavoritesFile;
  if (!_fs2.default.existsSync(favoritesFile)) {
    logger.error(_chalk2.default.red(`No favorites file could be found at ${favoritesFile}`));
    return;
  }

  // Parse XML file
  const favoritesXML = _fs2.default.readFileSync(favoritesFile);
  const xmlDoc = (0, _libxmljs.parseXml)(favoritesXML);
  const transmitFavorites = xmlDoc.find("//object[@type = 'FAVORITE'][.//attribute[@name = 'protocol' and text() = 'SFTP']]");
  if (!transmitFavorites) {
    logger.error(_chalk2.default.red(`No SFTP favorites have been in ${favoritesFile}`));
    return;
  }

  // Build SSH config objects
  const favorites = [];
  transmitFavorites.forEach(obj => {

    const id = obj.attr('id').value();
    const name = obj.get("./attribute[@name='nickname']").text();
    const server = obj.get("./attribute[@name='server']").text();
    const user = obj.get("./attribute[@name='username']").text();
    const port = parseInt(obj.get("./attribute[@name='port']").text());

    const collectionId = obj.get("./relationship[@name = 'collection']/@idrefs").value();
    const collectionName = xmlDoc.get(`//object[@type = 'COLLECTION' and @id = '${collectionId}']/attribute[@name = 'name']`);

    // Prevent history collection parsing
    if (collectionName === undefined) {
      return;
    }
    const favoriteSlug = (0, _slugg2.default)(collectionName.text()) + '/' + (0, _slugg2.default)(name) + '[tf-' + id + ']';

    const favorite = {
      Host: favoriteSlug,
      HostName: server,
      User: user
    };
    if (port) {
      favorite.Port = port;
    }

    favorites.push(favorite);
  });

  if (!favorites.length) {
    logger.error(_chalk2.default.red(`Could not find any SFTP favorites in ${favoritesFile}`));
    return;
  }

  // Get existing SSH config
  const sshConfigFile = _path2.default.join(process.env['HOME'], '.ssh', 'config');
  const configFile = _fs2.default.existsSync(sshConfigFile) ? _fs2.default.readFileSync(sshConfigFile, 'utf-8') : '';
  let sshConfig = _sshConfig2.default.parse(configFile);

  // @todo Prompt are you sure?

  // Remove every Transmit favorites from existing ssh config
  sshConfig = sshConfig.filter(line => {
    if (line.param !== 'Host') {
      return true;
    }
    return !/\[tf-z\d+\]$/.test(line.value);
  });

  // Merge SSH config objects & Transmit favorites
  favorites.forEach(favorite => {
    sshConfig.append(favorite);
    console.log(_chalk2.default.blue(`Adding ${favorite.Host} - ${favorite.HostName}`));
  });

  // Write file
  _fs2.default.writeFileSync(sshConfigFile, _sshConfig2.default.stringify(sshConfig));

  console.log(_chalk2.default.green.bold(`\n✓ ${favorites.length} Transmit favorites have been successfully added to your ~/.ssh/config file.\n`));
};

_caporal2.default.name('t2sc').version(_package.version).description(_package.description).option('-f, --file <file>', 'XML Transmit favorites file to import', _caporal2.default.STRING).action(syncFavorites);

_caporal2.default.parse(process.argv);