# The thing's head and hands (assets/models/thing.glb), built by Blender 4.2 from what tools/models/thing.cjs hands over:
#   blender -b --factory-startup --python tools/models/thing.py -- thing.json out.glb [folder for the pictures]
# The head is the game's own skull-and-neck mesh, vertex for vertex (so the eyes, the grin and the morphs of js/creature.js still fit),
# with its surface worked: temples and cheeks sunk, a brow over each socket, the back of the skull drawn out, the jaw narrowed to a
# chin, and down the neck the two cords, the larynx and the knuckles of the spine. Nothing is moved inside the eye sockets or at the
# lips. Its skin is painted into three pictures laid out on the mesh's own rows and columns: colour (ashen, mottled, veined, bruised
# round the sockets and the mouth), relief (pores, creases, the veins standing up) and roughness (wet at the lips and the eyes).
# The hands are built on the finger joints: a skin over a skeleton of edges (a knob at every joint, a thin shaft between, a nail past
# the tip), a thin palm between the wrist and the knuckles, the lot fused by a voxel remesh, smoothed and thinned; coloured by vertex.
import bpy, bmesh, json, math, os, sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
DATA = json.load(open(argv[0])); OUT = argv[1]; PICS = argv[2] if len(argv) > 2 else os.path.dirname(argv[0])
TEX = 1024

# ---------- noise ----------
def _hash(ix, iy, iz, seed):
    n = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (seed * 2654435761)
    n = (n & 0xffffffff).astype(np.uint64)
    n = (n ^ (n >> 13)) * 0x5bd1e995 & 0xffffffff
    n = (n ^ (n >> 15)) * 0x27d4eb2d & 0xffffffff
    n = n ^ (n >> 16)
    return (n & 0xffffff).astype(np.float64) / float(0x1000000)

def value(p, seed=0):
    f = np.floor(p); t = p - f; t = t * t * (3 - 2 * t)
    ix, iy, iz = f[..., 0], f[..., 1], f[..., 2]
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (t[..., 0] if dx else 1 - t[..., 0]) * (t[..., 1] if dy else 1 - t[..., 1]) * (t[..., 2] if dz else 1 - t[..., 2])
                out = out + w * _hash(ix + dx, iy + dy, iz + dz, seed)
    return out

def fbm(p, octaves=4, seed=0):
    out = 0; amp = 0.5; tot = 0
    for o in range(octaves):
        out = out + amp * value(p * (2 ** o), seed + o * 17); tot += amp; amp *= 0.5
    return out / tot

def worley(p, seed=0):
    # the distances to the nearest and the second nearest of the points scattered one to a cell
    f = np.floor(p); d1 = np.full(p.shape[:-1], 9.0); d2 = np.full(p.shape[:-1], 9.0)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cy, cz = f[..., 0] + dx, f[..., 1] + dy, f[..., 2] + dz
                q = np.stack([cx + _hash(cx, cy, cz, seed + 1), cy + _hash(cx, cy, cz, seed + 2), cz + _hash(cx, cy, cz, seed + 3)], -1)
                d = np.sqrt(((q - p) ** 2).sum(-1))
                d2 = np.where(d < d1, d1, np.minimum(d2, d)); d1 = np.minimum(d1, d)
    return d1, d2

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def lerp(a, b, t): return a + (b - a) * t
def bl(p): return (float(p[0]), float(-p[2]), float(p[1]))   # +y up to Blender's +z up

# ---------- the head ----------
H = DATA['head']; W, R = H['cols'], H['rows']; M0, M1 = H['mouth']
P = np.array(H['pos'], dtype=np.float64).reshape(R, W, 3)
N = np.array(H['nrm'], dtype=np.float64).reshape(R, W, 3)
EQ = np.array(H['eyeq'], dtype=np.float64).reshape(R, W, 4)
GLOW = np.array(H['glow'], dtype=np.float64).reshape(R, W, 2); FRONT = GLOW[..., 0]

def fields(P, EQ, rows):
    # what the sculpt and the paint both go by: the angle round the head, the nearer eye (distance in its radii, how far above it),
    # how much a point is lip (1 between the lips' outer edges where the mouth is open, fading over a few rows either side)
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    az = np.arctan2(x, z)
    r0 = np.hypot(EQ[..., 0], EQ[..., 1]); r1 = np.hypot(EQ[..., 2], EQ[..., 3])
    near = np.minimum(r0, r1); qx = np.where(r0 < r1, EQ[..., 0], EQ[..., 2]); qy = np.where(r0 < r1, EQ[..., 1], EQ[..., 3])
    return x, y, z, az, near, qx, qy

x, y, z, az, near, qx, qy = fields(P, EQ, None)
rowi = np.arange(R, dtype=np.float64)[:, None] * np.ones((1, W))
OPEN = np.clip(GLOW[..., 1].max(axis=0) / 0.3, 0, 1)[None, :] * np.ones((R, 1))   # where there is a mouth at all: round to the corners
def lipness(rows, open_, pad): return np.clip(1 - np.maximum(M0 - rows, rows - M1) / pad, 0, 1) * open_
def inmouth(rows): return ss(M0 + 2.5, M0 + 4.5, rows) * (1 - ss(M1 - 4.5, M1 - 2.5, rows))

def sculpt(P, N):
    a = np.abs(az); back = math.pi - a
    def blob(a0, y0, sa, sy): return np.exp(-((a - a0) / sa) ** 2 - ((y - y0) / sy) ** 2)
    D = -0.03 * blob(1.42, 0.06, 0.3, 0.08)                                       # the temples
    D += -0.022 * blob(1.5, -0.1, 0.3, 0.055)                                     # the cheeks, under the bone
    D += 0.009 * blob(1.2, -0.03, 0.2, 0.026)                                    # the cheekbone
    up = np.clip(qy / np.maximum(near, 1e-6), 0, 1)
    D += 0.012 * np.exp(-((near - 1.5) / 0.17) ** 2) * up * ss(1.18, 1.4, near)     # a brow over each socket
    D += -0.004 * np.exp(-(az / 0.12) ** 2 - ((y - 0.16) / 0.05) ** 2)              # the furrow between them
    D += 0.036 * np.exp(-(back / 1.0) ** 2 - ((y - 0.12) / 0.15) ** 2)               # the back of the skull
    D += 0.014 * (fbm(P * 7.0, 3, 5) - 0.5)                                         # never quite an egg
    D += 0.008 * np.exp(-(az / 0.42) ** 2 - ((y + 0.238) / 0.03) ** 2)              # the chin
    D += -0.018 * blob(0.95, -0.215, 0.32, 0.04)                                    # the jaw narrowed to it
    yj = -0.205 + 0.085 * ss(0.9, 1.9, a)                                           # the edge of the jaw, rising to the ear
    side = 1 - ss(1.9, 2.3, a)
    D += 0.005 * np.exp(-((y - yj) / 0.012) ** 2) * side * ss(0.25, 0.6, a)
    D += -0.007 * np.exp(-((y - (yj - 0.04)) / 0.022) ** 2) * side
    # the neck: a cord each side from behind the ear to the pit of the throat, the larynx, the spine's knuckles
    nk = ss(-0.22, -0.29, y)
    at = lerp(1.9, 0.42, ss(-0.2, -0.46, y))
    D += 0.011 * np.exp(-((a - at) / 0.15) ** 2) * nk
    D += -0.005 * np.exp(-(az / 0.26) ** 2) * ss(-0.35, -0.43, y)
    D += 0.006 * np.exp(-(az / 0.3) ** 2 - ((y + 0.335) / 0.024) ** 2)
    D += 0.006 * np.exp(-(back / 0.3) ** 2) * np.maximum(0, np.cos(y * 2 * math.pi / 0.038)) ** 2 * ss(-0.2, -0.27, y)
    # not in the sockets, not at the lips, not where the neck goes into the collar
    keep = ss(1.3, 1.9, near) * (1 - np.clip(1 - np.maximum(M0 - rowi, rowi - M1) / 6.0, 0, 1) ** 0.7 * OPEN) * ss(-0.455, -0.41, y)
    D = D * keep
    D = np.where(D > 0, D * ss(0.25, 0.17, y), D)                                    # nothing added to its height
    D[0, :] = D[0, :].mean()                                                        # the crown is one point
    D[:, -1] = D[:, 0]                                                              # and the seam one line
    return P + N * D[..., None], D

PS, DISP = sculpt(P, N)

def sample(A, T):
    # a grid of values by row and column, at the middle of every texel (row 0 of the picture is its bottom)
    v = (np.arange(T) + 0.5) / T; rf = (1 - v) * (R - 1); cf = v * (W - 1)
    r0 = np.clip(np.floor(rf).astype(int), 0, R - 2); c0 = np.clip(np.floor(cf).astype(int), 0, W - 2)
    tr = (rf - r0)[:, None]; tc = (cf - c0)[None, :]
    if A.ndim == 3: tr = tr[..., None]; tc = tc[..., None]
    a = A[r0][:, c0]; b = A[r0][:, c0 + 1]; c = A[r0 + 1][:, c0]; d = A[r0 + 1][:, c0 + 1]
    return (a * (1 - tc) + b * tc) * (1 - tr) + (c * (1 - tc) + d * tc) * tr

def paint():
    T = TEX
    Pt = sample(PS, T); Et = sample(EQ, T); Dt = sample(DISP, T); Ft = sample(FRONT, T); Ot = sample(OPEN, T)
    v = (np.arange(T) + 0.5) / T; rows = ((1 - v) * (R - 1))[:, None] * np.ones((1, T))
    x, y, z, az, near, qx, qy = fields(Pt, Et, rows)
    near = lerp(9.0, near, ss(0.0, 0.6, Ft))                                                     # (no sockets round the back)
    lip = lipness(rows, Ot, 5.0); inside = inmouth(rows) * Ot
    broad = fbm(Pt * 9.0, 3, 1); mid = fbm(Pt * 38.0, 3, 2); fine = fbm(Pt * 170.0, 2, 3); pore = value(Pt * 620.0, 4)
    warp = Pt + 0.012 * np.stack([fbm(Pt * 22.0, 2, 6), fbm(Pt * 22.0, 2, 7), fbm(Pt * 22.0, 2, 8)], -1)
    d1, d2 = worley(warp * 15.0, 9); edge = d2 - d1
    e1, e2 = worley(warp * 46.0, 12); cap = e2 - e1
    where = np.clip(ss(0.42, 0.62, fbm(Pt * 4.5, 2, 10)) + 0.8 * np.exp(-((np.abs(az) - 1.4) / 0.4) ** 2 - ((y - 0.08) / 0.1) ** 2) + 0.7 * ss(-0.24, -0.32, y), 0, 1)
    where = where * (1 - lip) * ss(1.2, 1.7, near)
    where = where * ss(0.4, 0.6, fbm(Pt * 20.0, 2, 13))                                     # in runs, not a net
    vein = (1 - ss(0.0, 0.035, edge)) * where; veinw = (1 - ss(0.0, 0.07, edge)) * where
    # creases: across the forehead, out from the sockets, across the lips, round the neck
    line = lambda t, w: 1 - ss(0.0, w, np.abs(np.sin(t)))
    c_brow = line(math.pi * (y * 52 + 2.2 * broad), 0.13) * ss(0.185, 0.215, y) * (1 - ss(0.9, 1.3, np.abs(az))) * ss(1.3, 1.6, near)
    c_eye = line(np.arctan2(qy, qx) * 11 + 5 * mid, 0.2) * np.exp(-((near - 1.5) / 0.28) ** 2)
    c_lip = line(az * 64 + 7 * mid, 0.22) * lipness(rows, Ot, 9.0) * (1 - inside)
    c_neck = line(math.pi * (y * 58 + 1.5 * broad), 0.12) * ss(-0.27, -0.31, y)
    crease = np.clip(c_brow + c_eye + c_lip + c_neck, 0, 1)
    h = 0.0010 * vein - 0.0007 * crease + 0.0011 * (mid - 0.5) + 0.00045 * (fine - 0.5) + 0.00022 * (pore - 0.5)
    h = h * (1 - 0.8 * inside)
    # colour
    col = lerp(np.array([0.63, 0.61, 0.59]), np.array([0.51, 0.53, 0.58]), broad[..., None])
    def tint(c, k): return lerp(col, np.array(c), np.clip(k, 0, 1)[..., None])
    col = tint([0.43, 0.34, 0.44], 0.55 * ss(0.52, 0.72, fbm(Pt * 5.5, 3, 20)))                 # livid patches
    col = col * (0.88 + 0.24 * mid)[..., None]
    col = tint([0.27, 0.28, 0.42], 0.6 * veinw)                                                  # the veins
    col = tint([0.46, 0.2, 0.24], 0.35 * (1 - ss(0.0, 0.07, cap)) * ss(0.45, 0.7, fbm(Pt * 8.0, 2, 21)) * (1 - lip))   # broken capillaries
    col = tint([0.2, 0.1, 0.16], 0.9 * (1 - ss(1.0, 1.9, near)) ** 1.2)                        # the sockets
    col = tint([0.25, 0.09, 0.1], 0.85 * lipness(rows, Ot, 7.0) ** 1.5)                          # the lips
    col = tint([0.07, 0.02, 0.02], inside)                                                       # and inside them
    col = col * (1 - 0.3 * ss(0.84, 0.9, value(Pt * 95.0, 22)) * ss(0.45, 0.65, fbm(Pt * 3.0, 2, 23)))[..., None]   # spots
    col = col * (1 - 5.0 * np.clip(-Dt, 0, 0.03))[..., None] * (1 - 0.3 * crease)[..., None] * (1 - 0.12 * ss(-0.2, -0.3, y))[..., None]
    col = np.clip(col * 0.76, 0, 1)                                                              # ashen: in a torch at arm's length it must not burn out
    # roughness: damp skin, wet at the lips and round the eyes, a sheen in patches
    rough = 0.52 + 0.22 * (mid - 0.5) - 0.16 * ss(0.5, 0.8, fbm(Pt * 7.0, 2, 30))
    rough = lerp(rough, 0.24, np.clip(lipness(rows, Ot, 6.0) * 1.2, 0, 1)); rough = lerp(rough, 0.28, 1 - ss(1.0, 1.7, near))
    rough = np.clip(rough + 0.1 * crease, 0.18, 0.9)
    # relief: the slope of the height across the picture, in metres over metres
    du = np.linalg.norm(np.roll(Pt, -1, 1) - np.roll(Pt, 1, 1), axis=-1) / 2
    dv = np.zeros_like(du); dv[1:-1] = np.linalg.norm(Pt[2:] - Pt[:-2], axis=-1) / 2; dv[0] = dv[1]; dv[-1] = dv[-2]
    du = np.maximum(du, 2e-4); dv = np.maximum(dv, 2e-4)                                         # (the crown and the shut corners: no slope to speak of)
    hx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * du)
    hy = np.zeros_like(h); hy[1:-1] = (h[2:] - h[:-2]) / (2 * dv[1:-1])
    nx, ny = np.clip(-hx, -1.5, 1.5), np.clip(-hy, -1.5, 1.5)
    ln = np.sqrt(nx * nx + ny * ny + 1)
    nrm = np.stack([nx / ln, ny / ln, 1 / ln], -1) * 0.5 + 0.5
    orm = np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], -1)
    return col, nrm, orm

def image(name, arr, data):
    T = arr.shape[0]
    im = bpy.data.images.new(name, T, T, alpha=False, is_data=data)
    rgba = np.concatenate([arr, np.ones((T, T, 1))], -1).astype(np.float32)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = os.path.join(PICS, name + '.png'); im.file_format = 'PNG'; im.save()
    return im

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

def head_object():
    me = bpy.data.meshes.new('head')
    verts = [bl(p) for p in PS.reshape(-1, 3)]
    faces = []
    for r in range(R - 1):
        for c in range(W - 1):
            a, b, d, e = r * W + c, (r + 1) * W + c, r * W + c + 1, (r + 1) * W + c + 1
            if r == 0: faces.append((a, b, e))
            else: faces += [(a, b, d), (d, b, e)]
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name='UVMap')
    li = np.zeros(len(me.loops), dtype=np.int32); me.loops.foreach_get('vertex_index', li)
    uvs = np.stack([(li % W) / (W - 1), 1 - (li // W) / (R - 1)], -1)
    uv.data.foreach_set('uv', uvs.ravel())
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new('head', me); bpy.context.scene.collection.objects.link(ob)
    col, nrm, orm = paint()
    mat = bpy.data.materials.new('thing_skin'); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
    def tex(im): n = nt.nodes.new('ShaderNodeTexImage'); n.image = im; return n
    tc = tex(image('thing_colour', col, False)); nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
    tn = tex(image('thing_relief', nrm, True)); nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    to = tex(image('thing_rough', orm, True)); sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(to.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    me.materials.append(mat)
    return ob

# ---------- the hands ----------
J = {k: np.array(v, dtype=np.float64) for k, v in DATA['hands']['joints'].items()}
WR = DATA['hands']['wrist']
def unit(v): return v / max(1e-9, np.linalg.norm(v))

def hand(s):
    Ha, Fo = J[s + '_Hand'], J[s + '_Forearm']
    F = [[J[f'{s}_Finger{f}'], J[f'{s}_Finger{f}1'], J[f'{s}_Finger{f}2']] for f in range(5)]
    arm = unit(Ha - Fo)
    lat = unit(F[4][0] - F[1][0])
    pn = unit(np.cross(F[2][0] - Ha, lat))
    if np.dot(pn, F[0][2] - Ha) < 0: pn = -pn                                # the palm's side: where the thumb's tip is
    wr = WR[s]
    verts, radii, edges = [], [], []
    def add(p, r, parent=None):
        verts.append(p); radii.append(r)
        if parent is not None: edges.append((parent, len(verts) - 1))
        return len(verts) - 1
    root = add(Ha - arm * 7.5, wr * 0.5)
    wrist = add(Ha, wr * 0.52, root)
    tips = []
    for f in range(5):
        j0, j1, j2 = F[f]; k = 1.0 if f else 1.12
        tip = j2 + (j2 - j1) * 1.0
        d = unit(tip - j2)
        if f:
            m = add(lerp(Ha, j0, 0.5) - pn * 0.15, 0.55, wrist)                # the bone of the hand to this knuckle
            a = add(j0, 1.0 * k, m)
        else:
            a = add(j0, 1.05 * k, wrist)
        b = add(lerp(j0, j1, 0.5), 0.62 * k, a)
        c = add(j1, 0.86 * k, b)
        e = add(lerp(j1, j2, 0.5), 0.55 * k, c)
        g = add(j2, 0.74 * k, e)
        h = add(lerp(j2, tip, 0.55), 0.5 * k, g)
        t = add(tip, 0.46 * k, h)
        n1 = add(tip + d * 1.2 + pn * 0.12, 0.3, t)
        add(tip + d * 2.5 + pn * 0.55, 0.09, n1)                             # the nail, hooked toward the palm
        tips.append((j0, j1, j2, tip, d))
    me = bpy.data.meshes.new('hand_bones_' + s); bm = bmesh.new()
    lay = bm.verts.layers.skin.verify()
    bv = [bm.verts.new(bl(p)) for p in verts]
    for a, b in edges: bm.edges.new((bv[a], bv[b]))
    for v, r in zip(bv, radii): v[lay].radius = (r, r)
    bv[0][lay].use_root = True
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('hand_bones_' + s, me); bpy.context.scene.collection.objects.link(ob)
    ob.modifiers.new('skin', 'SKIN'); sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 2
    # the palm: a thin slab from the wrist to the four knuckles
    pm = bpy.data.meshes.new('palm_' + s); bm = bmesh.new()
    pts = [Ha + lat * 1.9, Ha - lat * 1.6, Ha - arm * 2.0 + lat * 1.4, Ha - arm * 2.0 - lat * 1.2] + [F[f][0] for f in range(1, 5)] + [F[1][0] - lat * 0.7, F[4][0] + lat * 0.7, F[0][0]]
    for p in pts:
        for sgn, th in ((1, 0.75), (-1, 0.55)): bm.verts.new(bl(p + pn * sgn * th))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bm.to_mesh(pm); bm.free()
    po = bpy.data.objects.new('palm_' + s, pm); bpy.context.scene.collection.objects.link(po)
    # fused, smoothed and thinned
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    for o in (ob, po):
        ev = o.evaluated_get(dg); m = ev.to_mesh(); bm.from_mesh(m); ev.to_mesh_clear()
    full = bpy.data.meshes.new('hand_' + s); bm.to_mesh(full); bm.free()
    ho = bpy.data.objects.new('hand_' + s, full); bpy.context.scene.collection.objects.link(ho)
    bpy.data.objects.remove(ob, do_unlink=True); bpy.data.objects.remove(po, do_unlink=True)
    rm = ho.modifiers.new('remesh', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.14; rm.use_smooth_shade = True
    sm = ho.modifiers.new('smooth', 'SMOOTH'); sm.factor = 0.5; sm.iterations = 4
    dc = ho.modifiers.new('thin', 'DECIMATE'); dc.ratio = 0.05
    dg = bpy.context.evaluated_depsgraph_get(); ev = ho.evaluated_get(dg)
    final = bpy.data.meshes.new_from_object(ev)
    bpy.data.objects.remove(ho, do_unlink=True)
    return final, tips, (Ha, pn)

def hands_object():
    bm = bmesh.new(); info = []
    for s in ('L', 'R'):
        me, tips, palm = hand(s); bm.from_mesh(me); info.append((tips, palm)); bpy.data.meshes.remove(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new('hands'); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    n = len(me.vertices); co = np.zeros(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(n, 3)
    Pg = np.stack([co[:, 0], co[:, 2], -co[:, 1]], -1)                         # back to +y up, centimetres
    col = np.tile(np.array([0.27, 0.26, 0.26]), (n, 1)) * (0.8 + 0.4 * fbm(Pg * 0.35, 3, 40))[:, None]
    col = lerp(col, np.array([0.2, 0.15, 0.2]), (0.5 * ss(0.5, 0.75, fbm(Pg * 0.18, 2, 41)))[:, None])
    for tips, (Ha, pn) in info:
        for f, (j0, j1, j2, tip, d) in enumerate(tips):
            for j, r in ((j0, 1.5), (j1, 1.25), (j2, 1.1)):                 # the knuckles bruised
                k = np.exp(-(np.linalg.norm(Pg - j, axis=-1) / r) ** 2)
                col = lerp(col, np.array([0.1, 0.055, 0.085]), (0.65 * k)[:, None])
            # the last bone darkening to the nail; the nail itself nearly black
            rel = Pg - j2; t = rel @ d; off = np.linalg.norm(rel - t[:, None] * d, axis=-1)
            L = np.linalg.norm(tip - j2); mine = off < 1.3
            col = lerp(col, np.array([0.07, 0.04, 0.05]), (0.7 * ss(0.2 * L, 1.0 * L, t) * mine)[:, None])
            col = lerp(col, np.array([0.03, 0.022, 0.018]), (ss(1.0 * L, 1.0 * L + 0.7, t) * mine)[:, None])
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', np.concatenate([np.clip(col, 0, 1), np.ones((n, 1))], -1).ravel())
    me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0
    mat = bpy.data.materials.new('thing_hands'); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.45
    me.materials.append(mat)
    ob = bpy.data.objects.new('hands', me); bpy.context.scene.collection.objects.link(ob)
    return ob

head = head_object()
hands = hands_object()
print('head', len(head.data.vertices), 'vertices; hands', len(hands.data.vertices), 'vertices,', len(hands.data.polygons), 'triangles')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=82, export_yup=True, export_apply=False,
                          export_normals=False, export_tangents=False, export_materials='EXPORT', export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                          export_morph=False, export_skins=False, export_animations=False, export_cameras=False, export_lights=False, export_extras=False)
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
