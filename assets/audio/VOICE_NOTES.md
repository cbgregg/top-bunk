# The recordings: what was made, how it was checked, what to listen for

Every spoken line lives in `lines.json` (`say` is what the voice reads, with an acting direction in brackets that is never spoken;
`html` is the subtitle). `tools/gen_voice.py` records them with ElevenLabs (Dad is Jerry B, Mom is Andrea, the newsreader, the
cartoon's announcer); `tools/voice_lint.js` holds `lines.json`, the files under `vo/` and `vo/takes.json` (the text each take was
made from) to the id list in `tests/voice_ids.json`, and runs the register check over every line. The kid is never voiced.

## The three waves

| Wave | What | Ids | Command |
|---|---|---|---|
| 1 | the spine of nights three to nine, the mornings, moving day's rules and dinner, the chain at the front door, ending C, the sixteen re-takes | 116 | `python3 tools/gen_voice.py --wave 1` |
| 2 | the morning after each beat (one line each) | 33 | `--wave 2` |
| 3 | endings A and B, the cartoon's two reworded lines, the breakfast radio and its night-nine item | 10 | `--wave 3` |

A wave's id is made when its file is missing or when the line's text has changed since its take, so a replaced line is always
re-recorded and an untouched one never is. The six orphaned takes (`dad/n2_a`, `mom/n2_a`, `mom/n3_a`, `dad/n3_a`, `dad/lure_a`,
`dad/lure_b`) were kept as they were; `dad/f_a` and `mom/f_a` (the shouted finale) are gone; `you/m9_a` is gone and `dad/m9_b`
carries the reason to stay. The lines the parents mutter through the wall are recorded dry and muffled at play time.

## The listening pass

This pass was done on a machine with no speakers, so it is a measured pass, not a heard one: every take was decoded and measured
(length, words per second, pitch and how far it wanders in semitones, integrated loudness) and every take was transcribed by a
speech-to-text model and compared word for word with its line. The first person with headphones should play wave 1 from
`dad/n3_b` to `dad/n3_f`, `mom/n5_a` to `mom/n5_e`, the morning-six landlord exchange and the ending-C lines, and the three
doubles below, before anything else. What the numbers say:

- **Flat, not sitcom.** Over the 159 takes the pitch wanders by a median 2.6 semitones (Dad) and 2.8 (Mom), never more than 4.8;
  the takes that were already in the game and read as the model for the register (`dad/m1_a`, `mom/m1_a`, `mom/landlord`) sit at
  2.6 to 3.9. Pace is a median 3.1 words a second for both parents (the existing takes: 2.9 to 4.2). Loudness is matched at
  -16 LUFS across the set (the parents' takes land between -19 and -16; the voice tool matches them before the room).
- **Every line says its words.** The transcript matched the line on 143 of 159 takes at the first pass. The rest were either the
  transcriber (a number read as a clock time, a one-word take it could not place: `Bud.`, `Huh.`, `Bulb.`; those were checked on the
  waveform, one burst each, and `Huh.` is an exhale, which is what the line is) or the voice model, which on a short line sometimes
  says the vocative twice or reads its neighbour's line as well. Those were re-recorded until the transcript matched:
  `mom/n5_g`, `mom/n5_h` (the two search calls now read alone, not as a pair), `dad/n_bed` (its direction is now "flat, tired":
  "without turning" made him say it twice), `gramps/v_b`, `dad/n3_d` (the first take said "each chair"), and `dad/f_c`, which
  echoed whatever stood beside it ("Yes.", then "I see it") and then doubled its "Bud" under the direction "not looking away";
  it is now read with no context and the direction "quiet", and says its six words once.
- **The real Mom's search** (`mom/n5_g`, `mom/n5_h`) is flat and worried, 1.7 to 2.3 words a second with the pause after "Bud";
  night one's `mom/n1_call_a`/`b` keep their sweet take and are not touched.

## The doubles (the thing with a parent's voice)

`mom/mimic_b` (the call to the kitchen), `mom/under_a` (Mom's voice from the bottom bunk) and `gramps/v_b` (Grandpa in the vigil
chair) are read at 0.85 of the voice's speed and then pitched two semitones down after the room with a formant-preserving shift
(ffmpeg's rubberband), and matched to -16 LUFS again. Measured against the real takes:

| Take | Pitch | Pace | Spread |
|---|---|---|---|
| Mom, real (`mimic_a`, `n1_call_a`, `m1_a`) | 240 to 245 Hz | 2.9 to 3.0 w/s | 2.8 to 3.9 st |
| `mom/mimic_b` double | 172 Hz | 3.4 w/s (a longer line, no pauses) | 2.0 st |
| `mom/under_a` double | 188 Hz | 1.7 w/s | 2.2 st |
| Grandpa, real (`v_a`) | 100 Hz | 3.6 w/s | 3.9 st |
| `gramps/v_b` double | 81 Hz | 3.6 w/s | 2.0 st |

The doubles end up four to six semitones under the real voice: two from the shift and the rest from the direction ("soft, patient";
"sleepy, gentle"; "low, wet, not quite his voice"), which the model lowers on its own. The shift itself is small enough that the
formant-preserving method leaves no chorus or chipmunk edge in the measurement (the pitch wander stays at 2 semitones, the same
band as a real take), so the treatment is **kept**. If on headphones it reads as a pitch-shift effect rather than a wrong voice,
the fallback the design names is one command: `DOUBLE_FALLBACK=1 python3 tools/gen_voice.py --only vo/mom/mimic_b,vo/mom/under_a,vo/gramps/v_b --force`
(rate 0.9, no shift; the direction tags carry the rest). `mom/mimic_a` and `mom/mimic_c` are older takes with the slow, wrong
delivery in the direction only and were not re-made.

## What the lint holds

`node tools/voice_lint.js` exits 0 when every id in `tests/voice_ids.json` has a voice, a `say`, an `html` and an mp3 the manifest
lists, made from the line's current text; when the orphans are kept, the shouted lines are gone and the kid's lines have no
recording; and when no spoken line says "ghost", "monster", "haunted", "JESUS", "OH MY GOD", "mister" (Mister Buttons is a name),
"raising the rent" or "back room" (the two takes whose direction says "haunted", `dad/m5_a` and `mom/t_parents`, pass, since the
direction is never spoken; `you/m2_b` is the kid's one "monster"). `--wave 1` lets the later waves stay unrecorded while the
first is checked.
