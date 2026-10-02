# Transmit favorites to SSH config

Synchronize [Transmit 5](https://panic.com/transmit/) SFTP favorites with your SSH config file.

[![asciicast](https://asciinema.org/a/ekHtrwdtRdDhNIAErBci9dcLT.png)](https://asciinema.org/a/ekHtrwdtRdDhNIAErBci9dcLT)

## Install

```bash
npm install -g transmit-2-ssh-config
```

## Usage

### CLI

```bash
t2sc
```

### Programmatic API

```javascript
import getTransmitFavorites from 'transmit-2-ssh-config';

const favorites = await getTransmitFavorites();
// Returns array of SFTP favorites with: Id, Host, HostName, User, Port, Protocol, RemotePath
```

## Notes

- Asks for permission to control Transmit on first run
- Host aliases include the favorite folder, e.g. `client/production`
- Only SFTP favorites are synchronized
- Creates `~/.ssh/config` and `~/.ssh/config.d/` if they don't exist
- Existing SSH config entries are preserved

## Caveats

Folders are read from Transmit's internal favorites store (`~/Library/Application Support/Transmit/Connections.transmitstore`), which is not a public format. If it can't be read, favorites are synchronized without their folder name.

## Tips

Enable SSH hostname completion by adding to `.bash_profile`:

```bash
[ -e "$HOME/.ssh/config" ] && complete -o "default" -o "nospace" -W "$(grep "^Host" ~/.ssh/config | grep -v "[?*]" | cut -d " " -f2- | tr ' ' '\n')" scp sftp ssh
```

Quick access to SSH hosts: [Shuttle](http://fitztrev.github.io/shuttle/)

## License

MIT © Nicolas Lemoine
