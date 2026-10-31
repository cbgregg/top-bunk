// slims glTF models into the small meshopt-compressed GLBs in assets/props.
//   node tools/assets/slim_models.mjs [name ...]
//       cuts the triangle count of the Poly Haven props already in assets/props to their budget (textures untouched)
//   node tools/assets/slim_models.mjs --in model.gltf --out assets/props/name.glb [--tris 6000] [--tex 1024] [--keep regex] [--drop regex] [--list]
//       one downloaded model (tools/assets/fetch_sketchfab.py calls this): keeps only the nodes matching --keep (and not --drop),
//       converts spec-gloss materials, welds and simplifies to --tris triangles, resizes every texture to --tex px as WebP, meshopt-compresses
// install its tools first: cd tools && npm install
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, meshopt, metalRough, prune, simplify, textureCompress, weld, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));

const dir = path.join(here, '..', '..', 'assets', 'props');
// triangles each Poly Haven model may keep (everything else is already light)
const BUDGET = { plant1: 14000, plant2: 9000, cabinet: 14000, kettle: 5000, rock1: 6000, tree_small: 12000, grass1: 220, grass2: 200, rock2: 1200, pot: 4000 };

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const tris = (doc) => { let n = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; return n | 0; };
const kb = (f) => (fs.statSync(f).size / 1024) | 0;

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
if (argv.includes('--in')) {
  const src = opt('--in'), out = opt('--out'), budget = +opt('--tris', 8000), tex = +opt('--tex', 1024), keep = opt('--keep'), drop = opt('--drop');
  const doc = await io.read(src), root = doc.getRoot();
  if (argv.includes('--list')) {   // the node tree with mesh triangle counts, to pick --keep from
    const walk = (n, d) => { const m = n.getMesh(); console.log(' '.repeat(d * 2) + (n.getName() || '(unnamed)') + (m ? '  mesh ' + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0) : '')); n.listChildren().forEach((c) => walk(c, d + 1)); };
    for (const s of root.listScenes()) s.listChildren().forEach((n) => walk(n, 0));
    process.exit(0);
  }
  if (keep || drop) {   // a node stays when it or one of its ancestors matches --keep, and nothing on its ancestor line matches --drop
    const kre = keep && new RegExp(keep, 'i'), dre = drop && new RegExp(drop, 'i');
    const visit = (n, kept, dropped) => {
      const name = n.getName() || '';
      kept = kept || !kre || kre.test(name); dropped = dropped || (dre && dre.test(name));
      for (const c of n.listChildren()) visit(c, kept, dropped);
      if (n.getMesh() && (!kept || dropped)) n.setMesh(null);
    };
    for (const s of root.listScenes()) s.listChildren().forEach((n) => visit(n, false, false));
  }
  const before = tris(doc);
  await doc.transform(unpartition(), metalRough(), dedup(), prune(), flatten(), join(), weld());
  if (tris(doc) > budget) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: budget / tris(doc), error: 0.02, lockBorder: true }));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82 }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  for (const t of root.listTextures()) t.setName('');   // texture names carry the original file names
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  console.log(path.basename(out), before, '->', tris(doc), 'tris,', root.listTextures().length, 'textures,', kb(out), 'KB');
  process.exit(0);
}

const only = argv;
for (const [name, budget] of Object.entries(BUDGET)) {
  if (only.length && !only.includes(name)) continue;
  const f = path.join(dir, name + '.glb'); if (!fs.existsSync(f)) continue;
  const doc = await io.read(f), before = tris(doc);
  if (before <= budget) { console.log(name, before, 'ok'); continue; }
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: budget / before, error: 0.04, lockBorder: false }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(f, doc); console.log(name, before, '->', tris(doc), kb(f), 'KB');
}
