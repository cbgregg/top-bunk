# SteamPipe upload configuration

What Steam needs to take the desktop build. `../STEAM.md` is the whole launch checklist, and
`../desktop/` is the Electron shell itself.

| File | What it is |
| --- | --- |
| `app_build.vdf` | The app build script steamcmd runs: App ID, description, output folder, the three depots. |
| `depot_build_windows.vdf` | Windows depot (AppID+1): `dist/win-unpacked/` from `npm run dist:win`. |
| `depot_build_mac.vdf` | macOS depot (AppID+2): `dist/mac/` (the x64 `Top Bunk.app`) from `npm run dist:mac`. |
| `depot_build_linux.vdf` | Linux depot (AppID+3): `dist/linux-unpacked/` from `npm run dist:linux`. |
| `upload.sh` / `upload.ps1` | Wrap `steamcmd +login <account> +run_app_build app_build.vdf`; refuse to run while placeholders remain or a ContentRoot is missing. |
| `achievements.json` | Achievement API names and texts to enter in Steamworks > Stats & Achievements (see `achievements.md`). |
| `build/`, `app_build.generated.vdf` | steamcmd logs and the per-run copy of the app script; git-ignored. |

Steam wants the plain electron-builder `dir` output as depot content, not the zips: each depot's
`ContentRoot` points at one of those folders and maps everything in it to the root of the install
directory.

## 1. Put your IDs in

Steamworks gives you an App ID and creates depot AppID+1. Create two more depots under
**SteamPipe > Depots** (one per OS, 64-bit) so you have AppID+1 (Windows), AppID+2 (macOS),
AppID+3 (Linux), then replace the placeholders:

```sh
APP=1234560   # your App ID
sed -i.bak -e "s/YOUR_APP_ID/$APP/" -e "s/YOUR_DEPOT_ID_WINDOWS/$((APP+1))/" \
  -e "s/YOUR_DEPOT_ID_MAC/$((APP+2))/" -e "s/YOUR_DEPOT_ID_LINUX/$((APP+3))/" steam/*.vdf && rm steam/*.vdf.bak
echo $APP > desktop/steam_appid.txt
npm run check   # parses the VDFs and cross-checks the IDs
```

`desktop/steam_appid.txt` is tracked in git: the shell reads it to know which app to initialise
(480 = Valve's Spacewar test app, which any Steam account can use to test achievements and the overlay).
When Steam launches the game it sets `SteamAppId` in the environment, which wins over the file.

## 2. Build

```sh
npm ci
npm run dist:win      # on Windows  -> dist/win-unpacked/, dist/Top Bunk-<v>-win-x64.zip
npm run dist:mac      # on macOS    -> dist/mac/Top Bunk.app, dist/mac-arm64/Top Bunk.app, zips
npm run dist:linux    # on Linux    -> dist/linux-unpacked/, dist/Top Bunk-<v>-linux-x64.tar.gz
```

Build each OS on that OS (electron-builder can cross-build some targets, but Windows cannot produce
a macOS bundle and macOS/Linux content built or uploaded from Windows loses its executable bits).
`.github/workflows/desktop.yml` does all three on GitHub runners and can upload to Steam itself.

The Steamworks native module (`steamworks.js`) is unpacked next to `app.asar` and finds
`steam_api64.dll` / `libsteam_api.dylib` / `libsteam_api.so` beside itself; the Windows and Linux
builds also carry a copy next to the executable, as the steamworks.js README recommends. Each depot
excludes the other two platforms' binaries (the upload scripts through the depot files' exclusions, CI
by deleting them when it unpacks the builds, since steam-deploy writes its own depot files).

## 3. Upload

```sh
STEAM_USERNAME=account steam/upload.sh --preview          # dry run, nothing leaves the machine
STEAM_USERNAME=account steam/upload.sh                    # upload
STEAM_USERNAME=account steam/upload.sh --set-live beta    # upload and set live on the "beta" branch
```

```powershell
$env:STEAM_USERNAME = 'account'; .\steam\upload.ps1 -Preview
.\steam\upload.ps1 -SetLive beta
```

Run `steamcmd +login <account>` once by hand first so the Steam Guard code is cached. Then set the
build live on the **default** branch from **SteamPipe > Builds** (steamcmd is not allowed to do that).
Install through the Steam client on each OS and check: it starts fullscreen, Shift+Tab opens the
overlay, an achievement unlocks, F11 / Alt+Enter toggles fullscreen, the in-game quit closes the app.

## 4. Launch options (Steamworks > Application > Installation > General Installation)

| OS | Executable | Launch type | Operating system | Arch |
| --- | --- | --- | --- | --- |
| Windows | `Top Bunk.exe` | Launch (Default) | Windows | 64-bit |
| macOS | `Top Bunk.app/Contents/MacOS/Top Bunk` | Launch (Default) | macOS | (any) |
| Linux | `top-bunk` | Launch (Default) | Linux + SteamOS | 64-bit |

Leave "Arguments" empty. Supported shell flags, should you need them: `--windowed` (start in a
window), `--no-steam` (do not initialise Steamworks), `--devtools`. The `--hash=<name>` debug jump
works in a packaged build only together with `--devtools`, and a jump earns no achievements.

Linux note: Electron's Chromium sandbox needs either unprivileged user namespaces (SteamOS, Fedora,
Arch, most distros) or a set-uid `chrome-sandbox`, which a Steam install does not preserve. Ubuntu
24.04 restricts user namespaces by default and the game then exits at once with a
"SUID sandbox helper binary" error. If that shows up in testing, add the argument `--no-sandbox` to
the Linux launch option (the game loads only its own files, so this costs little), or offer a second
launch option with it.

## 5. Flags to set in Steamworks

- **Steam overlay** (Application > Installation > General Installation): keep the overlay enabled (the
  default). The shell starts Chromium with `in-process-gpu` and `disable-direct-composition` and
  repaints every frame, which is what the overlay needs to draw over an Electron window.
- **Controller support** (Store Page > Basic Info > Supported Features): tick *Full Controller Support*
  only if every screen (title, pause, death, end) is usable with a pad; otherwise tick *Partial Controller
  Support*. The flags are store metadata; the game reads pads through the browser Gamepad API.
- **Steam Input** (Application > Steam Input): optional. Without a configuration, Steam exposes
  controllers as regular XInput/HID devices, which is what the game expects. Pick "Gamepad" as the
  default template if you enable it; there is no Steam Input action manifest yet.
- **Depots** (SteamPipe > Depots): give each depot its operating system so the client installs only
  the matching one, and mark Windows and Linux as 64-bit.

## 6. Branches and CI

- `default`: what customers get. Only ever set live from the website.
- `beta` (create it under SteamPipe > Builds): public or password-protected test branch; the upload
  scripts and the CI job can set it live directly.
- `.github/workflows/desktop.yml` builds on a `v*` tag or by hand, and uploads to Steam through
  `game-ci/steam-deploy@v3` when the `STEAM_USERNAME` and `STEAM_CONFIG_VDF` secrets exist. It uses the
  same AppID+1/+2/+3 depot order as the files here and the `STEAM_APP_ID` repository variable.
- `STEAM_CONFIG_VDF` is the `config/config.vdf` of a steamcmd that has logged in once with Steam Guard,
  base64-encoded, because the action decodes it and a raw paste fails the job. Store the output of
  `base64 -w0 < ~/Steam/config/config.vdf`, or on macOS
  `base64 -i ~/Library/Application\ Support/Steam/config/config.vdf`.
