tell application "Transmit"
	set the_list to {}
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
		set end of the_list to fav
	end repeat
	the_list
end tell
