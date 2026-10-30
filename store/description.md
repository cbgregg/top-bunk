# Top Bunk: Steam store copy

Paste-ready Steamworks copy. The "About this game" block is in Steam's BBCode subset (`[h2]`, `[b]`, `[list]`/`[*]`), so it pastes
as-is.

## Short description

Steam limit: 300 characters.

> Your family just moved into a cheap old farmhouse. Something tall lives at the end of the hall, and it only comes out at night. You've got a top bunk, a flashlight and ten nights to make your parents believe you. A short first-person horror game for keyboard and mouse or controller.

## About this game (long description, BBCode)

```
[b]The rent on the old farmhouse was cheap. Now we know why.[/b]

You're the kid. Your family just moved into a rented farmhouse at the end of a gravel drive, and the landlord let slip that the last family left in a hurry. You get the top bunk in the back corner room, next to the bathroom. Someone left a crayon drawing taped to the hallway wall: a tall black shape with huge white eyes and a big smile. Under it, in red, it says HE WATCHES.

At 2:47 that first night, the house wakes up.

[h2]Ten nights[/h2]
Top Bunk is a short first-person horror game set over ten nights in one house. On night one, doors shut by themselves, the photo in the hall comes off the wall, every cabinet in the kitchen bangs at once, and something walks around your bunk while you hold your breath under the covers. From night two the whole house is open, a clock runs toward dawn, and the thing in the hallway hunts you.

Each run has a seed, and the seed picks what each night is about. The phone rings in the dining room in the middle of the night. The TV switches itself on with Dad standing in front of it. Mom calls you to the kitchen while she's asleep down the hall. The power cuts out and the breaker's in the utility room. Your bear turns up where you didn't leave it. There's a night you can't move, a drive in the family car you have to wake up from, and a long night sitting up with grandpa by candlelight. Make it to dawn and you get breakfast. Get caught and you play the night again.

[h2]Hide. Hold your breath.[/h2]
It's bigger and faster than you, and you can't fight it. Break its line of sight and hide: under the covers on the top bunk, in the louvered closet, in your parents' closet, behind the shower curtain. When it's close enough to hear you, hold your breath. The meter drains while it stands there with its head tilted, waiting. Let go too early and it has you. Hold on too long and you gasp, and it has you anyway.

You've got a flashlight and doors you can shut behind you. Sprinting wears you out fast, so learn the house.

[h2]The house[/h2]
A single-storey farmhouse from the early 2000s, with brown carpet, a white kitchen, a narrow hall of family photos, a box TV and a phone on the dining-room wall. The breaker panel is out in the utility room, and the moving truck is still parked on the gravel.

[h2]Nobody believes you[/h2]
You tell them at breakfast and they explain it away. The tap was left running. The breaker tripped. You must have dropped the bear in the hall. Most nights the house leaves something behind, and if you find it, you've got something to show them. Show them enough and they start to listen.

There are three endings. Which one you get depends on how much proof you've found by the tenth night, when it finally comes down the hall.

[h2]Features[/h2]
[list]
[*] A short horror story over ten nights in one house
[*] Seeded runs: the same seed replays the same ten nights, and a new seed shuffles them
[*] Hiding spots, a breath meter, a flashlight, stamina and doors that shut
[*] Proof to find: what you turn up changes breakfast and decides which of three endings you get
[*] The house gets worse each night: night lights die, the drawing in the hall changes, the clock lies
[*] Every line is subtitled; Mom and Dad are fully voiced on moving day and the first morning
[*] Keyboard and mouse or a game controller, with rumble; the menus work from either
[*] Graphics presets from Low to Ultra, plus an Auto mode that holds the frame rate on laptops
[*] Steam Achievements
[/list]

[b]Headphones recommended. Contains jump scares, loud sudden sounds and flashing lights.[/b]
```

## System requirements

The desktop build is the web game inside Electron 45 (Chromium), so it needs what Chromium needs to run WebGL 2 at a steady frame
rate. The OS lines are Electron 45's own floor (macOS 13 Ventura or later; Linux distributions that are still maintained). The rest
are estimates from the render pipeline, not measurements: High adds HDR sky, ambient occlusion, bloom and soft shadows, and Low has
none of them. Steamworks has one block per OS; the lines are the same except where noted.

### Minimum

| | |
| --- | --- |
| OS | Windows 10 64-bit · macOS 13 (Ventura) · Ubuntu 22.04 or SteamOS 3 |
| Processor | Dual-core 2.0 GHz (Intel Core i3 / AMD equivalent) |
| Memory | 4 GB RAM |
| Graphics | Any GPU with WebGL 2 (OpenGL ES 3.0 / DirectX 11 class), 1 GB VRAM; Intel HD 4000 or newer |
| Storage | 500 MB available space |
| Sound | Stereo output; headphones recommended |
| Additional | 64-bit only. The Low and Medium presets are meant for integrated graphics. |

### Recommended

| | |
| --- | --- |
| OS | Windows 11 64-bit · macOS 14 or later · Ubuntu 22.04 or SteamOS 3 |
| Processor | Quad-core 3.0 GHz (Intel Core i5 / AMD Ryzen 5) |
| Memory | 8 GB RAM |
| Graphics | NVIDIA GTX 1060 / AMD RX 580 / Apple M1 or better, for High at 1080p60 |
| Storage | 500 MB on an SSD |
| Sound | Headphones |

## Content warnings (for the description and the Mature Content survey)

- Horror themes throughout: a child alone at night, something hunting them through the house.
- **Jump scares**, with loud sudden sounds (screams, stingers, slams). Headphones are recommended, which makes the loud parts louder.
- **Flashing lights / photosensitivity**: lights flicker and strobe (night lights, the bathroom light, TV static, white screen flashes
  on scares, a distorted colour "nightmare" effect on one night). Put the photosensitivity line on the store page and keep it on the
  title screen. Options → Reduce flashing softens them.
- Implied violence against the player character (it catches you: it lunges, a scream, a white flash and a cut to black; no injury is
  shown).
- One ending has it take the parents, on screen but abstract: it takes hold of each of them and pulls them down out of sight, with
  cracking and chewing sounds, then a red flash. No blood, wounds or bodies are shown. Nothing else in the game shows blood or injury.
- Mild language in the finale dialogue ("Jesus Christ"). No sexual content, no drugs, no gambling, no in-game purchases, no online
  interaction.

Mature Content survey (Steamworks → Store Page → Mature Content): tick *Frequent Violence or Gore*? No. Tick *General Mature
Content*: yes, describe as "Horror themes, jump scares, frightening imagery, flashing lights, implied violence; no gore." Steam then
shows the description above the store page for users with the horror filter on.

## AI-generated content disclosure

Steamworks asks about AI-generated content in the app's content survey (App Admin → Edit Store Page → Basic Info, the "AI Generated
Content" questions; the answer is shown on the store page). Answer truthfully from `CREDITS.md`:

- **Pre-generated content: yes.** The voice lines for Mom and Dad, the music tracks and the sound effects in `assets/sfx/` (the
  jump-scare stingers, the violins, the whispers and drones, the slams, thumps and scratches, the car going by, the waterphone and
  the music box; all but the brown-noise bed, which ffmpeg makes) were generated with ElevenLabs (`tools/gen_voice.py`,
  `tools/gen_music.py`, `tools/gen_sfx.py`) and are shipped as fixed audio files; the subtitles were written by hand. The trailers
  use the same files.
- **Live-generated content: no.** Nothing is generated while the game runs; there is no network use at all.
- Everything else (the 3D models, textures, sky, photographs, fonts, code) is listed in `CREDITS.md` with its licence and is not AI-generated.

Suggested disclosure text for the survey: "The parents' voice lines, the music and most of the sound effects were generated with
ElevenLabs and are shipped as fixed audio files. No content is generated at runtime."

## Supported input

| Input | Support | Notes |
| --- | --- | --- |
| Keyboard and mouse | Full | WASD / arrows, mouse look, E, Shift, Space, F, Esc |
| Game controller | Full (Xbox layout) | Left stick / d-pad move, right stick look, A or X interact (A also confirms on menus), RT / RB / L3 / B sprint, LT / LB / A hold your breath, Y flashlight, Start pause; rumble on scares. Read through the browser Gamepad API, so no Steam Input action set is needed; PlayStation pads work when Steam presents them as XInput. |
| Touch | Web build only | Not relevant to the Steam build |
| Steam Cloud | **Not supported** | Progress (one run per seed, the night you reached) is saved locally in the app's user-data folder |
| Steam Deck | Untested | Expect *Playable* at best until the Linux build has been tried on a Deck |

Store Page → Basic Info → Supported Features: tick *Single-player* and *Full Controller Support* (once the title, pause, death and
end screens are all confirmed usable from a pad; until then *Partial Controller Support*). The achievements are in the build
(`steam/achievements.json`); tick *Steam Achievements* once their icons exist.

## Languages

| Language | Interface | Full audio | Subtitles |
| --- | --- | --- | --- |
| English | yes | no | yes |

English only. Every line is subtitled. Moving day and the first morning are fully voiced; from the second morning on, most lines
play as a murmur under the subtitle, so leave Full audio unticked.

## Tags

Steam shows the first tags you apply most prominently; order them like this.

1. Horror
2. First-Person
3. Psychological Horror
4. Survival Horror
5. Singleplayer
6. Atmospheric
7. Indie
8. Short

Optional, if there is room and they are true at launch: Stealth, Dark, 3D, Story Rich, Controller, Linear (do not add *Procedural
Generation*: the nights are seeded and shuffled, not generated).

Genre (Basic Info): Indie, Adventure. Steam does not have a Horror genre; the Horror tag carries it.

## Age-rating notes

Steam requires its own Mature Content survey; official ratings are optional but free through the IARC questionnaire in Steamworks
(gives ESRB, PEGI, USK, ClassInd, ACB and GRAC in one go) and some regions and promotions need them. Answer it from the content list
above:

- Violence: horror and fear themes; the player character is caught by a monster (implied, cut to black); in one ending the monster
  takes the parents, pulled down out of sight with cracking and chewing sounds and a red flash, without blood, wounds or bodies.
- Scary content: frequent and intense for the genre (jump scares, a creature with glowing eyes that hunts a child).
- Language: mild, infrequent (one or two exclamations).
- Sex and nudity, drugs, alcohol, gambling, user-generated content, in-game purchases, user interaction, location sharing: none.

Don't put a rating on the page until the questionnaire returns one. Mark at least four screenshots as suitable for all ages: 02 (your
room), 03 (the drawing), 06 (breakfast) and 07 (the TV, with a man's back to you) have no creature in frame; 01, 04 and 05 show the
thing and can stay mature-only if the review asks.

## Before the page goes live

- Make the 64×64 achieved and unachieved achievement icons, then tick *Steam Achievements* in Supported Features.
- Try the system requirements on real hardware, and raise the minimum GPU if the Low preset can't hold 30 fps on it.
