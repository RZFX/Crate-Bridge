#!/bin/bash
# Double-click to start Crate Bridge. Close this window (or press Ctrl+C) to stop it.
# Set CB_NO_OPEN=1 to start the server without opening a browser.

# resolve the real folder even if started through an alias or symlink
SRC="${BASH_SOURCE[0]}"
while [ -L "$SRC" ]; do
  DIR="$(cd -P "$(dirname "$SRC")" && pwd)"; SRC="$(readlink "$SRC")"; [[ $SRC != /* ]] && SRC="$DIR/$SRC"
done
cd -P "$(dirname "$SRC")" || exit 1

say() { printf '\n  %s\n' "$1"; }

# pick a free port
if command -v python3 >/dev/null 2>&1 && python3 -c '' >/dev/null 2>&1; then
  PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
  serve() { exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1; }
elif command -v ruby >/dev/null 2>&1; then
  PORT=$((20000 + RANDOM % 20000))
  serve() { exec ruby -run -e httpd . -b 127.0.0.1 -p "$PORT" >/dev/null 2>&1; }
else
  say "Crate Bridge needs Python 3 or Ruby to start a small local server, and neither was found."
  say "Install Python from https://www.python.org/downloads/ and double-click this file again."
  read -r -p "  Press Return to close. " _; exit 1
fi

serve &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM

URL="http://localhost:$PORT/"
for _ in $(seq 1 50); do
  curl -fs -o /dev/null "$URL" && break
  sleep 0.1
done
if ! curl -fs -o /dev/null "$URL"; then
  say "The local server didn't start. Please try again."; read -r -p "  Press Return to close. " _; exit 1
fi

clear
say "Crate Bridge is running."
say "Address:  $URL"

if [ -z "$CB_NO_OPEN" ]; then
  OPENED=$(bash "$(dirname "$SRC")/tools/open-browser.sh" "$URL")
  if [ "$OPENED" != "default" ]; then
    say "Opened in $OPENED."
  else
    say "No Chrome, Edge or Opera found, so it opened in your default browser."
    say "Safari and Firefox can't access folders. Please install Chrome: https://www.google.com/chrome/"
  fi
fi

say "Keep this window open while you use Crate Bridge."
say "To stop: close this window or press Ctrl+C."
wait $SERVER
