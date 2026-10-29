# Top Bunk — Steam store copy

Everything on this page is pasted into Steamworks by hand (Store Page → Basic Info, → Description, → Supported Languages, → Mature
Content). Steam's description fields take a BBCode subset (`[h2]`, `[b]`, `[list]`/`[*]`); the "About this game" section below is
written in that subset so it can be pasted as-is. Nothing here claims a feature the game does not have; when the game changes, change
this file in the same commit.

Re-check before the page goes live (these depend on work that was in flight when this was written):

- **Endings.** The copy says only that the ending depends on where you are and whether anyone sees it. Today the finale has two
  outcomes ("They never believed you" if you are in bed when it comes; "They saw it. Then it had them." if you are not). The third,
  driving away at dawn ("They believed you"), exists in the code but is not reachable from the finale until the evidence work wires
  it up. Once it is, "Three endings" can go into the About text, the features list and `press-kit.md`.
- **Steam Achievements** is left unticked in Supported Features until the achievements work lands.
- **System requirements** are estimates from the render pipeline, not measurements; see that section.

## Short description

Steam limit: 300 characters. This one is 267.

> Your family just moved into a cheap old farmhouse. Something tall lives in the hallway, and it only comes at night. Ten nights, a top bunk, a flashlight and your own held breath. Nobody believes you. A short first-person horror game for keyboard, mouse or controller.

## About this game (long description, BBCode)

```
[b]The rent on the old farmhouse was cheap. Now we know why.[/b]

You are a kid. Your family has just moved into a rented farmhouse at the end of a gravel drive, and the landlord mentioned the last family left in a hurry. You get the top bunk in the back corner room, next to the bathroom. Somebody left a crayon drawing taped to the hallway wall: a tall black shape with huge white eyes and a big smile. It says HE WATCHES.

Then it is night, and you really, really need to pee.

[h2]Ten nights[/h2]
Top Bunk is a short first-person horror game played over ten nights in one house. Night one, the house wakes up: doors shut by themselves, the photo in the hall comes off the wall, every cabinet in the kitchen bangs at once, and something walks around your bunk while you hold your breath under the covers. From night two the house is yours to explore, a clock runs toward dawn, and the thing in the hallway is hunting you.

Every run has a seed, and the seed decides what each night is about. Among them: the phone ringing in the dining room in the small hours, the TV turning itself on with Dad standing in front of it, Mom calling you to the kitchen when Mom is asleep, the power going out with the breaker in the utility room, your bear turning up somewhere it should not be, a night where you cannot move at all, a drive to the store that is not a drive to the store, and a long vigil by candlelight. Survive the night and you get breakfast. Get caught and you do that night again.

[h2]Hide. Hold your breath.[/h2]
It is bigger than you and faster than you. You do not fight it. You run, you break its line of sight, and you hide: under the covers on the top bunk, in the louvered closet, in your parents' closet, behind the shower curtain. When it is close enough to hear you, you hold your breath, and the breath meter runs down while it stands there, tilts its head, and waits. Let go too early and it has you. Hold too long and your lungs give out.

You have a flashlight, two legs that get tired, doors you can shut behind you, and a house whose geography you had better learn fast.

[h2]The house[/h2]
A single-storey farmhouse from the early 2000s, built room by room: the brown carpet, the floral wallpaper, the white kitchen, the narrow hall of family photos, the box TV, the dining-room wall phone, the utility room with the breaker panel, the yard with the moving truck still parked on the gravel. Every night the house does a little more.

[h2]Nobody believes you[/h2]
Every morning you tell them at breakfast, and every morning they explain it away. The tap was running. The breaker was flipped. The bear was in the middle of the hall. Your parents notice the evidence the house leaves behind, and still they would rather believe it was you.

How it ends depends on where you are when it finally comes down the hall on the tenth night, and on whether anyone else is awake to see it.

[h2]Features[/h2]
[list]
[*] A short, focused horror story: ten nights, one house, one thing in the hallway
[*] Seeded runs: the same seed replays the same ten nights; a new seed shuffles what each night is about
[*] Hiding spots, a breath meter, a flashlight, stamina, and doors you can close
[*] A house that changes every night: night lights that die, a drawing that changes, a clock that lies
[*] Mom and Dad are voiced, with subtitles always on
[*] Keyboard and mouse or a game controller, with rumble
[*] Graphics presets from Low to Ultra, with an Auto mode that keeps the frame rate up on ordinary laptops
[/list]

[b]Headphones recommended. Contains jump scares, loud sudden sounds and flashing lights.[/b]
```

## System requirements

The desktop build is the web game inside Electron (Chromium), so what it needs is what Chromium needs to run WebGL 2 at a steady
frame rate. These are working estimates from the render pipeline (HDR sky, ambient occlusion, bloom, soft shadows on High; none of
that on Low): check them on real hardware before the page goes live, and raise the GPU line if the Low preset does not hold 30 fps
on it. Steamworks has one block per OS; the lines are the same except where noted.

### Minimum

| | |
| --- | --- |
| OS | Windows 10 64-bit · macOS 11 (Big Sur) · Ubuntu 20.04 or SteamOS 3 |
| Processor | Dual-core 2.0 GHz (Intel Core i3 / AMD equivalent) |
| Memory | 4 GB RAM |
| Graphics | Any GPU with WebGL 2 (OpenGL ES 3.0 / DirectX 11 class), 1 GB VRAM; Intel HD 4000 or newer |
| Storage | 500 MB available space |
| Sound | Stereo output; headphones recommended |
| Additional | 64-bit only. The Low and Medium presets are meant for integrated graphics. |

### Recommended

| | |
| --- | --- |
| OS | Windows 11 64-bit · macOS 13 · Ubuntu 22.04 or SteamOS 3 |
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
  title screen.
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

- **Pre-generated content: yes.** The voice lines for Mom and Dad and the music tracks were generated with ElevenLabs
  (`tools/gen_voice.py`, `tools/gen_music.py`) and are shipped as fixed audio files; the subtitles were written by hand.
- **Live-generated content: no.** Nothing is generated while the game runs; there is no network use at all.
- Everything else (the 3D models, textures, sky, photographs, fonts, code) is listed in `CREDITS.md` with its licence and is not AI-generated.

Suggested disclosure text for the survey: "The parents' voice lines and the music were generated with ElevenLabs and are shipped as
fixed audio files. No content is generated at runtime."

## Supported input

| Input | Support | Notes |
| --- | --- | --- |
| Keyboard and mouse | Full | WASD / arrows, mouse look, E, Shift, Space, F, Esc |
| Game controller | Full (Xbox layout) | Left stick / d-pad move, right stick look, A or X interact (A also confirms on menus), RT / RB / L3 / B sprint, LT / LB / A hold your breath, Y flashlight, Start pause; rumble on scares. Read through the browser Gamepad API, so no Steam Input action set is needed; PlayStation pads work when Steam presents them as XInput. |
| Touch | Web build only | Not relevant to the Steam build |
| Steam Cloud | **Not supported** | Progress (one run per seed, the night you reached) is saved locally in the app's user-data folder |
| Steam Deck | Untested | Expect *Playable* at best until the Linux build has been tried on a Deck |

Store Page → Basic Info → Supported Features: tick *Single-player* and *Full Controller Support* (once the title, pause, death and
end screens are all confirmed usable from a pad; until then *Partial Controller Support*). Tick *Steam Achievements* only when the
achievements work lands.

## Languages

| Language | Interface | Full audio | Subtitles |
| --- | --- | --- | --- |
| English | yes | yes | yes |

No other languages. The voice lines are English only; subtitles are always on.

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
above, truthfully:

- Violence: horror and fear themes; the player character is caught by a monster (implied, cut to black); in one ending the monster
  takes the parents, pulled down out of sight with cracking and chewing sounds and a red flash, without blood, wounds or bodies.
- Scary content: frequent and intense for the genre (jump scares, a creature with glowing eyes that hunts a child).
- Language: mild, infrequent (one or two exclamations).
- Sex and nudity, drugs, alcohol, gambling, user-generated content, in-game purchases, user interaction, location sharing: none.

Expected outcome is in the Teen / PEGI 16 range because of the horror intensity rather than any explicit content; do not state a
rating on the page until the questionnaire has returned one. Mark at least four of the eight screenshots as suitable for all ages:
02 (your room), 03 (the drawing), 06 (breakfast) and 08 (the TV, with a man's back to you) have no creature in frame and are the
safe choices; 01, 04, 05 and 07 show the thing and can stay mature-only if the review asks.
