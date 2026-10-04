"""
ECHO asset builder — run inside Blender (or with the `bpy` module):

    blender --background --python blender/build_assets.py
    # or:  python blender/build_assets.py   (with `pip install bpy`)

Builds every 3D model in the game from code — low-poly, faceted, one tile =
one Blender unit — and exports each as a .glb into assets/models/.
Front of every model faces Blender -Y (= south in the game, toward the camera).
Characters and creatures are split into named parts with pivots at their
joints (hips, shoulders, neck) so the game can animate them; optional gear
(helmets, shields, torches, boss armour) are separate named parts the game
switches on and off.
"""
import math
import os
import sys

import bpy  # must come first when running as the `bpy` module
import bmesh
from mathutils import Euler, Matrix, Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'models')
os.makedirs(OUT, exist_ok=True)

# ----------------------------------------------------------------- palette
# name: (hex colour, emission strength, roughness)
PALETTE = {
    'skin': ('#e0ac85', 0, .8), 'hair': ('#4a3020', 0, .9), 'eye': ('#1a1410', 0, .5),
    'cloth': ('#7a8a4a', 0, .9), 'cloth2': ('#4a3a2a', 0, .9), 'leather': ('#6b4a2c', 0, .8),
    'cape': ('#2f7f86', 0, .9), 'metal': ('#b8bcc6', 0, .35), 'darkmetal': ('#55575e', 0, .45),
    'gold': ('#e6c06a', 0, .3), 'wood': ('#7a5a36', 0, .85), 'darkwood': ('#4a3420', 0, .85),
    'wall': ('#c8ad84', 0, .9), 'plaster': ('#e2d6bc', 0, .9), 'stone': ('#9a9488', 0, .95),
    'darkstone': ('#6e6a62', 0, .95), 'roof': ('#4a5a78', 0, .8), 'window': ('#2a2f3a', 0, .2),
    'glow': ('#ffb347', 6, .5), 'flame': ('#ff7a2a', 10, .5), 'banner': ('#6f8fc4', 0, .9),
    'awning': ('#c8573a', 0, .9), 'awning2': ('#eadfc8', 0, .9), 'canvas': ('#d8cdb0', 0, .9),
    'tent': ('#8a3a2a', 0, .9), 'leaves': ('#4d8a3c', 0, .9), 'leaves2': ('#3a6e30', 0, .9),
    'pine': ('#2f5c3a', 0, .9), 'trunk': ('#5a3e25', 0, .9), 'crop': ('#c9a43a', 0, .9),
    'grass': ('#5b8a3c', 0, .95), 'reed': ('#6f8f4a', 0, .9), 'rock': ('#8a857c', 0, .95),
    'bone': ('#e2dccb', 0, .7), 'clay': ('#7a6a52', 0, .95), 'scale': ('#2c3a26', 0, .6),
    'fur': ('#4b4e5e', 0, .95), 'furlight': ('#6a6e80', 0, .95), 'belly': ('#9a9aa8', 0, .95),
    'rat': ('#8a7a5c', 0, .95), 'hare': ('#b7a07a', 0, .95), 'white': ('#f0ece0', 0, .9),
    'pink': ('#e8b0b0', 0, .9), 'drake': ('#5d6b3c', 0, .7), 'drakebelly': ('#a8a46a', 0, .7),
    'wyrm': ('#4b5d6e', 0, .6), 'wyrmbelly': ('#9aa8b0', 0, .6), 'stag': ('#6b5a4a', 0, .9),
    'antler': ('#d8cdb0', 0, .8), 'eyeglow': ('#ffcf3a', 8, .3), 'statue': ('#c8c4ba', 0, .8),
    'rune': ('#9fd3ff', 4, .3), 'water': ('#3a6e9c', 0, .1), 'red': ('#a83a2a', 0, .9),
    'straw': ('#d8b86a', 0, .9), 'iron': ('#3a3a42', 0, .6), 'paper': ('#e8dcc0', 0, .9),
}


def hex2rgba(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [(c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


MATS = {}


def mat(name):
    if name in MATS:
        return MATS[name]
    col, emit, rough = PALETTE[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    rgba = hex2rgba(col)
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = rough
    if emit:
        bsdf.inputs['Emission Color'].default_value = rgba
        bsdf.inputs['Emission Strength'].default_value = emit
    MATS[name] = m
    return m


# ----------------------------------------------------------------- modelling
class Part:
    """One object: a pivot in model space, geometry added in model space."""

    def __init__(self, model, name, pivot=(0, 0, 0), parent=None):
        self.model, self.name, self.pivot, self.parent = model, name, Vector(pivot), parent
        self.bm = bmesh.new()
        self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _place(self, geom_verts, faces, size, at, rot, m):
        R = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
        S = Matrix.Diagonal((*size, 1))
        T = Matrix.Translation(Vector(at) - self.pivot)
        bmesh.ops.transform(self.bm, matrix=T @ R @ S, verts=geom_verts)
        mi = self._mi(m)
        for f in faces:
            f.material_index = mi

    def _new(self, fn, **kw):
        before = set(self.bm.faces)
        res = fn(self.bm, **kw)
        verts = res['verts']
        faces = [f for f in self.bm.faces if f not in before]
        return verts, faces

    def box(self, size, at, m, rot=(0, 0, 0)):
        v, f = self._new(bmesh.ops.create_cube, size=1.0)
        self._place(v, f, size, at, rot, m)
        return self

    def cyl(self, r, h, at, m, seg=8, r2=None, rot=(0, 0, 0), scale=(1, 1)):
        r2 = r if r2 is None else r2
        v, f = self._new(bmesh.ops.create_cone, cap_ends=True, cap_tris=False, segments=seg,
                         radius1=r, radius2=r2, depth=h)
        self._place(v, f, (scale[0], scale[1], 1), at, rot, m)
        return self

    def cone(self, r, h, at, m, seg=8, rot=(0, 0, 0), scale=(1, 1)):
        return self.cyl(r, h, at, m, seg=seg, r2=0.0, rot=rot, scale=scale)

    def ball(self, r, at, m, sub=1, scale=(1, 1, 1), rot=(0, 0, 0)):
        v, f = self._new(bmesh.ops.create_icosphere, subdivisions=sub, radius=r)
        self._place(v, f, scale, at, rot, m)
        return self

    def prism(self, size, at, m, rot=(0, 0, 0)):
        """Gable roof: ridge along X, triangular cross-section in Y-Z."""
        sx, sy, sz = size
        bm = self.bm
        before = set(bm.faces)
        p = [(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0), (-.5, 0, 1), (.5, 0, 1)]
        vs = [bm.verts.new(c) for c in p]
        for idx in [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]:
            bm.faces.new([vs[i] for i in idx])
        faces = [f for f in bm.faces if f not in before]
        self._place(vs, faces, (sx, sy, sz), at, rot, m)
        return self

    def build(self):
        me = bpy.data.meshes.new(self.model.name + '_' + self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(mat(m))
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


class Model:
    def __init__(self, name):
        self.name = name
        self.parts = []

    def part(self, name, pivot=(0, 0, 0), parent=None):
        p = Part(self, name, pivot, parent)
        self.parts.append(p)
        return p

    def export(self):
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        objs = {}
        for p in self.parts:
            ob = p.build()
            objs[p.name] = (ob, p)
        for name, (ob, p) in objs.items():
            if p.parent is not None:
                pob, pp = objs[p.parent.name]
                ob.parent = pob
                ob.location = p.pivot - pp.pivot
            else:
                ob.location = p.pivot
        path = os.path.join(OUT, self.name + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False,
                                  export_apply=False, export_yup=True, export_materials='EXPORT',
                                  export_animations=False, export_cameras=False, export_lights=False)
        tris = sum(len(ob.data.polygons) for ob, _ in objs.values())
        print(f'  {self.name:14s} {len(objs):2d} parts {tris:5d} faces')


MODELS = []


def model(fn):
    MODELS.append(fn)
    return fn


# ================================================================= PEOPLE
@model
def person():
    m = Model('person')
    root = m.part('root')
    hip = 0.42
    m.part('legL', (0, -0.085, hip), root).box((.12, .12, .42), (0, -0.085, hip - .21), 'cloth2').box((.15, .13, .06), (0.02, -0.085, 0.03), 'leather')
    m.part('legR', (0, 0.085, hip), root).box((.12, .12, .42), (0, 0.085, hip - .21), 'cloth2').box((.15, .13, .06), (0.02, 0.085, 0.03), 'leather')
    body = m.part('body', (0, 0, hip), root)
    body.box((.22, .34, .4), (0, 0, hip + .2), 'cloth').box((.24, .36, .06), (0, 0, hip + .02), 'leather')
    robe = m.part('robe', (0, 0, 0), body)
    robe.cyl(.2, .44, (0, 0, .24), 'cloth', seg=8, r2=.16)
    apron = m.part('apron', (0, 0, hip), body)
    apron.box((.03, .26, .44), (-.13, 0, hip + .12), 'leather')
    cape = m.part('cape', (.12, 0, hip + .38), body)
    cape.box((.04, .36, .62), (.14, 0, hip + .06), 'cape')
    sh = hip + .38
    armL = m.part('armL', (0, -.22, sh), body)
    armL.box((.1, .1, .36), (0, -.22, sh - .17), 'cloth').box((.1, .1, .08), (0, -.22, sh - .38), 'skin')
    armR = m.part('armR', (0, .22, sh), body)
    armR.box((.1, .1, .36), (0, .22, sh - .17), 'cloth').box((.1, .1, .08), (0, .22, sh - .38), 'skin')
    hz = hip + .42
    head = m.part('head', (0, 0, hz), body)
    head.box((.24, .24, .24), (0, 0, hz + .12), 'skin')
    head.box((.03, .04, .04), (-.12, -.055, hz + .13), 'eye').box((.03, .04, .04), (-.12, .055, hz + .13), 'eye')
    head.box((.05, .05, .06), (-.13, 0, hz + .09), 'skin')
    m.part('hair', (0, 0, hz), head).box((.26, .26, .08), (.01, 0, hz + .26), 'hair').box((.06, .26, .16), (.11, 0, hz + .17), 'hair')
    m.part('hairLong', (0, 0, hz), head).box((.06, .27, .3), (.12, 0, hz + .08), 'hair').box((.16, .04, .24), (.04, -.13, hz + .1), 'hair').box((.16, .04, .24), (.04, .13, hz + .1), 'hair')
    m.part('beard', (0, 0, hz), head).box((.05, .2, .1), (-.13, 0, hz + .03), 'hair')
    m.part('helm', (0, 0, hz), head).box((.28, .28, .12), (0, 0, hz + .24), 'metal').box((.02, .04, .14), (-.14, 0, hz + .14), 'metal')
    m.part('hood', (0, 0, hz), head).box((.28, .3, .12), (.01, 0, hz + .25), 'cloth').box((.08, .3, .26), (.12, 0, hz + .14), 'cloth')
    m.part('bandana', (0, 0, hz), head).box((.27, .27, .07), (0, 0, hz + .22), 'red').box((.03, .27, .1), (-.135, 0, hz + .06), 'red')
    crown = m.part('crown', (0, 0, hz), head)
    crown.box((.26, .26, .05), (0, 0, hz + .27), 'gold')
    for i in range(4):
        a = i * math.pi / 2
        crown.box((.05, .05, .07), (.1 * math.cos(a), .1 * math.sin(a), hz + .32), 'gold')
    hand_r = Vector((0, .22, sh - .4))
    hand_l = Vector((0, -.22, sh - .4))
    m.part('sword', hand_r, armR).box((.5, .03, .05), (hand_r.x - .27, hand_r.y, hand_r.z), 'metal').box((.04, .14, .03), (hand_r.x - .03, hand_r.y, hand_r.z), 'gold').box((.1, .03, .03), (hand_r.x + .04, hand_r.y, hand_r.z), 'leather')
    m.part('spear', hand_r, armR).box((1.3, .03, .03), (hand_r.x - .35, hand_r.y, hand_r.z), 'wood').cone(.04, .14, (hand_r.x - 1.06, hand_r.y, hand_r.z), 'metal', seg=4, rot=(0, -90, 0))
    m.part('staff', hand_r, armR).box((.04, .04, .95), (hand_r.x - .04, hand_r.y, hand_r.z + .25), 'wood')
    m.part('shield', hand_l, armL).cyl(.2, .05, (hand_l.x - .04, hand_l.y - .06, hand_l.z + .1), 'wood', seg=10, rot=(90, 0, 0)).cyl(.06, .07, (hand_l.x - .04, hand_l.y - .08, hand_l.z + .1), 'metal', seg=6, rot=(90, 0, 0))
    bow = m.part('bow', hand_l, armL)
    for i in range(5):
        t = (i - 2) / 2
        bow.box((.04, .03, .16), (hand_l.x - .06 - .06 * (1 - t * t), hand_l.y - .03, hand_l.z + t * .3), 'wood', rot=(0, 25 * t, 0))
    bow.box((.01, .01, .6), (hand_l.x + .02, hand_l.y - .03, hand_l.z), 'white')
    m.part('torch', hand_l, armL).box((.04, .04, .4), (hand_l.x - .03, hand_l.y, hand_l.z + .14), 'darkwood').ball(.07, (hand_l.x - .03, hand_l.y, hand_l.z + .37), 'flame', sub=1, scale=(1, 1, 1.4))
    return m


# ================================================================= CREATURES
def leg(m, name, parent, at, h, w, matname, foot=None):
    p = m.part(name, at, parent)
    p.box((w, w, h), (at[0], at[1], at[2] - h / 2), matname)
    if foot:
        p.box((w * 1.4, w * 1.1, .04), (at[0] - w * .2, at[1], .02), foot)
    return p


@model
def wolf():
    m = Model('wolf')
    body = m.part('body', (0, 0, .42))
    body.box((.72, .3, .3), (0, 0, .5), 'fur').box((.5, .28, .1), (.04, 0, .34), 'belly').box((.4, .34, .14), (-.18, 0, .62), 'furlight')
    head = m.part('head', (-.38, 0, .55), body)
    head.box((.24, .24, .22), (-.48, 0, .6), 'fur').box((.2, .14, .12), (-.66, 0, .55), 'furlight').box((.04, .07, .05), (-.77, 0, .58), 'eye')
    head.box((.05, .04, .04), (-.58, -.08, .65), 'eyeglow').box((.05, .04, .04), (-.58, .08, .65), 'eyeglow')
    head.cone(.06, .14, (-.44, -.08, .77), 'fur', seg=4).cone(.06, .14, (-.44, .08, .77), 'fur', seg=4)
    m.part('horn', (-.5, 0, .7), head).cone(.04, .22, (-.56, 0, .78), 'rune', seg=5, rot=(0, -30, 0))
    m.part('tail', (.36, 0, .56), body).box((.34, .09, .09), (.52, 0, .6), 'fur', rot=(0, -25, 0))
    for n, x, y in [('legFL', -.24, -.1), ('legFR', -.24, .1), ('legBL', .24, -.1), ('legBR', .24, .1)]:
        leg(m, n, body, (x, y, .38), .38, .09, 'fur')
    return m


@model
def gnawer():
    m = Model('gnawer')
    body = m.part('body', (0, 0, .14))
    body.ball(.16, (0, 0, .17), 'rat', sub=1, scale=(1.4, 1, .9))
    head = m.part('head', (-.18, 0, .18), body)
    head.cone(.1, .22, (-.28, 0, .18), 'rat', seg=6, rot=(0, -90, 0)).box((.03, .05, .06), (-.4, 0, .14), 'white')
    head.ball(.05, (-.2, -.08, .28), 'pink', sub=0).ball(.05, (-.2, .08, .28), 'pink', sub=0)
    head.box((.02, .03, .03), (-.3, -.05, .22), 'eye').box((.02, .03, .03), (-.3, .05, .22), 'eye')
    m.part('tail', (.2, 0, .15), body).box((.36, .025, .025), (.38, 0, .12), 'pink', rot=(0, 15, 0))
    for n, x, y in [('legFL', -.1, -.08), ('legFR', -.1, .08), ('legBL', .12, -.08), ('legBR', .12, .08)]:
        leg(m, n, body, (x, y, .08), .08, .04, 'rat')
    return m


@model
def hare():
    m = Model('hare')
    body = m.part('body', (0, 0, .18))
    body.ball(.17, (0, 0, .22), 'hare', sub=1, scale=(1.2, .9, 1)).ball(.07, (.2, 0, .25), 'white', sub=0)
    head = m.part('head', (-.16, 0, .3), body)
    head.ball(.1, (-.2, 0, .34), 'hare', sub=1, scale=(1.2, 1, 1)).box((.02, .03, .03), (-.3, -.05, .37), 'eye').box((.02, .03, .03), (-.3, .05, .37), 'eye')
    head.box((.05, .04, .24), (-.16, -.05, .52), 'hare', rot=(10, 10, 0)).box((.05, .04, .24), (-.16, .05, .52), 'hare', rot=(-10, 10, 0))
    m.part('horn', (-.22, 0, .44), head).cone(.03, .18, (-.24, 0, .52), 'rune', seg=5)
    for n, x, y, h in [('legFL', -.1, -.07, .1), ('legFR', -.1, .07, .1), ('legBL', .1, -.09, .12), ('legBR', .1, .09, .12)]:
        leg(m, n, body, (x, y, h), h, .05, 'hare')
    return m


# ================================================================= BOSSES
def boss_armor(m, parent, cx, z, length, width):
    plates = m.part('armorMelee', (cx, 0, z), parent)
    for i in range(5):
        plates.box((length / 6, width * 1.05, .1), (cx - length / 2 + (i + .5) * length / 5, 0, z + .02), 'bone', rot=(0, 8, 0))
    clay = m.part('armorFire', (cx, 0, z), parent)
    for i, (dx, dy) in enumerate([(-.3, -.3), (.2, .35), (.5, -.2), (-.6, .25), (0, 0)]):
        clay.ball(.22, (cx + dx * length / 2, dy * width, z - .05), 'clay', sub=1, scale=(1.4, 1, .5))
    scales = m.part('armorRanged', (cx, 0, z), parent)
    for i in range(7):
        for s in (-1, 1):
            scales.box((.22, .06, .2), (cx - length / 2 + (i + .5) * length / 7, s * width * .52, z - .12), 'scale', rot=(s * 25, 0, 0))


@model
def drake():
    m = Model('drake')
    body = m.part('body', (0, 0, 1.0))
    body.ball(.7, (0, 0, 1.05), 'drake', sub=2, scale=(1.6, 1, .85)).ball(.55, (-.1, 0, .8), 'drakebelly', sub=1, scale=(1.5, .85, .5))
    for i in range(6):
        body.cone(.12, .3, (-.7 + i * .28, 0, 1.65 - abs(i - 2.5) * .05), 'scale', seg=4)
    neck = m.part('neck', (-.9, 0, 1.2), body)
    neck.cyl(.28, .9, (-1.2, 0, 1.45), 'drake', seg=7, r2=.22, rot=(0, -40, 0))
    head = m.part('head', (-1.5, 0, 1.75), neck)
    head.box((.6, .44, .34), (-1.75, 0, 1.82), 'drake').box((.1, .1, .1), (-1.6, -.18, 2.0), 'eyeglow').box((.1, .1, .1), (-1.6, .18, 2.0), 'eyeglow')
    head.cone(.08, .35, (-1.45, -.16, 2.1), 'bone', seg=4, rot=(0, 50, 0)).cone(.08, .35, (-1.45, .16, 2.1), 'bone', seg=4, rot=(0, 50, 0))
    jaw = m.part('jaw', (-1.5, 0, 1.68), head)
    jaw.box((.55, .38, .12), (-1.76, 0, 1.6), 'drakebelly')
    for i in range(4):
        jaw.cone(.03, .08, (-1.95 + i * .12, -.15, 1.7), 'white', seg=3).cone(.03, .08, (-1.95 + i * .12, .15, 1.7), 'white', seg=3)
    tail = m.part('tail', (1.0, 0, 1.0), body)
    tail.cone(.32, 1.6, (1.75, 0, .75), 'drake', seg=7, rot=(0, 75, 0))
    for s in (-1, 1):
        w = m.part('wing' + ('L' if s < 0 else 'R'), (-.2, s * .55, 1.45), body)
        w.box((.9, .08, .5), (.2, s * .75, 1.6), 'drake', rot=(s * -30, 0, 0)).box((.7, .04, .35), (.3, s * .95, 1.7), 'drakebelly', rot=(s * -45, 0, 0))
    for n, x, y in [('legFL', -.6, -.45), ('legFR', -.6, .45), ('legBL', .6, -.45), ('legBR', .6, .45)]:
        leg(m, n, body, (x, y, .75), .75, .26, 'drake', foot='bone')
    boss_armor(m, body, 0, 1.55, 1.6, .9)
    return m


@model
def wyrm():
    m = Model('wyrm')
    root = m.part('root', (0, 0, 0))
    segs = 8
    prev = root
    for i in range(segs):
        x = -.8 + i * .55
        r = .42 - i * .035
        s = m.part(f'seg{i}', (x, 0, r), root)
        s.ball(r, (x, 0, r), 'wyrm', sub=1, scale=(1.25, 1, .9)).ball(r * .8, (x, 0, r * .55), 'wyrmbelly', sub=0, scale=(1.2, 1, .5))
        s.cone(r * .35, r * .8, (x, 0, r * 1.95), 'bone', seg=4)
        prev = s
    head = m.part('head', (-1.2, 0, .55), root)
    head.box((.7, .56, .44), (-1.45, 0, .65), 'wyrm').box((.1, .12, .1), (-1.55, -.22, .86), 'eyeglow').box((.1, .12, .1), (-1.55, .22, .86), 'eyeglow')
    for s in (-1, 1):
        head.cone(.08, .5, (-1.15, s * .22, 1.0), 'bone', seg=4, rot=(s * -30, 40, 0))
    jaw = m.part('jaw', (-1.2, 0, .45), head)
    jaw.box((.62, .5, .14), (-1.48, 0, .4), 'wyrmbelly')
    for i in range(4):
        jaw.cone(.04, .12, (-1.7 + i * .12, -.18, .5), 'white', seg=3).cone(.04, .12, (-1.7 + i * .12, .18, .5), 'white', seg=3)
    boss_armor(m, root, .6, .85, 2.6, .8)
    return m


@model
def stag():
    m = Model('stag')
    body = m.part('body', (0, 0, 1.25))
    body.box((1.5, .62, .66), (0, 0, 1.3), 'stag').box((1.1, .5, .2), (0, 0, .98), 'cloth2').box((.5, .66, .5), (-.55, 0, 1.45), 'stag')
    neck = m.part('neck', (-.7, 0, 1.55), body)
    neck.box((.3, .32, .8), (-.85, 0, 1.9), 'stag', rot=(0, -25, 0))
    head = m.part('head', (-1.0, 0, 2.25), neck)
    head.box((.55, .3, .3), (-1.18, 0, 2.3), 'stag').box((.1, .08, .08), (-1.08, -.16, 2.4), 'eyeglow').box((.1, .08, .08), (-1.08, .16, 2.4), 'eyeglow')
    ant = m.part('antlers', (-1.0, 0, 2.45), head)
    for s in (-1, 1):
        ant.box((.07, .07, .7), (-.95, s * .25, 2.75), 'antler', rot=(s * -30, 10, 0))
        ant.box((.06, .06, .45), (-.95, s * .5, 3.05), 'antler', rot=(s * -60, 0, 0))
        ant.box((.05, .05, .35), (-1.1, s * .38, 3.1), 'antler', rot=(s * -10, -40, 0))
        ant.box((.05, .05, .3), (-.8, s * .62, 3.25), 'antler', rot=(s * -20, 30, 0))
        ant.box((.05, .05, .3), (-.95, s * .7, 2.9), 'antler', rot=(s * -80, 0, 0))
    m.part('tail', (.75, 0, 1.45), body).box((.2, .14, .22), (.82, 0, 1.4), 'white')
    for n, x, y in [('legFL', -.55, -.22), ('legFR', -.55, .22), ('legBL', .55, -.22), ('legBR', .55, .22)]:
        leg(m, n, body, (x, y, 1.05), 1.05, .13, 'stag', foot='darkwood')
    boss_armor(m, body, 0, 1.68, 1.4, .66)
    return m


# ================================================================= TREES & NATURE
@model
def oak():
    m = Model('oak')
    t = m.part('tree')
    t.cyl(.14, 1.1, (0, 0, .55), 'trunk', seg=6, r2=.1).box((.5, .08, .08), (.18, 0, .9), 'trunk', rot=(0, -40, 0))
    t.ball(.62, (0, 0, 1.55), 'leaves', sub=1).ball(.48, (.32, .25, 1.3), 'leaves2', sub=1).ball(.45, (-.3, -.2, 1.35), 'leaves2', sub=1).ball(.4, (.1, -.3, 1.85), 'leaves', sub=1)
    return m


@model
def oakbare():
    m = Model('oakbare')
    t = m.part('tree')
    t.cyl(.14, 1.2, (0, 0, .6), 'trunk', seg=6, r2=.08)
    for i, a in enumerate([0, 72, 144, 216, 288]):
        r = math.radians(a)
        t.box((.6, .06, .06), (.25 * math.cos(r), .25 * math.sin(r), 1.1 + i * .08), 'trunk', rot=(0, -35, a))
    return m


@model
def pine():
    m = Model('pine')
    t = m.part('tree')
    t.cyl(.1, .6, (0, 0, .3), 'trunk', seg=5)
    for i, (r, z) in enumerate([(.62, .55), (.5, 1.0), (.38, 1.42), (.24, 1.8)]):
        t.cone(r, .7, (0, 0, z + .35), 'pine', seg=7)
    return m


@model
def willow():
    m = Model('willow')
    t = m.part('tree')
    t.cyl(.15, 1.1, (0, 0, .55), 'trunk', seg=6, r2=.12)
    t.ball(.6, (0, 0, 1.45), 'leaves', sub=1, scale=(1.2, 1.2, .7))
    for i in range(10):
        a = i * math.pi * 2 / 10
        t.box((.08, .2, .9), (.62 * math.cos(a), .62 * math.sin(a), 1.0), 'leaves2', rot=(0, 0, math.degrees(a)))
    return m


@model
def bush():
    m = Model('bush')
    m.part('bush').ball(.32, (0, 0, .2), 'leaves2', sub=1, scale=(1.2, 1, .8)).ball(.22, (.2, .1, .3), 'leaves', sub=0)
    return m


@model
def rock():
    m = Model('rock')
    m.part('rock').ball(.35, (0, 0, .15), 'rock', sub=0, scale=(1.3, 1, .8)).ball(.2, (.25, .15, .1), 'darkstone', sub=0)
    return m


@model
def boulder():
    m = Model('boulder')
    m.part('rock').ball(.55, (0, 0, .4), 'rock', sub=1, scale=(1, .9, 1.1), rot=(10, 20, 0)).ball(.3, (.3, .2, .2), 'darkstone', sub=0)
    return m


@model
def crop():
    m = Model('crop')
    c = m.part('crop')
    for i in range(5):
        a = i * 1.3
        c.box((.04, .04, .38), (.12 * math.cos(a), .12 * math.sin(a), .19), 'crop', rot=(8 * math.sin(a), 8 * math.cos(a), 0))
        c.box((.07, .06, .1), (.12 * math.cos(a), .12 * math.sin(a), .4), 'straw')
    return m


@model
def grass():
    m = Model('grass')
    g = m.part('grass')
    for i in range(4):
        a = i * 1.7
        g.cone(.05, .26, (.08 * math.cos(a), .08 * math.sin(a), .13), 'grass', seg=3, rot=(10 * math.sin(a), 10 * math.cos(a), 0))
    return m


@model
def reeds():
    m = Model('reeds')
    g = m.part('reeds')
    for i in range(5):
        a = i * 1.25
        g.box((.03, .03, .55), (.1 * math.cos(a), .1 * math.sin(a), .27), 'reed', rot=(6 * math.sin(a), 6 * math.cos(a), 0))
        if i % 2 == 0:
            g.box((.05, .05, .12), (.1 * math.cos(a), .1 * math.sin(a), .52), 'darkwood')
    return m


# ================================================================= BUILDINGS
def walls(p, w, d, h, matname, z=0):
    p.box((w, d, h), (0, 0, z + h / 2), matname)


def timber(p, w, d, h):
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((.12, .12, h), (sx * w / 2, sy * d / 2, h / 2), 'darkwood')
    p.box((w + .05, .1, .1), (0, -d / 2, h * .55), 'darkwood').box((w + .05, .1, .1), (0, -d / 2, h), 'darkwood')


def door(p, x, d, h=.75, w=.42, matname='darkwood'):
    p.box((w, .06, h), (x, -d / 2 - .02, h / 2), matname)


def windows(p, xs, d, z):
    for x in xs:
        p.box((.3, .05, .3), (x, -d / 2 - .02, z), 'window').box((.36, .04, .05), (x, -d / 2 - .03, z - .17), 'darkwood')


@model
def house():
    m = Model('house')
    b = m.part('building')
    w, d, h = 2.5, 2.3, 1.15
    walls(b, w, d, h, 'wall')
    timber(b, w, d, h)
    b.prism((w + .3, d + .4, 1.0), (0, 0, h), 'roof')
    door(b, 0, d)
    windows(b, [-.75, .75], d, .65)
    b.box((.28, .28, .7), (.75, .45, h + .6), 'stone')
    return m


@model
def inn():
    m = Model('inn')
    b = m.part('building')
    w, d, h = 4.5, 3.4, 1.9
    walls(b, w, d, h, 'plaster')
    timber(b, w, d, h)
    b.box((w + .2, d + .2, .12), (0, 0, h * .5), 'darkwood')
    b.prism((w + .4, d + .5, 1.3), (0, 0, h), 'roof')
    door(b, 0, d, h=.9, w=.6)
    windows(b, [-1.5, -.8, .8, 1.5], d, .6)
    windows(b, [-1.5, -.5, .5, 1.5], d, 1.4)
    b.box((.08, .7, .08), (1.9, -d / 2 - .35, 1.2), 'darkwood').box((.05, .45, .3), (1.9, -d / 2 - .55, 1.0), 'awning')
    b.box((.35, .35, .9), (-1.4, .6, h + .75), 'stone')
    return m


@model
def smithy():
    m = Model('smithy')
    b = m.part('building')
    w, d, h = 3.5, 2.5, 1.3
    b.box((w, .3, h), (0, d / 2 - .15, h / 2), 'stone').box((.3, d, h), (w / 2 - .15, 0, h / 2), 'stone')
    for x in (-w / 2 + .1, 0):
        b.box((.14, .14, h), (x, -d / 2 + .1, h / 2), 'darkwood')
    b.prism((w + .3, d + .3, .8), (0, 0, h), 'roof')
    b.box((.8, .7, .6), (.9, .4, .3), 'stone').box((.5, .4, .12), (.9, .3, .62), 'flame')
    b.box((.38, .2, .22), (-.6, -.3, .35), 'iron').box((.2, .16, .3), (-.6, -.3, .15), 'iron')
    b.box((.4, .4, 1.4), (1.2, .7, h + .6), 'stone')
    return m


@model
def market():
    m = Model('market')
    b = m.part('building')
    for i, x in enumerate([-1.0, 1.0]):
        for sx in (-.75, .75):
            for sy in (-.7, .7):
                b.box((.08, .08, 1.2), (x + sx, sy, .6), 'wood')
        b.box((1.7, 1.2, .5), (x, -.1, .3), 'wood').box((1.6, 1.1, .06), (x, -.1, .56), 'darkwood')
        for j in range(6):
            b.box((1.72 / 6, 1.6, .06), (x - .72 + j * .287, 0, 1.25), 'awning' if j % 2 == 0 else 'awning2', rot=(-12, 0, 0))
        b.box((.2, .2, .15), (x - .4, -.3, .67), 'crop').box((.2, .2, .15), (x + .1, -.35, .67), 'red').box((.18, .18, .15), (x + .45, -.2, .67), 'leaves')
    b.box((.4, .4, .4), (0, .7, .2), 'wood').box((.35, .35, .35), (1.85, .5, .17), 'wood')
    return m


@model
def keep():
    m = Model('keep')
    b = m.part('building')
    w, d, h = 5.4, 4.4, 2.6
    walls(b, w, d, h, 'stone')
    for i in range(9):
        b.box((.32, .32, .3), (-w / 2 + .3 + i * (w - .6) / 8, -d / 2 + .1, h + .15), 'stone').box((.32, .32, .3), (-w / 2 + .3 + i * (w - .6) / 8, d / 2 - .1, h + .15), 'stone')
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.cyl(.65, h + 1.3, (sx * w / 2, sy * d / 2, (h + 1.3) / 2), 'stone', seg=8)
            b.cone(.8, 1.1, (sx * w / 2, sy * d / 2, h + 1.85), 'roof', seg=8)
    b.box((1.4, 2.2, 1.0), (0, .3, h + .5), 'stone').prism((1.6, 2.4, .9), (0, .3, h + 1.0), 'roof', rot=(0, 0, 90))
    b.box((1.1, .1, 1.5), (0, -d / 2 - .03, .75), 'darkwood').box((1.3, .12, .14), (0, -d / 2 - .04, 1.55), 'stone')
    for sx in (-1.6, 1.6):
        b.box((.6, .05, 1.2), (sx, -d / 2 - .04, 1.6), 'banner').box((.3, .05, .3), (sx, -d / 2 - .05, 1.7), 'gold')
    windows(b, [-1.2, 1.2], d, 2.1)
    b.box((.04, .04, 1.2), (0, .3, h + 2.5), 'darkwood').box((.5, .03, .3), (.25, .3, h + 2.95), 'banner')
    return m


@model
def temple():
    m = Model('temple')
    b = m.part('building')
    w, d = 5.4, 4.2
    b.box((w + .3, d + .3, .3), (0, 0, .15), 'stone').box((w, d, .2), (0, 0, .4), 'plaster')
    b.box((w - 1.2, d - 1.0, 2.0), (0, .2, 1.5), 'plaster')
    for i in range(6):
        x = -w / 2 + .4 + i * (w - .8) / 5
        b.cyl(.16, 2.0, (x, -d / 2 + .35, 1.5), 'plaster', seg=8)
    b.box((w, d, .3), (0, 0, 2.6), 'stone')
    b.prism((w + .2, d + .2, .9), (0, 0, 2.75), 'roof')
    b.ball(.85, (0, .2, 3.4), 'gold', sub=2, scale=(1, 1, .8))
    b.box((.12, .12, .5), (0, .2, 4.2), 'gold').ball(.12, (0, .2, 4.55), 'flame', sub=1)
    b.box((.9, .08, 1.4), (0, -d / 2 + .48, 1.2), 'darkwood')
    return m


@model
def archive():
    m = Model('archive')
    b = m.part('building')
    w, d, h = 3.6, 3.4, 2.0
    walls(b, w, d, h, 'stone')
    for i in range(4):
        b.cyl(.13, h, (-w / 2 + .5 + i * (w - 1) / 3, -d / 2 - .1, h / 2), 'plaster', seg=8)
    b.box((w + .3, d + .5, .2), (0, -.05, h + .1), 'plaster')
    b.prism((w + .3, d + .5, .9), (0, -.05, h + .2), 'roof')
    door(b, 0, d, h=1.1, w=.6)
    b.box((.8, .05, .3), (0, -d / 2 - .25, h - .1), 'gold')
    return m


@model
def shrine():
    m = Model('shrine')
    b = m.part('building')
    b.box((2.4, 2.4, .2), (0, 0, .1), 'stone')
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((.2, .2, 1.4), (sx * .9, sy * .9, .9), 'stone')
    b.prism((2.6, 2.6, .8), (0, 0, 1.6), 'roof')
    b.box((.6, .6, .7), (0, .2, .55), 'plaster').ball(.14, (0, .2, 1.0), 'flame', sub=1, scale=(1, 1, 1.4))
    return m


@model
def well():
    m = Model('well')
    b = m.part('building')
    b.cyl(.45, .5, (0, 0, .25), 'stone', seg=10).cyl(.36, .06, (0, 0, .48), 'water', seg=10)
    for sy in (-1, 1):
        b.box((.08, .08, 1.0), (0, sy * .4, .75), 'wood')
    b.prism((.9, 1.1, .35), (0, 0, 1.15), 'roof', rot=(0, 0, 90)).box((.06, .7, .06), (0, 0, 1.05), 'darkwood')
    return m


@model
def board():
    m = Model('board')
    b = m.part('building')
    for sy in (-.4, .4):
        b.box((.08, .08, 1.3), (0, sy, .65), 'wood')
    b.box((.06, 1.0, .65), (0, 0, 1.0), 'wood')
    for i, (y, z) in enumerate([(-.25, 1.1), (.15, 1.15), (.05, .85), (-.3, .82)]):
        b.box((.02, .22, .24), (-.04, y, z), 'paper')
    b.prism((.2, 1.2, .18), (0, 0, 1.33), 'roof', rot=(0, 0, 90))
    return m


@model
def lamp():
    m = Model('lamp')
    b = m.part('building')
    b.box((.12, .12, 1.5), (0, 0, .75), 'iron').box((.25, .25, .06), (0, 0, 1.5), 'iron')
    m.part('light', (0, 0, 1.65)).box((.2, .2, .26), (0, 0, 1.66), 'glow').cone(.18, .14, (0, 0, 1.86), 'iron', seg=4)
    return m


@model
def statue():
    m = Model('statue')
    b = m.part('building')
    b.box((.9, .9, .6), (0, 0, .3), 'stone').box((1.0, 1.0, .1), (0, 0, .62), 'darkstone')
    b.box((.22, .34, .55), (0, 0, 1.2), 'statue').box((.22, .34, .4), (0, 0, .87), 'statue')
    b.box((.24, .24, .24), (0, 0, 1.6), 'statue').box((.1, .1, .5), (0, .24, 1.35), 'statue').box((.6, .04, .05), (-.25, .3, 1.15), 'statue')
    b.box((.04, .6, .16), (-.46, 0, .35), 'gold')
    return m


# ================================================================= CAMP, RUINS, PROPS
@model
def tent():
    m = Model('tent')
    b = m.part('building')
    b.prism((1.8, 1.6, 1.1), (0, 0, 0), 'tent', rot=(0, 0, 90)).box((.4, .05, .7), (0, -.82, .35), 'darkwood')
    return m


@model
def campfire():
    m = Model('campfire')
    b = m.part('building')
    for i in range(8):
        a = i * math.pi / 4
        b.box((.16, .16, .12), (.4 * math.cos(a), .4 * math.sin(a), .06), 'darkstone')
    for a in (0, 60, 120):
        b.box((.7, .1, .1), (0, 0, .1), 'darkwood', rot=(0, 0, a))
    m.part('flame', (0, 0, .1)).cone(.22, .55, (0, 0, .37), 'flame', seg=6).cone(.12, .35, (.08, .05, .3), 'glow', seg=5)
    return m


@model
def cage():
    m = Model('cage')
    b = m.part('building')
    b.box((1.4, 1.2, .1), (0, 0, .05), 'darkwood').box((1.4, 1.2, .1), (0, 0, 1.3), 'darkwood')
    for i in range(7):
        x = -.65 + i * .216
        b.box((.05, .05, 1.25), (x, -.58, .68), 'iron').box((.05, .05, 1.25), (x, .58, .68), 'iron')
    for i in range(5):
        y = -.5 + i * .25
        b.box((.05, .05, 1.25), (-.68, y, .68), 'iron').box((.05, .05, 1.25), (.68, y, .68), 'iron')
    return m


@model
def cart():
    m = Model('cart')
    b = m.part('building')
    b.box((1.2, .8, .35), (0, 0, .5), 'wood').box((1.1, .7, .3), (0, 0, .8), 'canvas')
    for sx in (-.35, .35):
        for sy in (-.45, .45):
            b.cyl(.22, .07, (sx, sy, .22), 'darkwood', seg=8, rot=(90, 0, 0))
    b.box((.7, .05, .05), (-.9, -.2, .45), 'wood').box((.7, .05, .05), (-.9, .2, .45), 'wood')
    return m


@model
def tablet():
    m = Model('tablet')
    b = m.part('building')
    b.box((.9, .9, .25), (0, 0, .12), 'darkstone').box((.7, .25, 1.5), (0, 0, 1.0), 'stone')
    b.prism((.75, .3, .25), (0, 0, 1.75), 'stone')
    m.part('runes', (0, 0, 1.0)).box((.5, .02, 1.0), (0, -.135, 1.0), 'rune')
    return m


@model
def vaultstone():
    m = Model('vaultstone')
    b = m.part('building')
    b.ball(.6, (0, 0, .45), 'darkstone', sub=1, scale=(1.1, 1, .9))
    m.part('runes', (0, 0, .5)).box((.4, .04, .05), (0, -.6, .7), 'rune').box((.05, .04, .4), (0, -.6, .5), 'rune').box((.4, .04, .05), (0, -.6, .3), 'rune')
    return m


@model
def pillar():
    m = Model('pillar')
    b = m.part('building')
    b.box((.7, .7, .2), (0, 0, .1), 'stone').cyl(.24, 1.4, (0, 0, .9), 'stone', seg=8).box((.4, .2, .2), (.3, .2, .12), 'darkstone')
    return m


@model
def ruinwall():
    m = Model('ruinwall')
    b = m.part('building')
    b.box((1.0, 1.0, .9), (0, 0, .45), 'darkstone').box((.5, .9, .4), (.2, 0, 1.05), 'stone').box((.3, .3, .2), (-.3, -.3, 1.0), 'darkstone')
    return m


@model
def rift():
    m = Model('rift')
    b = m.part('building')
    for i in range(10):
        a = i * math.pi * 2 / 10
        b.box((.25, .3, .5), (1.0 * math.cos(a), 1.0 * math.sin(a), .2), 'darkstone', rot=(0, 0, math.degrees(a)))
    m.part('portal', (0, 0, 1.4)).cyl(.6, .1, (0, 0, 1.4), 'rune', seg=12, rot=(90, 0, 0), scale=(1, 1.7))
    return m


# ----------------------------------------------------------------- run
if __name__ == '__main__':
    only = set(a for a in sys.argv[1:] if not a.startswith('-'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    print('ECHO assets → ' + os.path.abspath(OUT))
    for fn in MODELS:
        if only and fn.__name__ not in only:
            continue
        fn().export()
