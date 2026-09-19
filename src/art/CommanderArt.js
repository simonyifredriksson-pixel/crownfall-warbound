/* CommanderArt.js — your character, assembled from whatever is equipped.

   Every slot maps onto geometry. Swap the chest and the silhouette changes;
   swap the weapon and the idle pose, the stance width and the swing all change
   with it. This is the payoff for the equipment system: gear you can see.
*/

import * as THREE from '../../lib/three.module.js';
import { box, taperBox, cyl, sphere, cone, torus, ring, banner, meshOf, transformed, mirrorX } from './Geo.js';
import { PAL, MATS } from './Palette.js';
import { buildWeapon, buildShield, buildHelm, chestPlate, pauldrons, greaves, bracers, shadeOf } from './GearArt.js';
import { ITEMS, WEAPON_CLASSES, SLOT_ORDER } from '../data/Items.js';
import { UnitRig } from './UnitArt.js';
import { TAU } from '../core/Util.js';

const SKIN = 0xc89b74;

/* Proportions: the commander is deliberately a touch larger than a soldier so
   they read as the main character even in a crowd of forty. */
const P = {
  shoulder: 0.33, waistW: 0.44, chestW: 0.58, torsoH: 0.54, legH: 0.86,
  headR: 0.195, armR: 0.092, legR: 0.125, height: 1.95,
};

/**
 * @param equipped  { weapon, offhand, head, chest, hands, feet, trinket1, trinket2 }
 * @param opts      { team, cloak, skin, hair }
 */
export function buildCommanderModel(equipped = {}, opts = {}) {
  const rig = new UnitRig();
  const team = opts.team ?? 0;
  const skin = opts.skin ?? SKIN;

  const wep = ITEMS[equipped.weapon];
  const off = ITEMS[equipped.offhand];
  const head = ITEMS[equipped.head];
  const chest = ITEMS[equipped.chest];
  const hands = ITEMS[equipped.hands];
  const feet = ITEMS[equipped.feet];
  const trinket = ITEMS[equipped.trinket1] || ITEMS[equipped.trinket2];

  const family = chest?.family || 'light';
  const baseCloth = chest?.visual?.cloth ?? 0x3a4050;
  const baseMetal = chest?.visual?.metal ?? PAL.iron;
  const trim = chest?.visual?.trim ?? (team === 1 ? PAL.teamEnemy : PAL.gold);

  /* ---------------------------------------------------------------- body
     Same anchor scheme as the unit rig: y=0 is the hip, y=torsoH is the
     shoulder line, and the merged mesh is lifted to hip height once. */
  const bodyGeo = [];
  const T = P.torsoH;
  const chestStyle = chest?.visual?.style || (family === 'heavy' ? 'plate' : family === 'magic' ? 'robe' : 'jerkin');
  const isRobe = chestStyle === 'robe';

  if (isRobe) {
    bodyGeo.push(cone(P.chestW * 0.6, T, 10, { color: baseCloth, y: T * 0.5 }));
    bodyGeo.push(cyl(P.chestW * 0.6, P.chestW * 1.05, P.legH, 10, { color: shadeOf(baseCloth, 0.9), y: -P.legH * 0.5 }));
    bodyGeo.push(box(P.chestW * 0.18, T * 1.6, 0.05, { color: trim, z: P.chestW * 0.42, y: T * 0.1 }));
  } else {
    bodyGeo.push(taperBox(P.waistW, T * 0.44, P.waistW * 0.62, 1.2,
      { color: shadeOf(baseCloth, 0.78), y: T * 0.22 }));
    bodyGeo.push(taperBox(P.chestW, T * 0.6, P.chestW * 0.56, 0.9,
      { color: baseMetal, y: T * 0.73 }));
    bodyGeo.push(box(P.waistW * 1.16, T * 0.11, P.waistW * 0.74, { color: shadeOf(trim, 0.8), y: T * 0.42 }));
    bodyGeo.push(box(T * 0.16, T * 0.16, P.waistW * 0.78, { color: trim, y: T * 0.42 }));
    bodyGeo.push(box(P.chestW * 0.92, T * 0.11, P.chestW * 0.6, { color: shadeOf(baseMetal, 1.12), y: T * 1.0 }));
    if (chest?.visual?.tabard) {
      bodyGeo.push(box(P.chestW * 0.34, T * 1.05, 0.03, { color: chest.visual.tabard, z: P.chestW * 0.3, y: T * 0.4 }));
    }
    if (chestStyle === 'scale') {
      for (let r = 0; r < 3; r++) for (let c = -1; c <= 1; c++) {
        bodyGeo.push(box(P.chestW * 0.28, T * 0.14, 0.04, {
          color: r % 2 ? shadeOf(baseMetal, 1.16) : shadeOf(baseMetal, 0.88),
          x: c * P.chestW * 0.3, y: T * (0.58 + r * 0.16), z: P.chestW * 0.29,
        }));
      }
    }
  }

  const shoulderY = T;
  bodyGeo.push(...pauldrons(family === 'heavy' ? 'plate' : family === 'magic' ? 'none' : 'light', {
    metal: baseMetal, trim,
    x: P.shoulder, y: shoulderY - P.headR * 0.18, scale: P.chestW / 0.5,
  }));

  // neck + head
  bodyGeo.push(cyl(P.headR * 0.42, P.headR * 0.5, P.headR * 0.5, 6, { color: shadeOf(skin, 0.82), y: shoulderY + P.headR * 0.2 }));
  const headY = shoulderY + P.headR * 0.42 + P.headR;
  bodyGeo.push(sphere(P.headR, 10, { color: skin, y: headY, sy: 1.06, sz: 1.04 }));
  bodyGeo.push(box(P.headR * 1.35, P.headR * 0.2, 0.05, { color: 0x2a2018, y: headY + P.headR * 0.12, z: P.headR * 0.9, grad: 0 }));

  // hair, visible when no helm or under a circlet
  const helmStyle = head?.visual?.style;
  if (!head || helmStyle === 'circlet') {
    bodyGeo.push(sphere(P.headR * 1.04, 9, { color: opts.hair ?? 0x3a2a1e, y: headY + 0.035, sy: 0.82 }));
    bodyGeo.push(box(P.headR * 1.7, 0.2, 0.1, { color: opts.hair ?? 0x3a2a1e, y: headY - 0.02, z: -P.headR * 0.75 }));
  }

  if (head) {
    bodyGeo.push(...buildHelm(helmStyle || 'great', {
      metal: head.visual?.metal ?? baseMetal,
      trim: head.visual?.trim ?? trim,
      cloth: head.visual?.cloth ?? baseCloth,
      plume: head.visual?.plume ?? (head.rarity === 'common' ? null : trim),
      glow: head.visual?.glow,
    }).map(g => transformed(g, { y: headY })));
  }

  const body = meshOf(bodyGeo, MATS.body);
  rig.bodyY = P.legH;
  body.position.y = rig.bodyY;
  rig.add('body', body);

  /* ---------------------------------------------------------------- cloak */
  const cloakColor = chest?.visual?.cape ?? opts.cloak ?? (team === 1 ? PAL.teamEnemy : PAL.teamPlayer);
  if (cloakColor) {
    const cloak = new THREE.Group();
    const cl = P.legH + T * 0.75;
    const m = meshOf([banner(P.chestW * 1.25, cl, { color: cloakColor })], MATS.cloth);
    m.position.set(0, -cl * 0.5, -0.03);
    cloak.add(m);
    // clasp
    cloak.add(meshOf([sphere(0.05, 6, { color: trim, y: 0.02, z: 0.06 })], MATS.body));
    cloak.position.set(0, P.legH + shoulderY - 0.04, -P.chestW * 0.3);
    rig.add('cape', cloak);
  }

  /* ---------------------------------------------------------------- arms */
  const armLen = T * 1.02 + P.legH * 0.12;
  const gloveVis = hands?.visual || {};
  const armGeo = [
    cyl(P.armR, P.armR * 0.85, armLen, 7, { color: shadeOf(baseCloth, 0.9), y: -armLen / 2 }),
    ...bracers(gloveVis.style || (family === 'heavy' ? 'plate' : 'wrap'),
      { metal: gloveVis.metal ?? baseMetal, trim: gloveVis.trim ?? trim, cloth: gloveVis.cloth ?? baseCloth })
      .map(g => transformed(g, { y: -armLen * 0.56 })),
    sphere(P.armR * 1.12, 7, { color: gloveVis.cloth ? shadeOf(gloveVis.cloth, 1.05) : skin, y: -armLen - 0.02 }),
  ];
  if (gloveVis.glow) armGeo.push(sphere(P.armR * 0.6, 6, { color: gloveVis.glow, y: -armLen - 0.02, z: 0.06, grad: 0 }));

  const armX = Math.max(P.shoulder, P.chestW * 0.5 + P.armR * 1.15);
  const shoulderWorldY = P.legH + shoulderY - P.headR * 0.2;

  const armR = new THREE.Group();
  armR.position.set(armX, shoulderWorldY, 0);
  armR.userData.restZ = -0.13;
  armR.rotation.z = -0.13;
  armR.add(meshOf(armGeo.map(g => g.clone()), MATS.body));
  rig.add('armR', armR);

  const armL = new THREE.Group();
  armL.position.set(-armX, shoulderWorldY, 0);
  armL.userData.restZ = 0.13;
  armL.rotation.z = 0.13;
  armL.add(meshOf(armGeo.map(g => mirrorX(g)), MATS.body));
  rig.add('armL', armL);

  /* -------------------------------------------------------------- weapon */
  if (wep) {
    const v = wep.visual || {};
    const wclass = WEAPON_CLASSES[wep.wclass];
    const geoName = weaponGeoName(wep.wclass);
    const wGeo = buildWeapon(geoName, {
      blade: v.blade, hilt: v.hilt, guard: v.guard, head: v.head, shaft: v.shaft,
      wood: v.wood, string: v.string, gem: v.gem, glow: v.glow,
      length: v.length, fuller: v.fuller, jagged: v.jagged, runes: v.runes,
      wide: v.wide, accent: trim, primary: baseCloth,
    });
    const w = meshOf(wGeo.map(g => transformed(g, { y: -armLen - 0.02 })), MATS.body);
    // bows are carried angled across the body rather than dead flat, which
    // reads as a bow instead of a horizontal stick
    if (wclass?.ranged && wep.wclass !== 'staff') { w.rotation.z = 1.15; w.rotation.y = 0.3; w.rotation.x = 0.25; }
    armR.add(w);
    rig.parts.weapon = w;
    rig.weaponClass = wep.wclass;

    if (v.paired) {
      const w2 = meshOf(wGeo.map(g => mirrorX(transformed(g, { y: -armLen - 0.02 }))), MATS.body);
      armL.add(w2);
    }
    if (v.floating) {
      // the staff hovers beside the hand rather than being gripped
      w.position.y += 0.1;
      rig.floatingWeapon = w;
    }
  }

  /* ------------------------------------------------------------- offhand */
  if (off && !(ITEMS[equipped.weapon]?.visual?.paired)) {
    const v = off.visual || {};
    if (v.shape) {
      const sGeo = buildShield(v.shape, {
        face: v.face, boss: v.boss, trim: v.trim, glow: v.glow,
      });
      const sh = meshOf(sGeo.map(g => transformed(g, { y: -armLen * 0.76, z: -0.16, rx: 0.08 })), MATS.body);
      armL.add(sh);
      rig.parts.shield = sh;
      if (v.floating) { sh.position.x = -0.35; rig.floatingShield = sh; }
    }
  }

  /* ---------------------------------------------------------------- legs */
  const bootVis = feet?.visual || {};
  const bootMetal = bootVis.metal ?? bootVis.cloth ?? baseMetal;
  const thigh = P.legH * 0.46, shin = P.legH * 0.40;
  const legCloth = shadeOf(baseCloth, 0.66);
  const legGeo = [
    taperBox(P.legR * 2.0, thigh, P.legR * 1.8, 0.82, { color: legCloth, y: -thigh * 0.5 }),
    cyl(P.legR * 0.86, P.legR * 0.76, shin, 6, { color: shadeOf(legCloth, 0.88), y: -thigh - shin * 0.5 }),
    sphere(P.legR * 1.05, 6, { color: shadeOf(bootMetal, 0.9), y: -thigh, sy: 0.72 }),
    box(P.legR * 2.0, P.legH * 0.14, P.legR * 2.0, { color: shadeOf(bootMetal, 0.7), y: -thigh - shin - P.legH * 0.06 }),
    box(P.legR * 1.8, P.legH * 0.10, P.legR * 1.5, { color: shadeOf(bootMetal, 0.85), y: -thigh - shin - P.legH * 0.08, z: P.legR * 1.5 }),
  ];
  if (bootVis.trim) {
    legGeo.push(box(P.legR * 2.2, P.legH * 0.06, P.legR * 2.0, { color: bootVis.trim, y: -thigh - shin * 0.18 }));
  }

  const stance = P.waistW * 0.42;
  const legR = new THREE.Group();
  legR.position.set(stance, P.legH, 0);
  legR.add(meshOf(legGeo.map(g => g.clone()), MATS.body));
  rig.add('legR', legR);

  const legL = new THREE.Group();
  legL.position.set(-stance, P.legH, 0);
  legL.add(meshOf(legGeo.map(g => mirrorX(g)), MATS.body));
  rig.add('legL', legL);

  if (isRobe) { legR.visible = false; legL.visible = false; }

  /* -------------------------------------------------------------- glow */
  const glows = [];
  for (const slot of SLOT_ORDER) {
    const it = ITEMS[equipped[slot]];
    if (!it?.visual?.glow) continue;
    if (slot === 'head') glows.push(sphere(0.05, 6, { color: it.visual.glow, y: P.legH + headY + P.headR * 0.9, grad: 0 }));
    if (slot === 'chest') {
      glows.push(box(0.09, 0.09, 0.03, { color: it.visual.glow, y: P.legH + T * 0.78, z: P.chestW * 0.3, grad: 0 }));
      glows.push(box(0.03, 0.24, 0.03, { color: it.visual.glow, y: P.legH + T * 0.78, z: P.chestW * 0.3, grad: 0 }));
    }
  }
  if (trinket?.visual?.gem) {
    glows.push(sphere(0.055, 6, { color: trinket.visual.gem, y: P.legH + T * 1.0, z: P.chestW * 0.32, grad: 0 }));
  }
  if (glows.length) rig.add('glow', meshOf(glows, MATS.glow, { castShadow: false, receiveShadow: false }));

  /* ------------------------------------------------ legendary aura ring */
  const legendary = SLOT_ORDER.some(s => ITEMS[equipped[s]]?.rarity === 'legendary');
  if (legendary) {
    const auraColor = SLOT_ORDER.map(s => ITEMS[equipped[s]]).find(i => i?.rarity === 'legendary')?.visual?.aura ?? PAL.gold;
    const mat = MATS.emissive(auraColor, 0.34).clone();
    mat.transparent = true;
    const m = new THREE.Mesh(ring(0.62, 0.86, 30, { color: auraColor, rx: -Math.PI / 2, grad: 0 }), mat);
    m.position.y = 0.03; m.renderOrder = 2;
    rig.add('aura', m);
  }

  /* ---------------------------------------------- commander marker ring */
  const rMat = MATS.emissive(team === 1 ? PAL.teamEnemy : PAL.gold, 0.7).clone();
  rMat.transparent = true;
  const marker = new THREE.Mesh(ring(0.44, 0.56, 24, { color: 0xffffff, rx: -Math.PI / 2, grad: 0 }), rMat);
  marker.position.y = 0.02; marker.renderOrder = 3;
  rig.pivot.add(marker);
  rig.parts.teamRing = marker;

  rig.height = P.height;
  rig.radius = 0.45;
  rig.isCommander = true;
  return rig;
}

/** Map an item weapon class onto a GearArt builder name. */
function weaponGeoName(wclass) {
  return {
    sword: 'sword', greatsword: 'greatsword', axe: 'axe', hammer: 'hammer',
    spear: 'spear', daggers: 'dagger', bow: 'bow', staff: 'staff',
  }[wclass] || 'sword';
}

/**
 * Commander-specific animation on top of the shared rig: weapon-class stance,
 * bow draw, dodge roll, and the floating staff/shield idle.
 */
export function updateCommanderRig(rig, dt, s) {
  rig.update(dt, s);
  const p = rig.parts;

  if (rig.floatingWeapon) {
    rig.floatingWeapon.rotation.y += dt * 1.2;
    rig.floatingWeapon.position.y = -0.85 + Math.sin(rig.phase * 2) * 0.06;
  }
  if (rig.floatingShield) {
    rig.floatingShield.rotation.y -= dt * 0.9;
    rig.floatingShield.position.y = -0.7 + Math.sin(rig.phase * 2.3 + 1) * 0.06;
  }

  // bow draw: both arms come up and the string hand pulls back
  if (s.drawing > 0 && p.armR && p.armL) {
    const d = Math.min(1, s.drawing);
    p.armL.rotation.x = -1.5;
    p.armL.rotation.y = -0.5;
    p.armR.rotation.x = -1.35;
    p.armR.rotation.y = 0.35 + d * 0.35;
    p.armR.rotation.z = -0.2;
  }

  // dodge roll: tumble forward
  if (s.dodging > 0) {
    rig.pivot.rotation.x = -s.dodging * TAU;
    rig.pivot.position.y = Math.sin(s.dodging * Math.PI) * 0.35;
  } else if (rig.pivot.rotation.x !== 0 && s.dead <= 0) {
    rig.pivot.rotation.x = 0;
    rig.pivot.position.y = 0;
  }

  // two-handed stance: shift the body slightly
  if (rig.weaponClass === 'greatsword' || rig.weaponClass === 'hammer') {
    if (p.armL && !s.drawing && !s.casting && !s.attacking) p.armL.rotation.z = -0.5;
  }
}

/** A lighter build for the equipment screen turntable. */
export function buildCommanderPortrait(equipped, opts = {}) {
  const rig = buildCommanderModel(equipped, opts);
  if (rig.parts.teamRing) rig.parts.teamRing.visible = false;
  return rig;
}
