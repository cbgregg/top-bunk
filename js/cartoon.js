// The bedtime cartoon: after Dad shuts your door and you fall asleep, an early-1930s black-and-white "safety picture" plays, hosted by
// your own teddy bear, Mister Buttons. It teaches holding your breath under the covers, waits for you to really do it, says "The End"...
// and then keeps running.
//
// Drawn the way those shorts were made: the character is a flat cel, solid black and white: a stuffed teddy bear come
// to life, kept simple: flat plush grey with one bold outline, noodle limbs, one floppy ear and a seam down the head, a lighter muzzle,
// pie-cut eyes, a sewn-on belly patch, a plain bow tie, white gloves and round feet, outlined in hand-inked lines that swell and taper; the room behind him is a
// painted gouache backdrop (soft washes, brush texture, folds in drybrush, hardly any outline), so he pops off it. The mouth follows the
// announcer through a chart of shapes; the whole body bounces and sways on the band's beat. Under it all, a decayed nitrate print: crawling
// grain, a flicker stepping at 24 frames, dust, hairs, scratches, blotches, splices, weave, a warped picture and burnt edges, and a
// band-limited, crackling optical soundtrack. A 960 x 720 Academy-ratio stage, letterboxed; everything runs in continuous
// time, so it is smooth at the display's own refresh, and a virtual clock lets the same code render the preview video frame by frame.
//
// createCartoon({ audio, getLabel, breathDown, skipDown, subtitles, lines }) -> { play({ firstTime, skipLabel }), active, opaque, state, offline() }
//   audio: the game's AudioSys (or a stand-in with buf + no ctx, which only logs the sounds it would play)

const W = 960, H = 720;
const INK = '#151515', WHITE = '#f2f2f2', BLACK = '#121212';
// Mister Buttons, in the print's greys: mid-grey fur, a light-grey face, belly and ear insides, white gloves and teeth, near-black boots
const FUR = '#777777', FUR_L = '#bdbdbd', BOOT = '#1d1d1d';
// paint on a cel is never perfectly flat: a faint grain over every fill, and the odd uneven stroke of the brush
let GRAIN = null;
function paint(c, pts, col) {
  if (BOILAMP) { c.save(); c.translate(0.8, -0.6); fillPts(c, pts, col); c.restore(); } else fillPts(c, pts, col);
  if (typeof document === 'undefined') return;
  if (!GRAIN) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), r = rng(808); for (let i = 0; i < 900; i++) { g.globalAlpha = 0.05 + r() * 0.08; g.fillStyle = r() < 0.5 ? '#000' : '#fff'; g.beginPath(); g.ellipse(r() * 128, r() * 128, 1 + r() * 5, 0.6 + r() * 2.5, r() * 3, 0, TAU); g.fill(); } GRAIN = c.createPattern(cv, 'repeat'); }
  c.save(); path(c, pts); c.clip(); c.fillStyle = GRAIN; c.globalAlpha = 0.32; c.fill(); c.restore();
}
// a few flicks of fur where the outline faces out: short tapered strokes at the given points of a shape
function flicks(c, pts, at, len = 6, seed = 0) {
  const n = pts.length;
  for (const k of at) { const i = Math.floor(k * n) % n, a = pts[(i + n - 2) % n], b = pts[(i + 2) % n], q = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = dy / l, ny = -dx / l, tw = (hash(i * 3.3 + seed) - 0.5) * 0.8;
    ink(c, quad([q[0] - dx / l * 3, q[1] - dy / l * 3], [q[0] + nx * len * 0.6, q[1] + ny * len * 0.6], [q[0] + nx * len + dx / l * len * tw, q[1] + ny * len + dy / l * len * tw], 6), 2.2, false, i + seed); }
}
const BEAT = 60 / 180;   // the band's beat
const TAU = Math.PI * 2;
const SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = { inOut: (k) => k * k * (3 - 2 * k), out: (k) => 1 - (1 - k) ** 3, in: (k) => k * k * k, back: (k) => { const c = 1.7; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; } };
const k01 = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const wob = (t, a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * c + 2.1) * 0.2;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

const VO = { c_hello: 4.85, c_creep: 4.08, c_duck: 2.95, c_hold: 7.03, c_quiet: 4.37, c_meter: 5.4, c_try: 2.74, c_holdit: 3.14, c_whoops: 3.07, c_good: 2.26, c_night: 4.87, c_remember: 3.74 };
const HOLD_NEED = 4;

// ---------------------------------------------------------------- ink ----------------------------------------------------------------
// Inked lines are filled shapes: a ribbon either side of the path, swelling and tapering. Closed outlines are heavier on the side away
// from the light (lower right) and thin on the lit side, as a brush does; open strokes taper to points at both ends. A slow wobble keeps
// them hand-made without ever jittering.
const INKT = { t: 0 };
function ellPts(cx, cy, rx, ry, n = 44, rot = 0, a0 = 0, a1 = TAU) {
  const out = [], cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / (a1 === TAU ? n : n - 1), x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]); }
  return out;
}
function bez(p0, p1, p2, p3, n = 20) {
  const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); }
  return out;
}
function quad(p0, p1, p2, n = 16) { return bez(p0, [p0[0] + (p1[0] - p0[0]) * 2 / 3, p0[1] + (p1[1] - p0[1]) * 2 / 3], [p2[0] + (p1[0] - p2[0]) * 2 / 3, p2[1] + (p1[1] - p2[1]) * 2 / 3], p2, n); }
// while the character is being drawn, every shape boils: its outline wobbles a pixel or two, a new drawing twelve times a second, and
// no circle is ever quite round
let BOILAMP = 0;
function wob2(pts) {
  if (!BOILAMP || pts.length < 6) return pts;
  const f = Math.floor(INKT.t * 12), n = pts.length, sd = n * 0.7;
  return pts.map(([x, y], i) => [x + (Math.sin(i * 0.37 + f * 2.1 + sd) + Math.sin(i * 0.11 + sd * 1.3)) * BOILAMP * 0.5, y + (Math.sin(i * 0.43 - f * 1.7 + sd) + Math.sin(i * 0.13 - sd)) * BOILAMP * 0.5]);
}
function path(c, pts0, close = true) { const pts = wob2(pts0); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); if (close) c.closePath(); }
function fillPts(c, pts, col) { path(c, pts); c.fillStyle = col; c.fill(); }
// the ribbon: closed (an outline) or open (a stroke that tapers to points)
function ink(c, pts0, w, closed = true, seed = 0) {
  const pts = wob2(pts0), n = pts.length; if (n < 2) return;
  let area = 0; if (closed) for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = closed && area < 0 ? -1 : 1, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]); const l = Math.hypot(nx, ny) || 1; nx = nx / l * sgn; ny = ny / l * sgn;
    const s = i / (n - 1), wv = (1 + 0.1 * Math.sin(i * 0.9 + seed * 3.1 + INKT.t * 1.3)) * (1 + (Math.sin(i * 1.7 + seed * 5.3 + Math.floor(INKT.t * 12) * 2.1) * 0.5) * 0.22);   // the line boils a little, a new drawing twelve times a second
    let k;
    if (closed) k = 0.4 + 1.05 * Math.max(0, nx * 0.35 + ny * 0.95);   // heavier on the underside, where the edge faces away from the light
    else k = Math.pow(Math.sin(Math.PI * s), 0.6) * 1.05;
    let hw = w * k * wv * 0.5;
    if (closed && BOILAMP && nx * 0.35 + ny * 0.95 < -0.45 && hash(Math.floor(i / 5) + seed * 3.7 + Math.floor(INKT.t * 12) * 0.31) < 0.3) hw *= 0.12;   // the lit side's line thins out and breaks
    L.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]); R.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
  }
  c.beginPath();
  if (closed) { L.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); R.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fillStyle = INK; c.fill('evenodd'); return; }
  L.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]); c.closePath(); c.fillStyle = INK; c.fill();
}
// a white shape inked round: the gloves, the shoes, the belly patch, the quilt
function cel(c, pts, w = 3.2, col = WHITE, seed = 0) { if (BOILAMP) { c.save(); c.translate(0.8, -0.6); fillPts(c, pts, col); c.restore(); } else fillPts(c, pts, col); ink(c, pts, w, true, seed); }

// ---------------------------------------------------------------- Mister Buttons ----------------------------------------------------------------
// a capsule outline from a to b with radius r (a puffy finger, a thumb)
function capsulePts(ax, ay, bx, by, r, n = 12) {
  const a = Math.atan2(by - ay, bx - ax), out = [];
  for (let i = 0; i <= n; i++) { const t = a - Math.PI / 2 + Math.PI * i / n; out.push([bx + Math.cos(t) * r, by + Math.sin(t) * r]); }
  for (let i = 0; i <= n; i++) { const t = a + Math.PI / 2 + Math.PI * i / n; out.push([ax + Math.cos(t) * r, ay + Math.sin(t) * r]); }
  return out;
}
// a white glove, the kind every cartoon star wore, built only from circles, ellipses and capsules: a round mitten palm, fat sausage fingers
// (three and a thumb) with round tips, of different lengths and a little splayed, a bean of a thumb, and a rolled cuff, a ring wider than
// the wrist, that the arm disappears into. The ink is heavy round the outside and thin on the lines inside. The wrist is at 0,0 and the hand
// points along +x (rotated to a); flip mirrors it for the other hand. Poses: 'open' 'wave' 'point' 'fist' 'thumb' 'stop' 'shh' 'clap'
function glove(c, x, y, a, kind = 'open', s = 1, flip = 1, hole = true) {
  const was = BOILAMP; BOILAMP = BOILAMP || 1.1;
  c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s * flip);
  const tips = [], F = (ax, ay, ang, len, r = 6.6) => { tips.push([ax + Math.cos(ang) * (len + r * 0.25), ay + Math.sin(ang) * (len + r * 0.25), r]); return capsulePts(ax, ay, ax + Math.cos(ang) * len, ay + Math.sin(ang) * len, r, 10); };
  const back = [], front = [];
  let palm = ellPts(13, 0, 14.5, 14, 36), lines = true, thumb = null, thumbBack = true;
  switch (kind) {
    case 'point':   // the index straight out, the rest curled into the palm, the thumb over them
      back.push(F(17, -5, -0.04, 21, 6.2)); front.push(ellPts(24, 4, 7, 6, 18), ellPts(21, 11, 6.4, 5.4, 18)); thumb = F(9, -9, -0.15, 9, 6.6); thumbBack = false; lines = false; break;
    case 'shh':     // the finger-wag: the index up and tipped, the rest curled
      back.push(F(17, -6, -0.62, 21, 6.2)); front.push(ellPts(24, 4, 7, 6, 18), ellPts(21, 11, 6.4, 5.4, 18)); thumb = F(9, 8, 0.5, 8, 6.4); thumbBack = false; lines = false; break;
    case 'peace':   // two fingers up in a V, the others curled under the thumb
      back.push(F(17, -6, -0.24, 21, 6.2), F(17, 5, 0.22, 21, 6.2)); front.push(ellPts(22, 12, 6.4, 5.4, 18)); thumb = F(9, 9, 0.55, 8, 6.4); thumbBack = false; lines = false; break;
    case 'fist':    // a row of round knuckles
      palm = ellPts(12, 0, 15, 14.5, 36); front.push(ellPts(23, -9, 7, 6.4, 18), ellPts(25.5, 0, 7.4, 6.6, 18), ellPts(23, 9, 7, 6.4, 18)); thumb = F(10, -11, 0.35, 9, 6.4); thumbBack = false; lines = false; break;
    case 'thumb':   // a fist with the thumb sticking up out of it
      palm = ellPts(12, 0, 15, 14.5, 36); front.push(ellPts(23, -7, 7, 6.4, 18), ellPts(25.5, 2, 7.4, 6.6, 18), ellPts(23, 11, 7, 6.4, 18)); thumb = F(20, -12, -0.28, 14, 6.8); lines = false; break;
    case 'stop':    // palm out, fingers up, a crease across the palm
      for (let i = 0; i < 3; i++) back.push(F(17, -9 + i * 9, (i - 1) * 0.2, 17 - Math.abs(i - 1) * 3 + (i === 2 ? -2 : 0)));
      thumb = F(6, -11, -1.0, 9, 6.8); lines = false; break;
    case 'clap':    // the fingers together, flat
      for (let i = 0; i < 3; i++) back.push(F(17, -7 + i * 7, 0, 17 - Math.abs(i - 1) * 2, 6.2)); thumb = F(7, -10, -0.5, 9, 6.6); break;
    default: {      // 'open' and 'wave': the fingers fanned (wider for a wave), the thumb out
      const sp = kind === 'wave' ? 0.44 : 0.3, len = [16, 20, 17];
      for (let i = 0; i < 3; i++) { const ang = (i - 1) * sp; back.push(F(15 + Math.cos(ang) * 3, Math.sin(ang) * 10, ang, len[i])); }
      thumb = F(7, -10, kind === 'wave' ? -1.2 : -0.95, 8, 7);
    }
  }
  // the heavy outside: every piece inked thick first, then filled and inked thin in its order, so only the silhouette keeps the weight
  const cuff = ellPts(-2.5, 0, 5.6, 11.5, 32, -0.12 * flip);
  const all = [...back, ...(thumb ? [thumb] : []), palm, ...front, cuff];
  all.forEach((pts, i) => ink(c, pts, 4.4, true, i + 21));
  const piece = (pts, i) => cel(c, pts, 1.6, WHITE, i);
  back.forEach((f, i) => piece(f, i + 1));
  if (thumb && thumbBack) piece(thumb, 6);
  piece(palm, 5);
  front.forEach((f, i) => piece(f, i + 11));
  if (thumb && !thumbBack) piece(thumb, 6);
  if (lines) for (const dy of [-5, 0, 5]) ink(c, quad([8, dy * 1.1], [11, dy * 1.25], [15, dy * 1.4], 8), 1.7, false, dy);   // the lines on the back
  if (kind === 'stop') ink(c, quad([5, 5], [12, 9], [20, 4], 10), 1.6, false, 2);                                          // the palm's crease
  // the cuff: a rolled band hugging the end of the arm, tipped a little with it, and the line where it rolls over
  piece(cuff, 9);
  ink(c, ellPts(-0.8, 0, 2.6, 9.6, 24, -0.12 * flip, -Math.PI / 2 + 0.35, Math.PI / 2 - 0.35), 1.4, false, 3);
  c.restore(); BOILAMP = was;
}
// a big bulbous shoe: a round toe cap, a small heel, a sole line, a shine on the toe, and a little sock ring where the leg goes in
function shoe(c, x, y, dir, s = 1) {   // (a big black boot: round toe, a little heel, a shine, the sole)
  c.save(); c.translate(x, y); c.scale(dir * s, s);
  const boot = [...bez([-16, -4], [-22, -26], [0, -34], [18, -30], 14), ...bez([18, -30], [46, -26], [48, 0], [28, 0], 14).slice(1), ...quad([28, 0], [6, 3], [-16, -4], 10).slice(1)];
  ink(c, boot, 4.4, true, 30); paint(c, boot, BOOT); ink(c, boot, 1.8, true, 5);
  fillPts(c, ellPts(26, -20, 6, 3, 14, -0.3), 'rgba(255,255,255,0.55)');
  c.beginPath(); quad([-14, -5], [10, -1], [38, -4], 10).forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.lineWidth = 2; c.strokeStyle = '#6a6a6a'; c.stroke();
  c.restore();
}
// the head at 0,0. p.eyes 'open' | 'squeeze' | 'happy' | 'shut'; p.look [x, y]; p.lid 0..1 (sleepy); p.brow -1..1 (down .. popped up);
// p.angry 0..1 (brows knit); p.eyeS (stretch); p.mouth one of the mouth chart ('smile' 'grin' 'aah' 'ooh' 'eeh' 'fff' 'mm' 'o' 'worried'
// 'puff' 'strain' 'tongue' 'sly' 'jag'); p.open 0..1 (how far the talking mouth opens); p.puff 0..1 (balloon cheeks); p.blue 0..1
const FACE = { vis: { mouth: 'mm', open: 0 } };   // the lip-sync shape of this frame (set by the picture before it draws)
// the expressions the picture asks for, as eyes and a mouth from the charts; while he talks, the mouth follows the voice instead
function expression(p) {
  const f = p.face; if (!f && !p.talk) return p;
  const q = { ...p };
  const E = { smile: ['open', 'grin'], closed: ['open', 'smile'], grin: ['open', 'grin'], o: ['open', 'o'], worried: ['open', 'worried'], puff: ['open', 'puff'], strain: ['squeeze', 'strain'],
    sly: ['open', 'sly'], tongue: ['happy', 'tongue'], jag: ['open', 'jag'], scream: ['open', 'terror'], angry: ['open', 'grit'], cry: ['shut', 'cry'], wince: ['squeeze', 'grit'] }[f] || ['open', p.mouth || 'smile'];
  if (f === 'angry') q.angry = 1;
  if (f === 'cry') q.tears = true;
  if (f === 'scream') { q.terror = true; q.worried = true; q.eyeS = 1.35; q.brow = 1.6; }
  q.eyes = q.eyes || E[0]; q.mouth = E[1];
  if (f === 'worried') { q.worried = true; }
  if (f === 'sly') q.lid = Math.max(0.5, q.lid || 0);
  if (f === 'grin') q.open = q.open ?? 0.55;
  if ((p.talk || 0) > 0.1 && ['smile', 'grin', 'sly', undefined].includes(f)) { q.mouth = FACE.vis.mouth; q.open = FACE.vis.open; }
  return q;
}
function bearHead(c, p0) { const wb = BOILAMP; BOILAMP = Math.max(BOILAMP, 1.7); bearHead0(c, p0); BOILAMP = wb; }   // the face boils a bit more
function bearHead0(c, p0) {
  const p = expression(p0);
  const look = p.look || [0, 0], br = p.brow || 0, puff = p.puff || 0, eyeS = p.eyeS || 1, eyes = p.eyes || 'open', view = p.view || 'front', dir = p.dir || 1;
  const turn = view === 'three' ? 14 * dir : 0;   // a three-quarter turn slides the face round the head
  // ears on the top corners, with a lighter inside (none from behind); a slightly squashed ball of a head, a few flicks of fur on top and
  // at the cheeks
  const ears = view === 'side' ? [[-dir * 10, -46, 19]] : view === 'three' ? [[-dir * 34, -42, 19], [dir * 46, -36, 17]] : [[-42, -40, 19.5], [43, -41, 18.5]];
  const el = p.earLag || [0, 0], pin = p.terror ? 1 : 0;
  ears.forEach(([x0, y0, r], i) => { const x = x0 * (1 + 0.22 * pin) + el[0] * (0.9 + i * 0.2), y = y0 + 14 * pin + el[1] * (0.9 + i * 0.2), e = ellPts(x, y, r, r * 0.96 * (1 - 0.35 * pin), 28, pin * Math.sign(x0) * 0.6); paint(c, e, FUR); ink(c, e, 3, true, 12 + i); if (view !== 'back') paint(c, ellPts(x + (view === 'side' ? dir * 3 : 0), y + 1, r * 0.52, r * 0.5, 20), FUR_L); });
  const head = ellPts(0, 2, 58, 50, 60);
  // a held breath inflates the lower face itself: the head's lower half and the muzzle swell out as one shape
  const inf = (pts) => (puff > 0.01 ? pts.map(([x, y]) => { const w = clamp((y + 6) / 34, 0, 1); return [turn + (x - turn) * (1 + 0.25 * puff * w), y + Math.max(0, y) * 0.1 * puff]; }) : pts);
  const headI = inf(head);
  paint(c, headI, FUR); ink(c, headI, 3.2, true, 9); flicks(c, headI, [0.7, 0.75, 0.8, 0.05, 0.1, 0.4, 0.45], 6, 3);
  if (view === 'back') return;
  // the face: a light mask that rises round the eyes and comes down into the muzzle, a wider oval jutting forward
  let mask, muz;
  if (view === 'side') { mask = ellPts(dir * 26, -6, 26, 32, 40); muz = ellPts(dir * 44, 18, 25, 17, 36); }
  else { const w = view === 'three' ? 0.86 : 1, X = (x) => x * w + turn;
    mask = [...bez([X(-30), 12], [X(-38), -26], [X(-16), -44], [X(0), -30], 12), ...bez([X(0), -30], [X(16), -44], [X(38), -26], [X(30), 12], 12).slice(1), ...quad([X(30), 12], [X(0), 22], [X(-30), 12], 10).slice(1)];
    muz = ellPts(turn * 1.3, 22, 42 * w, 24, 44); }
  mask = inf(mask); muz = inf(muz);
  c.save(); path(c, headI); c.clip(); paint(c, mask, FUR_L); ink(c, mask, 1.8, true, 15); c.restore();
  paint(c, muz, FUR_L); ink(c, muz, 2.4, true, 16);
  if (p.blue > 0.01) { c.fillStyle = `rgba(20,20,20,${0.3 * p.blue})`; c.beginPath(); c.ellipse(turn, 8, 50, 44, 0, 0, TAU); c.fill(); }
  // eyes: tall black pie-cut ovals set close together, high on the face (in profile, one)
  const eyeList = view === 'side' ? [[dir * 24, 0.65]] : view === 'three' ? [[turn - 11, 0.8], [turn + 13, 1]] : [[-12.5, 1], [12.5, 1]];
  for (const [ex0, wk] of eyeList) {
    const sx = Math.sign(ex0 - turn) || dir, ex = ex0 + look[0] * 2, ey = -15 + (sx < 0 ? 0.6 : 0) + look[1] * 2, rx = 8.5 * wk * Math.pow(2 - eyeS, 0.5), ry = 18 * eyeS * (1 - 0.14 * puff);
    const shut = (pts) => ink(c, pts, 3.4, false, sx + 40);
    if (eyes === 'squeeze') { shut([[ex - sx * 7, ey - 7], [ex + sx * 5, ey], [ex - sx * 7, ey + 7]]); continue; }
    if (eyes === 'happy') { shut(quad([ex - 8, ey + 5], [ex, ey - 11], [ex + 8, ey + 5])); continue; }
    if (eyes === 'shut') { shut(quad([ex - 8, ey], [ex, ey + 7], [ex + 8, ey])); if (p.tears) { const t = ellPts(ex + sx * 4, ey + 16, 3.6, 5.5, 14); cel(c, t, 1.6, WHITE, sx); } continue; }
    const e = ellPts(ex, ey, rx, ry, 30);
    if (p.terror) { const e2 = ellPts(ex, ey - 2, rx * 1.15, ry * 1.08, 30); fillPts(c, e2, WHITE); fillPts(c, ellPts(ex + Math.sin(INKT.t * 40) * 1.2, ey + 2, 3.4, 3.8, 10), BLACK); ink(c, e2, 2.2, true, sx * 3); continue; }
    fillPts(c, e, BLACK);
    fillPts(c, [[ex + rx * 0.05 + look[0] * 1.5, ey - ry * 0.05], [ex + rx * 0.7, ey - ry * 0.75], [ex + rx * 0.95, ey - ry * 0.2]], WHITE);   // the glint
    if (p.lid > 0.02) { const ly = ey - ry + 2 * ry * clamp(p.lid, 0, 1); c.save(); path(c, e); c.clip(); c.fillStyle = FUR_L; c.fillRect(ex - rx - 2, ey - ry - 2, 2 * rx + 4, ly - (ey - ry) + 2); c.restore(); ink(c, quad([ex - rx, ly], [ex, ly + 2], [ex + rx, ly]), 2.2, false, sx); }
    ink(c, e, 2, true, sx * 2);
  }
  // brows: inked dashes above the eyes; up when glad or startled, knit and down when angry
  const ang = p.angry || 0;
  for (const [ex] of eyeList) {
    const sx = Math.sign(ex - turn) || dir, by = -38 - br * 3 - (eyeS - 1) * 6, bx = ex, tilt = sx * ang * 0.55 - (p.worried ? sx * 0.35 : 0);
    const a = [bx - 7 * Math.cos(tilt), by - 7 * Math.sin(tilt)], b = [bx + 7 * Math.cos(tilt), by + 7 * Math.sin(tilt)];
    ink(c, quad(a, [bx, by - 3], b, 8), 2.6, false, sx + 7);
  }
  // the black nose with its shine, and the mouth under it
  const nx = view === 'side' ? dir * 66 : turn * 1.35, ny = view === 'side' ? 8 : 6;
  fillPts(c, ellPts(nx, ny, view === 'side' ? 8 : 12, 8, 24), BLACK); fillPts(c, ellPts(nx - 4, ny - 3, 3.6, 1.8, 12, -0.2), WHITE);
  c.save(); c.translate(view === 'side' ? dir * 46 : turn * 1.3, view === 'side' ? 0 : -6); if (view === 'side') c.scale(0.5 * dir, 0.75); else if (view === 'three') c.scale(0.9, 1); mouth(c, p); c.restore();
}
// the mouth chart
function mouth(c, p) {
  const m = p.mouth || 'smile', o = clamp(p.open ?? 0.6, 0, 1);
  const crease = (sx, y = 26) => ink(c, quad([sx * 22, y - 5], [sx * 25, y], [sx * 22, y + 5], 8), 2.2, false, sx);
  const openMouth = (wTop, depth, opts = {}) => {
    // a wide black mouth: the top lip a gentle curve, the bottom a deep one; tongue and teeth inside
    const top = quad([-wTop, 24], [0, 30], [wTop, 24], 14), bot = quad([wTop, 24], [0, 24 + depth * 1.9], [-wTop, 24], 18).slice(1, -1);
    const pts = [...top, ...bot];
    fillPts(c, pts, BLACK);
    c.save(); path(c, pts); c.clip();
    if (opts.teeth) { c.fillStyle = WHITE; c.fillRect(-wTop - 2, 20, wTop * 2 + 4, 9); ink(c, [[-wTop, 29], [wTop, 29]], 1.6, false, 1); }
    if (opts.lowTeeth) { c.fillStyle = WHITE; c.fillRect(-wTop, 24 + depth - 4, wTop * 2, 10); }
    if (opts.tongue !== false && depth > 10) { fillPts(c, ellPts(0, 24 + depth * 0.95, wTop * 0.55, depth * 0.45, 24), '#8a8a8a'); ink(c, quad([-4, 24 + depth * 0.8], [0, 24 + depth], [4, 24 + depth * 0.8], 6), 1.6, false, 2); }
    c.restore();
    ink(c, pts, 3.6, true, 3);
  };
  switch (m) {
    case 'mm': ink(c, quad([-16, 30], [0, 37], [16, 30], 14), 3.4, false, 1); crease(-1, 28); crease(1, 28); break;
    case 'smile': ink(c, quad([-24, 24], [0, 46], [24, 24], 18), 3.2, false, 1); crease(-1, 23); crease(1, 23); break;
    case 'sly': ink(c, quad([-18, 32], [4, 38], [24, 24], 14), 3.8, false, 1); crease(1, 24); break;
    case 'worried': ink(c, [[-20, 36], ...quad([-20, 36], [-12, 28], [-5, 34], 6).slice(1), ...quad([-5, 34], [3, 40], [9, 33], 6).slice(1), ...quad([9, 33], [15, 28], [21, 35], 6).slice(1)], 3.4, false, 2); break;
    case 'o': fillPts(c, ellPts(0, 36, 8, 10, 24), BLACK); ink(c, ellPts(0, 36, 8, 10, 24), 3, true, 2); break;
    case 'ooh': { const r = 7 + o * 5; fillPts(c, ellPts(0, 36, r, r * 1.25, 24), BLACK); fillPts(c, ellPts(0, 40, r * 0.5, r * 0.4, 16), '#8a8a8a'); ink(c, ellPts(0, 36, r, r * 1.25, 24), 3.4, true, 2); break; }
    case 'puff': case 'strain': fillPts(c, ellPts(0, 36, 4, 3.4, 14), BLACK); if (m === 'strain') { ink(c, quad([-12, 34], [0, 31], [12, 34], 8), 2.6, false, 3); } break;
    case 'fff': ink(c, quad([-18, 30], [0, 36], [18, 30], 14), 3.4, false, 1); c.fillStyle = WHITE; c.fillRect(-9, 27, 18, 6); ink(c, [[-9, 33], [9, 33]], 1.6, false, 2); break;
    case 'eeh': openMouth(19, 7 + o * 7, { teeth: true, lowTeeth: true, tongue: false }); crease(-1); crease(1); break;
    case 'aah': openMouth(16, 12 + o * 16, {}); break;
    case 'grin': {   // the signature: a wide crescent full of teeth, no lips
      const w = 38, top = quad([-w, 20], [0, 34], [w, 20], 18), bot = quad([w, 20], [0, 54 + o * 6], [-w, 20], 18).slice(1, -1), pts = [...top, ...bot];
      fillPts(c, pts, BLACK); c.save(); path(c, pts); c.clip(); c.fillStyle = WHITE;
      c.beginPath(); quad([-w - 2, 18], [0, 32], [w + 2, 18], 18).forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); quad([w + 2, 28], [0, 48 + o * 4], [-w - 2, 28], 18).forEach((q) => c.lineTo(q[0], q[1])); c.closePath(); c.fill();
      for (let i = -4; i <= 4; i++) ink(c, [[i * 8, 24 + (9 - Math.abs(i) * 1.6) * 0.7], [i * 8, 36 + (9 - Math.abs(i)) * 0.8]], 1.7, false, i);
      c.restore(); ink(c, pts, 3, true, 3); crease(-1.7, 20); crease(1.7, 20); break;
    }
    case 'grit': {   // teeth clenched: a flat box of teeth
      const pts = [...quad([-24, 26], [0, 23], [24, 26], 10), ...quad([24, 26], [27, 33], [24, 40], 4).slice(1), ...quad([24, 40], [0, 43], [-24, 40], 10).slice(1), ...quad([-24, 40], [-27, 33], [-24, 26], 4).slice(1)];
      fillPts(c, pts, WHITE); ink(c, [[-24, 33], [24, 33]], 1.6, false, 1); for (let i = -2; i <= 2; i++) ink(c, [[i * 9, 25], [i * 9, 41]], 1.3, false, i); ink(c, pts, 3, true, 2); break;
    }
    case 'cry': openMouth(18, 16 + o * 8, {}); break;
    case 'terror': {   // a tall stretched scream, the corners dragged down, the tongue shaking
      const wob = Math.sin(INKT.t * 34) * 2.5, pts = [...quad([-13, 30], [0, 20], [13, 30], 10), ...bez([13, 30], [20, 44], [24, 62], [18, 74], 10).slice(1), ...quad([18, 74], [0, 80], [-18, 74], 10).slice(1), ...bez([-18, 74], [-24, 62], [-20, 44], [-13, 30], 10).slice(1)];
      fillPts(c, pts, BLACK); c.save(); path(c, pts); c.clip(); fillPts(c, ellPts(wob, 70, 11, 8, 18), '#7a7a7a'); c.restore(); ink(c, pts, 3.2, true, 7);
      for (const sx of [-1, 1]) ink(c, quad([sx * 15, 28], [sx * 21, 34], [sx * 23, 44], 6), 2, false, sx + 30);   // the corners pulled down
      break;
    }
    case 'tongue': {
      openMouth(20, 15, { tongue: false }); crease(-1); crease(1);
      const t = [...bez([-8, 34], [-11, 56], [11, 56], [8, 34], 16)]; cel(c, t, 2.6, '#7a7a7a', 4); ink(c, [[0, 40], [0, 54]], 1.6, false, 3);
      break;
    }
    case 'jag': {
      const top = quad([-38, 18], [0, 26], [38, 18], 16), bot = quad([38, 18], [0, 72], [-38, 18], 18).slice(1, -1), pts = [...top, ...bot];
      fillPts(c, pts, BLACK); c.save(); path(c, pts); c.clip(); c.fillStyle = WHITE;
      for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 10 - 5, 19); c.lineTo(i * 10 + 5, 19); c.lineTo(i * 10, 34 - Math.abs(i)); c.closePath(); c.fill(); }
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 11 - 5.5, 58); c.lineTo(i * 11 + 5.5, 58); c.lineTo(i * 11, 44 + Math.abs(i) * 1.5); c.closePath(); c.fill(); }
      c.restore(); ink(c, pts, 3.8, true, 5); break;
    }
    default: ink(c, quad([-20, 26], [0, 44], [20, 26], 18), 3.4, false, 1);
  }
}
// rubber hose: one tube per limb, a single flowing curve, solid black, with a lag spring for the follow-through (see drawBear)
const LIMB = new Map(), GLOVE_S = 1.15;   // the glove's scale on the bear: its palm a little under half his head's width
function limbLag(key, x, y, time) {
  let m = LIMB.get(key);
  if (!m || time < m.t || time - m.t > 0.3) { m = { t: time, x, y, lx: 0, ly: 0, vx: 0, vy: 0 }; LIMB.set(key, m); return [0, 0]; }
  const dt = Math.max(1e-3, time - m.t), vx = (x - m.x) / dt, vy = (y - m.y) / dt;
  const tx = clamp(-vx * 0.07, -50, 50), ty = clamp(-vy * 0.07, -50, 50), k = 90, d = 10;
  m.vx += ((tx - m.lx) * k - m.vx * d) * dt; m.vy += ((ty - m.ly) * k - m.vy * d) * dt;
  m.lx += m.vx * dt; m.ly += m.vy * dt; m.t = time; m.x = x; m.y = y;
  return [m.lx, m.ly];
}
// a value that follows its target on a spring (overshoot and settle): for the belly's jiggle and the like
const SPR = new Map();
function spring(key, target, time, k = 160, d = 9) {
  let m = SPR.get(key);
  if (!m || time < m.t || time - m.t > 0.3) { m = { t: time, v: target, vel: 0 }; SPR.set(key, m); return target; }
  const dt = Math.max(1e-3, time - m.t); m.vel += ((target - m.v) * k - m.vel * d) * dt; m.v += m.vel * dt; m.t = time; return m.v;
}
function hose(c, x0, y0, x1, y1, side, rest, lag, w, opt = {}) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L * side, ny = dx / L * side;
  const sag = (0.16 + clamp((rest - L) / rest, 0, 1) * 0.75) * rest * 0.55;
  // the more slack, the further apart the handles, so a slack hose bends into a round U, never a V
  const e = clamp((rest - L) / rest, 0, 1), f1 = lerp(0.32, 0.02, e), f2 = lerp(0.7, 0.98, e), sg = sag * (1 + e * 0.35);
  const c1 = [x0 + dx * f1 + nx * sg + lag[0] * 0.45, y0 + dy * f1 + ny * sg + lag[1] * 0.45], c2 = [x0 + dx * f2 + nx * sg * 0.85 + lag[0], y0 + dy * f2 + ny * sg * 0.85 + lag[1]];
  // a brush-drawn tube, not a pipe: it flares out of the body at the root (no cap, no seam: inside the body the black just merges), tapers
  // about 1.25 to 1 toward the wrist, its edges never quite even, and boiling a little from one drawing to the next
  const n = 22, Ls = [], Rs = [], f = Math.floor(INKT.t * 12), sd = (x0 * 7 + y0 * 3) % 17;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t, p = [u * u * u * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * x1, u * u * u * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * y1];
    const d = [3 * u * u * (c1[0] - x0) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (x1 - c2[0]), 3 * u * u * (c1[1] - y0) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (y1 - c2[1])];
    const dl = Math.hypot(d[0], d[1]) || 1, nx2 = -d[1] / dl, ny2 = d[0] / dl;
    const hw = w / 2 * lerp(1, 0.8, t) * (1 + 0.05 * Math.sin(t * 5.3 + sd));
    const bl = (Math.sin(i * 0.9 + f * 2.3 + sd) + Math.sin(i * 0.37 - f * 1.7)) * 0.32, br = (Math.sin(i * 0.8 - f * 2.1 + sd) + Math.sin(i * 0.41 + f * 1.3)) * 0.32;
    Ls.push([p[0] + nx2 * (hw + bl), p[1] + ny2 * (hw + bl)]); Rs.push([p[0] - nx2 * (hw + br), p[1] - ny2 * (hw + br)]);
  }
  const shape = [...Ls, ...Rs.slice().reverse()];
  if (opt.over) {   // a thin, clean light line along the arm's edges where it lies in front of the belly, so the two read apart
    c.save(); path(c, opt.over); c.clip(); c.lineJoin = 'round'; c.lineCap = 'butt'; c.strokeStyle = '#cfcfcf'; c.lineWidth = 5;
    for (const sd2 of [Ls, Rs]) { c.beginPath(); sd2.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); }
    c.restore();
  }
  paint(c, shape, FUR);
  if (opt.gap) {   // the near arm: outlined all along outside the body; over the body only where it crosses in front, not at its root
    const lw = 2.8;
    c.save(); c.beginPath(); c.rect(-2000, -2000, 4000, 4000); opt.gap.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.clip('evenodd'); ink(c, Ls, lw, false, 1); ink(c, Rs, lw, false, 2); c.restore();
    c.save(); path(c, opt.gap); c.clip(); const k = Math.floor(n * 0.42); ink(c, Ls.slice(k), lw, false, 3); ink(c, Rs.slice(k), lw, false, 4); c.restore();
  } else { ink(c, Ls, 2.8, false, 1); ink(c, Rs, 2.8, false, 2); }
  return c2;
}
// a black fill's outline boils a little between drawings, and its curves are never machine-true
function boil(pts, amp = 0.7, seed = 0) {
  const f = Math.floor(INKT.t * 12);
  return pts.map(([x, y], i) => [x + (Math.sin(i * 0.37 + f * 2.1 + seed) + Math.sin(i * 0.11 + seed * 1.3)) * amp * 0.5, y + (Math.sin(i * 0.43 - f * 1.7 + seed) + Math.sin(i * 0.13 - seed)) * amp * 0.5]);
}
// the whole bear (body space: x from the centre line, y up from the floor, negative). p: x, y, s, sy (squash/stretch), sx (extra width),
// lean, tilt, headS, T (clock, for the hoses), id, smear [dx, dy], hands { l, r: [x, y, kind, bend] }, feet { l, r: [x, y] }, legs: false (in
// bed), and the face values bearHead takes
function drawBear(c, p) {
  if (p.smear && Math.hypot(p.smear[0], p.smear[1]) > 4) {
    for (let i = 3; i >= 1; i--) { c.save(); c.globalAlpha = 0.14 * (4 - i) / 3; drawBear(c, { ...p, smear: null, x: p.x + p.smear[0] * i / 3, y: p.y + p.smear[1] * i / 3, T: null }); c.restore(); }
  }
  const s = p.s || 1, sy = p.sy || 1, sx = (1 / Math.sqrt(sy)) * (p.sx || 1), id = p.id || 'B', T = p.T;
  const wasB = BOILAMP; BOILAMP = 1.2;
  // secondary motion on springs: the head leads the body, the ears trail it, the belly jiggles after a squash
  const mv = T == null ? [0, 0] : limbLag(id + 'BODY', p.x, p.y, T), headLead = [-mv[0] * 0.18, -mv[1] * 0.12], earLag = [mv[0] * 0.25, mv[1] * 0.2];
  const jig = T == null ? 0 : spring(id + 'SY', sy, T) - sy;
  c.save(); c.translate(p.x, p.y); c.scale(s, s); c.rotate(p.lean || 0);
  const lift = p.legs === false ? 0 : 45, Tp = (x, y) => [x * sx, y * sy - lift];   // standing, his legs are longer
  const view = p.view || 'front', dir = p.dir || 1, side = view === 'side', back = view === 'back';
  const hipY = -82 * sy - lift, shL = side ? Tp(dir * 4, -142) : Tp(-30, -140), shR = side ? Tp(dir * 8, -140) : Tp(30, -140), neck = Tp(side ? dir * 4 : 0, -168);
  const hands = p.hands || {}, feet = p.feet || {};
  const hL = hands.l || [-70, -86, 'open', -1], hR = hands.r || [70, -86, 'open', -1];
  const lag = (key, x, y) => (T == null ? [0, 0] : limbLag(id + key, p.x + x * s, p.y + y * s, T).map((v) => v / s));
  // the body: a pear, narrow at the shoulders and round at the belly and hips (in profile the belly pushes forward), its outline boiling
  const bw = view === 'three' ? 0.92 : 1, P = (x, y) => Tp(x * bw * (side ? dir : 1), y);
  const front = [[[-16, -178], [-28, -174], [-32, -150], [-44, -126]], [[-44, -126], [-74, -98], [-72, -50], [-42, -38]], [[-42, -38], [-22, -28], [22, -28], [42, -38]], [[42, -38], [72, -50], [74, -98], [44, -126]], [[44, -126], [32, -150], [28, -174], [16, -178]]];
  const prof = [[[-8, -178], [-22, -172], [-30, -140], [-32, -110]], [[-32, -110], [-36, -72], [-30, -42], [-10, -34]], [[-10, -34], [20, -26], [54, -44], [56, -82]], [[56, -82], [56, -118], [38, -144], [22, -160]], [[22, -160], [14, -174], [4, -180], [-8, -178]]];
  const body = boil((side ? prof : front).flatMap((q, i) => bez(P(...q[0]), P(...q[1]), P(...q[2]), P(...q[3]), 12).slice(i ? 1 : 0)), 0.9, 3);
  // noodle arms out of the shoulders, hanging in a slight curve to the gloves (in profile the far one is behind the body); the glove
  // follows the arm's direction at the wrist
  let belly = null;
  const arm = (sh, h, sd, key, gap) => { const c2 = hose(c, sh[0], sh[1], h[0], h[1], sd * (h[3] ?? 1), 140, lag(key, h[0], h[1]), 28, { gap, over: gap ? belly : null }); if (h[2] !== 'none') glove(c, h[0], h[1], Math.atan2(h[1] - c2[1], h[0] - c2[0]), h[2] || 'open', GLOVE_S, sd < 0 ? -1 : 1); };   // ('none': the hand is drawn by someone else, on top of the quilt)
  const leg = (hx, f, sd, key) => { hose(c, hx, hipY, f[0], f[1] - 20, -sd, 108, lag(key, f[0], f[1]), 17); shoe(c, f[0], f[1], side ? dir : sd, 1.05); };
  if (p.legs !== false) { if (side) { leg(-2 * dir, feet.l || [-10 * dir, 0], -1, 'FL'); leg(8 * dir, feet.r || [16 * dir, 0], 1, 'FR'); } else { leg(-20 * sx, feet.l || [-28, 0], -1, 'FL'); leg(20 * sx, feet.r || [28, 0], 1, 'FR'); } }
  if (side) arm(shL, [hL[0] * 0.2 - dir * 2, hL[1], hL[2], hL[3]], -1, 'L');   // the far arm, behind
  // the stub of a tail (seen from behind, or at the back in profile)
  const tail = back ? Tp(0, -64) : side ? Tp(-dir * 36, -64) : null;
  if (tail && side) { const t = ellPts(tail[0], tail[1], 10, 9, 20); paint(c, t, FUR); ink(c, t, 2.6, true, 21); }
  paint(c, body, FUR); ink(c, body, 3.2, true, 3);
  if (tail && back) { const t = ellPts(tail[0], tail[1], 11, 10, 20); paint(c, t, FUR); ink(c, t, 2.6, true, 21); }
  // the lighter belly
  if (!back) { const [bx, by] = side ? P(22, -84) : P(view === 'three' ? dir * 8 : 0, -84), bel = ellPts(bx, by, (side ? 22 : 36) * sx * bw * (1 - jig * 1.5), 36 * sy * (1 + jig * 2.5), 40); belly = bel; c.save(); path(c, body); c.clip(); paint(c, bel, FUR_L); ink(c, bel, 1.8, true, 6); c.restore(); }
  if (side) arm(shR, [hR[0] * 0.2 + dir * 10, hR[1], hR[2], hR[3]], dir, 'R', body);
  else { arm(shL, hL, -1, 'L', body); arm(shR, hR, 1, 'R', body); }
  const hs = (p.headS || 1) * 1.18; c.save(); c.translate(neck[0] + headLead[0], neck[1] - 52 * Math.min(1.2, sy) + (p.headUp || 0) + headLead[1]); c.rotate(p.tilt || 0);
  c.scale(hs * (1 + (sx - 1) * 0.7), hs * (1 + (sy - 1) * 0.7)); bearHead(c, { ...p, view, dir, earLag }); c.restore();
  c.restore(); BOILAMP = wasB;
}

// ---------------------------------------------------------------- the painted backdrop ----------------------------------------------------------------
// painted once, at 1.6 times the stage, in grey gouache: washes, brush texture, drybrush folds, soft edges, almost no line
const PS = 1.6;
function paintRoom() {
  const cv = document.createElement('canvas'); cv.width = Math.round(W * PS); cv.height = Math.round(H * PS);
  const g = cv.getContext('2d'), r = rng(1931);
  g.scale(PS, PS);
  const strokes = (x0, y0, x1, y1, n, ang, len, alpha, light = 0.5, width = 2.4) => {
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, r()), y = lerp(y0, y1, r());
      g.save(); g.translate(x, y); g.rotate(ang + (r() - 0.5) * 0.35); g.globalAlpha = alpha * (0.4 + r() * 0.6);
      g.fillStyle = r() < light ? '#ffffff' : '#000000'; g.beginPath(); g.ellipse(0, 0, len * (0.4 + r()), width * (0.4 + r()), 0, 0, TAU); g.fill(); g.restore();
    }
  };
  const soft = (fn, blur = 1.6) => { g.save(); g.filter = `blur(${blur}px)`; fn(); g.restore(); };
  // the wall: a wash darker at the top and the corners, the lamp's warm pool on the right, wallpaper stripes in broken drybrush
  let gr = g.createLinearGradient(0, 0, 0, 560); gr.addColorStop(0, '#6c6c6a'); gr.addColorStop(0.5, '#9a9996'); gr.addColorStop(1, '#868583'); g.fillStyle = gr; g.fillRect(0, 0, W, 560);
  for (const [cx, rr] of [[0, 420], [W, 380]]) { const cg = g.createRadialGradient(cx, 260, 40, cx, 260, rr); cg.addColorStop(0, 'rgba(0,0,0,0.35)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(0, 0, W, 560); }
  gr = g.createRadialGradient(840, 330, 30, 840, 330, 480); gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, 560);
  for (let x = 30; x < W; x += 52) { g.save(); g.globalAlpha = 0.07; for (let y = 0; y < 560; y += 6) { if (r() < 0.25) continue; g.fillStyle = '#5c5c5c'; g.fillRect(x + Math.sin(y * 0.04 + x) * 1.5, y, 2.6 + r() * 1.2, 6.5); } g.restore(); }
  // gouache: broad mottled washes laid over each other, then a few loose brush marks
  soft(() => { for (let i = 0; i < 1500; i++) { const x = r() * W, y = r() * 560, rr = 12 + r() * 46; g.globalAlpha = 0.035 + r() * 0.03; g.fillStyle = r() < 0.5 ? '#ffffff' : '#000000'; g.beginPath(); g.ellipse(x, y, rr, rr * (0.4 + r() * 0.6), r() * Math.PI, 0, TAU); g.fill(); } }, 3);
  strokes(0, 0, W, 560, 1400, Math.PI / 2, 12, 0.05, 0.5, 4);
  // the floor: boards in a darker wash, their seams in a few dry strokes, and the skirting
  gr = g.createLinearGradient(0, 560, 0, H); gr.addColorStop(0, '#737373'); gr.addColorStop(1, '#4a4a4a'); g.fillStyle = gr; g.fillRect(0, 560, W, H - 560);
  g.save(); g.globalAlpha = 0.28; g.strokeStyle = '#2e2e2e'; for (let i = -10; i <= 10; i++) { g.lineWidth = 1.2 + r() * 1.2; g.beginPath(); g.moveTo(W / 2 + i * 74, 566); g.lineTo(W / 2 + i * 150, H); g.stroke(); } g.restore();
  soft(() => { for (let i = 0; i < 500; i++) { const x = r() * W, y = 560 + r() * (H - 560), rr = 14 + r() * 40; g.globalAlpha = 0.05; g.fillStyle = r() < 0.4 ? '#ffffff' : '#000000'; g.beginPath(); g.ellipse(x, y, rr * 1.8, rr * 0.4, 0, 0, TAU); g.fill(); } }, 3);
  strokes(0, 560, W, H, 700, 0.08, 26, 0.06, 0.4, 3);
  soft(() => { g.fillStyle = '#585858'; g.fillRect(0, 546, W, 18); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 546, W, 3); }, 1);
  // the window: night panes, a soft moon and its haze, the cross bars painted light, the curtains in drybrush folds
  g.save(); g.translate(690, 0);
  soft(() => { gr = g.createLinearGradient(0, 130, 0, 360); gr.addColorStop(0, '#2a2a2a'); gr.addColorStop(1, '#474747'); g.fillStyle = gr; g.fillRect(-90, 130, 180, 230); }, 1);
  soft(() => { gr = g.createRadialGradient(42, 186, 4, 42, 186, 80); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-90, 130, 180, 230); g.fillStyle = '#ececec'; g.beginPath(); g.arc(42, 186, 20, 0, TAU); g.fill(); g.fillStyle = 'rgba(70,70,70,0.8)'; g.beginPath(); g.ellipse(14, 210, 36, 10, 0, 0, TAU); g.ellipse(36, 205, 24, 11, 0, 0, TAU); g.fill(); }, 2.2);
  soft(() => { g.fillStyle = '#d3d3d3'; g.fillRect(-96, 124, 192, 8); g.fillRect(-96, 358, 192, 8); g.fillRect(-96, 124, 8, 242); g.fillRect(88, 124, 8, 242); g.fillRect(-4, 124, 8, 242); g.fillRect(-96, 241, 192, 8); }, 0.8);
  for (const sd of [-1, 1]) {
    soft(() => {
      g.beginPath(); g.moveTo(sd * 64, 104); g.bezierCurveTo(sd * 92, 200, sd * 70, 300, sd * 84, 394); g.lineTo(sd * 142, 394); g.bezierCurveTo(sd * 152, 260, sd * 136, 180, sd * 132, 104); g.closePath();
      g.fillStyle = '#c3c3c3'; g.fill();
      g.save(); g.clip();
      for (let i = 0; i < 5; i++) { const fx = sd * (70 + i * 15); const fg = g.createLinearGradient(fx - 7, 0, fx + 7, 0); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, 'rgba(0,0,0,0.22)'); fg.addColorStop(1, 'rgba(255,255,255,0.12)'); g.fillStyle = fg; g.fillRect(fx - 9, 100, 18, 300); }
      g.restore();
    }, 1.2);
    g.save(); g.beginPath(); g.moveTo(sd * 64, 104); g.bezierCurveTo(sd * 92, 200, sd * 70, 300, sd * 84, 394); g.lineTo(sd * 142, 394); g.bezierCurveTo(sd * 152, 260, sd * 136, 180, sd * 132, 104); g.closePath(); g.clip();
    for (let i = 0; i < 260; i++) { const x = sd * (66 + r() * 76), y = 104 + r() * 290; g.globalAlpha = 0.07; g.fillStyle = r() < 0.5 ? '#000' : '#fff'; g.fillRect(x, y, 1.6, 10 + r() * 30); }
    g.restore();
  }
  soft(() => { g.fillStyle = '#5a5a5a'; g.fillRect(-150, 98, 300, 9); }, 0.8);
  g.restore();
  // a motto in an oval frame on the wall
  soft(() => { g.fillStyle = '#6f6f6f'; g.beginPath(); g.ellipse(130, 170, 74, 52, 0, 0, TAU); g.fill(); g.fillStyle = '#d9d9d9'; g.beginPath(); g.ellipse(130, 170, 60, 40, 0, 0, TAU); g.fill(); }, 1.2);
  g.fillStyle = 'rgba(40,40,40,0.75)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic bold 17px ${SERIF}`; g.fillText('Sleep Tight', 130, 166); g.font = `italic 11px ${SERIF}`; g.fillText('God bless this home', 130, 184);
  // the nightstand and its lamp, painted; the shade glows
  soft(() => {
    g.fillStyle = '#626262'; g.beginPath(); g.roundRect(804, 478, 112, 122, 8); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(810, 484, 30, 110);
    g.fillStyle = '#8a8a8a'; g.beginPath(); g.ellipse(860, 448, 22, 29, 0, 0, TAU); g.fill();
    g.fillStyle = '#ececec'; g.beginPath(); g.moveTo(808, 420); g.lineTo(826, 350); g.lineTo(894, 350); g.lineTo(912, 420); g.closePath(); g.fill();
    gr = g.createRadialGradient(860, 430, 10, 860, 520, 240); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(810, 420); g.lineTo(650, 640); g.lineTo(1070, 640); g.lineTo(910, 420); g.closePath(); g.fill();
  }, 1.4);
  strokes(804, 478, 916, 600, 120, 0, 14, 0.07, 0.5, 2);
  // the dark: the same room by moonlight, the lamp out
  const dark = document.createElement('canvas'); dark.width = cv.width; dark.height = cv.height;
  const d = dark.getContext('2d'); d.filter = 'brightness(0.46) contrast(1.08)'; d.drawImage(cv, 0, 0); d.filter = 'none';
  d.scale(PS, PS);
  const mg = d.createRadialGradient(690, 280, 30, 690, 330, 440); mg.addColorStop(0, 'rgba(210,210,210,0.2)'); mg.addColorStop(1, 'rgba(210,210,210,0)'); d.fillStyle = mg; d.fillRect(0, 0, W, H);
  d.fillStyle = '#6b6b6b'; d.filter = 'blur(1.4px)'; d.beginPath(); d.moveTo(808, 420); d.lineTo(826, 350); d.lineTo(894, 350); d.lineTo(912, 420); d.closePath(); d.fill(); d.filter = 'none';
  return { lit: cv, dark };
}
// the quilt: an overlay cel, gingham, inked, turned down at the top and scalloped at the hem. It lies flat at `flat` across the bed and rises
// over whoever is under it: bumps is a list of [x, half-width, top] (a head, two ears, the shoulders), and the gingham follows the rise
function quilt(c, top, hem = 560, x0 = 296, x1 = 750, { flat = null, hump = null, bumps = null } = {}) {
  const base = flat ?? top, B = bumps || (hump ? [[hump[0], hump[1], top]] : []);
  // the rise is a soft union of the bumps (no sharp valley where two meet, so no points)
  const ty = (x) => { let acc = 0; for (const [bx, hw, bt, pw = 2.4] of B) { const u = (x - bx) / hw, h = Math.max(0, base - bt) * Math.exp(-Math.pow(Math.abs(u), pw)); acc += Math.pow(h, 3); } return base - Math.cbrt(acc); };
  const edge = []; for (let x = x0 + 4; x <= x1 - 10; x += 6) edge.push([x, ty(x) + (x < x0 + 30 ? (x0 + 30 - x) * 0.3 : 0)]);
  const pts = [...edge, ...quad([x1 - 10, ty(x1 - 10)], [x1, ty(x1) + 8], [x1 - 6, ty(x1) + 30], 6).slice(1), [x1 - 6, hem]];
  for (let x = x1 - 6; x > x0; x -= 32) pts.push(...quad([x, hem], [x - 16, hem + 18], [x - 32, hem], 6).slice(1));
  pts.push([x0, Math.min(hem, ty(x0) + 24)]);
  fillPts(c, pts, WHITE);
  c.save(); path(c, pts); c.clip(); c.fillStyle = 'rgba(40,40,40,0.34)';
  for (let x = x0 - 16; x < x1 + 30; x += 26) c.fillRect(x, Math.min(top, base) - 40, 13, hem - Math.min(top, base) + 80);
  // the rows of the check run along the cloth: over a lump they ride up with it and spread out, flat they lie level
  const span = Math.max(20, hem + 20 - base);
  for (let k = -1; k * 26 < span; k++) {
    c.beginPath();
    for (let x = x0 - 20; x <= x1 + 20; x += 8) { const t0 = ty(x), sc = (hem + 20 - t0) / span; c.lineTo(x, t0 + k * 26 * sc); }
    for (let x = x1 + 20; x >= x0 - 20; x -= 8) { const t0 = ty(x), sc = (hem + 20 - t0) / span; c.lineTo(x, t0 + (k * 26 + 13) * sc); }
    c.closePath(); c.fill();
  }
  c.restore();
  ink(c, pts, 3.4, true, 6);
  // the turned-down band along the top edge
  const band = Math.min(20, (hem - base) * 0.5), fold = [...edge, ...edge.slice().reverse().map(([x, y]) => [x, y + band])];
  cel(c, fold, 2.6, WHITE, 8);
  // folds hanging from a lump
  const big = B.reduce((m, b) => (!m || b[1] > m[1] ? b : m), null);
  if (big && big[2] < base - 40) for (const sd of [-1, 1]) { const fx = big[0] + sd * big[1] * 0.7; ink(c, quad([fx, ty(fx) + band + 4], [fx + sd * 10, (ty(fx) + hem) / 2], [fx + sd * 16, hem - 10], 10), 2.2, false, 3 + sd); }
}
// the bunk bed: wooden, two tiers, round finials on the corner posts, a ladder at the foot end. Painted like the room (soft-edged washes and
// dry brush, no outline), in two layers: what is behind the sleepers (posts, the bottom bunk's dark hollow, the pillows) and what is in
// front of them (the top bunk's side board and the ladder). Each comes lit and by moonlight
const BUNK = { L: 262, R: 778, top: 448, board: 472, low: 575, lowHem: 616, lowBoard: 630, floor: 666 };
function paintBunk() {
  const r = rng(1937);
  const layer = (fn) => {
    const cv = document.createElement('canvas'); cv.width = Math.round(W * PS); cv.height = Math.round(H * PS);
    const g = cv.getContext('2d'); g.scale(PS, PS);
    const soft = (f, blur = 1.2) => { g.save(); g.filter = `blur(${blur}px)`; f(); g.restore(); };
    const grain = (x0, y0, x1, y1, n, horiz) => { for (let i = 0; i < n; i++) { g.save(); g.globalAlpha = 0.06 + r() * 0.06; g.fillStyle = r() < 0.45 ? '#ffffff' : '#000000'; g.translate(lerp(x0, x1, r()), lerp(y0, y1, r())); g.rotate(horiz ? (r() - 0.5) * 0.05 : Math.PI / 2 + (r() - 0.5) * 0.05); g.beginPath(); g.ellipse(0, 0, 10 + r() * 18, 0.8 + r(), 0, 0, TAU); g.fill(); g.restore(); } };
    const wood = (x, y, w, h, col = '#5d5d5d') => { soft(() => { g.fillStyle = col; g.beginPath(); g.roundRect(x, y, w, h, 3); g.fill(); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 2, y + 1, w > h ? w - 4 : w * 0.3, w > h ? h * 0.25 : h - 2); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(w > h ? x : x + w * 0.72, w > h ? y + h * 0.78 : y, w > h ? w : w * 0.28, w > h ? h * 0.22 : h); }, 0.9); grain(x, y, x + w, y + h, Math.max(w, h) / 3, w > h); };
    fn(g, soft, wood);
    const dark = document.createElement('canvas'); dark.width = cv.width; dark.height = cv.height;
    const d = dark.getContext('2d'); d.filter = 'brightness(0.5) contrast(1.06)'; d.drawImage(cv, 0, 0);
    return { lit: cv, dark };
  };
  const back = layer((g, soft, wood) => {
    const B = BUNK;
    soft(() => { const sg = g.createRadialGradient(520, B.floor, 20, 520, B.floor, 330); sg.addColorStop(0, 'rgba(0,0,0,0.42)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.beginPath(); g.ellipse(520, B.floor, 330, 22, 0, 0, TAU); g.fill(); }, 2);
    // the bottom bunk: a dark hollow under the top one, its pillow just showing
    soft(() => { const gr = g.createLinearGradient(0, B.board, 0, B.low + 20); gr.addColorStop(0, '#1d1d1d'); gr.addColorStop(1, '#383838'); g.fillStyle = gr; g.fillRect(B.L + 20, B.board - 4, B.R - B.L - 40, B.low - B.board + 30); }, 1.4);
    soft(() => { g.fillStyle = '#4a4a4a'; g.fillRect(B.L + 20, B.board - 4, B.R - B.L - 40, 12); }, 1);   // the slats under the top bunk
    soft(() => { g.fillStyle = '#6e6e6e'; g.beginPath(); g.ellipse(340, B.low - 4, 46, 16, -0.05, 0, TAU); g.fill(); }, 1.4);
    // the top bunk's pillow
    soft(() => { g.fillStyle = '#e3e3e3'; g.beginPath(); g.moveTo(300, 404); g.bezierCurveTo(290, 362, 400, 356, 410, 390); g.bezierCurveTo(418, 426, 304, 432, 300, 404); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,0.14)'; g.beginPath(); g.ellipse(356, 404, 44, 9, 0, 0, TAU); g.fill(); }, 1.3);
    // the bottom bunk's side board, and the four corner posts (two seen) with round finials
    wood(B.L + 10, B.lowBoard, B.R - B.L - 20, 24, '#5a5a5a');
    for (const x of [B.L, B.R - 22]) {
      wood(x, 196, 22, B.floor - 196, '#5f5f5f');
      soft(() => { g.fillStyle = '#6a6a6a'; g.beginPath(); g.arc(x + 11, 184, 15, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x + 6, 179, 5, 0, TAU); g.fill(); g.fillStyle = '#585858'; g.fillRect(x + 4, 194, 14, 6); }, 0.9);
      wood(x - 3, 236, 28, 8, '#575757');   // the top rail's end, where the guard rail meets the post
    }
    wood(B.L + 18, 236, 140, 10, '#5b5b5b');   // a short guard rail at the head of the top bunk
  });
  const front = layer((g, soft, wood) => {
    const B = BUNK;
    wood(B.L + 8, B.top, B.R - B.L - 16, B.board - B.top, '#636363');
    // the ladder, hooked over the top bunk's board at the foot end
    for (const x of [688, 730]) wood(x, B.top - 18, 9, B.floor - B.top + 18, '#6a6a6a');
    for (const y of [B.top - 10, 512, 566, 620]) wood(684, y, 58, 8, '#707070');
  });
  return { back, front };
}
// the bottom bunk's covers, flat, in the dark under the top bunk
function lowerQuilt(c, dark = 1) {
  const B = BUNK;
  quilt(c, B.low, B.lowHem, 300, 748);
  c.fillStyle = `rgba(12,12,12,${0.42 + 0.18 * clamp(dark, 0, 1)})`; c.fillRect(B.L + 20, B.board, B.R - B.L - 40, B.lowBoard - B.board);
}
// under the covers it is huge: a tent of gingham. The quilt is the ceiling, sagging in big swags overhead (sag: + pulled in by his breath,
// - billowing up), the mattress is a wide pale floor, and the light glows through the cloth. sil: the tall thing pressing in from outside,
// a shadow through the far wall; lean: how far it bends over, its fingers dimpling the ceiling
const TENT = { floor: 600 };
let SILC = null;
function tentSet(c, { sag = 0, sil = 0, lean = 0, time = 0, glow = 1 } = {}) {
  // the far wall: the cloth with the light through it, brightest in the middle
  const g = c.createRadialGradient(W / 2, 330, 40, W / 2, 330, 620); g.addColorStop(0, '#e2e2e2'); g.addColorStop(0.55, '#b4b4b4'); g.addColorStop(1, '#6e6e6e');
  c.fillStyle = g; c.fillRect(-200, -200, W + 400, H + 400);
  c.save(); c.globalAlpha = 0.16; c.fillStyle = '#303030';
  for (let x = -200; x < W + 200; x += 34) c.fillRect(x, -200, 17, 680); for (let y = 30; y < 470; y += 34) c.fillRect(-200, y, W + 400, 17);
  c.restore();
  c.save(); c.globalAlpha = 0.5; for (const fx of [120, 300, 660, 850]) ink(c, quad([fx, 140], [fx + 14, 300], [fx - 6, 470], 10), 2, false, fx); c.restore();
  // the thing outside, a shadow pressed against the cloth
  if (sil > 0) {
    if (!SILC) { SILC = document.createElement('canvas'); SILC.width = W; SILC.height = H; }
    const g2 = SILC.getContext('2d'); g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, W, H);
    thing(g2, 1, lean, time, 660, 640); g2.globalCompositeOperation = 'source-in'; g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H); g2.globalCompositeOperation = 'source-over';
    c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = clamp(sil, 0, 1) * 0.78; c.filter = 'blur(5px)'; c.drawImage(SILC, 0, 0); c.restore();
  }
  // the floor: the mattress, wide and pale, a few quilting seams running off into the distance
  const F = TENT.floor - 130;
  c.fillStyle = '#d6d6d6'; c.fillRect(-200, F, W + 400, H - F + 200);
  const fg = c.createLinearGradient(0, F, 0, H); fg.addColorStop(0, 'rgba(0,0,0,0.18)'); fg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = fg; c.fillRect(-200, F, W + 400, H - F + 200);
  ink(c, [[-200, F], [W + 200, F]], 2.4, false, 3);
  for (let i = -3; i <= 3; i++) ink(c, [[W / 2 + i * 120, F + 4], [W / 2 + i * 330, H + 40]], 1.6, false, i + 9);
  // a glow round the light
  if (glow > 0) { const lg = c.createRadialGradient(640, 520, 6, 640, 520, 260); lg.addColorStop(0, `rgba(255,255,255,${0.35 * glow})`); lg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = lg; c.fillRect(-200, -200, W + 400, H + 400); }
  // the ceiling: three big swags between the high points, gingham, the rows of the check following the cloth
  const edge = (x) => 150 + sag + 46 * Math.pow(Math.abs(Math.sin(Math.PI * (x + 60) / 360)), 0.8) + Math.sin(time * 0.8 + x * 0.01) * 2;
  const pts = [[-200, -200], [W + 200, -200]]; for (let x = W + 200; x >= -200; x -= 10) pts.push([x, edge(x)]);
  fillPts(c, pts, '#ededed');
  c.save(); path(c, pts); c.clip(); c.fillStyle = 'rgba(40,40,40,0.3)';
  for (let x = -200; x < W + 200; x += 30) { c.beginPath(); c.moveTo(x, -200); c.lineTo(x + 15, -200); c.lineTo(x + 15 + (x - W / 2) * 0.06, edge(x) + 20); c.lineTo(x + (x - W / 2) * 0.06, edge(x) + 20); c.closePath(); c.fill(); }
  for (let k = 0; k < 8; k++) { c.beginPath(); for (let x = -200; x <= W + 200; x += 10) c.lineTo(x, edge(x) * (k / 8) - 10); for (let x = W + 200; x >= -200; x -= 10) c.lineTo(x, edge(x) * ((k + 0.5) / 8) - 10); c.closePath(); c.fill(); }
  c.restore();
  ink(c, pts.slice(2), 3.2, false, 4);
  for (const fx of [-60, 300, 660, 1020]) ink(c, quad([fx, -10], [fx + 6, edge(fx) * 0.5], [fx, edge(fx) - 4], 8), 2, false, fx);   // the folds down to the high points
  // its fingers, pressing the ceiling in from above
  if (sil > 0 && lean > 0.35) {
    const k = clamp((lean - 0.35) / 0.4, 0, 1) * clamp(sil, 0, 1);
    for (let i = 0; i < 4; i++) {
      const fx = 560 + i * 26, fy = edge(fx) - 70 + i * 4, len = (60 + i * 6) * k;
      c.save(); c.filter = 'blur(2px)'; c.globalAlpha = 0.55 * k; c.strokeStyle = '#2a2a2a'; c.lineCap = 'round'; c.lineWidth = 9;
      c.beginPath(); c.moveTo(fx, fy - 60); c.quadraticCurveTo(fx + 4, fy, fx + 2, fy + len * 0.5); c.stroke();
      c.globalAlpha = 0.5 * k; c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.moveTo(fx + 8, fy - 50); c.quadraticCurveTo(fx + 12, fy, fx + 10, fy + len * 0.45); c.stroke(); c.restore();
    }
  }
}
// a candle on the floor of the tent, and the little pillow he sits on
function candle(c, x, y, time) {
  cel(c, [[x - 7, y], [x - 7, y - 38], [x + 7, y - 38], [x + 7, y]], 2.4, WHITE, 3);
  cel(c, ellPts(x, y + 1, 16, 5, 20), 2.2, WHITE, 4);
  const fl = 1 + Math.sin(time * 9) * 0.06;
  cel(c, [...bez([x, y - 42], [x - 8, y - 48], [x - 4, y - 60 * fl], [x, y - 66 * fl], 8), ...bez([x, y - 66 * fl], [x + 4, y - 60 * fl], [x + 8, y - 48], [x, y - 42], 8).slice(1)], 1.8, '#ffffff', 5);
}
function thing(c, k, lean, time, x = 640, base = BUNK.floor - 4) {
  if (k <= 0) return;
  c.save(); c.globalAlpha = clamp(k, 0, 1); c.translate(x, base); c.rotate(-0.4 * lean); c.translate(Math.sin(time * 0.9) * 1.5, 0);
  c.filter = 'blur(1.2px)'; c.fillStyle = '#0e0e0e';
  c.beginPath(); c.moveTo(-14, 0); c.quadraticCurveTo(-18, -110, -12, -200); c.lineTo(-4, -200); c.quadraticCurveTo(-8, -110, -6, 0); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(14, 0); c.quadraticCurveTo(18, -110, 12, -200); c.lineTo(4, -200); c.quadraticCurveTo(8, -110, 6, 0); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-22, -190); c.bezierCurveTo(-36, -300, -30, -350, -10, -380); c.lineTo(14, -382); c.bezierCurveTo(34, -350, 36, -300, 22, -190); c.closePath(); c.fill();
  c.lineCap = 'round'; c.strokeStyle = '#0e0e0e';
  for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * 16, -364); c.quadraticCurveTo(sd * 50, -256, sd * (40 + lean * 30), -120 - lean * 40); c.lineWidth = 8; c.stroke(); for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(sd * (40 + lean * 30), -120 - lean * 40); c.lineTo(sd * (42 + lean * 30 + i * 6), -94 - lean * 40); c.lineWidth = 3; c.stroke(); } }
  c.beginPath(); c.moveTo(-5, -378); c.lineTo(-4, -408); c.lineTo(4, -408); c.lineTo(5, -378); c.fill();
  c.beginPath(); c.ellipse(0, -434, 29, 31, 0, 0, TAU); c.fill();
  c.filter = 'blur(0.6px)'; c.strokeStyle = '#e9e9e9'; c.fillStyle = '#e9e9e9';
  for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * 11, -440, 7.5, 8.5, 0, 0, TAU); c.lineWidth = 3; c.stroke(); c.beginPath(); c.arc(sd * 11, -440, 1.8, 0, TAU); c.fill(); }
  c.beginPath(); c.moveTo(-18, -424); c.quadraticCurveTo(0, -403, 18, -424); c.lineWidth = 2.6; c.stroke();
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 4.8, -421 + Math.abs(i) * -1.3); c.lineTo(i * 4.8, -415 + Math.abs(i) * -1.7); c.lineWidth = 1.3; c.stroke(); }
  c.filter = 'none'; c.restore();
}

// ---------------------------------------------------------------- cards and prompts ----------------------------------------------------------------
// hand lettering: each letter its own size, tilt and baseline, inked heavy with a drop shadow, along an arc if asked
function letter(c, s, x, y, size, { arc = 0, fill = WHITE, line = 7, seed = 1, shadow = true } = {}) {
  const r = rng(seed * 977), chars = [...s];
  c.save(); c.font = `bold ${size}px ${SERIF}`; c.textBaseline = 'middle'; c.textAlign = 'center';
  const ws = chars.map((ch) => c.measureText(ch).width * 0.96), total = ws.reduce((a, b) => a + b, 0);
  let cx = -total / 2;
  chars.forEach((ch, i) => {
    const w = ws[i], mid = cx + w / 2, u = total ? mid / (total / 2) : 0, ay = arc * u * u, rot = arc ? Math.atan(2 * arc * u / (total / 2)) : 0;
    c.save(); c.translate(x + mid, y + ay + (r() - 0.5) * size * 0.06); c.rotate(rot + (r() - 0.5) * 0.08); const sc = 1 + (r() - 0.5) * 0.1; c.scale(sc, sc * (1 + (r() - 0.5) * 0.08));
    if (shadow) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillText(ch, size * 0.05, size * 0.07); }
    c.lineWidth = line; c.lineJoin = 'round'; c.strokeStyle = INK; c.strokeText(ch, 0, 0); c.fillStyle = fill; c.fillText(ch, 0, 0);
    c.restore(); cx += w;
  });
  c.restore();
}
function bigText(c, s, x, y, size, { fill = WHITE, w = 6, italic = false } = {}) {
  c.save(); c.font = `${italic ? 'italic ' : ''}bold ${size}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = w; c.strokeStyle = INK; c.lineJoin = 'round'; if (w) c.strokeText(s, x, y); c.fillStyle = fill; c.fillText(s, x, y); c.restore();
}
// a title card of the period: a painted sunburst inside an iris ring
function sunburst(c, t) {
  const gr = c.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 560); gr.addColorStop(0, '#d4d2cc'); gr.addColorStop(1, '#6e6d69'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
  c.save(); c.translate(W / 2, H / 2); c.rotate(t * 0.05);
  for (let i = 0; i < 24; i++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 900, i / 24 * TAU, (i + 0.5) / 24 * TAU); c.closePath(); c.fillStyle = 'rgba(0,0,0,0.09)'; c.fill(); }
  c.restore();
  c.save(); c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2, H / 2, 330, 0, TAU, true); c.fillStyle = 'rgba(10,10,10,0.82)'; c.fill('evenodd'); c.restore();
  ink(c, ellPts(W / 2, H / 2, 332, 332, 90), 6, true, 3);
}
function titleCard(c, t) {
  sunburst(c, t);
  const pop = ease.back(k01(t, 0.15, 0.7));
  c.save(); c.translate(W / 2, 205); c.scale(pop, pop); letter(c, 'MISTER BUTTONS', 0, 0, 70, { arc: 26, seed: 3, line: 9 }); c.restore();
  if (t > 0.6) { c.globalAlpha = k01(t, 0.6, 0.9); letter(c, 'in', W / 2, 262, 30, { seed: 5, line: 5 }); c.globalAlpha = 1; }
  const pop2 = ease.back(k01(t, 0.9, 1.4));
  c.save(); c.translate(W / 2, 330); c.scale(pop2, pop2); letter(c, '"HUSH-A-BYE!"', 0, 0, 64, { seed: 7, line: 9 }); c.restore();
  // the star himself pops up under his name
  const m = ease.back(k01(t, 1.2, 1.8));
  if (m > 0) { c.save(); c.translate(W / 2, 540); c.scale(m * 0.85, m * 0.85); c.rotate(Math.sin(t * 4) * 0.05); drawBear(c, { x: 0, y: 140, sy: 1 - Math.abs(Math.sin(t * Math.PI / BEAT)) * 0.06, mouth: 'grin', open: 0.6, brow: 0.6, look: [0, 0.2], hands: { l: [-78, -246, 'wave', 1], r: [78, -246, 'wave', -1] }, legs: false }); c.restore(); }
  if (t > 1.6) { c.globalAlpha = k01(t, 1.6, 2.0); letter(c, 'A Bedtime Safety Picture', W / 2, 610, 26, { seed: 11, line: 5 }); c.globalAlpha = 1; }
}
function endCard(c, t) {
  sunburst(c, t);
  const pop = ease.back(k01(t, 0.15, 0.7));
  c.save(); c.translate(W / 2, 320); c.scale(pop, pop); letter(c, 'THE END', 0, 0, 120, { arc: 14, seed: 13, line: 12 }); c.restore();
  if (t > 0.7) { c.globalAlpha = k01(t, 0.7, 1.1); letter(c, 'Sleep tight, little sailors!', W / 2, 430, 32, { seed: 17, line: 6 }); letter(c, 'A Bedtime Safety Picture', W / 2, 500, 22, { seed: 19, line: 4 }); c.globalAlpha = 1; }
}
function iris(c, k, cx = W / 2, cy = H / 2) {
  if (k >= 1) return;
  c.save(); c.beginPath(); c.rect(-10, -10, W + 20, H + 20); c.arc(cx, cy, Math.max(0.1, k * 660), 0, TAU, true); c.fillStyle = '#080808'; c.fill('evenodd'); c.restore();
}
// the breath control as the player has it, drawn in the picture's own hand: an inked key cap for a keyboard, a round inked button for a
// pad (its name as that pad calls it), a hand-lettered "HOLD BREATH" plate for a touch screen. press 0..1 pushes it in
function keyCap(c, x, y, label, press, scheme, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const dy = press * 7;
  if (scheme === 'pad') {
    // a round button seen a little from above: its side, then its face, inked, the name in the middle
    cel(c, ellPts(0, 10, 50, 26, 40), 4, '#3a3a3a', 1);
    c.fillStyle = '#3a3a3a'; c.fillRect(-50, -6 + dy, 100, 16 - dy); ink(c, [[-50, -6 + dy], [-50, 10]], 3.4, false, 2); ink(c, [[50, -6 + dy], [50, 10]], 3.4, false, 3);
    cel(c, ellPts(0, -6 + dy, 50, 26, 40), 4, WHITE, 3);
    ink(c, ellPts(0, -6 + dy, 38, 18, 32), 2.2, true, 4);
    letter(c, label, 0, -7 + dy, label.length > 2 ? 26 : 34, { fill: INK, line: 0, shadow: false, seed: 5 });
  } else if (scheme === 'touch') {
    // a painted plate with the button's name lettered on it
    const w = 300, h = 74;
    cel(c, [[-w / 2 + 10, -h / 2 + dy], [w / 2 - 10, -h / 2 + dy], [w / 2, -h / 2 + 10 + dy], [w / 2, h / 2 - 10 + dy], [w / 2 - 10, h / 2 + dy], [-w / 2 + 10, h / 2 + dy], [-w / 2, h / 2 - 10 + dy], [-w / 2, -h / 2 + 10 + dy]], 4, WHITE, 6);
    ink(c, [[-w / 2 + 12, -h / 2 + 8 + dy], [w / 2 - 12, -h / 2 + 8 + dy], [w / 2 - 12, h / 2 - 8 + dy], [-w / 2 + 12, h / 2 - 8 + dy]], 1.8, true, 7);
    letter(c, label, 0, dy, 34, { fill: INK, line: 0, shadow: false, seed: 8 });
  } else {
    // a typewriter-style key: the dark skirt, the white top, inked, the letters on it
    const wide = Math.max(120, label.length * 26 + 56);
    const skirt = [[-wide / 2 - 8, -26], [wide / 2 + 8, -26], [wide / 2 + 12, 34], [-wide / 2 - 12, 34]];
    cel(c, skirt, 4, '#3a3a3a', 9);
    const top = [[-wide / 2, -42 + dy], [wide / 2, -42 + dy], [wide / 2 + 4, 18 + dy], [-wide / 2 - 4, 18 + dy]].map((p) => p);
    cel(c, [...quad(top[0], [0, -46 + dy], top[1], 10), ...quad(top[1], [wide / 2 + 6, -12 + dy], top[2], 8).slice(1), ...quad(top[2], [0, 22 + dy], top[3], 10).slice(1), ...quad(top[3], [-wide / 2 - 6, -12 + dy], top[0], 8).slice(1, -1)], 4, WHITE, 10);
    letter(c, label, 0, -12 + dy, label.length > 5 ? 30 : 36, { fill: INK, line: 0, shadow: false, seed: label.length });
  }
  c.restore();
}
function meter(c, x, y, v, label = 'BREATH METER') {
  c.save(); c.translate(x, y);
  letter(c, label, 0, -40, 22, { seed: 23, line: 5 });
  c.beginPath(); c.roundRect(-180, -16, 360, 34, 17); c.fillStyle = WHITE; c.fill(); c.lineWidth = 4; c.strokeStyle = INK; c.stroke();
  c.save(); c.beginPath(); c.roundRect(-175, -11, 350, 24, 12); c.clip(); c.fillStyle = v < 0.3 ? '#1a1a1a' : '#555'; c.fillRect(-175, -11, 350 * clamp(v, 0, 1), 24); c.restore();
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-180 + i * 90, -16); c.lineTo(-180 + i * 90, -6); c.lineWidth = 2.5; c.stroke(); }
  c.restore();
}
function wrap(c, text, maxW) {
  const words = text.split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const tryS = cur ? cur + ' ' + w : w; if (c.measureText(tryS).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryS; }
  if (cur) lines.push(cur); return lines;
}
function subtitle(c, text) {
  if (!text) return;
  c.save(); c.font = `italic 24px ${SERIF}`;
  const lines = wrap(c, text, 760), h = 24 + lines.length * 31, y = H - 24 - h;
  c.beginPath(); c.roundRect(80, y, W - 160, h, 6); c.fillStyle = 'rgba(10,10,10,0.86)'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#d8d8d8'; c.stroke();
  c.fillStyle = '#efefef'; c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((l, i) => c.fillText(l, W / 2, y + 12 + 15.5 + i * 31));
  c.restore();
}
function burst(c, x, y, r, n, t) {
  c.save(); c.translate(x, y); c.rotate(t * 0.6);
  const pts = []; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, rr = i % 2 ? r * 0.62 : r; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  cel(c, pts, 4.5, WHITE, 2); c.restore();
}
function leader(c, t) {
  c.fillStyle = '#8a8a8a'; c.fillRect(0, 0, W, H);
  const n = 3 - Math.floor(t / 0.8); if (n < 1) { c.fillStyle = '#161616'; c.fillRect(0, 0, W, H); return; }
  const f = (t % 0.8) / 0.8;
  c.save(); c.translate(W / 2, H / 2);
  c.fillStyle = '#6a6a6a'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 420, -Math.PI / 2, -Math.PI / 2 + f * TAU); c.closePath(); c.fill();
  c.strokeStyle = '#2a2a2a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-W, 0); c.lineTo(W, 0); c.moveTo(0, -H); c.lineTo(0, H); c.stroke();
  c.strokeStyle = '#ececec'; c.lineWidth = 5; for (const r of [190, 226]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
  bigText(c, String(n), 0, 10, 220, { fill: '#ececec', w: 8 });
  c.restore();
}

// ---------------------------------------------------------------- the print ----------------------------------------------------------------
// a decayed nitrate print run through a tired projector. The picture is drawn clean on the stage, then printed: shrunk and a little warped,
// weaving in the gate, softened with blooming whites, and then everything the years did to it: coarse grain that crawls, a density flicker
// that steps with the film's own 24 frames, dust and hairs, long scratches, emulsion blotches, uneven burnt edges, and every so often a
// splice that jumps the frame and drops a couple of frames. The damage steps at 24 a second like real film; the motion stays smooth
const FILM_FPS = 24;
const hash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
function filmKit() {
  const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
  const plates = [];
  for (let p = 0; p < 8; p++) {   // coarse grain: clumps (drawn up 2x), not pixel noise
    const cv = mk(480, 360), g = cv.getContext('2d'), im = g.createImageData(480, 360), r = rng(77 + p * 131);
    for (let i = 0; i < im.data.length; i += 4) { const v = r(), w = r(); im.data[i] = im.data[i + 1] = im.data[i + 2] = v > 0.5 ? 255 : 0; im.data[i + 3] = Math.pow(Math.abs(v - 0.5) * 2, 1.4) * 150 * (0.6 + w * 0.4); }
    g.putImageData(im, 0, 0); plates.push(cv);
  }
  // the edges of an old print: uneven, darker in some corners than others, with burnt-in blotches creeping in from the edge
  const edge = mk(W / 2, H / 2), eg = edge.getContext('2d'), er = rng(4242);
  const vg = eg.createRadialGradient(W / 4 + 14, H / 4 - 8, H * 0.15, W / 4, H / 4, H * 0.46); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.55, 'rgba(0,0,0,0.12)'); vg.addColorStop(1, 'rgba(0,0,0,0.78)');
  eg.fillStyle = vg; eg.fillRect(0, 0, W / 2, H / 2);
  eg.filter = 'blur(6px)';
  for (let i = 0; i < 46; i++) {
    const side = Math.floor(er() * 4), u = er(), x = side === 0 ? u * W / 2 : side === 1 ? W / 2 : side === 2 ? u * W / 2 : 0, y = side === 0 ? 0 : side === 1 ? u * H / 2 : side === 2 ? H / 2 : u * H / 2;
    eg.beginPath(); eg.ellipse(x, y, 8 + er() * 34, 6 + er() * 26, er() * 3, 0, TAU); eg.fillStyle = `rgba(0,0,0,${0.25 + er() * 0.4})`; eg.fill();
  }
  for (const [cx, cy, rr, a] of [[0, 0, 70, 0.7], [W / 2, H / 2, 90, 0.6], [W / 2, 0, 40, 0.45], [0, H / 2, 55, 0.5]]) { eg.beginPath(); eg.ellipse(cx, cy, rr, rr * 0.8, 0, 0, TAU); eg.fillStyle = `rgba(0,0,0,${a})`; eg.fill(); }
  eg.filter = 'none';
  // emulsion damage: soft irregular blotches, some where the silver has gone (light), some where it has bloomed (dark)
  const blot = [];
  for (let i = 0; i < 6; i++) {
    const cv = mk(96, 96), g = cv.getContext('2d'), r = rng(900 + i * 17); g.filter = 'blur(3px)';
    for (let k = 0; k < 5; k++) { g.beginPath(); for (let j = 0; j <= 18; j++) { const a2 = j / 18 * TAU, rr = (14 + r() * 16) * (0.7 + 0.3 * Math.sin(a2 * 3 + k)); g.lineTo(48 + (r() - 0.5) * 30 + Math.cos(a2) * rr, 48 + (r() - 0.5) * 30 + Math.sin(a2) * rr); } g.closePath(); g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`; g.fill(); }
    blot.push(cv);
  }
  const glow = mk(240, 180);
  return { plates, edge, blot, glow, gctx: glow.getContext('2d'), scratches: [], last: -1, splice: { next: 7, at: -9, frozen: false } };
}
// the film's frame number now, and a random number belonging to that frame (the same all the while that frame is up)
const filmFrame = (t) => Math.floor(t * FILM_FPS);
// print the stage into c: shrunk and warped, weaving, with the splice jump, softened and bloomed
function printFrame(c, kit, stage, t, { weave = 1, jumpY = 0 } = {}) {
  const fr = filmFrame(t), jx = (hash(fr * 3.1) - 0.5) * 1.6 * weave, jy = (hash(fr * 7.7) - 0.5) * 2.6 * weave;
  const wx = wob(t, 3.3, 7.9, 12.7) * 2.2 * weave + jx, wy = wob(t, 2.7, 6.1, 11.3) * 1.8 * weave + jy + jumpY;
  c.fillStyle = '#060606'; c.fillRect(0, 0, W, H);
  // a shrunken print: a touch smaller than the gate, and not quite flat (a slow S across it, and the bottom bowed)
  const SX = 0.984, SY = 0.978, ox = W * (1 - SX) / 2 + wx, oy = H * (1 - SY) / 2 + wy, strip = 12;
  const strips = (dy) => {
    for (let y = 0; y < H; y += strip) {
      const v = y / H, bend = Math.sin(v * 3.1 + 0.6) * 2.4 + Math.sin(v * 9.4 + t * 0.4) * 0.6, sq = 1 + (v - 0.5) * (v - 0.5) * 0.02;
      c.drawImage(stage, 0, y, W, strip, ox + bend - W * (sq - 1) / 2, oy + dy + y * SY, W * SX * sq, strip * SY + 0.8);
    }
  };
  strips(0);
  if (jumpY) strips(jumpY > 0 ? -H * SY - 22 : H * SY + 22);   // the neighbouring frame, with the frame line between them, while it rolls
  // soft focus and blooming whites: a blurred copy laid over the whole (more at the edges), and screened in so the whites spread
  kit.gctx.globalCompositeOperation = 'copy'; kit.gctx.drawImage(c.canvas, 0, 0, 240, 180);
  c.save(); c.globalAlpha = 0.28; c.drawImage(kit.glow, 0, 0, W, H); c.restore();
  c.save(); c.beginPath(); c.rect(0, 0, W, H); c.ellipse(W / 2, H / 2, W * 0.4, H * 0.38, 0, 0, TAU); c.clip('evenodd'); c.globalAlpha = 0.45; c.drawImage(kit.glow, 0, 0, W, H); c.restore();
  c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.26; c.drawImage(kit.glow, -8, -8, W + 16, H + 16); c.restore();
}
function film(c, kit, t, { flick = 1, dirt = 1 } = {}) {
  const dt = kit.last < 0 ? 1 / 60 : clamp(t - kit.last, 0, 0.1); kit.last = t;
  const fr = filmFrame(t), R = (k) => hash(fr * 13.37 + k * 1.618), r = Math.random;
  // grain: big crawling clumps, a new plate and a new offset every film frame
  c.save();
  for (let L = 0; L < 2; L++) { const pl = kit.plates[Math.floor(R(1 + L) * kit.plates.length)]; c.globalAlpha = L ? 0.2 : 0.34; c.drawImage(pl, -R(3 + L) * 120, -R(5 + L) * 90, (W + 120) * (L ? 1 : 1.3), (H + 90) * (L ? 1 : 1.3)); }
  c.restore();
  // emulsion blotches: a few per stretch of film, each held for a run of frames, then gone
  const run = Math.floor(fr / 9);
  c.save();
  for (let i = 0; i < 3; i++) {
    if (hash(run * 5 + i * 31) > 0.45 * dirt) continue;
    const x = hash(run * 7 + i) * W, y = hash(run * 11 + i) * H, sz = 40 + hash(run * 13 + i) * 120, light = hash(run * 17 + i) > 0.4;
    c.globalAlpha = 0.18 + hash(run * 19 + i) * 0.22; c.globalCompositeOperation = light ? 'screen' : 'multiply';
    if (!light) c.filter = 'invert(1)';
    c.drawImage(kit.blot[(run + i) % kit.blot.length], x - sz / 2, y - sz / 2, sz, sz * (0.6 + hash(run + i) * 0.6)); c.filter = 'none';
  }
  c.restore();
  // scratches: long ones that run down the whole frame and drift for seconds, and quick thin ones
  kit.scratches = kit.scratches.filter((s) => s.until > t);
  if (r() < 0.55 * dirt * dt) kit.scratches.push({ x: r() * W, vx: (r() - 0.5) * 30, born: t, until: t + 1 + r() * 3.5, white: r() < 0.7, w: 0.9 + r() * 1.6, a: 0.35 + r() * 0.35, y0: r() < 0.3 ? r() * H * 0.6 : 0 });
  if (r() < 2.2 * dirt * dt) kit.scratches.push({ x: r() * W, vx: 0, born: t, until: t + 0.08 + r() * 0.25, white: r() < 0.6, w: 0.6 + r(), a: 0.25 + r() * 0.3, y0: 0 });
  for (const s of kit.scratches) {
    const life = clamp(Math.min(t - s.born, s.until - t) / 0.08, 0, 1), on = hash(fr * 3 + s.born * 100) < 0.85 ? 1 : 0.3;
    const x = s.x + s.vx * (t - s.born) + (hash(fr + s.born) - 0.5) * 1.4;
    c.beginPath(); c.moveTo(x, s.y0); for (let y = s.y0; y <= H; y += 40) c.lineTo(x + Math.sin(y * 0.013 + s.born * 10) * 2.2, y);
    c.lineWidth = s.w; c.strokeStyle = s.white ? `rgba(245,245,245,${s.a * life * on})` : `rgba(8,8,8,${s.a * life * on})`; c.stroke();
  }
  // dust and hairs: on the frame for one film frame each, a dozen or more every frame (more as the print gets worse)
  const nd = Math.floor((6 + R(9) * 10) * dirt);
  for (let i = 0; i < nd; i++) {
    const h1 = hash(fr * 101 + i * 7.3), h2 = hash(fr * 57 + i * 3.1), h3 = hash(fr * 23 + i * 9.7), white = h3 < 0.45, a = 0.55 + h1 * 0.4;
    const col = white ? `rgba(245,245,245,${a})` : `rgba(8,8,8,${a})`, x = h1 * W, y = h2 * H;
    if (h3 > 0.8) {   // a hair
      const k = (j) => (hash(fr * 7 + i * 13 + j) - 0.5);
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + k(1) * 90, y + k(2) * 90, x + k(3) * 120, y + k(4) * 120, x + k(5) * 140, y + k(6) * 140); c.lineWidth = 1 + h2; c.strokeStyle = col; c.stroke();
    } else { const sz = 0.8 + Math.pow(h2 * h3, 0.7) * 6; c.beginPath(); c.ellipse(x, y, sz, sz * (0.6 + h1 * 0.4), h2 * 3, 0, TAU); c.fillStyle = col; c.fill(); }
  }
  // the density flicker, stepping with the film: frame to frame the whole picture is printed lighter or darker, and sometimes unevenly
  const f = ((R(21) - 0.5) * 0.13 + wob(t, 2.9, 5.3, 7.7) * 0.03) * flick;
  c.fillStyle = f > 0 ? `rgba(255,255,255,${f})` : `rgba(0,0,0,${-f})`; c.fillRect(0, 0, W, H);
  if (R(23) < 0.25) { const g = c.createLinearGradient(0, 0, W, 0), side = (R(24) - 0.5) * 0.16 * flick; g.addColorStop(0, `rgba(0,0,0,${Math.max(0, side)})`); g.addColorStop(1, `rgba(0,0,0,${Math.max(0, -side)})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  // a faded print: no true black, no true white
  c.save(); c.globalCompositeOperation = 'lighten'; c.fillStyle = '#191919'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'darken'; c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, W, H); c.restore();
  // the projector: a hot spot in the middle, falling off toward the corners, then the burnt, uneven edges of the print
  const pg = c.createRadialGradient(W / 2, H / 2 - 20, 40, W / 2, H / 2, H * 0.8); pg.addColorStop(0, 'rgba(255,255,255,0.07)'); pg.addColorStop(0.5, 'rgba(0,0,0,0)'); pg.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = pg; c.fillRect(0, 0, W, H);
  c.drawImage(kit.edge, 0, 0, W, H);
  c.save(); c.beginPath(); c.rect(-10, -10, W + 20, H + 20); c.roundRect(4, 3, W - 8, H - 6, 34); c.fillStyle = '#040404'; c.fill('evenodd'); c.restore();
}
// splices: every few seconds the film jumps where it was cut and taped, a frame or two is missing (the picture stutters), and the frame
// line rolls through. Returns { freeze, jumpY, flash } for the frame being shown
function splice(kit, t, often = 1) {
  const sp = kit.splice;
  if (t < sp.at - 0.5) { sp.at = -9; sp.next = t + 4; }   // the clock went back (a new showing)
  if (t >= sp.next) { sp.at = t; sp.next = t + (5 + Math.random() * 9) / often; sp.dir = Math.random() < 0.5 ? 1 : -1; }
  const k = t - sp.at;
  if (k < 0 || k > 0.25) return { freeze: false, jumpY: 0, flash: 0 };
  const n = Math.floor(k * FILM_FPS);   // film frames since the splice
  return { freeze: n < 3, jumpY: n < 3 ? sp.dir * H * [0.11, 0.06, 0.02][n] : 0, flash: n === 0 ? 0.3 : 0 };
}
function burnHole(c, k, time) {
  if (k <= 0) return;
  const r = rng(Math.floor(time * 15) * 31 + 7), R = k * 720;
  c.save(); c.translate(W / 2 + 40, H / 2 - 30);
  const blob = (rad, jag) => { c.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, rr = rad * (1 + Math.sin(a * 5 + k * 9) * 0.12 + Math.sin(a * 11) * 0.08 + (r() - 0.5) * jag); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.86); } c.closePath(); };
  blob(R * 1.3, 0.12); c.fillStyle = 'rgba(60,40,20,0.55)'; c.fill();
  blob(R * 1.08, 0.2); c.fillStyle = '#0c0c0c'; c.fill();
  blob(R, 0.25); c.fillStyle = '#ffffff'; c.fill();
  for (let i = 0; i < 10; i++) { const a = r() * TAU, rr = R * (1.05 + r() * 0.3); c.beginPath(); c.ellipse(Math.cos(a) * rr, Math.sin(a) * rr * 0.86, 3 + r() * 9, 3 + r() * 7, 0, 0, TAU); c.fillStyle = r() < 0.5 ? '#ffffff' : '#111'; c.fill(); }
  c.restore();
}

// the mouth for a moment of a line: the vowel (or lip consonant) at that point of the text, opened by the voice's loudness
function viseme(text, k, amp) {
  if (amp < 0.12) return { mouth: 'mm', open: 0 };
  const s = text.toLowerCase().replace(/[^a-z ]/g, ''), i = Math.floor(clamp(k, 0, 0.999) * s.length);
  for (let d = 0; d < 3; d++) for (const j of [i + d, i - d]) {
    const ch = s[j]; if (!ch) continue;
    if ('fv'.includes(ch)) return { mouth: 'fff', open: amp };
    if ('mbp'.includes(ch) && amp < 0.45) return { mouth: 'mm', open: 0 };
    if ('ouw'.includes(ch)) return { mouth: 'ooh', open: amp };
    if ('eiy'.includes(ch)) return { mouth: 'eeh', open: amp };
    if (ch === 'a') return { mouth: 'aah', open: amp };
  }
  return { mouth: amp > 0.5 ? 'aah' : 'eeh', open: amp };
}

// a model sheet: the turnaround (front, three-quarter, profile, back), the expressions and the gloves
export function modelSheet(c) {
  c.fillStyle = '#d4d2cc'; c.fillRect(0, 0, c.canvas.width, c.canvas.height); INKT.t = 0.3;
  const B = { s: 1, look: [0, 0], brow: 0.4, face: 'smile', hands: { l: [-80, -86, 'open', -1], r: [80, -86, 'open', -1] } };
  drawBear(c, { ...B, x: 130, y: 470 });
  drawBear(c, { ...B, x: 370, y: 470, view: 'three', dir: 1, face: 'grin', hands: { l: [-60, -86, 'open', -1], r: [76, -86, 'open', -1] } });
  drawBear(c, { ...B, x: 600, y: 470, view: 'side', dir: 1, face: 'grin', hands: { l: [0, -86, 'open', -1], r: [10, -86, 'open', -1] } });
  drawBear(c, { ...B, x: 830, y: 470, view: 'back' });
  const faces = ['grin', 'angry', 'cry', 'wince', 'sly', 'o', 'worried'];
  faces.forEach((f, i) => { c.save(); c.translate(1010 + (i % 4) * 128, 120 + Math.floor(i / 4) * 150); c.scale(0.95, 0.95); bearHead(c, { face: f, look: [0, 0], brow: f === 'o' ? 1 : 0.4 }); c.restore(); });
  ['point', 'fist', 'open', 'peace', 'thumb', 'wave'].forEach((k, i) => glove(c, 1010 + (i % 3) * 150, 430 + Math.floor(i / 3) * 120, -Math.PI / 2 + (k === 'point' ? Math.PI / 2 : 0), k, 2.0, 1));
}
// the bear in five arm poses, close, for checking the arms against period references: a wave, a point, the finger-wag, arms down at rest,
// and gripping the covers
export function poseSheet(c) {
  c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, c.canvas.width, c.canvas.height); INKT.t = 0.3;
  const base = { s: 1, legs: false, face: 'smile', look: [0, 0], brow: 0.5 };
  const poses = [
    { hands: { l: [-84, -92, 'open', -1], r: [142, -236, 'wave', -1] }, face: 'grin' },
    { hands: { l: [-84, -92, 'open', -1], r: [150, -170, 'point', -1] } },
    { hands: { l: [-84, -92, 'open', -1], r: [104, -212, 'shh', -1] }, face: 'sly' },
    { hands: { l: [-84, -92, 'open', -1], r: [84, -92, 'open', -1] } },
    { cover: true },
  ];
  poses.forEach((q, i) => {
    const x = 130 + i * 270, y = 430;
    if (q.cover) {
      const py = 330 + 14 - y; drawBear(c, { ...base, x, y, hands: { l: [-48, py, 'fist', -1], r: [52, py, 'fist', 1] } });
      c.save(); c.beginPath(); c.rect(x - 115, 0, 230, 600); c.clip(); quilt(c, 300, 470, x - 110, x + 110, { flat: 360, hump: [x, 92] }); c.restore();
      glove(c, x - 48, 344, -1.25, 'fist', GLOVE_S, 1, false); glove(c, x + 52, 344, -1.9, 'fist', GLOVE_S, -1, false);
    } else drawBear(c, { ...base, ...q, x, y });
  });
}
// a sheet of the hands, arms and legs at the picture's scale (for checking them against period references)
export function limbSheet(c) {
  const Wd = c.canvas.width, S = 1.25; c.fillStyle = '#e9e9e9'; c.fillRect(0, 0, Wd, c.canvas.height);
  const arm = (x0, y0, x1, y1, side, kind, flip, rest) => { const c2 = hose(c, x0, y0, x1, y1, side, rest * S, [0, 0], 20 * S); glove(c, x1, y1, Math.atan2(y1 - c2[1], x1 - c2[0]), kind, GLOVE_S * S, flip); };
  // the poses, each on a long arm swung down into a U
  ['open', 'wave', 'point', 'fist', 'thumb', 'stop', 'shh', 'clap'].forEach((k, i) => { const x = 80 + i * 150; arm(x - 42, 70, x + 18, 80, 1, k, 1, 190); });
  // a pair of long arms bending into an S, a C and a reach
  arm(140, 340, 290, 300, 1, 'wave', 1, 230); arm(470, 300, 400, 400, -1, 'point', 1, 200); arm(620, 330, 760, 330, -1, 'open', 1, 260); arm(900, 380, 1060, 300, 1, 'thumb', 1, 210);
  // the legs, long noodles ending in big round shoes: straight, bowed, both kicked one way, crossed, a step
  [[1, -1, 0, 0, 185], [1, -1, 0, 0, 240], [-1, -1, 10, 10, 230], [1, 1, -10, -10, 230], [-1, 1, 40, -40, 200], [-1, 1, -6, 6, 260]].forEach(([sl, sr, ol, or, rest], i) => {
    const x0 = 105 + i * 205, y0 = 440, fy = y0 + 190;
    const fl = [x0 - 38 + ol, fy], fr = [x0 + 40 + or, fy];
    hose(c, x0 - 12, y0, fl[0], fl[1] - 22, sl, rest, [0, 0], 17 * S); hose(c, x0 + 12, y0, fr[0], fr[1] - 22, sr, rest, [0, 0], 17 * S);
    shoe(c, fl[0], fl[1], -1, 1.15 * S); shoe(c, fr[0], fr[1], 1, 1.15 * S);
  });
}

export function createCartoon({ audio, getLabel = () => ({ text: 'SPACE', scheme: 'kb' }), breathDown = () => false, skipDown = () => false, subtitles = () => true, lines = {} } = {}) {
  let cv = null, ctx = null, stage = null, sctx = null, pcv = null, pctx = null, kit = null, root = null, skipEl = null, touchEl = null;
  const st = { on: false, t: 0, seg: 0, segT: 0, vo: null, voT: 0, holdT: 0, holding: false, latch: false, prevDown: false, downAt: 0, tries: 0,
    passed: false, holdSaid: false, whoopsT: -9, skipK: 0, skippable: false, done: null, sources: [], music: null, projector: null, log: null, offline: false, touch: { breath: false, skip: false } };
  // the narrator's lines are vo/cartoon/c_*, Mister Buttons' own barks vo/buttons/b_*
  const voKey = (id) => (id.startsWith('b_') ? 'vo/buttons/' : 'vo/cartoon/') + id;
  const dur = (id) => { const b = audio && audio.buf && audio.buf[voKey(id)]; return b ? b.duration : (VO[id] || 1); };
  const envs = {};
  const envOf = (id) => {
    if (envs[id]) return envs[id];
    const b = audio && audio.buf && audio.buf[voKey(id)]; if (!b) return null;
    const d = b.getChannelData(0), step = Math.floor(b.sampleRate / 60), n = Math.floor(d.length / step), out = new Float32Array(n); let pk = 1e-4;
    for (let i = 0; i < n; i++) { let s2 = 0; for (let j = 0; j < step; j++) s2 += d[i * step + j] ** 2; out[i] = Math.sqrt(s2 / step); pk = Math.max(pk, out[i]); }
    // smoothed, so the mouth moves like a drawn mouth (a little ahead of the sound), not a meter
    let m = 0; for (let i = 0; i < n; i++) { const v = Math.min(1, out[i] / pk * 1.3); m += (v - m) * (v > m ? 0.6 : 0.25); out[i] = m; }
    return (envs[id] = out);
  };
  const text = (id) => { const l = lines[(id.startsWith('b_') ? 'buttons/' : 'cartoon/') + id]; return l ? (l.html || l.say || '').replace(/<[^>]+>/g, '').replace(/\[[^\]]*\]\s*/g, '') : ''; };

  // ---- sound: buffers on the game's buses, stoppable; offline it is only written down
  // the old optical soundtrack: everything but the projector goes through it. Mono, only 300-3000 Hz, a little overdriven, with the
  // speed wobbling (wow, and a faster flutter) and a bed of hiss and crackle under it while the picture runs
  const tracks = new Map(); let wobble = null, noise = null, bed = null;
  function soundtrack(bus) {
    const a = audio.ctx;
    if (!tracks.has(bus)) {
      const hp = a.createBiquadFilter(), lp = a.createBiquadFilter(), sh = a.createWaveShaper(), lp2 = a.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = 0.9; lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 1.1; lp2.type = 'lowpass'; lp2.frequency.value = 4200;
      const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); } sh.curve = curve;
      hp.connect(lp).connect(sh).connect(lp2).connect(bus);
      tracks.set(bus, hp);
    }
    if (!wobble) {
      // the wow and flutter, in cents, fed to every source's detune
      const wow = a.createOscillator(), wg = a.createGain(), fl = a.createOscillator(), fg = a.createGain(), mod = a.createGain();
      wow.frequency.value = 0.55; wg.gain.value = 14; fl.frequency.value = 7.3; fg.gain.value = 4; mod.gain.value = 1;
      wow.connect(wg).connect(mod); fl.connect(fg).connect(mod); wow.start(); fl.start(); wobble = mod;
      // hiss and crackle: two seconds of it, looped
      const n = a.sampleRate * 2, nb = noise = a.createBuffer(1, n, a.sampleRate), d = nb.getChannelData(0), r = rng(31);
      for (let i = 0; i < n; i++) d[i] = (r() - 0.5) * 0.05;
      for (let k = 0; k < 70; k++) { const at = Math.floor(r() * (n - 400)), amp = (0.15 + r() * 0.6) * (r() < 0.5 ? 1 : -1), len = 20 + Math.floor(r() * 200); for (let j = 0; j < len; j++) d[at + j] += amp * Math.exp(-j / (len / 5)) * (j % 2 ? 1 : 0.6); }
    }
    return { input: tracks.get(bus), mod: wobble };
  }
  function crackle(on) {
    if (!audio || !audio.ctx || st.offline) return;
    const a = audio.ctx;
    if (on && !bed) {
      const tr = soundtrack(audio.buses.sfx), src = a.createBufferSource(), g = a.createGain(); src.buffer = noise; src.loop = true; g.gain.value = 0.5;
      src.connect(g).connect(tr.input); src.start(); bed = { src, g };
    } else if (!on && bed) { try { bed.g.gain.setTargetAtTime(0, a.currentTime, 0.1); bed.src.stop(a.currentTime + 0.5); } catch (e) { /* done */ } bed = null; }
  }
  function snd(id, { gain = 1, loop = false, rate = 1, at = 0, key = null } = {}) {
    const when = st.t + at;
    if (st.log) st.log.push({ t: when, id, gain, loop, rate, key });
    if (!audio || !audio.ctx || st.offline) return null;
    const b = audio.buf && audio.buf[id]; if (!b) return null;
    const a = audio.ctx, src = a.createBufferSource(), g = a.createGain(); src.buffer = b; src.loop = loop; src.playbackRate.value = rate; g.gain.value = gain;
    const bus = audio.buses[audio.kindOf(id)] || audio.buses.sfx;
    if (id.startsWith('sfx/projector')) src.connect(g).connect(bus);
    else { const tr = soundtrack(bus); tr.mod.connect(src.detune); src.connect(g).connect(tr.input); src.addEventListener('ended', () => { try { tr.mod.disconnect(src.detune); } catch (e) { /* gone */ } }); }
    src.start(a.currentTime + at);
    const h = { src, g, key }; st.sources.push(h); src.onended = () => { st.sources = st.sources.filter((x) => x !== h); }; return h;
  }
  // stop the sounds started with this key (the held-breath tension, when the breath is let go)
  function hush(key, fade = 0.06) {
    if (st.log) st.log.push({ t: st.t, id: 'KILL', key });
    if (!audio || !audio.ctx) return;
    const now = audio.ctx.currentTime;
    for (const h of st.sources.filter((x) => x.key === key)) { try { h.g.gain.setTargetAtTime(0, now, fade / 3); h.src.stop(now + fade + 0.05); } catch (e) { /* done */ } }
    st.sources = st.sources.filter((x) => x.key !== key);
  }
  // the band drops right down while he holds his breath, leaving the tick-tock
  function duck(on) {
    if (st.log) st.log.push({ t: st.t, id: on ? 'DUCK' : 'UNDUCK' });
    if (st.music && st.music.g && audio && audio.ctx) { try { st.music.g.gain.setTargetAtTime(on ? 0.12 : 0.6, audio.ctx.currentTime, 0.12); } catch (e) { /* offline */ } }
  }
  function say(id, at = 0) { st.vo = id; st.voT = st.t + at; snd('vo/cartoon/' + id, { gain: 1.35, at }); }
  // his own little noises: the only thing his mouth moves to (the narrator is off screen)
  function bark(id, at = 0, gain = 1.15) { st.bark = id; st.barkT = st.t + at; snd('vo/buttons/' + id, { gain, at }); }
  function stopAll(fade = 0.08) {
    if (st.log) st.log.push({ t: st.t, id: 'STOP' });
    if (!audio || !audio.ctx) return;
    const now = audio.ctx.currentTime;
    for (const h of st.sources) { try { h.g.gain.setTargetAtTime(0, now, fade / 3); h.src.stop(now + fade + 0.05); } catch (e) { /* already stopped */ } }
    st.sources = [];
  }
  function talk() {
    if (!st.bark) return 0;
    const e = envOf(st.bark), x = st.t - st.barkT + 0.05; if (x < 0 || x > dur(st.bark)) return 0;
    if (!e) return 0.5 + 0.5 * Math.sin(x * 22);
    const i = x * 60, i0 = Math.floor(i), k = i - i0; return lerp(e[Math.min(e.length - 1, i0)] || 0, e[Math.min(e.length - 1, i0 + 1)] || 0, k);
  }
  // the mouth shape now: the vowel at this point of the current line, opened by the voice
  const VIS = { mouth: 'mm', open: 0 };
  function lipSync() { const a = talk(); if (!st.bark || a < 0.08) { VIS.mouth = 'mm'; VIS.open = 0; return; } const v = viseme(text(st.bark), (st.t - st.barkT) / dur(st.bark), a); VIS.mouth = v.mouth; VIS.open = v.open; }
  const saying = () => !!st.vo && st.t - st.voT < dur(st.vo) + 0.15 && st.t >= st.voT;
  const barking = () => !!st.bark && st.t - st.barkT < dur(st.bark) + 0.1 && st.t >= st.barkT;
  const blinkAt = (t, every = 3.7) => { const p = (t % every) / every; return p > 0.94 ? Math.sin((p - 0.94) / 0.06 * Math.PI) : 0; };

  // ---- the camera: a zoom about a focus point; the painted wall moves less than the room (a touch of multiplane)
  // (kept inside the painted set: never so far over that the edge of the backdrop shows)
  const camera = (cam) => { const z = Math.max(1, cam.z || 1), hx = W / (2 * z), hy = H / (2 * z); return { z, x: clamp(cam.x ?? W / 2, hx, W - hx), y: clamp(cam.y ?? H / 2, hy, H - hy) }; };
  function withCam(c, cam, depth, fn) {
    const z = 1 + (cam.z - 1) * depth, fx = W / 2 + (cam.x - W / 2) * depth, fy = H / 2 + (cam.y - H / 2) * depth;
    c.save(); c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-fx, -fy); fn(c); c.restore();
  }
  // a room shot: the painted backdrop (lit, or by moonlight), the bunk bed's back, the bottom bunk, the bear
  // in the top bunk under its quilt (his gloves on its edge), the bunk's front, and a bear out of bed in front of it all
  let ROOM = null, BUNKS = null;
  function room(c, cam, { dark = 0, cover = COVER, bear = null, inBed = null, time = 0 } = {}) {
    if (!ROOM) { ROOM = paintRoom(); BUNKS = paintBunk(); }
    const paint = (cc, L) => { cc.drawImage(L.lit, 0, 0, W, H); if (dark > 0) { cc.globalAlpha = Math.min(1, dark); cc.drawImage(L.dark, 0, 0, W, H); cc.globalAlpha = 1; } };
    withCam(c, cam, 0.88, (cc) => {
      paint(cc, ROOM);
      if (dark > 1) { cc.fillStyle = `rgba(8,8,8,${0.4 * (dark - 1)})`; cc.fillRect(-300, -300, W + 600, H + 600); }
    });
    withCam(c, cam, 1, (cc) => {
      paint(cc, BUNKS.back);
      lowerQuilt(cc, dark);
      let paws = null;
      if (inBed) {
        const s = inBed.s || 1, py = (cover + 14 - inBed.y) / s, h = { ...(inBed.hands || {}) };
        // with his gloves on the quilt's edge, his arms reach to them under it
        if (inBed.under > 0.6) { h.l = [-40, -120, 'none', 1]; h.r = [40, -120, 'none', -1]; }   // hands tucked in, out of sight
        else if (inBed.paws !== false) { h.l = [-48, py, 'none', -1]; if (inBed.paws !== 'l') h.r = [52, py, 'none', 1]; paws = [inBed.x - 48 * s, inBed.paws !== 'l' ? inBed.x + 52 * s : null, s]; }
        drawBear(cc, { T: time, ...inBed, hands: h });
      }
      let bumps = null;
      if (inBed) {
        // over him: up to his chin (or his eyes) it is one hump; pulled right over, it takes his shape: a round head, two ear nubs, the shoulders
        const s = inBed.s || 1, u = clamp(inBed.under || 0, 0, 1), sx = inBed.sx || 1, puff = inBed.puff || 0, R = 54 * 1.18 * s * (inBed.headS || 1) * (1 + puff * 0.28);
        const hy = inBed.y - 226 * s * (inBed.sy || 1), headTop = hy - R - 4;
        bumps = [[inBed.x, lerp(92 * s * sx, R * 1.25, u), lerp(cover, headTop + 6, u), lerp(2.4, 3, u)], [inBed.x, lerp(118, 185, u) * s * sx, lerp(cover, hy + R * 0.6, u), 2.2]];
        if (u > 0.3) for (const sd of [-1, 1]) bumps.push([inBed.x + sd * 40 * 1.18 * s, 38 * s, lerp(lerp(cover, headTop, u) + 10, headTop - 9, k01(u, 0.3, 1)), 2.6]);   // two small soft ear nubs
        if (u > 0) cover = lerp(cover, headTop, u);
      }
      quilt(cc, cover, 442, 296, 748, { flat: 414, bumps });
      paint(cc, BUNKS.front);
      if (paws) { glove(cc, paws[0], cover + 14, -1.25, 'fist', paws[2] * GLOVE_S, 1, false); if (paws[1] != null) glove(cc, paws[1], cover + 14, -1.9, 'fist', paws[2] * GLOVE_S, -1, false); }
      if (bear) drawBear(cc, { T: time, ...bear });
    });
  }
  const FLOOR = BUNK.floor - 2, SX = 735, BED = { x: 500, y: 460, s: 1.12 }, COVER = 305;
  // the idle: a small bob on the beat and a breath, nothing more. The big squash and stretch is kept for the actions
  const bob = (T) => { const ph = (T / BEAT) % 1, down = Math.pow(Math.abs(Math.cos(Math.PI * ph)), 3); return { sy: (1 - 0.018 * down) * (1 + 0.014 * Math.sin(T * 2.2)), up: (1 - down) * 2.5, sway: Math.sin(Math.PI * T / BEAT) * 0.25 }; };   // and a slow breath
  const sitUp = (T, extra = {}) => { const b = bob(T); return { ...BED, y: BED.y - b.up * 0.5, sy: b.sy, lean: b.sway * 0.03, tilt: -b.sway * 0.04, legs: false, ...extra }; };
  // a jump between two points: a crouch (anticipation), a stretched arc, a squash on landing and a short settle
  const jump = (t, t0, t1, from, to, height) => {
    const pre = 0.22, k = k01(t, t0, t1), ka = ease.inOut(k), air = Math.sin(Math.PI * k);
    const crouch = t < t0 ? ease.inOut(k01(t, t0 - pre, t0)) : 0, land = t > t1 ? Math.exp(-(t - t1) * 9) * Math.cos((t - t1) * 20) : 0;
    const vy = Math.cos(Math.PI * k) * height * Math.PI / (t1 - t0), vx = (to[0] - from[0]) / (t1 - t0);
    return { x: lerp(from[0], to[0], ka), y: lerp(from[1], to[1], ka) - air * height, k, air, crouch, land,
      sy: t < t0 ? 1 - crouch * 0.25 : t < t1 ? 1 + air * 0.14 + 0.06 * (1 - air) : 1 - 0.26 * Math.max(0, land),
      smear: t > t0 && t < t1 && Math.abs(Math.cos(Math.PI * k)) > 0.75 ? [-vx * 0.012, vy * 0.012] : null };   // only at the very fastest moment, and slight
  };

  // inside the tent: the set, his little pillow and the candle, and him (sitting cross-legged on the pillow, or standing, or flying about)
  const TX = 450, TS = 1.32;
  function tent(c, cam, set, bear, { sitting = false, pillow = true, before = null, after = null, clipX = null } = {}) {
    withCam(c, cam, 1, (cc) => {
      tentSet(cc, set);
      if (before) before(cc);
      if (pillow) cel(cc, [...bez([TX - 70, TENT.floor + 4], [TX - 80, TENT.floor - 22], [TX + 80, TENT.floor - 22], [TX + 70, TENT.floor + 4], 14), ...quad([TX + 70, TENT.floor + 4], [TX, TENT.floor + 16], [TX - 70, TENT.floor + 4], 10).slice(1)], 2.6, WHITE, 2);
      candle(cc, 650, TENT.floor + 6, set.time || 0);
      if (bear) {
        cc.save(); if (clipX != null) { cc.beginPath(); cc.rect(clipX, -2000, 6000, 6000); cc.clip(); }
        if (sitting) {   // cross-legged: the feet crossed in front
          drawBear(cc, { legs: false, ...bear });
          const s = bear.s || TS; shoe(cc, bear.x - 30 * s, bear.y + 10, 1, 1.0 * s); shoe(cc, bear.x + 30 * s, bear.y + 10, -1, 1.0 * s);
        } else drawBear(cc, bear);
        cc.restore();
      }
      if (after) after(cc);
    });
  }
  const sitT = (T, extra = {}) => { const b = bob(T); return { x: TX, y: TENT.floor + 6 - b.up * 0.5, feet: { l: [-28, 0], r: [28, 0] }, s: TS, sy: b.sy, lean: b.sway * 0.03, tilt: -b.sway * 0.04, T, look: [0, 0], brow: 0.6, face: 'smile',
    hands: { l: [-80, -96, 'open', -1], r: [80, -96, 'open', -1] }, ...extra }; };

  // ---- the segments: { len(), enter(), draw(c, t, T, ui) }  (t: time in the segment, T: the whole picture's clock, ui: overlay draws)
  const SEG = [
    { name: 'leader', len: () => 2.7, enter() { st.projector = snd('sfx/projector', { gain: 0.35, loop: true }); crackle(true); }, draw(c, t) { leader(c, t); } },
    { name: 'title', len: () => 4.4, enter() { st.music = snd('music/cartoon', { gain: 0.6 }); },
      draw(c, t) { titleCard(c, t); iris(c, 1 - ease.in(k01(t, 3.8, 4.4))); } },
    { name: 'hello', len: () => 1.95 + dur('c_hello') + 0.35, enter() { snd('sfx/slide_up', { gain: 0.7, at: 0.25 }); snd('sfx/boing', { gain: 0.7, at: 1.02 }); bark('b_aww', 1.12); say('c_hello', 1.95); },
      draw(c, t, T) {
        // he hops in from the right, lands by the bunk bed in a squash, and waves: the body stays planted, the arm does the waving
        const j = jump(t, 0.32, 1.02, [1160, FLOOR], [SX, FLOOR], 130), inAir = t < 1.02, waving = t > 1.35, wv = Math.sin(t * 7), b = bob(T);
        const cam = camera({ z: lerp(1.22, 1.28, ease.inOut(k01(t, 1.2, 1.95 + dur('c_hello')))), x: SX - 110, y: 470 });
        room(c, cam, { time: T, cover: COVER + 10, bear: {
          x: t < 0.32 ? 1160 : j.x, y: t < 0.32 ? FLOOR : j.y, s: 1, sy: inAir ? j.sy : j.sy * b.sy, smear: j.smear,
          lean: inAir ? -0.2 * j.air : 0, tilt: inAir ? 0.12 * j.air : (waving ? wv * 0.04 : 0),
          talk: talk(), look: [-0.2, 0.1], brow: inAir ? 1 : 0.6, lid: blinkAt(T), face: inAir ? 'o' : t < 1.2 ? 'smile' : 'grin', eyeS: inAir ? 1.12 : 1,
          hands: inAir ? { l: [-104, -228, 'open', 1], r: [104, -228, 'open', -1] } : { l: [-84, -92, 'open', -1], r: waving ? [138 + wv * 20, -236 + Math.abs(wv) * 12, 'wave', -1] : [84, -92, 'open', -1] },
          feet: inAir ? { l: [-28, -24], r: [28, -12] } : { l: [-30, 0], r: [30, 0] } } });
        iris(c, ease.out(k01(t, 0, 0.6)));
      } },
    { name: 'creep', len: () => 0.4 + dur('c_creep') + 0.3, enter() { say('c_creep', 0.55); snd('sfx/slide_down', { gain: 0.3, at: 0.05, rate: 0.7 }); bark('b_eep', 0.1); },
      draw(c, t, T) {
        // the lights go: he shrinks into himself and holds there, fists at his chest, only his eyes moving
        const d = ease.inOut(k01(t, 0, 0.6));
        room(c, camera({ z: 1.25, x: SX - 110, y: 480 }), { dark: d, time: T, cover: COVER + 10, bear: { x: SX, y: FLOOR, s: 1, sy: lerp(1, 0.9, d) * bob(T).sy, lean: -0.04 * d,
          talk: 0, face: 'worried', look: [clamp(Math.sin(t * 1.3) * 2, -1, 1) * 0.8, 0.05], brow: 0.8, lid: 0,
          hands: { l: [-30, -112, 'fist', -1], r: [30, -112, 'fist', -1] }, feet: { l: [-16, 0], r: [16, 0] } } });
      } },
    { name: 'duck', len: () => Math.max(dur('c_duck'), 2.7) + 0.45, enter() { say('c_duck', 0); snd('sfx/slide_up', { gain: 0.7, at: 0.4 }); snd('sfx/boing', { gain: 0.6, at: 0.95 }); bark('b_hup', 0.36, 0.9); },
      draw(c, t, T) {
        // into bed in one clear action: he looks up at the top bunk and crouches; one clean hop up onto it; he lands sitting (a squash),
        // and pulls the covers up to his chin with both gloves; a little wiggle; then the covers right over his head, a bear-shaped lump
        const A = 0.4, L = 0.95, cam = camera({ z: 1.05, x: 560, y: 420 });
        if (t < L) {
          const k = k01(t, A, L), ka = ease.inOut(k), air = Math.sin(Math.PI * k), crouch = ease.inOut(k01(t, 0.05, A)) * (t < A ? 1 : 1 - k01(t, A, A + 0.08));
          const x = lerp(SX, BED.x + 30, ka), y = lerp(FLOOR, BED.y - 40, ka) - air * 80, fast = Math.abs(Math.cos(Math.PI * k)) > 0.8 && t > A;
          room(c, cam, { dark: 1, time: T, cover: 415, bear: { x, y, s: lerp(1, BED.s, ka), sy: t < A ? 1 - crouch * 0.24 : 1 + air * 0.1, lean: t < A ? 0.05 * crouch : -0.18 * air, tilt: 0,
            smear: fast ? [(SX - BED.x) * 0.012, 0] : null, face: 'o', eyeS: 1.08, look: [-0.8, -0.8], brow: 1,
            hands: t < A ? { l: [-84, -92 + crouch * 10, 'open', -1], r: [84, -92 + crouch * 10, 'open', -1] } : { l: [-104, -228, 'open', 1], r: [104, -228, 'open', -1] },
            feet: t < A ? { l: [-30, 0], r: [30, 0] } : { l: [-20, -26 * air], r: [20, -20 * air] } } });
        } else {
          const u = t - L, squash = Math.max(0, Math.exp(-u * 9) * Math.cos(u * 18)), pull = ease.inOut(k01(t, L + 0.3, L + 0.8));
          const wig = k01(t, L + 0.85, L + 1.2), wiggle = wig > 0 && wig < 1 ? Math.sin(wig * Math.PI * 4) * 0.035 * (1 - wig) : 0;
          const over = ease.inOut(k01(t, L + 1.3, L + 1.75));   // and then right over his head
          room(c, cam, { dark: 1, time: T, cover: lerp(415, COVER, pull),
            inBed: sitUp(T, { sy: 1 - squash * 0.2, sx: 1 + squash * 0.1 + wiggle, under: over, talk: talk() * 0.6, face: pull < 1 ? 'o' : 'smile', eyeS: pull < 1 ? 1.06 : 1, look: [0.4, 0], brow: 0.8, lid: wig >= 1 ? blinkAt(T + 1) : 0 }) });
        }
      } },
    { name: 'tent', len: () => 4.3, enter() { snd('sfx/slide_up', { gain: 0.35, at: 2.05, rate: 0.8 }); snd('sfx/boing', { gain: 0.35, at: 2.3, rate: 1.2 }); bark('b_sigh', 2.55); },
      draw(c, t, T) {
        // inside, under the covers, it's huge. He walks in, stops, looks all round and up at the gingham sky, and sits down on his pillow
        const cam = camera({ z: 1, x: W / 2, y: H / 2 }), set = { time: T };
        if (t < 2.2) {
          const wk = k01(t, 0, 1.3), x = lerp(-80, TX, ease.out(wk)), f = t < 1.3 ? Math.sin(t * 12) : 0, look = k01(t, 1.3, 2.1);
          tent(c, cam, set, { T, x, y: TENT.floor + 6, s: TS, sy: 1 - Math.abs(f) * 0.03, face: t < 1.3 ? 'smile' : 'o', eyeS: t < 1.3 ? 1 : 1.12, brow: t < 1.3 ? 0.5 : 1,
            look: t < 1.3 ? [1, 0] : [Math.sin(look * Math.PI * 1.5) * 0.9, -0.8], hands: { l: [-84 + f * 10, -92, 'open', -1], r: [84 - f * 10, -92, 'open', -1] },
            feet: { l: [-26 + f * 16, -Math.max(0, f) * 10], r: [26 - f * 16, -Math.max(0, -f) * 10] } }, { sitting: false });
        } else {
          const sq = Math.max(0, Math.exp(-(t - 2.2) * 9) * Math.cos((t - 2.2) * 18));
          tent(c, cam, set, sitT(T, { sy: 1 - sq * 0.2, sx: 1 + sq * 0.1, face: t > 2.55 && t < 4 ? 'closed' : 'smile', eyes: t > 2.55 && t < 4 ? 'happy' : undefined, talk: talk(), look: [0.3, 0] }));
        }
      } },
    { name: 'hold', len: () => dur('c_hold') + 0.5, enter() { say('c_hold', 0); snd('sfx/inhale', { gain: 0.9, at: 0.3 }); snd('sfx/balloon_stretch', { gain: 0.45, at: 0.7 }); },
      draw(c, t, T, ui) {
        // he sucks in a huge breath (a squash first), his cheeks puff, and the whole tent ceiling is pulled down toward him
        const pre = ease.inOut(k01(t, 0.15, 0.35)) * (1 - k01(t, 0.35, 0.5)), inh = ease.back(k01(t, 0.35, 1.0)), z = lerp(1.0, 1.2, ease.inOut(k01(t, 0, dur('c_hold'))));
        tent(c, camera({ z, x: 470, y: 380 }), { time: T, sag: inh * 40 + Math.sin(t * 2) * 3 * inh },
          sitT(T, { sy: 1 - pre * 0.15 + inh * 0.06, sx: 1 + inh * 0.12, puff: inh, face: inh > 0.3 ? 'puff' : 'o', eyeS: 1 + pre * 0.12, look: [Math.sin(t * 1.2) * 0.4, -0.3], brow: 0.6, lid: blinkAt(T + 2),
            hands: { l: [-80, -96, 'fist', -1], r: [80, -96, 'fist', -1] } }));
        ui.push(() => {
          const pop = ease.back(k01(t, 0.55, 0.95)), lab = getLabel();
          if (pop > 0) { const press = 0.5 - 0.5 * Math.cos(t * Math.PI * 2); keyCap(c, 730, 250, lab.text, press, lab.scheme, pop); glove(c, 740, 172 + press * 7, Math.PI / 2, 'point', 1.25 * pop); letter(c, 'HOLD IT!', 730, 110, 44, { seed: 31, line: 7 }); }
          const tapK = ease.back(k01(t, dur('c_hold') * 0.62, dur('c_hold') * 0.62 + 0.4));
          if (tapK > 0) { c.save(); c.translate(730, 360); c.scale(tapK, tapK); bigText(c, '...or TAP it once!', 0, 0, 30, { w: 6 }); c.restore(); }
        });
      } },
    { name: 'quiet', len: () => dur('c_quiet') + 0.4, enter() { say('c_quiet', 0); },
      draw(c, t, T, ui) {
        // closer: cheeks full, the eyes dart about, a finger raised for hush
        const dart = clamp(Math.sin(t * 1.6) * 3, -1, 1);
        tent(c, camera({ z: 1.45, x: 450, y: 330 }), { time: T, sag: 40 },
          sitT(T, { sy: 1.05, sx: 1.12, puff: 1, face: 'puff', look: [dart, 0], brow: 0.3, hands: { l: [-80, -96, 'fist', -1], r: [104, -222, 'shh', -1] } }));
        ui.push(() => {
          const sz = ease.back(k01(t, 0.3, 0.7)); if (sz > 0) { c.save(); c.translate(740, 230); c.rotate(-0.08 + Math.sin(t * 6) * 0.03); c.scale(sz, sz); burst(c, 0, 0, 120, 12, 0); letter(c, 'SHHH!', 0, 4, 50, { fill: INK, line: 0, shadow: false, seed: 32 }); c.restore(); }
          const ear = ease.back(k01(t, dur('c_quiet') * 0.55, dur('c_quiet') * 0.55 + 0.4)); if (ear > 0) { c.save(); c.translate(740, 400); c.scale(ear, ear); bigText(c, 'IT CAN HEAR YOU!', 0, 0, 30, { w: 6 }); c.restore(); }
        });
      } },
    { name: 'meter', len: () => dur('c_meter') + 1.0, enter() { say('c_meter', 0); snd('sfx/deflate', { gain: 0.9, at: dur('c_meter') + 0.15 }); },
      draw(c, t, T, ui) {
        // he swells and goes darker as the meter drains, until it all comes out in one whoosh and the ceiling billows up
        const D = dur('c_meter'), v = 1 - 0.9 * k01(t, 0.4, D), out = t > D + 0.15, blow = k01(t, D + 0.15, D + 0.7), strain = 1 - v;
        const after = out ? Math.exp(-(t - D - 0.15) * 6) * Math.sin((t - D - 0.15) * 22) : 0, billow = out ? -110 * Math.exp(-(t - D - 0.15) * 3) * (0.6 + 0.4 * Math.cos((t - D) * 7)) : 0;
        tent(c, camera({ z: 1.3, x: 450, y: 360 }), { time: T, sag: out ? billow : 40 + strain * 20 },
          sitT(T, { sy: out ? 1 - after * 0.2 : 1.05 + strain * 0.08, sx: out ? 1 + after * 0.15 : 1.12 + strain * 0.12, puff: out ? Math.max(0, 1 - blow * 1.5) : 1,
            face: out ? 'o' : strain > 0.55 ? 'strain' : 'puff', blue: out ? 1 - blow : clamp(strain, 0, 1), look: out ? [0, -1] : [0, -0.2], brow: out ? 1 : 0.2 + strain, lid: out ? 0 : 0.2 + strain * 0.3,
            hands: { l: [-80, -96, 'fist', -1], r: [80, -96, 'fist', -1] } }));
        ui.push(() => {
          meter(c, 740, 170, out ? 0.1 + blow * 0.9 : v);
          if (out) { c.save(); c.globalAlpha = 1 - blow * 0.7; c.translate(600 + blow * 60, 250 - blow * 50); c.scale(0.6 + blow, 0.6 + blow); for (const [dx, dy, rr] of [[0, 0, 24], [26, -10, 18], [-24, -8, 16], [10, -26, 14]]) cel(c, ellPts(dx, dy, rr, rr * 0.85, 24), 3, WHITE, rr); c.restore(); letter(c, 'POOF!', 640, 300, 50, { seed: 33, line: 7 }); }
        });
      } },
    { name: 'try', len: () => Infinity, enter() { say('c_try', 0); st.holdT = 0; st.latch = false; st.holdSaid = false; },
      draw(c, t, T, ui) {
        // your turn, in here. Holding: he puffs with you and the ceiling sags in. Letting go too soon: WHOOPS, the breath rushes out, the
        // ceiling billows up like a parachute and he zips round the tent like a let-go balloon, then drops back onto his pillow
        const k = clamp(st.holdT / HOLD_NEED, 0, 1), lab = getLabel(), wt = st.t - st.whoopsT, whoops = wt < 1.7, cam = camera({ z: 1.15, x: 470, y: 380 });
        const billow = whoops ? -140 * Math.exp(-wt * 2.2) * (0.7 + 0.3 * Math.cos(wt * 6)) : 0;
        if (whoops && wt < 1.15) {
          const u = wt / 1.15, pth = (q) => [470 + Math.sin(q * 9.5) * 260 * (1 - q * 0.4), 360 + Math.sin(q * 6.3 + 1) * 110 * (1 - q * 0.3)];
          const [x, y] = pth(u), [x2, y2] = pth(Math.max(0, u - 0.02)), ang = Math.atan2(y - y2, x - x2);
          tent(c, cam, { time: T, sag: billow }, null);
          withCam(c, cam, 1, (cc) => { cc.save(); cc.translate(x, y); cc.rotate(ang + Math.PI / 2); drawBear(cc, { T, id: 'Z', x: 0, y: 70, s: 0.8 * (1 - u * 0.2), sy: 1.35, sx: 0.8, puff: 1 - u, face: 'o', eyeS: 1.2, brow: 1, look: [0, -1],
            hands: { l: [-90, -60, 'open', -1], r: [90, -60, 'open', -1] }, feet: { l: [-14, 20], r: [14, 26] } }); cc.restore(); });
        } else {
          const drop = whoops ? Math.max(0, Math.exp(-(wt - 1.15) * 8) * Math.cos((wt - 1.15) * 20)) : 0;
          tent(c, cam, { time: T, sag: st.holding ? 20 + k * 35 : billow },
            sitT(T, st.holding ? { sy: 1.04 + k * 0.06, sx: 1.08 + k * 0.14, puff: 0.6 + k * 0.4, face: 'strain', blue: k * 0.7, brow: -0.3, look: [0, -0.3], hands: { l: [-80, -96, 'fist', -1], r: [80, -96, 'fist', -1] } }
              : whoops ? { y: TENT.floor + 6 - drop * 20, sy: 1 - drop * 0.25, face: 'o', eyeS: 1.15, brow: 1, look: [0, -1] } : { talk: talk(), face: talk() > 0.12 ? 'grin' : 'sly', brow: 0.2, look: [0.7, 0.1], lid: Math.max(0.5, blinkAt(T)) }));
        }
        ui.push(() => {
          if (!st.holding && !whoops) { letter(c, 'NOW YOU TRY IT!', 720, 120, 44, { seed: 34, line: 7, arc: 8 }); keyCap(c, 720, 230, lab.text, 0.5 - 0.5 * Math.cos(t * Math.PI * 2), lab.scheme, 1 + Math.sin(t * 6) * 0.03); }
          meter(c, 720, 380, 1 - k * 0.75, 'HOLD IT...');
          if (st.holding) { const n = Math.min(HOLD_NEED, Math.floor(st.holdT) + 1), fr = st.holdT % 1, sz = 1 + (1 - ease.out(Math.min(1, fr * 3))) * 0.45; c.save(); c.translate(720, 220); c.scale(sz, sz); letter(c, `${n}!`, 0, 0, 120, { seed: 35 + n, line: 10 }); c.restore(); }
          if (whoops) { c.save(); c.translate(720, 230); c.rotate(Math.sin(t * 12) * 0.05); letter(c, 'WHOOPS!', 0, 0, 70, { seed: 40, line: 9, arc: 10 }); c.restore(); }
        });
      } },
    { name: 'good', len: () => 1.5 + dur('c_good') + 0.9, enter() { snd('sfx/applause', { gain: 0.7 }); bark('b_hee', 0.35); say('c_good', 1.5); snd('sfx/boing', { gain: 0.5, at: 0.22 }); snd('sfx/deflate', { gain: 0.9, at: 0.0 }); },
      draw(c, t, T, ui) {
        // the breath comes out in one whoosh, he springs up onto his feet, and takes a bow
        const whoosh = k01(t, 0, 0.3), up = ease.back(k01(t, 0.25, 0.6)), bow = t > 1.3 ? Math.max(0, Math.sin((t - 1.3) * 2.4)) : 0, land = t > 0.6 ? Math.max(0, Math.exp(-(t - 0.6) * 9) * Math.cos((t - 0.6) * 18)) : 0;
        const cam = camera({ z: 1.1, x: 470, y: 370 }), set = { time: T, sag: -40 * Math.exp(-t * 3) };
        if (t < 0.3) tent(c, cam, set, sitT(T, { sx: lerp(1.2, 1, whoosh), puff: 1 - whoosh, face: 'o', eyeS: 1.1 }));
        else tent(c, cam, set, { T, x: TX, y: TENT.floor + 6 - (1 - up) * 30, s: TS, sy: 1 - land * 0.2, lean: bow * 0.35, face: 'tongue', brow: 0.9, look: [0.2, 0.2],
          hands: bow > 0.05 ? { l: [-70, -110 + bow * 60, 'open', 1], r: [130, -150 + bow * 40, 'wave', -1] } : { l: [-134, -238, 'wave', 1], r: [134, -238, 'wave', -1] }, feet: { l: [-28, 0], r: [28, 0] } }, { sitting: false });
        ui.push(() => {
          const sz = ease.back(k01(t, 0.15, 0.55)); if (sz > 0) { c.save(); c.translate(730, 220); c.scale(sz, sz); burst(c, 0, 0, 150, 14, t); letter(c, 'SWELL!', 0, 4, 58, { fill: INK, line: 0, shadow: false, seed: 41 }); c.restore(); }
        });
      } },
    { name: 'end', len: () => 3.0, enter() { snd('sfx/boing', { gain: 0.4, at: 0.15, rate: 0.8 }); },
      draw(c, t) { endCard(c, t); iris(c, t < 0.5 ? ease.out(k01(t, 0, 0.5)) : 1 - ease.in(k01(t, 2.4, 3.0))); } },
    // the reel should be over. The tail leader runs, and then the picture comes back
    { name: 'runout', len: () => 1.4, enter() { if (st.music && st.music.g && audio && audio.ctx) { try { st.music.g.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.3); } catch (e) { /* offline */ } } if (st.log) st.log.push({ t: st.t, id: 'MUSICOUT' }); },
      draw(c, t) { c.fillStyle = '#121212'; c.fillRect(0, 0, W, H); if (t > 0.5 && t < 0.75) { c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, W, H); } } },
    { name: 'night', len: () => 0.6 + dur('c_night') + 1.4, enter() { say('c_night', 0.6); },
      draw(c, t, T) {
        const D = 0.6 + dur('c_night') + 1.4;
        // the picture comes back, inside the tent, cosy. He bobs to music that is not playing any more and waves to us
        const wv = Math.sin(t * 6.5);
        tent(c, camera({ z: lerp(1.0, 1.06, ease.inOut(k01(t, 0, D))), x: 480, y: 370 }), { time: T, glow: 0.7 },
          sitT(T, { face: 'smile', brow: 0.7, look: [0.2, 0.2], tilt: -0.04 + wv * 0.03, hands: { l: [-80, -96, 'open', -1], r: [136 + wv * 20, -236 + Math.abs(wv) * 12, 'wave', -1] } }));
      } },
    { name: 'remember', len: () => 0.4 + dur('c_remember') + 0.7 + 1.5, slow: true, enter() { say('c_remember', 0.4); const Hs = 0.4 + dur('c_remember') + 0.7; snd('sfx/cloth_rip', { gain: 1, at: Hs - 0.05 }); bark('b_scream', Hs + 0.45, 1.4); },
      draw(c, t, T) {
        // "...it can hear you." The tent goes dark from the edges in, as if something outside is blotting out the light. His smile
        // falters and he looks up. Silence. Then a long black hand tears through the blanket wall, takes him, and drags him out through
        // the hole, screaming, and the film catches and burns (the next segment)
        const D0 = 0.4 + dur('c_remember'), Hs = D0 + 0.7, slowT = 30 + t * 0.35;
        const dark = ease.inOut(k01(t, 0.2, Hs)), falter = k01(t, D0 * 0.5, D0 * 0.85), reach = ease.out(k01(t, Hs, Hs + 0.45)), grab = k01(t, Hs + 0.45, Hs + 0.62), drag = ease.in(k01(t, Hs + 0.62, Hs + 1.45));
        const TXR = 120, TY0 = 300, TY1 = 610, open = t < Hs - 0.12 ? 0 : Math.min(1, (t - Hs + 0.12) / 0.2);
        const by = TENT.floor + 6, bx = lerp(TX, TXR - 90, drag), byy = lerp(by, by - 80, drag), shake = grab > 0 && drag < 1 ? Math.sin(t * 80) * 3 * (1 - drag) : 0;
        const sq = grab * (1 - drag * 0.5), fl = Math.sin(t * 26);   // the fingers squeeze his middle in; his gloves flail
        const bear = sitT(slowT, { x: bx + shake, y: byy, sx: (1 + drag * 0.5) * (1 - 0.14 * sq), sy: (1 - drag * 0.2) * (1 + 0.06 * sq), lean: -drag * 0.5,
          face: grab > 0 ? 'scream' : falter > 0.5 ? 'worried' : 'grin', brow: falter > 0.5 ? 0.8 : 0.5, eyeS: grab > 0 ? 1.3 : 1 + falter * 0.1,
          look: grab > 0 ? [-1, -0.2] : [lerp(0, -0.2, falter), lerp(0.1, -1, falter)], tilt: -0.04 - falter * 0.06,
          hands: grab > 0 ? { l: [-118 + fl * 14, -176 - fl * 18, 'open', 1], r: [124 - fl * 12, -160 + fl * 20, 'open', -1] } : { l: [-80, -96, 'open', -1], r: [80, -96, 'open', -1] } });
        const dim = (cc) => {   // the light blotted out from the edges in
          const g = cc.createRadialGradient(TX, 380, lerp(900, 40, dark), TX, 380, lerp(1300, 400, dark)); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.97 * dark})`);
          cc.fillStyle = g; cc.fillRect(-300, -300, W + 600, H + 600); cc.fillStyle = `rgba(0,0,0,${0.45 * dark})`; cc.fillRect(-300, -300, W + 600, H + 600);
          if (open > 0) {   // the cloth tears open: a ragged dark slit with threads at its lips
            const w = 30 * open + 26 * reach, r = rng(77), L = [], R = [];
            for (let i = 0; i <= 14; i++) { const v = i / 14, y = lerp(TY0, TY1, v), bulge = Math.sin(Math.PI * v); L.push([TXR - w * bulge * (0.8 + r() * 0.4), y]); R.push([TXR + w * bulge * (0.8 + r() * 0.4), y]); }
            const lip = [...L, ...R.slice().reverse()]; cc.save(); cc.lineJoin = 'round'; path(cc, lip); cc.lineWidth = 7; cc.strokeStyle = 'rgba(190,190,190,0.55)'; cc.stroke(); cc.restore();
            fillPts(cc, lip, '#040404');
            for (let i = 1; i < 14; i += 2) { const q = L[i]; ink(cc, [[q[0], q[1]], [q[0] - 9, q[1] + 6]], 1.4, false, i); const q2 = R[14 - i]; ink(cc, [[q2[0], q2[1]], [q2[0] + 9, q2[1] - 4]], 1.4, false, i + 20); }
          }
        };
        const hand = (cc) => {   // the creature's arm and hand: black, bony, too long, with a second elbow where none should be; the hand bigger
          // than his belly, its four long jointed fingers closing right round him
          if (reach <= 0 || drag >= 0.97) return;
          cc.save(); cc.beginPath(); cc.rect(TXR - 8, -2000, 6000, 6000); cc.clip();   // it comes out of the slit, and goes back into it
          const s2 = TS * (1 - 0.14 * sq), cy = byy - 168 * (1 - drag * 0.2), palm = [lerp(TXR + 30, bx - 70 * s2, reach), lerp(470, cy, reach)];
          const e1 = [lerp(TXR, palm[0], 0.33), lerp(470, palm[1], 0.33) - 64 * reach], e2 = [lerp(TXR, palm[0], 0.7), lerp(470, palm[1], 0.7) + 40 * reach];
          const arm = [[TXR - 20, 476], e1, e2, palm];
          const ribbon = (pts, w0, w1) => { const L = [], R = []; pts.forEach((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = lerp(w0, w1, i / (pts.length - 1)) / 2; L.push([q[0] - dy / l * w, q[1] + dx / l * w]); R.push([q[0] + dy / l * w, q[1] - dx / l * w]); }); return [...L, ...R.reverse()]; };
          // the fingers: open and reaching, then wrapped round his middle, the tips crossing in front of him
          const fingers = [0, 1, 2, 3].map((i) => {
            const fy = cy + (i - 1.5) * 20, op = [[palm[0], palm[1]], [palm[0] + 40, palm[1] + (i - 1.5) * 26 - 10], [palm[0] + 78, palm[1] + (i - 1.5) * 40 - 6], [palm[0] + 104, palm[1] + (i - 1.5) * 52 + 10]];
            const wr = [[palm[0], palm[1]], [bx - 36 * s2, fy - 10], [bx + 10 * s2, fy + 6], [bx + (46 + i * 4) * s2, fy - 4]];
            return op.map((q, j) => [lerp(q[0], wr[j][0], grab), lerp(q[1], wr[j][1], grab)]);
          });
          const thumb = [[palm[0], palm[1]], [palm[0] + 18, palm[1] - 36], [lerp(palm[0] + 50, bx - 10, grab), lerp(palm[1] - 60, cy - 50, grab)]];
          const shapes = [ribbon(arm, 30, 24), ...fingers.map((f) => ribbon(f, 13, 6)), ribbon(thumb, 13, 7), ellPts(palm[0] + 6, palm[1], 30, 26, 24)];
          cc.save(); cc.filter = 'blur(1.6px)'; cc.globalAlpha = 0.6; for (const sh of shapes) { path(cc, sh); cc.lineWidth = 6; cc.strokeStyle = '#b4b4b4'; cc.lineJoin = 'round'; cc.stroke(); } cc.restore();   // a faint rim of the candle's light
          for (const sh of shapes) fillPts(cc, sh, '#070707');
          for (const q of [e1, e2]) fillPts(cc, ellPts(q[0], q[1], 17, 15, 16), '#070707');   // the bony elbows
          for (const f of fingers) for (const q of f.slice(1, 3)) fillPts(cc, ellPts(q[0], q[1], 7.5, 7.5, 12), '#070707');   // the knuckles
          cc.restore();
        };
        tent(c, camera({ z: lerp(1.08, 1.2, ease.inOut(k01(t, 0, D0))), x: lerp(480, 400, reach), y: 370 }), { time: T, glow: 0.6 * (1 - dark) }, drag < 1 ? bear : null, { before: dim, after: hand, clipX: TXR });
      } },
    { name: 'burn', len: () => 2.7, freeze: true, enter() { stopAll(0.01); snd('sfx/gate_catch', { gain: 1 }); if (st.projector && audio && audio.ctx) { try { st.projector.g.gain.setTargetAtTime(0, audio.ctx.currentTime + 0.2, 0.2); } catch (e) { /* offline */ } } stopMusic(); snd('sfx/film_burn', { gain: 0.9, at: 0.05 }); snd('sfx/projector_stop', { gain: 0.8, at: 0.25 }); if (st.log) st.log.push({ t: st.t + 0.25, id: 'PROJSTOP' }); },
      draw(c, t, T) {
        if (st.freeze) c.drawImage(st.freeze, 0, 0);
        burnHole(c, ease.in(k01(t, 0.15, 1.9)), T);
        if (t > 1.9) { c.fillStyle = `rgba(0,0,0,${k01(t, 1.9, 2.3)})`; c.fillRect(0, 0, W, H); }
      } },
  ];
  function stopMusic() { if (st.music && audio && audio.ctx) { try { st.music.g.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.15); st.music.src.stop(audio.ctx.currentTime + 0.8); } catch (e) { /* offline */ } } if (st.log) st.log.push({ t: st.t, id: 'MUSICSTOP' }); }

  // ---- the clock
  function enter(i) {
    st.seg = i; st.segT = 0;
    const s = SEG[i];
    if (s && s.freeze) { st.freeze = document.createElement('canvas'); st.freeze.width = W; st.freeze.height = H; st.freeze.getContext('2d').drawImage(stage, 0, 0); }
    if (s && s.enter) s.enter();
  }
  // the breath input, as the game reads it: hold, or tap once to keep holding
  function readBreath() {
    const down = breathDown() || st.touch.breath, now = st.t;
    if (down && !st.prevDown) st.downAt = now;
    if (!down && st.prevDown && now - st.downAt < 0.3) st.latch = !st.latch;
    st.prevDown = down; return down || st.latch;
  }
  function step(dt) {
    if (!st.on) return;
    st.t += dt; st.segT += dt;
    const s = SEG[st.seg];
    if (s.name === 'try') {
      const h = readBreath();
      if (h && !st.holding) { st.holding = true; st.holdT = 0; snd('sfx/inhale', { gain: 0.9 }); snd('sfx/balloon_stretch', { gain: 0.45, at: 0.2, key: 'hold' }); snd('sfx/ticktock', { gain: 0.7, at: 0.1, key: 'hold' }); duck(true); if (!st.holdSaid) { st.holdSaid = true; say('c_holdit', 0.5); } }
      if (st.holding) {
        if (h) { const before = Math.floor(st.holdT); st.holdT += dt; if (Math.floor(st.holdT) > before && st.holdT < HOLD_NEED) snd('sfx/boing', { gain: 0.22, rate: 1.5 + Math.floor(st.holdT) * 0.15 }); }
        if (st.holdT >= HOLD_NEED) { st.holding = false; st.latch = false; st.passed = true; hush('hold'); duck(false); enter(st.seg + 1); return; }
        if (!h) { st.holding = false; st.tries++; hush('hold'); duck(false); if (st.holdT > 0.2) { st.whoopsT = st.t; bark('b_whoa', 0.02); say('c_whoops', 1.25); snd('sfx/slide_down', { gain: 0.6 }); st.holdSaid = false; } st.holdT = 0; }
      }
    } else if (st.segT >= s.len()) {
      if (st.seg + 1 >= SEG.length) { finish('done'); return; }
      enter(st.seg + 1);
    }
    if (st.skippable) {
      const k = skipDown() || st.touch.skip; st.skipK = k ? st.skipK + dt : Math.max(0, st.skipK - dt * 2);
      if (st.skipK >= 1) { finish('skipped'); return; }
    }
    if (!st.skippable && st.passed) st.skippable = true;
  }
  function draw() {
    const s = SEG[st.seg], ui = []; INKT.t = st.t; lipSync(); FACE.vis = VIS;
    const sp = splice(kit, st.t, s.slow || s.name === 'runout' ? 2.5 : 1);
    // the picture, clean, onto the stage (held still while frames are missing at a splice)
    if (!sp.freeze || !st.drawn) {
      sctx.save(); sctx.setTransform(1, 0, 0, 1, 0, 0);
      s.draw(sctx, st.segT, st.t, ui);
      for (const f of ui) f();
      sctx.restore(); st.drawn = true;
    }
    // the print of it: weave (more as the projector dies), warp, softness, then the damage, and the subtitles on top, clean
    printFrame(pctx, kit, stage, st.t, { weave: s.slow ? 2.2 : 1, jumpY: sp.jumpY });
    film(pctx, kit, st.t, { flick: s.slow ? 2 : 1, dirt: s.slow || s.name === 'runout' ? 2.2 : 1 });
    if (sp.flash) { pctx.fillStyle = `rgba(240,240,236,${sp.flash})`; pctx.fillRect(0, 0, W, H); }
    if (subtitles() && s.name !== 'burn') { if (saying()) subtitle(pctx, text(st.vo)); else if (barking()) subtitle(pctx, text(st.bark)); }
    if (s.name === 'burn' && st.segT > 2.2) { pctx.fillStyle = '#000'; pctx.fillRect(0, 0, W, H); }
    if (!ctx) return;
    const cw = cv.width, ch = cv.height, sc = Math.min(cw / W, ch / H), dw = W * sc, dh = H * sc;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(pcv, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    if (skipEl) { skipEl.style.opacity = st.skippable ? 1 : 0; skipEl.querySelector('i').style.width = `${Math.min(1, st.skipK) * 100}%`; }
    if (touchEl) { touchEl.style.display = getLabel().scheme === 'touch' ? '' : 'none'; touchEl.querySelector('.cskip').style.visibility = st.skippable ? '' : 'hidden'; }
  }
  function finish(how) {
    if (!st.on) return;
    st.on = false; stopAll(how === 'skipped' ? 0.25 : 0.1); stopMusic(); crackle(false);
    if (st.projector) { try { st.projector.src.stop(); } catch (e) { /* done */ } }
    if (root) root.classList.remove('show');
    const d = st.done; st.done = null; if (d) d(how);
  }

  // ---- the DOM: one canvas over everything, a skip bar, and on a touch screen the breath and skip buttons
  function mount() {
    if (stage) return;
    stage = document.createElement('canvas'); stage.width = W; stage.height = H; sctx = stage.getContext('2d'); pcv = document.createElement('canvas'); pcv.width = W; pcv.height = H; pctx = pcv.getContext('2d'); kit = filmKit();
    if (!document.body) return;
    root = document.createElement('div'); root.id = 'cartoon';
    root.innerHTML = '<canvas></canvas><div class="skip">Hold <b></b> to skip<span><i></i></span></div>'
      + '<div class="ctouch"><button type="button" class="cbreath">HOLD<br>BREATH</button><button type="button" class="cskip">SKIP</button></div>';
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); skipEl = root.querySelector('.skip'); touchEl = root.querySelector('.ctouch');
    const hold = (sel, key) => {
      const b = root.querySelector(sel), on = (e) => { e.preventDefault(); st.touch[key] = true; }, off = (e) => { e.preventDefault(); st.touch[key] = false; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    };
    hold('.cbreath', 'breath'); hold('.cskip', 'skip');
    const fit = () => { cv.width = Math.round(innerWidth * Math.min(1.5, devicePixelRatio || 1)); cv.height = Math.round(innerHeight * Math.min(1.5, devicePixelRatio || 1)); };
    addEventListener('resize', fit); fit();
  }
  // drawn every frame the display gives (60, 120, 144...): the picture runs on its own clock, not on frame counts
  let last = 0;
  function tick(now) {
    if (!st.on) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    step(dt); if (st.on) draw();
  }
  function reset(firstTime) {
    Object.assign(st, { on: true, t: 0, seg: 0, segT: 0, vo: null, voT: 0, bark: null, barkT: 0, holdT: 0, holding: false, latch: false, prevDown: false, tries: 0, passed: false, holdSaid: false, whoopsT: -9, skipK: 0, skippable: !firstTime, sources: [], music: null, projector: null, freeze: null });
    st.touch.breath = st.touch.skip = false; st.drawn = false; if (kit) { kit.last = -1; kit.scratches = []; kit.splice = { next: 6, at: -9 }; }
    LIMB.clear();
  }

  return {
    get active() { return st.on; },
    get opaque() { return st.on; },
    get state() { return { seg: SEG[st.seg] && SEG[st.seg].name, t: st.t, holdT: st.holdT, holding: st.holding, tries: st.tries, passed: st.passed, skippable: st.skippable }; },
    segments: SEG.map((s) => s.name),
    // play it: resolves 'done' or 'skipped'. firstTime: the skip is offered only once the "now you try it" is passed
    play({ firstTime = true, skipLabel = 'Esc' } = {}) {
      mount(); reset(firstTime);
      if (skipEl) skipEl.querySelector('b').textContent = skipLabel;
      if (root) root.classList.add('show');
      enter(0); last = 0; requestAnimationFrame(tick);
      return new Promise((res) => { st.done = res; });
    },
    stop() { finish('skipped'); },
    // offline: run the picture on a virtual clock (no sound, only a log of it) and draw frame by frame
    offline({ firstTime = true } = {}) {
      mount(); reset(firstTime); st.offline = true; st.log = []; enter(0);
      return { step: (dt) => { step(dt); if (st.on) draw(); }, canvas: pcv, log: st.log, get on() { return st.on; }, st, segs: SEG.map((s) => s.name) };
    },
  };
}
