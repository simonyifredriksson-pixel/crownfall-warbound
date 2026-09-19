/* Config.js — every tunable number in one place.
   Anything a designer would want to twist lives here, not buried in a system. */

export const BUILD = 'v1';

export const CFG = {

  /* ---------------------------------------------------------- rendering */
  render: {
    maxPixelRatio: 2,
    shadowMapSize: 2048,
    shadowDistance: 70,
    fogNear: 46,
    fogFar: 170,
    bloomThreshold: 0.72,
    bloomStrength: 0.62,
    bloomRadius: 0.86,
    exposure: 1.02,
  },

  /* ------------------------------------------------------------- camera
     Distances, pitches and smoothing rates live in CAM_PRESETS in
     core/CameraRig.js, next to the code that uses them. Only the numbers the
     rest of the game needs are here. */
  cam: {
    maxShake: 0.55,   // ceiling on a single impulse; the rig decays it
  },

  /* ------------------------------------------------------------- battle */
  battle: {
    duration: 240,           // seconds before sudden-death scoring
    overtime: 60,
    commandMax: 10,
    commandStart: 5,
    commandRegen: 1 / 2.35,  // per second, base
    commandPerPoint: 0.16,   // extra regen per owned control point
    handSize: 4,
    deckSize: 8,
    deployMargin: 1.6,       // how far from the deploy line you may drop
    deployDelaySec: 0.85,    // spawn wind-up before a unit can act
    corpseLinger: 9,         // seconds a corpse stays (necromancy fodder)
    maxUnitsPerSide: 42,
    gridCell: 4,             // spatial hash cell size, world units
    baseCrit: 0.05,
    critMult: 1.55,
    backstabMult: 2.1,
    highGroundBonus: 0.15,   // dmg + range mult when shooting from a ridge
    coverReduction: 0.25,    // ranged damage reduction when target is in cover
    flankAngle: 2.0,         // radians: attacks outside the front arc are flanks
    flankBonus: 0.2,
    respawnSec: 11,
    respawnPenalty: 1,       // command lost on commander death
  },

  /* ------------------------------------------------ battlefield geometry */
  field: {
    width: 56,
    length: 88,
    deployLineOwn: -18,      // player may deploy at z <= this (own half is -z)
    pushPerPoint: 11,        // deploy line advances this much per control point
    bannerZ: 38,             // |z| of each banner
    towerZ: 24,
    towerX: 17,
  },

  /* -------------------------------------------------------- structures */
  structures: {
    bannerHp: 3400,
    towerHp: 1500,
    towerDps: 62,
    towerRange: 15,
    towerAttackSpeed: 1.15,
  },

  /* ------------------------------------------------------- control pts */
  cp: {
    radius: 6.5,
    captureRate: 0.26,       // progress/sec per unit inside, capped
    maxContributors: 3,
    decayRate: 0.06,
  },

  /* -------------------------------------------------------- commander */
  cmd: {
    baseHp: 620,
    hpPerLevel: 46,
    baseMight: 24,
    baseFocus: 18,
    baseArmor: 6,
    moveSpeed: 8.1,
    dodgeSpeed: 20,
    dodgeTime: 0.34,
    dodgeCooldown: 1.15,
    dodgeIFrames: 0.22,
    staminaMax: 100,
    staminaRegen: 22,
    dodgeCost: 28,
    auraRadius: 9,
    auraDamageBonus: 0.06,
    weightSpeedPenalty: 0.0032,  // move speed lost per point of gear weight
    xpPerLevel: lvl => Math.round(180 * Math.pow(1.34, lvl - 1)),
    maxLevel: 40,
  },

  /* ------------------------------------------------------------- cards */
  cards: {
    maxLevel: 15,
    statGrowth: 1.088,        // per level, applied to hp & damage
    tierEvery: 3,             // visual + ability tier bumps
    upgradeShards: lvl => Math.round(2 * Math.pow(1.62, lvl - 1) + lvl * 1.5),
    upgradeGold: lvl => Math.round(40 * Math.pow(1.5, lvl - 1)),
    awakenLevel: 15,
  },

  /* ------------------------------------------------------------ economy */
  econ: {
    startGold: 300,
    winGoldBase: 110,
    winGoldPerTier: 46,
    loseGoldMult: 0.3,
    firstClearMult: 2.4,
    xpWinBase: 70,
    xpPerTier: 24,
    shopRefreshHours: 0,      // instant, gold-priced refresh
  },

  /* ------------------------------------------------------------- world */
  world: {
    walkSpeed: 7.6,
    runSpeed: 12.2,
    turnRate: 11,
    interactRange: 3.4,
    gravity: -26,
  },

  /* ------------------------------------------------------------- audio */
  audio: { master: 0.7, sfx: 0.85, music: 0.4 },

  /* ------------------------------------------------------------- misc */
  // NOTE: the save key keeps its original name on purpose — renaming the game
  // must not wipe anyone's existing profile.
  save: { key: 'ironcrown.save.v1', autosaveSec: 20 },
  ui: { toastMs: 3200, tooltipDelay: 120 },
};

/* ===========================================================================
   DAMAGE / ARMOUR COUNTER MATRIX
   The single most important balance table in the game. Rows are damage
   types, columns are armour types. 1.0 = neutral.

   Design intent, in words:
     - PIERCE punches through unarmoured and light things and shatters on plate.
     - BLUNT is the plate-opener; it is wasted on swarms of peasants.
     - SLASH is the generalist — good against flesh, poor against stone.
     - ARCANE eats heavy armour but is largely shrugged off by magical wards.
     - FIRE cooks beasts and structures; undead barely notice pain.
     - FROST bites flesh, but you cannot chill a golem.
     - POISON is for living things only. Full stop.
     - HOLY annihilates the undead and is gentle with everything else.
     - SHADOW is the anti-elite type: strong on heavy and magical, weak on swarms.
   =========================================================================== */

export const ARMOR_TYPES = ['unarmored', 'light', 'heavy', 'magical', 'beast', 'undead', 'structure'];
export const DAMAGE_TYPES = ['slash', 'pierce', 'blunt', 'arcane', 'fire', 'frost', 'poison', 'holy', 'shadow'];

export const COUNTER = {
  //         unarmored light  heavy magical beast  undead structure
  slash:   { unarmored: 1.35, light: 1.15, heavy: 0.70, magical: 1.00, beast: 1.10, undead: 0.95, structure: 0.45 },
  pierce:  { unarmored: 1.30, light: 1.30, heavy: 0.62, magical: 0.95, beast: 1.05, undead: 0.80, structure: 0.40 },
  blunt:   { unarmored: 0.85, light: 1.00, heavy: 1.50, magical: 1.10, beast: 1.00, undead: 1.25, structure: 1.45 },
  arcane:  { unarmored: 1.10, light: 1.10, heavy: 1.25, magical: 0.55, beast: 1.00, undead: 1.05, structure: 0.75 },
  fire:    { unarmored: 1.25, light: 1.20, heavy: 0.90, magical: 0.85, beast: 1.35, undead: 1.30, structure: 1.20 },
  frost:   { unarmored: 1.20, light: 1.10, heavy: 0.85, magical: 0.90, beast: 1.20, undead: 0.70, structure: 0.60 },
  poison:  { unarmored: 1.45, light: 1.25, heavy: 0.75, magical: 0.80, beast: 1.30, undead: 0.15, structure: 0.05 },
  holy:    { unarmored: 1.00, light: 1.00, heavy: 1.00, magical: 1.15, beast: 1.00, undead: 2.05, structure: 0.70 },
  shadow:  { unarmored: 0.95, light: 1.05, heavy: 1.30, magical: 1.35, beast: 1.05, undead: 0.50, structure: 0.65 },
};

export function counterMult(dmgType, armorType) {
  const row = COUNTER[dmgType];
  if (!row) return 1;
  const v = row[armorType];
  return v === undefined ? 1 : v;
}

/** Verbal label for a multiplier — used by tooltips and floating numbers. */
export function counterLabel(m) {
  if (m >= 1.6) return { key: 'devastating', cls: 'mx-vhi' };
  if (m >= 1.15) return { key: 'strong', cls: 'mx-hi' };
  if (m <= 0.5) return { key: 'useless', cls: 'mx-vlo' };
  if (m <= 0.88) return { key: 'weak', cls: 'mx-lo' };
  return { key: 'neutral', cls: '' };
}

/* --------------------------------------------------------------- rarity */

export const RARITY = {
  common:    { id: 'common',    name: 'Common',    color: '#9aa3af', order: 0, shardMult: 1.00, dropWeight: 100, awakenCost: 1.0 },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  color: '#5fa25a', order: 1, shardMult: 1.35, dropWeight: 56,  awakenCost: 1.3 },
  rare:      { id: 'rare',      name: 'Rare',      color: '#4f8fd4', order: 2, shardMult: 1.85, dropWeight: 26,  awakenCost: 1.8 },
  epic:      { id: 'epic',      name: 'Epic',      color: '#9a6fe0', order: 3, shardMult: 2.60, dropWeight: 10,  awakenCost: 2.6 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#e0a02e', order: 4, shardMult: 3.80, dropWeight: 3.2, awakenCost: 4.0 },
  mythic:    { id: 'mythic',    name: 'Mythic',    color: '#e0455f', order: 5, shardMult: 5.60, dropWeight: 0.7, awakenCost: 6.5 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/* ------------------------------------------------------- damage pipeline */

/**
 * The one place damage is computed. Every attack in the game funnels here so
 * that counters, armour, statuses and crits can never disagree between
 * systems.
 *
 * @param {object} o
 *   amount      raw damage
 *   dmgType     one of DAMAGE_TYPES
 *   armorType   defender's armour class
 *   armor       flat armour rating (diminishing)
 *   critChance  0..1
 *   flank       bool — attacker is outside the defender's front arc
 *   backstab    bool — assassin-style rear strike
 *   mults       array of extra multipliers (buffs, synergies, statuses)
 *   rand        rng function
 * @returns {{dmg:number, crit:boolean, mult:number, counter:number}}
 */
export function resolveDamage(o) {
  const counter = counterMult(o.dmgType, o.armorType);
  // Armour: diminishing returns, never full immunity.
  const armor = Math.max(0, o.armor || 0);
  const armorMult = 100 / (100 + armor * 2.4);

  let mult = counter * armorMult;
  if (o.mults) for (const m of o.mults) mult *= m;
  if (o.flank) mult *= 1 + CFG.battle.flankBonus;

  const rand = o.rand || Math.random;
  let crit = false;
  if (o.backstab) { mult *= CFG.battle.backstabMult; crit = true; }
  else if (rand() < (o.critChance ?? CFG.battle.baseCrit)) { mult *= CFG.battle.critMult; crit = true; }

  return { dmg: Math.max(1, o.amount * mult), crit, mult, counter };
}
