/* PropArt.js — the furniture of the world.

   Every prop returns a THREE.Mesh (or small Group) already merged, so a
   library with forty bookshelves costs forty draw calls rather than four
   hundred. Props that need to animate (floating books, forge fire, water)
   return a Group and register an `update` on it.
*/

import * as THREE from '../../lib/three.module.js';
import { box, taperBox, cyl, sphere, cone, torus, shape, ring, plane, rock, banner, merge, meshOf, transformed } from './Geo.js';
import { PAL, MATS } from './Palette.js';
import { shadeOf } from './GearArt.js';
import { rng, TAU, makeRng } from '../core/Util.js';

/* ==========================================================================
   NATURE
   ========================================================================== */

export function tree(o = {}) {
  const r = o.rand || rng;
  const h = o.height ?? r.range(4.5, 7.5);
  const trunk = o.trunk ?? PAL.woodDark;
  const leaf = o.leaf ?? PAL.grassDark;
  const g = [
    cyl(h * 0.045, h * 0.085, h * 0.55, 6, { color: trunk, y: h * 0.275 }),
  ];
  if (o.style === 'pine') {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      g.push(cone(h * (0.34 - t * 0.07), h * 0.34, 7, { color: i % 2 ? leaf : shadeOf(leaf, 0.86), y: h * (0.42 + t * 0.2) }));
    }
  } else if (o.style === 'dead') {
    for (let i = 0; i < 5; i++) {
      const a = r.range(0, TAU);
      g.push(cyl(h * 0.02, h * 0.035, h * 0.3, 4, {
        color: shadeOf(trunk, 0.8), x: Math.cos(a) * h * 0.1, z: Math.sin(a) * h * 0.1,
        y: h * (0.5 + i * 0.07), rz: -Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9,
      }));
    }
  } else {
    const n = o.blobs ?? 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r.range(0, 0.6);
      const rr = i === 0 ? 0 : h * r.range(0.1, 0.2);
      g.push(sphere(h * r.range(0.18, 0.27), 7, {
        color: i % 2 ? leaf : shadeOf(leaf, r.range(0.82, 1.14)),
        x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: h * r.range(0.62, 0.82), sy: 0.86,
      }));
    }
  }
  return meshOf(g, MATS.body);
}

export function bush(o = {}) {
  const r = o.rand || rng;
  const c = o.color ?? PAL.grassDark;
  const g = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    g.push(sphere(r.range(0.3, 0.5), 6, {
      color: shadeOf(c, r.range(0.85, 1.1)), x: Math.cos(a) * 0.22, z: Math.sin(a) * 0.22, y: 0.3, sy: 0.8,
    }));
  }
  return meshOf(g, MATS.body);
}

export function boulder(o = {}) {
  const r = o.rand || rng;
  const s = o.size ?? r.range(0.6, 1.6);
  const g = [rock(s, { color: o.color ?? PAL.stone, rand: () => r(), jitter: 0.34, detail: 0, y: s * 0.55 })];
  if (r.chance(0.5)) g.push(rock(s * 0.5, { color: shadeOf(o.color ?? PAL.stone, 0.88), rand: () => r(), x: s * 0.8, y: s * 0.3 }));
  return meshOf(g, MATS.body);
}

export function grassTuft(o = {}) {
  const r = o.rand || rng;
  const c = o.color ?? PAL.grassDry;
  const g = [];
  for (let i = 0; i < 5; i++) {
    const a = r.range(0, TAU);
    g.push(box(0.03, r.range(0.3, 0.6), 0.03, {
      color: shadeOf(c, r.range(0.8, 1.15)), x: Math.cos(a) * 0.1, z: Math.sin(a) * 0.1,
      y: 0.2, rz: Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3,
    }));
  }
  return meshOf(g, MATS.body, { castShadow: false });
}

/* ==========================================================================
   FORTIFICATION & BUILDINGS
   ========================================================================== */

export function wallSegment(len, h, o = {}) {
  const c = o.color ?? PAL.stone;
  const g = [
    box(len, h, 0.9, { color: c, y: h / 2 }),
    box(len, 0.2, 1.1, { color: shadeOf(c, 1.12), y: h }),
  ];
  // crenellations
  const n = Math.max(2, Math.floor(len / 1.4));
  for (let i = 0; i < n; i++) {
    g.push(box(0.65, 0.5, 1.05, { color: shadeOf(c, 1.06), x: -len / 2 + (i + 0.5) * (len / n), y: h + 0.35 }));
  }
  // stone courses for texture
  for (let i = 0; i < 3; i++) g.push(box(len, 0.06, 0.94, { color: shadeOf(c, 0.86), y: h * (0.25 + i * 0.25) }));
  return meshOf(g, MATS.body);
}

export function tower(h, o = {}) {
  const c = o.color ?? PAL.stone;
  const r = o.radius ?? 2.2;
  const g = [
    cyl(r, r * 1.14, h, 10, { color: c, y: h / 2 }),
    cyl(r * 1.22, r * 1.22, 0.3, 10, { color: shadeOf(c, 1.1), y: h }),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.push(box(0.6, 0.55, 0.5, { color: shadeOf(c, 1.06), x: Math.cos(a) * r * 1.1, z: Math.sin(a) * r * 1.1, y: h + 0.4, ry: -a }));
  }
  if (o.roof) {
    g.push(cone(r * 1.35, h * 0.35, 10, { color: o.roof, y: h + h * 0.2 }));
    g.push(sphere(0.14, 6, { color: PAL.gold, y: h + h * 0.38 }));
  }
  // arrow slits
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    g.push(box(0.16, 0.7, 0.2, { color: 0x14161c, x: Math.cos(a) * r * 1.02, z: Math.sin(a) * r * 1.02, y: h * 0.62, ry: -a, grad: 0 }));
  }
  return meshOf(g, MATS.body);
}

export function keep(o = {}) {
  const c = o.color ?? PAL.stone;
  const w = o.width ?? 9, d = o.depth ?? 7, h = o.height ?? 9;
  const g = [
    box(w, h, d, { color: c, y: h / 2 }),
    box(w + 0.6, 0.35, d + 0.6, { color: shadeOf(c, 1.12), y: h }),
  ];
  const n = Math.floor(w / 1.5);
  for (let i = 0; i < n; i++) g.push(box(0.7, 0.55, 0.6, { color: shadeOf(c, 1.06), x: -w / 2 + (i + 0.5) * (w / n), y: h + 0.4, z: d / 2 }));
  for (let i = 0; i < n; i++) g.push(box(0.7, 0.55, 0.6, { color: shadeOf(c, 1.06), x: -w / 2 + (i + 0.5) * (w / n), y: h + 0.4, z: -d / 2 }));
  // great door
  g.push(box(2.2, 3.2, 0.3, { color: PAL.woodDark, z: d / 2 + 0.05, y: 1.6 }));
  g.push(shape([[-1.1, 0], [1.1, 0], [1.1, 0.6], [0, 1.2], [-1.1, 0.6]], 0.3, { color: PAL.woodDark, z: d / 2 + 0.05, y: 3.4 }));
  g.push(box(0.16, 3.4, 0.36, { color: PAL.iron, z: d / 2 + 0.08, y: 1.7 }));
  // windows
  for (let i = 0; i < 3; i++) {
    g.push(box(0.5, 1.0, 0.2, { color: 0x1a1d26, x: -2.6 + i * 2.6, y: 5.4, z: d / 2 + 0.02, grad: 0 }));
    g.push(shape([[-0.25, 0], [0.25, 0], [0, 0.35]], 0.2, { color: c, x: -2.6 + i * 2.6, y: 6.0, z: d / 2 + 0.02 }));
  }
  return meshOf(g, MATS.body);
}

export function archway(o = {}) {
  const c = o.color ?? PAL.stone;
  const w = o.width ?? 4, h = o.height ?? 5;
  const g = [
    box(0.9, h, 1.2, { color: c, x: -w / 2, y: h / 2 }),
    box(0.9, h, 1.2, { color: c, x: w / 2, y: h / 2 }),
    box(w + 0.9, 0.9, 1.3, { color: shadeOf(c, 1.1), y: h + 0.35 }),
  ];
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (i / 4);
    g.push(box(0.55, 0.5, 1.2, { color: shadeOf(c, 1.04), x: Math.cos(a) * w / 2 * 0.9, y: h - 0.3 + Math.sin(a) * 0.7, rz: -a + Math.PI / 2 }));
  }
  return meshOf(g, MATS.body);
}

export function tent(o = {}) {
  const c = o.color ?? PAL.cloth;
  const acc = o.accent ?? PAL.teamPlayer;
  const s = o.size ?? 2.2;
  const g = [
    cone(s, s * 1.5, 6, { color: c, y: s * 0.75 }),
    cone(s * 0.4, s * 0.3, 6, { color: acc, y: s * 1.5 }),
    box(0.06, 0.6, 0.06, { color: PAL.woodDark, y: s * 1.7 }),
    box(0.35, 0.28, 0.02, { color: acc, x: 0.2, y: s * 1.8 }),
    // door flap
    shape([[-0.5, 0], [0.5, 0], [0.35, 1.2], [-0.35, 1.2]], 0.04, { color: shadeOf(c, 0.8), z: s * 0.86, y: 0.6 }),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    g.push(cyl(0.02, 0.02, 1.2, 4, { color: 0x6a5a3a, x: Math.cos(a) * s * 1.2, z: Math.sin(a) * s * 1.2, y: 0.5, rz: -Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5 }));
  }
  return meshOf(g, MATS.body);
}

export function bannerPole(o = {}) {
  const h = o.height ?? 5;
  const c = o.color ?? PAL.teamPlayer;
  const acc = o.accent ?? PAL.gold;
  const grp = new THREE.Group();
  grp.add(meshOf([
    cyl(0.07, 0.09, h, 7, { color: PAL.woodDark, y: h / 2 }),
    cone(0.13, 0.4, 5, { color: acc, y: h + 0.2 }),
    cyl(0.3, 0.3, 0.2, 8, { color: PAL.stone, y: 0.1 }),
  ], MATS.body));
  const cloth = meshOf([
    banner(1.3, 2.4, { color: c }),
    banner(1.1, 0.35, { color: acc, y: 0.9 }),
  ], MATS.cloth);
  cloth.position.set(0.66, h - 1.5, 0);
  grp.add(cloth);
  grp.userData.cloth = cloth;
  grp.userData.update = (t) => { cloth.rotation.y = Math.sin(t * 1.4) * 0.12; };
  return grp;
}

export function brazier(o = {}) {
  const grp = new THREE.Group();
  grp.add(meshOf([
    cyl(0.12, 0.09, 1.1, 6, { color: PAL.ironDark, y: 0.55 }),
    cyl(0.34, 0.24, 0.3, 8, { color: PAL.iron, y: 1.2 }),
    cyl(0.4, 0.4, 0.08, 8, { color: PAL.ironDark, y: 1.34 }),
    cyl(0.28, 0.3, 0.14, 8, { color: 0x2a1a12, y: 0.16 }),
  ], MATS.body));
  const fire = meshOf([
    sphere(0.2, 6, { color: 0xffd479, y: 1.4, grad: 0 }),
    sphere(0.14, 6, { color: 0xe8823a, y: 1.55, grad: 0 }),
    sphere(0.09, 5, { color: 0xffe9a8, y: 1.66, grad: 0 }),
  ], MATS.glow, { castShadow: false });
  grp.add(fire);
  grp.userData.fire = fire;
  grp.userData.lightAt = new THREE.Vector3(0, 1.5, 0);
  grp.userData.update = (t) => {
    const f = 1 + Math.sin(t * 8.3) * 0.12 + Math.sin(t * 19) * 0.06;
    fire.scale.set(f, f * 1.15, f);
  };
  return grp;
}

/* ==========================================================================
   THE LIBRARY
   ========================================================================== */

export function bookshelf(o = {}) {
  const w = o.width ?? 2.4, h = o.height ?? 4.2, d = 0.6;
  const wood = o.wood ?? 0x56412c;
  const g = [
    box(w, h, d, { color: wood, y: h / 2 }),
    box(w + 0.12, 0.14, d + 0.12, { color: shadeOf(wood, 1.2), y: h }),
    box(w + 0.1, 0.12, d + 0.1, { color: shadeOf(wood, 1.1), y: 0.06 }),
  ];
  const shelves = Math.max(3, Math.floor(h / 0.72));
  const rand = o.rand || makeRng(o.seed ?? 1);
  const bookColors = [0x7a2a2a, 0x2a4a6a, 0x4a5a2a, 0x6a4a2a, 0x3a2a4a, 0x5a2a3a, 0x2a3a3a, 0x6a5a2a];
  for (let s = 0; s < shelves; s++) {
    const y = 0.2 + s * ((h - 0.35) / shelves);
    g.push(box(w - 0.12, 0.06, d - 0.06, { color: shadeOf(wood, 1.3), y }));
    // books
    let x = -w / 2 + 0.12;
    while (x < w / 2 - 0.2) {
      const bw = rand.range(0.07, 0.15);
      const bh = rand.range(0.3, 0.55);
      if (rand.chance(0.12)) { x += bw * 1.5; continue; }  // a gap
      g.push(box(bw, bh, d * rand.range(0.6, 0.85), {
        color: bookColors[rand.int(0, bookColors.length - 1)],
        x: x + bw / 2, y: y + bh / 2 + 0.03, z: -0.02,
        rz: rand.chance(0.1) ? rand.range(-0.25, 0.25) : 0,
      }));
      if (rand.chance(0.25)) g.push(box(bw * 0.5, 0.03, d * 0.5, { color: PAL.gold, x: x + bw / 2, y: y + bh * 0.7, z: 0.08 }));
      x += bw + 0.012;
    }
  }
  return meshOf(g, MATS.body);
}

export function floatingBooks(count = 6, o = {}) {
  const grp = new THREE.Group();
  const rand = o.rand || rng;
  const items = [];
  const colors = [0x7a2a2a, 0x2a4a6a, 0x4a5a2a, 0x3a2a4a];
  for (let i = 0; i < count; i++) {
    const m = meshOf([
      box(0.34, 0.06, 0.26, { color: colors[i % colors.length] }),
      box(0.3, 0.04, 0.24, { color: 0xd8cbb0, y: 0.04 }),
      box(0.05, 0.05, 0.26, { color: PAL.gold, x: -0.16, y: 0.01 }),
    ], MATS.body);
    const orbit = rand.range(1.2, 3.0);
    const speed = rand.range(0.2, 0.5) * (rand.chance(0.5) ? 1 : -1);
    const yBase = rand.range(1.6, 3.4);
    const phase = rand.range(0, TAU);
    items.push({ m, orbit, speed, yBase, phase, tilt: rand.range(-0.4, 0.4) });
    grp.add(m);
  }
  grp.userData.update = (t) => {
    for (const it of items) {
      const a = it.phase + t * it.speed;
      it.m.position.set(Math.cos(a) * it.orbit, it.yBase + Math.sin(t * 0.8 + it.phase) * 0.2, Math.sin(a) * it.orbit);
      it.m.rotation.set(it.tilt, -a + Math.PI / 2, Math.sin(t * 1.4 + it.phase) * 0.15);
    }
  };
  return grp;
}

export function candle(o = {}) {
  const grp = new THREE.Group();
  const h = o.height ?? 0.4;
  grp.add(meshOf([
    cyl(0.05, 0.055, h, 6, { color: 0xe8e0c8, y: h / 2 }),
    cyl(0.09, 0.1, 0.03, 6, { color: PAL.gold, y: 0.015 }),
  ], MATS.body));
  const flame = meshOf([
    cone(0.035, 0.11, 5, { color: 0xffd479, y: h + 0.05, grad: 0 }),
    sphere(0.022, 4, { color: 0xffffff, y: h + 0.02, grad: 0 }),
  ], MATS.glow, { castShadow: false });
  grp.add(flame);
  grp.userData.update = (t) => {
    const f = 1 + Math.sin(t * 11 + (o.phase || 0)) * 0.15;
    flame.scale.set(f * 0.9, f, f * 0.9);
  };
  return grp;
}

export function alchemyTable(o = {}) {
  const grp = new THREE.Group();
  const wood = 0x4a3524;
  const g = [
    box(2.6, 0.12, 1.2, { color: wood, y: 0.9 }),
    box(0.16, 0.9, 0.16, { color: shadeOf(wood, 0.8), x: 1.2, z: 0.5, y: 0.45 }),
    box(0.16, 0.9, 0.16, { color: shadeOf(wood, 0.8), x: -1.2, z: 0.5, y: 0.45 }),
    box(0.16, 0.9, 0.16, { color: shadeOf(wood, 0.8), x: 1.2, z: -0.5, y: 0.45 }),
    box(0.16, 0.9, 0.16, { color: shadeOf(wood, 0.8), x: -1.2, z: -0.5, y: 0.45 }),
    box(2.4, 0.3, 0.1, { color: shadeOf(wood, 0.7), y: 0.35, z: -0.5 }),
  ];
  grp.add(meshOf(g, MATS.body));

  // glassware
  const glass = [];
  const liquids = [];
  const cols = [0x8fbf4a, 0xc5362b, 0x5aa6d8, 0x9a6fe0, 0xe8823a];
  for (let i = 0; i < 5; i++) {
    const x = -1.0 + i * 0.5;
    glass.push(sphere(0.13, 8, { color: 0x9ab8c0, x, y: 1.06 }));
    glass.push(cyl(0.04, 0.05, 0.14, 6, { color: 0x9ab8c0, x, y: 1.23 }));
    liquids.push(sphere(0.1, 7, { color: cols[i], x, y: 1.03, grad: 0 }));
  }
  grp.add(meshOf(glass, MATS.body, { castShadow: false }));
  const liq = meshOf(liquids, MATS.glow, { castShadow: false });
  grp.add(liq);

  // cauldron
  const cauldron = meshOf([
    cyl(0.42, 0.34, 0.5, 10, { color: 0x2a2a30, x: 1.8, y: 0.45 }),
    torus(0.43, 0.04, { color: PAL.ironDark, x: 1.8, y: 0.68, rx: Math.PI / 2, rseg: 4, tseg: 12 }),
    cyl(0.36, 0.36, 0.04, 10, { color: 0x6fbf5a, x: 1.8, y: 0.66, grad: 0 }),
  ], MATS.body);
  grp.add(cauldron);

  grp.userData.bubbleAt = new THREE.Vector3(1.8, 0.7, 0);
  grp.userData.update = (t) => {
    liq.position.y = Math.sin(t * 1.6) * 0.008;
    liq.scale.setScalar(1 + Math.sin(t * 2.2) * 0.02);
  };
  return grp;
}

export function pedestal(o = {}) {
  const c = o.color ?? PAL.stone;
  const h = o.height ?? 1.1;
  return meshOf([
    cyl(0.5, 0.58, 0.14, 8, { color: shadeOf(c, 0.9), y: 0.07 }),
    cyl(0.3, 0.34, h - 0.28, 8, { color: c, y: h / 2 }),
    cyl(0.44, 0.36, 0.16, 8, { color: shadeOf(c, 1.12), y: h - 0.06 }),
  ], MATS.body);
}

export function armorStand(o = {}) {
  const metal = o.metal ?? PAL.iron;
  const g = [
    cyl(0.32, 0.36, 0.1, 8, { color: PAL.woodDark, y: 0.05 }),
    cyl(0.05, 0.06, 1.3, 6, { color: PAL.woodDark, y: 0.65 }),
    taperBox(0.5, 0.6, 0.3, 0.88, { color: metal, y: 1.42 }),
    box(0.56, 0.08, 0.34, { color: shadeOf(metal, 1.15), y: 1.7 }),
    sphere(0.17, 8, { color: metal, x: 0.3, y: 1.66, sy: 0.8 }),
    sphere(0.17, 8, { color: metal, x: -0.3, y: 1.66, sy: 0.8 }),
    cyl(0.17, 0.2, 0.28, 8, { color: metal, y: 1.92 }),
    box(0.34, 0.04, 0.06, { color: 0x14161c, y: 1.94, z: 0.19, grad: 0 }),
  ];
  return meshOf(g, MATS.body);
}

export function weaponRack(o = {}) {
  const wood = 0x4a3524;
  const g = [
    box(2.2, 0.1, 0.5, { color: wood, y: 0.08 }),
    box(2.2, 0.1, 0.5, { color: wood, y: 1.5 }),
    box(0.1, 1.6, 0.5, { color: wood, x: 1.05, y: 0.8 }),
    box(0.1, 1.6, 0.5, { color: wood, x: -1.05, y: 0.8 }),
  ];
  const rand = o.rand || rng;
  for (let i = 0; i < 5; i++) {
    const x = -0.8 + i * 0.4;
    const t = rand.int(0, 2);
    if (t === 0) {
      g.push(cyl(0.03, 0.035, 1.9, 5, { color: PAL.woodDark, x, y: 0.95, rz: rand.range(-0.06, 0.06) }));
      g.push(cone(0.06, 0.28, 4, { color: PAL.steel, x, y: 1.95 }));
    } else if (t === 1) {
      g.push(taperBox(0.09, 1.1, 0.03, 0.2, { color: PAL.steel, x, y: 1.0 }));
      g.push(box(0.3, 0.05, 0.06, { color: PAL.iron, x, y: 0.4 }));
      g.push(cyl(0.035, 0.04, 0.24, 5, { color: PAL.woodDark, x, y: 0.26 }));
    } else {
      g.push(cyl(0.035, 0.04, 1.0, 5, { color: PAL.woodDark, x, y: 0.55 }));
      g.push(shape([[0, 0], [0.3, 0.12], [0.36, 0], [0.3, -0.2], [0, -0.14]], 0.06, { color: PAL.steel, x: x + 0.1, y: 1.0 }));
    }
  }
  return meshOf(g, MATS.body);
}

/* ==========================================================================
   THE FORGE
   ========================================================================== */

export function anvil(o = {}) {
  const c = o.color ?? 0x3a3f48;
  return meshOf([
    box(0.7, 0.16, 0.45, { color: shadeOf(c, 0.8), y: 0.08 }),
    box(0.3, 0.42, 0.3, { color: c, y: 0.36 }),
    box(1.1, 0.2, 0.42, { color: shadeOf(c, 1.1), y: 0.66 }),
    cone(0.16, 0.42, 6, { color: shadeOf(c, 1.1), x: 0.72, y: 0.66, rz: -Math.PI / 2 }),
    box(0.4, 0.24, 0.42, { color: c, x: -0.62, y: 0.68 }),
  ], MATS.body);
}

export function forgeHearth(o = {}) {
  const grp = new THREE.Group();
  const stone = o.color ?? 0x4a4038;
  grp.add(meshOf([
    box(3.0, 1.1, 1.6, { color: stone, y: 0.55 }),
    box(3.2, 0.2, 1.8, { color: shadeOf(stone, 1.15), y: 1.1 }),
    box(2.0, 1.6, 0.4, { color: shadeOf(stone, 0.9), y: 2.0, z: -0.6 }),
    cyl(0.5, 0.65, 3.0, 8, { color: shadeOf(stone, 0.95), y: 3.4, z: -0.6 }),
    box(1.6, 0.7, 0.3, { color: 0x1a1512, y: 0.8, z: 0.7, grad: 0 }),
  ], MATS.body));

  const coals = meshOf([
    box(1.5, 0.12, 0.9, { color: 0xff6a2a, y: 0.96, grad: 0 }),
    sphere(0.16, 6, { color: 0xffd479, x: -0.3, y: 1.0, grad: 0 }),
    sphere(0.14, 6, { color: 0xff8a3a, x: 0.35, y: 1.0, grad: 0 }),
  ], MATS.glow, { castShadow: false });
  grp.add(coals);
  grp.userData.lightAt = new THREE.Vector3(0, 1.3, 0.2);
  grp.userData.emberAt = new THREE.Vector3(0, 1.1, 0.1);
  grp.userData.update = (t) => {
    const f = 1 + Math.sin(t * 5.1) * 0.09 + Math.sin(t * 13) * 0.05;
    coals.scale.set(1, f, 1);
  };
  return grp;
}

export function quenchTrough(o = {}) {
  const grp = new THREE.Group();
  grp.add(meshOf([
    box(1.6, 0.6, 0.8, { color: PAL.woodDark, y: 0.3 }),
    box(1.7, 0.08, 0.9, { color: shadeOf(PAL.woodDark, 1.2), y: 0.6 }),
  ], MATS.body));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), MATS.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.54;
  grp.add(water);
  return grp;
}

/* ==========================================================================
   MARKET & CAMP
   ========================================================================== */

export function marketStall(o = {}) {
  const c = o.color ?? 0x8a3a3a;
  const wood = 0x5a4530;
  const g = [
    box(2.6, 0.12, 1.2, { color: wood, y: 0.95 }),
    box(0.12, 0.95, 0.12, { color: wood, x: 1.2, z: 0.5, y: 0.48 }),
    box(0.12, 0.95, 0.12, { color: wood, x: -1.2, z: 0.5, y: 0.48 }),
    box(0.12, 2.3, 0.12, { color: wood, x: 1.2, z: -0.5, y: 1.15 }),
    box(0.12, 2.3, 0.12, { color: wood, x: -1.2, z: -0.5, y: 1.15 }),
    box(0.12, 2.3, 0.12, { color: wood, x: 1.2, z: 0.5, y: 1.15 }),
    box(0.12, 2.3, 0.12, { color: wood, x: -1.2, z: 0.5, y: 1.15 }),
  ];
  // striped awning
  for (let i = 0; i < 6; i++)
    g.push(box(0.46, 0.06, 1.5, { color: i % 2 ? c : PAL.cloth, x: -1.15 + i * 0.46, y: 2.34, z: 0.1, rx: -0.14 }));
  // goods
  const rand = o.rand || rng;
  for (let i = 0; i < 6; i++) {
    const x = -1.0 + i * 0.4;
    if (rand.chance(0.5)) g.push(sphere(0.11, 6, { color: rand.pick([0xc5362b, 0xd9a441, 0x5fa25a]), x, y: 1.12, z: rand.range(-0.2, 0.2) }));
    else g.push(box(0.2, 0.2, 0.2, { color: rand.pick([0x6a5a3a, 0x4a4a52]), x, y: 1.11, z: rand.range(-0.2, 0.2), ry: rand.range(0, 1) }));
  }
  return meshOf(g, MATS.body);
}

export function crate(o = {}) {
  const c = o.color ?? PAL.woodDark;
  const s = o.size ?? 0.7;
  return meshOf([
    box(s, s, s, { color: c, y: s / 2 }),
    box(s * 1.04, 0.06, s * 0.16, { color: shadeOf(c, 1.2), y: s * 0.75 }),
    box(s * 1.04, 0.06, s * 0.16, { color: shadeOf(c, 1.2), y: s * 0.25 }),
    box(s * 0.16, 0.06, s * 1.04, { color: shadeOf(c, 1.2), y: s * 0.75 }),
  ], MATS.body);
}

export function barrel(o = {}) {
  const c = o.color ?? PAL.woodDark;
  return meshOf([
    cyl(0.28, 0.32, 0.9, 9, { color: c, y: 0.45 }),
    torus(0.31, 0.035, { color: PAL.iron, y: 0.2, rx: Math.PI / 2, rseg: 4, tseg: 12 }),
    torus(0.29, 0.035, { color: PAL.iron, y: 0.7, rx: Math.PI / 2, rseg: 4, tseg: 12 }),
    cyl(0.26, 0.26, 0.04, 9, { color: shadeOf(c, 1.2), y: 0.91 }),
  ], MATS.body);
}

export function trainingDummy(o = {}) {
  return meshOf([
    cyl(0.3, 0.34, 0.12, 8, { color: PAL.stone, y: 0.06 }),
    cyl(0.07, 0.08, 1.0, 6, { color: PAL.woodDark, y: 0.5 }),
    cyl(0.26, 0.3, 0.8, 8, { color: 0xb8a070, y: 1.35 }),
    box(1.3, 0.12, 0.12, { color: PAL.woodDark, y: 1.55 }),
    sphere(0.17, 7, { color: 0xc8b080, y: 1.9 }),
    torus(0.28, 0.03, { color: 0x8a6a3a, y: 1.5, rx: Math.PI / 2, rseg: 4, tseg: 10 }),
    torus(0.28, 0.03, { color: 0x8a6a3a, y: 1.2, rx: Math.PI / 2, rseg: 4, tseg: 10 }),
  ], MATS.body);
}

export function warTable(o = {}) {
  const grp = new THREE.Group();
  const wood = 0x4a3524;
  grp.add(meshOf([
    cyl(1.6, 1.6, 0.14, 12, { color: wood, y: 0.92 }),
    torus(1.6, 0.07, { color: PAL.gold, y: 0.97, rx: Math.PI / 2, rseg: 4, tseg: 20 }),
    cyl(0.3, 0.5, 0.9, 8, { color: shadeOf(wood, 0.82), y: 0.45 }),
    cyl(0.8, 0.9, 0.12, 10, { color: shadeOf(wood, 0.75), y: 0.06 }),
    cyl(1.42, 1.42, 0.02, 12, { color: 0xd8c8a0, y: 1.0 }),   // the map itself
  ], MATS.body));

  // pieces on the map
  const pieces = [];
  const rand = o.rand || rng;
  for (let i = 0; i < 7; i++) {
    const a = rand.range(0, TAU), d = rand.range(0.3, 1.2);
    pieces.push(cone(0.07, 0.22, 5, {
      color: i % 3 === 0 ? PAL.teamEnemy : PAL.teamPlayer,
      x: Math.cos(a) * d, z: Math.sin(a) * d, y: 1.12,
    }));
  }
  grp.add(meshOf(pieces, MATS.body));
  return grp;
}

/* ==========================================================================
   BATTLEFIELD STRUCTURES
   ========================================================================== */

export function battleBanner(team, hp01 = 1, o = {}) {
  const grp = new THREE.Group();
  const c = team === 1 ? PAL.teamEnemy : PAL.teamPlayer;
  const acc = team === 1 ? 0xe08b7f : PAL.gold;
  const stone = PAL.stone;

  grp.add(meshOf([
    cyl(2.3, 2.7, 0.7, 10, { color: shadeOf(stone, 0.9), y: 0.35 }),
    cyl(1.9, 2.1, 0.5, 10, { color: stone, y: 0.9 }),
    cyl(1.4, 1.5, 0.4, 10, { color: shadeOf(stone, 1.1), y: 1.3 }),
    cyl(0.16, 0.2, 5.0, 8, { color: PAL.woodDark, y: 3.9 }),
    cone(0.26, 0.7, 6, { color: acc, y: 6.6 }),
  ], MATS.body));

  // four corner braziers
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.78;
    const b = brazier();
    b.position.set(Math.cos(a) * 2.5, 0.6, Math.sin(a) * 2.5);
    b.scale.setScalar(0.8);
    grp.add(b);
  }

  const cloth = meshOf([
    banner(2.2, 3.4, { color: c }),
    banner(1.9, 0.4, { color: acc, y: 1.3 }),
    banner(1.9, 0.4, { color: acc, y: -1.3 }),
  ], MATS.cloth);
  cloth.position.set(1.1, 4.3, 0);
  grp.add(cloth);
  grp.userData.cloth = cloth;
  grp.userData.update = (t) => { cloth.rotation.y = Math.sin(t * 1.2) * 0.14; };
  return grp;
}

export function battleTower(team, o = {}) {
  const grp = new THREE.Group();
  const c = team === 1 ? PAL.teamEnemy : PAL.teamPlayer;
  const stone = PAL.stone;
  grp.add(meshOf([
    cyl(1.3, 1.6, 4.6, 9, { color: stone, y: 2.3 }),
    cyl(1.75, 1.75, 0.28, 9, { color: shadeOf(stone, 1.12), y: 4.6 }),
    ...Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * TAU;
      return box(0.5, 0.5, 0.42, { color: shadeOf(stone, 1.06), x: Math.cos(a) * 1.55, z: Math.sin(a) * 1.55, y: 4.95, ry: -a });
    }),
    box(0.16, 0.7, 0.2, { color: 0x14161c, z: 1.55, y: 3.0, grad: 0 }),
    cyl(0.06, 0.06, 1.6, 5, { color: PAL.woodDark, y: 5.9 }),
  ], MATS.body));
  const flag = meshOf([banner(0.7, 0.5, { color: c })], MATS.cloth);
  flag.position.set(0.36, 6.4, 0);
  grp.add(flag);
  grp.userData.update = (t) => { flag.rotation.y = Math.sin(t * 2) * 0.2; };
  return grp;
}

export function controlPoint(o = {}) {
  const grp = new THREE.Group();
  const stone = PAL.stone;
  grp.add(meshOf([
    cyl(2.6, 3.0, 0.24, 14, { color: shadeOf(stone, 0.88), y: 0.12 }),
    cyl(1.4, 1.6, 0.3, 10, { color: stone, y: 0.34 }),
    cyl(0.28, 0.34, 2.4, 8, { color: shadeOf(stone, 1.06), y: 1.6 }),
    sphere(0.4, 10, { color: shadeOf(stone, 1.12), y: 2.95 }),
  ], MATS.body));

  const orb = meshOf([sphere(0.3, 10, { color: 0xcccccc, y: 2.95, grad: 0 })], MATS.glow, { castShadow: false });
  grp.add(orb);
  const ringMesh = new THREE.Mesh(
    ring(2.6, 3.0, 36, { color: 0xffffff, rx: -Math.PI / 2, grad: 0 }),
    MATS.emissive(0x8a8a8a, 0.5).clone());
  ringMesh.material.transparent = true;
  ringMesh.position.y = 0.26;
  ringMesh.renderOrder = 3;
  grp.add(ringMesh);

  grp.userData.orb = orb;
  grp.userData.ring = ringMesh;
  grp.userData.setOwner = (team, progress) => {
    const col = team === 0 ? 0x5fbaf0 : team === 1 ? 0xe05a4a : 0x8a8a8a;
    orb.material = MATS.glow;
    orb.geometry.attributes.color.array.fill(0);
    const c = new THREE.Color(col);
    const arr = orb.geometry.attributes.color.array;
    for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
    orb.geometry.attributes.color.needsUpdate = true;
    ringMesh.material.color.set(col);
    ringMesh.material.opacity = 0.25 + progress * 0.5;
  };
  grp.userData.update = (t) => {
    orb.position.y = 2.95 + Math.sin(t * 1.6) * 0.1;
    orb.rotation.y += 0.01;
    ringMesh.rotation.z += 0.004;
  };
  return grp;
}

export function totem(o = {}) {
  const c = o.color ?? 0x5a4a3a;
  const grp = new THREE.Group();
  grp.add(meshOf([
    cyl(0.4, 0.5, 0.3, 7, { color: shadeOf(c, 0.85), y: 0.15 }),
    cyl(0.3, 0.34, 2.6, 7, { color: c, y: 1.5 }),
    box(1.2, 0.14, 0.14, { color: c, y: 2.4, rz: 0.2 }),
    sphere(0.3, 8, { color: 0xd8d0b8, y: 2.9 }),
    cone(0.1, 0.3, 4, { color: 0xd8d0b8, x: 0.62, y: 2.5 }),
    cone(0.1, 0.3, 4, { color: 0xd8d0b8, x: -0.62, y: 2.3 }),
  ], MATS.body));
  const eyes = meshOf([
    sphere(0.07, 5, { color: o.glow ?? 0x8fbf4a, x: 0.12, y: 2.94, z: 0.24, grad: 0 }),
    sphere(0.07, 5, { color: o.glow ?? 0x8fbf4a, x: -0.12, y: 2.94, z: 0.24, grad: 0 }),
  ], MATS.glow, { castShadow: false });
  grp.add(eyes);
  grp.userData.update = (t) => { eyes.scale.setScalar(1 + Math.sin(t * 3) * 0.14); };
  return grp;
}

export function pylon(o = {}) {
  const grp = new THREE.Group();
  const c = o.color ?? 0x7a7a68;
  const gl = o.glow ?? 0xffd479;
  grp.add(meshOf([
    cyl(0.9, 1.1, 0.4, 8, { color: shadeOf(c, 0.88), y: 0.2 }),
    cyl(0.5, 0.62, 3.2, 6, { color: c, y: 1.9 }),
    cone(0.5, 0.9, 6, { color: shadeOf(c, 1.1), y: 3.9 }),
  ], MATS.body));
  const core = meshOf([
    sphere(0.36, 10, { color: gl, y: 3.5, grad: 0 }),
    torus(0.62, 0.05, { color: gl, y: 3.5, rx: Math.PI / 2, rseg: 4, tseg: 16, grad: 0 }),
  ], MATS.glow, { castShadow: false });
  grp.add(core);
  grp.userData.core = core;
  grp.userData.update = (t) => { core.rotation.y += 0.012; core.scale.setScalar(1 + Math.sin(t * 2) * 0.06); };
  return grp;
}

export function bridge(len, w, o = {}) {
  const wood = o.color ?? PAL.woodDark;
  const g = [];
  const planks = Math.floor(len / 0.6);
  for (let i = 0; i < planks; i++)
    g.push(box(w, 0.14, 0.52, { color: shadeOf(wood, 0.88 + (i % 3) * 0.08), z: -len / 2 + (i + 0.5) * (len / planks), y: 0.1 }));
  g.push(box(0.2, 0.3, len, { color: shadeOf(wood, 0.8), x: w / 2 - 0.1, y: 0.05 }));
  g.push(box(0.2, 0.3, len, { color: shadeOf(wood, 0.8), x: -w / 2 + 0.1, y: 0.05 }));
  const posts = Math.floor(len / 3);
  for (let i = 0; i <= posts; i++) {
    const z = -len / 2 + i * (len / posts);
    g.push(box(0.16, 1.0, 0.16, { color: wood, x: w / 2 - 0.1, z, y: 0.5 }));
    g.push(box(0.16, 1.0, 0.16, { color: wood, x: -w / 2 + 0.1, z, y: 0.5 }));
  }
  g.push(box(0.1, 0.1, len, { color: shadeOf(wood, 1.1), x: w / 2 - 0.1, y: 1.0 }));
  g.push(box(0.1, 0.1, len, { color: shadeOf(wood, 1.1), x: -w / 2 + 0.1, y: 1.0 }));
  return meshOf(g, MATS.body);
}

export function ruinPillar(o = {}) {
  const c = o.color ?? PAL.stone;
  const h = o.height ?? 3.5;
  const broken = o.broken ?? true;
  const g = [
    cyl(0.44, 0.52, 0.22, 10, { color: shadeOf(c, 0.9), y: 0.11 }),
    cyl(0.34, 0.38, h, 10, { color: c, y: h / 2 + 0.2 }),
  ];
  if (!broken) {
    g.push(cyl(0.46, 0.4, 0.24, 10, { color: shadeOf(c, 1.12), y: h + 0.32 }));
    g.push(box(1.0, 0.2, 1.0, { color: shadeOf(c, 1.06), y: h + 0.54 }));
  } else {
    g.push(rock(0.4, { color: shadeOf(c, 0.94), y: h + 0.3, jitter: 0.5, rand: () => (o.rand || rng)() }));
  }
  for (let i = 0; i < 3; i++) g.push(torus(0.36, 0.03, { color: shadeOf(c, 0.84), y: 0.6 + i * (h / 3), rx: Math.PI / 2, rseg: 4, tseg: 12 }));
  return meshOf(g, MATS.body);
}

export function gravestone(o = {}) {
  const c = o.color ?? shadeOf(PAL.stone, 0.86);
  const r = o.rand || rng;
  return meshOf([
    box(0.5, 0.7, 0.12, { color: c, y: 0.35, rz: r.range(-0.12, 0.12) }),
    cyl(0.25, 0.25, 0.14, 8, { color: c, y: 0.7, rx: Math.PI / 2, sz: 0.85 }),
    box(0.6, 0.08, 0.3, { color: shadeOf(c, 0.9), y: 0.04 }),
  ], MATS.body);
}

/* ==========================================================================
   MISC
   ========================================================================== */

export function torch(o = {}) {
  const grp = new THREE.Group();
  grp.add(meshOf([
    cyl(0.05, 0.06, 0.8, 5, { color: PAL.woodDark, y: 0.4 }),
    cyl(0.1, 0.07, 0.16, 6, { color: PAL.ironDark, y: 0.86 }),
  ], MATS.body));
  const flame = meshOf([
    cone(0.12, 0.34, 6, { color: 0xffb04a, y: 1.05, grad: 0 }),
    cone(0.07, 0.2, 5, { color: 0xffe9a8, y: 1.0, grad: 0 }),
  ], MATS.glow, { castShadow: false });
  grp.add(flame);
  grp.userData.lightAt = new THREE.Vector3(0, 1.05, 0);
  grp.userData.update = (t) => {
    const f = 1 + Math.sin(t * 9 + (o.phase || 0)) * 0.14 + Math.sin(t * 21) * 0.06;
    flame.scale.set(f * 0.92, f, f * 0.92);
  };
  return grp;
}

/* ==========================================================================
   THE WAY OUT

   Every interior in the game uses the SAME exit. That is the point: once a
   player has left the Library through one of these, they recognise the Forge's
   from across the room without being told.

   Four things carry the read, and all four are needed:
     1. A doorway far wider and taller than any other opening in the room.
     2. Daylight in it. Interiors are warm and dim; the exit is a cold bright
        rectangle, which the eye goes to on its own.
     3. The keep's blue-and-gold banner over the lintel, only ever used here.
     4. A lit runner on the floor pointing at it.
*/
export function exitArch(o = {}) {
  const w = o.width ?? 5.4;
  const h = o.height ?? 5.2;
  const stone = o.stone ?? PAL.stoneLight;
  const g = new THREE.Group();

  const jambW = 0.9;
  g.add(meshOf([
    // jambs, stepped so they catch the light
    box(jambW, h, 1.2, { color: stone, x: -(w / 2 + jambW / 2), y: h / 2 }),
    box(jambW, h, 1.2, { color: stone, x: (w / 2 + jambW / 2), y: h / 2 }),
    box(jambW * 1.3, 0.5, 1.5, { color: shadeOf(stone, 1.1), x: -(w / 2 + jambW / 2), y: h - 0.25 }),
    box(jambW * 1.3, 0.5, 1.5, { color: shadeOf(stone, 1.1), x: (w / 2 + jambW / 2), y: h - 0.25 }),
    // lintel
    box(w + jambW * 2.6, 0.8, 1.4, { color: shadeOf(stone, 1.06), y: h + 0.4 }),
    box(w + jambW * 3.2, 0.34, 1.7, { color: shadeOf(stone, 1.18), y: h + 0.95 }),
    // a shallow arch of voussoirs inside the opening
    ...Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI * (0.08 + (i / 8) * 0.84);
      return box(0.62, 0.42, 1.25, {
        color: shadeOf(stone, 0.94 + (i % 2) * 0.12),
        x: -Math.cos(a) * (w / 2 + 0.1), y: h - 0.3 + Math.sin(a) * 0.55,
        rz: -(a - Math.PI / 2) * 0.6,
      });
    }),
  ], MATS.body));

  /* daylight. A bright, cold, untonemapped plane filling the opening —
     unmistakable against a warm interior, and it costs one quad. */
  const day = meshOf([plane(w, h - 0.3, { color: o.dayColor ?? 0xcfe2f2, y: (h - 0.3) / 2, z: -0.55, grad: 0 })],
    MATS.glow, { castShadow: false });
  day.renderOrder = -2;
  g.add(day);
  // a softer bloom lip just inside, so the edge is not a hard cut
  const halo = meshOf([plane(w + 1.6, h + 1.0, { color: 0xbcd6ec, y: h / 2, z: -0.35, grad: 0 })],
    MATS.additive, { castShadow: false });
  halo.material = MATS.emissive(0xbcd6ec, 0.22);
  halo.renderOrder = -1;
  g.add(halo);

  /* the keep's banner — used nowhere else, so it means exactly one thing */
  const ban = meshOf([
    banner(1.5, 2.3, { color: PAL.teamPlayer, phase: 0.6 }),
  ], MATS.cloth, { castShadow: false });
  ban.position.set(0, h - 0.4, 0.75);
  g.add(ban);
  g.add(meshOf([
    box(1.7, 0.12, 0.12, { color: PAL.gold, y: h + 0.75, z: 0.75 }),
    // a simple keep sigil: three merlons over a bar
    box(0.9, 0.14, 0.05, { color: PAL.goldLight, y: h - 1.0, z: 0.80 }),
    box(0.2, 0.3, 0.05, { color: PAL.goldLight, x: -0.32, y: h - 0.78, z: 0.80 }),
    box(0.2, 0.3, 0.05, { color: PAL.goldLight, y: h - 0.78, z: 0.80 }),
    box(0.2, 0.3, 0.05, { color: PAL.goldLight, x: 0.32, y: h - 0.78, z: 0.80 }),
  ], MATS.body));

  g.userData.update = (t) => { ban.rotation.z = Math.sin(t * 1.1) * 0.03; };
  return g;
}

/** The lit runner that points at an exit. `len` runs along -Z from the door. */
export function exitRunner(len = 12, o = {}) {
  const w = o.width ?? 2.6;
  const g = [];
  const n = Math.max(3, Math.round(len / 2));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    g.push(box(w * (0.7 + t * 0.3), 0.03, 1.1, {
      color: shadeOf(o.color ?? 0x8a6a2a, 0.8 + t * 0.55),
      y: 0.03, z: -len + t * len,
    }));
  }
  const m = meshOf(g, MATS.terrain, { castShadow: false });
  m.receiveShadow = true;
  return m;
}

export function chest(o = {}) {
  const wood = o.color ?? 0x5a4530;
  return meshOf([
    box(0.9, 0.5, 0.6, { color: wood, y: 0.25 }),
    cyl(0.3, 0.3, 0.9, 10, { color: shadeOf(wood, 1.1), y: 0.5, rz: Math.PI / 2, sz: 0.66 }),
    box(0.94, 0.06, 0.12, { color: PAL.gold, y: 0.5 }),
    box(0.12, 0.6, 0.64, { color: PAL.gold, y: 0.3 }),
    box(0.16, 0.16, 0.08, { color: PAL.goldLight, y: 0.34, z: 0.32 }),
  ], MATS.body);
}

export function waterPlane(w, d, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 10, 10), MATS.water.clone());
  m.rotation.x = -Math.PI / 2;
  m.position.y = o.y ?? -0.3;
  m.receiveShadow = true;
  const pos = m.geometry.attributes.position;
  const base = Float32Array.from(pos.array);
  m.userData.update = (t) => {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      pos.setZ(i, Math.sin(x * 0.3 + t * 1.2) * 0.09 + Math.cos(y * 0.4 + t * 0.9) * 0.07);
    }
    pos.needsUpdate = true;
  };
  return m;
}

/** Register a prop's `update` with a scene-level ticker list. */
export function collectAnimated(root, out = []) {
  root.traverse(o => { if (o.userData && o.userData.update) out.push(o); });
  return out;
}
