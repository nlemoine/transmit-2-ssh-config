# Transmit favorites to SSH config

This package is born because I was bored to keep both my SSH config file and Transmit favorites in sync, filling twice the same informations over and over.

It will add all your [Transmit 5](https://panic.com/transmit/) SFTP favorites into an SSH config file.

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

## Additional notes

- You have to allow access to Transmit on the first run.
- If you don't have a `~/.ssh/config` file, it will be created for you.
- Only SFTP favorites are synchronized to the SSH config file.
- Existing config, hosts in your SSH config file will be preserved, Transmit favorites are safely added, updated or deleted.

## Caveats

Since Transmit 5, you can't get favorite folders so beware to have unique `Host` names. Since 2.0.0, you can manually add a slash to your favorite to mimick folders.

## Third party stuff to consider

### SSH config completion

I strongly recommend, if not using it already, to add this line to your `.bash_profile`:

```bash
# Add tab completion for SSH hostnames based on ~/.ssh/config, ignoring wildcards
[ -e "$HOME/.ssh/config" ] && complete -o "default" -o "nospace" -W "$(grep "^Host" ~/.ssh/config | grep -v "[?*]" | cut -d " " -f2- | tr ' ' '\n')" scp sftp ssh;
```
Taken from famous [Mathias’s dotfiles](https://github.com/mathiasbynens/dotfiles/blob/5368015b53467949c36f1e386582ac066b0d0ae6/.bash_profile#L42-L43)

### Shuttle

You can quickly access your SSH config file hosts with the excellent [Shuttle](http://fitztrev.github.io/shuttle/) app.

## License

MIT © Nicolas Lemoine
