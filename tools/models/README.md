# Rebuilding the character models

`assets/models/{dad,mom,spirit,anims}.glb` are made from Microsoft Rocketbox avatars plus Mixamo clips. This is how, so they can be remade or swapped:

1. `python3 fetch_rb.py <dir> Male_Adult_05 Female_Adult_01 Male_Adult_06` downloads each avatar's FBX and colour textures from the Rocketbox repo into `<dir>` (needs Python 3 and ffmpeg; textures are shrunk to 1024 px).
2. Put three.js (r170) at `three/` next to `export.html` (`npm pack three@0.170.0`), and `Xbot.glb` from `three.js/examples/models/gltf/` at `models/Xbot.glb`; link `<dir>` as `rb/`.
3. `node export.js <this folder> <out>` (needs Playwright) loads them in a headless browser, bakes the Xbot clips (idle, walk, run, agree, headShake, sneak, sad) onto the Rocketbox skeleton (`rblib.js`: matches each bone's rest direction, then copies the world rotation), and writes the four GLBs.

The game finds the bones by name (`Bip01_*`), so any Rocketbox adult works in place of the ones above.
