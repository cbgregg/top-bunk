#!/usr/bin/env bash
# Uploads the Top Bunk depots to Steam with steamcmd (macOS / Linux).
#
#   STEAM_USERNAME=<account> ./upload.sh [--preview] [--set-live <branch>] [--desc "<text>"]
#
#   --preview            dry run: steamcmd builds the depots locally into build/ and uploads nothing
#   --set-live <branch>  set the build live on that branch afterwards (e.g. "beta"; "default" can only be
#                        set live on the Steamworks site)
#   --desc "<text>"      build description shown in Steamworks (default: "Top Bunk <version> (<git sha>)")
#
# Needs: steamcmd on PATH (or STEAMCMD=/path/to/steamcmd.sh), one interactive `steamcmd +login <account>`
# done on this machine so the Steam Guard code is cached (or STEAM_PASSWORD set for a non-interactive
# run), the YOUR_* placeholders in *.vdf replaced (see ../STEAM.md), and the electron-builder "dir"
# outputs in ../dist (npm run dist:win / dist:mac / dist:linux). The per-run fields are written into
# app_build.generated.vdf (git-ignored) next to app_build.vdf so relative paths keep working.
set -euo pipefail
cd "$(dirname "$0")"

usage() { sed -n '2,15p' "$0"; exit "${1:-0}"; }
preview=0; live=''; desc=''
while [ $# -gt 0 ]; do
  case "$1" in
    --preview) preview=1 ;;
    --set-live) live=${2:?--set-live needs a branch name}; shift ;;
    --desc) desc=${2:?--desc needs text}; shift ;;
    -h|--help) usage ;;
    *) echo "unknown option: $1" >&2; usage 1 ;;
  esac
  shift
done

STEAMCMD=${STEAMCMD:-steamcmd}
command -v "$STEAMCMD" >/dev/null 2>&1 || { echo "steamcmd not found: install it (https://developer.valvesoftware.com/wiki/SteamCMD) or set STEAMCMD=/path/to/steamcmd.sh" >&2; exit 1; }
user=${STEAM_USERNAME:?set STEAM_USERNAME to the Steamworks account that owns the app}

if grep -qE '"YOUR_[A-Z_]+"' app_build.vdf depot_build_*.vdf; then   # quoted values only: comments may mention the placeholders
  echo "app_build.vdf / depot_build_*.vdf still contain YOUR_* placeholders: fill in the App ID and depot IDs first (see ../STEAM.md)." >&2
  exit 1
fi

missing=0
for f in depot_build_*.vdf; do
  root=$(sed -n 's/^[[:space:]]*"ContentRoot"[[:space:]]*"\([^"]*\)".*/\1/p' "$f" | head -n 1)
  if [ ! -d "$root" ]; then echo "missing $root (ContentRoot of $f): run npm run dist:<os> first" >&2; missing=1; fi
done
[ "$missing" = 0 ] || exit 1

if [ -z "$desc" ]; then
  version=$(node -p "require('../package.json').version" 2>/dev/null || echo unknown)
  sha=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo nogit)
  desc="Top Bunk $version ($sha)"
fi
esc() { printf '%s' "$1" | sed 's/[&|\\]/\\&/g'; }

mkdir -p build
script=app_build.generated.vdf
sed -e "s|^\([[:space:]]*\"Desc\"[[:space:]]*\)\"[^\"]*\"|\1\"$(esc "$desc")\"|" \
    -e "s|^\([[:space:]]*\"SetLive\"[[:space:]]*\)\"[^\"]*\"|\1\"$(esc "$live")\"|" \
    -e "s|^\([[:space:]]*\"Preview\"[[:space:]]*\)\"[^\"]*\"|\1\"$preview\"|" app_build.vdf > "$script"

echo "uploading with $script (desc: $desc; set live: ${live:-no}; preview: $preview)"
login=(+login "$user"); [ -n "${STEAM_PASSWORD:-}" ] && login+=("$STEAM_PASSWORD")
"$STEAMCMD" "${login[@]}" +run_app_build "$(pwd)/$script" +quit
