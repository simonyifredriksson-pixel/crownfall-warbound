/* Zones.js — the places you can walk around in.

   Each zone builds a small, dense 3D space and declares what is interactive.
   They are deliberately compact: a courtyard you cross in eight seconds reads
   as a place, while a field you cross in ninety reads as a chore.

   A zone returns:
     { group, atmos, spawn, bounds, walls, interactables, doors, npcs, animated, lights }
*/

import * as THREE from '../../lib/three.module.js';
import { box, cyl, sphere, cone, plane, ring, rock, meshOf, merge } from '../art/Geo.js';
import { PAL, MATS, ATMOS } from '../art/Palette.js';
import { shadeOf } from '../art/GearArt.js';
import * as Props from '../art/PropArt.js';
import { makeRng, TAU, clamp } from '../core/Util.js';
import { NPCS } from '../data/Dialogue.js';

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

function interior(w, d, h, o = {}) {
  const wall = o.wall ?? PAL.stoneDark;
  const g = [
    box(w, 0.3, d, { color: o.floor ?? 0x3a2f28, y: -0.15 }),
    box(w, h, 0.6, { color: wall, z: -d / 2, y: h / 2 }),
    box(w, h, 0.6, { color: wall, z: d / 2, y: h / 2 }),
    box(0.6, h, d, { color: shadeOf(wall, 0.92), x: -w / 2, y: h / 2 }),
    box(0.6, h, d, { color: shadeOf(wall, 0.92), x: w / 2, y: h / 2 }),
    box(w, 0.5, d, { color: shadeOf(wall, 0.7), y: h }),
  ];
  // ceiling beams
  for (let i = -Math.floor(d / 5); i <= Math.floor(d / 5); i++) {
    g.push(box(w - 1, 0.3, 0.4, { color: PAL.woodDark, y: h - 0.35, z: i * 5 }));
  }
  const m = meshOf(g, MATS.body);
  m.receiveShadow = true;
  return m;
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
  const doorways = [
    { x: -16, z: -8, label: 'The Library', to: 'library', icon: '🧙', color: 0x3a3050 },
    { x: 16, z: -8, label: 'The Forge', to: 'forge', icon: '🔨', color: 0x4a2f22 },
    { x: -16, z: 10, label: 'Army Camp', to: 'camp', icon: '🚩', color: 0x3a4030 },
    { x: 16, z: 10, label: 'Marketplace', to: 'market', icon: '💰', color: 0x3f3a2a },
    { x: 0, z: 22, label: 'Training Ground', to: 'training', icon: '🎯', color: 0x3a3a42 },
  ];
  const doors = [];
  for (const d of doorways) {
    const b = meshOf([
      box(8, 6, 7, { color: shadeOf(PAL.stone, 0.95) }),
      box(8.6, 0.5, 7.6, { color: shadeOf(PAL.stone, 1.12), y: 3.1 }),
      cone(6.6, 3, 4, { color: d.color, y: 4.8, ry: Math.PI / 4 }),
      box(2.2, 3.2, 0.3, { color: PAL.woodDark, z: 3.55, y: -1.4 }),
      box(0.16, 3.2, 0.36, { color: PAL.iron, z: 3.7, y: -1.4 }),
    ], MATS.body);
    b.position.set(d.x, 3, d.z);
    if (d.z > 12) b.rotation.y = Math.PI;
    group.add(b);

    const dz = d.z > 12 ? d.z - 3.8 : d.z + 3.8;
    doors.push({ x: d.x, z: dz, to: d.to, label: d.label, icon: d.icon });

    const t = Props.torch({ phase: rand.range(0, 9) });
    t.position.set(d.x - 1.8, 1.6, dz + (d.z > 12 ? -0.2 : 0.2));
    group.add(t); animated.push(t);
    lights.push({ x: d.x - 1.8, y: 2.6, z: dz, color: 0xffa050, intensity: 1.1, dist: 9, flicker: 0.3 });
  }

  // crates and barrels for texture
  for (let i = 0; i < 10; i++) {
    const o = rand.chance(0.5) ? Props.crate({ size: rand.range(0.6, 0.9) }) : Props.barrel({});
    o.position.set(rand.range(-19, 19), 0, rand.range(-18, 22));
    o.rotation.y = rand.range(0, TAU);
    if (Math.abs(o.position.x) < 6 && Math.abs(o.position.z + 6) < 6) continue;
    group.add(o);
  }

  return {
    id: 'keep', name: 'Castle Ardenhold', sub: 'Your keep, and everything you have left to defend',
    atmos: 'keep', group, animated, lights,
    spawn: { x: 0, z: 8 },
    bounds: { x0: -21, x1: 21, z0: -19, z1: 25 },
    doors,
    interactables: [
      { x: 0, z: -6, r: 3.6, label: 'War Table', sub: 'Plan the campaign', key: 'E', icon: '🗺', action: 'map' },
    ],
    npcs: [],
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
  group.add(interior(W, D, H, { wall: 0x453f5c, floor: 0x4c3f31 }));

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
  for (const zz of [-10, 0, 10]) {
    for (const xx of [-W / 2 + 3.2, W / 2 - 3.2]) {
      const t = Props.torch({ phase: rand.range(0, 9) });
      t.position.set(xx, 2.6, zz);
      t.scale.setScalar(0.9);
      group.add(t); animated.push(t);
      lights.push({ x: xx, y: 3.4, z: zz, color: 0xffc070, intensity: 1.5, dist: 16, flicker: 0.18 });
    }
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
    doors: [{ x: 0, z: 17.5, to: 'keep', label: 'Courtyard', icon: '🏰' }],
    interactables: [
      { x: 9, z: -11, r: 3.2, label: 'Brewing Station', sub: 'Potions and transmutation', key: 'E', icon: '🧪', action: 'alchemy' },
      { x: -9, z: -11, r: 3.2, label: 'The Orrery', sub: 'Research', key: 'E', icon: '📜', action: 'research' },
      { x: 0, z: 10, r: 3.0, label: 'Reliquary', sub: 'Awaken a card', key: 'E', icon: '🌟', action: 'awaken' },
      { x: 0, z: 16, r: 3.0, label: 'The Codex', sub: 'Everything the Wizard knows', key: 'E', icon: '📖', action: 'codex' },
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
  group.add(interior(W, D, H, { wall: 0x4a3c3a, floor: 0x433e3a }));

  const hearth = Props.forgeHearth({});
  hearth.position.set(0, 0, -10);
  group.add(hearth); animated.push(hearth);
  lights.push({ x: 0, y: 1.6, z: -9.5, color: 0xff7a30, intensity: 3.0, dist: 22, flicker: 0.22 });

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

  for (const x of [-W / 2 + 1, W / 2 - 1]) {
    for (const z of [-6, 0, 6]) {
      const t = Props.torch({ phase: rand.range(0, 9) });
      t.position.set(x, 2.2, z);
      group.add(t); animated.push(t);
    }
  }

  return {
    id: 'forge', name: 'The Forge', sub: 'A fire that has not gone out in ninety years',
    atmos: 'forge', group, animated, lights,
    spawn: { x: 0, z: 6.5 },
    bounds: { x0: -W / 2 + 2, x1: W / 2 - 2, z0: -D / 2 + 2.5, z1: D / 2 - 2.5 },
    doors: [{ x: 0, z: 11.5, to: 'keep', label: 'Courtyard', icon: '🏰' }],
    interactables: [
      { x: 0, z: -3, r: 3.0, label: 'The Anvil', sub: 'Forge weapons and armour', key: 'E', icon: '🔨', action: 'forge' },
      { x: 5, z: -4, r: 2.6, label: 'Quench Trough', sub: 'Temper your equipment', key: 'E', icon: '▲', action: 'temper' },
      { x: -7, z: 6, r: 2.8, label: 'Armour Stand', sub: 'Your equipment', key: 'E', icon: '🎖', action: 'equip' },
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
    doors: [{ x: 0, z: 19, to: 'keep', label: 'Courtyard', icon: '🏰' }],
    interactables: [
      { x: 0, z: -14, r: 3.6, label: 'Command Tent', sub: 'Your army and collection', key: 'E', icon: '🚩', action: 'army' },
      { x: 0, z: 2, r: 3.4, label: 'The Campfire', sub: 'Challenges', key: 'E', icon: '🎖', action: 'challenges' },
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
    doors: [{ x: 0, z: 16, to: 'keep', label: 'Courtyard', icon: '🏰' }],
    interactables: [
      { x: 0, z: -11, r: 3.4, label: "Odessa's Stall", sub: 'Buy materials, shards and chests', key: 'E', icon: '💰', action: 'shop' },
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
    doors: [{ x: 0, z: 16, to: 'keep', label: 'Courtyard', icon: '🏰' }],
    interactables: [
      { x: 0, z: -6, r: 4.0, label: 'Sparring Ground', sub: 'Practice battle', key: 'E', icon: '⚔', action: 'training' },
      { x: 11, z: 2, r: 2.8, label: 'Counter Table', sub: 'Damage and armour reference', key: 'E', icon: '📖', action: 'counters' },
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
