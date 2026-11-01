#!/bin/bash
# Builds "Crate Bridge.app" (a Dock-able launcher) that runs this folder's copy of Crate Bridge.
# Usage: tools/make-mac-app.sh [destination folder, default ~/Applications]
set -e
ROOT="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$HOME/Applications}"
APP="$DEST/Crate Bridge.app"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DEST"; rm -rf "$APP"

cat > "$TMP/app.applescript" <<EOF
property serverPid : ""
property serverPort : ""
property root : "$ROOT"

on openBrowser()
	set res to do shell script "/bin/bash " & quoted form of (root & "/tools/open-browser.sh") & " " & quoted form of ("http://localhost:" & serverPort & "/")
	if res is "default" then
		display dialog "Crate Bridge opened in your default browser. Safari and Firefox can't access folders — please install Google Chrome (or Edge or Opera) and open the app again." buttons {"OK"} default button "OK" with icon caution
	end if
end openBrowser

on run
	try
		set out to do shell script "/bin/bash " & quoted form of (root & "/tools/start-server.sh")
	on error errMsg
		display dialog "Crate Bridge couldn't start." & return & return & errMsg buttons {"OK"} default button "OK" with icon caution
		quit
		return
	end try
	set AppleScript's text item delimiters to " "
	set serverPort to text item 1 of out
	set serverPid to text item 2 of out
	openBrowser()
end run

on reopen
	if serverPort is not "" then openBrowser()
end reopen

on quit
	if serverPid is not "" then
		try
			do shell script "kill " & serverPid
		end try
	end if
	continue quit
end quit
EOF

osacompile -s -o "$APP" "$TMP/app.applescript"
python3 "$ROOT/tools/make-icon.py" "$TMP/icon.iconset"
iconutil -c icns -o "$APP/Contents/Resources/applet.icns" "$TMP/icon.iconset"
/usr/libexec/PlistBuddy -c "Set :CFBundleName 'Crate Bridge'" "$APP/Contents/Info.plist" 2>/dev/null || true
touch "$APP"
echo "Built: $APP"
