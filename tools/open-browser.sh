#!/bin/bash
# Opens a URL in a browser that supports folder access (Chrome, Edge, Opera, Vivaldi; Brave only with its flag).
# Prints the browser name, or "default" if only an unsupported default browser could be used.
URL="$1"
for APP in "Google Chrome" "Microsoft Edge" "Opera" "Vivaldi"; do
  if open -Ra "$APP" >/dev/null 2>&1; then open -a "$APP" "$URL"; echo "$APP"; exit 0; fi
done
open "$URL"; echo default
