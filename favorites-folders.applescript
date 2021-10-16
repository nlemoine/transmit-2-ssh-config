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
end tell
