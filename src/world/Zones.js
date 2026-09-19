/* Zones.js — the places you can walk around in.

   Each zone builds a small, dense 3D space and declares what is interactive.
   They are deliberately compact: a courtyard you cross in eight seconds reads
   as a place, while a field you cross in ninety reads as a chore.

   A zone returns:
     { group, atmos, spawn, bounds, walls, interactables, doors, npcs, animated, lights }
*/

import * as THREE from '../../lib/three.module.js';
import { box, taperBox, cyl, sphere, cone, torus, plane, ring, rock, banner, meshOf, merge } from '../art/Geo.js';
import { PAL, MATS, ATMOS } from '../art/Palette.js';
import { shadeOf } from '../art/GearArt.js';
import * as Props from '../art/PropArt.js';
import { makeRng, TAU, clamp } from '../core/Util.js';
import { NPCS } from '../data/Dialogue.js';
import { ic } from '../art/Icons.js';

/* --------------------------------------------------------------- helpers */

function ground(w, d, color, o = {}) {
  const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w / 3), Math.ceil(d / 3));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), base = new THREE.Color(color);
  const rand = o.rand || makeRng(7);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (o.bumpy) pos.setY(i, Math.sin(x * 0.4) * 0.06 + Math.cos(z * 0.33) * 0.05);
    c.copy(base).offsetHSL(0, 0, (Math.sin(x * 1.7 + z * 2.3) * 0.5 + 0.5 - 0.5) * 0.06);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, MATS.terrain);
  m.receiveShadow = true;
  return m;
}

function flagstones(w, d, color) {
  const g = [];
  const rand = makeRng(31);
  const cell = 2.2;
  for (let x = -w / 2; x < w / 2; x += cell) {
    for (let z = -d / 2; z < d / 2; z += cell) {
      g.push(box(cell * 0.94, 0.08, cell * 0.94, {
        color: shadeOf(color, rand.range(0.88, 1.12)),
        x: x + cell / 2, z: z + cell / 2, y: 0.04,
      }));
    }
  }
  const m = meshOf(g, MATS.terrain, { castShadow: false });
  m.receiveShadow = true;
  return m;
}

/**
 * A room shell.
 * @param o.doorWidth  if set, the +Z wall is built in three pieces around a
 *                     doorway, so an `exitArch` has something to stand in.
 *                     Without this the "way out" is a solid wall with a
 *                     picture of a door on it.
 */
function interior(w, d, h, o = {}) {
  const wall = o.wall ?? PAL.stoneDark;
  const dw = o.doorWidth ?? 0;
  const dh = o.doorHeight ?? 5.6;

  const g = [
    box(w, 0.3, d, { color: o.floor ?? 0x3a2f28, y: -0.15 }),
    box(w, h, 0.6, { color: wall, z: -d / 2, y: h / 2 }),
    box(0.6, h, d, { color: shadeOf(wall, 0.92), x: -w / 2, y: h / 2 }),
    box(0.6, h, d, { color: shadeOf(wall, 0.92), x: w / 2, y: h / 2 }),
    box(w, 0.5, d, { color: shadeOf(wall, 0.7), y: h }),
  ];

  if (dw > 0) {
    const side = (w - dw) / 2;
    g.push(box(side, h, 0.6, { color: wall, x: -(dw / 2 + side / 2), z: d / 2, y: h / 2 }));
    g.push(box(side, h, 0.6, { color: wall, x: (dw / 2 + side / 2), z: d / 2, y: h / 2 }));
    if (h > dh) g.push(box(dw, h - dh, 0.6, { color: wall, z: d / 2, y: dh + (h - dh) / 2 }));
  } else {
    g.push(box(w, h, 0.6, { color: wall, z: d / 2, y: h / 2 }));
  }

  // ceiling beams
  for (let i = -Math.floor(d / 5); i <= Math.floor(d / 5); i++) {
    g.push(box(w - 1, 0.3, 0.4, { color: PAL.woodDark, y: h - 0.35, z: i * 5 }));
  }
  const m = meshOf(g, MATS.body);
  m.receiveShadow = true;
  return m;
}

/**
 * A tall window in a side wall: a bright pane, stone mullions, and a soft
 * shaft of light landing on the floor. Interiors were readable only where a
 * torch happened to be; daylight is what makes a room feel like a building.
 *
 * @param side -1 for the -X wall, +1 for the +X wall
 */
function windowBay(x, z, side, o = {}) {
  const g = new THREE.Group();
  const w = o.width ?? 2.0, h = o.height ?? 4.2, y = o.y ?? 3.4;
  const tint = o.color ?? 0xcfe2f2;

  g.add(meshOf([
    // reveal cut into the wall
    box(0.5, h + 0.8, w + 0.8, { color: shadeOf(PAL.stoneLight, 0.95), x: -side * 0.15, y }),
    // mullions
    box(0.16, h, 0.16, { color: PAL.stoneLight, x: -side * 0.42, y }),
    box(0.16, 0.16, w, { color: PAL.stoneLight, x: -side * 0.42, y: y + h * 0.18 }),
  ], MATS.body));

  const pane = meshOf([plane(w, h, { color: tint, ry: side * Math.PI / 2, x: -side * 0.36, y, grad: 0 })],
    MATS.glow, { castShadow: false });
  g.add(pane);

  // the shaft. One long translucent slab, angled down into the room — cheap,
  // and it does more for "this is a real hall" than any amount of torchlight.
  const shaft = meshOf([
    box(w * 1.15, 0.08, h * 2.6, {
      color: tint, x: -side * (h * 0.78), y: y * 0.52, rz: side * 0.62, grad: 0,
    }),
  ], MATS.emissive(tint, 0.10), { castShadow: false });
  shaft.renderOrder = -1;
  g.add(shaft);

  g.position.set(x, 0, z);
  return g;
}

/** The standard way out of any interior, plus the runner that points at it. */
function exitOf(group, animated, lights, { z, width = 5.4, height = 5.4, runner = 12, stone }) {
  const arch = Props.exitArch({ width, height, stone });
  arch.position.set(0, 0, z);
  arch.rotation.y = Math.PI;          // banner and light face into the room
  group.add(arch);
  animated.push(arch);

  const run = Props.exitRunner(runner, { width: width * 0.62 });
  run.position.set(0, 0, z - 0.6);
  run.rotation.y = Math.PI;
  group.add(run);

  // daylight spilling in is a real light, not just a bright quad
  lights.push({ x: 0, y: height * 0.55, z: z - 1.6, color: 0xbcd6ec, intensity: 2.4, dist: 24, flicker: 0, priority: 2.4 });
  return arch;
}

/**
 * The outdoor version: a gatehouse arch with the keep's banner over it, two
 * braziers, and the same lit runner. Different geometry, identical language —
 * banner + runner + fire means "this way back" in every zone in the game.
 */
function outdoorExit(group, animated, lights, z, o = {}) {
  const gate = Props.archway({ width: o.width ?? 6, height: o.height ?? 7 });
  gate.position.set(0, 0, z);
  group.add(gate);

  // the keep banner, only ever hung on a way home
  const ban = meshOf([banner(1.6, 2.4, { color: PAL.teamPlayer, phase: 0.4 })], MATS.cloth, { castShadow: false });
  ban.position.set(0, (o.height ?? 7) - 1.1, z - 0.5);
  group.add(ban);
  group.add(meshOf([
    box(1.8, 0.14, 0.14, { color: PAL.gold, y: (o.height ?? 7) + 0.15, z: z - 0.5 }),
    box(0.95, 0.15, 0.06, { color: PAL.goldLight, y: (o.height ?? 7) - 1.9, z: z - 0.56 }),
    box(0.2, 0.32, 0.06, { color: PAL.goldLight, x: -0.34, y: (o.height ?? 7) - 1.66, z: z - 0.56 }),
    box(0.2, 0.32, 0.06, { color: PAL.goldLight, y: (o.height ?? 7) - 1.66, z: z - 0.56 }),
    box(0.2, 0.32, 0.06, { color: PAL.goldLight, x: 0.34, y: (o.height ?? 7) - 1.66, z: z - 0.56 }),
  ], MATS.body));

  for (const sx of [-3.6, 3.6]) {
    const br = Props.brazier();
    br.position.set(sx, 0, z - 0.4);
    group.add(br); animated.push(br);
    lights.push({ x: sx, y: 1.6, z: z - 0.4, color: 0xffb060, intensity: 1.9, dist: 14, flicker: 0.26, priority: 1.8 });
  }

  const run = Props.exitRunner(o.runner ?? 12, { width: 3.2, color: 0x8a7a44 });
  run.position.set(0, 0, z - 1.2);
  run.rotation.y = Math.PI;
  group.add(run);
}

/* ==========================================================================
   THE KEEP — the hub courtyard
   ========================================================================== */

export function buildKeep() {
  const group = new THREE.Group();
  const rand = makeRng(101);
  const animated = [];
  const lights = [];

  group.add(ground(90, 90, PAL.grassLight, { rand }));
  const stones = flagstones(40, 46, PAL.stone);
  group.add(stones);

  // the keep itself, at the north end
  const k = Props.keep({ width: 14, depth: 10, height: 11 });
  k.position.set(0, 0, -22);
  k.rotation.y = Math.PI;
  group.add(k);

  // curtain walls and corner towers
  for (const [x, z, rot, len] of [[0, 26, 0, 40], [-22, 2, Math.PI / 2, 46], [22, 2, Math.PI / 2, 46]]) {
    const w = Props.wallSegment(len, 6, {});
    w.position.set(x, 0, z);
    w.rotation.y = rot;
    group.add(w);
  }
  for (const [x, z] of [[-22, 26], [22, 26], [-22, -22], [22, -22]]) {
    const t = Props.tower(9, { radius: 2.4, roof: 0x5a3a3a });
    t.position.set(x, 0, z);
    group.add(t);
  }

  // gate at the south
  const gate = Props.archway({ width: 6, height: 7 });
  gate.position.set(0, 0, 26);
  group.add(gate);

  // the war table, centre
  const table = Props.warTable({ rand });
  table.position.set(0, 0, -6);
  group.add(table);

  // banners along the approach
  for (const x of [-6, 6]) {
    for (const z of [4, 12, 20]) {
      const b = Props.bannerPole({ height: 5, color: PAL.teamPlayer, accent: PAL.gold });
      b.position.set(x, 0, z);
      group.add(b);
      animated.push(b);
    }
  }

  // braziers
  for (const [x, z] of [[-4, -10], [4, -10], [-10, 8], [10, 8]]) {
    const br = Props.brazier();
    br.position.set(x, 0, z);
    group.add(br);
    animated.push(br);
    lights.push({ x, y: 1.5, z, color: 0xffa050, intensity: 1.5, dist: 13, flicker: 0.25 });
  }

  // trees around the edge
  for (let i = 0; i < 16; i++) {
    const a = rand.range(0, TAU), d = rand.range(30, 42);
    const t = Props.tree({ rand, style: rand.chance(0.35) ? 'pine' : 'round', height: rand.range(5, 8) });
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    group.add(t);
  }

  // side buildings that hold the doors to the other zones
  /* Each building carries a carved board with its own emblem. `emblem`
     returns geometry in sign-local space (the board face sits at z ~1.42,
     centred on y 3.35); it is called twice, once dark and once emissive, so
     the sign is legible in daylight and lit at night. */
  const EY = 3.35, EZ = 1.42;
  const doorways = [
    {
      x: -16, z: -8, label: "The Wizard's Library", to: 'library', icon: ic('mage'), color: 0x3a3050,
      emblem: (c, d = 0) => [
        cone(0.44, 0.78, 6, { color: c, y: EY + 0.22, z: EZ + d }),
        box(1.0, 0.13, 0.05, { color: c, y: EY - 0.14, z: EZ + d }),
        box(0.1, 0.34, 0.05, { color: c, y: EY + 0.62, z: EZ + d, rz: 0.5 }),
        box(0.34, 0.1, 0.05, { color: c, y: EY + 0.62, z: EZ + d, rz: 0.5 }),
      ],
    },
    {
      x: 16, z: -8, label: 'The Forge', to: 'forge', icon: ic('hammer'), color: 0x4a2f22,
      emblem: (c, d = 0) => [
        box(1.15, 0.42, 0.05, { color: c, y: EY + 0.32, z: EZ + d }),
        box(0.22, 0.86, 0.05, { color: c, y: EY - 0.22, z: EZ + d }),
        box(0.9, 0.14, 0.05, { color: c, y: EY - 0.56, z: EZ + d }),
      ],
    },
    {
      x: -16, z: 10, label: 'The Army Camp', to: 'camp', icon: ic('banner'), color: 0x3a4030,
      emblem: (c, d = 0) => [
        box(0.12, 1.18, 0.05, { color: c, x: -0.5, y: EY, z: EZ + d }),
        box(0.92, 0.6, 0.05, { color: c, x: 0.0, y: EY + 0.3, z: EZ + d }),
        box(0.3, 0.3, 0.05, { color: c, x: 0.52, y: EY + 0.3, z: EZ + d, rz: 0.78 }),
      ],
    },
    {
      x: 16, z: 10, label: 'The Marketplace', to: 'market', icon: ic('purse'), color: 0x3f3a2a,
      emblem: (c, d = 0) => [
        cyl(0.34, 0.5, 0.78, 9, { color: c, y: EY - 0.14, z: EZ + d, rx: Math.PI / 2 }),
        box(0.48, 0.16, 0.05, { color: c, y: EY + 0.34, z: EZ + d }),
        box(0.16, 0.24, 0.05, { color: c, y: EY + 0.5, z: EZ + d }),
      ],
    },
    {
      x: 0, z: 22, label: 'The Training Ground', to: 'training', icon: ic('target'), color: 0x3a3a42,
      emblem: (c, d = 0) => [
        cyl(0.56, 0.56, 0.05, 16, { color: c, y: EY, z: EZ + d, rx: Math.PI / 2 }),
        cyl(0.34, 0.34, 0.06, 14, { color: c, y: EY, z: EZ + d + 0.02, rx: Math.PI / 2 }),
        cyl(0.13, 0.13, 0.07, 10, { color: c, y: EY, z: EZ + d + 0.04, rx: Math.PI / 2 }),
      ],
    },
  ];
  const doors = [];
  for (const d of doorways) {
    const b = meshOf([
      box(8, 6, 7, { color: shadeOf(PAL.stone, 0.95) }),
      box(8.6, 0.5, 7.6, { color: shadeOf(PAL.stone, 1.12), y: 3.1 }),
      cone(6.6, 3, 4, { color: d.color, y: 4.8, ry: Math.PI / 4 }),
      box(2.6, 3.6, 0.3, { color: PAL.woodDark, z: 3.55, y: -1.2 }),
      box(0.16, 3.6, 0.36, { color: PAL.iron, z: 3.7, y: -1.2 }),
    ], MATS.body);
    b.position.set(d.x, 3, d.z);
    const flip = d.z > 12;
    if (flip) b.rotation.y = Math.PI;
    group.add(b);

    const dz = flip ? d.z - 3.8 : d.z + 3.8;
    const face = flip ? -1 : 1;
    doors.push({ x: d.x, z: dz, to: d.to, label: d.label, icon: d.icon });

    /* --- the hanging sign. Every building in the courtyard carries a board
       with its own emblem, lit by its own lantern, at eye height. Before
       this, five identical stone huts differed only by roof colour. --- */
    const sign = new THREE.Group();
    sign.add(meshOf([
      box(0.14, 0.14, 1.5, { color: PAL.iron, y: 4.3, z: 0.7 }),
      cyl(0.04, 0.04, 0.55, 4, { color: PAL.iron, y: 3.95, z: 1.35 }),
      box(2.5, 1.35, 0.12, { color: 0x31261c, y: 3.35, z: 1.35 }),
      box(2.7, 0.14, 0.18, { color: d.color, y: 4.0, z: 1.35 }),
      box(2.7, 0.14, 0.18, { color: d.color, y: 2.72, z: 1.35 }),
    ], MATS.body));
    // the emblem itself, picked out in gold and lit so it reads at night
    sign.add(meshOf(d.emblem(0x000000), MATS.body));
    sign.add(meshOf(d.emblem(PAL.goldLight, 0.02), MATS.glow, { castShadow: false }));
    sign.position.set(d.x, 0, dz);
    sign.rotation.y = flip ? Math.PI : 0;
    group.add(sign);
    lights.push({ x: d.x, y: 3.6, z: dz + face * 1.9, color: 0xffc888, intensity: 1.5, dist: 11, flicker: 0.18, priority: 1.6 });

    // paired lanterns either side of the door, so the entrance reads as one
    for (const sx of [-2.3, 2.3]) {
      const t = Props.torch({ phase: rand.range(0, 9) });
      t.position.set(d.x + sx, 1.9, dz + face * 0.2);
      group.add(t); animated.push(t);
    }
    lights.push({ x: d.x, y: 2.4, z: dz, color: 0xffa050, intensity: 1.5, dist: 12, flicker: 0.28 });

    /* A continuous paved route from the war table to each door. This is the
       quiet half of "you can always see where you can go": from the middle of
       the courtyard, five worn paths fan out to five lit signs. It has to be
       CONTINUOUS and a different colour from the flagstones, or it reads as
       scattered rubble rather than a road. */
    const pathLen = Math.hypot(d.x, dz + 6);
    const pathA = Math.atan2(dz + 6, d.x);
    const steps = Math.max(2, Math.round(pathLen / 1.7));
    const pav = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      pav.push(box(2.3, 0.05, 1.78, {
        color: shadeOf(0x8d7f66, 0.93 + (i % 2) * 0.12),
        x: Math.cos(pathA) * pathLen * t, z: -6 + Math.sin(pathA) * pathLen * t,
        y: 0.11, ry: pathA,
      }));
    }
    const pv = meshOf(pav, MATS.terrain, { castShadow: false });
    pv.receiveShadow = true;
    group.add(pv);
  }

  // crates and barrels for texture
  for (let i = 0; i < 10; i++) {
    const o = rand.chance(0.5) ? Props.crate({ size: rand.range(0.6, 0.9) }) : Props.barrel({});
    o.position.set(rand.range(-19, 19), 0, rand.range(-18, 22));
    o.rotation.y = rand.range(0, TAU);
    if (Math.abs(o.position.x) < 6 && Math.abs(o.position.z + 6) < 6) continue;
    group.add(o);
  }

  /* --- things that make it a working yard rather than a lobby --- */

  // a sparring square on the east side, with a rack and two dummies
  group.add(meshOf([
    ...Array.from({ length: 7 }, (_, i) =>
      cyl(0.07, 0.09, 1.0, 4, { color: PAL.woodDark, x: 8 + i * 1.6, z: 16, y: 0.5 })),
    ...Array.from({ length: 7 }, (_, i) =>
      box(1.7, 0.08, 0.08, { color: PAL.woodDark, x: 8 + i * 1.6, z: 16, y: 0.82 })),
  ], MATS.body));
  for (const [dx, dz] of [[10, 12.5], [14.5, 13.5]]) {
    const d = Props.trainingDummy({});
    d.position.set(dx, 0, dz);
    d.rotation.y = rand.range(-0.4, 0.4);
    group.add(d);
  }

  // an armoury line on the west side: stands and racks with real kit on them
  for (let i = 0; i < 4; i++) {
    const st = Props.armorStand({ metal: rand.pick([PAL.steel, PAL.iron, 0xc8a860]) });
    st.position.set(-13.5 + i * 2.4, 0, 15.5);
    st.rotation.y = Math.PI + rand.range(-0.25, 0.25);
    group.add(st);
  }
  const rack = Props.weaponRack({ rand });
  rack.position.set(-16.5, 0, 12);
  rack.rotation.y = Math.PI / 2;
  group.add(rack);

  // supply line: stacked crates and barrels against the south wall
  for (let i = 0; i < 9; i++) {
    const o = rand.chance(0.5) ? Props.crate({ size: rand.range(0.7, 1.0) }) : Props.barrel({});
    o.position.set(-8 + i * 2.1 + rand.range(-0.5, 0.5), 0, 23.2 + rand.range(-0.8, 0.8));
    o.rotation.y = rand.range(0, TAU);
    group.add(o);
  }

  return {
    id: 'keep', name: 'Castle Ardenhold', sub: 'Your keep, and everything you have left to defend',
    atmos: 'keep', group, animated, lights,
    spawn: { x: 0, z: 8 },
    bounds: { x0: -21, x1: 21, z0: -19, z1: 25 },
    doors,
    interactables: [
      { x: 0, z: -6, r: 3.6, label: 'War Table', sub: 'Plan the campaign', key: 'E', icon: ic('map'), action: 'map' },
    ],
    npcs: [{ id: 'marshal', x: -3.4, z: -4.6, facing: -0.9 }],

    /* The garrison. None of them can be spoken to; they are here so that the
       courtyard is somewhere an army lives rather than a menu with buildings
       around it. */
    crowd: [
      // two guards walking the wall line in opposite directions
      { kind: 'patrol', unit: 'militia', speed: 2.4, pause: 1.2,
        path: [[-18, 20], [18, 20], [18, 4], [-18, 4]] },
      { kind: 'patrol', unit: 'militia', speed: 2.2, pause: 1.6,
        path: [[18, 4], [-18, 4], [-18, 20], [18, 20]] },
      // a spearman on the gate, and one on the keep steps
      { kind: 'post', unit: 'spearman', x: -3.2, z: 24.4, facing: -Math.PI / 2 },
      { kind: 'post', unit: 'spearman', x: 3.2, z: 24.4, facing: -Math.PI / 2 },
      { kind: 'post', unit: 'shieldbearer', x: 0, z: -14.6, facing: Math.PI / 2 },
      // a sparring pair on the drill square, trading blows on a shared beat
      { kind: 'spar', unit: 'militia', x: 11.2, z: 14.4, facing: 0, offset: 0 },
      { kind: 'spar', unit: 'militia', x: 13.6, z: 14.4, facing: Math.PI, offset: 1 },
      // a runner carrying supplies between the store and the forge door
      { kind: 'work', unit: 'militia', speed: 2.8, pause: 2.0,
        path: [[-2, 22.5], [13.5, 10], [-2, 22.5], [-14, 14]] },
      // and someone standing by the armoury doing very little
      { kind: 'post', unit: 'archer', x: -11.5, z: 13.2, facing: 0.6 },
    ],
    sky: { clouds: true },
  };
}

/* ==========================================================================
   THE WIZARD'S LIBRARY
   ========================================================================== */

export function buildLibrary() {
  const group = new THREE.Group();
  const rand = makeRng(202);
  const animated = [];
  const lights = [];

  const W = 30, D = 38, H = 12;
  group.add(interior(W, D, H, { wall: 0x4e4768, floor: 0x54452f, doorWidth: 5.6, doorHeight: 5.6 }));

  /* --- the way out, and the light that comes with it --- */
  exitOf(group, animated, lights, { z: D / 2, width: 5.6, height: 5.6, runner: 14, stone: 0x8c86a8 });

  /* --- windows down both walls. The Library is meant to be a place with
     weather outside it, not a cellar. Six bays, alternating sides. --- */
  for (const zz of [-12, 0, 12]) {
    for (const s of [-1, 1]) {
      group.add(windowBay(s * (W / 2 - 0.3), zz, s, { width: 2.1, height: 4.6, y: 7.4, color: 0xd6e6f4 }));
      lights.push({ x: s * (W / 2 - 4), y: 6.4, z: zz, color: 0xbcd4ea, intensity: 1.35, dist: 20, flicker: 0 });
    }
  }

  // a long rug down the middle
  group.add(meshOf([
    box(6, 0.02, 26, { color: 0x5a2a2a, y: 0.02 }),
    box(5.2, 0.02, 25, { color: 0x6a3a3a, y: 0.03 }),
  ], MATS.terrain, { castShadow: false }));

  /* --- towering bookshelves down both walls, two storeys --- */
  for (let i = 0; i < 7; i++) {
    const z = -15 + i * 5;
    for (const x of [-W / 2 + 1.2, W / 2 - 1.2]) {
      for (const y of [0, 4.6]) {
        const sh = Props.bookshelf({ width: 4.4, height: 4.4, seed: i * 13 + y, rand });
        sh.position.set(x, y, z);
        sh.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        group.add(sh);
      }
    }
  }
  // a gallery walkway for the upper shelves
  for (const x of [-W / 2 + 3.4, W / 2 - 3.4]) {
    group.add(meshOf([
      box(1.6, 0.25, 34, { color: PAL.woodDark, x, y: 4.4 }),
      box(0.1, 1.0, 34, { color: PAL.woodDark, x: x + (x < 0 ? 0.7 : -0.7), y: 5.0 }),
    ], MATS.body));
  }
  // free-standing shelves forming aisles
  for (const [x, z] of [[-7, -6], [7, -6], [-7, 4], [7, 4]]) {
    const sh = Props.bookshelf({ width: 4.0, height: 4.0, seed: x * z, rand });
    sh.position.set(x, 0, z);
    sh.rotation.y = rand.chance(0.5) ? 0 : Math.PI;
    group.add(sh);
  }

  /* --- the Wizard's desk, at the far end --- */
  const desk = meshOf([
    box(4.4, 0.16, 1.8, { color: 0x4a3524, y: 1.0 }),
    box(0.2, 1.0, 0.2, { color: 0x3a2a1a, x: 2.0, z: 0.7, y: 0.5 }),
    box(0.2, 1.0, 0.2, { color: 0x3a2a1a, x: -2.0, z: 0.7, y: 0.5 }),
    box(0.2, 1.0, 0.2, { color: 0x3a2a1a, x: 2.0, z: -0.7, y: 0.5 }),
    box(0.2, 1.0, 0.2, { color: 0x3a2a1a, x: -2.0, z: -0.7, y: 0.5 }),
    box(0.7, 0.1, 0.5, { color: 0xe8e0c8, y: 1.1, z: 0.2, ry: 0.2 }),
    box(0.6, 0.09, 0.45, { color: 0xd8cbb0, y: 1.16, z: -0.3, ry: -0.3 }),
  ], MATS.body);
  desk.position.set(0, 0, -15);
  group.add(desk);

  for (let i = 0; i < 4; i++) {
    const c = Props.candle({ phase: rand.range(0, 9), height: rand.range(0.3, 0.5) });
    c.position.set(-1.6 + i * 1.1, 1.1, -15 + rand.range(-0.5, 0.5));
    group.add(c); animated.push(c);
  }
  lights.push({ x: 0, y: 2.2, z: -15, color: 0xffd08a, intensity: 1.6, dist: 14, flicker: 0.14 });

  /* --- floating books orbiting the centre of the room --- */
  const fb = Props.floatingBooks(9, { rand });
  fb.position.set(0, 1.2, -4);
  group.add(fb); animated.push(fb);

  /* --- the orrery: a slow model of something, nobody asks what --- */
  const orrery = new THREE.Group();
  orrery.add(meshOf([
    cyl(0.5, 0.7, 1.4, 8, { color: 0x3a3a48, y: 0.7 }),
    sphere(0.45, 12, { color: 0xffd479, y: 2.4 }),
  ], MATS.body));
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = 1.1 + i * 0.7;
    const g = new THREE.Group();
    g.add(meshOf(
      [sphere(0.14 - i * 0.02, 8, { color: [0x8fbf4a, 0x5aa6d8, 0xb07fd0][i], x: r, y: 0, grad: 0 })],
      MATS.glow, { castShadow: false }));
    const torusMesh = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.025, 5, 28),
      MATS.emissive(0x6a5a96, 0.55));
    torusMesh.rotation.x = Math.PI / 2 + i * 0.3;
    g.add(torusMesh);
    g.position.y = 2.4;
    orrery.add(g);
    rings.push({ g, speed: 0.4 - i * 0.1 });
  }
  orrery.userData.update = (t) => { for (const r of rings) r.g.rotation.y = t * r.speed; };
  orrery.position.set(-9, 0, -11);
  group.add(orrery); animated.push(orrery);
  lights.push({ x: -9, y: 2.6, z: -11, color: 0xffd479, intensity: 1.1, dist: 10, flicker: 0.05 });

  /* --- the brewing station --- */
  const alch = Props.alchemyTable({ rand });
  alch.position.set(9, 0, -11);
  alch.rotation.y = -0.4;
  group.add(alch); animated.push(alch);
  lights.push({ x: 10.4, y: 1.2, z: -11, color: 0x8fbf4a, intensity: 1.0, dist: 9, flicker: 0.2 });

  /* --- artefact pedestals --- */
  const artefacts = [
    { x: -6, z: 8, color: 0xb07fd0, shape: 'orb' },
    { x: 0, z: 10, color: 0xffd479, shape: 'crown' },
    { x: 6, z: 8, color: 0x79cfe0, shape: 'shard' },
  ];
  for (const a of artefacts) {
    const p = Props.pedestal({ height: 1.15 });
    p.position.set(a.x, 0, a.z);
    group.add(p);
    const relic = meshOf(
      a.shape === 'orb' ? [sphere(0.28, 12, { color: a.color, y: 1.6, grad: 0 })]
        : a.shape === 'crown' ? [cyl(0.24, 0.24, 0.12, 9, { color: a.color, y: 1.55, grad: 0 }),
          ...Array.from({ length: 6 }, (_, i) => {
            const ang = (i / 6) * TAU;
            return cone(0.05, 0.2, 4, { color: a.color, x: Math.cos(ang) * 0.22, z: Math.sin(ang) * 0.22, y: 1.7, grad: 0 });
          })]
          : [cone(0.16, 0.6, 5, { color: a.color, y: 1.75, grad: 0 })],
      MATS.glow, { castShadow: false });
    relic.userData.update = (t) => { relic.rotation.y = t * 0.6; relic.position.y = Math.sin(t * 1.4) * 0.06; };
    group.add(relic); animated.push(relic);
    lights.push({ x: a.x, y: 1.8, z: a.z, color: a.color, intensity: 0.8, dist: 7, flicker: 0.08 });
  }

  /* --- armour stands and weapon racks along the back --- */
  for (const x of [-12, 12]) {
    const st = Props.armorStand({ metal: x < 0 ? PAL.steel : 0xc8a860 });
    st.position.set(x, 0, 12);
    st.rotation.y = x < 0 ? 0.4 : -0.4;
    group.add(st);
  }
  const rack = Props.weaponRack({ rand });
  rack.position.set(0, 0, 16);
  group.add(rack);

  /* --- sconces down both aisles.
     Without these the room is geometrically correct and visually a black box:
     the shelves are dark wood against dark stone and nothing picks them out. */
  for (const zz of [-14, -5, 5, 14]) {
    for (const xx of [-W / 2 + 3.2, W / 2 - 3.2]) {
      const t = Props.torch({ phase: rand.range(0, 9) });
      t.position.set(xx, 2.6, zz);
      t.scale.setScalar(0.95);
      group.add(t); animated.push(t);
      lights.push({ x: xx, y: 3.4, z: zz, color: 0xffc888, intensity: 2.1, dist: 19, flicker: 0.16 });
    }
  }

  /* --- three chandeliers of raw arcane crystal, hung down the nave.
     They are the room's key light: warm sconces on the walls, cool magic
     overhead. Two temperatures is what stops a room reading as flat. --- */
  for (const zz of [-9, 0, 9]) {
    const ch = new THREE.Group();
    ch.add(meshOf([
      cyl(0.04, 0.04, 3.4, 4, { color: 0x2a2436, y: 1.7 }),
      torus(0.95, 0.06, { color: 0x3a3250, rseg: 4, tseg: 18 }),
      torus(0.58, 0.05, { color: 0x3a3250, y: 0.34, rseg: 4, tseg: 14 }),
    ], MATS.body));
    const shards = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      shards.push(cone(0.12, 0.44, 5, {
        color: i % 2 ? 0xb9a2e6 : 0xd8c8f4,
        x: Math.cos(a) * 0.95, z: Math.sin(a) * 0.95, y: -0.3, rx: Math.PI, grad: 0,
      }));
    }
    shards.push(sphere(0.22, 10, { color: 0xe4d8ff, y: -0.1, grad: 0 }));
    const lit = meshOf(shards, MATS.glow, { castShadow: false });
    ch.add(lit);
    ch.position.set(0, H - 3.9, zz);
    ch.userData.update = (t) => {
      ch.rotation.y = Math.sin(t * 0.22 + zz) * 0.12;
      lit.scale.setScalar(1 + Math.sin(t * 1.3 + zz) * 0.02);
    };
    group.add(ch); animated.push(ch);
    lights.push({ x: 0, y: H - 4.4, z: zz, color: 0xb9a8e8, intensity: 2.4, dist: 24, flicker: 0.05 });
  }

  /* --- a few books that have simply decided to glow, on the upper shelves */
  for (const [bx, by, bz] of [[-13.2, 5.6, -8], [13.2, 5.6, 2], [-13.2, 5.6, 9], [13.2, 5.6, -13]]) {
    const b = meshOf([box(0.12, 0.42, 0.3, { color: rand.pick([0x9a6fe0, 0x79cfe0, 0x8fbf4a]), grad: 0 })],
      MATS.glow, { castShadow: false });
    b.position.set(bx, by, bz);
    b.userData.update = (t) => { b.position.y = by + Math.sin(t * 0.9 + bx) * 0.05; };
    group.add(b); animated.push(b);
    lights.push({ x: bx, y: by, z: bz, color: 0x9a6fe0, intensity: 0.7, dist: 7, flicker: 0.1 });
  }

  /* --- the cabinet at the back that is not a cabinet --- */
  const cab = meshOf([
    box(2.6, 4.2, 1.0, { color: 0x241c2e, z: -18.2, y: 2.1 }),
    box(2.8, 0.2, 1.1, { color: shadeOf(0x241c2e, 1.3), z: -18.2, y: 4.2 }),
    box(0.1, 3.4, 0.05, { color: 0x6a5a96, z: -17.68, y: 2.1, grad: 0 }),
  ], MATS.body);
  group.add(cab);
  const cabGlow = meshOf([box(2.2, 0.06, 0.04, { color: 0xb07fd0, z: -17.66, y: 2.1, grad: 0 })], MATS.glow, { castShadow: false });
  cabGlow.userData.update = (t) => { cabGlow.scale.x = 1 + Math.sin(t * 0.7) * 0.25; };
  group.add(cabGlow); animated.push(cabGlow);

  return {
    id: 'library', name: "The Wizard's Library", sub: 'Mind the third step. It is older than the building.',
    atmos: 'library', group, animated, lights,
    // stand a few metres in from the door, so the camera boom has room behind
    spawn: { x: 0, z: 11.5 },
    bounds: { x0: -W / 2 + 2, x1: W / 2 - 2, z0: -D / 2 + 2.5, z1: D / 2 - 2.5 },
    doors: [{ x: 0, z: 17.5, to: 'keep', label: 'Courtyard', icon: ic('castle'), exit: true }],
    interactables: [
      { x: 9, z: -11, r: 3.2, label: 'Brewing Station', sub: 'Potions and transmutation', key: 'E', icon: ic('flask'), action: 'alchemy' },
      { x: -9, z: -11, r: 3.2, label: 'The Orrery', sub: 'Research', key: 'E', icon: ic('scroll'), action: 'research' },
      { x: 0, z: 10, r: 3.0, label: 'Reliquary', sub: 'Awaken a card', key: 'E', icon: ic('star'), action: 'awaken' },
      { x: 0, z: 16, r: 3.0, label: 'The Codex', sub: 'Everything the Wizard knows', key: 'E', icon: ic('book'), action: 'codex' },
    ],
    npcs: [{ id: 'wizard', x: 0, z: -12.5, facing: Math.PI / 2 }],
  };
}

/* ==========================================================================
   THE FORGE
   ========================================================================== */

export function buildForge() {
  const group = new THREE.Group();
  const rand = makeRng(303);
  const animated = [], lights = [];

  const W = 24, D = 26, H = 8;
  group.add(interior(W, D, H, { wall: 0x574745, floor: 0x4d4741, doorWidth: 5.2, doorHeight: 5.2 }));

  /* --- the way out. Same arch, same banner, same runner as the Library:
     an exit the player has used once must be recognisable everywhere. --- */
  exitOf(group, animated, lights, { z: D / 2, width: 5.2, height: 5.2, runner: 10, stone: 0x8a7a70 });

  /* --- the hearth is the room's whole identity, so it is genuinely bright
     and genuinely orange, and the light it throws reaches every corner --- */
  const hearth = Props.forgeHearth({});
  hearth.position.set(0, 0, -10);
  group.add(hearth); animated.push(hearth);
  lights.push({ x: 0, y: 1.7, z: -9.2, color: 0xff7a30, intensity: 4.6, dist: 30, flicker: 0.22, priority: 2.2 });
  lights.push({ x: 0, y: 4.2, z: -7.0, color: 0xd8641e, intensity: 2.2, dist: 26, flicker: 0.16 });

  /* the chimney hood over it, so the fire has somewhere to go */
  group.add(meshOf([
    taperBox(6.2, 2.4, 3.0, 0.42, { color: 0x3a302c, y: 5.2, z: -10.4 }),
    box(2.6, H - 6.2, 2.0, { color: 0x322a26, y: 6.6, z: -10.4 }),
    box(6.6, 0.3, 3.3, { color: 0x4a3f38, y: 4.0, z: -10.4 }),
  ], MATS.body));

  /* A shaft of daylight from a roof vent — cold, against all that orange.
     It is a NARROW column, not a room-wide cone: a wide shaft at any opacity
     washes out everything behind it, which is the opposite of the point. */
  const vent = meshOf([
    box(1.9, 0.1, 1.9, { color: 0xcfe2f2, y: H - 0.4, z: 4, grad: 0 }),
  ], MATS.glow, { castShadow: false });
  group.add(vent);
  group.add(meshOf([
    taperBox(1.7, H - 1.0, 1.7, 1.55, { color: 0xbcd6ec, y: (H - 1.0) / 2, z: 4, grad: 0 }),
  ], MATS.emissive(0xbcd6ec, 0.055), { castShadow: false }));
  group.add(meshOf([
    ring(0, 1.5, 18, { color: 0xbcd6ec, rx: -Math.PI / 2, y: 0.07, z: 4, grad: 0 }),
  ], MATS.emissive(0xbcd6ec, 0.14), { castShadow: false }));
  lights.push({ x: 0, y: H - 1.6, z: 4, color: 0xbcd6ec, intensity: 2.1, dist: 22, flicker: 0, priority: 1.5 });

  const anvil = Props.anvil({});
  anvil.position.set(0, 0, -3);
  group.add(anvil);

  const trough = Props.quenchTrough({});
  trough.position.set(5, 0, -4);
  trough.rotation.y = -0.4;
  group.add(trough);

  for (const [x, z, rot] of [[-W / 2 + 1.4, -2, Math.PI / 2], [-W / 2 + 1.4, 4, Math.PI / 2], [W / 2 - 1.4, 2, -Math.PI / 2]]) {
    const r = Props.weaponRack({ rand });
    r.position.set(x, 0, z);
    r.rotation.y = rot;
    group.add(r);
  }
  for (const [x, z] of [[-7, 6], [-4, 7], [7, 6]]) {
    const st = Props.armorStand({ metal: rand.pick([PAL.steel, PAL.iron, 0xc8a860]) });
    st.position.set(x, 0, z);
    st.rotation.y = rand.range(-0.6, 0.6);
    group.add(st);
  }
  for (let i = 0; i < 8; i++) {
    const o = rand.chance(0.6) ? Props.crate({ size: rand.range(0.5, 0.8) }) : Props.barrel({});
    o.position.set(rand.range(-9, 9), 0, rand.range(-6, 10));
    o.rotation.y = rand.range(0, TAU);
    group.add(o);
  }
  // ingots stacked by the hearth
  group.add(meshOf([
    box(0.5, 0.16, 0.22, { color: PAL.iron, x: -3, y: 0.08, z: -8 }),
    box(0.5, 0.16, 0.22, { color: PAL.iron, x: -3, y: 0.24, z: -8 }),
    box(0.5, 0.16, 0.22, { color: PAL.steel, x: -3.1, y: 0.4, z: -8.05, ry: 0.2 }),
    box(0.5, 0.16, 0.22, { color: 0xc8a860, x: -2.4, y: 0.08, z: -8.2, ry: -0.3 }),
  ], MATS.body));

  /* --- wall torches. These had no entries in `lights` at all, which is why
     the Forge was a black room with a bright fire at the end of it. --- */
  for (const x of [-W / 2 + 1, W / 2 - 1]) {
    for (const z of [-6, 0, 6]) {
      const t = Props.torch({ phase: rand.range(0, 9) });
      t.position.set(x, 2.2, z);
      group.add(t); animated.push(t);
      lights.push({ x: x * 0.86, y: 3.0, z, color: 0xffa860, intensity: 1.9, dist: 16, flicker: 0.22 });
    }
  }

  /* --- a wall of finished work, because a forge should look like somewhere
     things are MADE, not a room with an anvil in it --- */
  const display = [];
  for (let i = 0; i < 7; i++) {
    const x = -8.4 + i * 2.8;
    display.push(box(0.14, 1.5, 0.05, { color: PAL.steel, x, y: 4.2, z: -D / 2 + 0.9 }));
    display.push(box(0.5, 0.12, 0.06, { color: shadeOf(PAL.gold, 0.8), x, y: 3.6, z: -D / 2 + 0.9 }));
    display.push(box(0.22, 0.22, 0.05, { color: rand.pick([PAL.iron, 0xc8a860, PAL.steel]), x, y: 5.1, z: -D / 2 + 0.9 }));
  }
  display.push(box(W - 4, 0.16, 0.34, { color: PAL.woodDark, y: 3.2, z: -D / 2 + 0.9 }));
  group.add(meshOf(display, MATS.body));

  /* --- sparks, always. The hearth breathes. --- */
  const sparks = new THREE.Group();
  const motes = [];
  for (let i = 0; i < 14; i++) {
    const m = meshOf([sphere(0.045, 4, { color: i % 3 ? 0xffb050 : 0xffe0a0, grad: 0 })], MATS.glow, { castShadow: false });
    m.userData = { p: rand.range(0, TAU), r: rand.range(0.4, 1.6), s: rand.range(0.5, 1.3) };
    sparks.add(m); motes.push(m);
  }
  sparks.position.set(0, 1.2, -9.4);
  sparks.userData.update = (t) => {
    for (const m of motes) {
      const u = (t * m.userData.s + m.userData.p) % 3;
      m.position.set(Math.sin(m.userData.p * 4 + u) * m.userData.r, u * 1.5, Math.cos(m.userData.p * 3) * m.userData.r * 0.6);
      m.scale.setScalar(Math.max(0.05, 1 - u / 3));
    }
  };
  group.add(sparks); animated.push(sparks);

  return {
    id: 'forge', name: 'The Forge', sub: 'A fire that has not gone out in ninety years',
    atmos: 'forge', group, animated, lights,
    spawn: { x: 0, z: 6.5 },
    bounds: { x0: -W / 2 + 2, x1: W / 2 - 2, z0: -D / 2 + 2.5, z1: D / 2 - 2.5 },
    doors: [{ x: 0, z: 11.5, to: 'keep', label: 'Courtyard', icon: ic('castle'), exit: true }],
    crowd: [
      { kind: 'work', unit: 'militia', speed: 1.9, pause: 2.2,
        path: [[-7.5, 3.5], [-3.4, -6.4], [4.6, 4.6], [-7.5, 3.5]] },
    ],
    interactables: [
      { x: 0, z: -3, r: 3.0, label: 'The Anvil', sub: 'Forge weapons and armour', key: 'E', icon: ic('hammer'), action: 'forge' },
      { x: 5, z: -4, r: 2.6, label: 'Quench Trough', sub: 'Temper your equipment', key: 'E', icon: ic('chevron'), action: 'temper' },
      { x: -7, z: 6, r: 2.8, label: 'Armour Stand', sub: 'Your equipment', key: 'E', icon: ic('medal'), action: 'equip' },
    ],
    npcs: [{ id: 'smith', x: -1.8, z: -5.5, facing: 1.2 }],
  };
}

/* ==========================================================================
   ARMY CAMP
   ========================================================================== */

export function buildCamp() {
  const group = new THREE.Group();
  const rand = makeRng(404);
  const animated = [], lights = [];

  group.add(ground(70, 70, shadeOf(PAL.grassLight, 0.92), { rand, bumpy: true }));
  outdoorExit(group, animated, lights, 19, { runner: 11 });

  // tents in two rows
  for (let i = 0; i < 5; i++) {
    for (const side of [-1, 1]) {
      const t = Props.tent({ size: 2.2, color: PAL.cloth, accent: PAL.teamPlayer });
      t.position.set(side * 9, 0, -10 + i * 5.5);
      t.rotation.y = side < 0 ? 0.3 : -0.3;
      group.add(t);
    }
  }
  // the big command tent
  const cmd = Props.tent({ size: 3.6, color: 0xd8cbb0, accent: PAL.gold });
  cmd.position.set(0, 0, -14);
  group.add(cmd);

  // a campfire the soldiers stand around
  const fire = Props.brazier();
  fire.position.set(0, 0, 2);
  fire.scale.setScalar(1.3);
  group.add(fire); animated.push(fire);
  lights.push({ x: 0, y: 1.8, z: 2, color: 0xffa050, intensity: 2.2, dist: 18, flicker: 0.28 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const log = meshOf([cyl(0.22, 0.24, 1.6, 6, { color: PAL.woodDark, rz: Math.PI / 2 })], MATS.body);
    log.position.set(Math.cos(a) * 3.2, 0.22, 2 + Math.sin(a) * 3.2);
    log.rotation.y = -a;
    group.add(log);
  }

  // banners and a muster area
  for (const x of [-4, 4]) {
    const b = Props.bannerPole({ height: 5.5, color: PAL.teamPlayer, accent: PAL.gold });
    b.position.set(x, 0, 8);
    group.add(b); animated.push(b);
  }

  // supply stacks
  for (let i = 0; i < 12; i++) {
    const o = rand.chance(0.5) ? Props.crate({ size: rand.range(0.6, 0.9) }) : Props.barrel({});
    o.position.set(rand.range(-14, 14), 0, rand.range(-12, 14));
    o.rotation.y = rand.range(0, TAU);
    group.add(o);
  }

  // palisade
  const posts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU;
    const d = 22;
    posts.push(cyl(0.16, 0.2, 2.6, 5, { color: PAL.woodDark, x: Math.cos(a) * d, z: Math.sin(a) * d, y: 1.3 }));
    posts.push(cone(0.18, 0.4, 5, { color: shadeOf(PAL.woodDark, 1.1), x: Math.cos(a) * d, z: Math.sin(a) * d, y: 2.75 }));
  }
  group.add(meshOf(posts, MATS.body));

  for (let i = 0; i < 10; i++) {
    const t = Props.tree({ rand, height: rand.range(5, 7) });
    const a = rand.range(0, TAU), d = rand.range(26, 33);
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    group.add(t);
  }

  return {
    id: 'camp', name: 'The Army Camp', sub: 'Serjeant Bell keeps a ledger you are not allowed to read',
    atmos: 'greenmarch', group, animated, lights,
    spawn: { x: 0, z: 14 },
    bounds: { x0: -19, x1: 19, z0: -17, z1: 19 },
    doors: [{ x: 0, z: 19, to: 'keep', label: 'Courtyard', icon: ic('castle'), exit: true }],
    interactables: [
      { x: 0, z: -14, r: 3.6, label: 'Command Tent', sub: 'Your army and collection', key: 'E', icon: ic('banner'), action: 'army' },
      { x: 0, z: 2, r: 3.4, label: 'The Campfire', sub: 'Challenges', key: 'E', icon: ic('medal'), action: 'challenges' },
    ],
    npcs: [{ id: 'quartermaster', x: 2.6, z: -11, facing: -1.2 }],
    sky: { clouds: true },
  };
}

/* ==========================================================================
   MARKETPLACE
   ========================================================================== */

export function buildMarket() {
  const group = new THREE.Group();
  const rand = makeRng(505);
  const animated = [], lights = [];

  group.add(ground(56, 56, shadeOf(PAL.dirt, 1.1), { rand }));
  group.add(flagstones(30, 30, shadeOf(PAL.stone, 1.05)));
  outdoorExit(group, animated, lights, 16, { runner: 10 });

  const colors = [0x8a3a3a, 0x3a5a8a, 0x5a8a3a, 0x8a7a3a, 0x6a3a8a];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.5;
    const s = Props.marketStall({ color: colors[i], rand });
    s.position.set(Math.cos(a) * 9, 0, Math.sin(a) * 9);
    s.rotation.y = -a + Math.PI / 2;
    group.add(s);
  }

  // Odessa's own stall, larger, at the back
  const main = Props.marketStall({ color: 0x5a3a4a, rand });
  main.position.set(0, 0, -11);
  main.scale.setScalar(1.3);
  group.add(main);

  for (let i = 0; i < 14; i++) {
    const o = rand.chance(0.5) ? Props.crate({ size: rand.range(0.5, 0.9) }) : Props.barrel({});
    o.position.set(rand.range(-13, 13), 0, rand.range(-13, 13));
    o.rotation.y = rand.range(0, TAU);
    group.add(o);
  }
  for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    const t = Props.torch({ phase: rand.range(0, 9) });
    t.position.set(x, 0.6, z);
    t.scale.setScalar(1.6);
    group.add(t); animated.push(t);
    lights.push({ x, y: 2.2, z, color: 0xffb060, intensity: 1.2, dist: 12, flicker: 0.25 });
  }
  for (let i = 0; i < 8; i++) {
    const t = Props.tree({ rand, height: rand.range(4.5, 6.5) });
    const a = rand.range(0, TAU), d = rand.range(20, 26);
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    group.add(t);
  }

  return {
    id: 'market', name: 'The Marketplace', sub: 'Everything here is legally hers as of about an hour ago',
    atmos: 'keep', group, animated, lights,
    spawn: { x: 0, z: 12 },
    bounds: { x0: -15, x1: 15, z0: -14, z1: 16 },
    doors: [{ x: 0, z: 16, to: 'keep', label: 'Courtyard', icon: ic('castle'), exit: true }],
    interactables: [
      { x: 0, z: -11, r: 3.4, label: "Odessa's Stall", sub: 'Buy materials, shards and chests', key: 'E', icon: ic('purse'), action: 'shop' },
    ],
    npcs: [{ id: 'merchant', x: 0, z: -13, facing: Math.PI / 2 }],
    sky: { clouds: true },
  };
}

/* ==========================================================================
   TRAINING GROUND
   ========================================================================== */

export function buildTraining() {
  const group = new THREE.Group();
  const rand = makeRng(606);
  const animated = [], lights = [];

  group.add(ground(60, 60, shadeOf(PAL.grassDry, 0.95), { rand, bumpy: true }));
  group.add(flagstones(26, 20, shadeOf(PAL.dirt, 1.15)));
  outdoorExit(group, animated, lights, 16, { runner: 10 });

  for (let i = 0; i < 6; i++) {
    const d = Props.trainingDummy({});
    d.position.set(-10 + i * 4, 0, -6);
    d.rotation.y = rand.range(-0.3, 0.3);
    group.add(d);
  }
  for (const x of [-11, 11]) {
    const r = Props.weaponRack({ rand });
    r.position.set(x, 0, 2);
    r.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(r);
  }

  // an archery butt at the far end
  for (let i = 0; i < 3; i++) {
    const t = meshOf([
      cyl(1.1, 1.1, 0.3, 14, { color: 0xc8b080, rx: Math.PI / 2, y: 1.6 }),
      cyl(0.75, 0.75, 0.32, 14, { color: 0xd8d0b8, rx: Math.PI / 2, y: 1.6 }),
      cyl(0.4, 0.4, 0.34, 12, { color: 0xc5362b, rx: Math.PI / 2, y: 1.6 }),
      box(0.16, 1.6, 0.16, { color: PAL.woodDark, y: 0.8 }),
    ], MATS.body);
    t.position.set(-6 + i * 6, 0, -14);
    group.add(t);
  }

  // fence around the sparring square
  const fence = [];
  for (let i = -7; i <= 7; i++) {
    for (const z of [-10.5, 6.5]) {
      fence.push(cyl(0.08, 0.1, 1.2, 4, { color: PAL.woodDark, x: i * 2, z, y: 0.6 }));
    }
    fence.push(box(2.1, 0.09, 0.09, { color: PAL.woodDark, x: i * 2, z: -10.5, y: 0.9 }));
    fence.push(box(2.1, 0.09, 0.09, { color: PAL.woodDark, x: i * 2, z: 6.5, y: 0.9 }));
  }
  group.add(meshOf(fence, MATS.body));

  for (const x of [-4, 4]) {
    const b = Props.bannerPole({ height: 4.6, color: 0x4a4a52, accent: PAL.blood });
    b.position.set(x, 0, 8);
    group.add(b); animated.push(b);
  }
  for (let i = 0; i < 9; i++) {
    const t = Props.tree({ rand, height: rand.range(5, 7.5) });
    const a = rand.range(0, TAU), d = rand.range(22, 28);
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    group.add(t);
  }

  return {
    id: 'training', name: 'The Training Ground', sub: 'Captain Roon has opinions about your deck',
    atmos: 'greenmarch', group, animated, lights,
    spawn: { x: 0, z: 12 },
    bounds: { x0: -17, x1: 17, z0: -16, z1: 16 },
    doors: [{ x: 0, z: 16, to: 'keep', label: 'Courtyard', icon: ic('castle'), exit: true }],
    interactables: [
      { x: 0, z: -6, r: 4.0, label: 'Sparring Ground', sub: 'Practice battle', key: 'E', icon: ic('swords'), action: 'training' },
      { x: 11, z: 2, r: 2.8, label: 'Counter Table', sub: 'Damage and armour reference', key: 'E', icon: ic('book'), action: 'counters' },
    ],
    npcs: [{ id: 'drillmaster', x: -2.4, z: -3, facing: 0.6 }],
    sky: { clouds: true },
  };
}

/* ==========================================================================
   REGISTRY
   ========================================================================== */

export const ZONE_BUILDERS = {
  keep: buildKeep,
  library: buildLibrary,
  forge: buildForge,
  camp: buildCamp,
  market: buildMarket,
  training: buildTraining,
};

export function buildZone(id) {
  const fn = ZONE_BUILDERS[id] || ZONE_BUILDERS.keep;
  return fn();
}
