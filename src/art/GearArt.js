/* GearArt.js — weapons, shields and helmets, built from primitives.

   Everything here returns an ARRAY OF GEOMETRIES in local space so the caller
   can merge them into whatever mesh they belong to. Conventions:

     WEAPONS  grip at the origin, blade running along +Y, edge facing +X.
     SHIELDS  centred at the origin, face pointing -Z (away from the body).
     HELMS    centred on the head, +Y up, face pointing +Z.

   The same functions dress a Knight card and the player's commander, so a
   sword looks like the same object in both places.
*/

import { box, taperBox, cyl, sphere, cone, torus, shape, ring, merge } from './Geo.js';
import { PAL } from './Palette.js';

/* ==========================================================================
   WEAPONS
   ========================================================================== */

export const WEAPON_BUILDERS = {

  sword(v = {}) {
    const blade = v.blade ?? PAL.steel, hilt = v.hilt ?? PAL.woodDark, guard = v.guard ?? PAL.iron;
    const L = v.length ?? 1.05;
    const g = [
      // grip
      cyl(0.045, 0.05, 0.26, 6, { color: hilt, y: -0.05 }),
      // pommel
      sphere(0.065, 6, { color: guard, y: -0.2 }),
      // crossguard
      box(0.42, 0.055, 0.075, { color: guard, y: 0.1 }),
      // blade
      taperBox(0.11, L, 0.035, 0.22, { color: blade, y: 0.1 + L / 2 }),
    ];
    if (v.fuller) g.push(box(0.028, L * 0.82, 0.05, { color: shadeOf(blade, 0.78), y: 0.1 + L / 2 }));
    if (v.runes) g.push(box(0.03, L * 0.6, 0.055, { color: v.glow ?? PAL.gold, y: 0.14 + L / 2, grad: 0 }));
    return g;
  },

  shortsword(v = {}) {
    return WEAPON_BUILDERS.sword({ ...v, length: (v.length ?? 0.72) });
  },

  greatsword(v = {}) {
    const blade = v.blade ?? PAL.steel, hilt = v.hilt ?? PAL.woodDark, guard = v.guard ?? PAL.iron;
    const L = v.length ?? 1.7;
    const g = [
      cyl(0.055, 0.06, 0.44, 6, { color: hilt, y: -0.1 }),
      sphere(0.085, 6, { color: guard, y: -0.34 }),
      box(0.62, 0.07, 0.1, { color: guard, y: 0.16 }),
      box(0.1, 0.16, 0.12, { color: guard, y: 0.26 }),          // ricasso block
      taperBox(0.19, L, 0.05, 0.3, { color: blade, y: 0.3 + L / 2 }),
    ];
    if (v.fuller) g.push(box(0.05, L * 0.8, 0.07, { color: shadeOf(blade, 0.78), y: 0.3 + L / 2 }));
    if (v.jagged) {
      for (let i = 0; i < 5; i++)
        g.push(cone(0.06, 0.14, 4, { color: blade, x: 0.1, y: 0.5 + i * (L / 6), rz: -Math.PI / 2 }));
    }
    if (v.runes) g.push(box(0.045, L * 0.62, 0.075, { color: v.glow ?? PAL.gold, y: 0.34 + L / 2, grad: 0 }));
    return g;
  },

  sunsword(v = {}) {
    const g = WEAPON_BUILDERS.sword({ ...v, length: v.length ?? 1.32, fuller: true, runes: true });
    // radiant crossguard wings
    g.push(shape([[0, 0], [0.34, 0.1], [0.42, 0.26], [0.16, 0.2], [0, 0.34], [-0.16, 0.2], [-0.42, 0.26], [-0.34, 0.1]], 0.04,
      { color: v.glow ?? PAL.goldLight, y: 0.14, grad: 0 }));
    return g;
  },

  axe(v = {}) {
    const blade = v.blade ?? PAL.steel, hilt = v.hilt ?? PAL.woodDark;
    const L = v.length ?? 1.0;
    const g = [
      cyl(0.04, 0.045, L, 6, { color: hilt, y: L / 2 - 0.15 }),
      // head: crescent
      shape([[0, 0], [0.36, 0.14], [0.44, 0.0], [0.36, -0.22], [0, -0.16]], 0.07,
        { color: blade, y: L - 0.24, x: 0.1 }),
      box(0.09, 0.2, 0.09, { color: shadeOf(blade, 0.8), y: L - 0.2 }),
    ];
    if (v.jagged) g.push(cone(0.05, 0.16, 4, { color: blade, y: L + 0.02 }));
    if (v.glow) g.push(box(0.02, 0.22, 0.09, { color: v.glow, x: 0.26, y: L - 0.22, grad: 0 }));
    return g;
  },

  greataxe(v = {}) {
    const blade = v.blade ?? PAL.steel, hilt = v.hilt ?? PAL.woodDark;
    const L = v.length ?? 1.5;
    return [
      cyl(0.055, 0.06, L, 6, { color: hilt, y: L / 2 - 0.2 }),
      shape([[0, 0], [0.5, 0.2], [0.6, 0], [0.5, -0.3], [0, -0.24]], 0.09, { color: blade, y: L - 0.34, x: 0.16 }),
      shape([[0, 0], [-0.5, 0.2], [-0.6, 0], [-0.5, -0.3], [0, -0.24]], 0.09, { color: blade, y: L - 0.34, x: -0.16 }),
      box(0.1, 0.4, 0.1, { color: shadeOf(blade, 0.78), y: L - 0.3 }),
      cone(0.06, 0.2, 5, { color: blade, y: L + 0.02 }),
    ];
  },

  twinaxes(v = {}) {
    const a = WEAPON_BUILDERS.axe({ ...v, length: 0.7 });
    return a;   // the second is mirrored onto the off-hand by the caller
  },

  twinblades(v = {}) {
    return WEAPON_BUILDERS.dagger({ ...v, length: v.length ?? 0.62 });
  },

  dagger(v = {}) {
    const blade = v.blade ?? PAL.steel, hilt = v.hilt ?? 0x2a2a35;
    const L = v.length ?? 0.5;
    const g = [
      cyl(0.035, 0.04, 0.16, 6, { color: hilt, y: -0.02 }),
      box(0.16, 0.035, 0.05, { color: hilt, y: 0.07 }),
      taperBox(0.07, L, 0.026, 0.1, { color: blade, y: 0.07 + L / 2 }),
    ];
    if (v.glow) g.push(box(0.018, L * 0.7, 0.04, { color: v.glow, y: 0.1 + L / 2, grad: 0 }));
    return g;
  },

  mace(v = {}) {
    const head = v.head ?? v.blade ?? PAL.iron, hilt = v.hilt ?? PAL.woodDark;
    const L = v.length ?? 0.85;
    const g = [
      cyl(0.04, 0.045, L, 6, { color: hilt, y: L / 2 - 0.12 }),
      sphere(0.15, 8, { color: head, y: L - 0.1 }),
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.push(cone(0.045, 0.1, 4, { color: head, x: Math.cos(a) * 0.15, z: Math.sin(a) * 0.15, y: L - 0.1, rz: -Math.cos(a) * 1.5, rx: Math.sin(a) * 1.5 }));
    }
    return g;
  },

  hammer(v = {}) {
    const head = v.head ?? PAL.iron, hilt = v.hilt ?? PAL.woodDark;
    const L = v.length ?? 1.2;
    const g = [
      cyl(0.05, 0.055, L, 6, { color: hilt, y: L / 2 - 0.16 }),
      box(0.34, 0.26, 0.26, { color: head, y: L - 0.14 }),
      box(0.06, 0.3, 0.3, { color: shadeOf(head, 0.8), x: 0.19, y: L - 0.14 }),
      box(0.06, 0.3, 0.3, { color: shadeOf(head, 0.8), x: -0.19, y: L - 0.14 }),
    ];
    if (v.runes) g.push(box(0.36, 0.06, 0.28, { color: v.glow ?? PAL.gold, y: L - 0.14, grad: 0 }));
    return g;
  },

  club(v = {}) {
    const c = v.blade ?? v.primary ?? PAL.woodDark;
    const L = v.length ?? 1.4;
    const g = [
      cyl(0.09, 0.17, L, 7, { color: c, y: L / 2 - 0.2 }),
    ];
    for (let i = 0; i < 5; i++) {
      const a = i * 2.1;
      g.push(cone(0.05, 0.13, 4, { color: PAL.ironDark, x: Math.cos(a) * 0.15, z: Math.sin(a) * 0.15, y: L - 0.42 + i * 0.1, rz: -Math.cos(a) * 1.5, rx: Math.sin(a) * 1.5 }));
    }
    return g;
  },

  spear(v = {}) {
    const head = v.head ?? PAL.steel, shaft = v.shaft ?? PAL.woodDark;
    const L = v.length ?? 2.2;
    const g = [
      cyl(0.035, 0.038, L, 6, { color: shaft, y: L / 2 - 0.5 }),
      cone(0.07, 0.34, 4, { color: head, y: L - 0.34 }),
      box(0.1, 0.05, 0.05, { color: head, y: L - 0.5 }),
    ];
    if (v.glow) g.push(cone(0.045, 0.2, 4, { color: v.glow, y: L - 0.32, grad: 0 }));
    return g;
  },

  pike(v = {}) { return WEAPON_BUILDERS.spear({ ...v, length: v.length ?? 2.9 }); },
  lance(v = {}) {
    const head = v.head ?? PAL.steel, shaft = v.shaft ?? PAL.woodDark;
    const L = v.length ?? 2.6;
    return [
      cyl(0.045, 0.07, L, 6, { color: shaft, y: L / 2 - 0.6 }),
      cone(0.1, 0.44, 6, { color: head, y: L - 0.4 }),
      cone(0.13, 0.2, 6, { color: v.accent ?? PAL.gold, y: L - 0.86, ry: 0.4 }),
    ];
  },

  bow(v = {}) {
    const w = v.wood ?? PAL.woodDark, s = v.string ?? PAL.cloth;
    const L = v.length ?? 1.1;
    const g = [];
    const seg = 7;
    for (let i = 0; i < seg; i++) {
      const t = i / (seg - 1) - 0.5;
      const y = t * L * 1.6;
      const x = Math.cos(t * 2.0) * 0.2 - 0.1;
      g.push(box(0.05, L * 1.6 / seg + 0.02, 0.05, { color: w, x, y, rz: -t * 0.5 }));
    }
    g.push(box(0.012, L * 1.55, 0.012, { color: s, x: -0.1 }));
    if (v.glow) g.push(box(0.02, L * 1.5, 0.02, { color: v.glow, x: -0.1, grad: 0 }));
    return g;
  },

  longbow(v = {}) { return WEAPON_BUILDERS.bow({ ...v, length: v.length ?? 1.4 }); },

  crossbow(v = {}) {
    const w = v.wood ?? PAL.woodDark, m = v.blade ?? PAL.iron;
    return [
      box(0.09, 0.09, 0.62, { color: w, z: 0.1 }),           // stock
      box(0.74, 0.05, 0.06, { color: m, z: 0.34, rz: 0.06 }), // prod
      box(0.012, 0.012, 0.6, { color: PAL.cloth, z: 0.2 }),   // string track
      box(0.14, 0.05, 0.12, { color: m, z: -0.14 }),          // lock
    ];
  },

  staff(v = {}) {
    const sh = v.shaft ?? PAL.woodDark, gem = v.gem ?? v.glow ?? PAL.arcane;
    const L = v.length ?? 1.7;
    const g = [
      cyl(0.04, 0.05, L, 7, { color: sh, y: L / 2 - 0.5 }),
      torus(0.13, 0.026, { color: sh, y: L - 0.44, rx: Math.PI / 2, rseg: 5, tseg: 10 }),
      sphere(0.1, 8, { color: gem, y: L - 0.44, grad: 0 }),
    ];
    if (v.runes) for (let i = 0; i < 3; i++) g.push(box(0.055, 0.055, 0.055, { color: gem, y: L - 0.9 - i * 0.2, grad: 0 }));
    return g;
  },

  archstaff(v = {}) {
    const sh = v.shaft ?? 0x2a2438, gem = v.gem ?? v.glow ?? PAL.arcane;
    const L = v.length ?? 1.95;
    const g = [
      cyl(0.045, 0.055, L, 7, { color: sh, y: L / 2 - 0.55 }),
    ];
    // a claw of four prongs holding the gem
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.push(box(0.04, 0.42, 0.04, {
        color: sh, x: Math.cos(a) * 0.14, z: Math.sin(a) * 0.14, y: L - 0.5,
        rz: -Math.cos(a) * 0.45, rx: Math.sin(a) * 0.45,
      }));
    }
    g.push(sphere(0.15, 10, { color: gem, y: L - 0.28, grad: 0 }));
    g.push(torus(0.24, 0.02, { color: gem, y: L - 0.28, rx: Math.PI / 2, rseg: 4, tseg: 14, grad: 0 }));
    g.push(torus(0.2, 0.018, { color: gem, y: L - 0.28, rx: 0.6, rz: 0.4, rseg: 4, tseg: 14, grad: 0 }));
    return g;
  },

  scythe(v = {}) {
    const blade = v.blade ?? PAL.steel, sh = v.hilt ?? 0x14151b;
    const L = v.length ?? 1.9;
    const g = [
      cyl(0.04, 0.045, L, 6, { color: sh, y: L / 2 - 0.5 }),
      shape([[0, 0], [0.9, 0.18], [1.0, -0.02], [0.85, -0.16], [0.3, -0.14], [0, -0.08]], 0.035,
        { color: blade, y: L - 0.5, x: 0.4 }),
    ];
    if (v.glow) g.push(shape([[0, 0], [0.86, 0.14], [0.9, 0.04], [0.3, -0.04], [0, -0.02]], 0.02,
      { color: v.glow, y: L - 0.48, x: 0.4, grad: 0 }));
    return g;
  },

  banner(v = {}) {
    const sh = v.shaft ?? PAL.woodDark, cl = v.accent ?? PAL.gold;
    const L = v.length ?? 2.1;
    return [
      cyl(0.035, 0.04, L, 6, { color: sh, y: L / 2 - 0.5 }),
      cone(0.07, 0.24, 5, { color: cl, y: L - 0.4 }),
      box(0.5, 0.72, 0.02, { color: cl, x: 0.26, y: L - 0.95 }),
      box(0.42, 0.06, 0.03, { color: v.primary ?? PAL.teamPlayer, x: 0.26, y: L - 0.72 }),
      box(0.42, 0.06, 0.03, { color: v.primary ?? PAL.teamPlayer, x: 0.26, y: L - 1.18 }),
    ];
  },

  keg(v = {}) {
    return [
      cyl(0.19, 0.19, 0.34, 8, { color: PAL.woodDark, y: 0.1 }),
      torus(0.2, 0.025, { color: PAL.iron, y: 0.02, rx: Math.PI / 2, rseg: 4, tseg: 10 }),
      torus(0.2, 0.025, { color: PAL.iron, y: 0.2, rx: Math.PI / 2, rseg: 4, tseg: 10 }),
      cyl(0.02, 0.02, 0.16, 4, { color: 0x2a2a2a, y: 0.34 }),
      sphere(0.04, 5, { color: v.glow ?? PAL.ember, y: 0.42, grad: 0 }),
    ];
  },

  flask(v = {}) {
    const c = v.glow ?? PAL.ember;
    return [
      sphere(0.13, 8, { color: 0x6a7a6a, y: 0.05 }),
      cyl(0.05, 0.06, 0.12, 6, { color: 0x6a7a6a, y: 0.19 }),
      sphere(0.1, 7, { color: c, y: 0.03, grad: 0 }),
    ];
  },

  censer(v = {}) {
    const m = v.blade ?? PAL.gold, c = v.glow ?? PAL.holy;
    return [
      cyl(0.012, 0.012, 0.7, 4, { color: m, y: 0.35 }),
      sphere(0.12, 8, { color: m, y: -0.02 }),
      torus(0.13, 0.02, { color: m, y: 0.04, rx: Math.PI / 2, rseg: 4, tseg: 10 }),
      sphere(0.07, 6, { color: c, y: -0.02, grad: 0 }),
    ];
  },
};

/** Build a weapon mesh-geometry array by name, with sensible fallbacks. */
export function buildWeapon(name, v = {}) {
  const fn = WEAPON_BUILDERS[name];
  if (!fn) return WEAPON_BUILDERS.sword(v);
  return fn(v);
}

/* ==========================================================================
   SHIELDS
   ========================================================================== */

export const SHIELD_BUILDERS = {
  round(v = {}) {
    const face = v.face ?? PAL.woodLight, boss = v.boss ?? PAL.iron;
    return [
      cyl(0.34, 0.34, 0.06, 12, { color: face, rx: Math.PI / 2 }),
      torus(0.34, 0.03, { color: v.trim ?? boss, rseg: 4, tseg: 16 }),
      sphere(0.08, 7, { color: boss, z: -0.05 }),
    ];
  },
  kite(v = {}) {
    const face = v.face ?? PAL.teamPlayer, boss = v.boss ?? PAL.iron;
    return [
      shape([[-0.26, 0.38], [0.26, 0.38], [0.3, -0.04], [0, -0.48], [-0.3, -0.04]], 0.06, { color: face }),
      shape([[-0.22, 0.32], [0.22, 0.32], [0.25, -0.02], [0, -0.4], [-0.25, -0.02]], 0.02, { color: v.trim ?? boss, z: -0.045 }),
      sphere(0.07, 6, { color: boss, z: -0.06, y: 0.08 }),
    ];
  },
  tower(v = {}) {
    const face = v.face ?? 0x4a5260, boss = v.boss ?? PAL.gold;
    const g = [
      box(0.62, 1.05, 0.08, { color: face }),
      box(0.66, 0.06, 0.1, { color: v.trim ?? boss, y: 0.45 }),
      box(0.66, 0.06, 0.1, { color: v.trim ?? boss, y: -0.45 }),
      box(0.09, 0.98, 0.1, { color: v.trim ?? boss }),
      sphere(0.08, 6, { color: boss, z: -0.07 }),
    ];
    if (v.glow) g.push(box(0.4, 0.5, 0.02, { color: v.glow, z: -0.06, grad: 0 }));
    return g;
  },
  sigil(v = {}) {
    const c = v.face ?? 0x3a2a4a, gl = v.glow ?? PAL.arcane;
    return [
      torus(0.28, 0.04, { color: c, rseg: 5, tseg: 16 }),
      torus(0.18, 0.03, { color: c, rseg: 4, tseg: 12, rz: 0.5 }),
      sphere(0.09, 8, { color: gl, grad: 0 }),
      box(0.5, 0.05, 0.03, { color: gl, grad: 0, rz: 0.6 }),
      box(0.5, 0.05, 0.03, { color: gl, grad: 0, rz: -0.6 }),
    ];
  },
};

export function buildShield(name, v = {}) {
  const fn = SHIELD_BUILDERS[name] || SHIELD_BUILDERS.round;
  return fn(v);
}

/* ==========================================================================
   HELMETS  (origin = centre of the head)
   ========================================================================== */

export const HELM_BUILDERS = {
  cap(v = {}) {
    return [cyl(0.16, 0.19, 0.12, 8, { color: v.metal ?? PAL.iron, y: 0.11 })];
  },
  kettle(v = {}) {
    const m = v.metal ?? PAL.iron;
    return [
      cyl(0.16, 0.2, 0.14, 8, { color: m, y: 0.1 }),
      cyl(0.32, 0.32, 0.035, 10, { color: m, y: 0.06 }),
    ];
  },
  hood(v = {}) {
    const c = v.cloth ?? v.metal ?? PAL.clothDark;
    return [
      sphere(0.23, 8, { color: c, y: 0.04, sy: 1.1 }),
      cone(0.24, 0.3, 7, { color: c, y: 0.18 }),
      box(0.3, 0.16, 0.06, { color: 0x14161c, z: 0.19, y: 0.0, grad: 0 }),  // shadowed face
    ];
  },
  great(v = {}) {
    const m = v.metal ?? PAL.iron, t = v.trim ?? PAL.ironDark;
    const g = [
      cyl(0.19, 0.22, 0.3, 8, { color: m, y: 0.06 }),
      cyl(0.2, 0.19, 0.08, 8, { color: t, y: 0.22 }),
      box(0.36, 0.045, 0.06, { color: 0x14161c, z: 0.2, y: 0.05, grad: 0 }),   // eye slit
      box(0.05, 0.16, 0.06, { color: 0x14161c, z: 0.2, y: -0.04, grad: 0 }),   // breath slot
    ];
    if (v.plume) {
      g.push(box(0.05, 0.26, 0.05, { color: v.plume, y: 0.34 }));
      g.push(box(0.04, 0.18, 0.18, { color: v.plume, y: 0.36, z: -0.06 }));
    }
    return g;
  },
  winged(v = {}) {
    const g = HELM_BUILDERS.great(v);
    const m = v.trim ?? v.metal ?? PAL.gold;
    g.push(shape([[0, 0], [0.3, 0.16], [0.36, 0.02], [0.1, -0.06]], 0.02, { color: m, x: 0.24, y: 0.14, ry: 0.3 }));
    g.push(shape([[0, 0], [-0.3, 0.16], [-0.36, 0.02], [-0.1, -0.06]], 0.02, { color: m, x: -0.24, y: 0.14, ry: -0.3 }));
    return g;
  },
  horned(v = {}) {
    const g = HELM_BUILDERS.great(v);
    const h = v.trim ?? 0xd8d0b8;
    g.push(cone(0.06, 0.34, 5, { color: h, x: 0.2, y: 0.2, rz: -0.9 }));
    g.push(cone(0.06, 0.34, 5, { color: h, x: -0.2, y: 0.2, rz: 0.9 }));
    return g;
  },
  crown(v = {}) {
    const m = v.metal ?? PAL.goldLight, t = v.trim ?? PAL.gold;
    const g = [
      cyl(0.21, 0.21, 0.09, 10, { color: t, y: 0.2 }),
    ];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.push(cone(0.045, 0.18 + (i % 2 ? 0.06 : 0), 4, { color: m, x: Math.cos(a) * 0.2, z: Math.sin(a) * 0.2, y: 0.32 }));
    }
    if (v.glow) g.push(sphere(0.05, 6, { color: v.glow, y: 0.26, z: 0.2, grad: 0 }));
    return g;
  },
  crownhelm(v = {}) {
    const g = HELM_BUILDERS.great(v);
    return g.concat(HELM_BUILDERS.crown({ metal: v.trim ?? PAL.gold, trim: v.metal, glow: v.glow }));
  },
  circlet(v = {}) {
    const m = v.metal ?? PAL.goldLight;
    const g = [torus(0.21, 0.022, { color: m, y: 0.16, rx: Math.PI / 2, rseg: 4, tseg: 16 })];
    if (v.glow) {
      g.push(sphere(0.055, 7, { color: v.glow, y: 0.16, z: 0.21, grad: 0 }));
      for (let i = 0; i < 3; i++) {
        const a = 0.9 + i * 0.7;
        g.push(sphere(0.03, 5, { color: v.glow, x: Math.cos(a) * 0.3, y: 0.3 + i * 0.05, z: Math.sin(a) * 0.3, grad: 0 }));
      }
    }
    return g;
  },
  skull(v = {}) {
    const c = 0xd8d0b8;
    return [
      sphere(0.2, 9, { color: c, y: 0.04 }),
      box(0.22, 0.12, 0.16, { color: c, y: -0.1, z: 0.06 }),
      sphere(0.05, 5, { color: 0x0a0a12, x: 0.08, y: 0.06, z: 0.16, grad: 0 }),
      sphere(0.05, 5, { color: 0x0a0a12, x: -0.08, y: 0.06, z: 0.16, grad: 0 }),
      ...(v.glow ? [
        sphere(0.035, 5, { color: v.glow, x: 0.08, y: 0.06, z: 0.18, grad: 0 }),
        sphere(0.035, 5, { color: v.glow, x: -0.08, y: 0.06, z: 0.18, grad: 0 }),
      ] : []),
    ];
  },
  scale(v = {}) {
    const m = v.metal ?? 0xc8a860;
    const g = [cyl(0.18, 0.21, 0.26, 8, { color: m, y: 0.06 })];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.push(cone(0.04, 0.12, 4, { color: v.trim ?? m, x: Math.cos(a) * 0.19, z: Math.sin(a) * 0.19, y: 0.16, rz: -Math.cos(a) * 0.6, rx: Math.sin(a) * 0.6 }));
    }
    g.push(box(0.34, 0.04, 0.06, { color: 0x14161c, z: 0.19, y: 0.05, grad: 0 }));
    return g;
  },
  plate(v = {}) { return HELM_BUILDERS.great(v); },
};

export function buildHelm(name, v = {}) {
  const fn = HELM_BUILDERS[name];
  if (!fn) return [];
  return fn(v);
}

/* ==========================================================================
   ARMOUR PIECES — worn on the torso/limbs, used by CommanderArt
   ========================================================================== */

export function chestPlate(style, v = {}) {
  const m = v.metal ?? PAL.iron, t = v.trim ?? PAL.ironDark;
  switch (style) {
    case 'plate':
      return [
        taperBox(0.56, 0.62, 0.36, 0.86, { color: m, y: 0.0 }),
        box(0.6, 0.08, 0.38, { color: t, y: 0.26 }),
        box(0.1, 0.5, 0.38, { color: t }),
        ...(v.tabard ? [box(0.28, 0.66, 0.02, { color: v.tabard, z: 0.2, y: -0.16 })] : []),
      ];
    case 'scale': {
      const g = [taperBox(0.54, 0.6, 0.34, 0.88, { color: m })];
      for (let r = 0; r < 4; r++) for (let c = -1; c <= 1; c++)
        g.push(box(0.16, 0.1, 0.03, { color: r % 2 ? t : m, x: c * 0.17, y: 0.22 - r * 0.15, z: 0.18, rx: -0.2 }));
      return g;
    }
    case 'jerkin':
      return [
        taperBox(0.5, 0.58, 0.3, 0.9, { color: v.cloth ?? PAL.woodDark }),
        box(0.54, 0.05, 0.32, { color: t, y: -0.2 }),
        box(0.08, 0.5, 0.32, { color: t }),
      ];
    case 'coat':
      return [
        taperBox(0.5, 0.6, 0.3, 0.92, { color: v.cloth ?? 0x3a4a34 }),
        box(0.44, 0.5, 0.06, { color: v.trim ?? 0x7a5a2a, z: 0.17, y: -0.1 }),
        box(0.56, 0.05, 0.32, { color: v.trim ?? 0x7a5a2a, y: -0.22 }),
      ];
    case 'robe':
      return [
        taperBox(0.46, 0.6, 0.3, 1.0, { color: v.cloth ?? 0x3b3f7a }),
        cyl(0.22, 0.44, 0.7, 8, { color: v.cloth ?? 0x3b3f7a, y: -0.6 }),
        box(0.12, 0.62, 0.04, { color: v.trim ?? PAL.arcane, z: 0.17 }),
      ];
    default:
      return [taperBox(0.5, 0.58, 0.3, 0.9, { color: m })];
  }
}

/**
 * Shoulder armour. Positioned in TORSO-LOCAL space: the caller passes the
 * shoulder anchor it actually used for the arms, so the pauldron always sits
 * on the joint instead of floating above it.
 */
export function pauldrons(style, v = {}) {
  const m = v.metal ?? PAL.iron, t = v.trim ?? PAL.ironDark;
  if (style === 'none') return [];
  const big = style === 'plate' || style === 'scale';
  const x = v.x ?? 0.34;
  const y = v.y ?? 0.22;
  const r = (big ? 0.155 : 0.115) * (v.scale ?? 1);
  const out = [
    sphere(r, 8, { color: m, x, y, sy: 0.7 }),
    sphere(r, 8, { color: m, x: -x, y, sy: 0.7 }),
  ];
  if (big) {
    // a thin cap that follows the curve rather than a slab across the top
    out.push(sphere(r * 1.04, 8, { color: t, x, y: y + r * 0.34, sy: 0.24 }));
    out.push(sphere(r * 1.04, 8, { color: t, x: -x, y: y + r * 0.34, sy: 0.24 }));
  }
  return out;
}

export function greaves(style, v = {}) {
  const m = v.metal ?? v.cloth ?? PAL.iron;
  if (style === 'shoe') return [box(0.16, 0.08, 0.26, { color: m, y: -0.9, z: 0.04 })];
  if (style === 'boot') return [
    box(0.17, 0.3, 0.19, { color: m, y: -0.72 }),
    box(0.18, 0.1, 0.3, { color: m, y: -0.88, z: 0.06 }),
  ];
  return [
    box(0.19, 0.36, 0.21, { color: m, y: -0.7 }),
    box(0.2, 0.12, 0.32, { color: m, y: -0.9, z: 0.07 }),
    box(0.21, 0.06, 0.23, { color: v.trim ?? m, y: -0.52 }),
  ];
}

export function bracers(style, v = {}) {
  const m = v.metal ?? v.cloth ?? PAL.iron;
  return [
    cyl(0.1, 0.11, 0.24, 7, { color: m, y: -0.16 }),
    ...(style === 'plate' || style === 'scale' ? [box(0.22, 0.08, 0.2, { color: v.trim ?? m, y: -0.05 })] : []),
  ];
}

/* ---------------------------------------------------------------- helpers */

function shadeOf(hex, f) {
  const r = ((hex >> 16) & 255) * f, g = ((hex >> 8) & 255) * f, b = (hex & 255) * f;
  return (Math.min(255, r | 0) << 16) | (Math.min(255, g | 0) << 8) | Math.min(255, b | 0);
}

export { shadeOf };
