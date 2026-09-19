/* UnitArt.js — procedural models for every unit in the game.

   A unit is a RIG: a handful of merged meshes on a small skeleton of Groups,
   animated procedurally. No skinning, no keyframes, no asset files.

     root                (world position; y = ground)
     └ pivot             (yaw — the unit's facing)
       ├ body            merged torso + head + helm + pauldrons + cape mount
       ├ armR ─ weapon   swings for attacks
       ├ armL ─ shield
       ├ legR, legL      walk cycle
       ├ glow            emissive bits (eyes, runes, gems) — no shadow
       └ aura            tier 3+ ground ring

   LEVEL PROGRESSION IS VISIBLE. `tier` (0–4, one per three card levels) adds,
   in order: better trim → pauldrons and a plume → a cape and glowing runes →
   a ground aura and a second light. A level-15 Knight is unmistakably the
   same knight, and unmistakably a veteran.
*/

import * as THREE from '../../lib/three.module.js';
import { box, taperBox, cyl, sphere, cone, torus, shape, ring, banner, merge, meshOf, transformed, mirrorX } from './Geo.js';
import { PAL, MATS, TIER_TRIM, TIER_AURA, RARITY_HEX } from './Palette.js';
import { buildWeapon, buildShield, buildHelm, chestPlate, pauldrons, greaves, bracers, shadeOf } from './GearArt.js';
import { TAU } from '../core/Util.js';

/* ==========================================================================
   TIER STYLING — the single place "upgrades look like something" is decided
   ========================================================================== */

export function tierStyle(tier, art = {}) {
  const t = Math.max(0, Math.min(4, tier | 0));
  return {
    tier: t,
    trim: art.tierTrim || TIER_TRIM[t],
    pauldrons: t >= 1,
    plume: t >= 1 ? (art.accent ?? PAL.gold) : null,
    cape: t >= 2 ? (art.cape ?? art.accent ?? null) : (art.cape ?? null),
    runes: t >= 2,
    aura: TIER_AURA[t],
    glowScale: 1 + t * 0.22,
    detail: t,
  };
}

/* ==========================================================================
   THE RIG
   ========================================================================== */

export class UnitRig {
  constructor() {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    this.parts = {};
    this.height = 1.8;
    this.radius = 0.4;
    this.phase = Math.random() * TAU;
    this.bob = 0;
    this._armAttack = 0;
    this._walk = 0;
    this._state = 'idle';
  }

  add(name, obj, parent) {
    (parent || this.pivot).add(obj);
    this.parts[name] = obj;
    return obj;
  }

  /**
   * Procedural animation. Called every frame by the battle renderer.
   * @param dt      seconds
   * @param s       { moving:0..1, attacking:0..1 (0=idle,1=swing peak),
   *                  casting:bool, dead:number 0..1, hurt:0..1, speed }
   */
  update(dt, s) {
    const p = this.parts;
    this.phase += dt;

    /* --- death: fall over and sink ------------------------------------ */
    if (s.dead > 0) {
      const d = Math.min(1, s.dead);
      this.pivot.rotation.x = -d * 1.5;
      this.pivot.position.y = -d * 0.35;
      this.root.scale.setScalar(Math.max(0.01, 1 - d * 0.18));
      if (p.glow) p.glow.visible = d < 0.5;
      return;
    }

    /* --- walk cycle ---------------------------------------------------- */
    const stride = 8.2 * (s.speedFactor || 1);
    this._walk += dt * stride * (0.25 + s.moving * 0.85);
    const swing = Math.sin(this._walk) * (0.24 + s.moving * 0.62);
    const swing2 = Math.sin(this._walk + Math.PI) * (0.24 + s.moving * 0.62);

    if (p.legR) p.legR.rotation.x = swing;
    if (p.legL) p.legL.rotation.x = swing2;

    // torso bob and lean into the run
    const bobAmt = 0.028 + s.moving * 0.05;
    this.bob = Math.abs(Math.sin(this._walk)) * bobAmt;
    if (p.body) {
      p.body.position.y = this.bodyY + this.bob;
      p.body.rotation.x = s.moving * 0.12;
      p.body.rotation.z = Math.sin(this._walk) * 0.035 * s.moving;
    }

    /* --- arms ---------------------------------------------------------- */
    const atk = s.attacking || 0;
    // attack overrides swing: wind up back, then chop forward
    const atkCurve = atk < 0.35 ? -(atk / 0.35) * 0.9 : ((atk - 0.35) / 0.65) * 2.3 - 0.9;
    // `restZ` is the arm's natural hang, baked in at build time. The animator
    // adds to it rather than overwriting, or every unit stands to attention.
    if (p.armR) {
      const rest = p.armR.userData.restZ || 0;
      p.armR.rotation.x = atk > 0 ? atkCurve : swing2 * 0.7;
      p.armR.rotation.z = rest + (atk > 0 ? -0.2 - atk * 0.3 : 0);
    }
    if (p.armL) {
      const rest = p.armL.userData.restZ || 0;
      p.armL.rotation.x = atk > 0 ? -atkCurve * 0.25 : swing * 0.7;
      p.armL.rotation.z = rest;
      if (s.blocking) { p.armL.rotation.x = -0.9; p.armL.rotation.y = 0.6; }
      else p.armL.rotation.y = 0;
    }

    /* --- casting: raise both arms, spin the glow ----------------------- */
    if (s.casting) {
      const c = Math.min(1, s.casting);
      if (p.armR) { p.armR.rotation.x = -1.5 - Math.sin(this.phase * 9) * 0.12; p.armR.rotation.z = -0.5 * c; }
      if (p.armL) { p.armL.rotation.x = -1.2 * c; p.armL.rotation.z = 0.4 * c; }
      if (p.glow) p.glow.rotation.y += dt * 4;
    }

    /* --- wings / tails / extras ---------------------------------------- */
    if (p.wingL && p.wingR) {
      // A wing along +X is RAISED by a positive Z rotation, so the two sides
      // need opposite signs — otherwise both wings droop in unison.
      const f = Math.sin(this.phase * (s.moving > 0.3 ? 9 : 3.2));
      const beat = 0.30 + f * 0.55;
      p.wingR.rotation.z = beat;
      p.wingL.rotation.z = -beat;
      p.wingR.rotation.y = -0.12 - f * 0.1;
      p.wingL.rotation.y = 0.12 + f * 0.1;
    }
    if (p.tail) p.tail.rotation.y = Math.sin(this.phase * 2.4) * 0.35;
    if (p.floatY !== undefined) {
      this.pivot.position.y = Math.sin(this.phase * 1.7) * 0.12 + p.floatY;
    }
    if (p.hover) {
      p.hover.rotation.y += dt * 0.9;
      p.hover.position.y = this.height * 0.55 + Math.sin(this.phase * 2.2) * 0.1;
    }
    if (p.aura) {
      p.aura.rotation.z += dt * 0.5;
      const pulse = 0.85 + Math.sin(this.phase * 2.1) * 0.15;
      p.aura.scale.setScalar(pulse);
      p.aura.material.opacity = 0.28 + Math.sin(this.phase * 2.1) * 0.08;
    }
    if (p.cape) {
      p.cape.rotation.x = -0.1 - s.moving * 0.45 - Math.sin(this.phase * 3) * 0.05;
    }

    /* --- hurt flash ----------------------------------------------------- */
    if (s.hurt > 0 && p.body) {
      const k = 1 + s.hurt * 0.12;
      this.pivot.scale.set(k, 1 / (k * 0.5 + 0.5), k);
    } else if (this.pivot.scale.x !== 1) {
      this.pivot.scale.set(1, 1, 1);
    }
  }

  dispose() {
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

/* ==========================================================================
   ARCHETYPE BUILDERS
   ========================================================================== */

/* Proportions.
   `legH` is hip height, `torsoH` is hip-to-shoulder, so the shoulder line is
   always legH + torsoH and the head sits on top of that. Heroic rather than
   realistic: long legs, a compact tapered torso and an oversized head, because
   a readable silhouette at thirty metres beats anatomical correctness. */
const BUILD_PROPS = {
  slim:   { shoulder: 0.26, waistW: 0.34, chestW: 0.44, torsoH: 0.46, legH: 0.76, headR: 0.175, armR: 0.072, legR: 0.10, height: 1.70 },
  medium: { shoulder: 0.30, waistW: 0.40, chestW: 0.54, torsoH: 0.50, legH: 0.80, headR: 0.185, armR: 0.084, legR: 0.115, height: 1.80 },
  heavy:  { shoulder: 0.35, waistW: 0.46, chestW: 0.64, torsoH: 0.52, legH: 0.78, headR: 0.195, armR: 0.100, legR: 0.135, height: 1.86 },
  orc:    { shoulder: 0.40, waistW: 0.52, chestW: 0.74, torsoH: 0.50, legH: 0.70, headR: 0.205, armR: 0.115, legR: 0.150, height: 1.80, hunch: 0.16 },
  goblin: { shoulder: 0.20, waistW: 0.28, chestW: 0.36, torsoH: 0.32, legH: 0.46, headR: 0.170, armR: 0.058, legR: 0.078, height: 1.18, hunch: 0.20 },
  huge:   { shoulder: 0.46, waistW: 0.54, chestW: 0.84, torsoH: 0.74, legH: 1.06, headR: 0.255, armR: 0.150, legR: 0.185, height: 2.45 },
};

/* --------------------------------------------------------------- humanoid */

function buildHumanoid(art, ts, team) {
  const rig = new UnitRig();
  const P = BUILD_PROPS[art.build] || BUILD_PROPS.medium;
  const primary = art.primary ?? PAL.iron;
  const accent = art.accent ?? ts.trim;
  const metal = art.metal ?? PAL.iron;
  const skin = art.skin ?? (art.build === 'orc' ? 0x6a8a4a : art.build === 'goblin' ? 0x7a9a4a : 0xc89b74);

  /* ---- body (merged) ----
     Everything below is in TORSO-LOCAL space: y=0 is the hip, y=torsoH is the
     shoulder line. The whole merged mesh is then lifted to hip height once. */
  const bodyGeo = [];
  const T = P.torsoH;
  const isRobe = !!art.robe;

  if (isRobe) {
    // a robe is one continuous cone from the shoulders to the floor
    bodyGeo.push(cone(P.chestW * 0.62, T, 9, { color: primary, y: T * 0.5 }));
    bodyGeo.push(cyl(P.chestW * 0.62, P.chestW * 1.02, P.legH, 9, { color: shadeOf(primary, 0.92), y: -P.legH * 0.5 }));
    bodyGeo.push(box(P.chestW * 0.2, T * 1.5, 0.05, { color: accent, z: P.chestW * 0.44, y: T * 0.1 }));
  } else {
    // a tapered torso: broad chest, narrow waist. Two stacked boxes give a
    // clear, readable shape at distance without costing a real mesh.
    bodyGeo.push(taperBox(P.waistW, T * 0.45, P.waistW * 0.62, 1.22,
      { color: shadeOf(primary, 0.9), y: T * 0.22 }));
    bodyGeo.push(taperBox(P.chestW, T * 0.58, P.chestW * 0.56, 0.9,
      { color: primary, y: T * 0.72 }));
    // belt
    bodyGeo.push(box(P.waistW * 1.14, T * 0.1, P.waistW * 0.72, { color: shadeOf(accent, 0.8), y: T * 0.42 }));
    bodyGeo.push(box(T * 0.14, T * 0.14, P.waistW * 0.76, { color: accent, y: T * 0.42 }));
    // a tabard down the front once the unit is armoured
    if (ts.tier >= 2) bodyGeo.push(box(P.chestW * 0.34, T * 0.92, 0.03, { color: accent, z: P.chestW * 0.3, y: T * 0.42 }));
    // chest plate detail
    if (!art.bare) {
      bodyGeo.push(box(P.chestW * 0.9, T * 0.1, P.chestW * 0.6, { color: shadeOf(metal, 1.05), y: T * 0.98 }));
    }
  }

  // neck + head, sitting on the shoulder line
  const shoulderY = T;
  bodyGeo.push(cyl(P.headR * 0.42, P.headR * 0.5, P.headR * 0.5, 6, { color: shadeOf(skin, 0.82), y: shoulderY + P.headR * 0.2 }));
  const headY = shoulderY + P.headR * 0.42 + P.headR;
  bodyGeo.push(sphere(P.headR, 9, { color: skin, y: headY, sy: 1.08, sz: 1.04 }));
  // brow shadow: the cheapest thing that makes a head read as a face
  bodyGeo.push(box(P.headR * 1.35, P.headR * 0.22, 0.05, { color: 0x2a2018, y: headY + P.headR * 0.12, z: P.headR * 0.9, grad: 0 }));

  if (art.build === 'orc' || art.build === 'goblin') {
    bodyGeo.push(cone(P.headR * 0.18, P.headR * 0.6, 4, { color: skin, x: P.headR * 0.82, y: headY + P.headR * 0.2, rz: -1.15 }));
    bodyGeo.push(cone(P.headR * 0.18, P.headR * 0.6, 4, { color: skin, x: -P.headR * 0.82, y: headY + P.headR * 0.2, rz: 1.15 }));
    bodyGeo.push(cone(P.headR * 0.13, P.headR * 0.42, 4, { color: 0xe8e0c8, x: P.headR * 0.34, y: headY - P.headR * 0.42, z: P.headR * 0.72 }));
    bodyGeo.push(cone(P.headR * 0.13, P.headR * 0.42, 4, { color: 0xe8e0c8, x: -P.headR * 0.34, y: headY - P.headR * 0.42, z: P.headR * 0.72 }));
  }

  // helm / hood
  const helmName = art.helm || (art.hood ? 'hood' : null);
  if (helmName) {
    bodyGeo.push(...buildHelm(helmName, {
      metal: art.helmMetal ?? metal, trim: ts.trim, cloth: art.primary,
      plume: ts.plume, glow: art.glow,
    }).map(g => transformed(g, { y: headY })));
  }
  if (art.crown) bodyGeo.push(...buildHelm('crown', { metal: PAL.goldLight, trim: ts.trim, glow: art.glow }).map(g => transformed(g, { y: headY })));
  if (art.skull) bodyGeo.push(...buildHelm('skull', { glow: art.glow }).map(g => transformed(g, { y: headY })));

  // Pauldrons appear at tier 1. They are anchored to the SAME shoulder point
  // the arms hang from — passing the anchor in is what stops them floating
  // above the body like a shelf.
  if (ts.pauldrons && !isRobe) {
    bodyGeo.push(...pauldrons(ts.tier >= 2 ? 'plate' : 'light', {
      metal, trim: ts.trim,
      x: P.shoulder, y: shoulderY - P.headR * 0.18,
      scale: P.chestW / 0.5,
    }));
  }

  const body = meshOf(bodyGeo, MATS.body, { name: 'body' });
  rig.bodyY = P.legH;
  body.position.y = rig.bodyY;
  rig.add('body', body);

  /* ---- cape (tier 2+) ---- */
  if (ts.cape) {
    const cape = new THREE.Group();
    const capeMesh = meshOf([banner(P.chestW * 1.2, P.legH + T * 0.7, { color: ts.cape, phase: rig.phase })],
      MATS.cloth, { castShadow: true });
    capeMesh.position.set(0, -(P.legH + T * 0.7) * 0.5, -0.02);
    cape.add(capeMesh);
    cape.position.set(0, P.legH + shoulderY - 0.04, -P.chestW * 0.32);
    rig.add('cape', cape);
  }

  /* ---- arms: hung from the shoulder line, angled slightly out ---- */
  const armLen = T * 1.05 + P.legH * 0.12;
  const armGeoBase = [
    cyl(P.armR, P.armR * 0.82, armLen, 6, { color: art.bare ? skin : primary, y: -armLen / 2 }),
    ...bracers(ts.tier >= 2 ? 'plate' : 'light', { metal, trim: ts.trim, cloth: primary })
      .map(g => transformed(g, { y: -armLen * 0.62, sy: armLen / 0.62 * 0.5 })),
    sphere(P.armR * 1.18, 6, { color: skin, y: -armLen - 0.02 }),  // hand
  ];

  // Arms hang OUTSIDE the chest, not inside it. Anchoring them at the nominal
  // shoulder width buried them in the torso and the unit read as one column.
  const armX = Math.max(P.shoulder, P.chestW * 0.5 + P.armR * 1.15);
  const shoulderWorldY = P.legH + shoulderY - P.headR * 0.2;
  const armR = new THREE.Group();
  armR.position.set(armX, shoulderWorldY, 0);
  armR.userData.restZ = -0.13;
  armR.rotation.z = -0.13;
  armR.add(meshOf(armGeoBase.map(g => g.clone()), MATS.body));
  rig.add('armR', armR);

  const armL = new THREE.Group();
  armL.position.set(-armX, shoulderWorldY, 0);
  armL.userData.restZ = 0.13;
  armL.rotation.z = 0.13;
  armL.add(meshOf(armGeoBase.map(g => mirrorX(g)), MATS.body));
  rig.add('armL', armL);

  /* ---- weapon in the right hand ---- */
  if (art.weapon) {
    const wGeo = buildWeapon(art.weapon, {
      blade: art.weaponBlade ?? PAL.steel, hilt: art.weaponHilt ?? PAL.woodDark,
      guard: ts.trim, head: art.weaponBlade ?? metal, shaft: PAL.woodDark,
      glow: ts.runes ? art.glow : null, runes: ts.tier >= 3,
      accent, primary, wood: PAL.woodDark, gem: art.glow ?? PAL.arcane,
    });
    const w = meshOf(wGeo.map(g => transformed(g, { y: -armLen - 0.02 })), MATS.body);
    // A bow is built along +Y from the grip, so held straight down it drives
    // its lower limb through the ground. Archers carry it across the body.
    if (art.weapon === 'bow' || art.weapon === 'longbow') { w.rotation.z = 1.5; w.rotation.y = 0.25; }
    else if (art.weapon === 'crossbow') { w.rotation.x = -0.5; }
    armR.add(w);
    rig.parts.weapon = w;
    // paired weapons go in the left hand too
    if (art.weapon === 'twinaxes' || art.weapon === 'twinblades') {
      const w2 = meshOf(buildWeapon(art.weapon === 'twinaxes' ? 'axe' : 'dagger', {
        blade: art.weaponBlade ?? PAL.steel, hilt: art.weaponHilt ?? PAL.woodDark, glow: ts.runes ? art.glow : null,
      }).map(g => mirrorX(transformed(g, { y: -armLen - 0.02 }))), MATS.body);
      armL.add(w2);
    }
  }

  /* ---- shield in the left hand ---- */
  if (art.shield) {
    const sGeo = buildShield(art.shield, {
      face: art.shieldFace ?? (team === 1 ? PAL.teamEnemy : art.accent ?? PAL.teamPlayer),
      boss: metal, trim: ts.trim, glow: ts.tier >= 3 ? art.glow : null,
    });
    const sh = meshOf(sGeo.map(g => transformed(g, { y: -armLen * 0.78, z: -0.14, rx: 0.1 })), MATS.body);
    armL.add(sh);
  }

  /* ---- legs: thigh, shin and a boot, hung from the hip.
     Deliberately DARKER than the torso and set wide apart: the single biggest
     thing that turned these models from a column into a figure. ---- */
  const thigh = P.legH * 0.46, shin = P.legH * 0.40;
  const legCloth = shadeOf(primary, 0.62);
  const bootCol = isRobe ? shadeOf(primary, 0.7) : shadeOf(metal, 0.62);
  const legGeo = [
    taperBox(P.legR * 2.0, thigh, P.legR * 1.8, 0.82, { color: legCloth, y: -thigh * 0.5 }),
    cyl(P.legR * 0.86, P.legR * 0.76, shin, 6, { color: shadeOf(legCloth, 0.88), y: -thigh - shin * 0.5 }),
    // knee
    sphere(P.legR * 1.05, 6, { color: isRobe ? legCloth : shadeOf(metal, 0.85), y: -thigh, sy: 0.72 }),
    // boot, with a toe that reads which way the unit is facing
    box(P.legR * 2.0, P.legH * 0.14, P.legR * 2.0, { color: bootCol, y: -thigh - shin - P.legH * 0.06 }),
    box(P.legR * 1.8, P.legH * 0.10, P.legR * 1.5, { color: shadeOf(bootCol, 1.12), y: -thigh - shin - P.legH * 0.08, z: P.legR * 1.5 }),
  ];
  if (ts.tier >= 2 && !isRobe) {
    legGeo.push(box(P.legR * 2.2, P.legH * 0.06, P.legR * 2.0, { color: ts.trim, y: -thigh - shin * 0.18 }));
  }

  const legStance = P.waistW * 0.42;
  const legR = new THREE.Group();
  legR.position.set(legStance, P.legH, 0);
  legR.add(meshOf(legGeo.map(g => g.clone()), MATS.body));
  rig.add('legR', legR);

  const legL = new THREE.Group();
  legL.position.set(-legStance, P.legH, 0);
  legL.add(meshOf(legGeo.map(g => mirrorX(g)), MATS.body));
  rig.add('legL', legL);

  // a robe reaches the floor: the legs are inside it and never seen
  if (isRobe) { legR.visible = false; legL.visible = false; }

  /* ---- emissive detail ---- */
  addGlow(rig, art, ts, {
    y: P.legH + headY, torsoH: P.torsoH, legH: P.legH, shoulder: P.shoulder,
    eyesZ: P.headR * 0.88, chestY: P.legH + T * 0.75, chestZ: P.chestW * 0.3,
  });

  // NOTE: height and radius are in LOCAL units. buildUnitModel applies
  // `art.scale` exactly once, at the end. Multiplying here too would square it
  // — which silently gave every large unit a collision radius twice the size
  // of its model.
  rig.height = P.height;
  rig.radius = P.chestW * 0.52;
  return rig;
}

/* ------------------------------------------------------------------ giant */

function buildGiant(art, ts, team) {
  const rig = buildHumanoid({ ...art, build: 'huge', helm: art.helm || null }, ts, team);
  // Heavier limbs, but only slightly — at 1.35 the legs became as wide as the
  // torso and the whole thing read as a barrel.
  for (const k of ['armR', 'armL']) {
    const g = rig.parts[k];
    if (g) g.scale.set(1.28, 1.05, 1.28);
  }
  for (const k of ['legR', 'legL']) {
    const g = rig.parts[k];
    if (g) g.scale.set(1.12, 1.0, 1.12);
  }
  if (art.variant === 'behemoth' && rig.parts.body) {
    const extra = meshOf([
      cone(0.16, 0.5, 5, { color: 0xd8d0b8, x: 0.3, y: 0.9, rz: -0.5 }),
      cone(0.16, 0.5, 5, { color: 0xd8d0b8, x: -0.3, y: 0.9, rz: 0.5 }),
    ], MATS.body);
    rig.parts.body.add(extra);
  }
  return rig;
}

/* ------------------------------------------------------------------ golem */

function buildGolem(art, ts) {
  const rig = new UnitRig();
  const c = art.primary ?? PAL.stone;
  const acc = art.accent ?? PAL.arcane;
  const s = 1;

  const bodyGeo = [
    taperBox(0.92, 0.96, 0.66, 0.82, { color: c, y: 0.1 }),
    box(1.05, 0.14, 0.7, { color: shadeOf(c, 0.82), y: 0.5 }),
    box(0.44, 0.4, 0.42, { color: c, y: 0.78 }),                    // head block
    box(0.5, 0.06, 0.06, { color: acc, y: 0.82, z: 0.2, grad: 0 }), // eye band
  ];
  if (art.variant === 'iron' || art.variant === 'warden') {
    bodyGeo.push(box(0.2, 1.0, 0.2, { color: shadeOf(c, 1.15), x: 0.42, y: 0.1 }));
    bodyGeo.push(box(0.2, 1.0, 0.2, { color: shadeOf(c, 1.15), x: -0.42, y: 0.1 }));
  }
  if (ts.runes) {
    bodyGeo.push(box(0.1, 0.5, 0.04, { color: acc, z: 0.34, y: 0.1, grad: 0 }));
    bodyGeo.push(box(0.4, 0.06, 0.04, { color: acc, z: 0.34, y: 0.3, grad: 0 }));
  }

  const body = meshOf(bodyGeo, MATS.body);
  rig.bodyY = 0.92;
  body.position.y = rig.bodyY;
  rig.add('body', body);

  const armGeo = [
    box(0.28, 0.5, 0.28, { color: c, y: -0.26 }),
    box(0.34, 0.44, 0.34, { color: shadeOf(c, 0.9), y: -0.68 }),
    box(0.4, 0.26, 0.4, { color: c, y: -0.96 }),      // fist
  ];
  const armR = new THREE.Group(); armR.position.set(0.62, 1.3, 0);
  armR.add(meshOf(armGeo.map(g => g.clone()), MATS.body)); rig.add('armR', armR);
  const armL = new THREE.Group(); armL.position.set(-0.62, 1.3, 0);
  armL.add(meshOf(armGeo.map(g => mirrorX(g)), MATS.body)); rig.add('armL', armL);

  const legGeo = [
    box(0.34, 0.66, 0.34, { color: shadeOf(c, 0.9), y: -0.33 }),
    box(0.4, 0.18, 0.5, { color: c, y: -0.74, z: 0.06 }),
  ];
  const legR = new THREE.Group(); legR.position.set(0.26, 0.92, 0);
  legR.add(meshOf(legGeo.map(g => g.clone()), MATS.body)); rig.add('legR', legR);
  const legL = new THREE.Group(); legL.position.set(-0.26, 0.92, 0);
  legL.add(meshOf(legGeo.map(g => mirrorX(g)), MATS.body)); rig.add('legL', legL);

  addGlow(rig, art, ts, { y: 1.7, torsoH: 0.96, legH: 0.92, shoulder: 0.62 });
  rig.height = 2.4; rig.radius = 0.6;
  return rig;
}

/* --------------------------------------------------------------- skeleton */

function buildSkeleton(art, ts, team) {
  const bone = art.primary ?? 0xd8d0b8;
  const rig = buildHumanoid({
    ...art, build: art.variant === 'giant' ? 'huge' : 'slim',
    primary: bone, skin: bone, bare: true, helm: null, robe: false,
  }, ts, team);

  // replace head with a skull and add a ribcage
  if (rig.parts.body) {
    const extra = meshOf([
      ...buildHelm('skull', { glow: art.glow ?? 0x9fd0ff }).map(g => transformed(g, { y: 0.52 })),
      box(0.3, 0.04, 0.24, { color: shadeOf(bone, 0.9), y: 0.16 }),
      box(0.28, 0.04, 0.22, { color: shadeOf(bone, 0.9), y: 0.06 }),
      box(0.25, 0.04, 0.2, { color: shadeOf(bone, 0.9), y: -0.04 }),
      box(0.05, 0.4, 0.05, { color: bone, y: 0.06 }),
    ], MATS.body);
    rig.parts.body.add(extra);
  }
  return rig;
}

/* ------------------------------------------------------------ quadruped */

function buildBeast4(art, ts) {
  const rig = new UnitRig();
  const c = art.primary ?? 0x5a4a3a, acc = art.accent ?? 0x2a2018;
  const sc = art.variant === 'dire' ? 1.25 : 1;

  const bodyGeo = [
    // barrel, with a lighter back and darker belly so it reads as a volume
    taperBox(0.46, 0.44, 1.05, 0.9, { color: c, rx: Math.PI / 2 }),
    box(0.40, 0.14, 0.9, { color: shadeOf(c, 1.18), y: 0.16 }),        // back stripe
    box(0.36, 0.14, 0.8, { color: shadeOf(c, 0.7), y: -0.16 }),        // belly
    box(0.34, 0.34, 0.4, { color: c, z: 0.6, y: 0.1 }),                // neck
    box(0.32, 0.30, 0.38, { color: shadeOf(c, 1.1), z: 0.9, y: 0.16 }),// skull
    box(0.2, 0.18, 0.3, { color: shadeOf(c, 1.16), z: 1.12, y: 0.08 }),// muzzle
    box(0.14, 0.07, 0.16, { color: 0x1a1414, z: 1.24, y: 0.06 }),      // nose
    // jaw line, so a bite reads
    box(0.22, 0.07, 0.26, { color: shadeOf(c, 0.66), z: 1.1, y: -0.04 }),
    cone(0.08, 0.2, 4, { color: acc, x: 0.13, y: 0.36, z: 0.86, rz: -0.25 }),  // ears
    cone(0.08, 0.2, 4, { color: acc, x: -0.13, y: 0.36, z: 0.86, rz: 0.25 }),
    sphere(0.05, 5, { color: 0xffd479, x: 0.11, y: 0.2, z: 1.02, grad: 0 }),   // eyes
    sphere(0.05, 5, { color: 0xffd479, x: -0.11, y: 0.2, z: 1.02, grad: 0 }),
    taperBox(0.4, 0.34, 0.36, 0.8, { color: shadeOf(c, 0.92), z: -0.52, y: 0.06 }),  // haunches
  ];
  const body = meshOf(bodyGeo, MATS.body);
  rig.bodyY = 0.56 * sc;
  body.position.y = rig.bodyY;
  rig.add('body', body);

  const legGeo = [
    taperBox(0.15, 0.24, 0.17, 0.75, { color: shadeOf(c, 0.86), y: -0.12 }),   // upper leg
    cyl(0.055, 0.05, 0.32, 5, { color: shadeOf(c, 0.7), y: -0.38 }),           // shank
    box(0.13, 0.08, 0.2, { color: shadeOf(acc, 1.1), y: -0.54, z: 0.04 }),     // paw
  ];
  // four legs: front pair animates with legR, rear with legL
  const fr = new THREE.Group(); fr.position.set(0.16, rig.bodyY, 0.36);
  fr.add(meshOf(legGeo.map(g => g.clone()), MATS.body));
  fr.add(meshOf(legGeo.map(g => transformed(g, { x: -0.32 })), MATS.body));
  rig.add('legR', fr);
  const rr = new THREE.Group(); rr.position.set(0.16, rig.bodyY, -0.36);
  rr.add(meshOf(legGeo.map(g => g.clone()), MATS.body));
  rr.add(meshOf(legGeo.map(g => transformed(g, { x: -0.32 })), MATS.body));
  rig.add('legL', rr);

  const tail = new THREE.Group(); tail.position.set(0, rig.bodyY + 0.12, -0.56);
  tail.add(meshOf([cyl(0.05, 0.02, 0.5, 5, { color: c, z: -0.25, rx: Math.PI / 2.4 })], MATS.body));
  rig.add('tail', tail);

  // jaws double as the "attack arm" so the bite animation works
  const jaw = new THREE.Group(); jaw.position.set(0, rig.bodyY + 0.02, 0.86);
  jaw.add(meshOf([box(0.24, 0.1, 0.3, { color: shadeOf(c, 0.8), z: 0.12, y: -0.06 })], MATS.body));
  rig.add('armR', jaw);

  addGlow(rig, art, ts, { y: rig.bodyY + 0.16, torsoH: 0.4, legH: rig.bodyY, shoulder: 0.2, eyesZ: 0.98 });
  rig.root.scale.setScalar(sc);
  rig.height = 1.0 * sc; rig.radius = 0.45 * sc;
  return rig;
}

/* ------------------------------------------------------------------ flyer */

function buildFlyer(art, ts, team) {
  const rig = new UnitRig();
  const c = art.primary ?? 0xc8a860, acc = art.accent ?? 0x8a6a3a;
  const variant = art.variant || 'griffon';

  const bodyGeo = [
    taperBox(0.56, 0.5, 1.25, 0.8, { color: c, rx: Math.PI / 2 }),
    box(0.46, 0.16, 1.0, { color: shadeOf(c, 1.16), y: 0.18 }),          // spine ridge
    box(0.4, 0.16, 0.86, { color: shadeOf(c, 0.7), y: -0.18 }),          // underside
    box(0.34, 0.34, 0.42, { color: c, z: 0.7, y: 0.12 }),                // neck
    box(0.34, 0.32, 0.40, { color: shadeOf(c, 1.12), z: 1.0, y: 0.2 }),  // skull
    // hind legs, tucked
    taperBox(0.16, 0.3, 0.2, 0.7, { color: shadeOf(c, 0.8), x: 0.22, y: -0.3, z: -0.24, rx: 0.5 }),
    taperBox(0.16, 0.3, 0.2, 0.7, { color: shadeOf(c, 0.8), x: -0.22, y: -0.3, z: -0.24, rx: 0.5 }),
  ];
  if (variant === 'griffon') {
    bodyGeo.push(cone(0.1, 0.24, 5, { color: PAL.gold, z: 0.86, y: 0.08, rx: Math.PI / 2 }));
    bodyGeo.push(sphere(0.06, 5, { color: 0xffd479, x: 0.1, y: 0.16, z: 0.76, grad: 0 }));
    bodyGeo.push(sphere(0.06, 5, { color: 0xffd479, x: -0.1, y: 0.16, z: 0.76, grad: 0 }));
  } else if (variant === 'wyvern') {
    bodyGeo.push(cone(0.13, 0.4, 5, { color: shadeOf(c, 1.1), z: 0.92, y: 0.04, rx: Math.PI / 2 }));
    bodyGeo.push(cone(0.05, 0.2, 4, { color: acc, x: 0.1, y: 0.28, z: 0.56, rx: -0.6 }));
    bodyGeo.push(cone(0.05, 0.2, 4, { color: acc, x: -0.1, y: 0.28, z: 0.56, rx: -0.6 }));
  } else if (variant === 'phoenix') {
    bodyGeo.push(cone(0.1, 0.3, 5, { color: PAL.goldLight, z: 0.84, y: 0.08, rx: Math.PI / 2 }));
    for (let i = 0; i < 5; i++)
      bodyGeo.push(shape([[0, 0], [0.12, 0.5], [0, 0.9], [-0.12, 0.5]], 0.02,
        { color: i % 2 ? art.accent ?? 0xffd479 : c, z: -0.6 - i * 0.05, y: 0.1, rx: 1.2, ry: (i - 2) * 0.3, grad: 0 }));
  } else if (variant === 'seeker') {
    bodyGeo.length = 0;
    bodyGeo.push(torus(0.42, 0.09, { color: c, rseg: 5, tseg: 14 }));
    bodyGeo.push(torus(0.28, 0.07, { color: shadeOf(c, 0.86), rx: 1.1, rseg: 4, tseg: 12 }));
    bodyGeo.push(sphere(0.18, 9, { color: art.glow ?? 0xffd479, grad: 0 }));
  }

  const body = meshOf(bodyGeo, MATS.body);
  rig.bodyY = 1.5;
  body.position.y = rig.bodyY;
  rig.add('body', body);
  rig.parts.floatY = 0;

  if (variant !== 'seeker') {
    /* Wings are built from panels that extend along +X FROM the shoulder.
       The obvious `shape()` approach does not work here: shape() centres its
       geometry, so a wing attached at the shoulder ends up straddling the
       body as a flat slab instead of sweeping outward. */
    const wingCol = variant === 'wyvern' ? acc : shadeOf(c, 1.14);
    const membrane = shadeOf(wingCol, 0.82);
    const wingGeo = [
      // humerus
      taperBox(0.52, 0.11, 0.34, 0.8, { color: wingCol, x: 0.26, y: 0.02 }),
      // forearm, angled back
      taperBox(0.6, 0.08, 0.30, 0.85, { color: wingCol, x: 0.80, y: -0.02, ry: -0.22 }),
      // the spread itself
      taperBox(0.95, 0.045, 0.62, 0.7, { color: membrane, x: 0.62, y: -0.06, z: -0.22, ry: -0.12 }),
      taperBox(0.7, 0.04, 0.44, 0.6, { color: shadeOf(membrane, 0.9), x: 1.12, y: -0.1, z: -0.3, ry: -0.3 }),
      // leading-edge claw, which is what makes a wing read as a wing
      cone(0.05, 0.16, 4, { color: 0xd8d0b8, x: 1.42, y: 0.0, rz: -1.2 }),
    ];
    if (variant === 'phoenix' || variant === 'griffon') {
      // feathered fan rather than a membrane
      for (let i = 0; i < 4; i++) {
        wingGeo.push(taperBox(0.34, 0.035, 0.5, 0.5, {
          color: i % 2 ? wingCol : shadeOf(wingCol, 0.86),
          x: 0.7 + i * 0.22, y: -0.08 - i * 0.02, z: -0.26 - i * 0.06, ry: -0.18 - i * 0.08,
        }));
      }
    }
    const wR = new THREE.Group(); wR.position.set(0.2, rig.bodyY + 0.16, -0.05);
    wR.userData.restZ = 0.35;
    wR.add(meshOf(wingGeo.map(g => g.clone()), MATS.cloth)); rig.add('wingR', wR);
    const wL = new THREE.Group(); wL.position.set(-0.2, rig.bodyY + 0.16, -0.05);
    wL.userData.restZ = -0.35;
    wL.add(meshOf(wingGeo.map(g => mirrorX(g)), MATS.cloth)); rig.add('wingL', wL);
  }

  // talons act as the attack limb
  const claw = new THREE.Group(); claw.position.set(0, rig.bodyY - 0.2, 0.4);
  claw.add(meshOf([
    cyl(0.05, 0.03, 0.34, 4, { color: acc, y: -0.17 }),
    cone(0.04, 0.12, 4, { color: 0xd8d0b8, y: -0.38, rx: Math.PI }),
  ], MATS.body));
  rig.add('armR', claw);

  const tail = new THREE.Group(); tail.position.set(0, rig.bodyY, -0.5);
  tail.add(meshOf([cyl(0.06, 0.02, 0.7, 5, { color: c, z: -0.35, rx: Math.PI / 2 })], MATS.body));
  rig.add('tail', tail);

  if (art.rider) {
    const r = buildHumanoid({
      build: 'medium', primary: PAL.teamPlayer, accent: PAL.gold, metal: PAL.steel,
      weapon: 'lance', helm: 'winged',
    }, ts, team);
    // seated, not standing on the animal's back
    r.pivot.position.set(0, rig.bodyY - 0.34, -0.12);
    r.pivot.scale.setScalar(0.78);
    if (r.parts.legR) { r.parts.legR.rotation.x = 1.15; r.parts.legR.position.z += 0.06; }
    if (r.parts.legL) { r.parts.legL.rotation.x = 1.15; r.parts.legL.position.z += 0.06; }
    rig.pivot.add(r.pivot);
    rig.rider = r;
    rig.parts.weapon = r.parts.weapon;
  }

  addGlow(rig, art, ts, { y: rig.bodyY + 0.2, torsoH: 0.4, legH: rig.bodyY, shoulder: 0.2 });
  rig.height = 2.2; rig.radius = 0.5; rig.flying = true;
  return rig;
}

/* ---------------------------------------------------------------- cavalry */

function buildCavalry(art, ts, team) {
  const rig = new UnitRig();
  const variant = art.variant || 'horse';
  const c = variant === 'wolf' ? 0x5a5a4a : variant === 'boar' ? 0x6a4a3a : 0x4a3a2f;

  const mountGeo = [
    taperBox(0.5, 0.5, 1.25, 0.86, { color: c, rx: Math.PI / 2 }),
    box(0.34, 0.5, 0.36, { color: c, z: 0.66, y: 0.24 }),
    box(0.26, 0.28, 0.44, { color: shadeOf(c, 1.06), z: 0.86, y: 0.44 }),
    cone(0.09, 0.2, 4, { color: c, z: 1.06, y: 0.42, rx: Math.PI / 2 }),
  ];
  if (variant === 'boar') {
    mountGeo.push(cone(0.04, 0.2, 4, { color: 0xe8e0c8, x: 0.11, y: 0.4, z: 1.0, rx: -0.9 }));
    mountGeo.push(cone(0.04, 0.2, 4, { color: 0xe8e0c8, x: -0.11, y: 0.4, z: 1.0, rx: -0.9 }));
  } else {
    mountGeo.push(cone(0.05, 0.14, 4, { color: c, x: 0.09, y: 0.6, z: 0.82 }));
    mountGeo.push(cone(0.05, 0.14, 4, { color: c, x: -0.09, y: 0.6, z: 0.82 }));
  }
  if (variant === 'horse') {
    mountGeo.push(box(0.06, 0.24, 0.55, { color: shadeOf(c, 0.7), y: 0.5, z: 0.4 }));  // mane
    mountGeo.push(box(0.56, 0.12, 0.6, { color: art.accent ?? PAL.gold, y: 0.26 }));   // caparison
  }

  const body = meshOf(mountGeo, MATS.body);
  rig.bodyY = 0.78;
  body.position.y = rig.bodyY;
  rig.add('body', body);

  const legGeo = [
    cyl(0.08, 0.06, 0.72, 5, { color: shadeOf(c, 0.86), y: -0.36 }),
    box(0.12, 0.08, 0.16, { color: 0x2a2018, y: -0.72, z: 0.02 }),
  ];
  const fr = new THREE.Group(); fr.position.set(0.19, rig.bodyY, 0.44);
  fr.add(meshOf(legGeo.map(g => g.clone()), MATS.body));
  fr.add(meshOf(legGeo.map(g => transformed(g, { x: -0.38 })), MATS.body));
  rig.add('legR', fr);
  const rr = new THREE.Group(); rr.position.set(0.19, rig.bodyY, -0.44);
  rr.add(meshOf(legGeo.map(g => g.clone()), MATS.body));
  rr.add(meshOf(legGeo.map(g => transformed(g, { x: -0.38 })), MATS.body));
  rig.add('legL', rr);

  // rider
  const rider = buildHumanoid({
    build: 'medium', primary: art.primary ?? PAL.teamPlayer, accent: art.accent ?? PAL.gold,
    metal: art.metal ?? PAL.steel, weapon: art.weapon || 'lance', helm: art.helm || 'winged',
    cape: art.cape,
  }, ts, team);
  rider.pivot.position.set(0, rig.bodyY + 0.28, -0.05);
  rider.pivot.scale.setScalar(0.92);
  rider.parts.legR.rotation.x = 0.9; rider.parts.legL.rotation.x = 0.9;
  rig.pivot.add(rider.pivot);
  rig.rider = rider;
  rig.parts.armR = rider.parts.armR;   // attack animation drives the rider
  rig.parts.weapon = rider.parts.weapon;

  addGlow(rig, art, ts, { y: rig.bodyY + 1.2, torsoH: 0.5, legH: rig.bodyY, shoulder: 0.3 });
  rig.height = 2.1; rig.radius = 0.62;
  return rig;
}

/* ------------------------------------------------------------------ siege */

function buildSiege(art, ts) {
  const rig = new UnitRig();
  const wood = art.primary ?? PAL.woodDark, metal = art.metal ?? PAL.iron;
  const v = art.variant || 'catapult';
  const geo = [];

  // common chassis
  geo.push(box(1.5, 0.22, 2.1, { color: wood, y: 0.5 }));
  geo.push(box(1.6, 0.14, 0.2, { color: shadeOf(wood, 0.82), y: 0.5, z: 0.9 }));
  geo.push(box(1.6, 0.14, 0.2, { color: shadeOf(wood, 0.82), y: 0.5, z: -0.9 }));
  for (const [x, z] of [[0.82, 0.72], [-0.82, 0.72], [0.82, -0.72], [-0.82, -0.72]]) {
    geo.push(cyl(0.38, 0.38, 0.16, 10, { color: shadeOf(wood, 0.9), x, z, y: 0.4, rz: Math.PI / 2 }));
    geo.push(torus(0.38, 0.05, { color: metal, x, z, y: 0.4, ry: Math.PI / 2, rseg: 4, tseg: 12 }));
  }

  if (v === 'catapult') {
    geo.push(box(0.16, 1.0, 0.16, { color: wood, x: 0.42, y: 1.1, rx: 0.35 }));
    geo.push(box(0.16, 1.0, 0.16, { color: wood, x: -0.42, y: 1.1, rx: 0.35 }));
    geo.push(box(0.9, 0.12, 0.12, { color: metal, y: 1.55 }));
  } else if (v === 'trebuchet') {
    geo.push(box(0.18, 2.3, 0.18, { color: wood, x: 0.5, y: 1.7, rx: 0.3 }));
    geo.push(box(0.18, 2.3, 0.18, { color: wood, x: -0.5, y: 1.7, rx: 0.3 }));
    geo.push(box(1.2, 0.14, 0.14, { color: metal, y: 2.75 }));
    geo.push(box(0.5, 0.5, 0.5, { color: PAL.stone, y: 2.2, z: -0.7 }));  // counterweight
  } else if (v === 'ram') {
    geo.push(box(1.3, 0.9, 0.12, { color: shadeOf(wood, 0.8), y: 1.3, z: -0.9 }));
    geo.push(box(0.18, 0.9, 0.18, { color: wood, x: 0.56, y: 1.2 }));
    geo.push(box(0.18, 0.9, 0.18, { color: wood, x: -0.56, y: 1.2 }));
    geo.push(box(0.9, 0.1, 2.0, { color: shadeOf(wood, 1.1), y: 1.65 }));  // roof
  } else if (v === 'cart') {
    geo.push(box(1.2, 0.7, 1.6, { color: shadeOf(wood, 0.9), y: 0.96 }));
    geo.push(box(1.24, 0.08, 1.64, { color: metal, y: 1.32 }));
    for (let i = 0; i < 4; i++)
      geo.push(sphere(0.12, 6, { color: art.glow ?? PAL.poison, x: -0.4 + i * 0.28, y: 1.4, z: 0.2, grad: 0 }));
  }

  const body = meshOf(geo, MATS.body);
  rig.bodyY = 0;
  rig.add('body', body);

  // the throwing arm is the "attack arm"
  const arm = new THREE.Group();
  if (v === 'ram') {
    arm.position.set(0, 1.2, 0);
    arm.add(meshOf([
      cyl(0.18, 0.2, 2.0, 8, { color: shadeOf(wood, 0.78), rx: Math.PI / 2, z: 0.2 }),
      cone(0.24, 0.5, 6, { color: metal, z: 1.4, rx: Math.PI / 2 }),
    ], MATS.body));
    rig.ramArm = true;
  } else {
    arm.position.set(0, v === 'trebuchet' ? 2.75 : 1.55, 0);
    arm.add(meshOf([
      box(0.14, 0.14, v === 'trebuchet' ? 3.0 : 1.9, { color: wood, z: (v === 'trebuchet' ? 1.5 : 0.95) }),
      box(0.3, 0.12, 0.3, { color: shadeOf(wood, 0.8), z: (v === 'trebuchet' ? 2.9 : 1.8) }),
    ], MATS.body));
    arm.rotation.x = -0.9;
  }
  rig.add('armR', arm);

  addGlow(rig, art, ts, { y: 1.4, torsoH: 0.6, legH: 0.5, shoulder: 0.5 });
  rig.height = v === 'trebuchet' ? 3.2 : 1.9;
  rig.radius = 1.0;
  rig.noWalk = true;
  return rig;
}

/* ----------------------------------------------------------------- treant */

function buildTreant(art, ts) {
  const rig = new UnitRig();
  const bark = art.primary ?? 0x4a3f2a, leaf = art.accent ?? PAL.moss;
  const geo = [
    cyl(0.44, 0.62, 1.7, 8, { color: bark, y: 0.85 }),
    cyl(0.3, 0.42, 0.5, 7, { color: shadeOf(bark, 1.1), y: 1.95 }),
    sphere(0.1, 5, { color: 0xffd479, x: 0.14, y: 2.0, z: 0.3, grad: 0 }),
    sphere(0.1, 5, { color: 0xffd479, x: -0.14, y: 2.0, z: 0.3, grad: 0 }),
  ];
  // canopy
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, r = 0.5 + (i % 3) * 0.2;
    geo.push(sphere(0.42 + (i % 3) * 0.1, 6, { color: i % 2 ? leaf : shadeOf(leaf, 0.82), x: Math.cos(a) * r, z: Math.sin(a) * r, y: 2.5 + (i % 2) * 0.24 }));
  }
  // roots
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    geo.push(cyl(0.07, 0.14, 0.6, 5, { color: shadeOf(bark, 0.8), x: Math.cos(a) * 0.4, z: Math.sin(a) * 0.4, y: 0.24, rz: -Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5 }));
  }

  const body = meshOf(geo, MATS.body);
  rig.bodyY = 0;
  rig.add('body', body);

  const armGeo = [
    cyl(0.14, 0.11, 1.0, 6, { color: bark, y: -0.5 }),
    cyl(0.1, 0.07, 0.6, 5, { color: bark, y: -1.1, rz: 0.4 }),
    sphere(0.2, 6, { color: leaf, y: -1.4 }),
  ];
  const armR = new THREE.Group(); armR.position.set(0.6, 1.6, 0);
  armR.add(meshOf(armGeo.map(g => g.clone()), MATS.body)); rig.add('armR', armR);
  const armL = new THREE.Group(); armL.position.set(-0.6, 1.6, 0);
  armL.add(meshOf(armGeo.map(g => mirrorX(g)), MATS.body)); rig.add('armL', armL);

  addGlow(rig, art, ts, { y: 2.0, torsoH: 1.0, legH: 0.6, shoulder: 0.6 });
  rig.height = 3.0; rig.radius = 0.75;
  return rig;
}

/* ----------------------------------------------------------------- kraken */

function buildKraken(art, ts) {
  const rig = new UnitRig();
  const c = art.primary ?? 0x2a4a5a, acc = art.accent ?? PAL.sky;
  const geo = [
    sphere(0.85, 10, { color: c, y: 1.1, sy: 1.2 }),
    sphere(0.55, 9, { color: shadeOf(c, 1.12), y: 1.7, sy: 0.8 }),
    sphere(0.14, 7, { color: art.glow ?? acc, x: 0.3, y: 1.72, z: 0.56, grad: 0 }),
    sphere(0.14, 7, { color: art.glow ?? acc, x: -0.3, y: 1.72, z: 0.56, grad: 0 }),
  ];
  // beak
  geo.push(cone(0.22, 0.4, 5, { color: 0x2a2a2a, y: 1.2, z: 0.7, rx: 1.5 }));
  const body = meshOf(geo, MATS.body);
  rig.bodyY = 0;
  rig.add('body', body);

  // eight tentacles; two of them animate as "legs"
  // tentacles get LIGHTER toward the tip, and a row of suckers, so the
  // silhouette does not collapse into one dark mass against a dark field
  const tentGeo = (len) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      out.push(cyl(0.16 * (1 - t * 0.8), 0.17 * (1 - t * 0.7), len / 5 + 0.04, 5, {
        color: shadeOf(c, 1.0 + t * 0.55), y: -len * (t + 0.1), z: Math.sin(t * 3) * 0.22,
      }));
      out.push(sphere(0.05, 5, {
        color: shadeOf(acc, 1.1), y: -len * (t + 0.1), z: Math.sin(t * 3) * 0.22 + 0.14 * (1 - t * 0.7),
      }));
    }
    return out;
  };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const grp = new THREE.Group();
    grp.position.set(Math.cos(a) * 0.55, 1.0, Math.sin(a) * 0.55);
    grp.rotation.z = -Math.cos(a) * 0.5;
    grp.rotation.x = Math.sin(a) * 0.5;
    grp.add(meshOf(tentGeo(1.0), MATS.body));
    rig.pivot.add(grp);
    if (i === 0) rig.parts.armR = grp;
    if (i === 4) rig.parts.armL = grp;
    if (i === 2) rig.parts.legR = grp;
    if (i === 6) rig.parts.legL = grp;
  }

  addGlow(rig, art, ts, { y: 1.8, torsoH: 1.0, legH: 0.8, shoulder: 0.6 });
  rig.height = 2.4; rig.radius = 0.9;
  return rig;
}

/* ---------------------------------------------------------------- serpent */

function buildSerpent(art, ts) {
  const rig = new UnitRig();
  const c = art.primary ?? 0x2a1a4a, gl = art.glow ?? PAL.arcane;
  /* A rearing serpent: the body coils on the ground behind and the front
     third lifts. Laid out flat it read as a caterpillar. */
  const geo = [];
  const N = 10;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const rise = Math.max(0, 1 - t * 2.4);            // only the front lifts
    geo.push(sphere(0.40 * (1 - t * 0.55), 7, {
      color: shadeOf(c, 1.1 - t * 0.28),
      z: -i * 0.40 + rise * 0.5,
      y: 0.42 + rise * 1.05 + Math.sin(t * 7) * 0.1,
      x: Math.sin(t * 4.5) * 0.28,
    }));
    if (i % 2 === 0) {
      geo.push(cone(0.1, 0.26, 4, {
        color: gl, z: -i * 0.40 + rise * 0.5,
        y: 0.42 + rise * 1.05 + Math.sin(t * 7) * 0.1 + 0.34 * (1 - t * 0.5),
        x: Math.sin(t * 4.5) * 0.28, grad: 0,
      }));
    }
  }
  // head, held high and forward
  geo.push(sphere(0.42, 9, { color: shadeOf(c, 1.3), z: 0.68, y: 1.62, sz: 1.35 }));
  geo.push(cone(0.24, 0.56, 5, { color: shadeOf(c, 1.4), z: 1.12, y: 1.56, rx: Math.PI / 2 }));
  geo.push(box(0.3, 0.09, 0.4, { color: shadeOf(c, 0.7), z: 0.96, y: 1.42 }));   // jaw
  geo.push(sphere(0.1, 6, { color: gl, x: 0.2, y: 1.74, z: 0.92, grad: 0 }));
  geo.push(sphere(0.1, 6, { color: gl, x: -0.2, y: 1.74, z: 0.92, grad: 0 }));

  const body = meshOf(geo, MATS.body);
  rig.bodyY = 0;
  rig.add('body', body);
  rig.parts.floatY = 0;

  const jaw = new THREE.Group(); jaw.position.set(0, 1.5, 1.0);
  jaw.add(meshOf([cone(0.2, 0.42, 5, { color: shadeOf(c, 0.9), rx: Math.PI / 2, z: 0.2, y: -0.08 })], MATS.body));
  rig.add('armR', jaw);

  addGlow(rig, art, ts, { y: 1.3, torsoH: 0.6, legH: 1.0, shoulder: 0.3 });
  rig.height = 1.9; rig.radius = 0.55;
  return rig;
}

/* ----------------------------------------------------------------- spider */

function buildSpider(art, ts) {
  const rig = new UnitRig();
  const c = art.primary ?? 0x3a2a3a, acc = art.accent ?? PAL.poison;
  const geo = [
    sphere(0.42, 9, { color: c, y: 0.6, z: -0.28, sy: 0.82 }),
    sphere(0.26, 8, { color: shadeOf(c, 1.12), y: 0.58, z: 0.22 }),
  ];
  for (let i = 0; i < 4; i++)
    geo.push(sphere(0.055, 5, { color: acc, x: -0.12 + (i % 2) * 0.24, y: 0.66 + Math.floor(i / 2) * 0.08, z: 0.42, grad: 0 }));
  geo.push(cone(0.07, 0.18, 4, { color: 0x1a1a1a, x: 0.1, y: 0.5, z: 0.42, rx: 1.3 }));
  geo.push(cone(0.07, 0.18, 4, { color: 0x1a1a1a, x: -0.1, y: 0.5, z: 0.42, rx: 1.3 }));

  const body = meshOf(geo, MATS.body);
  rig.bodyY = 0;
  rig.add('body', body);

  // lighter than the body, and jointed, so eight legs actually read as eight
  const legGeo = (a) => [
    cyl(0.045, 0.04, 0.52, 4, { color: shadeOf(c, 1.5), y: 0.14, rz: -0.9 }),
    sphere(0.055, 5, { color: shadeOf(acc, 0.8), x: 0.36, y: 0.3 }),
    cyl(0.038, 0.025, 0.58, 4, { color: shadeOf(c, 1.25), x: 0.4, y: -0.02, rz: 0.95 }),
  ];
  for (let i = 0; i < 8; i++) {
    const a = ((i % 4) - 1.5) * 0.45 + (i < 4 ? 0 : Math.PI);
    const g = new THREE.Group();
    g.position.set(0, 0.58, 0);
    g.rotation.y = a;
    g.add(meshOf(legGeo(a), MATS.body));
    rig.pivot.add(g);
    if (i === 0) rig.parts.legR = g;
    if (i === 4) rig.parts.legL = g;
    if (i === 1) rig.parts.armR = g;
  }

  addGlow(rig, art, ts, { y: 0.7, torsoH: 0.4, legH: 0.5, shoulder: 0.3 });
  rig.height = 1.0; rig.radius = 0.55;
  return rig;
}

/* ----------------------------------------------------------------- wraith */

function buildWraith(art, ts) {
  const rig = new UnitRig();
  const c = art.primary ?? 0x3a3a52, gl = art.glow ?? PAL.arcane;

  const geo = [
    cone(0.42, 1.5, 8, { color: c, y: 0.82 }),         // tattered lower body
    sphere(0.24, 9, { color: shadeOf(c, 1.15), y: 1.6 }),
    ...buildHelm('hood', { cloth: shadeOf(c, 0.8) }).map(g => transformed(g, { y: 1.62 })),
    sphere(0.06, 5, { color: gl, x: 0.08, y: 1.6, z: 0.19, grad: 0 }),
    sphere(0.06, 5, { color: gl, x: -0.08, y: 1.6, z: 0.19, grad: 0 }),
  ];
  const body = meshOf(geo, MATS.body);
  rig.bodyY = 0;
  rig.add('body', body);
  rig.parts.floatY = 0.15;

  const armGeo = [
    cyl(0.06, 0.04, 0.6, 5, { color: shadeOf(c, 0.9), y: -0.3 }),
    cone(0.05, 0.2, 4, { color: 0xd8d0b8, y: -0.68, rx: Math.PI }),
  ];
  const armR = new THREE.Group(); armR.position.set(0.3, 1.42, 0);
  armR.add(meshOf(armGeo.map(g => g.clone()), MATS.body)); rig.add('armR', armR);
  const armL = new THREE.Group(); armL.position.set(-0.3, 1.42, 0);
  armL.add(meshOf(armGeo.map(g => mirrorX(g)), MATS.body)); rig.add('armL', armL);

  addGlow(rig, art, ts, { y: 1.6, torsoH: 0.6, legH: 0.8, shoulder: 0.3 });
  rig.height = 1.9; rig.radius = 0.4;
  return rig;
}

/* -------------------------------------------------------------- elemental */

function buildElemental(art, ts) {
  const rig = new UnitRig();
  const c = art.primary ?? PAL.ember, gl = art.glow ?? art.accent ?? 0xffd479;
  const void_ = art.variant === 'void';

  const geo = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    geo.push(sphere(0.42 * (1 - t * 0.5) + 0.1, 7, {
      color: i % 2 ? c : shadeOf(gl, 0.9), y: 0.5 + t * 1.3,
      x: Math.sin(i * 2.1) * 0.12, z: Math.cos(i * 1.7) * 0.12, grad: 0.05,
    }));
  }
  geo.push(sphere(0.1, 6, { color: void_ ? 0x000000 : 0xffffff, x: 0.13, y: 1.66, z: 0.22, grad: 0 }));
  geo.push(sphere(0.1, 6, { color: void_ ? 0x000000 : 0xffffff, x: -0.13, y: 1.66, z: 0.22, grad: 0 }));

  const body = meshOf(geo, MATS.glow, { castShadow: false });
  rig.bodyY = 0;
  rig.add('body', body);
  rig.parts.floatY = 0.1;

  const armGeo = [
    sphere(0.16, 6, { color: c, y: -0.2, grad: 0 }),
    sphere(0.12, 6, { color: gl, y: -0.5, grad: 0 }),
  ];
  const armR = new THREE.Group(); armR.position.set(0.38, 1.3, 0);
  armR.add(meshOf(armGeo.map(g => g.clone()), MATS.glow, { castShadow: false })); rig.add('armR', armR);
  const armL = new THREE.Group(); armL.position.set(-0.38, 1.3, 0);
  armL.add(meshOf(armGeo.map(g => mirrorX(g)), MATS.glow, { castShadow: false })); rig.add('armL', armL);

  // orbiting motes
  const hover = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    hover.add(meshOf([sphere(0.07, 5, { color: gl, x: Math.cos(a) * 0.8, z: Math.sin(a) * 0.8, y: (i % 2) * 0.3, grad: 0 })],
      MATS.glow, { castShadow: false }));
  }
  rig.add('hover', hover);

  rig.height = 2.0; rig.radius = 0.5;
  return rig;
}

/* ==========================================================================
   SHARED DETAIL: emissive parts + tier aura
   ========================================================================== */

function addGlow(rig, art, ts, P) {
  const geos = [];
  const gl = art.glow;

  if (gl) {
    // eyes
    geos.push(sphere(0.042 * ts.glowScale, 5, { color: gl, x: 0.07, y: P.y + 0.01, z: (P.eyesZ ?? 0.15), grad: 0 }));
    geos.push(sphere(0.042 * ts.glowScale, 5, { color: gl, x: -0.07, y: P.y + 0.01, z: (P.eyesZ ?? 0.15), grad: 0 }));
    // chest rune once runes unlock
    if (ts.runes) {
      const cy = P.chestY ?? (P.legH + P.torsoH * 0.6);
      const cz = P.chestZ ?? 0.19;
      geos.push(box(0.09, 0.09, 0.03, { color: gl, y: cy, z: cz, grad: 0 }));
      geos.push(box(0.03, 0.22, 0.03, { color: gl, y: cy, z: cz, grad: 0 }));
    }
  }
  if (art.aura && ts.tier >= 3) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      geos.push(sphere(0.05, 5, { color: art.aura, x: Math.cos(a) * 0.55, z: Math.sin(a) * 0.55, y: (P.y ?? 1.4) + 0.32, grad: 0 }));
    }
  }

  if (geos.length) {
    const g = meshOf(geos, MATS.glow, { castShadow: false, receiveShadow: false });
    rig.add('glow', g);
  }
  // the tier aura ring is added by buildUnitModel, once rig.radius is final
  rig.auraColor = ts.aura;
}

/* ==========================================================================
   PUBLIC ENTRY
   ========================================================================== */

const ARCHETYPES = {
  humanoid: buildHumanoid,
  giant: buildGiant,
  golem: buildGolem,
  skeleton: buildSkeleton,
  beast4: buildBeast4,
  flyer: buildFlyer,
  cavalry: buildCavalry,
  siege: buildSiege,
  treant: buildTreant,
  kraken: buildKraken,
  serpent: buildSerpent,
  spider: buildSpider,
  wraith: buildWraith,
  elemental: buildElemental,
};

/**
 * Build a model for a unit definition.
 * @param unit  a UNITS entry
 * @param level card level (drives the visual tier)
 * @param team  0 player / 1 enemy — tints trim, never the whole model
 */
export function buildUnitModel(unit, level = 1, team = 0) {
  const art = unit.art || { archetype: 'humanoid' };
  const tier = Math.min(4, Math.floor((level - 1) / 3));
  const ts = tierStyle(tier, art);

  // Enemy units get a red trim so both sides are readable at a glance without
  // losing the unit's own colour identity.
  if (team === 1) {
    ts.trim = shadeOf(PAL.teamEnemy, 1.25);
    if (ts.cape) ts.cape = PAL.teamEnemy;
  } else if (tier >= 2 && !art.cape) {
    ts.cape = ts.cape || PAL.teamPlayer;
  }

  const fn = ARCHETYPES[art.archetype] || buildHumanoid;
  const rig = fn(art, ts, team);

  // multiply, not set: a few archetypes (quadrupeds, flyers) pre-scale their
  // root for a size variant, and that must compose with the card's own scale
  const scale = art.scale ?? 1;
  rig.root.scale.multiplyScalar(scale);
  rig.height *= scale;
  rig.radius = Math.max(0.28, rig.radius * scale);
  rig.tier = tier;

  // Team ring under every unit, so you can always tell whose is whose.
  // Built in LOCAL space (hence the /scale), because it hangs off the pivot.
  const rLocal = rig.radius / scale;
  const rMat = MATS.emissive(team === 1 ? PAL.teamEnemy : PAL.teamPlayer, 0.5).clone();
  rMat.transparent = true;
  const sel = new THREE.Mesh(
    ring(rLocal * 1.06, rLocal * 1.28, 20, { color: 0xffffff, rx: -Math.PI / 2, grad: 0 }),
    rMat);
  sel.position.y = 0.02;
  sel.renderOrder = 1;
  rig.pivot.add(sel);
  rig.parts.teamRing = sel;

  // Veteran aura: a THIN ring just outside the team ring. It marks a highly
  // upgraded unit without becoming the loudest thing on the battlefield —
  // which is what it was before, when it used a stale default radius.
  if (rig.auraColor) {
    const aMat = MATS.emissive(rig.auraColor, 0.22).clone();
    aMat.transparent = true;
    const aura = new THREE.Mesh(
      ring(rLocal * 1.42, rLocal * 1.56, 26, { color: 0xffffff, rx: -Math.PI / 2, grad: 0 }),
      aMat);
    aura.position.y = 0.025;
    aura.renderOrder = 2;
    rig.pivot.add(aura);
    rig.parts.aura = aura;
  }

  return rig;
}

/** A cheap portrait-sized model for card art — no aura, no ring. */
export function buildPortraitModel(unit, level = 1) {
  const rig = buildUnitModel(unit, level, 0);
  if (rig.parts.teamRing) rig.parts.teamRing.visible = false;
  if (rig.parts.aura) rig.parts.aura.visible = false;
  return rig;
}
