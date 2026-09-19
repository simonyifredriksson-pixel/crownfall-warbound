/* Entity.js — a single fielded unit at runtime.

   Holds stats, statuses, AI state and its rig. Deliberately has no opinions
   about *behaviour*: the sim drives it. What it does own is the one thing
   that must be consistent everywhere — `recalc()`, which folds statuses,
   auras, abilities and deck synergies into the effective numbers used by
   movement, attacks and the damage pipeline.
*/

import { CFG } from '../core/Config.js';
import { STATUS, foldMods, HARD_CC } from '../data/Statuses.js';
import { ABILITIES } from '../data/Abilities.js';
import { UNITS, statsAt, tierOf } from '../data/Units.js';
import { clamp, clamp01, TAU, angleDelta } from '../core/Util.js';

let NEXT_ID = 1;

export class Entity {
  constructor(o) {
    const u = o.unit;
    const lvl = o.level || 1;
    const st = statsAt(u, lvl, CFG.cards.statGrowth);

    this.id = NEXT_ID++;
    this.cardId = u.id;
    this.unit = u;
    this.name = u.name;
    this.team = o.team;
    this.lvl = lvl;
    this.tier = tierOf(lvl);
    this.statMult = st.mult;
    this.summoned = !!o.summoned;
    this.owner = o.owner || null;
    this.isBoss = !!u.isBoss;

    /* ---- base stats (never mutated; effective values are derived) ---- */
    this.maxHp = Math.round(st.hp * (o.hpMult || 1) * (o.scale ? o.scale : 1));
    this.hp = this.maxHp;
    this.baseDmg = st.dmg * (o.dmgMult || 1) * (o.scale ? o.scale : 1);
    this.baseArmor = st.armor + (o.bonusArmor || 0);
    this.baseAtkSpeed = u.atkSpeed;
    this.baseMove = u.moveSpeed * (o.moveMult || 1);
    this.baseRange = u.range + (o.bonusRange || 0);
    this.mass = u.mass;
    this.sight = u.sight;
    this.role = u.role;
    this.dmgType = u.dmgType;
    this.armorType = u.armorType;
    this.tags = u.tags || [];
    this.splash = u.splash || 0;
    this.minRange = u.minRange || 0;
    this.pierceArmor = u.pierceArmor || 0;
    this.structureMultBase = o.structureMult || 1;
    this.healMultBase = o.healMult || 1;
    this.rangedTakenBase = o.rangedTakenMult || 1;
    this.cdMult = o.cdMult || 1;
    this.stealthBonus = o.stealthBonus || 0;
    this.backstabBonus = o.backstabBonus || 0;

    /* ---- position & motion ---- */
    this.x = o.x; this.z = o.z; this.y = 0;
    this.vx = 0; this.vz = 0;
    this.facing = o.team === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.speedNow = 0;
    this.flying = false;

    /* ---- combat state ---- */
    this.alive = true;
    this.target = null;
    this.forcedTarget = null;
    this.attackCd = 0;
    this.swing = 0;              // 0..1 animation progress of the current swing
    this.swingHit = false;
    this.castTime = 0;
    this.spawnDelay = o.spawnDelay ?? CFG.battle.deployDelaySec;
    this.deathT = 0;
    this.hurtT = 0;
    this.lastAttacker = null;
    this.damageDealt = 0;
    this.kills = 0;
    this.lifeLimit = o.life || 0;
    this.age = 0;

    /* ---- statuses & abilities ---- */
    this.statuses = [];
    this.abilities = [];
    this.abilityCd = {};
    this.passives = [];
    this.onHitHooks = [];
    this.onDamagedHooks = [];
    this.onKillHooks = [];
    this.onDeathHooks = [];
    this.minionDeathHooks = [];
    this.auras = [];
    this.outgoingHooks = [];

    const awakened = !!o.awakened;
    for (const aid of u.abilities || []) {
      const a = ABILITIES[aid];
      if (!a) continue;
      if (a.awaken && !awakened) continue;
      if ((a.tier || 0) > this.tier) continue;
      // Only abilities that actually implement run() go into a trigger list.
      // Some declare a kind for documentation but implement a narrower hook
      // (soulHarvest is an 'onDeath' ability that only reacts to its OWN
      // minions dying), and calling run() on those would throw.
      const hasRun = typeof a.run === 'function';
      switch (a.kind) {
        case 'active': if (hasRun) { this.abilities.push(a); this.abilityCd[a.id] = a.cd * 0.5; } break;
        case 'aura': if (typeof a.aura === 'function') this.auras.push(a); break;
        case 'onHit': if (hasRun) this.onHitHooks.push(a); break;
        case 'onDamaged': if (hasRun) this.onDamagedHooks.push(a); break;
        case 'onKill': if (hasRun) this.onKillHooks.push(a); break;
        case 'onDeath': if (hasRun) this.onDeathHooks.push(a); break;
        case 'onSpawn': if (hasRun) { this.spawnHook = this.spawnHook || []; this.spawnHook.push(a); } break;
        default: this.passives.push(a); break;
      }
      if (typeof a.onMinionDeath === 'function') this.minionDeathHooks.push(a);
      if (a.onOutgoing) this.outgoingHooks.push(a);
      if (a.onLethal) this.lethalHook = a;
      if (a.mods) this.passives.push(a);
      if (a.minRange) this.minRange = Math.max(this.minRange, a.minRange);
      if (a.splash) this.splash = Math.max(this.splash, a.splash);
      if (a.structurePriority) this.structurePriority = true;
      if (a.targetPriority) this.targetPriority = a.targetPriority;
      if (a.commandRegenBonus) this.commandRegenBonus = a.commandRegenBonus;
      if (a.reflectMagic) this.reflectMagic = a.reflectMagic;
      if (a.tickInterval) { this.tickAbility = a; this.tickT = a.tickInterval; }
    }

    /* ---- per-frame aura accumulators (reset every recalc) ---- */
    this.auraArmor = 0;
    this.auraDmgMult = 1;
    this.auraDmgTaken = 1;
    this.auraAtkSpeed = 1;
    this.auraMagicResist = 1;
    this.auraStructureMult = 1;
    this.healCap = 1;

    /* ---- deck-synergy bonuses baked in at spawn ---- */
    this.bonusDmgMult = o.bonusDmgMult || 1;
    this.bonusMoveMult = o.bonusMoveMult || 1;

    this.mods = foldMods([]);
    this.recalc();

    /* ---- rendering ---- */
    this.rig = null;
    this.scaleMul = o.scale || 1;
    this.activeSynergies = new Set();
  }

  /* ------------------------------------------------------------- derived */

  /**
   * Fold everything into effective stats. Called once per frame per unit,
   * after auras have been accumulated. Order matters: statuses, then passive
   * ability hooks, then auras.
   */
  recalc() {
    const m = foldMods(this.statuses);

    for (const a of this.passives) {
      if (a.mods) {
        for (const k in a.mods) {
          const v = a.mods[k];
          if (typeof v === 'boolean') m[k] = m[k] || v;
          else if (k === 'armorAdd') m[k] = (m[k] || 0) + v;
          else m[k] = (m[k] ?? 1) * v;
        }
      }
      if (a.onRecalc) a.onRecalc(this, m);
    }

    m.dmgMult *= this.auraDmgMult * this.bonusDmgMult;
    m.dmgTakenMult *= this.auraDmgTaken;
    m.atkSpeedMult *= this.auraAtkSpeed;
    m.moveMult *= this.bonusMoveMult;
    m.armorAdd += this.auraArmor;

    this.mods = m;

    this.armor = Math.max(0, this.baseArmor + m.armorAdd);
    this.damage = this.baseDmg * m.dmgMult;
    this.atkSpeed = this.baseAtkSpeed * m.atkSpeedMult;
    this.moveSpeed = this.baseMove * m.moveMult;
    this.range = this.baseRange * m.rangeMult;
    this.flying = !!m.flying;
    this.stunned = !!m.stunned;
    this.silenced = !!m.silenced;
    this.untargetable = !!m.untargetable;
    this.fleeing = !!m.fleeing;
    this.structureMult = this.structureMultBase * (m.structureMult || 1) * this.auraStructureMult;
    this.healMult = this.healMultBase * (m.healTakenMult ?? 1);
    this.trample = m.trample || 0;
    this.ccImmune = !!m.ccImmune;
    this.ignoreArmor = !!m.ignoreArmor;

    // reset aura accumulators for the next gather pass
    this.auraArmor = 0;
    this.auraDmgMult = 1;
    this.auraDmgTaken = 1;
    this.auraAtkSpeed = 1;
    this.auraMagicResist = 1;
    this.auraStructureMult = 1;
    this.healCap = 1;
  }

  get hp01() { return clamp01(this.hp / this.maxHp); }
  get ready() { return this.spawnDelay <= 0 && this.alive; }
  get isMelee() { return this.baseRange <= 3.6; }

  /* ------------------------------------------------------------ statuses */

  hasStatus(id) { return this.statuses.some(s => s.id === id); }
  getStatus(id) { return this.statuses.find(s => s.id === id); }

  addStatus(id, dur, data = {}) {
    const def = STATUS[id];
    if (!def) return null;
    if (def.kind === 'debuff' && this.ccImmune && (def.mods?.stunned || def.mods?.moveMult === 0)) return null;

    let st = this.statuses.find(s => s.id === id);
    if (st) {
      st.t = Math.max(st.t, dur);
      st.max = Math.max(st.max, dur);
      if (def.stackable) st.stacks = Math.min(def.maxStacks || 99, st.stacks + (data.stacks || 1));
      Object.assign(st, { src: data.src ?? st.src, dps: data.dps ?? st.dps, hps: data.hps ?? st.hps });
      if (data.hp) st.hp = (st.hp || 0) + data.hp;
      return st;
    }
    st = {
      id, t: dur, max: dur, stacks: data.stacks || 1, debuff: def.kind === 'debuff',
      src: data.src || null, dps: data.dps || 0, hps: data.hps || 0, hp: data.hp || 0, acc: 0,
    };
    this.statuses.push(st);
    return st;
  }

  removeStatus(id) {
    const i = this.statuses.findIndex(s => s.id === id);
    if (i >= 0) this.statuses.splice(i, 1);
  }

  cleanse() {
    this.statuses = this.statuses.filter(s => !s.debuff);
  }

  tickStatuses(b, dt) {
    for (let i = this.statuses.length - 1; i >= 0; i--) {
      const st = this.statuses[i];
      st.t -= dt;
      const def = STATUS[st.id];
      if (def && def.tick) def.tick(b, this, st, dt);
      if (st.t <= 0) {
        this.statuses.splice(i, 1);
        if (st.id === 'frozen') {
          // shatter: frozen units take a burst when the ice breaks
          b.dealDamage(st.src || this, this, this.maxHp * 0.06, 'frost', { silent: true, noCrit: true });
          b.fx('freeze', this.x, 1, this.z, {});
        }
      }
    }
  }

  /* ------------------------------------------------------------ geometry */

  distTo(o) { const dx = o.x - this.x, dz = o.z - this.z; return Math.hypot(dx, dz); }
  dist2To(o) { const dx = o.x - this.x, dz = o.z - this.z; return dx * dx + dz * dz; }

  /** Is `o` outside this unit's front arc? Used for the flanking bonus. */
  isFlankedBy(o) {
    const a = Math.atan2(o.z - this.z, o.x - this.x);
    return Math.abs(angleDelta(this.facing, a)) > CFG.battle.flankAngle / 2;
  }

  faceToward(x, z, dt, rate = 9) {
    const want = Math.atan2(z - this.z, x - this.x);
    const d = angleDelta(this.facing, want);
    this.facing += clamp(d, -rate * dt, rate * dt);
  }

  /** How valuable is this unit as a target? Drives AI priority. */
  threat() {
    const dps = this.damage * this.atkSpeed;
    const roleW = { support: 2.2, caster: 1.9, summoner: 2.0, ranged: 1.4, siege: 1.3 }[this.role] || 1;
    return dps * roleW * (1 + this.lvl * 0.02);
  }

  get facingSign() { return this.team === 0 ? 1 : -1; }
}

/* ==========================================================================
   CORPSES — a resource for necromancy and a target for fire
   ========================================================================== */

export class Corpse {
  constructor(e, linger) {
    this.x = e.x; this.z = e.z; this.y = e.y;
    this.team = e.team;
    this.cardId = e.cardId;
    this.lvl = e.lvl;
    this.t = linger;
    this.used = false;
    this.mass = e.mass;
  }
}
