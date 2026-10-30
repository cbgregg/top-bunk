// Cuts the triangle count of the props in assets/props to a per-model budget (meshoptimizer simplification, textures untouched).
//   node tools/assets/slim_models.mjs [name ...]     (needs: npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'props');
// triangles each model may keep (everything else is already light)
const BUDGET = { plant1: 14000, plant2: 9000, cabinet: 14000, kettle: 5000, rock1: 6000, tree_small: 12000, grass1: 220, grass2: 200, rock2: 1200, pot: 4000 };

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const tris = (doc) => { let n = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; return n | 0; };
const only = process.argv.slice(2);
for (const [name, budget] of Object.entries(BUDGET)) {
  if (only.length && !only.includes(name)) continue;
  const f = path.join(dir, name + '.glb'); if (!fs.existsSync(f)) continue;
  const doc = await io.read(f), before = tris(doc);
  if (before <= budget) { console.log(name, before, 'ok'); continue; }
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: budget / before, error: 0.04, lockBorder: false }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(f, doc); console.log(name, before, '->', tris(doc), (fs.statSync(f).size / 1024) | 0, 'KB');
}
