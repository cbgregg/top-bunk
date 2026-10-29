# Achievements

`achievements.json` lists the game's 26 achievements with the fields the Steamworks form asks for. The
game's own copy is `ACHIEVEMENTS` in `../js/achievements.js`. Keep the two lists the same.

## Entering them in Steamworks

Each achievement is entered by hand, one form per entry in the file.

1. In Steamworks, open the app's **Stats & Achievements > Achievements** page and click **New Achievement**.
2. Fill in the form:
   - **API Name**: `apiName`, exactly. The game unlocks by this name (`window.desktop.achieve(apiName)`).
   - **Display Name**: `displayName`.
   - **Description**: `description`.
   - **Hidden**: tick it when `hidden` is `true`. Steam keeps the name and description out of sight until it unlocks.
   - **Icons**: an achieved and an unachieved image. Sizes are in section 5 of `../STEAM.md`.
   - Leave the rest at the defaults. `TRY_AGAIN` needs no progress stat: the game counts it itself.
3. Save, and go on to the next entry.
4. When they are all in, publish from the **Publish** tab. Steam only uses them once they are published.

Players' unlocks are stored under the API name, so keep each name fixed once the game is out.

## When each one unlocks

| API name | Unlocks when |
| --- | --- |
| `MOVING_DAY` | The third box is put down in your room on moving day. |
| `NIGHT_1` to `NIGHT_9` | Dawn of that night, at the "You made it" card. |
| `NIGHT_10` | Any ending, once its end screen is up. |
| `ENDING_TAKEN` | Night ten ends with three to six pieces of proof found. End screen: "They saw it." |
| `ENDING_ALONE` | Night ten ends with fewer than three pieces of proof. End screen: "They never believed you." |
| `ENDING_BELIEVED` | Night ten ends with seven or more pieces of proof and the morning drive away from the house. End screen: "They believed you." |
| `THE_DRAWING` | "Look at the drawing" in the hall. |
| `UNDER_THE_COVERS` | You hide under the covers on the top bunk. |
| `HIDING_PLACE` | You hide in one of the three closets or behind the shower curtain. |
| `HOLD_BREATH` | While hidden, the breath meter drops into the red (below 30%). |
| `STARE_DOWN` | It is creeping toward you and gives up because you kept looking at it (7 seconds, `js/hunter.js`). |
| `PHOTO_FELL` | The photo in the hall comes down on night one. It only falls while you are watching it. |
| `NOT_DAD` | On the TV night, you walk up to "Dad" in front of the TV. |
| `GRANDPA` | On the vigil night, you wake up in your bunk after grandpa turns around. |
| `GLOVE_BOX` | On the drive night, you wake up from the dream without opening the glove box. |
| `FIRST_TRY` | Dawn of a night you were not caught on, in the run you are playing. |
| `TRY_AGAIN` | You are caught for the 13th time, counted across every run. |
| `FLAWLESS` | Any ending, in a run where you survived nights one to nine and were never caught. |

## Local record and testing

- Unlocks are kept in localStorage under `topbunk.achievements` (API name and the time it unlocked). The
  counters are in `topbunk.stats`: `deaths`, and the current run's seed with the nights you survived and
  the nights you were caught on.
- An unlock shows a card in the bottom-left corner for four seconds. The card waits while something is
  after you. In the desktop build the same moment calls `window.desktop.achieve`. At start-up the game
  also passes Steam anything it has locally that Steam does not have yet.
- In the browser console: `__game.achievements.list()`, `__game.achievements.unlock('MOVING_DAY')`, and
  `__game.achievements.reset()` (local only; `window.desktop.clearAchievement(id)` locks one again in Steam).
- In a browser, or in the desktop build started with `--no-steam`, only the local record changes.
