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
- **Steam Cloud**: saves live in the browser `localStorage` inside Electron's user-data folder
  (`%APPDATA%\Top Bunk`, `~/Library/Application Support/Top Bunk`, `~/.config/Top Bunk`). Steam
  Auto-Cloud could sync those paths (Steamworks → Application → Steam Cloud) but is not configured or
  tested.
- **Steam Input**: no action manifest / default controller configuration; controllers are read through
  the Gamepad API only.
- **Localization**: English only, including the store page.
- **Steam Deck verification**: untested; expect "Playable" at best until the Linux build is tried on a
  Deck (text size, controller glyphs, the Linux sandbox note in `steam/README.md`).
- Trading cards, workshop, leaderboards, DLC: none.
