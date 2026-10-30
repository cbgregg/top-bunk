# Shipping Top Bunk on Steam

The desktop build is the web game wrapped in Electron (`desktop/`), packaged by electron-builder
(`package.json` → `"build"`), uploaded with SteamPipe (`steam/`). This is the launch checklist, in
order. Sizes and rules below are Valve's at the time of writing; Steamworks shows the current numbers on
each upload form, and the form wins when they disagree.

## 0. Before you have a Steam app

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

## 1. Steamworks partner account

1. Sign up at https://partner.steamgames.com (Steam Direct). You need a legal entity or your own name,
   a bank account, and tax information; the identity, tax and bank checks take days.
2. Pay the per-app fee (USD 100, recouped once the app passes USD 1,000 in adjusted gross revenue).
   Paying it creates the app and gives you the **App ID**. New partner accounts have a waiting period
   (currently 30 days from payment) before the first release can go live; plan the date around it.
3. Add the people who will upload builds to the partner group with the "Edit App Metadata" and
   "Publish App Changes To Steam" permissions, and enable Steam Guard on the uploading account.

## 2. App ID into the repo

```sh
APP=1234560   # your App ID
sed -i.bak -e "s/YOUR_APP_ID/$APP/" -e "s/YOUR_DEPOT_ID_WINDOWS/$((APP+1))/" \
  -e "s/YOUR_DEPOT_ID_MAC/$((APP+2))/" -e "s/YOUR_DEPOT_ID_LINUX/$((APP+3))/" steam/*.vdf && rm steam/*.vdf.bak
echo $APP > desktop/steam_appid.txt
npm run check   # cross-checks the IDs
```

Also set the `STEAM_APP_ID` repository variable on GitHub if you want CI uploads. Commit all of it,
including `desktop/steam_appid.txt`: the shell reads the App ID from it when the game is started outside
Steam (when Steam starts it, the `SteamAppId` environment variable wins).

## 3. Depots and launch options (Steamworks → App Admin)

1. **SteamPipe → Depots**: Steam made depot AppID+1. Rename it "Windows", OS Windows, 64-bit. Create
   AppID+2 "macOS" (OS macOS) and AppID+3 "Linux" (OS Linux + SteamOS, 64-bit). Publish.
2. **Installation → General Installation → Launch Options**, one per OS:

   | OS | Executable | Launch type | Operating system | Arch |
   | --- | --- | --- | --- | --- |
   | Windows | `Top Bunk.exe` | Launch (Default) | Windows | 64-bit |
   | macOS | `Top Bunk.app/Contents/MacOS/Top Bunk` | Launch (Default) | macOS | (any) |
   | Linux | `top-bunk` | Launch (Default) | Linux + SteamOS | 64-bit |

   Leave Arguments empty. (If the Linux build exits at once on Ubuntu 24.04 with a "SUID sandbox helper
   binary" error, add the argument `--no-sandbox`: Steam does not preserve the set-uid bit on
   `chrome-sandbox` and that distribution blocks the user-namespace fallback. SteamOS/Steam Deck is fine.)
3. **Steam overlay**: keep it enabled (Installation → General Installation). The shell passes the Chromium
   switches the overlay needs (`in-process-gpu`, `disable-direct-composition`) and repaints every frame.
4. **Controller support** (Store Page → Basic Info → Supported Features): tick *Full Controller Support*
   only once every screen, including the title, pause, death and end screens, is usable from a pad;
   until then *Partial Controller Support*. Steam Input (Application → Steam Input) can stay unconfigured:
   controllers then reach the game as ordinary gamepads through the browser Gamepad API.
5. Publish the app changes (the "Publish" tab) after each of these.

Full detail, including the `steam/*.vdf` layout and the upload scripts: `steam/README.md`.

## 4. Store page

Store Page → Graphical Assets. Sizes Steam currently requires (JPG or PNG unless noted); the game's
logo must be readable on the capsules and nothing on them may carry review quotes, awards or
discount text. `store/` has the capsules and screenshots at these sizes (`store/README.md` lists the files):

| Asset | Size | Notes |
| --- | --- | --- |
| Header capsule | 920 × 430 | store page top, search, "recommended"; upload `store/out/header_capsule_2x.png` (the plain-named file is the old 460 × 215 size) |
| Small capsule | 462 × 174 | lists, search results; logo must stay legible |
| Main capsule | 1232 × 706 | front page features; upload `store/out/main_capsule_2x.png` (the plain-named file is the old 616 × 353 size) |
| Vertical capsule | 748 × 896 | front page, sale pages |
| Page background | 1438 × 810 | optional, shown blurred behind the page |
| Library capsule | 600 × 900 | the user's library grid |
| Library header | 920 × 430 | library "recent games" |
| Library hero | 3840 × 1240 | library detail page banner (keep the middle 2560 × 1240 safe) |
| Library logo | 1280 × 720 PNG with transparency | overlaid on the hero |
| Community icon | 184 × 184 JPG | community hub |
| Client icon | 32 × 32 (`.ico`, plus `.icns` for macOS) | the Steam client's game list |
| Screenshots | at least 5, 1920 × 1080 (16:9) | in-game only, no marketing text or UI mock-ups; mark at least 4 as suitable for all ages |
| Trailer | 1920 × 1080, H.264 MP4, 30 fps (60 accepted), 5+ Mbps, AAC audio 44.1/48 kHz | plus a 1920 × 1080 thumbnail; the whole video must be rated-appropriate |

Also fill in: short description (≤ 300 characters), "About this game", system requirements for each OS,
languages, genre/tags, features (Single-player, Steam Achievements, controller support), release date or
"Coming soon", and the **Mature content** survey (horror themes, jump scares, frightening imagery). The
text for all of these is in `store/description.md`.

Content warnings that belong in the description and on the title screen:

- **Flashing lights / photosensitivity**: flickering lights, TV static and jump-scare flashes are strobing
  effects. The title screen says "Contains jump scares and flashing lights"; keep the same line in the
  store description. Options → Reduce flashing softens them.
- Headphones recommended, loud sudden sounds.

## 5. Achievements

Stats & Achievements → Achievements → New, one per entry in `steam/achievements.json`
(`steam/achievements.md` goes through the form field by field). Each needs:

- **API name**: exactly the `id` the game passes to `window.desktop.achieve(id)` (the JSON's `apiName`).
- Display name, description, hidden flag (keep spoilers hidden).
- Two icons, **64 × 64 JPG**: unlocked and locked (grey) versions.

Publish the Stats & Achievements changes (their own "Publish" button). Until the app has achievements,
test the plumbing against Spacewar (App ID 480) whose achievement API names are
`ACH_WIN_ONE_GAME`, `ACH_WIN_100_GAMES`, `ACH_TRAVEL_FAR_ACCUM`, `ACH_TRAVEL_FAR_SINGLE`.

## 6. Build and upload

Per OS, on that OS (CI does this for you on a `v*` tag: `.github/workflows/desktop.yml`):

```sh
npm ci && npm run check
npm run dist:win    # dist/win-unpacked/, dist/Top Bunk-<v>-win-x64.zip
npm run dist:mac    # dist/mac/Top Bunk.app (x64, the Steam depot), dist/mac-arm64/Top Bunk.app, zips
npm run dist:linux  # dist/linux-unpacked/, dist/Top Bunk-<v>-linux-x64.tar.gz
```

The app icon is `desktop/build/icon.png` (1024 × 1024, written by `node store/render_capsules.js`);
electron-builder derives the Windows `.ico` and the macOS `.icns` from it.

Then either `STEAM_USERNAME=<account> steam/upload.sh` (`steam/upload.ps1` on Windows; both take
`--preview` for a dry run), or in CI add the `STEAM_USERNAME` and `STEAM_CONFIG_VDF` secrets and the
`STEAM_APP_ID` variable and push a tag. `STEAM_CONFIG_VDF` is steamcmd's `config/config.vdf` after one
Steam Guard login, **base64-encoded** (the action decodes it, and a raw paste fails the job): store the
output of `base64 -w0 < ~/Steam/config/config.vdf`, or on macOS
`base64 -i ~/Library/Application\ Support/Steam/config/config.vdf`. Upload macOS and Linux content from
macOS, Linux or CI, not from Windows, which drops executable bits.

Then in Steamworks: SteamPipe → Builds → set the build live on **default** (only the website can do
that), install the game through the Steam client on each OS, and check: it starts fullscreen, Shift+Tab
shows the overlay, an achievement unlocks, F11 / Alt+Enter toggles fullscreen, the in-game quit closes
the app, a controller works. Test the Linux build on a Steam Deck if you can.

## 7. Review and release

- The **Coming Soon** page must be live for at least **2 weeks** before release. Submit it for review
  early (store page review takes up to ~5 business days).
- Submit the build for review (another ~1 to 5 business days). Reviewers launch the game through Steam
  on the OSes you flagged: a crash on launch or a missing launch option fails it.
- Release checklist in App Admin must be all green: store page approved, build approved, pricing set,
  release date, the mature content survey, tax/bank onboarding complete, the waiting period over.
- Press "Release" from the App Admin page on launch day; it takes a few minutes to propagate.

Content ratings: Steam's own mature-content survey is mandatory. Official age ratings are optional
on Steam but free through the **IARC** questionnaire in Steamworks (gives ESRB, PEGI, USK, ClassInd,
ACB and GRAC ratings) and some storefront regions and promotions need them. Answer it the same way as
the content warnings in `store/description.md`: horror, fear, violence toward the player character, no
gore, mild language (a few exclamations), no purchases.

## 8. Not done yet

- **Code signing**: Windows builds are unsigned (SmartScreen will warn on direct downloads; Steam
  installs are fine). Signing needs an Authenticode certificate and `win.certificateFile` /
  `signtoolOptions` in the electron-builder config.
- **macOS notarization**: `mac.identity` is `null`. Steam strips the quarantine attribute so Steam
  installs run, but the arm64/x64 zips from GitHub will be blocked by Gatekeeper until the app is
  signed with a Developer ID and notarized (`identity`, `hardenedRuntime: true`, `notarize`).
- **Steam Cloud**: saves live in the browser `localStorage` inside Electron's user-data folder
  (`%APPDATA%\Top Bunk`, `~/Library/Application Support/Top Bunk`, `~/.config/Top Bunk`). Steam
  Auto-Cloud could sync those paths (Steamworks → Application → Steam Cloud) but is not configured or
  tested.
- **Steam Input**: no action manifest / default controller configuration; controllers are read through
  the Gamepad API only.
- **Localization**: English only, including the store page.
- **Steam Deck verification**: untested; expect "Playable" at best until the Linux build is tried on a
  Deck (text size, controller glyphs, the sandbox note above).
- Trading cards, workshop, leaderboards, DLC: none.
