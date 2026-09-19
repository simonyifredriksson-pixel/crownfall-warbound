/* Palette.js — the game's colour language and the shared material cache.

   Two rules keep the look coherent:
     1. Nothing in the world is pure white except a specular highlight on metal.
     2. Team identity is carried by TRIM and GLOW, never by the whole model —
        so a Knight still reads as a knight when the enemy fields one.

   Materials are cached and shared. Because every geometry carries vertex
   colours, almost the entire scene draws with four materials.
*/

import * as THREE from '../../lib/three.module.js';

export const PAL = {
  /* world */
  grassLight: 0x6f8a52, grassDark: 0x4e6640, grassDry: 0x8a8a52,
  dirt: 0x6a5641, dirtDark: 0x4a3c2c, sand: 0xa89268, ash: 0x4a4644,
  stone: 0x7c7f86, stoneDark: 0x52555c, stoneLight: 0x9aa0a8,
  wood: 0x6a5232, woodDark: 0x483722, woodLight: 0x8a6c44,
  water: 0x2f5a72, waterDeep: 0x1c3a4c,
  snow: 0xd8e2ea, ice: 0x9fd4e4,
  cloth: 0xd8cbb0, clothDark: 0x9a8a6a,

  /* metals */
  iron: 0x8d95a3, ironDark: 0x5a626e, steel: 0xb4bcc8, gold: 0xd9a441,
  goldLight: 0xffe9a8, goldDark: 0x8a5f18, copper: 0xb87333, silver: 0xd8e0e8,

  /* signals */
  blood: 0xc5362b, ember: 0xe8823a, arcane: 0x9a6fe0, frost: 0x79cfe0,
  poison: 0x8fbf4a, holy: 0xf3d98a, shadow: 0x7a4fa0, moss: 0x5fa25a,
  sky: 0x5aa6d8,

  /* teams */
  teamPlayer: 0x2f5f8f, teamPlayerGlow: 0x7fb6e8,
  teamEnemy: 0x8e3229, teamEnemyGlow: 0xe08b7f,
  neutral: 0x8a8a8a,
};

/* Per-region atmosphere. Drives sky, fog, light colour and ground tint. */
export const ATMOS = {
  keep: {
    sky: [0x9fc4e0, 0x5a86b4, 0x2a3f5c], fog: 0x7a95b0, fogNear: 40, fogFar: 180,
    sun: 0xfff2d8, sunI: 1.15, amb: 0x6a7f9a, ambI: 0.55,
    ground: PAL.grassLight, accent: PAL.gold, sunAngle: [0.6, 0.9],
  },
  greenmarch: {
    sky: [0xa8cce4, 0x6d9ac0, 0x3a5a76], fog: 0x8aa8bc, fogNear: 46, fogFar: 190,
    sun: 0xfff0d0, sunI: 1.2, amb: 0x708a9a, ambI: 0.55,
    ground: PAL.grassLight, accent: PAL.moss, sunAngle: [0.7, 1.1],
  },
  blackbriar: {
    sky: [0x8a9aa0, 0x5e6e74, 0x333c42], fog: 0x6a767c, fogNear: 26, fogFar: 120,
    sun: 0xd8dcd0, sunI: 0.78, amb: 0x5a6668, ambI: 0.62,
    ground: 0x5a6446, accent: 0x7a8a5a, sunAngle: [0.45, 2.2],
  },
  ashenwaste: {
    sky: [0xd4a070, 0xa8663c, 0x4a2a20], fog: 0x9a6a48, fogNear: 30, fogFar: 150,
    sun: 0xffc088, sunI: 1.25, amb: 0x8a5a44, ambI: 0.5,
    ground: 0x5a4a3e, accent: PAL.ember, sunAngle: [0.35, 0.4],
  },
  hollowmere: {
    sky: [0x5a6a80, 0x38445a, 0x1a2030], fog: 0x46526a, fogNear: 22, fogFar: 110,
    sun: 0xb8cce0, sunI: 0.62, amb: 0x4a5a72, ambI: 0.7,
    ground: 0x4a5250, accent: PAL.frost, sunAngle: [0.9, 3.4],
  },
  stormspire: {
    sky: [0x6a5a86, 0x3c2f56, 0x181428], fog: 0x453a60, fogNear: 26, fogFar: 140,
    sun: 0xc0a8e0, sunI: 0.85, amb: 0x54486e, ambI: 0.66,
    ground: 0x565068, accent: PAL.arcane, sunAngle: [0.7, 4.1],
  },
  /* Interiors.

     These carry a whole room on the ambient term plus a handful of point
     lights, and getting them wrong is what made the Library and the Forge
     unplayable. Two rules learned the hard way:

       1. `ambI` is a FLOOR, not a mood. Below about 1.4 the flat-shaded
          undersides of shelves and anvils go to solid black and the room
          reads as a hole. Atmosphere comes from the COLOUR difference
          between ambient and key light, not from making everything dark.
       2. Fog indoors must be far enough back to reach the far wall. At
          fogFar 56 the end of the Forge was fog, not wall.

     Each interior is deliberately two-temperature: a cool ambient with a warm
     key (Forge) or a warm ambient with a cool key (Library). That contrast is
     what makes a room look lit rather than tinted. */
  library: {
    sky: [0x4c4470, 0x332b4c, 0x1e1932], fog: 0x3b3358, fogNear: 26, fogFar: 96,
    sun: 0xdfe8ff, sunI: 1.05, amb: 0xa294cc, ambI: 1.62,
    ground: 0x5a4a38, accent: PAL.arcane, sunAngle: [1.0, 2.0], indoor: true,
  },
  forge: {
    sky: [0x5d4640, 0x3c2a24, 0x241a16], fog: 0x4e3a2e, fogNear: 22, fogFar: 78,
    sun: 0xffd2a0, sunI: 0.95, amb: 0x8a6a56, ambI: 1.55,
    ground: 0x51493f, accent: PAL.ember, sunAngle: [1.0, 1.2], indoor: true,
  },
};

/* ==========================================================================
   MATERIAL CACHE
   ========================================================================== */

class MaterialLibrary {
  constructor() { this.cache = new Map(); }

  /** The workhorse: vertex-coloured, lit, shadow-casting. */
  get body() {
    return this._get('body', () => new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
    }));
  }

  /** Smooth-shaded variant for organic shapes (beasts, cloth, terrain). */
  get smooth() {
    return this._get('smooth', () => new THREE.MeshLambertMaterial({ vertexColors: true }));
  }

  /** Metal — a little shinier, used sparingly so gold reads as gold. */
  get metal() {
    return this._get('metal', () => new THREE.MeshPhongMaterial({
      vertexColors: true, flatShading: true, shininess: 58, specular: 0x556070,
    }));
  }

  /** Self-lit parts: runes, eyes, magic. Never receives shadow. */
  get glow() {
    return this._get('glow', () => new THREE.MeshBasicMaterial({
      vertexColors: true, toneMapped: false,
    }));
  }

  /** Additive sprites and beams. */
  get additive() {
    return this._get('additive', () => new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }));
  }

  /** Flat translucent, for ground decals and deploy zones. */
  get decal() {
    return this._get('decal', () => new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.55,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
  }

  /** Cloth — double-sided so banners and capes are not one-sided. */
  get cloth() {
    return this._get('cloth', () => new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide,
    }));
  }

  /** Terrain: smooth vertex colours, receives shadow, never casts. */
  get terrain() {
    return this._get('terrain', () => new THREE.MeshLambertMaterial({ vertexColors: true }));
  }

  /** Water: translucent, faintly reflective-looking. */
  get water() {
    return this._get('water', () => new THREE.MeshPhongMaterial({
      color: PAL.water, transparent: true, opacity: 0.74, shininess: 96,
      specular: 0x88bbdd, flatShading: false,
    }));
  }

  /** A solid colour, cached per hex — for the handful of one-off parts. */
  solid(hex, opts = {}) {
    const key = 'solid' + hex + (opts.emissive ? 'e' : '') + (opts.transparent ? 't' : '');
    return this._get(key, () => new THREE.MeshLambertMaterial({
      color: hex, flatShading: true,
      emissive: opts.emissive ? hex : 0x000000,
      emissiveIntensity: opts.emissive || 0,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
    }));
  }

  /** A glowing colour used for lights, auras and status rings. */
  emissive(hex, opacity = 1) {
    const key = 'emis' + hex + opacity;
    return this._get(key, () => new THREE.MeshBasicMaterial({
      color: hex, transparent: opacity < 1, opacity, toneMapped: false,
      blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: opacity >= 1,
    }));
  }

  _get(key, make) {
    let m = this.cache.get(key);
    if (!m) { m = make(); this.cache.set(key, m); }
    return m;
  }

  disposeAll() {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}

export const MATS = new MaterialLibrary();

/* ==========================================================================
   RARITY + TYPE COLOURS (shared with the CSS custom properties)
   ========================================================================== */

export const RARITY_HEX = {
  common: 0x9aa3af, uncommon: 0x5fa25a, rare: 0x4f8fd4,
  epic: 0x9a6fe0, legendary: 0xe0a02e, mythic: 0xe0455f,
};

export const DMGTYPE_HEX = {
  slash: 0xe4e8ef, pierce: 0xc9d6a8, blunt: 0xc8a98a, arcane: 0x9a6fe0,
  fire: 0xe8823a, frost: 0x79cfe0, poison: 0x8fbf4a, holy: 0xf3d98a, shadow: 0xb07fd0,
};

export const STATUS_HEX = {
  burning: 0xe8823a, poisoned: 0x8fbf4a, bleeding: 0xc5362b, slowed: 0x79cfe0,
  frozen: 0xa8e6f0, stunned: 0xf3d98a, rooted: 0x5fa25a, feared: 0xb07fd0,
  taunted: 0xe08b7f, silenced: 0x9a6fe0, marked: 0xe8823a, oiled: 0x8a6f3a,
  sundered: 0xc8a98a, cursed: 0x7a4fa0, shielded: 0x5aa6d8, braced: 0x8d95a3,
  enraged: 0xc5362b, blessed: 0xf3d98a, hastened: 0xffd479, rallied: 0xd9a441,
  stealthed: 0x6a5a96, regenerating: 0x5fa25a, phased: 0x9a6fe0,
  fortified: 0x8d95a3, empowered: 0x9a6fe0, channeling: 0xd9a441, knockedback: 0xc8a98a,
};

/** Tier tint: higher-level cards get warmer, richer trim. */
export const TIER_TRIM = [0x8a8f98, 0xb0b8c4, 0xd9a441, 0xffd479, 0xffe9a8];

/** Aura colour by tier — only tier 3+ get a visible aura ring. */
export const TIER_AURA = [null, null, null, 0xd9a441, 0xffe9a8];
