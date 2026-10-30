# Shipping Top Bunk on Steam

The desktop build is the web game wrapped in Electron (`desktop/`), packaged by electron-builder
(`package.json` → `"build"`) and uploaded with SteamPipe (`steam/`). This page is the launch order; the
details are in the files it links to.

## Before there is a Steam app

```sh
npm ci
npm run check     # config + server + Steam-bridge checks, no Electron needed
npm run smoke     # starts the real Electron shell headless (Xvfb on Linux), expects SMOKE_OK
npm start         # play: fullscreen, F11 / Alt+Enter toggles, F12 devtools in dev
npm run dist:linux  # or dist:win / dist:mac on that OS -> dist/
```

With the Steam client running and logged in, `npm start` already connects to Valve's **Spacewar**
test app (App ID 480 in `desktop/steam_appid.txt`): the overlay opens with Shift+Tab, and
`window.desktop.achieve('ACH_WIN_ONE_GAME')` unlocks one of Spacewar's achievements in your profile.
Without Steam everything still runs; `window.desktop.isSteam` is `false` and achievements are no-ops.

The game sees the shell as `window.desktop`:

| Property | Meaning |
| --- | --- |
| `isDesktop` | `true` in the Electron build (undefined on the web) |
| `isSteam` | Steamworks initialised (Steam client running, app id accepted) |
| `playerName` | Steam persona name, or `null` |
| `platform`, `version` | `win32` / `darwin` / `linux`; app version from `package.json` |
| `achieve(id)` → `Promise<boolean>` | Unlock an achievement by its Steamworks **API name**, then store stats |
| `clearAchievement(id)`, `isAchieved(id)` | Dev helpers |
| `quit()` | Close the app |
| `toggleFullscreen()`, `isFullscreen()` | Fullscreen state |
| `saves` | The save files for `js/store.js` (see below); `null` if the folder can't be used |

## Saves and Steam Cloud

There are five saves: `topbunk.run` (the run in progress: seed, night, proof found), `topbunk.settings`,
`topbunk.achievements`, `topbunk.stats` (the counters some achievements need) and `topbunk.quality`
(the graphics preset). The game reads and writes them through `js/store.js`. In a browser they're in
`localStorage`. The desktop build keeps each one as `<name>.json` in a `saves` folder, writing a temp
file and renaming it over the old one so a crash never leaves half a save:

| OS | Saves folder |
| --- | --- |
| Windows | `%APPDATA%\Top Bunk\saves` |
| macOS | `~/Library/Application Support/Top Bunk/saves` |
| Linux | `$XDG_DATA_HOME/Top Bunk/saves`, usually `~/.local/share/Top Bunk/saves` |

On Windows and macOS that's inside Electron's user-data folder. On Linux the user-data folder is
`~/.config/Top Bunk`, which no documented Steam Cloud root covers, so the saves go under the XDG data
folder instead. The first time a desktop build starts on a machine, it copies whatever an older build
left in `localStorage` into the folder, unless that save already has a file there (one Steam Cloud
brought down wins).

Set up Auto-Cloud under **Steamworks → Application → Steam Cloud**:

1. Byte quota per user: `1000000`. Number of files per user: `10`. The five files come to a few KB.
2. Add one root path: root `WinAppDataRoaming`, subdirectory `Top Bunk/saves`, pattern `*.json`, OS
   "All OSes", not recursive.
3. Add two root overrides for it, so the same files land in the macOS and Linux folders:

   | Original root | OS | New root | Add/Replace path | Replace path |
   | --- | --- | --- | --- | --- |
   | `WinAppDataRoaming` | macOS | `MacHome` | `Library/Application Support/Top Bunk/saves` | on |
   | `WinAppDataRoaming` | Linux | `LinuxXdgDataHome` | `Top Bunk/saves` | on |

4. Save, then publish from the **Publish** tab. Before release, "Enable cloud support for developers
   only" lets your own account test it.

Steam uploads the folder when the game exits and downloads it before the next launch, so a run saved on
one machine continues on another: the title screen there says `Continue: night N of 10` with the same
seed. Settings, unlocked achievements and the graphics preset come along too. To check it, finish moving
day on one machine and quit, then start the game on a second machine signed in to the same account.

Without Steam, two smoke runs on the same folder check that a setting survives a restart (the second
run fails if the page didn't start with what the first one saved):

```sh
npm run smoke -- --user-data=/tmp/tb-saves
npm run smoke -- --user-data=/tmp/tb-saves
```

## Launch order

1. Create the app in Steamworks to get its App ID. Valve's
   [onboarding docs](https://partner.steamgames.com/doc/gettingstarted) cover the partner account itself.
2. Put the App ID and depot IDs into the repo and commit them: `steam/README.md`, section 1. Set the
   `STEAM_APP_ID` repository variable too if CI should upload.
3. Create the three depots and the launch options, keep the overlay on, then publish the app changes:
   `steam/README.md`, sections 4 and 5.
4. Fill in the store page from `store/description.md` and upload the art from `store/out/` and
   `store/screenshots/`. `store/README.md` says which file goes in which slot.
5. Enter the achievements from `steam/achievements.json` (`steam/achievements.md` goes through the form)
   and publish them. Until then, test unlocks against Spacewar (App ID 480), whose API names are
   `ACH_WIN_ONE_GAME`, `ACH_WIN_100_GAMES`, `ACH_TRAVEL_FAR_ACCUM` and `ACH_TRAVEL_FAR_SINGLE`.
6. Build on each OS and upload, by hand or from CI on a `v*` tag: `steam/README.md`, sections 2, 3 and 6.
7. Set the build live on the default branch, install it through the Steam client on each OS and run the
   checks at the end of `steam/README.md`, section 3, plus a controller and, if you have one, a Steam Deck.

## Not done yet

- **Code signing**: Windows builds are unsigned (SmartScreen will warn on direct downloads; Steam
  installs are fine). Signing needs an Authenticode certificate and `win.certificateFile` /
  `signtoolOptions` in the electron-builder config.
- **macOS notarization**: `mac.identity` is `null`. Steam strips the quarantine attribute so Steam
  installs run, but the universal zip from GitHub will be blocked by Gatekeeper until the app is
  signed with a Developer ID and notarized (`identity`, `hardenedRuntime: true`, `notarize`).
- **Steam Cloud**: the save files and the Auto-Cloud settings above are ready, but haven't been tried
  against the real app yet (that needs the App ID). Check a run carries over between Windows, macOS and
  Linux before release.
- **Steam Input**: no action manifest / default controller configuration; controllers are read through
  the Gamepad API only.
- **Localization**: English only, including the store page.
- **Steam Deck verification**: untested; expect "Playable" at best until the Linux build is tried on a
  Deck (text size, controller glyphs, the Linux sandbox note in `steam/README.md`).
- Trading cards, workshop, leaderboards, DLC: none.
