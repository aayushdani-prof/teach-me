#!/bin/bash
# LaunchAgent entrypoint: start the Teach Me server, keep it alive.
# Uses absolute node path because launchd runs with a minimal PATH.
HERE="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(dirname "$HERE")"
exec "/opt/homebrew/bin/node" "$APP_ROOT/server/index.js"
