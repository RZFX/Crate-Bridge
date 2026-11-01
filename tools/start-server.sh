#!/bin/bash
# Starts the local web server for Crate Bridge in the background.
# Prints "<port> <pid>" on one line. Used by the macOS app.
ROOT="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
if command -v python3 >/dev/null 2>&1 && python3 -c '' >/dev/null 2>&1; then
  PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
  nohup python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
elif command -v ruby >/dev/null 2>&1; then
  PORT=$((20000 + RANDOM % 20000))
  nohup ruby -run -e httpd . -b 127.0.0.1 -p "$PORT" >/dev/null 2>&1 &
else
  echo "Python 3 or Ruby is needed to run Crate Bridge. Install Python from python.org." >&2; exit 1
fi
PID=$!
for _ in $(seq 1 50); do curl -fs -o /dev/null "http://localhost:$PORT/" && break; sleep 0.1; done
curl -fs -o /dev/null "http://localhost:$PORT/" || { kill $PID 2>/dev/null; echo "The local server did not start." >&2; exit 1; }
echo "$PORT $PID"
