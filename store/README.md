# store/ — Steam store page assets

Everything the Steamworks store page asks for, produced from the game itself so it never drifts from what ships. Nothing in this
folder is loaded by the game.

| File | What it is | Where it goes in Steamworks |
| --- | --- | --- |
| `description.md` | Short description, "About this game" (BBCode), system requirements, content warnings, AI-generated content disclosure, input, languages, tags, age-rating notes, and a list of claims to re-check before the page goes live | Store Page → Basic Info (name, short description, genre, tags, supported features, languages, the AI-content questions) · Store Page → Description · Store Page → Mature Content · the IARC questionnaire |
| `press-kit.md` | One-paragraph pitch, fact sheet, feature bullets, asset list | Not a Steamworks field: your website / press emails; the pitch and features also feed the Steam page |
| `shots.js` | Playwright harness: drives the live game headless and captures the screenshots | — |
| `screenshots/01…08.png` | Eight 1920×1080 in-game screenshots | Store Page → Graphical Assets → Screenshots: upload all but 07, which is too dark to read as a thumbnail (Steam needs five); mark at least four "suitable for all ages" |
| `capsules/*.html` | One HTML template per capsule, composed from the screenshots plus the title typography (`capsule.css` holds the shared look, `capsule.js` the ready signal and the `?s=2` zoom) | — |
| `capsules/src/` | Wide (3840×1240) and tall (1000×1400) source renders for the capsules, from `shots.js --extra` | — |
| `render_capsules.js` | Renders every template to `out/` at its exact size | — |
| `out/header_capsule.png` 460×215 (`_2x` 920×430) | Header capsule | Store Page → Graphical Assets → Header Capsule (Steam currently asks for 920×430; upload the `_2x`) |
| `out/small_capsule.png` 462×174 | Small capsule | Graphical Assets → Small Capsule |
| `out/main_capsule.png` 616×353 (`_2x` 1232×706) | Main capsule | Graphical Assets → Main Capsule (Steam currently asks for 1232×706; upload the `_2x`) |
| `out/vertical_capsule.png` 748×896 | Vertical capsule | Graphical Assets → Vertical Capsule |
| `out/page_background.png` 1438×810 | Page background (shown blurred) | Graphical Assets → Page Background |
| `out/library_capsule.png` 600×900 | Library capsule | Graphical Assets → Library Capsule |
| `out/library_header.png` 920×430 | Library header | Graphical Assets → Library Header |
| `out/library_hero.png` 3840×1240 | Library hero (keep the middle 2560×1240 clear: Steam crops the sides on narrow windows) | Graphical Assets → Library Hero |
| `out/library_logo.png` 1280×720, transparent | Library logo, overlaid on the hero | Graphical Assets → Library Logo (then pick its position in the preview) |
| `out/community_icon.jpg` 184×184 | Community icon | Graphical Assets → Community Icon |
| `out/client_icon.png` / `.ico` 32×32 | Client icon | Graphical Assets → Client Icon (.ico; macOS also wants an .icns, made from the same PNG) |

Rules Steam enforces on the capsules: the logo must be legible at the displayed size, no review quotes, award badges or discount
text, and the screenshots must be in-game captures with no marketing text or UI mock-ups. The base capsules may show only game
artwork, the game's name and an official subtitle, so the capsules here carry the title and nothing else; the tagline stays in the
"About this game" text. The sizes above are the ones this folder produces; Steamworks prints the sizes it currently wants on each upload form,
and the form wins when they disagree (the `_2x` renders exist for the two capsules Steam has already doubled).

## Regenerating

Playwright with Chromium is needed (`npx playwright install chromium` once). Rendering is headless on SwiftShader, so a 1080p frame
takes tens of seconds to a minute; the whole screenshot set is a ten to twenty minute job on a laptop.

```sh
node store/shots.js                 # the eight screenshots -> store/screenshots/
node store/shots.js --extra         # plus the capsule sources -> store/capsules/src/
node store/shots.js --preview       # fast 960x540 framing pass into a temp folder (prints the path)
node store/shots.js --only 05,08    # just some of them
node store/render_capsules.js       # every template -> store/out/
node store/render_capsules.js --only header,logo --shots /some/other/screenshots
```

Both scripts serve the repository root on a local port (`--port`, default 8800 and 8801) and open it in headless Chromium. Each shot
in `shots.js` is a few lines of setup against `window.__game` (phase, camera, where the thing stands); edit those to re-frame. The
HUD is hidden in every screenshot except 04, which keeps the hold-your-breath prompt and meter on purpose.

The capsule templates load the game's own fonts from `css/fonts.css` (Special Elite for the title, Courier Prime for the rest) and
nothing from the network; the renderer blocks the network as well, so a missing local font shows up as a fallback face.
`render_capsules.js` also writes the desktop app's icon, `desktop/build/icon.png` (1024×1024, the community icon's face), which
electron-builder turns into the Windows `.ico` and the macOS `.icns`.

## Not in this folder

- The trailer (`trailer/`; Steam wants 1920×1080 H.264 MP4 with a 1920×1080 thumbnail).
- Achievement icons: a 64×64 JPG pair (achieved and unachieved) for each entry in `steam/achievements.json`. None are made yet.
- A real developer name, website and press contact: `press-kit.md` and `description.md` carry placeholders where those go.
- Localised copy: the page is English only, which `description.md` says.
