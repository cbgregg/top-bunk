// The house's ceiling lights and their switches.
//
// Every room has its fixtures (world.js: a glass shade on the ceiling) and a switch by the door (two for the hall). A switch works its room's
// lights; the house can work them too (it turns a light off behind you, one on ahead of you; bulbs flicker and brown out as the thing comes
// near, and can die with a pop). A lit room makes you easier to find, but the thing will not walk into the light while you are watching it.
//
// The cost of a light is paid by every pixel, and a change in the NUMBER of lights recompiles every shader in the scene (that is what made
// starting a game slow). So no fixture has a light of its own. Every lit fixture lights its room from inside the shaders (ROOM_PARS and
// ROOM_LIGHT below): the same cone and fall-off as a spot light at the shade, kept to the room's own walls and to what passes through its
// doorways, with the room's soft bounce on top. That costs a pixel nothing while the house is dark and is there from any distance, so a lit
// room is lit from wherever you see it. What it cannot do is cast a shadow, so two shadowed spots, made once and always in the scene, are
// lent to the fixtures that matter most to the picture; a fixture's own light fades out as the spot fades in over it, and back again when
// the spot leaves, so nothing pops as you walk. Switching a light only changes numbers, never the count.
import * as THREE from 'three';
import { roomAt, ROOMS, SX, SZ, H, WT } from './world.js';
import { flicker as calm } from './settings.js';

// a 60 W incandescent bulb, about 2700 K
const STRIP = new THREE.Color(0xff9a48).multiplyScalar(1.0);
const WARM = new THREE.Color(0xffad5e), BROWN = new THREE.Color(0xff6a1c), BOUNCE_COL = new THREE.Color(0xffc690);
// how bright a fixture's light is, by phase: base (world.js, 7..10) times this, in candela; the bounce fill, per unit of the room's light
const K = { night: 3.4, day: 0.95, morning: 0.55, title: 0 };
const BOUNCE = { night: 3.4, day: 0.6, morning: 0.35, title: 0 };
const EMISSIVE = { night: 3.2, day: 1.6, morning: 1.2, title: 0 };
// how much of the sky's light the roof keeps out of the rooms, by phase: at night the yard has the moon and the rooms have what comes of
// it through the windows, so a room with its light off is dark, and the lamps, the night lights and the flashlight are what you see by
const ROOF = { night: 0.8 };
// the rooms each closed door belongs to (the strip of light under it shows on the other side)
const DOOR_ROOM = { kid: 'bed', bath: 'bath', spare: 'spare', room2: 'room2', parents: 'parents' };
// the ways through the inside walls, on the plan (world.js): a door by its name, or an opening that is always there. A fixture's light
// passes through the ones in its own room's walls into the room on the other side
const GAPS = [
  { rooms: ['bed', 'hall'], door: 'kid' }, { rooms: ['bath', 'hall'], door: 'bath' }, { rooms: ['spare', 'hall'], door: 'spare' }, { rooms: ['room2', 'hall'], door: 'room2' },
  { rooms: ['parents', 'dining'], door: 'parents', w: 1.1, top: 2.05 },
  { rooms: ['hall', 'living'], x: 3.3, z: [-1.5, -0.3] },        // the hall's open end
  { rooms: ['living', 'dining'], z: -0.3, x: [-3.3, -1.4] },     // the dining end, open to the living room
  { rooms: ['kitchen', 'dining'], x: -1.4, z: [1.6, 3.6] },      // past the short wall
  { rooms: ['living', 'kitchen'], z: -0.3, c: 1.7, w: 1.4, top: 1.78 },   // the arch (a little under its crown: the opening is taken as square)
];

// ---------- the fixtures' light, in the shaders ----------
// the spot every fixture is: straight down from the shade, the cone and reach the lent spots have too
const REACH = 7.5, CONE = 1.2, PENUMBRA = 0.85, BOUNCE_Y = 1.15;
const ROOM_LIGHTS = 10, ROOM_GAPS = 16, ROOM_NAMES = Object.keys(ROOMS);
// one set of numbers for every material (the array is shared, so a write here is seen by all of them). A pixel knows which room it is
// in from the plan's wall lines (ROOM_PARS), and is lit by that room's short list: its own lit fixtures, and the lit fixtures next door
// whose light comes in through a gap in the wall. Only what is lit is listed, so a dark house costs a pixel nothing:
// list: for each room [its first fixture, how many, its first gap, how many]; pos: a fixture (x, y, z) and its bounce's reach; spot: its
// own light, colour times candela (what a lent spot is not giving); fill: its bounce the same way; gap: a gap [where the wall line is,
// from, to, the lintel's height plus four times the number of the fixture whose light comes through it (negative for a wall that runs
// along x)]; cells: the plan, which room each cell between the wall lines is; roof: [the share of the sky's light the roof keeps out,
// 1 while any fixture is lit]. They are kept few: a phone has little room for them
const ROOM = {};
// the plan as the shaders read it: the wall lines each way, and which room every cell between them is (-1: not a room)
const CUTS = [0, 2].map((k) => [...new Set(Object.values(ROOMS).flatMap((r) => [r[k], r[k + 1]]))].sort((p, q) => p - q));
const CELLS = [];
for (let iz = 0; iz <= CUTS[1].length; iz++) for (let ix = 0; ix <= CUTS[0].length; ix++) {
  const x = ix > 0 && ix < CUTS[0].length ? (CUTS[0][ix - 1] + CUTS[0][ix]) / 2 : null, z = iz > 0 && iz < CUTS[1].length ? (CUTS[1][iz - 1] + CUTS[1][iz]) / 2 : null;
  CELLS.push(x === null || z === null ? -1 : ROOM_NAMES.findIndex((n) => x > ROOMS[n][0] && x < ROOMS[n][1] && z > ROOMS[n][2] && z < ROOMS[n][3]));
}
while (CELLS.length % 4) CELLS.push(-1);
// (one array for all of it, each part a stretch of it: a material sends it to its shader in one go, however many parts there are)
const PARTS = { list: ROOM_NAMES.length, pos: ROOM_LIGHTS, spot: ROOM_LIGHTS, fill: ROOM_LIGHTS, gap: ROOM_GAPS, cells: CELLS.length / 4, roof: 1 }, AT = {};
{ let at = 0; for (const k in PARTS) { AT[k] = at; at += PARTS[k]; } ROOM.data = new Float32Array(at * 4); for (const k in PARTS) ROOM[k] = ROOM.data.subarray(AT[k] * 4, (AT[k] + PARTS[k]) * 4); }
ROOM.cells.set(CELLS);
const steps = (cuts, v) => cuts.map((c) => `step( ${c.toFixed(3)}, ${v} )`).join(' + ');
const ROOM_PARS = `
#define ROOM_LIGHTS ${ROOM_LIGHTS}
#define ROOM_GAPS ${ROOM_GAPS}
uniform vec4 roomData[ ${ROOM.data.length / 4} ];
#define roomList( i ) roomData[ ${AT.list} + ( i ) ]
#define roomLightPos( i ) roomData[ ${AT.pos} + ( i ) ]
#define roomLightSpot( i ) roomData[ ${AT.spot} + ( i ) ]
#define roomLightFill( i ) roomData[ ${AT.fill} + ( i ) ]
#define roomGap( i ) roomData[ ${AT.gap} + ( i ) ]
#define roomCells( i ) roomData[ ${AT.cells} + ( i ) ]
#define houseRoof roomData[ ${AT.roof} ]
// the room a point on the main floor is in: the rectangles run to the middle of the walls, so each face of a wall is in its own room
int roomAt( const in vec3 p ) {
	if ( p.y < -0.25 || p.y > ${(H + 0.06).toFixed(2)} ) return -1;
	int c = int( ${steps(CUTS[0], 'p.x')} ) + ${CUTS[0].length + 1} * int( ${steps(CUTS[1], 'p.z')} );
	return int( roomCells( c / 4 )[ c % 4 ] );
}
// fixture i's spot at the point p, vis of it getting there: straight down from the shade, the cone and fall-off of the lent spots
vec3 roomSpot( const in int i, const in float vis, const in vec3 toL, const in float dist ) {
	float cut = saturate( 1.0 - pow4( dist / ${REACH.toFixed(1)} ) );
	return roomLightSpot( i ).rgb * ( vis * smoothstep( ${Math.cos(CONE).toFixed(5)}, ${Math.cos(CONE * (1 - PENUMBRA)).toFixed(5)}, toL.y / dist ) * cut * cut / max( dist * dist, 0.01 ) );
}
`;
const ROOM_LIGHT = `
#if defined( RE_Direct )
int houseRoom = -1;
if ( houseRoof.x + houseRoof.y > 0.0 ) {
	vec3 roomP = cameraPosition + geometryPosition * mat3( viewMatrix );
	houseRoom = roomAt( roomP );
	vec4 roomL = roomList( max( houseRoom, 0 ) );
	if ( houseRoom >= 0 && roomL.y + roomL.w > 0.0 ) {
		vec3 roomN = geometryNormal * mat3( viewMatrix ), roomSum = vec3( 0.0 ), roomTopColor = vec3( 0.0 ), roomTopDir = vec3( 0.0, 1.0, 0.0 );
		float roomTop = 0.0;
		// the room's own fixtures: the spot, and the room's bounce off its walls, from the middle of the air under the shade. The strongest
		// spot is kept apart for the surface's full response; everything else is summed as plain light on the surface
		int i0 = int( roomL.x ), i1 = i0 + int( roomL.y );
		for ( int i = i0; i < i1; i ++ ) {
			vec4 lp = roomLightPos( i );
			vec3 toL = lp.xyz - roomP;
			float dist = max( length( toL ), 0.001 ), d = saturate( dot( roomN, toL ) / dist );
			vec3 c = roomSpot( i, 1.0, toL, dist );
			float w = ( c.r + c.g + c.b ) * d;
			if ( w > roomTop ) { roomSum += roomTopColor * saturate( dot( roomN, roomTopDir ) ); roomTopColor = c; roomTopDir = toL / dist; roomTop = w; } else roomSum += c * d;
			vec3 toB = vec3( toL.x, ${BOUNCE_Y.toFixed(2)} - roomP.y, toL.z );
			float bd = max( length( toB ), 0.01 ), bcut = saturate( 1.0 - pow4( bd / lp.w ) );
			roomSum += roomLightFill( i ).rgb * ( bcut * bcut * saturate( dot( roomN, toB ) / bd ) / bd );
		}
		// the fixtures next door: what comes through a gap is what a straight line from the shade to here finds open in the wall
		int k0 = int( roomL.z ), k1 = k0 + int( roomL.w );
		for ( int k = k0; k < k1; k ++ ) {
			vec4 ga = roomGap( k );
			float gw = abs( ga.w );
			int i = int( gw * 0.25 );
			vec3 lp = roomLightPos( i ).xyz, toL = lp - roomP;
			vec2 a = ga.w < 0.0 ? lp.zx : lp.xz, b = ga.w < 0.0 ? roomP.zx : roomP.xz;
			float den = b.x - a.x, t = clamp( ( ga.x - a.x ) / ( abs( den ) < 1e-4 ? 1e-4 : den ), 0.001, 1.0 );
			float q = mix( a.y, b.y, t ), y = mix( lp.y, roomP.y, t ), soft = 0.03 + 0.1 * ( 1.0 - t ) / t;
			float vis = saturate( ( q - ga.y ) / soft + 0.5 ) * saturate( ( ga.z - q ) / soft + 0.5 ) * saturate( ( gw - 4.0 * float( i ) - y ) / soft + 0.5 );
			float dist = max( length( toL ), 0.001 );
			roomSum += roomSpot( i, vis, toL, dist ) * saturate( dot( roomN, toL ) / dist );
		}
		if ( roomTop > 0.0 ) {
			directLight.color = roomTopColor;
			directLight.direction = normalize( mat3( viewMatrix ) * roomTopDir );
			directLight.visible = true;
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		}
		reflectedLight.directDiffuse += roomSum * BRDF_Lambert( material.diffuseColor );
	}
}
#endif
`;
// the sky's light (the hemisphere and the image of the sky) under the roof: in the rooms it is cut by houseRoof.x (the cellar is as
// black as it was)
const ROOM_ROOF = `
#if defined( RE_IndirectDiffuse ) && defined( RE_Direct )
if ( houseRoof.x > 0.0 ) {
	float sky = houseRoom < 0 ? 1.0 : 1.0 - houseRoof.x;
	irradiance *= sky; iblIrradiance *= sky;
	#if defined( RE_IndirectSpecular )
	radiance *= sky; clearcoatRadiance *= sky;
	#endif
}
#endif
`;
// into the library's own light chunks, before anything is compiled: every lit material there is or will be (the house, the models that
// load late, the people) takes the fixtures' light with the rest of its lights
{
  const C = THREE.ShaderChunk, mark = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
  if (!C.lights_pars_begin.includes('roomData') && C.lights_fragment_begin.includes(mark)) {
    C.lights_pars_begin += ROOM_PARS;
    C.lights_fragment_begin = C.lights_fragment_begin.replace(mark, ROOM_LIGHT + mark);
    C.lights_fragment_end = ROOM_ROOF + C.lights_fragment_end;
    for (const k of ['standard', 'physical', 'lambert', 'phong', 'toon']) THREE.ShaderLib[k].uniforms.roomData = { value: ROOM.data };
  }
}

export function createLights({ W, scene, camera, sfx, PHONE, F, E, renderer }) {
  const V3 = THREE.Vector3, tmp = new V3(), fwd = new V3();
  // ---------- the rooms ----------
  const rooms = {};
  for (const [name, b] of Object.entries(W.bulbs)) (rooms[b.room] ||= { name: b.room, bulbs: [], switches: [], on: false, dead: false, lvl: 0, out: 0, flk: 1, brown: 0, fT: 0, fv: 1, leftT: 0, delay: 0, killT: 0 }).bulbs.push(b);
  for (const b of Object.values(W.bulbs)) { b.dome.material.emissive.copy(WARM); b.out = 0; }
  for (const s of W.switches) {
    s.pos = new V3(); s.g.getWorldPosition(s.pos);
    s.at = s.pos.clone().addScaledVector(s.normal, 0.12);   // where you reach for it from
    if (s.room && rooms[s.room]) rooms[s.room].switches.push(s);
  }
  const rectOf = (name) => ROOMS[name];
  const center = (name) => { const r = rectOf(name); return r ? new V3((r[0] + r[1]) / 2, 1.15, (r[2] + r[3]) / 2) : null; };
  for (const r of Object.values(rooms)) { r.c = center(r.name); const q = rectOf(r.name); r.rect = q; r.radius = q ? Math.hypot(q[1] - q[0], q[3] - q[2]) / 2 : 3; }

  // ---------- the fixtures, and the gaps their light passes into the rooms next door ----------
  const fixtures = Object.values(W.bulbs).slice(0, ROOM_LIGHTS), lists = ROOM_NAMES.map((name) => ({ own: fixtures.filter((b) => b.room === name), gaps: [] }));
  const col = new THREE.Color();
  for (const b of fixtures) {
    b.lent = 0; b.slot = -1;
    for (const g of GAPS) {
      if (!g.rooms.includes(b.room)) continue;
      const to = ROOM_NAMES.indexOf(g.rooms[0] === b.room ? g.rooms[1] : g.rooms[0]), d = g.door ? W.doors[g.door] : null;
      if (to < 0 || (g.door && !d)) continue;
      const o = { b, door: d, top: g.top ?? (d ? 2.03 : H) };
      if (d) { o.alongX = Math.abs(d.col.maxX - d.col.minX) > Math.abs(d.col.maxZ - d.col.minZ); o.at = o.alongX ? d.mid.z : d.mid.x; o.c = o.alongX ? d.mid.x : d.mid.z; o.w = g.w ?? d.w; }
      else if (g.c !== undefined) { o.alongX = true; o.at = SZ(g.z); o.c = SX(g.c); o.w = g.w; }
      else if (Array.isArray(g.x)) { o.alongX = true; o.at = SZ(g.z); o.lo = SX(g.x[0]) + WT / 2; o.hi = SX(g.x[1]) - WT / 2; }
      else { o.alongX = false; o.at = SX(g.x); o.lo = SZ(g.z[0]) + WT / 2; o.hi = SZ(g.z[1]) - WT / 2; }
      if (o.lo === undefined) { o.lo = o.c - o.w / 2; o.hi = o.c + o.w / 2; }
      // a gap far along the wall from the shade takes its light at a graze, a sliver on the jamb: not worth a pixel's time
      const across = Math.abs((o.alongX ? b.pos.z : b.pos.x) - o.at), v = o.alongX ? b.pos.x : b.pos.z, along = Math.max(0, o.lo - v, v - o.hi);
      if (along > 2.5 * across + 0.5) continue;
      lists[to].gaps.push(o);
    }
  }
  // how much of a door's opening the light gets through: a hinged leaf lets a sliver past its latch edge that widens as it swings, a
  // sliding one uncovers the opening from the end it leaves
  const doorGap = (o) => {
    const d = o.door;
    if (d.slide) {
      const dir = d.slide.open[o.alongX ? 0 : 1] || 1, w = Math.max(0, Math.min(o.w, d.slide.travel * d.a - (d.slide.half - o.w / 2)));
      return dir > 0 ? [o.c - o.w / 2, o.c - o.w / 2 + w] : [o.c + o.w / 2 - w, o.c + o.w / 2];
    }
    const th = d.a * Math.PI / 2, w = o.w * Math.min(1, 0.35 * Math.sin(th) + 0.65 * (1 - Math.cos(th))), hinge = o.alongX ? d.hx : d.hz;
    return hinge < o.c ? [o.c + o.w / 2 - w, o.c + o.w / 2] : [o.c - o.w / 2, o.c - o.w / 2 + w];
  };

  // ---------- the shadowed spots ----------
  const NS = PHONE ? 0 : 2;   // (a phone does without them: no shadow maps there)
  const pool = [];
  for (let i = 0; i < NS; i++) {
    const l = new THREE.SpotLight(WARM, 0, REACH, CONE, PENUMBRA, 2);
    l.position.set(0, -50, 0); l.target.position.set(0, -60, 0); scene.add(l, l.target);
    l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.camera.near = 0.12; l.shadow.camera.far = REACH;
    l.shadow.bias = -0.0009; l.shadow.normalBias = 0.025; l.shadow.radius = 3; l.shadow.autoUpdate = false;
    (scene.userData.shadowLights ||= []).push({ light: l, sun: false });
    // bulb: the lit fixture it is at; k: how much of that fixture's light it is giving (the fixture's own gives the rest); held: seconds there
    pool.push({ light: l, shadow: true, bulb: null, k: 0, want: 0, held: 0 });
  }
  // one plain spot for a light that is carried: Dad's torch on his night walks (js/parents.js aims it from his hand).
  // It is in the scene from the start like the rest, dark and parked under the floor, so lighting it never changes the light count
  const torch = new THREE.SpotLight(0xfff0d8, 0, 13, 0.36, 0.55, 1.3);
  torch.position.set(0, -50, 0); torch.target.position.set(0, -60, 0); scene.add(torch, torch.target);

  // ---------- the light under a shut door ----------
  // a soft strip on the floor just outside the door, in five pieces so that something standing behind the door can block two of them (feet)
  // the texture: bright along the gap, falling off fast across the carpet, and fading out at both ends of the door
  const stripTex = (() => {
    const N = 64, c = document.createElement('canvas'); c.width = N; c.height = N; const x = c.getContext('2d'), img = x.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = j / (N - 1), u = i / (N - 1), across = Math.exp(-v * 5.5) * (1 - v), ends = Math.min(1, Math.min(u, 1 - u) / 0.16), k = across * ends * ends;
      const o = (j * N + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(255 * k);
    }
    x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
  })();
  const strips = [];
  for (const [door, room] of Object.entries(DOOR_ROOM)) {
    const d = W.doors[door], R = rooms[room], rr = rectOf(room); if (!d || !R || !rr) continue;
    const alongX = Math.abs(d.col.maxX - d.col.minX) > Math.abs(d.col.maxZ - d.col.minZ);
    const cx = (rr[0] + rr[1]) / 2, cz = (rr[2] + rr[3]) / 2;
    // the side away from the room (where the light shows when the room is lit and the door is shut), and the side in it
    for (const side of ['out', 'in']) {
      const away = alongX ? Math.sign(d.mid.z - cz) || 1 : Math.sign(d.mid.x - cx) || 1, s = side === 'out' ? away : -away;
      const g = new THREE.Group(), w = 0.84, depth = 0.42, n = 5;
      g.position.set(d.mid.x + (alongX ? 0 : s * 0.06), 0.006, d.mid.z + (alongX ? s * 0.06 : 0));
      g.rotation.y = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
      const parts = [];
      for (let i = 0; i < n; i++) {
        // each piece takes its own slice of the texture across the door; v = 0 at the gap
        const geo = new THREE.PlaneGeometry(w / n, depth), uv = geo.attributes.uv, P = geo.attributes.position;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + (P.getX(k) / (w / n) + 0.5)) / n, 0.5 - P.getY(k) / depth);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: stripTex, color: STRIP, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(-w / 2 + (i + 0.5) * (w / n), 0, depth / 2); m.renderOrder = 3; m.userData.noAO = true; g.add(m); parts.push(m);
      }
      g.visible = false; scene.add(g);
      strips.push({ g, parts, door: d, room: R, side, other: side === 'in' ? 'outside' : null, alongX, s });
    }
  }

  // ---------- state ----------
  let phase = 'title', since = 0, assignT = 0, frame = 0, deaths = 0;
  const L = {
    rooms, switches: W.switches, pool, torch,
    // what moves near a lit fixture besides the thing and the doors (a parent walking the house): its shadow map is drawn again while it does
    movers: [],
    // the room's light now (0..1, flicker included), at a point in the house; the dining end takes some of the kitchen's
    levelAt(x, z, y = 0) {
      const name = roomAt(x, z, y), r = rooms[name];
      if (r) return r.out;
      if (name === 'dining' && rooms.kitchen) return rooms.kitchen.out * 0.55;
      return 0;
    },
    isOn: (name) => !!(rooms[name] && rooms[name].on),
    // flip a room's lights. by: 'player' (the switch you are at), 'house' (the one nearest you clicks, heard from there)
    set(name, on, { by = 'house', sw = null, silent = false } = {}) {
      const r = rooms[name]; if (!r || r.on === on) return false;
      r.on = on; r.lastFlip = since;
      const s = sw || nearestSwitch(r);
      if (s) s.pivot.rotation.x = on ? -0.36 : 0.36;
      if (!silent && sfx.ctx && s) sfx.pick('switch', { gain: by === 'house' ? 0.55 : 0.4, wet: 0.05, maxLen: 0.6, at: { x: s.pos.x, y: s.pos.y, z: s.pos.z } }) || sfx.click();
      // a cold filament: sometimes it takes a beat to catch, sometimes it buzzes as it comes on
      if (on && !r.dead && !F.blackout) {
        const k = Math.random();
        r.delay = k < 0.14 ? 0.25 + Math.random() * 0.45 : 0.04;
        if (k > 0.9 && sfx.ctx) { const b = r.bulbs[0]; sfx.tone({ type: 'sawtooth', f: 120, dur: 0.7, gain: 0.018, wet: 0.05, pan: sfx.place(0, b.pos) }); }
      }
      if (L.onFlip) L.onFlip(name, on, by);
      return true;
    },
    toggle(name, opts) { const r = rooms[name]; return r ? L.set(name, !r.on, opts) : false; },
    // the bulb dies: a pop and a tinkle, dark for the rest of the night (the switch still clicks)
    kill(name) {
      const r = rooms[name]; if (!r || r.dead) return false;
      r.dead = true; deaths++;
      const b = r.bulbs.reduce((a, c) => (c.pos.distanceTo(camera.position) < a.pos.distanceTo(camera.position) ? c : a));
      if (sfx.ctx) {
        const pan = sfx.place(0, b.pos);
        sfx.noiseHit({ dur: 0.05, type: 'highpass', f: 2600, gain: 0.55, wet: 0.35, pan });
        sfx.tone({ f: 1500, f2: 180, dur: 0.07, gain: 0.2, wet: 0.35, pan });
        sfx.noiseHit({ dur: 0.18, type: 'bandpass', f: 6200, q: 2, gain: 0.12, wet: 0.3, delay: 0.06, pan });
      }
      return true;
    },
    get deaths() { return deaths; },
    // the story's light setup: by day every room is lit, in the morning and at night none is, and the night's dead bulbs work again
    phase(p) {
      phase = p in K ? p : 'night';
      for (const r of Object.values(rooms)) {
        r.dead = false; r.killT = 0; r.on = p === 'day'; r.lvl = r.on ? 1 : 0; r.delay = 0; r.flk = 1; r.brown = 0;
        for (const s of r.switches) s.pivot.rotation.x = r.on ? -0.36 : 0.36;
      }
      deaths = 0; assignT = 0;
      for (const sp of pool) { if (sp.bulb) sp.bulb.lent = 0; sp.bulb = null; sp.k = sp.want = 0; sp.light.intensity = 0; }
      houseT = 45 + Math.random() * 45; aheadT = 70 + Math.random() * 120; aheadLeft = 1; revealDone = false; arm = null; flash = null;
    },
    // every room off at once (night one's crescendo); each switch you can hear click
    allOff({ silent = false } = {}) { for (const r of Object.values(rooms)) if (r.on) L.set(r.name, false, { silent }); },
    update(dt) { step(dt); },
  };
  // ---------- the house works the lights (nights two to ten) ----------
  // H, from nights.js: { n, quiet (the night's own scene has the house), calm, hunting, looking(x, z, cos), los(ax, az, bx, bz),
  //   revealCool(), revealed(), show(x, z) / hide() (the thing, for one frame), sting(), fear(v), near (the thing is out and close: its position) }
  let houseT = 60, aheadT = 120, aheadLeft = 1, revealDone = false, arm = null, flash = null;
  const dist2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  L.house = (dt, H) => {
    const px = camera.position.x, pz = camera.position.z, here = roomAt(px, pz, camera.position.y - 1.4);
    for (const r of Object.values(rooms)) r.leftT = r.on && r.name !== here ? r.leftT + dt : 0;
    // the one-frame reveal, already under way: it was in the corner when the light came on; now the bulb goes
    if (flash) { flash.t += dt; if (flash.t > 0.09) { H.hide(); L.kill(flash.room); flash = null; } return; }
    if (arm) {
      arm.t += dt; const r = rooms[arm.room];
      if (arm.t > 4 || !r.on || r.dead || H.hunting) arm = null;
      else if (r.lvl > 0.9 && H.looking(arm.x, arm.z, 0.84)) {
        H.show(arm.x, arm.z); H.sting(); H.revealed(); H.fear(1); flash = { room: arm.room, t: 0 }; arm = null; revealDone = true; return;
      }
    }
    if (H.quiet || H.n < 2) return;
    // the thing out and near a lit fixture: the bulb gives out after a few seconds of it
    if (H.near) for (const r of Object.values(rooms)) {
      if (!r.on || r.dead) continue;
      let d = 99; for (const b of r.bulbs) d = Math.min(d, dist2(b.pos, H.near.x, H.near.z));
      if (d < 2.7) { r.killT += dt; if (r.killT > 2.5 + (r.name.length % 3) && deaths < 2) L.kill(r.name); } else r.killT = Math.max(0, r.killT - dt);
    }
    if (!H.calm) return;
    // a room you lit and left goes dark behind you, and you hear its switch from where you are
    houseT -= dt;
    if (houseT <= 0) {
      const c = Object.values(rooms).filter((r) => r.on && !r.dead && r.leftT > 8 && r.switches.length).map((r) => ({ r, s: nearestSwitch(r) }))
        .filter(({ s }) => { const d = dist2(s.pos, px, pz); return d > 4 && d < 14 && !H.looking(s.pos.x, s.pos.z, 0.5); });
      if (c.length) { const { r } = c[Math.floor(Math.random() * c.length)]; L.set(r.name, false, { by: 'house' }); H.fear(0.35); houseT = (100 + Math.random() * 90) / (1 + 0.08 * H.n); }
      else houseT = 8;
    }
    // once a night (from night three), a dark room ahead of you lights up by itself, as if somebody wants you to go in
    aheadT -= dt;
    if (aheadT <= 0 && aheadLeft > 0 && H.n >= 3) {
      camera.getWorldDirection(fwd);
      const c = Object.values(rooms).filter((r) => {
        if (r.on || r.dead || r.name === here || !r.c) return false;
        const dx = r.c.x - px, dz = r.c.z - pz, d = Math.hypot(dx, dz);
        return d > 3 && d < 9.5 && (dx * fwd.x + dz * fwd.z) / d > 0.35 && H.los(px, pz, r.c.x, r.c.z);
      });
      if (c.length) { const r = c[Math.floor(Math.random() * c.length)]; L.set(r.name, true, { by: 'house' }); H.fear(0.4); aheadLeft--; aheadT = 200 + Math.random() * 200; }
      else aheadT = 6;
    }
  };
  // you put a light on: once in a while (never twice a night) it was standing in the room's far corner, and the bulb goes as you see it
  L.flipped = (name, on, by, H) => {
    if (!on || by !== 'player' || revealDone || arm || !H || H.quiet || H.n < 2 || H.hunting || H.revealCool() || name === 'hall') return;
    if (Math.random() > (H.n <= 3 ? 0.22 : 0.15)) return;
    const r = rooms[name], q = rectOf(name), s = nearestSwitch(r); if (!q || !s) return;
    const corners = [[q[0], q[2]], [q[0], q[3]], [q[1], q[2]], [q[1], q[3]]].map(([x, z]) => ({ x: x + (x < r.c.x ? 0.5 : -0.5), z: z + (z < r.c.z ? 0.5 : -0.5) }))
      .filter((c) => H.los(s.at.x, s.at.z, c.x, c.z)).sort((a, b) => dist2(b, s.pos.x, s.pos.z) - dist2(a, s.pos.x, s.pos.z));
    if (corners.length) arm = { room: name, t: 0, x: corners[0].x, z: corners[0].z };
  };
  const nearestSwitch = (r) => r.switches.reduce((a, s) => (!a || s.pos.distanceTo(camera.position) < a.pos.distanceTo(camera.position) ? s : a), null);

  function step(dt) {
    since += dt; frame++;
    const kPhase = K[phase] || 0;
    ROOM.roof[0] = ROOF[phase] || 0;
    // ---- each room: on/off, the delay before a cold bulb catches, the flicker near the thing ----
    const ex = E && E.visible ? E.root.position : null;
    for (const r of Object.values(rooms)) {
      if (r.delay > 0) r.delay -= dt;
      const goal = r.on && !r.dead && !F.blackout && r.delay <= 0 ? 1 : 0;
      // a filament comes up in a few hundredths of a second and glows a moment after it goes off
      r.lvl += (goal - r.lvl) * Math.min(1, dt * (goal > r.lvl ? 30 : 14));
      if (r.lvl < 0.002) r.lvl = 0;
      // the thing near the room's light: flicker and brown-out, worse the closer it is (and with the house's own flicker, F.flicker)
      let p = 0;
      if (ex && r.lvl > 0) { let d = 99; for (const b of r.bulbs) d = Math.min(d, Math.hypot(b.pos.x - ex.x, b.pos.z - ex.z)); p = Math.max(0, 1 - d / 6.5); }
      if (F.flicker && r.lvl > 0) p = Math.max(p, 0.55);
      if (p > 0.02) {
        r.fT -= dt;
        if (r.fT <= 0) { r.fT = 0.03 + Math.random() * 0.13; r.fv = Math.random() < 0.28 * p ? 0.04 + Math.random() * 0.2 : 1 - p * 0.45 * Math.random(); }
        r.flk = calm('room:' + r.name, r.fv, 1 - p * 0.25); r.brown = p * 0.75;
        if (p > 0.45 && Math.random() < dt * 0.6 && sfx.ctx) sfx.tone({ type: 'sawtooth', f: 120, dur: 0.35, gain: 0.012 * p, wet: 0.05, pan: sfx.place(0, r.bulbs[0].pos) });
      } else { r.flk += (1 - r.flk) * Math.min(1, dt * 8); r.brown *= Math.max(0, 1 - dt * 3); }
      r.out = r.lvl * r.flk * (1 - r.brown * 0.6);
      for (const b of r.bulbs) { b.out = r.out; b.brown = r.brown; b.dome.material.emissiveIntensity = (EMISSIVE[phase] || 0) * r.out; b.dome.material.emissive.copy(WARM).lerp(BROWN, r.brown); }
    }
    // ---- lend the shadowed spots to the fixtures the picture needs them at ----
    assignT -= dt;
    const shadowsOn = NS > 0 && phase === 'night' && renderer.shadowMap.enabled;
    if (assignT <= 0) {
      assignT = 0.15;
      const here = roomAt(camera.position.x, camera.position.z, camera.position.y - 1.4);
      camera.getWorldDirection(fwd);
      const want = shadowsOn ? fixtures.filter((b) => b.out > 0.002).map((b) => ({ b, s: score(b, here) })).sort((p, q) => p.s - q.s).slice(0, NS).map((x) => x.b) : [];
      // (a spot stays a second where it is put, so two fixtures that swap places in the order do not swap it straight back)
      for (const sp of pool) if (sp.bulb) sp.want = want.includes(sp.bulb) || (sp.held < 1 && sp.bulb.out > 0.002 && shadowsOn) ? 1 : 0;
      for (const b of want) {
        if (pool.some((sp) => sp.bulb === b)) continue;
        const sp = pool.find((x) => !x.bulb); if (!sp) continue;
        sp.bulb = b; sp.want = 1; sp.held = 0; sp.k = 0;   // it fades in over the fixture's own light
        sp.light.position.copy(b.pos); sp.light.target.position.set(b.pos.x, 0, b.pos.z); sp.light.target.updateMatrixWorld();
        sp.light.shadow.needsUpdate = true;
      }
    }
    for (const b of fixtures) b.lent = 0;
    for (const sp of pool) {
      const b = sp.bulb; if (!b) { sp.light.intensity = 0; continue; }
      sp.held += dt;
      // the hand-over: the spot's share and the fixture's own always add up to the whole light, so only the shadows come and go
      if (b.out <= 0.002) sp.k = 0; else sp.k = Math.max(0, Math.min(1, sp.k + Math.sign(sp.want - sp.k) * dt / 0.5));
      if (sp.want === 0 && sp.k === 0) { sp.bulb = null; sp.light.intensity = 0; continue; }
      b.lent = sp.k;
      sp.light.intensity = b.base * kPhase * b.out * sp.k;
      sp.light.color.copy(WARM).lerp(BROWN, b.brown || 0);
      // the house holds still, so a shadow map is drawn when its light moves to another fixture and again only while something near it
      // moves: the thing, or a door swinging (every other frame then, the two lights taking turns)
      if (sp.light.intensity > 0.01 && (frame + pool.indexOf(sp)) % 2 === 0 && moverNear(b.pos)) sp.light.shadow.needsUpdate = true;
    }
    // ---- every lit fixture's own light and its room's bounce (the walls and the ceiling fill with it too), listed room by room ----
    let n = 0, m = 0;
    for (const b of fixtures) b.slot = -1;
    lists.forEach((li, ri) => {
      ROOM.list[ri * 4] = n;
      for (const b of li.own) {
        const own = b.base * kPhase * b.out * (1 - b.lent), fill = (BOUNCE[phase] || 0) * b.out * b.base / 9;
        if (own + fill <= 0.0005) continue;
        const j = n * 4;
        ROOM.pos[j] = b.pos.x; ROOM.pos[j + 1] = b.pos.y; ROOM.pos[j + 2] = b.pos.z; ROOM.pos[j + 3] = rooms[b.room].radius + 1.6;
        col.copy(WARM).lerp(BROWN, b.brown || 0).multiplyScalar(own); ROOM.spot[j] = col.r; ROOM.spot[j + 1] = col.g; ROOM.spot[j + 2] = col.b;
        col.copy(BOUNCE_COL).lerp(BROWN, (b.brown || 0) * 0.6).multiplyScalar(fill); ROOM.fill[j] = col.r; ROOM.fill[j + 1] = col.g; ROOM.fill[j + 2] = col.b;
        b.slot = n++;
      }
      ROOM.list[ri * 4 + 1] = n - ROOM.list[ri * 4];
    });
    ROOM.roof[1] = n ? 1 : 0;
    lists.forEach((li, ri) => {
      ROOM.list[ri * 4 + 2] = m;
      for (const o of li.gaps) {
        if (o.b.slot < 0 || m >= ROOM_GAPS) continue;
        const g = o.door ? doorGap(o) : [o.lo, o.hi];
        if (g[1] - g[0] < 0.004) continue;
        ROOM.gap.set([o.at, g[0], g[1], (o.top + 4 * o.b.slot) * (o.alongX ? -1 : 1)], m * 4); m++;
      }
      ROOM.list[ri * 4 + 3] = m - ROOM.list[ri * 4 + 2];
    });
    // ---- the light under the shut doors ----
    const night = phase === 'night' ? 1 : phase === 'title' ? 0 : 0.25;
    for (const st of strips) {
      const shut = 1 - Math.min(1, st.door.a * 4);
      // out: the room is lit and you are outside it; in: the room is dark and the hall (or the dining room) beyond is lit
      const src = st.side === 'out' ? st.room.out : Math.max(0, L.levelAt(st.door.mid.x + (st.alongX ? 0 : st.s * -0.5), st.door.mid.z + (st.alongX ? st.s * -0.5 : 0)) - st.room.out);
      const v = src * shut * night;
      st.g.visible = v > 0.01;
      if (!st.g.visible) continue;
      // something standing just behind the door on the lit side: two of the pieces go dark, where its feet are
      let feet = 0;
      if (ex) { const dd = Math.hypot(ex.x - st.door.mid.x, ex.z - st.door.mid.z); const behind = st.alongX ? Math.sign(ex.z - st.door.mid.z) !== st.s : Math.sign(ex.x - st.door.mid.x) !== st.s; if (dd < 1.1 && behind) feet = 1 - dd / 1.1; }
      st.parts.forEach((m, i) => { m.material.opacity = Math.min(1, v * 0.8) * (feet && (i === 1 || i === 3) ? 1 - feet * 0.9 : 1); });
    }
  }
  const moverNear = (p) => {
    if (E && E.visible && Math.hypot(E.root.position.x - p.x, E.root.position.z - p.z) < 7.5) return true;
    for (const k in W.doors) { const d = W.doors[k]; if (d.a !== d.target && Math.hypot(d.mid.x - p.x, d.mid.z - p.z) < 7.5) return true; }
    for (const m of L.movers || []) if (m.visible && Math.hypot(m.position.x - p.x, m.position.z - p.z) < 7.5) return true;
    return false;
  };
  // which lit fixture wants a shadowed spot most: the one in your room, then the nearest; one behind you or behind a shut door counts as
  // further away, and the fixture a spot is at already counts as nearer, so two that are much the same never trade places back and forth
  const doorOf = Object.fromEntries(Object.entries(DOOR_ROOM).map(([d, r]) => [r, d]));
  function score(b, here) {
    const dx = b.pos.x - camera.position.x, dz = b.pos.z - camera.position.z, d = Math.hypot(dx, dz);
    let s = d;
    if (pool.some((sp) => sp.bulb === b && sp.want)) s -= 2;
    if (b.room === here) return s - 100;
    if (d > 0.5 && (dx * fwd.x + dz * fwd.z) / d < 0.1) s += 4;
    const dr = W.doors[doorOf[b.room]]; if (dr && dr.a < 0.05) s += 8;
    return s;
  }
  return L;
}
