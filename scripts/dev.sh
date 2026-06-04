#!/usr/bin/env bash
# Dev server wrapper. electron-vite launches Electron through a node launcher; if
# this dev command is interrupted, that launcher can die while the Electron binary
# keeps running, orphaned (reparented to launchd) - so `pnpm dev` "doesn't exit the
# app". On exit, kill this project's dev Electron processes so nothing is left
# behind. Scoped to this repo's node_modules, so other Electron apps are untouched.
cleanup() {
  stty sane 2>/dev/null || true
  pkill -f "$PWD/node_modules/.pnpm/electron@" 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP

electron-vite dev "$@"
