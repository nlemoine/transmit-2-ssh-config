# Transmit favorites to SSH config

This package is born because I was bored to keep both my SSH config file and Transmit favorites in sync, filling twice the same informations over and over.

It will add all your [Transmit](https://panic.com/transmit/) SFTP favorites into an SSH config file.

- [Install](#install)
- [Usage](#usage)
- [Additional notes](#additional-notes)
- [Third party stuff to consider](#third-party-stuff-to-consider)
- [License](#license)

## Install

```bash
npm install -g transmit-2-ssh-config
```

or

```bash
yarn global add transmit-2-ssh-config
```

## Usage

```bash
t2sc
```

### Options

##### `-f`, `--file`

Custom favorites file location. 
If no file is specified, the script will get it from its default location: `~/Library/Application Support/Transmit/Favorites/Favorites.xml`

## Additional notes

- If you don't have a `~/.ssh/config` file, it will be created for you.
- Only SFTP favorites are added to the SSH config file.
- Existing config, hosts in your SSH config file will be preserved, Transmit favorites are only appended.

## Third party stuff to consider

### SSH config completion

I strongly recommend, if not using it already, to add this line to your `.bash_profile`: 

```bash
# Add tab completion for SSH hostnames based on ~/.ssh/config, ignoring wildcards
[ -e "$HOME/.ssh/config" ] && complete -o "default" -o "nospace" -W "$(grep "^Host" ~/.ssh/config | grep -v "[?*]" | cut -d " " -f2- | tr ' ' '\n')" scp sftp ssh;
```
Taken from famous [Mathias’s dotfiles](https://github.com/mathiasbynens/dotfiles/blob/master/.bash_profile#L40-L41)

### Shuttle

HostNames are slugified and formatted to play nice with the excellent [Shuttle](http://fitztrev.github.io/shuttle/) app.

In Transmit, say you have:

- Company folder
    - Server 1
    - Server 2
- Personal folder
    - Server 1
    - Server 2

These favorites will be converted to these Host names:

- company-folder/server-1[tf-z254]
- company-folder/server-2[tf-z249]
- personal-folder/server-1[tf-z157]
- personal-folder/server-2[tf-z236]

And will appear as shown above in [Shuttle](http://fitztrev.github.io/shuttle/):

![Transmit SFTP favorites SSH config](http://benkey.free.fr/transmit-to-sshconfig.png)

[tf-zXXX] suffix is added to allow Transmit favorites recognition. 

## License

MIT © Nicolas Lemoine
