# Rebuilding the character models

`assets/models/{dad,mom,spirit,anims,grandpa}.glb` are made from Microsoft Rocketbox avatars plus Mixamo clips. This is how, so they can be remade or swapped:

1. `python3 fetch_rb.py <dir> Male_Adult_05 Female_Adult_01 Male_Adult_06 Male_Adult_03` downloads each avatar's FBX and colour textures from the Rocketbox repo into `<dir>` (needs Python 3 and ffmpeg; the body and head textures are shrunk to 1024 px, the hair-card opacity map to 512 px).
2. Put three.js (r170) at `three/` next to `export.html` (`npm pack three@0.170.0`), and `Xbot.glb` from `three.js/examples/models/gltf/` at `models/Xbot.glb`; link `<dir>` as `rb/`.
3. `node export.js <this folder> <out>` (needs Playwright) loads them in a headless browser, bakes the Xbot clips (idle, walk, run, agree, headShake, sneak, sad) onto the Rocketbox skeleton (`rblib.js`: matches each bone's rest direction, then copies the world rotation), and writes the five GLBs. Grandpa (`Male_Adult_03`, for the vigil) is built without his hair cards and carries one clip of his own, `sit`: a seated pose that `sit.js` fits to the vigil chair (seat top 0.485 m) at `setHeight(1.70)`, since the shared clips all stand.

The game finds the bones by name (`Bip01_*`), so any Rocketbox adult works in place of the ones above.

## The parents' body language (`assets/models/body.bin`)

The parents' clips come from Quaternius's Universal Animation Library 1 and 2 (CC0, the free "Standard" downloads from quaternius.com or itch.io). Put `UAL1_Standard.glb` and `UAL2_Standard.glb` (from each zip's `Unreal-Godot` folder) in one folder and run, from the repo root:

    node tools/models/body.cjs <that folder> [out] [--port N]

It opens `body.html` in headless Chromium (needs Playwright), bakes each clip in `JOBS` onto the Rocketbox skeleton (the same world-rotation copy as `rblib.js`, with the bone map for the UAL rig) and writes `assets/models/body.bin`: a JSON header and 16-bit quaternions. It prints, per clip, where the hips go, which hand is raised, and how the head and the front point through the clip, so a reader knows what a clip does without opening it.

### The clips

| name in the game | source | what it is for |
|---|---|---|
| `stand`, `talk`, `sit_idle`, `sit_talk`, `fold` | UAL1 `Idle_Loop`, `Idle_Talking_Loop`, `Sitting_Idle_Loop`, `Sitting_Talking_Loop`; UAL2 `Idle_FoldArms_Loop` | the everyday idle, talking, seated and folded arms (as before) |
| `Sitting_Enter` 1.30 s, `Sitting_Exit` 1.03 s | UAL1 | sitting down on a chair, getting up from it (the breakfast, Dad leaving the table) |
| `Walk_Carry_Loop` 2.00 s | UAL2 | a walk with a box carried on the hands (arms and torso only: laid over `walk`) |
| `Consume` 1.33 s | UAL2 | a bite or a sip, arms only, laid over the seated clips; the library eats with the left hand, so `Consume_m` eats with the right |
| `Yes` 2.50 s, `Idle_No_Loop` 2.50 s | UAL2 | a nod, a slow head shake |
| `Idle_TalkingPhone_Loop` 2.93 s | UAL2 | on the wall phone (the handset in the right hand; `_m` for the left) |
| `Idle_Rail_Call` 2.50 s | UAL2 | leaning on a rail and calling out (keeps its legs: the lean tips the pelvis) |
| `LayToIdle` 1.53 s | UAL2 | lying on the back to standing: the parents' sit-up in bed (see below) |
| `Idle_Torch_Loop` 1.27 s | UAL1 | a torch held up; the library holds it in the **left** hand, so Dad's torch in his right is `Idle_Torch_Loop_m` |
| `Interact` 2.00 s | UAL1 | a hand to a switch or a knob |
| `PickUp_Table` 0.83 s | UAL1 | taking something off a table |
| `Fixing_Kneeling` 5.20 s | UAL1 | down on the right knee at a repair (keeps its legs) |
| `Push_Loop` 2.67 s | UAL1 | pushing something heavy (keeps its legs) |

Every clip matching `talk|sit_idle|stand|fold|^(Consume|Yes|Idle_|Interact|PickUp_Table|LayToIdle)` also comes mirrored (`<name>_m`, left for right), made against the skeleton when it is bound.

### How `js/rig.js` loads them (`loadBody`)

- A **standing** clip keeps only the body above the hips' children: its legs are dropped and the parents stand on the idle's legs (people.js), so a clip's own stride never walks a foot into the stove. The pelvis track is kept, which is why a clip that leans from the hips must keep its legs instead (below): the idle's legs would swing off the floor behind the tipped pelvis.
- **`Consume`** keeps only its arms (clavicle to hand), to lay over `sit_idle`.
- **`sit_*`** are additive (the change from their first frame on an upright body) and also split into `_arms` clips, as before.
- **`Sitting_Enter`, `Sitting_Exit`, `LayToIdle`, `Fixing_Kneeling`, `Idle_Rail_Call`, `Push_Loop`** keep their legs, and carry the **hips' path** in `clip.userData = { hips, pelvis, fps }`: `hips` is `[x, y, z]` per `1/fps` s from `t = 0`, in millimetres from the rest pose, +z forward, for a rig whose pelvis rests `pelvis` metres over the floor. The bake keeps rotations only, so whoever plays such a clip moves the group by this path (scaled by their own pelvis height / `pelvis`, turned by their yaw) or the knees fold in the air. The path is the library rig's, lifted at bake time wherever a knee, an ankle or a toe joint of the Rocketbox skeleton would otherwise go under the floor (its legs are longer for its pelvis height than the library's: the kneel is lifted 6 cm), except while the body lies on its back or front.

  ```js
  // metres, turned by the person's yaw, for this person (PR: their pelvis height standing in the idle)
  const hipsAt = (who, name, t) => {
    const u = who.rig.clips[name].userData, H = u.hips, k = PR / u.pelvis, f = Math.min(H.length - 1, t * u.fps), i = Math.floor(f), s = f - i, a = H[i], b = H[Math.min(H.length - 1, i + 1)];
    return new V3((a[0] + (b[0] - a[0]) * s) * k / 1000, (a[1] + (b[1] - a[1]) * s) * k / 1000, (a[2] + (b[2] - a[2]) * s) * k / 1000).applyAxisAngle(UP, who.group.rotation.y);
  };
  who.group.position.copy(spot).add(hipsAt(who, 'Sitting_Exit', t));   // every frame
  ```

- The library's own standing idle is a wider, staggered stance than the game's (its right foot a step back). A leg-keeping clip that starts or ends in that stance (`Sitting_Enter` starts, `Sitting_Exit` ends, `Fixing_Kneeling` both, `LayToIdle` ends: the header's `stance` says where the hips rest in it) has that end **eased into the idle's legs** over 0.35 s, and its hips' path to nothing, so the crossfade to `stand` joins two matching poses and no foot slides.

### Where to play them (measured by `tests/contacts.js --only clips`)

- **The kitchen chair** (`Sitting_Enter` / `Sitting_Exit`): the painted chair's seat runs from 21 cm behind its holder to **26 cm in front** of it (`seatHeight` finds its top at 0.447). Stand the parent facing the table with the hips **13 cm in front of the seat's edge** (39 cm past the holder): any closer and the calves of the idle's stance are in the seat. The seated end of the clip then lands 28 cm behind (28 × their pelvis height / 0.916 m), i.e. **18–19 cm in front of `seatOn`'s spot** (the holder − 7 cm), with the hip joints a buttock's thickness over the seat (+0.2 cm Dad, −0.6 cm Mom against `sit()`'s seat + 9 cm). So: pull the chair back by that much as they stand (the scrape), or sit them that far forward; blend into `sit()` at the seated end.
- **The carry** (`Walk_Carry_Loop` at 0.97 over `walk`): the library carries a crate on upturned palms **42 cm apart at chest height**, fingers pointing in. A moving box (56 × 40 × 36 cm in the test) rides on the hands: palms rolled up and the fingers held flat and straight under it (`grip(..., up, 0, 1, true)` and the flat curl undone), its bottom a skin's thickness over the highest knuckle (the palms end up 4–5 cm under it, the fingers carrying it), its **back face just in front of the wrists' furthest reach** (21 cm out for Dad, as `carryPos` in main.js, 18 cm for Mom; a box set further back is cut by the forearms, which slope down from the elbows; the chest's front at that height is 3–7 cm behind that, the carry leaning the torso back), and it rolls with the hands' line as they rise and fall with the stride, 7.5° at most. A hand is counted off the box when its palm leaves the footprint or hangs more than 6 cm under the bottom.
- **The wall phone**: stand 62 cm west of `W.phone.pos` facing east; the handset hand is the right.
- **The kneel** (`Fixing_Kneeling`): on the open floor the lowest knee or ankle joint stays 5–7 cm over the floor through the clip (the knee's flesh on it).
- **The rail call and the push** (`Idle_Rail_Call`, `Push_Loop`): their hips sit 42 cm and 26 cm behind the standing spot (the lean), so the spot is that far behind the rail or the thing pushed.

### `LayToIdle` against the sleepers (`sleepers()`, main.js:336)

`sleepers()` lays the standing rig on its back by a group rotation `(−π/2, yaw, 0)` (order `YXZ`) at the bed's spot (y 0.74, the head toward the group's −z, which the bed's yaw turns to the headboard). The clip's first frame lies the body down itself, also on its back with the head toward the rig's −z, so its lying start is played with the group at **`(0, yaw, 0)` and `base = sleeperPelvis − (0, PR, 0) − hips[0] × k`** (PR the person's standing pelvis height, k = PR / 0.916): then the clip's pelvis starts where the sleeper's is, and against the sleeper's bones its lying start is **2 cm off at the head, 0 at the pelvis, 5 and 11 cm at the feet (the sleeper's toes are pointed), 10 and 20 cm at the hands** (the clip's arms lie a little out from the body). The torso comes up 28° by 0.27 s, 50° by 0.52 s, 57° by 0.78 s, 62° at 1.03 s, 77° at 1.28 s and stands at 1.53 s; the pelvis starts rising off the bed after 0.6 s.

Two things to know before swapping it in for the procedural sit-up:

1. **It gets up from a floor, not a bed.** Its feet end where its back was: played whole from the mattress the parent stands up *on the mattress* (the feet 72 cm over the floor). Use the first ~0.6 s (the sit-up, legs still on the bed) and swing the legs off the edge and stand with the procedural pose, or play the end with the group brought down to the floor beside the bed.
2. **The two lie 44 cm apart with the idle's 42 cm-wide stance,** so their inner hands and feet are 3–7 cm apart (between the bones) before anything moves. The sit-up pushes up on the arm away from the other sleeper (the library pushes on the left: `LayToIdle` for the parent whose partner is on their right, `LayToIdle_m` for the other), is laid out toward its own edge of the bed as far as the quilt's rolled edge allows the lying start (7 cm for Dad on the wall side, 9 cm for Mom; over the crossfade from the sleeping pose), and that side of the quilt is dropped (`W.bedSleepers.one(name, false)`). With that, no bone of the one getting up comes closer to the other's than the two already lie (the nearest is the resting arm pair, 3.3 cm, for Dad; 5.3 cm for Mom). A narrower sleeping stance would give it more room.

### The test

    node tests/contacts.js --only clips [--shots <dir>] [--port N]

`tests/contacts/clips.js` plays every new clip on Dad and on Mom where the game will (the chair, a box in the arms, the phone, the table's edge, the open floor, the bed), seven or so frames each, and checks the skinned body against the chair, the table, the box, the wall, the floor, the bed and the other sleeper; the numbers above are its report. `tests/contacts.js` merges every `tests/contacts/<file>.js` (an object of scene functions) into its scenes, so `--only` takes them like any other.
