// the thing's face, built in code to the shapes of a 0.22 m sphere scaled 0.95, 1.2, 0.9 with two flattened spheres for eyes and a
// grin on a cylinder: the skull runs down into the neck, the eyes sit in sockets, the grin is cut into the head with the teeth inside
import * as THREE from 'three';

// face space: origin at the skull centre, metres, +y up, +z out of the face, +x the face's left
const RX = 0.209, RY = 0.264, RZ = 0.198;
// the eyes as flattened spheres (centre, semi-axes, roll about +z) and the point on each where its pupil rests
const EYES = [
  { c: [-0.092, 0.075, 0.172], r: [0.0703, 0.10212, 0.03108], roll: 0.32, pupil: [-0.092, 0.075, 0.212] },
  { c: [0.092, 0.063, 0.172], r: [0.075924, 0.11029, 0.033566], roll: -0.32, pupil: [0.092, 0.075, 0.212] },
];
// each eye covers the patch of skull its sphere hides as seen from VIEW (the player 1.8 m off, the head turned to them), eye and skull
// points meeting in the plane z = PLANE_Z; a patch on the skull reads smaller than a sphere standing off it, so EYE_GROW. Where the
// skull faces VIEW less than EYE_EDGE (about 20 degrees short of its edge) the outline is cut, so no ring crosses the head's outline
// from nearby angles either
const VIEW_Y = -0.148, VIEW_Z = 1.8, PLANE_Z = 0.172, EYE_GROW = 1.08, EYE_EDGE = 0.32;
const PUPIL_K = 1.075, PUPIL_NEAR = 0.08;   // the pupils a little over the spheres' size, and nearer, as the spheres sat
const EYE_GLOW = 1.85, GRIN_GLOW = 1.18, WARM = new THREE.Color(1, 0.86, 0.7);   // warm: what the teeth light the mouth with
// the neck: a capsule from low in the skull down into the chest, thin under the jaw and filling out toward the shoulders, joined to
// the skull with a small fillet (k round the back, kChin under the chin)
const NECK = { a: [-0.17, -0.03], b: [-0.50, -0.12], ra: 0.042, rb: 0.085, k: 0.03, kChin: 0.02, end: -0.46, sx: 1.0 };

const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- the skull and neck as a distance field ----------
function sdSkull(x, y, z) {
  const kx = x / RX, ky = y / RY, kz = z / RZ, k0 = Math.sqrt(kx * kx + ky * ky + kz * kz);
  return k0 * (k0 - 1) / Math.sqrt(kx * kx / (RX * RX) + ky * ky / (RY * RY) + kz * kz / (RZ * RZ));
}
function sdNeck(x, y, z) {
  const [ay, az] = NECK.a, [by, bz] = NECK.b, dy = by - ay, dz = bz - az;
  const px = x / NECK.sx, py = y - ay, pz = z - az;
  const t = Math.min(1, Math.max(0, (py * dy + pz * dz) / (dy * dy + dz * dz)));
  const qy = py - dy * t, qz = pz - dz * t;
  return Math.sqrt(px * px + qy * qy + qz * qz) - lerp(NECK.ra, NECK.rb, t);
}
function sdf(x, y, z, neck) {
  const e = sdSkull(x, y, z);
  if (!neck) return e;
  const n = sdNeck(x, y, z), k = lerp(NECK.k, NECK.kChin, ss(-0.06, 0.04, z)), h = Math.max(k - Math.abs(e - n), 0) / k;
  return Math.min(e, n) - h * h * k * 0.25;
}
// where the rings are centred: the skull's axis down past the widest grin (so the mouth matches with or without a neck), then the neck's
const ringZ = (y, neck) => (neck ? lerp(NECK.a[1], NECK.b[1], Math.min(1, Math.max(0, (y - NECK.a[0]) / (NECK.b[0] - NECK.a[0])))) * ss(-0.235, -0.29, y) : 0);
// distance along the level ray at height y and azimuth a (atan2(x, z)) to the surface: off the skull alone where the neck is too far
// to matter, else marched on the blended field
function rayR(a, y, neck) {
  const sa = Math.sin(a), ca = Math.cos(a), zc = ringZ(y, neck);
  const A = (sa / RX) ** 2 + (ca / RZ) ** 2, B = 2 * zc * ca / (RZ * RZ), C = (y / RY) ** 2 + (zc / RZ) ** 2 - 1, D = B * B - 4 * A * C;
  if (D >= 0 && C < 0) {
    const t = (-B + Math.sqrt(D)) / (2 * A);
    if (!neck || sdNeck(t * sa, y, zc + t * ca) > NECK.kChin * 1.05) return t;
  } else if (!neck) return 0;
  let lo = 0, hi = 0.02;
  while (sdf(hi * sa, y, zc + hi * ca, neck) < 0 && hi < 0.6) { lo = hi; hi += 0.02; }
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (sdf(m * sa, y, zc + m * ca, neck) < 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function basePoint(a, y, neck, out) {
  if (y >= RY) return out.set(0, RY, 0);
  if (!neck && y <= -RY) return out.set(0, -RY, 0);
  const r = rayR(a, y, neck);
  return out.set(r * Math.sin(a), y, ringZ(y, neck) + r * Math.cos(a));
}
// a point (face space) within reach outside the neck is drawn in toward it, the nearest to just inside its surface, and its normal n
// turned toward the neck's by as much: the shirt collar, which would otherwise stand off the neck as a ring. Eases off toward the
// neck's open end in the chest
export function tuckIntoNeck(p, n = null, reach = 0.13, inset = 0.016) {
  if (p.y > -0.12 || p.y < NECK.end || sdf(p.x, p.y, p.z, true) > reach) return false;
  const zc = ringZ(p.y, true), a = Math.atan2(p.x, p.z - zc), R = rayR(a, p.y, true), d = Math.hypot(p.x, p.z - zc) - R;
  if (d <= 0 || d >= reach) return false;
  const t = d / reach, k = ss(NECK.end, NECK.end + 0.07, p.y);
  const r = R + d - k * (d - d * t * t * t * (4 - 3 * t) + inset * (1 - t));   // meets the untouched shirt at reach without a crease
  p.x = Math.sin(a) * r; p.z = zc + Math.cos(a) * r;
  if (n) n.lerp(baseNormal(p, true, new THREE.Vector3()), (1 - t) * (1 - t) * (3 - 2 * (1 - t)) * k).normalize();
  return true;
}
function baseNormal(p, neck, out) {
  const { x, y, z } = p;
  if (!neck || sdNeck(x, y, z) > NECK.kChin * 1.05) return out.set(x / (RX * RX), y / (RY * RY), z / (RZ * RZ)).normalize();
  const e = 1e-4;
  return out.set(sdf(x + e, y, z, neck) - sdf(x - e, y, z, neck), sdf(x, y + e, z, neck) - sdf(x, y - e, z, neck), sdf(x, y, z + e, neck) - sdf(x, y, z - e, neck)).normalize();
}

// ---------- the grin ----------
// the grin's outline on its cylinder (radius 0.218, 0.93 of that deep, 0.17 m tall centred 0.085 m down, +-1.32 rad), in rows of a
// 256-row strip over columns 18..1006 of 1024. a wider smile (smileScale above 1) stretches it round the head and taller about its middle
const G = { r: 0.218, rz: 0.218 * 0.93, th: 1.32, top: -0.005, h: 0.16 * 1.06, mid: -0.085 };
// the hooked ends climb higher as it widens, so the widest grin still runs up the side of the head
const grinPx = (t, w = 1) => { const s = Math.sin(t * Math.PI), hk = Math.pow(Math.abs(t - 0.5) * 2, 7) * 18 * (1 + (w - 1) * 1.6); return [22 + s * 78 - hk, 22 + s * 205 - hk]; };
const wideK = (s) => 1 + (s - 1) * 0.5, tallK = (s) => 1 + (s - 1) * 1.7;
const azOf = (th, s) => Math.atan2(G.r * Math.sin(th), G.rz * Math.cos(th)) * wideK(s);
const yOf = (px, s) => G.mid + (G.top - px / 256 * G.h - G.mid) * tallK(s);
function grinAt(a, s) {
  const a1 = a / wideK(s), th = Math.abs(a1) < Math.PI / 2 ? Math.atan2(G.rz * Math.sin(a1), G.r * Math.cos(a1)) : Math.sign(a1) * 2;
  const t = ((th + G.th) / (2 * G.th) * 1024 - 18) / 988;
  const [p0, p1] = t >= 0 && t <= 1 ? grinPx(t, s) : [4, 4];
  const yt = yOf(p0, s), yb = yOf(p1, s), past = t < 0 ? -t : t > 1 ? t - 1 : 0, lip = 1 - ss(0, 0.035, past);
  // f: how far the mouth opens; it stays a little open out to the corners and just past them, so each ends in a dark notch
  return { yt, yb, h: yt - yb, f: Math.max(ss(0.002, 0.03, yt - yb), 0.45 * lip), lip, cheek: 1 - ss(0, 0.3, past) };
}
// how far to push the skull point b out, level from the axis, at smile s: the jaw comes out most of the way to where the grin cylinder
// stood, easing off over a band above and below the lips and past the corners, and not round the eyes (eye: how far from the nearer
// one, in its radii). short under the lower lip, so the chin falls back and narrows into the neck
function muzzle(b, g, s, eye = 9) {
  const a = Math.atan2(b.x, b.z), cx = G.r * (1 + (s - 1) * 0.8), rc = 1 / Math.sqrt((Math.sin(a) / cx) ** 2 + (Math.cos(a) / G.rz) ** 2);
  const side = ss(0.5, 1.3, Math.abs(a)), k = lerp(0.58, 0.8, side) * ss(1.2, 1.6, eye);
  const above = lerp(0.035, 0.06, side), below = lerp(0.03, 0.045, side);
  return Math.max(0, rc - Math.hypot(b.x, b.z)) * k * g.cheek * ss(g.yt + above, g.yt + 0.004, b.y) * ss(g.yb - below, g.yb - 0.01, b.y);
}
function pushOut(b, d) { const r = Math.hypot(b.x, b.z); if (r > 1e-6) { b.x += b.x / r * d; b.z += b.z / r * d; } return b; }
// down one column through the mouth: [y, depth into the head, glow from inside] at the ten points the rows are splined through.
// the lips open a few millimetres wider than the teeth, so a dark edge of the inside shows round them
const LW = 0.01;
function mouthPath(g, open) {
  const h = Math.sqrt(g.h * g.h + 1.6e-5), cy = (g.yt + g.yb) / 2, yt = cy + h / 2, yb = cy - h / 2;   // never quite closed, so no row lands on another
  const f = open ? g.f : 0, m = 0.004 * f, rd = open ? 0.0028 * g.lip : 0, e = 0.002 * f, dIn = 0.016 * f, dBk = 0.034 * f, ot = yt + m, ob = yb - m;
  return [[ot + LW, 0, 0], [ot + 0.45 * LW, -rd, 0], [ot, e, 0.2], [yt + 0.5 * m - 0.02 * h, dIn, 0.8], [yt - 0.32 * h, dBk, 0.45],
    [yb + 0.32 * h, dBk, 0.45], [yb - 0.5 * m + 0.02 * h, dIn, 0.8], [ob, e, 0.2], [ob - 0.45 * LW, -rd, 0], [ob - LW, 0, 0]].map((p) => [p[0], p[1], p[2] * f]);
}
const SEG = [2, 2, 2, 2, 3, 2, 2, 2, 2];   // rows per stretch of that path (19 in all, after its first point)
// centripetal catmull-rom through the path points (y, depth), so the lip edges come out rounded
function spline(P, i, u) {
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
  const d = (p, q) => Math.max(1e-6, Math.sqrt(Math.hypot(q[0] - p[0], q[1] - p[1])));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), t = lerp(t1, t2, u);
  const out = [0, 0, lerp(p1[2], p2[2], u)];
  for (let k = 0; k < 2; k++) {
    const a1 = t1 === t0 ? p1[k] : (t1 - t) / (t1 - t0) * p0[k] + (t - t0) / (t1 - t0) * p1[k];
    const a2 = (t2 - t) / (t2 - t1) * p1[k] + (t - t1) / (t2 - t1) * p2[k];
    const a3 = t3 === t2 ? p2[k] : (t3 - t) / (t3 - t2) * p2[k] + (t - t2) / (t3 - t2) * p3[k];
    const b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2, b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
    out[k] = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2;
  }
  return out;
}

// ---------- the eye outlines ----------
// how far along the ray o + t d it first enters an ellipsoid (centre c, semi-axes r, turned by roll about z); Infinity if it misses
function enter(o, d, c, r, roll = 0) {
  const cs = Math.cos(roll), sn = Math.sin(roll), ox = o[0] - c[0], oy = o[1] - c[1];
  const p = [(ox * cs + oy * sn) / r[0], (-ox * sn + oy * cs) / r[1], (o[2] - c[2]) / r[2]];
  const v = [(d[0] * cs + d[1] * sn) / r[0], (-d[0] * sn + d[1] * cs) / r[1], d[2] / r[2]];
  const A = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], B = 2 * (p[0] * v[0] + p[1] * v[1] + p[2] * v[2]), C = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - 1;
  const D = B * B - 4 * A * C;
  return D < 0 ? Infinity : (-B - Math.sqrt(D)) / (2 * A);
}
const SKULL_C = [0, 0, 0], SKULL_R = [RX, RY, RZ];
// a plane point in an eye's own frame, scaled by its semi-axes (the old sphere's outline is the unit circle)
function eyeLocal(e, px, py) {
  const dx = px - e.c[0], dy = py - e.c[1], c = Math.cos(e.roll), s = Math.sin(e.roll);
  return [(dx * c + dy * s) / e.r[0], (-dx * s + dy * c) / e.r[1]];
}
function eyePlane(e, lx, ly) {
  const x = lx * e.r[0], y = ly * e.r[1], c = Math.cos(e.roll), s = Math.sin(e.roll);
  return [e.c[0] + x * c - y * s, e.c[1] + x * s + y * c];
}
const NOUT = 240, VIEW_FROM = [0, VIEW_Y, VIEW_Z];
// a point on to the plane as seen from the view point, and the ray from there through a plane point (t = 1 on the plane)
const toPlane = (x, y, z) => { const s = (VIEW_Z - PLANE_Z) / (VIEW_Z - z); return [x * s, VIEW_Y + (y - VIEW_Y) * s]; };
const viewRay = (px, py) => [VIEW_FROM, [px, py - VIEW_Y, PLANE_Z - VIEW_Z]];
// how squarely the skull at p faces the view point (1 head on, 0 edge on)
function facing(p) {
  const nx = p.x / (RX * RX), ny = p.y / (RY * RY), nz = p.z / (RZ * RZ), dx = p.x - VIEW_FROM[0], dy = p.y - VIEW_FROM[1], dz = p.z - VIEW_FROM[2];
  return -(nx * dx + ny * dy + nz * dz) / (Math.hypot(nx, ny, nz) * Math.hypot(dx, dy, dz));
}
// each eye's outline (how far out from its centre, by angle in its frame): out to where its sphere goes behind the skull, grown by
// EYE_GROW, and cut where the skull turns away from the view point. the cut and the corners where the sphere met the skull are then
// smoothed round the angle, so each eye is a plain oval, only shorter on the side that turns away
for (const e of EYES) {
  const p = { x: 0, y: 0, z: 0 };
  const radius = (a, turned) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    const seen = (m) => {
      const [o, d] = viewRay(...eyePlane(e, m * ca, m * sa)), te = enter(o, d, e.c, e.r, e.roll), ts = enter(o, d, SKULL_C, SKULL_R);
      if (!turned) return te < Infinity && te <= ts;
      if (ts === Infinity) return false;
      p.x = o[0] + d[0] * ts; p.y = o[1] + d[1] * ts; p.z = o[2] + d[2] * ts;
      return facing(p) > EYE_EDGE;
    };
    // walked out from the centre to the first point not seen, then narrowed down
    let lo = 0, hi = 0.025;
    while (hi < 1.5 && seen(hi)) { lo = hi; hi += 0.025; }
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (seen(m)) lo = m; else hi = m; }
    return lo;
  };
  const full = [], cut = [], raw = [];
  for (let j = 0; j < NOUT; j++) { const a = j / NOUT * Math.PI * 2, f = radius(a, false) * EYE_GROW; full.push(f); cut.push(Math.min(1, radius(a, true) / Math.max(1e-6, f))); }
  // how much of each radius the cut keeps, worn down by a wide parabola first, so smoothing does not pull the cut back out
  for (let j = 0; j < NOUT; j++) {
    let keep = 1;
    for (let i = 0; i < NOUT; i++) { const da = Math.min(Math.abs(i - j), NOUT - Math.abs(i - j)) / NOUT * Math.PI * 2; keep = Math.min(keep, cut[i] + 0.2 * da * da); }
    raw.push(full[j] * keep);
  }
  e.out = new Float32Array(NOUT);
  const SIG = 0.22 / (Math.PI * 2) * NOUT, W = Math.ceil(SIG * 3);
  for (let j = 0; j < NOUT; j++) {
    let s = 0, w = 0;
    for (let i = -W; i <= W; i++) { const k = Math.exp(-0.5 * (i / SIG) ** 2); s += raw[(j + i + NOUT) % NOUT] * k; w += k; }
    e.out[j] = s / w;
  }
}
const outAt = (e, a) => { const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * NOUT, i = Math.floor(f) % NOUT; return lerp(e.out[i], e.out[(i + 1) % NOUT], f - Math.floor(f)); };
// a plane point in the eye's frame, scaled so its outline is the unit circle
function eyeQ(e, px, py) { const [lx, ly] = eyeLocal(e, px, py), s = outAt(e, Math.atan2(ly, lx)); return [lx / s, ly / s]; }
// the same for a skull point, pushed outside where the skull turns away from the view point (just past the edge of the head as seen
// from there it would land back inside the outline)
function eyeQAt(e, p) { const [qx, qy] = eyeQ(e, ...toPlane(p.x, p.y, p.z)), s = 1 + 25 * Math.max(0, 0.05 - facing(p)); return [qx * s, qy * s]; }
const eyeR = (e, p) => Math.hypot(...eyeQAt(e, p));
// the pupils at rest, their radii and how far they move, all on the plane
const PK = (VIEW_Z - PLANE_Z) / (VIEW_Z - EYES[0].pupil[2]), PUPIL_AT = EYES.map((e) => toPlane(...e.pupil));
const PUPIL_R = [0.05 * PK * PUPIL_K, 0.056 * PK * PUPIL_K], PUPIL_MOVE = [0.022 * PK, 0.04 * PK];
// and back: the skull point under (qx, qy) of an eye; a ray that misses the skull takes the skull's edge nearest it
function eyeOnSkull(e, qx, qy, out) {
  const s = outAt(e, Math.atan2(qy, qx)), [o, d] = viewRay(...eyePlane(e, qx * s, qy * s));
  const t = enter(o, d, SKULL_C, SKULL_R);
  if (t < Infinity) return out.set(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
  const p = o.map((x, i) => x / SKULL_R[i]), v = d.map((x, i) => x / SKULL_R[i]);
  const tc = -(p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) / (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  out.set(p[0] + v[0] * tc, p[1] + v[1] * tc, p[2] + v[2] * tc).normalize();
  return out.set(out.x * RX, out.y * RY, out.z * RZ);
}

// ---------- the eye sockets ----------
const SOCKET = 0.024, RIM = 0.0045;
// how far the skin at (x, y, z) is pushed in (positive) or raised (negative) by the sockets, how much of that it keeps (front: none
// round the back, less where the skull turns away), how far it is from the nearer eye in that eye's radii, and where it lies in each
// eye's frame (for the shader). the rim round each socket stands up a little more above the eye, as a brow
function sockets(x, y, z) {
  const p = { x, y, z }, front = ss(0.0, 0.035, z) * sinkK(p), q = [];
  let d = 0, raise = 0, near = 9;
  for (const e of EYES) {
    const [qx, qy] = eyeQAt(e, p), r = Math.hypot(qx, qy);
    // the wall starts outside the white: a facet cutting across the ring would flatten it
    d += SOCKET * (1 - ss(1.02, 1.16, r));
    raise = Math.max(raise, RIM * Math.exp(-(((r - 1.25) / 0.11) ** 2)) * (1 + 0.25 * Math.max(0, qy / Math.max(r, 1e-6))));
    near = Math.min(near, r);
    q.push(qx, qy);
  }
  return [(d - raise) * front, front, front > 0 ? near : 9, q];
}
// sockets and eyes sink mostly along the line of sight from the view point, so they keep their outline, tipped toward -n near the edge
function sinkDir(p, n, out) { return out.set(p.x - VIEW_FROM[0], p.y - VIEW_FROM[1], p.z - VIEW_FROM[2]).normalize().addScaledVector(n, -0.3).normalize(); }
// how much of their depth they keep at p: near the edge of the head that line runs nearly along the skin
const sinkK = (p) => ss(0.12, 0.42, facing(p));

// ---------- the head mesh ----------
const NC = 192, N_UP = 84, N_LO = 50, N_LO_CAP = 40;
// column azimuths: dense across the face and the widest grin, sparse round the back
const COLS = (() => {
  const dens = (a) => 0.26 + 0.74 * (1 - ss(1.0, 1.25, Math.abs(a))) + 0.5 * (1 - ss(1.85, 2.15, Math.abs(a))) * ss(1.0, 1.25, Math.abs(a));
  const N = 4000, cum = [0];
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + dens(-Math.PI + (i - 0.5) / N * 2 * Math.PI));
  const out = [];
  for (let c = 0, j = 0; c < NC; c++) {
    const want = (c + 0.5) / NC * cum[N];
    while (cum[j + 1] < want) j++;
    out.push(-Math.PI + (j + (want - cum[j]) / (cum[j + 1] - cum[j])) / N * 2 * Math.PI);
  }
  return out;
})();
// resample a polyline of points at n even steps of arc length (the first point is left out, the last kept)
function resample(pts, n) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const out = [];
  for (let k = 1, i = 0; k <= n; k++) {
    const want = k / n * L[L.length - 1];
    while (i < pts.length - 2 && L[i + 1] < want) i++;
    const u = (want - L[i]) / Math.max(1e-9, L[i + 1] - L[i]);
    out.push(pts[i].clone().lerp(pts[i + 1], Math.min(1, Math.max(0, u))));
  }
  return out;
}
// the skull at one smile: positions for every column and row with the mouth open and (if asked) shut, the glow attribute (how much of
// the eyes' light the skin can take, the mouth's light) and where each point lies in the two eyes' frames
function headState(s, neck, withShut) {
  const _n = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
  const nLo = neck ? N_LO : N_LO_CAP, rows = N_UP + 19 + nLo, count = 1 + rows * NC + (neck ? 0 : 1);
  const pos = new Float32Array(count * 3), shut = withShut ? new Float32Array(count * 3) : null, glow = new Float32Array(count * 2);
  const eyeq = new Float32Array(count * 4).fill(9);
  for (const a of [pos, shut]) if (a) { a.set([0, RY, 0], 0); if (!neck) a.set([0, -RY, 0], a.length - 3); }
  for (let c = 0; c < NC; c++) {
    const a = COLS[c], sa = Math.sin(a), ca = Math.cos(a), g = grinAt(a, s), path = mouthPath(g, true);
    // crown to the top of the upper lip
    const up = [], y0 = path[0][0], f0 = Math.asin(Math.max(-1, Math.min(1, y0 / RY)));
    for (let i = 0; i <= 120; i++) { const f = lerp(Math.PI / 2, f0, i / 120); up.push(basePoint(a, i === 120 ? y0 : RY * Math.sin(f), neck, new THREE.Vector3())); }
    // under the lower lip, round the chin and down the neck (or to the bottom of the skull)
    const lo = [], y1 = path[path.length - 1][0];
    if (neck) for (let i = 0; i <= 240; i++) lo.push(basePoint(a, lerp(y1, NECK.end, i / 240), neck, new THREE.Vector3()));
    else { const f1 = Math.asin(Math.max(-1, Math.min(1, y1 / RY))); for (let i = 0; i < 160; i++) lo.push(basePoint(a, i === 0 ? y1 : RY * Math.sin(lerp(f1, -Math.PI / 2, i / 160)), neck, new THREE.Vector3())); }
    // the bottom pole is its own vertex, so the cap stops one step short of it
    const put = (arr, r, p, mouthDepth) => {
      const [sd, front, eye, q] = sockets(p.x, p.y, p.z), i = 1 + r * NC + c;
      if (sd) sinkDir(p, baseNormal(p, neck, _n), _n);
      pushOut(_p.copy(p), muzzle(p, g, s, eye)).addScaledVector(_d.set(sa, 0, ca), -mouthDepth).addScaledVector(_n, sd).toArray(arr, i * 3);
      if (arr === pos) { glow[i * 2] = front; eyeq.set(q, i * 4); }
    };
    let r = 0;
    for (const p of resample(up, N_UP)) { put(pos, r, p, 0); if (shut) put(shut, r, p, 0); r++; }
    // through the lips and the mouth (the shut mouth keeps the same rows, flat)
    const shutPath = shut && mouthPath(g, false);
    for (let i = 0; i < SEG.length; i++) for (let k = 1; k <= SEG[i]; k++) {
      const [y, depth, mg] = spline(path, i, k / SEG[i]);
      put(pos, r, basePoint(a, y, neck, _p.clone()), depth); glow[(1 + r * NC + c) * 2 + 1] = mg;
      if (shut) put(shut, r, basePoint(a, spline(shutPath, i, k / SEG[i])[0], neck, _p.clone()), 0);
      r++;
    }
    for (const p of resample(lo, nLo)) { put(pos, r, p, 0); if (shut) put(shut, r, p, 0); r++; }
  }
  return { pos, shut, glow, eyeq, rows };
}
function headIndex(rows, neck) {
  const idx = [], v = (r, c) => 1 + r * NC + ((c + NC) % NC);
  for (let c = 0; c < NC; c++) idx.push(0, v(0, c), v(0, c + 1));
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < NC; c++) idx.push(v(r, c), v(r + 1, c), v(r, c + 1), v(r, c + 1), v(r + 1, c), v(r + 1, c + 1));
  if (!neck) { const last = 1 + rows * NC; for (let c = 0; c < NC; c++) idx.push(last, v(rows - 1, c + 1), v(rows - 1, c)); }
  return idx;
}
function normalsOf(pos, index) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(index); g.computeVertexNormals();
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i += 3) if (!(n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2] > 0.5)) { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
  return n;
}
// the skull (and with neck, the neck down to 0.46 m under the skull centre, open at the bottom), with two morph targets:
// 0 the widest grin (smileScale 1.6), 1 the mouth shut
export function headGeometry({ neck = false } = {}) {
  const base = headState(1, neck, true), wide = headState(1.6, neck, false);
  const index = headIndex(base.rows, neck);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normalsOf(base.pos, index), 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(base.glow, 2));
  geo.setAttribute('eyeq', new THREE.BufferAttribute(base.eyeq, 4));
  geo.setIndex(index);
  geo.morphAttributes.position = [wide.pos, base.shut].map((p) => new THREE.BufferAttribute(p, 3));
  geo.morphAttributes.normal = [wide.pos, base.shut].map((p) => new THREE.BufferAttribute(normalsOf(p, index), 3));
  geo.morphTargetsRelative = false;
  geo.computeBoundingSphere();
  return geo;
}

// ---------- the eyes ----------
// both eyes in one mesh: domed discs a little larger than the white, sunk into the sockets so the socket wall covers their edge. spokes
// from the centre, rings set by distance from the outline, so the edge of the white falls between close rings all the way round
function eyeGeometry() {
  const NA = 96, NR = 20, REND = 1.15, pos = [], eq = [], exy = [], eid = [], idx = [], n = new THREE.Vector3(), p = new THREE.Vector3();
  EYES.forEach((e, k) => {
    const base = pos.length / 3;
    const vert = (qx, qy) => {
      eyeOnSkull(e, qx, qy, p);
      const r = eyeR(e, p);
      sinkDir(p, n.set(p.x / (RX * RX), p.y / (RY * RY), p.z / (RZ * RZ)).normalize(), n);
      // domed 11 mm; the dark margin dips under the wall, and a little under the skin where the socket runs out at the side of the head
      const sk = sinkK(p), d = (0.015 - 0.011 * Math.max(0, 1 - r * r)) * sk + Math.min(0.014, 0.12 * Math.max(0, r - 1)) * Math.max(sk, 0.35);
      pos.push(p.x + n.x * d, p.y + n.y * d, p.z + n.z * d); eq.push(...eyeQAt(e, p)); exy.push(...toPlane(p.x, p.y, p.z)); eid.push(k);
    };
    // how far along the spoke at angle t the outline radius reaches r
    const along = (t, r) => {
      let lo = 0, hi = 1.6;
      for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; eyeOnSkull(e, m * Math.cos(t), m * Math.sin(t), p); if (eyeR(e, p) < r) lo = m; else hi = m; }
      return lo;
    };
    vert(0, 0);
    for (let i = 1; i <= NR; i++) { const r = REND * Math.pow(i / NR, 0.7); for (let j = 0; j < NA; j++) { const t = j / NA * Math.PI * 2, m = along(t, r); vert(m * Math.cos(t), m * Math.sin(t)); } }
    const v = (i, j) => base + 1 + (i - 1) * NA + (j % NA);
    for (let j = 0; j < NA; j++) idx.push(base, v(1, j), v(1, j + 1));
    for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) idx.push(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i, j + 1));
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('eq', new THREE.Float32BufferAttribute(eq, 2));
  g.setAttribute('exy', new THREE.Float32BufferAttribute(exy, 2));
  g.setAttribute('eid', new THREE.Float32BufferAttribute(eid, 1));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();   // normals for the ambient occlusion pass
  return g;
}
// the glow is the material's colour (trailer/lib.js finds this material by toneMapped === false and scales its colour to switch the
// eyes off and on). the white is even with a hard edge, the pupil a dead black disc. pulled a hair toward the camera in depth, so
// where the socket runs out at the side of the head the skin does not break through the eye
function eyeMaterial() {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.name = 'creatureEyes'; m.color.setRGB(EYE_GLOW, EYE_GLOW, EYE_GLOW);
  const u = m.userData.uniforms = { pupils: { value: PUPIL_AT.map((p) => new THREE.Vector2(...p)) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 exy, eq; attribute float eid; varying vec2 vExy, vEq; varying float vEid, vDist;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvExy = exy; vEq = eq; vEid = eid;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDist = length( mvPosition.xyz ) / length( modelViewMatrix[ 0 ].xyz );');
    // the pupils loom a little larger up close, as spheres standing proud of the skull did, sized as they were at 1.1 m; the white is
    // a little darker toward its upper edge, under the lip of the socket
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec2 pupils[2]; varying vec2 vExy, vEq; varying float vEid, vDist;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float r = length( vEq ), ra = fwidth( r ) * 0.7;
        float white = 1.0 - smoothstep( 1.0 - ra, 1.0 + ra, r );
        float near = ( 1.0 + ${PUPIL_NEAR} / max( vDist, 0.6 ) ) / ( 1.0 + ${PUPIL_NEAR} / 1.1 );
        vec2 pd = ( vExy - ( vEid < 0.5 ? pupils[ 0 ] : pupils[ 1 ] ) ) / ( vec2( ${PUPIL_R[0]}, ${PUPIL_R[1]} ) * near );
        float pr = length( pd ), pa = fwidth( pr ) * 1.2 + 0.015;
        float pupil = 1.0 - smoothstep( 1.0 - pa, 1.0 + pa, pr );
        float lid = 1.0 - 0.25 * smoothstep( 0.8, 0.99, r ) * smoothstep( 0.2, 0.9, vEq.y / max( r, 1e-4 ) );
        diffuseColor.rgb = white * lid * diffuse * ( 1.0 - pupil ) + ( 1.0 - white ) * vec3( 0.0025 );
      }`);
  };
  return m;
}

// ---------- the teeth ----------
// a band across the opening, the top row 9 mm inside the lips and the bottom row 4 mm (so the lower lip does not hide it from a camera
// looking up at it), less toward the corners, where the mouth is shallow
function teethState(s, NTC, NTR) {
  const pos = [], v = new THREE.Vector3();
  for (let c = 0; c <= NTC; c++) {
    const t = c / NTC, th = -G.th + 2 * G.th * (18 + 988 * t) / 1024, a = azOf(th, s), [p0, p1] = grinPx(t, s), g = grinAt(a, s);
    for (let r = 0; r <= NTR; r++) {
      basePoint(a, yOf(lerp(p0, p1, r / NTR), s), false, v);
      pushOut(v, muzzle(v, g, s) - g.f * lerp(0.009, 0.004, ss(0.3, 0.8, r / NTR)));
      pos.push(v.x, v.y, v.z);
    }
  }
  return pos;
}
function teethGeometry() {
  const NTC = 160, NTR = 10, tuv = [], idx = [];
  for (let c = 0; c <= NTC; c++) for (let r = 0; r <= NTR; r++) tuv.push(c / NTC, r / NTR);   // along the grin, top lip to bottom
  const v = (c, r) => c * (NTR + 1) + r;
  for (let c = 0; c < NTC; c++) for (let r = 0; r < NTR; r++) idx.push(v(c, r), v(c, r + 1), v(c + 1, r), v(c + 1, r), v(c, r + 1), v(c + 1, r + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(teethState(1, NTC, NTR), 3));
  g.setAttribute('tuv', new THREE.Float32BufferAttribute(tuv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(teethState(1.6, NTC, NTR), 3)];
  g.computeBoundingSphere();
  return g;
}
// two rows of narrow teeth drawn in the shader, 50 across the grin, the lower row half a tooth over from the upper. each tooth is a
// little wider or longer than its neighbours, a few of the upper ones long; the tips meet a little past the middle of the mouth,
// the upper row in front, so there is no line between the rows, only a shadow under the upper tips and the odd dark notch. between
// the teeth and past their tips the inside of the mouth shows, lit warm by them. dimmer toward the corners and at the lips
const GAP = WARM.clone().multiplyScalar(0.05);
const TEETH = `
  float toothHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  // the tooth of one row at u (0..1 across the mouth): coverage, shade, and where its tip is (v, 0 at the top lip)
  vec3 tooth( float u, float v, float row, float dir, float base ) {
    float c = u * 50.0 + 0.5 * row, i = floor( c ), x = ( c - i ) * 2.0 - 1.0;
    float h1 = toothHash( vec2( i, row ) ), h2 = toothHash( vec2( i, row + 2.0 ) ), h3 = toothHash( vec2( i, row + 4.0 ) );
    float tip = base + dir * ( 0.05 * ( h1 - 0.5 ) + 0.09 * step( 0.93, h2 ) * ( 1.0 - row ) ) - dir * 0.045 * x * x;
    float from = row > 0.5 ? 1.0 : 0.0, along = clamp( ( v - from ) / ( tip - from ), 0.0, 1.0 );
    float hw = 1.0 - mix( 0.34, 0.06, along ) * ( 0.75 + 0.5 * h3 );
    float ax = fwidth( x ) * 0.8, av = fwidth( v ) * 0.8, sv = smoothstep( tip - av, tip + av, v );
    float cov = ( 1.0 - smoothstep( hw - ax, hw + ax, abs( x ) ) ) * ( dir > 0.0 ? 1.0 - sv : sv );
    float shade = ( 0.78 + 0.22 * sqrt( max( 0.0, 1.0 - x * x / ( hw * hw ) ) ) ) * mix( 0.8, 1.0, smoothstep( 0.0, 0.3, along ) );
    return vec3( cov, shade, tip );
  }`;
function teethMaterial() {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, side: THREE.DoubleSide });
  m.name = 'creatureTeeth'; m.color.setRGB(GRIN_GLOW, GRIN_GLOW, GRIN_GLOW);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 tuv; varying vec2 vTuv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTuv = tuv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vTuv;${TEETH}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float u = vTuv.x, v = vTuv.y;
        vec3 up = tooth( u, v, 0.0, 1.0, 0.565 ), lo = tooth( u, v, 1.0, -1.0, 0.535 );
        float shadow = 1.0 - 0.45 * ( 1.0 - smoothstep( 0.0, 0.04, v - up.z ) );
        vec3 inside = vec3( ${GAP.r.toFixed(3)}, ${GAP.g.toFixed(3)}, ${GAP.b.toFixed(3)} );
        vec3 col = mix( mix( inside, vec3( lo.y * shadow ), lo.x ), vec3( up.y ), up.x );
        col *= mix( 0.86, 1.0, 1.0 - smoothstep( 0.0, 0.5, abs( v - 0.55 ) ) ) * mix( 0.8, 1.0, smoothstep( 0.0, 0.14, min( v, 1.0 - v ) ) );
        col *= 1.0 - 0.3 * smoothstep( 0.78, 1.0, abs( u * 2.0 - 1.0 ) );
        diffuseColor.rgb = diffuse * col;
      }`);
  };
  return m;
}

// ---------- the skin ----------
// near black with a little form: grain and a broad mottling in the shading and roughness (from the rest position, so it stays put on
// the moving body), less sheen at facing angles than three's default (on black that reads as grey plastic under the flashlight), and a
// faint cold rim so the outline comes off a dark room, weaker on undersides. on the face the skin darkens into the eye sockets and
// takes the light of the eyes round them and of the teeth inside the mouth. 'low' gets a plain lambert with the rim and the face light
const SKIN = new THREE.Color(0x060508);
export const RIM_COL = new THREE.Color(0.019, 0.023, 0.036);
const NOISE = `
  float skinHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
  float skinNoise( vec3 x ) {
    vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( mix( skinHash( i ), skinHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( skinHash( i + vec3( 0, 1, 0 ) ), skinHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
      mix( mix( skinHash( i + vec3( 0, 0, 1 ) ), skinHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( skinHash( i + vec3( 0, 1, 1 ) ), skinHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
  }
  vec3 skinBump( vec3 pos, vec3 n, float h ) {   // tilt the normal by the screen-space slope of a height in metres
    vec3 dx = dFdx( pos ), dy = dFdy( pos ), r1 = cross( dy, n ), r2 = cross( n, dx );
    float det = dot( dx, r1 );
    vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
    return normalize( abs( det ) * n - grad );
  }`;
// rimFade: [axis, from, to] in rest units; the rim is full where the rest position's coordinate along axis is at from and gone at to
// (the body fades it out going up into the collar, the face going down the jaw, so the join has none on either side)
export function skinMaterial({ low = false, unit = 1, face = null, rim = RIM_COL, rimFade = null } = {}) {
  const m = low ? new THREE.MeshLambertMaterial({ color: SKIN }) : new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.78, metalness: 0, envMapIntensity: 0.25 });
  m.name = 'creatureSkin';
  const fade = new THREE.Vector4(0, 0, 0, 1);
  if (rimFade) { const [axis, from, to] = rimFade, k = -1 / (to - from); fade.set(axis.x * k, axis.y * k, axis.z * k, to / (to - from)); }
  const u = { uUnit: { value: unit }, uRim: { value: rim }, uRimFade: { value: fade }, uEyeLight: { value: face ? face.eyes.material.color : new THREE.Color(0, 0, 0) }, uMouthLight: { value: face ? face.mouthLight : new THREE.Color(0, 0, 0) } };
  m.customProgramCacheKey = () => 'creatureSkin' + (low ? 'L' : 'S') + (face ? 'F' : 'B');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uUnit; varying vec3 vRest;${face ? '\nattribute vec2 glow; attribute vec4 eyeq; varying vec2 vGlow; varying vec4 vEyeq;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vRest = position * uUnit;${face ? '\nvGlow = glow; vEyeq = eyeq;' : ''}`);
    let f = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uRim, uEyeLight, uMouthLight; uniform vec4 uRimFade; varying vec3 vRest;${face ? '\nvarying vec2 vGlow; varying vec4 vEyeq;' : ''}
      ${low ? '' : NOISE}`);
    // skinOcc: the eye sockets, dark against the white and opening out over a fifth of the eye's radius, further under the brow
    f = f.replace('#include <color_fragment>', `#include <color_fragment>
      float skinOcc = 1.0, eyeR = 9.0;${face ? `
      {
        float r0 = length( vEyeq.xy ), r1 = length( vEyeq.zw ), up = max( ( r0 < r1 ? vEyeq.y : vEyeq.w ) / max( min( r0, r1 ), 1e-4 ), 0.0 );
        eyeR = min( r0, r1 ); skinOcc = mix( 1.0, smoothstep( 1.0, 1.22 + 0.14 * up, eyeR ), vGlow.x );
        diffuseColor.rgb *= mix( 0.3, 1.0, skinOcc );
      }` : ''}`);
    if (!low) {
      f = f.replace('#include <color_fragment>', `#include <color_fragment>
        float grain = skinNoise( vRest * 38.0 ), fine = skinNoise( vRest * 150.0 ), broad = skinNoise( vRest * 7.0 + 3.1 );
        float fineK = 1.0 - smoothstep( 0.25, 0.6, length( fwidth( vRest * 150.0 ) ) );
        diffuseColor.rgb *= ( 0.88 + 0.24 * grain ) * ( 0.88 + 0.24 * broad );`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp( roughnessFactor * ( 0.88 + 0.24 * grain - 0.1 * ( fine - 0.5 ) * fineK ) * ( 0.9 + 0.2 * broad ), 0.55, 0.95 );`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = skinBump( - vViewPosition, normal, 0.0011 * grain + 0.00032 * fine * fineK + 0.0025 * broad );`)
        .replace('#include <lights_physical_fragment>', THREE.ShaderChunk.lights_physical_fragment.replace('vec3( 0.04 )', 'vec3( 0.005 * skinOcc )').replaceAll('material.specularF90 = 1.0;', 'material.specularF90 = 0.35;'));
    }
    // the rim: a fresnel, faded along uRimFade and weaker on surfaces that face down, since the light that would catch an edge comes
    // from above; the eyes light the skin out from the socket's edge
    f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float rimK = smoothstep( 0.0, 1.0, dot( uRimFade.xyz, vRest ) + uRimFade.w ) * mix( 0.45, 1.0, smoothstep( -0.5, 0.4, normal.y ) ) * skinOcc;
        totalEmissiveRadiance += uRim * rimK * pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 3.0 );
      }${face ? `
      {
        float lit = vGlow.x * skinOcc * ( 0.45 * ( 1.0 - smoothstep( 1.1, 1.6, eyeR ) ) + 0.55 * ( 1.0 - smoothstep( 1.1, 2.3, eyeR ) ) );
        totalEmissiveRadiance += uEyeLight * ( 0.06 * lit * lit ) + uMouthLight * ( 0.08 * vGlow.y );
      }` : ''}`);
    sh.fragmentShader = f;
  };
  return m;
}

// ---------- the face ----------
// createFace({ skull = true, neck = false, quality = 'high' }) -> THREE.Group
//   origin at the centre of the skull, +z out of the face, +y up, +x to the face's left, a unit a metre: the head 0.42 m across,
//   0.53 m chin to crown, 0.40 m deep, the eyes' centres 0.075 m above the origin and 0.17 m in front, the grin 0.005 to 0.165 m below.
//   for a human head (about 0.16 m across) scale by about 0.4. with neck it runs on down to 0.46 m below the origin.
//   face.eyes: both eyes (scale face.eyes.material.color to dim them); face.smile: the teeth (hide it and the mouth closes over);
//   face.skull: the head mesh (null without one; face.addSkull() builds it, face.setSkull swaps in another built from headGeometry).
//   face.update(dt, { target, smile }): pupils toward a world point (or stay put), smile from 1 (rest) to 1.6 (widest).
//   face.setQuality(q): 'low' gives the skin the cheaper material
export function createFace({ skull = true, neck = false, quality = 'high' } = {}) {
  const face = new THREE.Group();
  face.name = 'creatureFace';
  face.quality = quality === 'low' ? 'low' : 'high';
  face.mouthLight = new THREE.Color();
  face.eyes = new THREE.Mesh(eyeGeometry(), eyeMaterial());
  face.eyes.name = 'eyes';
  face.smile = new THREE.Mesh(teethGeometry(), teethMaterial());
  face.smile.name = 'teeth';
  for (const o of [face.eyes, face.smile]) { o.castShadow = false; o.receiveShadow = false; face.add(o); }
  face.skull = null;
  face.skins = {};
  face.skinFor = (low) => (face.skins[low ? 'low' : 'high'] ||= skinMaterial({ low, face, rimFade: [new THREE.Vector3(0, 1, 0), -0.1, -0.25] }));
  face.setSkull = (mesh) => {
    if (face.skull && face.skull !== mesh) { face.skull.removeFromParent(); face.skull.geometry.dispose(); }
    face.skull = mesh;
    if (mesh) { mesh.material = face.skinFor(face.quality === 'low'); mesh.castShadow = true; mesh.receiveShadow = true; }
  };
  face.addSkull = (withNeck = neck) => { const m = new THREE.Mesh(headGeometry({ neck: withNeck })); m.name = 'skull'; face.add(m); face.setSkull(m); return m; };
  if (skull) face.addSkull();
  face.setQuality = (q) => {
    const low = q === 'low'; face.quality = low ? 'low' : 'high';
    if (face.skull) face.skull.material = face.skinFor(low);
  };
  const v = new THREE.Vector3(), pupils = face.eyes.material.userData.uniforms.pupils.value;
  face.update = (dt, { target = null, smile = 1 } = {}) => {
    if (target) {
      face.updateMatrixWorld(true);
      v.copy(target); face.worldToLocal(v); v.normalize();
      PUPIL_AT.forEach((p, i) => pupils[i].set(p[0] + THREE.MathUtils.clamp(v.x, -1, 1) * PUPIL_MOVE[0], p[1] + THREE.MathUtils.clamp(v.y, -1, 1) * PUPIL_MOVE[1]));
    }
    const open = face.smile.visible, w = open ? THREE.MathUtils.clamp((smile - 1) / 0.6, 0, 1) : 0;
    face.smile.morphTargetInfluences[0] = w;
    if (face.skull) { face.skull.morphTargetInfluences[0] = w; face.skull.morphTargetInfluences[1] = open ? 0 : 1; }
    face.mouthLight.copy(face.smile.material.color).multiply(WARM).multiplyScalar(open ? 1 : 0);
  };
  face.update(0);
  return face;
}
