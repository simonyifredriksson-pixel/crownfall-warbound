/* Battle.js — the simulation.

   This file owns the fight: units, structures, control points, projectiles,
   ground effects, both commanders, the win condition, and the facade (`this`)
   that every ability in the game is written against.

   Frame order matters and is fixed:
     1  clock, command regen, hand cycling
     2  spatial grid rebuild
     3  aura + field-synergy gather        (4 Hz — not every frame)
     4  units: statuses → recalc → decide → move → attack → abilities
     5  commanders
     6  projectiles, ground effects, delayed casts
     7  structures (towers) and control points
     8  corpses, cleanup, victory check
     9  rig sync + effects

   Rule kept throughout: THERE IS ONE DAMAGE PATH. Everything that hurts
   anything goes through `dealDamage`, so counters, armour, statuses, shields,
   reflection, crits and the floating numbers can never disagree.
*/

import * as THREE from '../../lib/three.module.js';
import { CFG, resolveDamage, counterMult, counterLabel } from '../core/Config.js';
import { bus, EV } from '../core/Bus.js';
import { audio } from '../core/Audio.js';
import { clamp, clamp01, lerp, damp, angleDelta, TAU, rng, makeRng, swapRemove, formatTime } from '../core/Util.js';
import { UNITS, statsAt, tierOf, threatScore } from '../data/Units.js';
import { STATUS } from '../data/Statuses.js';
import { ABILITIES } from '../data/Abilities.js';
import { activeDeckSynergies, applyDeckSynergies, FIELD_SYNERGIES, SYNERGIES } from '../data/Synergies.js';
import { FACTIONS, TEAM_COLOR } from '../data/Factions.js';
import { MODIFIERS } from '../data/Campaign.js';
import { Field, makeStructures, makeControlPoints, Structure } from './Field.js';
import { Entity, Corpse } from './Entity.js';
import { SpatialGrid } from './Spatial.js';
import { Commander } from './Commander.js';
import { EnemyDirector } from './EnemyAI.js';
import { buildUnitModel } from '../art/UnitArt.js';
import { buildCommanderModel, updateCommanderRig } from '../art/CommanderArt.js';
import * as Props from '../art/PropArt.js';
import { MATS, PAL } from '../art/Palette.js';
import { ring, plane, sphere, box, cyl, cone, meshOf } from '../art/Geo.js';

const AURA_HZ = 4;

export class Battle {
  /**
   * @param o {
   *   scene, fx, field: presetName, atmos,
   *   playerDeck: [{id, level, awakened, unit}], playerStats, playerEquipped,
   *   playerAbilities, playerPotions,
   *   enemy: { faction, deck:[unitId], level, boss, modifiers, commanderStats },
   *   node, seed, bonuses, onEvent
   * }
   */
  constructor(o) {
    this.opts = o;
    this.scene = o.scene;
    this.fxSys = o.fx;
    this.rng = makeRng(o.seed ?? ((Math.random() * 0xffffffff) >>> 0));
    this.bonuses = o.bonuses || {};
    this.node = o.node || null;
    this.modifiers = new Set(o.enemy?.modifiers || []);

    this.t = 0;
    this.realT = 0;
    this.state = 'countdown';        // countdown | running | over
    this.countdown = 3.0;
    this.result = null;
    this.speed = 1;
    this.shakeAmt = 0;
    this.shakeSeed = rng.range(0, 100);

    /* ---------------------------------------------------------- field */
    this.field = new Field(o.field || 'open', { seed: this.rng.int(1, 1e9), atmos: o.atmos || 'greenmarch' });
    this.scene.add(this.field.group);

    this.allStructures = makeStructures(this.field, { hpMult: o.structureHpMult || 1 });
    this.points = makeControlPoints(this.field);
    this._buildStructureModels();
    this._buildPointModels();

    /* ---------------------------------------------------------- units */
    this.units = [];
    this.corpses = [];
    this.projectiles = [];
    this.grounds = [];
    this.zones = [];
    this.delayed = [];
    this.leaps = [];
    this.grid = new SpatialGrid(this.field.W, this.field.L);
    this.unitGroup = new THREE.Group();
    this.scene.add(this.unitGroup);

    this.corpseLingerMult = 1;
    this.oilDurationMult = 1;
    this.commandRegenMult = this.bonuses.commandRegenMult || 1;

    /* ------------------------------------------------------- resources */
    this.command = [CFG.battle.commandStart, CFG.battle.commandStart];
    this.commandMax = [CFG.battle.commandMax, CFG.battle.commandMax];

    /* ------------------------------------------------------------ deck */
    this.playerDeck = o.playerDeck || [];
    this.deckSynergies = activeDeckSynergies(this.playerDeck.map(c => c.unit));
    for (const s of this.deckSynergies) if (s.global) s.global(this);
    this.hand = [];
    this.drawPile = [];
    this._initHand();

    /* ------------------------------------------------------- commanders */
    this.commanders = [];
    this.player = new Commander({
      team: 0, name: o.playerName || 'Commander',
      stats: o.playerStats, equipped: o.playerEquipped,
      abilities: o.playerAbilities || [], potions: o.playerPotions || [],
      x: 0, z: -CFG.field.bannerZ + 6,
    });
    this.commanders.push(this.player);

    if (o.enemy?.commanderStats) {
      this.enemyCommander = new Commander({
        team: 1, ai: true, name: o.enemy.commanderName || 'Enemy Commander',
        stats: o.enemy.commanderStats, equipped: o.enemy.commanderEquipped || {},
        abilities: [], potions: [],
        x: 0, z: CFG.field.bannerZ - 6,
      });
      this.commanders.push(this.enemyCommander);
    }
    this._buildCommanderModels();

    /* --------------------------------------------------------- enemy AI */
    this.director = new EnemyDirector(this, o.enemy || {});

    /* ------------------------------------------------------- deploy zone */
    this.deployZone = this.field.makeDeployZone(0);
    this.deployLine = [CFG.field.deployLineOwn, -CFG.field.deployLineOwn];
    this._updateDeployLines();

    /* ----------------------------------------------------------- stats
       These are set up BEFORE anything can spawn: `_spawnBoss` goes through
       the normal spawn path, which records into `stats`. */
    this.stats = {
      kills: 0, losses: 0, damage: 0, healing: 0, cmdDamageTaken: 0,
      guardiansLost: 0, deployed: 0, commandSpent: 0, pointsHeld: 0,
      killsByCard: {}, maxUnits: 0,
    };
    this.logLines = [];
    this.floaters = [];
    this._auraT = 0;
    this._syn = new Map();

    /* ------------------------------------------------------------- boss */
    this.boss = null;
    this.bossPhaseN = 1;
    this.aliveTotems = 0;
    this.totems = [];
    this.pylons = [];
    if (o.enemy?.boss) this._spawnBoss(o.enemy.boss, o.enemy.level || 1);

    this._applyModifiers();
    bus.emit(EV.BATTLE_START, { node: this.node });
  }

  /* ======================================================================
     SETUP
     ====================================================================== */

  _buildStructureModels() {
    for (const s of this.allStructures) {
      const m = s.kind === 'banner' ? Props.battleBanner(s.team) : Props.battleTower(s.team);
      m.position.set(s.x, this.field.heightAt(s.x, s.z), s.z);
      if (s.kind === 'tower') m.rotation.y = s.x > 0 ? -0.4 : 0.4;
      this.scene.add(m);
      s.model = m;
      s.y = m.position.y;
      // health ring at the base
      const rmat = MATS.emissive(s.team === 0 ? PAL.teamPlayerGlow : PAL.teamEnemyGlow, 0.55).clone();
      rmat.transparent = true;
      const hr = new THREE.Mesh(ring(s.radius + 0.6, s.radius + 1.0, 28, { color: 0xffffff, rx: -Math.PI / 2, grad: 0 }), rmat);
      hr.position.set(s.x, s.y + 0.06, s.z);
      hr.renderOrder = 2;
      this.scene.add(hr);
      s.ring = hr;
    }
  }

  _buildPointModels() {
    for (const p of this.points) {
      const m = Props.controlPoint();
      m.position.set(p.x, this.field.heightAt(p.x, p.z), p.z);
      this.scene.add(m);
      p.model = m;
      p.y = m.position.y;
      m.userData.setOwner(-1, 0);
    }
  }

  _buildCommanderModels() {
    for (const c of this.commanders) {
      const rig = buildCommanderModel(c.equipped, { team: c.team });
      rig.root.position.set(c.x, 0, c.z);
      this.unitGroup.add(rig.root);
      c.rig = rig;
    }
  }

  _initHand() {
    this.drawPile = this.rng.shuffle(this.playerDeck.map((_, i) => i));
    this.hand = [];
    for (let i = 0; i < CFG.battle.handSize; i++) this._drawCard();
    this.nextCard = this._peekNext();
  }

  _drawCard() {
    if (!this.drawPile.length) this.drawPile = this.rng.shuffle(this.playerDeck.map((_, i) => i));
    const idx = this.drawPile.shift();
    if (idx === undefined) return;
    this.hand.push(idx);
  }

  _peekNext() {
    if (!this.drawPile.length) return this.playerDeck.length ? 0 : null;
    return this.drawPile[0];
  }

  handSize() {
    return CFG.battle.handSize + (this.opts.playerStats?.specials?.extraHandSlot ? 1 : 0);
  }

  _applyModifiers() {
    if (this.modifiers.has('swarm')) this.director.commandRegenMult = 1.25;
    if (this.modifiers.has('fireGround')) {
      for (let i = 0; i < 5; i++) {
        const x = this.rng.range(-20, 20), z = this.rng.range(-18, 18);
        this.groundEffect({
          x, z, r: 4, dur: 9999, team: -1, interval: 0.6, decal: 'fire', permanent: true,
          onTick: (u) => { this.dealDamage(null, u, 10, 'fire', { silent: true, noCrit: true }); this.applyStatus(u, 'burning', 2, { dps: 6 }); },
        });
      }
    }
    if (this.modifiers.has('poisonGround')) {
      for (let i = 0; i < 4; i++) {
        const x = this.rng.range(-22, 22), z = this.rng.range(-16, 16);
        this.groundEffect({
          x, z, r: 5, dur: 9999, team: -1, interval: 0.8, decal: 'poison', permanent: true,
          onTick: (u) => { if (!u.flying) this.applyStatus(u, 'poisoned', 3, { dps: 7 }); },
        });
      }
    }
    if (this.modifiers.has('nightfall')) this.sightMult = 0.5;
    if (this.modifiers.has('highWind')) this.windMod = true;
  }

  _spawnBoss(bossId, level) {
    const u = UNITS[bossId];
    if (!u) return;
    const e = this.spawn(bossId, 1, 0, CFG.field.bannerZ - 10, { lvl: level, boss: true });
    if (!e) return;
    this.boss = e;
    e.isBoss = true;
    e.battleRef = this;

    // boss-specific set dressing
    if (bossId === 'bossGribnak') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5;
        const tx = Math.cos(a) * 9, tz = CFG.field.bannerZ - 10 + Math.sin(a) * 9;
        const t = new Structure({
          id: 'totem' + i, kind: 'totem', team: 1, x: tx, z: tz, hp: 900, radius: 1.2, armor: 6, name: 'War Totem',
        });
        const m = Props.totem({ glow: 0x8fbf4a });
        m.position.set(tx, this.field.heightAt(tx, tz), tz);
        this.scene.add(m);
        t.model = m; t.y = m.position.y;
        this.allStructures.push(t);
        this.totems.push(t);
      }
      this.aliveTotems = 3;
    }
    if (bossId === 'bossWarden') {
      const spots = [[-14, 20], [14, 20], [-14, 34], [14, 34]];
      const auras = ['armor', 'haste', 'reflect', 'regen'];
      const names = ['Pylon of Stone', 'Pylon of Swiftness', 'Pylon of Mirrors', 'Pylon of Renewal'];
      const colors = [0x8d95a3, 0xffd479, 0xb07fd0, 0x5fa25a];
      spots.forEach(([px, pz], i) => {
        const p = new Structure({
          id: 'pylon' + i, kind: 'pylon', team: 1, x: px, z: pz, hp: 2200, radius: 1.4, armor: 20, name: names[i],
        });
        p.aura = auras[i];
        const m = Props.pylon({ glow: colors[i] });
        m.position.set(px, this.field.heightAt(px, pz), pz);
        this.scene.add(m);
        p.model = m; p.y = m.position.y;
        this.allStructures.push(p);
        this.pylons.push(p);
      });
    }
  }

  /* ======================================================================
     THE FACADE — every ability in the game speaks this
     ====================================================================== */

  /* ---------------------------------------------------------- queries */

  _isEnemy(self, e) { return e.team !== self.team; }

  /**
   * Enemy UNITS near a point. Structures are deliberately excluded: an ability
   * that wants walls asks for them explicitly via `b.structures(team)`. Letting
   * a banner fall out of here is how you end up trying to stun a tower.
   */
  enemiesNear(self, x, z, r, opt = {}) {
    const team = self.team;
    return this.grid.queryFiltered(x, z, r, e =>
      e.alive && e.team !== team && !e.untargetable && e.ready !== false &&
      (opt.structures || !e.isStructure));
  }

  alliesNear(self, x, z, r, opt = {}) {
    const team = self.team;
    return this.grid.queryFiltered(x, z, r, e =>
      e.alive && e.team === team && (opt.withSelf || e !== self) && !e.isStructure);
  }

  enemiesInCone(self, angle, halfAngle, range) {
    return this.enemiesNear(self, self.x, self.z, range).filter(e => {
      const a = Math.atan2(e.z - self.z, e.x - self.x);
      return Math.abs(angleDelta(angle, a)) <= halfAngle;
    });
  }

  alliesInCone(self, angle, halfAngle, range) {
    return this.alliesNear(self, self.x, self.z, range).filter(e => {
      const a = Math.atan2(e.z - self.z, e.x - self.x);
      return Math.abs(angleDelta(angle, a)) <= halfAngle;
    });
  }

  nearestEnemy(self, r, opt = {}) {
    const list = this.enemiesNear(self, self.x, self.z, r);
    if (!list.length) return null;
    if (opt.prefer) {
      const pref = list.filter(e => opt.prefer.includes(e.role));
      if (pref.length) return closest(self, pref);
    }
    return closest(self, list);
  }

  lowestHpAlly(self, r, opt = {}) {
    const list = this.alliesNear(self, self.x, self.z, r, opt);
    let best = null, bestF = opt.hurtOnly ? 0.985 : 2;
    for (const a of list) {
      const f = a.hp / a.maxHp;
      if (f < bestF) { bestF = f; best = a; }
    }
    return best;
  }

  highestThreatEnemy(self, r) {
    const list = this.enemiesNear(self, self.x, self.z, r);
    let best = null, bestT = -1;
    for (const e of list) {
      const t = e.threat ? e.threat() : 0;
      if (t > bestT) { bestT = t; best = e; }
    }
    return best;
  }

  structures(team) { return this.allStructures.filter(s => s.alive && (team === undefined || s.team === team)); }

  corpsesNear(x, z, r) {
    const r2 = r * r;
    return this.corpses.filter(c => !c.used && (c.x - x) ** 2 + (c.z - z) ** 2 <= r2);
  }

  consumeCorpse(c) { c.used = true; c.t = 0; }

  hasStatus(u, id) { return u.hasStatus ? u.hasStatus(id) : false; }

  /* ----------------------------------------------------------- effects */

  fx(name, x, y, z, opt) { this.fxSys.play(name, x, y, z, opt || {}); }

  sound(name, x, z, opt = {}) {
    const pan = clamp((x / (this.field.W / 2)) * 0.7, -0.75, 0.75);
    audio.play(name, { pan, ...opt });
  }

  /** Abilities call this as `b.shake(amount)`. */
  /** Abilities call this as `b.shake(amount)`. The battle only ACCUMULATES an
   *  impulse; the camera rig owns the decay and the actual offset, so shake
   *  can never interfere with where the player is pointing. */
  shake(a) { if (this.opts.cameraShake !== false) this.shakeAmt = Math.min(CFG.cam.maxShake, this.shakeAmt + a); }

  /** Drain the accumulated impulse. Called once per frame by the camera rig. */
  consumeShake() { const v = this.shakeAmt; this.shakeAmt = 0; return v; }

  log(text, team) {
    this.logLines.push({ text, team, t: this.t });
    if (this.logLines.length > 6) this.logLines.shift();
    this.opts.onEvent?.({ kind: 'log', text, team });
  }

  /* ---------------------------------------------------------- statuses */

  applyStatus(u, id, dur, data = {}) {
    if (!u || !u.alive) return null;
    const def = STATUS[id];
    if (!def) return null;
    if (id === 'oiled') dur *= this.oilDurationMult;
    if (def.kind === 'debuff' && u.debuffImmuneUntil > 0) return null;
    const st = u.addStatus(id, dur, { ...data, def });
    if (st && def.kind === 'debuff' && u.isBoss) st.t = Math.min(st.t, dur * 0.5);  // bosses shrug off half of it
    return st;
  }

  removeStatus(u, id) { u.removeStatus?.(id); }
  cleanse(u) { u.cleanse?.(); }

  /* ------------------------------------------------------------ damage */

  /**
   * The one damage path.
   * @returns the damage actually dealt
   */
  dealDamage(src, tgt, amount, dmgType, opt = {}) {
    // `!(amount > 0)` rather than `amount <= 0`: NaN fails every comparison, so
    // the obvious form lets a NaN straight through and it then sticks to the
    // target's health for the rest of the battle.
    if (!tgt || !tgt.alive || !(amount > 0)) return 0;

    // rotating ward (Solveil) and similar hard immunities
    if (tgt.passives) {
      for (const p of tgt.passives) {
        if (p.onIncoming) {
          amount = p.onIncoming(tgt, dmgType, amount, this.t);
          if (amount <= 0) {
            this._floater(tgt, 'IMMUNE', 'weak');
            this.fx('block', tgt.x, 1.2, tgt.z, {});
            return 0;
          }
        }
      }
    }

    // outgoing modifiers declared by the attacker's abilities
    if (src && src.outgoingHooks) {
      for (const h of src.outgoingHooks) amount = h.onOutgoing(src, tgt, amount);
    }

    const mults = (opt.mults || []).slice();

    // structure bonus
    if (tgt.isStructure) {
      mults.push((src?.structureMult || 1) * (this.bonuses.structureDamageMult || 1));
      if (src?.role === 'siege') mults.push(this.bonuses.siegeStructureMult || 1);
    }

    // ranged / magic / element specific taken-multipliers
    const m = tgt.mods || {};
    const isRanged = src && !opt.isAbility && (src.baseRange > 3.6 || src.range > 3.6);
    if (isRanged) mults.push((m.rangedTakenMult ?? 1) * (tgt.rangedTakenBase ?? 1));
    if (dmgType === 'fire') mults.push(m.fireTakenMult ?? 1);
    if (dmgType === 'arcane' || dmgType === 'shadow') mults.push(tgt.auraMagicResistApplied ?? 1);
    mults.push(m.dmgTakenMult ?? 1);

    // cover: ranged damage into a treeline is blunted
    if (isRanged && this.field.inCover(tgt.x, tgt.z)) mults.push(1 - CFG.battle.coverReduction);

    // high ground for the attacker
    if (src && !src.isStructure && src.baseRange > 3.6 && this.field.isHighGround(src.x, src.z))
      mults.push(1 + CFG.battle.highGroundBonus);

    // focused volley: ranged units punish immobilised targets
    if (isRanged && (tgt.hasStatus?.('rooted') || tgt.hasStatus?.('frozen') || tgt.hasStatus?.('slowed')))
      mults.push(1.3);

    // commander aura
    if (src && !src.isCommander && !src.isStructure) {
      const cmd = this.commanders.find(c => c.team === src.team && c.alive);
      if (cmd && Math.hypot(cmd.x - src.x, cmd.z - src.z) < cmd.aura.radius) mults.push(1 + cmd.aura.dmg);
    }

    const flank = !opt.isAbility && src && tgt.isFlankedBy && tgt.isFlankedBy(src);

    let armor = tgt.armor ?? 0;
    if (opt.ignoreArmor || src?.ignoreArmor) armor = 0;
    else if (opt.pierceArmor) armor *= (1 - opt.pierceArmor);
    else if (src?.pierceArmor) armor *= (1 - src.pierceArmor);

    const res = resolveDamage({
      amount, dmgType, armorType: tgt.armorType, armor,
      critChance: opt.noCrit ? 0 : (opt.critChance ?? (src?.specials?.critChance ?? CFG.battle.baseCrit)),
      flank, backstab: opt.backstab, mults, rand: Math.random,
    });

    // One bad multiplier anywhere in the chain must not be able to poison a
    // unit's health permanently. This is the last line of defence, not an
    // excuse for the ones above it.
    if (!isFinite(res.dmg)) return 0;

    let dmg = res.dmg;

    // wards absorb first
    const shield = tgt.getStatus?.('shielded');
    if (shield && shield.hp > 0) {
      const absorbed = Math.min(shield.hp, dmg);
      shield.hp -= absorbed;
      dmg -= absorbed;
      this.fx('block', tgt.x, 1.2, tgt.z, {});
      if (shield.hp <= 0) tgt.removeStatus('shielded');
      if (dmg <= 0) return absorbed;
    }

    // mana shield from gear
    if (tgt.isCommander && tgt.specials?.manaShield) {
      dmg *= (1 - tgt.specials.manaShield);
    }

    tgt.hp -= dmg;
    tgt.hurtT = 1;
    tgt.lastAttacker = src;
    if (src) { src.damageDealt = (src.damageDealt || 0) + dmg; }
    if (src && src.team === 0) this.stats.damage += dmg;
    if (tgt.isCommander && tgt.team === 0) this.stats.cmdDamageTaken += dmg;

    // magic reflection
    if (tgt.reflectMagic && (dmgType === 'arcane' || dmgType === 'shadow' || dmgType === 'fire' || dmgType === 'frost') && src && src !== tgt) {
      const back = dmg * tgt.reflectMagic;
      this.dealDamage(tgt, src, back, dmgType, { silent: true, noCrit: true });
      this.fx('shieldFlare', tgt.x, 1.2, tgt.z, { color: 0x9a6fe0, scale: 1.4 });
    }

    // onDamaged hooks
    if (tgt.onDamagedHooks) {
      for (const h of tgt.onDamagedHooks) h.run(this, tgt, { attacker: src, dmg });
    }
    if (tgt.isCommander) tgt.onDamaged(this, dmg, src);

    // feedback
    if (!opt.silent) {
      const cls = res.counter >= 1.4 ? 'strong' : res.counter <= 0.7 ? 'weak' : (tgt.team === 0 ? 'you' : 'foe');
      this._floater(tgt, Math.round(dmg), res.crit ? 'crit' : cls);
      if (tgt.armorType === 'heavy' || tgt.armorType === 'structure') this.sound('hit.metal', tgt.x, tgt.z, { vol: 0.5 });
      else if (tgt.armorType === 'undead') this.sound('hit.stone', tgt.x, tgt.z, { vol: 0.4 });
      else this.sound('hit.flesh', tgt.x, tgt.z, { vol: 0.5 });
      if (tgt.isStructure) this.fx('structureHit', tgt.x, 2, tgt.z, {});
      else this.fx(res.crit ? 'sparks' : 'bloodHit', tgt.x, 1.1, tgt.z, { scale: res.crit ? 1.4 : 1 });
    }

    bus.emit(EV.DAMAGE_DEALT, { src, tgt, dmg, dmgType, counter: res.counter, crit: res.crit, team: src?.team });

    if (tgt.hp <= 0) this._kill(tgt, src, dmgType);
    return dmg;
  }

  heal(tgt, amount, src) {
    if (!tgt || !tgt.alive || !(amount > 0)) return 0;   // NaN-safe, see dealDamage
    amount *= (this.bonuses.healMult || 1) * (src?.healMult || 1) * (tgt.mods?.healTakenMult ?? 1);
    const cap = (tgt.healCap ?? 1) * tgt.maxHp;
    const before = tgt.hp;
    tgt.hp = Math.min(cap, tgt.hp + amount);
    const done = tgt.hp - before;
    if (done > 0.5) {
      this._floater(tgt, '+' + Math.round(done), 'heal');
      this.stats.healing += done;
    }
    return done;
  }

  revive(u, frac) {
    u.alive = true;
    u.hp = u.maxHp * frac;
    u.deathT = 0;
    u.statuses.length = 0;
    if (u.rig) u.rig.pivot.rotation.x = 0;
    const i = this.deadThisFrame?.indexOf(u);
    if (i >= 0) this.deadThisFrame.splice(i, 1);
  }

  _kill(tgt, src, dmgType) {
    if (!tgt.alive) return;

    // last-stand style saves
    if (tgt.lethalHook && tgt.lethalHook.onLethal(this, tgt)) return;
    if (tgt.isCommander) { tgt.die(this, src); return; }

    tgt.alive = false;
    tgt.hp = 0;
    tgt.deathT = 0;

    if (tgt.isStructure) {
      this.fx('structureFall', tgt.x, 2.5, tgt.z, {});
      this.sound('structure.down', tgt.x, tgt.z);
      this.shake(0.7);
      this.log(tgt.name + ' destroyed', tgt.team === 0 ? 1 : 0);
      if (tgt.model) { tgt.model.visible = false; }
      if (tgt.ring) tgt.ring.visible = false;
      if (tgt.kind === 'totem') {
        this.aliveTotems--;
        if (this.aliveTotems === 0) {
          this.log('The totems are broken — the King is vulnerable', 0);
          this.opts.onEvent?.({ kind: 'callout', big: 'TOTEMS DOWN', small: 'Gribnak is vulnerable' });
        }
      }
      if (tgt.kind === 'pylon') {
        this.log(tgt.name + ' silenced', 0);
        this.opts.onEvent?.({ kind: 'callout', big: 'PYLON DOWN', small: tgt.name });
      }
      bus.emit(EV.STRUCTURE_DESTROYED, {
        kind: tgt.kind, team: tgt.team,
        towersAlive: this.allStructures.filter(s => s.kind === 'tower' && s.team === tgt.team && s.alive).length,
      });
      if (tgt.kind === 'banner') this._endBattle(tgt.team === 1);
      return;
    }

    // corpse
    const linger = CFG.battle.corpseLinger * this.corpseLingerMult;
    if (dmgType !== 'fire' && !tgt.summoned) this.corpses.push(new Corpse(tgt, linger));

    this.fx(tgt.mass >= 4 ? 'crater' : 'bloodHit', tgt.x, 1, tgt.z, { scale: tgt.mass >= 4 ? 2 : 1.3 });
    this.sound(tgt.mass >= 3 ? 'die.big' : 'die', tgt.x, tgt.z, { vol: 0.6 });

    for (const h of tgt.onDeathHooks) h.run(this, tgt, { killer: src });
    if (tgt.owner && tgt.owner.alive) {
      for (const h of tgt.owner.minionDeathHooks || []) h.onMinionDeath(this, tgt.owner);
    }

    if (src) {
      src.kills = (src.kills || 0) + 1;
      if (src.onKillHooks) for (const h of src.onKillHooks) h.run(this, src, { victim: tgt });
      if (src.team === 0) {
        this.stats.kills++;
        const cid = src.cardId;
        if (cid) this.stats.killsByCard[cid] = (this.stats.killsByCard[cid] || 0) + 1;
      }
    }
    if (tgt.team === 0) {
      this.stats.losses++;
      if (tgt.role === 'guardian') this.stats.guardiansLost++;
    }

    bus.emit(EV.UNIT_DIED, {
      team: tgt.team, cardId: tgt.cardId, byFire: dmgType === 'fire',
      wasOiled: tgt.hasStatus && tgt.hasStatus('oiled'),
    });

    // poison spread
    const pois = tgt.getStatus && tgt.getStatus('poisoned');
    if (pois && pois.spread) {
      for (const e of this.enemiesNear(pois.src || tgt, tgt.x, tgt.z, 4))
        this.applyStatus(e, 'poisoned', 5, { src: pois.src, dps: pois.dps });
    }
    // burning spread
    const burn = tgt.getStatus && tgt.getStatus('burning');
    if (burn) {
      for (const e of this.enemiesNear(burn.src || tgt, tgt.x, tgt.z, 3))
        this.applyStatus(e, 'burning', 3, { src: burn.src, dps: burn.dps * 0.6 });
    }

    if (tgt === this.boss) {
      this.log(tgt.name + ' has fallen', 0);
      this.opts.onEvent?.({ kind: 'callout', big: 'COMMANDER SLAIN', small: tgt.name });
      this._endBattle(true);
    }
  }

  /* -------------------------------------------------------- spawning */

  spawn(unitId, team, x, z, opt = {}) {
    const u = UNITS[unitId];
    if (!u) return null;
    if (this.units.filter(e => e.team === team && e.alive).length >= CFG.battle.maxUnitsPerSide) return null;

    const pos = this.field.resolve(x, z);
    const stats = {
      bonusArmor: 0, bonusHpMult: 1, bonusCount: 0, bonusDmgMult: 1, bonusMoveMult: 1,
      cdMult: 1, structureMult: 1, healMult: 1, bonusRange: 0, rangedTakenMult: 1,
      stealthBonus: 0, backstabBonus: 0,
      ...u,
    };
    if (team === 0) applyDeckSynergies(this.deckSynergies, stats);

    const e = new Entity({
      unit: u, team, x: pos.x, z: pos.z,
      level: opt.lvl || 1,
      summoned: opt.summoned, owner: opt.owner,
      awakened: opt.awakened,
      hpMult: (team === 0 ? (this.bonuses.unitHpMult || 1) : 1) * (stats.bonusHpMult || 1),
      dmgMult: stats.bonusDmgMult,
      moveMult: stats.bonusMoveMult,
      bonusArmor: stats.bonusArmor,
      bonusRange: stats.bonusRange,
      cdMult: stats.cdMult,
      structureMult: stats.structureMult,
      healMult: stats.healMult,
      rangedTakenMult: stats.rangedTakenMult,
      stealthBonus: stats.stealthBonus,
      backstabBonus: stats.backstabBonus,
      scale: opt.scale,
      life: opt.life,
      spawnDelay: opt.instant ? 0 : CFG.battle.deployDelaySec,
    });
    if (opt.boss) { e.isBoss = true; e.maxHp = Math.round(e.maxHp); e.hp = e.maxHp; }
    if (opt.escort) e.escort = opt.escort;
    e.battleRef = this;
    e.y = this.field.heightAt(e.x, e.z);

    const rig = buildUnitModel(u, e.lvl, team);
    if (opt.scale) rig.root.scale.multiplyScalar(opt.scale);
    rig.root.position.set(e.x, e.y, e.z);
    this.unitGroup.add(rig.root);
    e.rig = rig;
    e.radius = Math.max(0.3, rig.radius);
    e.flying = rig.flying || e.flying;

    this.units.push(e);
    this.fx('deploySpawn', e.x, 0.1, e.z, { color: team === 0 ? PAL.teamPlayerGlow : PAL.teamEnemyGlow });

    if (e.spawnHook) for (const h of e.spawnHook) h.run(this, e);

    bus.emit(EV.UNIT_SPAWNED, { team, cardId: unitId });
    this.stats.maxUnits = Math.max(this.stats.maxUnits, this.units.filter(x => x.alive).length);
    return e;
  }

  /**
   * Deploy a whole card (its `count` bodies, in formation).
   * @returns true if it was paid for and placed
   */
  deploy(cardIndex, x, z, team = 0) {
    const card = team === 0 ? this.playerDeck[cardIndex] : cardIndex;
    const unit = team === 0 ? card.unit : UNITS[cardIndex];
    if (!unit) return false;

    const cost = unit.cost;
    if (this.command[team] < cost) return false;
    if (team === 0 && !this.canDeployAt(x, z, 0)) return false;

    this.command[team] -= cost;
    if (team === 0) { this.stats.commandSpent += cost; this.stats.deployed++; }

    let count = unit.count || 1;
    if (team === 0) {
      const s = { cost: unit.cost, bonusCount: 0, tags: unit.tags, role: unit.role };
      applyDeckSynergies(this.deckSynergies, s);
      count += s.bonusCount;
    }

    const lvl = team === 0 ? card.level : (this.opts.enemy?.level || 1);
    const awakened = team === 0 ? card.awakened : false;

    const spread = 0.9 + count * 0.34;
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? 0 : (i / count) * TAU;
      const d = count === 1 ? 0 : spread;
      this.spawn(unit.id, team, x + Math.cos(a) * d, z + Math.sin(a) * d, { lvl, awakened });
    }

    this.sound('deploy', x, z);
    this.fx('deploySpawn', x, 0.1, z, { color: team === 0 ? PAL.teamPlayerGlow : PAL.teamEnemyGlow, scale: 1.4 });

    if (team === 0) {
      const hi = this.hand.indexOf(cardIndex);
      if (hi >= 0) { this.hand.splice(hi, 1); this._drawCard(); this.nextCard = this._peekNext(); }
    }
    return true;
  }

  canDeployAt(x, z, team) {
    if (!this.field.inBounds(x, z)) return false;
    if (this.field.isBlocked(x, z)) return false;
    const line = this.deployLine[team];
    return team === 0 ? z <= line + CFG.battle.deployMargin : z >= line - CFG.battle.deployMargin;
  }

  _updateDeployLines() {
    for (const team of [0, 1]) {
      const owned = this.points.filter(p => p.owner === team).length;
      const base = team === 0 ? CFG.field.deployLineOwn : -CFG.field.deployLineOwn;
      const push = owned * CFG.field.pushPerPoint * (team === 0 ? 1 : -1);
      this.deployLine[team] = base + push;
    }
    if (this.deployZone) this.deployZone.userData.set(this.deployLine[0]);
  }

  /* --------------------------------------------------------- movement */

  knockback(tgt, fromX, fromZ, force) {
    if (!tgt || tgt.ccImmune || tgt.isStructure) return;
    if (tgt.isCommander && tgt.tempCcImmune > this.t) return;
    const a = Math.atan2(tgt.z - fromZ, tgt.x - fromX);
    const scale = force / Math.max(1, tgt.mass);
    tgt.knock = { vx: Math.cos(a) * scale, vz: Math.sin(a) * scale, t: 0.35 };
  }

  pull(tgt, toX, toZ, force) {
    if (!tgt || tgt.ccImmune || tgt.isStructure) return;
    const a = Math.atan2(toZ - tgt.z, toX - tgt.x);
    const scale = force / Math.max(1, tgt.mass);
    tgt.knock = { vx: Math.cos(a) * scale, vz: Math.sin(a) * scale, t: 0.4 };
  }

  teleport(u, x, z) {
    const p = this.field.resolve(clamp(x, -this.field.W / 2 + 2, this.field.W / 2 - 2),
      clamp(z, -this.field.L / 2 + 2, this.field.L / 2 - 2));
    u.x = p.x; u.z = p.z;
    u.y = this.field.heightAt(u.x, u.z);
  }

  leap(self, x, z, dur, onLand, opt = {}) {
    this.leaps.push({
      u: self, x0: self.x, z0: self.z, x1: x, z1: z, t: 0, dur,
      arc: opt.arc ?? 2.6, onLand,
    });
    self.leaping = true;
  }

  dash(self, angle, speed, dur, opt = {}) {
    self.dash = { angle, speed, t: dur, hit: new Set(), onPass: opt.onPass };
  }

  /* ------------------------------------------------------- projectiles */

  projectile(o) {
    this.projectiles.push({
      src: o.src, x: o.x, y: o.y ?? 1.2, z: o.z,
      vx: Math.cos(o.angle) * o.speed, vz: Math.sin(o.angle) * o.speed,
      vy: o.arc ? o.arc : 0,
      speed: o.speed, range: o.range ?? 20, travelled: 0,
      dmg: o.dmg, dmgType: o.dmgType, splash: o.splash || 0,
      pierce: o.pierce || 0, hit: new Set(),
      color: o.color ?? 0xd8cbb0, trail: o.trail, target: o.target,
      homing: o.homing, onHit: o.onHit, ignoreArmor: o.ignoreArmor,
      size: o.size ?? 0.14, status: o.status,
    });
  }

  beam(a, bTarget, o = {}) {
    this.fxSys.beamFx(a.x, (a.y ?? 0) + 1.2, a.z, bTarget.x, (bTarget.y ?? 0) + 1.2, bTarget.z, o);
  }

  castDelayed(self, delay, fn) { this.delayed.push({ t: delay, fn, self }); }

  telegraph(x, z, r, dur, color, o) { this.fxSys.telegraph(x, z, r, dur, color, o); }

  groundEffect(o) {
    this.grounds.push({
      x: o.x, z: o.z, r: o.r, t: 0, dur: o.dur, team: o.team,
      interval: o.interval ?? 0.5, acc: 0, onTick: o.onTick, permanent: o.permanent,
      decal: o.decal,
    });
    if (o.decal === 'oil') this.fxSys.decal({ x: o.x, z: o.z, r: o.r * 1.1, color: 0x14100a, alpha: 0.55, life: o.dur });
    if (o.decal === 'poison') this.fxSys.decal({ x: o.x, z: o.z, r: o.r * 1.1, color: 0x2a3a1a, alpha: 0.4, life: Math.min(o.dur, 40), pulse: 2 });
  }

  zoneEffect(o) {
    this.zones.push({ ...o, t: 0 });
  }

  /* ------------------------------------------------------------ command */

  grantCommand(team, n) {
    this.command[team] = Math.min(this.commandMax[team], this.command[team] + n);
  }

  drainCommand(team, n) {
    const took = Math.min(this.command[team], n);
    this.command[team] -= took;
    return took;
  }

  bossPhase(u, phase) {
    this.bossPhaseN = phase;
    bus.emit(EV.BOSS_PHASE, { phase, boss: u.name });
    this.opts.onEvent?.({ kind: 'callout', big: 'PHASE ' + phase, small: u.name + ' changes' });
    this.opts.postfx?.pulse?.(0xc5362b, 0.4);
  }

  onCommanderDown(c, killer) {
    if (c.team === 0) {
      this.drainCommand(0, CFG.battle.respawnPenalty);
      this.log('You have fallen — respawning', 0);
      this.opts.onEvent?.({ kind: 'callout', big: 'YOU HAVE FALLEN', small: 'Respawning at your banner' });
      this.opts.postfx?.pulse?.(0x8e2018, 0.5);
    } else {
      this.log('Enemy commander down', 0);
    }
    this.fx('smoke', c.x, 1, c.z, { scale: 2 });
    bus.emit(EV.COMMANDER_DOWN, { team: c.team });
  }

  /* ======================================================================
     UPDATE
     ====================================================================== */

  update(dt, intent) {
    this.realT += dt;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.state = 'running';
        this.opts.onEvent?.({ kind: 'callout', big: 'BEGIN', small: this.opts.subtitle || '' });
        this.sound('horn', 0, 0);
      }
      this._syncRigs(dt);
      return;
    }
    if (this.state === 'over') { this._syncRigs(dt); this.fxSys.update(dt); return; }

    dt = Math.min(dt, 0.05) * this.speed;
    this.t += dt;

    /* 1. command */
    for (const team of [0, 1]) {
      const owned = this.points.filter(p => p.owner === team).length;
      let regen = CFG.battle.commandRegen + owned * CFG.battle.commandPerPoint;
      if (team === 0) regen *= this.commandRegenMult;
      else regen *= this.director.commandRegenMult;
      // logistics-style passives
      for (const u of this.units) {
        if (u.alive && u.team === team && u.commandRegenBonus) regen *= 1 + u.commandRegenBonus;
      }
      this.command[team] = Math.min(this.commandMax[team], this.command[team] + regen * dt);
    }

    /* 2. spatial grid */
    const all = this.units.filter(u => u.alive);
    this.grid.rebuild([...all, ...this.commanders.filter(c => c.alive), ...this.allStructures.filter(s => s.alive)]);

    /* 3. auras + field synergies at 4 Hz */
    this._auraT += dt;
    if (this._auraT >= 1 / AURA_HZ) {
      this._auraT = 0;
      this._gatherAuras();
    }

    /* 4. units */
    for (const u of this.units) {
      if (!u.alive) { u.deathT += dt; continue; }
      this._updateUnit(u, dt);
    }

    /* 5. commanders */
    this.player.update(this, dt, intent || IDLE_INTENT);
    if (this.enemyCommander) this._updateEnemyCommander(dt);

    /* 6. projectiles, leaps, grounds, delayed */
    this._updateProjectiles(dt);
    this._updateLeaps(dt);
    this._updateGrounds(dt);
    this._updateZones(dt);
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.delayed.splice(i, 1);
        if (!d.self || d.self.alive) { try { d.fn(); } catch (e) { console.error(e); } }
      }
    }

    /* 7. structures + points */
    this._updateStructures(dt);
    this._updatePoints(dt);

    /* 8. director */
    this.director.update(dt);

    /* 9. corpses & cleanup */
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      this.corpses[i].t -= dt;
      if (this.corpses[i].t <= 0) swapRemove(this.corpses, i);
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (!u.alive && u.deathT > 2.2) {
        if (u.rig) { this.unitGroup.remove(u.rig.root); u.rig.dispose(); }
        swapRemove(this.units, i);
      }
    }

    /* 10. timer / victory */
    if (this.t >= CFG.battle.duration) this._suddenDeath();

    /* 11. presentation */
    this._syncRigs(dt);
    this.fxSys.update(dt);
    this.field.update(dt, this.realT);
    this._updateFloaters(dt);
  }

  /* ------------------------------------------------------------- auras */

  _gatherAuras() {
    const actors = [...this.units.filter(u => u.alive && u.ready), ...this.commanders.filter(c => c.alive)];

    // ability auras
    for (const u of this.units) {
      if (!u.alive || !u.ready || u.silenced) continue;
      for (const a of u.auras) {
        try { a.aura(this, u); } catch (e) { /* an aura must not kill the frame */ }
      }
    }

    // pylon auras (Stone Warden)
    for (const p of this.pylons) {
      if (!p.alive) continue;
      for (const u of this.units) {
        if (!u.alive || u.team !== 1) continue;
        if (p.aura === 'armor') u.auraArmor += 10;
        else if (p.aura === 'haste') u.auraAtkSpeed *= 1.25;
        else if (p.aura === 'reflect') u.auraDmgTaken *= 0.8;
        else if (p.aura === 'regen' && this.t % 1 < 0.3) this.heal(u, u.maxHp * 0.01, null);
      }
      if (this.boss) {
        if (p.aura === 'armor') this.boss.auraArmor += 24;
        if (p.aura === 'haste') this.boss.auraAtkSpeed *= 1.3;
        if (p.aura === 'reflect') this.boss.auraDmgTaken *= 0.72;
        if (p.aura === 'regen') this.heal(this.boss, this.boss.maxHp * 0.004, null);
      }
    }

    // field synergies
    this._syn.clear();
    for (const u of this.units) {
      if (!u.alive || !u.ready) continue;
      u.activeSynergies.clear();
      for (const s of FIELD_SYNERGIES) {
        const allies = this.alliesNear(u, u.x, u.z, s.radius || 7);
        let on = false;
        try { on = s.field(this, u, allies); } catch (e) { on = false; }
        if (on) {
          u.activeSynergies.add(s.id);
          if (u.team === 0) this._syn.set(s.id, (this._syn.get(s.id) || 0) + 1);
        }
      }
      // fold magic resist into a form dealDamage can read
      u.auraMagicResistApplied = u.auraMagicResist;
    }
    if (this._syn.size) {
      this.opts.onEvent?.({ kind: 'synergies', list: [...this._syn.entries()].map(([id, n]) => ({ id, n, def: SYNERGIES[id] })) });
    } else {
      this.opts.onEvent?.({ kind: 'synergies', list: [] });
    }
  }

  /* ------------------------------------------------------------- units */

  _updateUnit(u, dt) {
    u.age += dt;
    if (u.lifeLimit && u.age > u.lifeLimit) { this._kill(u, null, 'shadow'); return; }

    if (u.spawnDelay > 0) {
      u.spawnDelay -= dt;
      u.y = this.field.heightAt(u.x, u.z);
      return;
    }

    u.tickStatuses(this, dt);
    u.recalc();
    u.hurtT = Math.max(0, u.hurtT - dt * 4);
    u.attackCd = Math.max(0, u.attackCd - dt);
    for (const k in u.abilityCd) u.abilityCd[k] = Math.max(0, u.abilityCd[k] - dt);

    // periodic self-tick abilities (Void Phase)
    if (u.tickAbility) {
      u.tickT -= dt;
      if (u.tickT <= 0) { u.tickT = u.tickAbility.tickInterval; u.tickAbility.onTick(this, u); }
    }

    /* --- knockback / dash / leap take priority over normal motion --- */
    if (u.knock && u.knock.t > 0) {
      u.knock.t -= dt;
      const nx = u.x + u.knock.vx * dt, nz = u.z + u.knock.vz * dt;
      const p = this.field.isBlocked(nx, nz) ? { x: u.x, z: u.z } : { x: nx, z: nz };
      u.x = p.x; u.z = p.z;
      u.knock.vx *= 0.88; u.knock.vz *= 0.88;
      u.y = this.field.heightAt(u.x, u.z);
      if (u.knock.t <= 0) u.knock = null;
      return;
    }
    if (u.leaping) { u.y = this.field.heightAt(u.x, u.z); return; }
    if (u.dash) {
      u.dash.t -= dt;
      const d = u.dash.speed * dt;
      const nx = u.x + Math.cos(u.dash.angle) * d, nz = u.z + Math.sin(u.dash.angle) * d;
      if (!this.field.isBlocked(nx, nz)) { u.x = nx; u.z = nz; }
      u.facing = u.dash.angle;
      u.speedNow = u.dash.speed;
      for (const e of this.enemiesNear(u, u.x, u.z, 2.2)) {
        if (u.dash.hit.has(e.id)) continue;
        u.dash.hit.add(e.id);
        u.dash.onPass?.(e);
      }
      if (u.dash.t <= 0) u.dash = null;
      u.y = this.field.heightAt(u.x, u.z);
      return;
    }

    if (u.stunned) { u.speedNow = 0; return; }

    /* --- targeting --- */
    u.retargetT = (u.retargetT || 0) - dt;
    if (!u.target || !u.target.alive || u.retargetT <= 0 || (u.target.untargetable && !u.target.isStructure)) {
      u.target = this._pickTarget(u);
      u.retargetT = 0.35 + Math.random() * 0.3;
    }
    if (u.forcedTarget && u.forcedTarget.alive && u.hasStatus('taunted')) u.target = u.forcedTarget;

    const tgt = u.target;

    /* --- abilities --- */
    if (!u.silenced) {
      for (const a of u.abilities) {
        if (u.abilityCd[a.id] > 0) continue;
        let want = true;
        try { want = a.want ? a.want(this, u) : true; } catch (e) { want = false; }
        if (!want) continue;
        u.abilityCd[a.id] = a.cd * u.cdMult;
        u.castTime = 0.45;
        try { a.run(this, u); } catch (e) { console.error('[ability]', a.id, e); }
        bus.emit(EV.ABILITY_USED, { unit: u.cardId, ability: a.id, team: u.team });
        // casting an ability triggers "on cast" passives
        for (const p of u.passives) if (p.onCast) p.onCast(this, u);
        break;   // one ability per frame keeps the pacing readable
      }
    }
    u.castTime = Math.max(0, u.castTime - dt);

    /* --- fleeing --- */
    if (u.fleeing) {
      const near = this.nearestEnemy(u, 20);
      if (near) {
        const a = Math.atan2(u.z - near.z, u.x - near.x);
        this._steer(u, u.x + Math.cos(a) * 8, u.z + Math.sin(a) * 8, dt, 1.15);
      }
      return;
    }

    if (!tgt) {
      // nothing to fight: advance toward the enemy banner
      const banner = this.allStructures.find(s => s.kind === 'banner' && s.team !== u.team && s.alive);
      if (banner) this._steer(u, banner.x, banner.z, dt, 1);
      return;
    }

    /* --- approach / kite --- */
    const d = u.distTo(tgt);
    const reach = u.range + (tgt.radius || 0.5) + u.radius * 0.6;
    const wantMin = u.minRange;

    if (d > reach * 0.96) {
      this._steer(u, tgt.x, tgt.z, dt, 1);
    } else if (wantMin && d < wantMin) {
      // siege engines back off rather than firing into their own feet
      const a = Math.atan2(u.z - tgt.z, u.x - tgt.x);
      this._steer(u, u.x + Math.cos(a) * 6, u.z + Math.sin(a) * 6, dt, 0.8);
    } else if (!u.isMelee && d < reach * 0.45 && u.role !== 'siege') {
      // ranged units back-pedal when something gets inside their guard
      const a = Math.atan2(u.z - tgt.z, u.x - tgt.x);
      this._steer(u, u.x + Math.cos(a) * 5, u.z + Math.sin(a) * 5, dt, 0.75);
      u.faceToward(tgt.x, tgt.z, dt);
    } else {
      u.speedNow = damp(u.speedNow, 0, 12, dt);
      u.faceToward(tgt.x, tgt.z, dt, 12);
      this._separate(u, dt);
    }

    /* --- attack --- */
    if (d <= reach && (!wantMin || d >= wantMin)) {
      if (u.attackCd <= 0) {
        u.attackCd = 1 / Math.max(0.05, u.atkSpeed);
        u.swing = 1;
        u.swingHit = false;
        u.swingTarget = tgt;
        u.swingDur = Math.min(0.55, u.attackCd * 0.6);
        if (u.isMelee) this.sound('swing', u.x, u.z, { vol: 0.35 });
        else this.sound(u.unit.art?.weapon === 'crossbow' ? 'crossbow' : u.role === 'caster' ? 'cast' : 'bow', u.x, u.z, { vol: 0.4 });
      }
    }

    if (u.swing > 0) {
      u.swing -= dt / (u.swingDur || 0.4);
      if (!u.swingHit && u.swing <= 0.55) {
        u.swingHit = true;
        this._resolveAttack(u, u.swingTarget);
      }
      if (u.swing < 0) u.swing = 0;
    }

    u.y = this.field.heightAt(u.x, u.z) + (u.flying ? 2.6 : 0);
    u.onHighGround = this.field.isHighGround(u.x, u.z);
  }

  _resolveAttack(u, tgt) {
    if (!tgt || !tgt.alive) return;
    const d = u.distTo(tgt);
    if (d > u.range + (tgt.radius || 0.5) + 1.5) return;

    if (u.isMelee) {
      this._landHit(u, tgt);
      if (u.splash) {
        for (const e of this.enemiesNear(u, tgt.x, tgt.z, u.splash)) {
          if (e === tgt) continue;
          this.dealDamage(u, e, u.damage * 0.55, u.dmgType, {});
        }
      }
    } else {
      // Elemental Mastery cycles the projectile's damage type
      let type = u.dmgType;
      const mastery = u.passives.find(p => p.id === 'elementalMastery');
      if (mastery) type = mastery.pickType(u);
      this.projectile({
        src: u, x: u.x, y: (u.y || 0) + 1.3, z: u.z,
        angle: Math.atan2(tgt.z - u.z, tgt.x - u.x),
        speed: u.role === 'siege' ? 22 : 30,
        range: u.range + 6, dmg: u.damage, dmgType: type,
        splash: u.splash, target: tgt, homing: u.role !== 'siege',
        arc: u.role === 'siege' ? 6 : 0,
        color: type === 'arcane' ? 0x9a6fe0 : type === 'fire' ? 0xe8823a : type === 'frost' ? 0x79cfe0
          : type === 'poison' ? 0x8fbf4a : type === 'holy' ? 0xf3d98a : 0xd8cbb0,
        trail: u.role === 'caster' ? 'arcaneTrail' : null,
        onHit: (hit) => {
          if (mastery) mastery.applyElement(this, u, [hit], type);
          this._afterHit(u, hit);
        },
      });
    }
  }

  _landHit(u, tgt) {
    const dealt = this.dealDamage(u, tgt, u.damage, u.dmgType, {});
    this._afterHit(u, tgt, dealt);
  }

  _afterHit(u, tgt, dealt) {
    if (!tgt || !tgt.alive) return;
    for (const h of u.onHitHooks) {
      try { h.run(this, u, { target: tgt, dmg: dealt || u.damage }); } catch (e) { /* ignore */ }
    }
    if (u.unit.onHitStatus) {
      this.applyStatus(tgt, u.unit.onHitStatus.id, u.unit.onHitStatus.dur, { src: u });
    }
    // breaking stealth
    if (u.hasStatus && u.hasStatus('stealthed')) u.removeStatus('stealthed');
  }

  /* ---------------------------------------------------------- targeting */

  _pickTarget(u) {
    const sight = u.sight * (this.sightMult || 1) * 2.2;

    // siege ignores bodies and walks to the walls
    if (u.structurePriority || u.role === 'siege') {
      const blockers = this.enemiesNear(u, u.x, u.z, 3.2);
      if (blockers.length && u.role !== 'siege') return closest(u, blockers);
      const s = this.allStructures.filter(x => x.alive && x.team !== u.team);
      if (s.length) return closestOf(u, s);
    }

    // assassins hunt by role, and search much further
    if (u.targetPriority) {
      const wide = this.enemiesNear(u, u.x, u.z, sight * 1.8);
      for (const role of u.targetPriority) {
        const m = wide.filter(e => e.role === role && !e.isStructure);
        if (m.length) return closest(u, m);
      }
      if (u.huntCommander) {
        const c = this.commanders.find(c => c.team !== u.team && c.alive);
        if (c) return c;
      }
      if (wide.length) return closest(u, wide.filter(e => !e.isStructure).concat(wide));
    }

    if (u.huntCommander) {
      const c = this.commanders.find(c => c.team !== u.team && c.alive);
      if (c && c.alive) return c;
    }

    // support units do not pick attack targets unless nothing needs healing
    const near = this.enemiesNear(u, u.x, u.z, sight);
    const units = near.filter(e => !e.isStructure);

    if (units.length) {
      // prefer whatever is both close and dangerous
      let best = null, bestScore = -Infinity;
      for (const e of units) {
        const d = u.distTo(e);
        const score = (e.threat ? e.threat() : 50) / (10 + d * d * 0.35)
          + (e.hp01 < 0.3 ? 40 : 0)
          + (e.isCommander ? 25 : 0);
        if (score > bestScore) { bestScore = score; best = e; }
      }
      if (best) return best;
    }

    // nothing alive nearby: go for structures
    const s = this.allStructures.filter(x => x.alive && x.team !== u.team);
    if (s.length) {
      // totems and pylons first — they are the mechanic
      const special = s.filter(x => x.kind === 'totem' || x.kind === 'pylon');
      return closestOf(u, special.length && u.team === 0 ? special : s);
    }
    return null;
  }

  /* ---------------------------------------------------------- movement */

  _steer(u, tx, tz, dt, speedMult = 1) {
    const dx = tx - u.x, dz = tz - u.z;
    const len = Math.hypot(dx, dz) || 1;
    let ax = dx / len, az = dz / len;

    // simple obstacle avoidance: if the step ahead is blocked, slide along it
    if (!u.flying) {
      const probe = 1.6;
      if (this.field.isBlocked(u.x + ax * probe, u.z + az * probe)) {
        const alt1 = { x: -az, z: ax }, alt2 = { x: az, z: -ax };
        const ok1 = !this.field.isBlocked(u.x + alt1.x * probe, u.z + alt1.z * probe);
        const ok2 = !this.field.isBlocked(u.x + alt2.x * probe, u.z + alt2.z * probe);
        if (ok1 || ok2) {
          const alt = ok1 && (!ok2 || (u.id % 2 === 0)) ? alt1 : alt2;
          ax = (ax + alt.x * 1.6) / 2; az = (az + alt.z * 1.6) / 2;
          const l2 = Math.hypot(ax, az) || 1; ax /= l2; az /= l2;
        }
      }
    }

    // separation
    const sep = this._separationVector(u);
    ax += sep.x; az += sep.z;
    const l3 = Math.hypot(ax, az) || 1;
    ax /= l3; az /= l3;

    const spd = u.moveSpeed * speedMult;
    const nx = u.x + ax * spd * dt;
    const nz = u.z + az * spd * dt;

    if (u.flying || !this.field.isBlocked(nx, u.z)) u.x = nx;
    if (u.flying || !this.field.isBlocked(u.x, nz)) u.z = nz;

    u.x = clamp(u.x, -this.field.W / 2 + 1.5, this.field.W / 2 - 1.5);
    u.z = clamp(u.z, -this.field.L / 2 + 1.5, this.field.L / 2 - 1.5);
    u.speedNow = spd;
    u.faceToward(u.x + ax, u.z + az, dt, 10);

    // trample
    if (u.trample) {
      for (const e of this.enemiesNear(u, u.x, u.z, u.radius + 0.7)) {
        if (e.mass >= u.mass) continue;
        if ((u._trampleT || 0) > this.t) continue;
        u._trampleT = this.t + 0.4;
        this.dealDamage(u, e, u.trample * u.statMult, 'blunt', { silent: true, noCrit: true });
        this.knockback(e, u.x, u.z, 3);
      }
    }
  }

  _separationVector(u) {
    let sx = 0, sz = 0;
    const list = this.grid.query(u.x, u.z, u.radius * 2 + 1.1);
    for (const o of list) {
      if (o === u || o.isStructure) continue;
      if (o.flying !== u.flying) continue;
      const dx = u.x - o.x, dz = u.z - o.z;
      const d = Math.hypot(dx, dz);
      const want = (u.radius + (o.radius || 0.4)) * 1.02;
      if (d > want || d < 1e-4) continue;
      const push = (want - d) / want;
      sx += (dx / d) * push;
      sz += (dz / d) * push;
    }
    return { x: sx * 1.6, z: sz * 1.6 };
  }

  _separate(u, dt) {
    const s = this._separationVector(u);
    if (!s.x && !s.z) return;
    const nx = u.x + s.x * 2.4 * dt, nz = u.z + s.z * 2.4 * dt;
    if (u.flying || !this.field.isBlocked(nx, nz)) { u.x = nx; u.z = nz; }
  }

  /* ------------------------------------------------------- projectiles */

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      if (p.homing && p.target && p.target.alive) {
        const a = Math.atan2(p.target.z - p.z, p.target.x - p.x);
        p.vx = lerp(p.vx, Math.cos(a) * p.speed, 0.28);
        p.vz = lerp(p.vz, Math.sin(a) * p.speed, 0.28);
      }
      if (p.vy) { p.y += p.vy * dt; p.vy -= 16 * dt; }

      const step = Math.hypot(p.vx, p.vz) * dt;
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.travelled += step;

      if (p.trail) this.fx(p.trail, p.x, p.y, p.z, { color: p.color });
      else if (this.realT % 0.05 < dt) this.fxSys.particle({ x: p.x, y: p.y, z: p.z, color: p.color, size: p.size, life: 0.18, drag: 4 });

      let done = false;
      const hits = this.grid.queryFiltered(p.x, p.z, 0.9, e =>
        e.alive && e.team !== p.src.team && !p.hit.has(e.id) && !e.untargetable);
      if (hits.length) {
        const tgt = hits[0];
        p.hit.add(tgt.id);
        const dealt = this.dealDamage(p.src, tgt, p.dmg, p.dmgType, { ignoreArmor: p.ignoreArmor });
        if (p.status) this.applyStatus(tgt, p.status.id, p.status.dur, { src: p.src, dps: p.status.dps });
        if (p.splash) {
          for (const e of this.enemiesNear(p.src, p.x, p.z, p.splash)) {
            if (e === tgt) continue;
            this.dealDamage(p.src, e, p.dmg * 0.6, p.dmgType, {});
          }
          this.fx('explosion', p.x, 0.6, p.z, { scale: p.splash });
        }
        p.onHit?.(tgt, dealt);
        this.sound(p.dmgType === 'arcane' ? 'arcane.hit' : p.dmgType === 'fire' ? 'fire' : p.dmgType === 'frost' ? 'frost' : 'arrow.hit', p.x, p.z, { vol: 0.4 });
        if (p.pierce > 0) p.pierce--; else done = true;
      }

      // structures
      if (!done) {
        for (const s of this.allStructures) {
          if (!s.alive || s.team === p.src.team) continue;
          if (p.hit.has(s.id)) continue;
          if (Math.hypot(s.x - p.x, s.z - p.z) < s.radius + 0.6) {
            p.hit.add(s.id);
            this.dealDamage(p.src, s, p.dmg, p.dmgType, {});
            if (p.splash) for (const e of this.enemiesNear(p.src, p.x, p.z, p.splash)) this.dealDamage(p.src, e, p.dmg * 0.5, p.dmgType, {});
            done = true;
            break;
          }
        }
      }

      if (!done && (p.travelled > p.range || p.y < 0 || !this.field.inBounds(p.x, p.z))) {
        if (p.splash) {
          this.fx('explosion', p.x, 0.4, p.z, { scale: p.splash });
          for (const e of this.enemiesNear(p.src, p.x, p.z, p.splash))
            this.dealDamage(p.src, e, p.dmg * 0.8, p.dmgType, {});
        }
        done = true;
      }

      if (done) swapRemove(this.projectiles, i);
    }
  }

  _updateLeaps(dt) {
    for (let i = this.leaps.length - 1; i >= 0; i--) {
      const L = this.leaps[i];
      L.t += dt;
      const k = clamp01(L.t / L.dur);
      L.u.x = lerp(L.x0, L.x1, k);
      L.u.z = lerp(L.z0, L.z1, k);
      L.u.y = this.field.heightAt(L.u.x, L.u.z) + Math.sin(k * Math.PI) * L.arc;
      L.u.facing = Math.atan2(L.z1 - L.z0, L.x1 - L.x0);
      if (k >= 1) {
        L.u.leaping = false;
        L.u.y = this.field.heightAt(L.u.x, L.u.z);
        try { L.onLand?.(); } catch (e) { /* ignore */ }
        swapRemove(this.leaps, i);
      }
    }
  }

  _updateGrounds(dt) {
    for (let i = this.grounds.length - 1; i >= 0; i--) {
      const g = this.grounds[i];
      g.t += dt;
      g.acc += dt;
      if (g.acc >= g.interval) {
        g.acc = 0;
        const list = this.grid.queryFiltered(g.x, g.z, g.r, e =>
          e.alive && !e.isStructure && !e.flying && (g.team === -1 || e.team !== g.team));
        for (const e of list) { try { g.onTick(e); } catch (err) { /* ignore */ } }
        // fire also burns corpses away, which is the counter to necromancy
        if (g.decal === 'fire') {
          for (const c of this.corpsesNear(g.x, g.z, g.r)) c.used = true;
        }
      }
      if (!g.permanent && g.t >= g.dur) swapRemove(this.grounds, i);
    }
  }

  _updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      const list = this.grid.queryFiltered(z.x, z.z, z.r, e =>
        e.alive && !e.isStructure && (z.friendly ? e.team === z.team : e.team !== z.team));
      for (const e of list) z.onTick(e);
      if (z.t >= z.dur) swapRemove(this.zones, i);
    }
  }

  /* --------------------------------------------------------- structures */

  _updateStructures(dt) {
    for (const s of this.allStructures) {
      if (!s.alive) continue;
      if (s.hp <= 0) { this._kill(s, null, 'blunt'); continue; }

      // totem-bound: Gribnak is protected while totems stand
      if (s.ring) {
        s.ring.material.opacity = 0.25 + s.hp01 * 0.4;
        s.ring.scale.setScalar(0.5 + s.hp01 * 0.5);
      }

      if (!s.range || !s.dmg) continue;
      s.cooldown -= dt;
      if (s.cooldown > 0) continue;
      const tgt = this.grid.nearest(s.x, s.z, s.range, e =>
        e.alive && e.team !== s.team && !e.isStructure && !e.untargetable);
      if (!tgt) continue;
      s.cooldown = 1 / s.atkSpeed;
      this.projectile({
        src: s, x: s.x, y: s.y + 4.2, z: s.z,
        angle: Math.atan2(tgt.z - s.z, tgt.x - s.x),
        speed: 34, range: s.range + 4, dmg: s.dmg, dmgType: 'pierce',
        target: tgt, homing: true, color: 0xd8cbb0,
      });
      this.sound('crossbow', s.x, s.z, { vol: 0.3 });
    }
  }

  /* ------------------------------------------------------ control points */

  _updatePoints(dt) {
    let changed = false;
    for (const p of this.points) {
      const inside = this.grid.queryFiltered(p.x, p.z, p.radius, e =>
        e.alive && !e.isStructure && e.ready !== false);
      let n0 = 0, n1 = 0;
      for (const e of inside) { if (e.team === 0) n0++; else n1++; }
      n0 = Math.min(n0, CFG.cp.maxContributors);
      n1 = Math.min(n1, CFG.cp.maxContributors);

      p.contested = n0 > 0 && n1 > 0;
      const net = n0 - n1;

      if (net !== 0) {
        const team = net > 0 ? 0 : 1;
        if (p.owner === team) {
          p.progress = Math.min(1, p.progress + Math.abs(net) * CFG.cp.captureRate * dt);
        } else {
          p.progress -= Math.abs(net) * CFG.cp.captureRate * dt;
          if (p.progress <= 0) {
            if (p.owner !== -1) { p.owner = -1; changed = true; }
            p.progress = Math.min(1, -p.progress);
            p.capturingTeam = team;
            if (p.progress >= 1) {
              p.owner = team; p.progress = 1; changed = true;
              this.sound('capture', p.x, p.z);
              this.fx('capture', p.x, 0.2, p.z, { color: team === 0 ? 0x5fbaf0 : 0xe05a4a });
              this.log((team === 0 ? 'You captured ' : 'Enemy captured ') + p.name, team);
              bus.emit(EV.POINT_CAPTURED, {
                team, id: p.id,
                allHeld: this.points.every(q => (q === p ? team : q.owner) === 0),
              });
            }
          }
        }
      } else if (p.owner === -1 && p.progress > 0) {
        p.progress = Math.max(0, p.progress - CFG.cp.decayRate * dt);
      }

      if (p.model) p.model.userData.setOwner(p.owner, p.progress);
      if (p.owner === 0) this.stats.pointsHeld += dt;
    }
    if (changed) this._updateDeployLines();
  }

  /* ----------------------------------------------------- enemy commander */

  _updateEnemyCommander(dt) {
    const c = this.enemyCommander;
    if (!c.alive) { c.update(this, dt, IDLE_INTENT); return; }
    const tgt = this.nearestEnemy(c, 30) || this.player;
    const intent = { ...IDLE_INTENT };
    if (tgt && tgt.alive) {
      const d = c.distTo(tgt);
      const a = Math.atan2(tgt.z - c.z, tgt.x - c.x);
      intent.aimX = tgt.x; intent.aimZ = tgt.z;
      const want = c.isMelee ? 2.2 : 14;
      if (d > want) { intent.moveX = Math.cos(a); intent.moveZ = Math.sin(a); }
      else if (d < want * 0.6) { intent.moveX = -Math.cos(a); intent.moveZ = -Math.sin(a); }
      intent.attack = d < (c.isMelee ? 3.2 : c.range);
      if (Math.random() < 0.004) intent.dodge = true;
    }
    c.update(this, dt, intent);
  }

  /* ------------------------------------------------------------ endgame */

  _suddenDeath() {
    const b0 = this.allStructures.find(s => s.kind === 'banner' && s.team === 0);
    const b1 = this.allStructures.find(s => s.kind === 'banner' && s.team === 1);
    const win = b1.hp01 < b0.hp01;
    this._endBattle(win, 'time');
  }

  _endBattle(victory, reason) {
    if (this.state === 'over') return;
    this.state = 'over';
    const b0 = this.allStructures.find(s => s.kind === 'banner' && s.team === 0);
    const b1 = this.allStructures.find(s => s.kind === 'banner' && s.team === 1);

    this.result = {
      victory, reason: reason || 'banner',
      duration: this.t,
      stats: { ...this.stats, duration: this.t, score: Math.round((victory ? 1000 : 300) + this.stats.kills * 12 - this.stats.losses * 6 + b0.hp01 * 400) },
      bannerHpOwn: b0.hp01, bannerHpFoe: b1.hp01,
      killsByCard: this.stats.killsByCard,
      nodeId: this.node?.id,
      regionId: this.opts.regionId,
      dmgTypes: new Set(this.playerDeck.map(c => c.unit.dmgType)).size,
      avgCost: this.playerDeck.length ? this.playerDeck.reduce((a, c) => a + c.unit.cost, 0) / this.playerDeck.length : 0,
      endlessWave: this.opts.endlessWave,
    };

    this.sound(victory ? 'victory' : 'defeat', 0, 0);
    bus.emit(EV.BATTLE_END, this.result);
    this.opts.onEvent?.({ kind: 'end', result: this.result });
  }

  forfeit() { this._endBattle(false, 'forfeit'); }

  /* ======================================================== presentation */

  _floater(tgt, text, cls) {
    if (this.opts.damageNumbers === false) return;
    this.floaters.push({
      text: String(text), cls, x: tgt.x, y: (tgt.y || 0) + (tgt.isStructure ? 4 : 1.9), z: tgt.z,
      t: 0, life: 1.0, vy: 2.2, vx: rng.range(-0.6, 0.6),
    });
    if (this.floaters.length > 60) this.floaters.shift();
  }

  _updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      f.vy -= 3.4 * dt;
      if (f.t >= f.life) swapRemove(this.floaters, i);
    }
  }

  _syncRigs(dt) {
    for (const u of this.units) {
      if (!u.rig) continue;
      u.rig.root.position.set(u.x, u.y, u.z);
      u.rig.pivot.rotation.y = -u.facing + Math.PI / 2;
      u.rig.update(dt, {
        moving: clamp01(u.speedNow / Math.max(1, u.baseMove)),
        attacking: u.swing > 0 ? 1 - u.swing : 0,
        casting: u.castTime > 0 ? u.castTime / 0.45 : 0,
        dead: u.alive ? 0 : clamp01(u.deathT / 1.4),
        hurt: u.hurtT,
        speedFactor: u.mass >= 4 ? 0.55 : u.mass >= 3 ? 0.8 : 1.2,
        blocking: u.hasStatus('braced'),
      });
      // spawn fade-in
      if (u.spawnDelay > 0) {
        const k = 1 - u.spawnDelay / CFG.battle.deployDelaySec;
        u.rig.root.scale.setScalar((u.scaleMul || 1) * (u.unit.art?.scale ?? 1) * (0.4 + k * 0.6));
      }
      // status tinting through the team ring
      const ring = u.rig.parts.teamRing;
      if (ring) {
        const st = u.statuses.find(s => s.debuff);
        ring.material.opacity = st ? 0.85 : 0.45;
      }
    }

    for (const c of this.commanders) {
      if (!c.rig) continue;
      c.rig.root.position.set(c.x, c.y, c.z);
      c.rig.pivot.rotation.y = -c.facing + Math.PI / 2;
      updateCommanderRig(c.rig, dt, c._rigState || {
        moving: 0, attacking: 0, drawing: 0, dodging: 0, casting: 0,
        dead: c.alive ? 0 : 1, hurt: c.hurtT, speedFactor: 1.1, blocking: false,
      });
      c.rig.root.visible = c.alive || c.deathT < 2;
    }

    for (const s of this.allStructures) {
      if (!s.model || !s.alive) continue;
      if (s.model.userData.update) s.model.userData.update(this.realT);
    }
    for (const p of this.points) {
      if (p.model?.userData.update) p.model.userData.update(this.realT);
    }
  }


  /* ---------------------------------------------------------- teardown */

  dispose() {
    for (const u of this.units) if (u.rig) { this.unitGroup.remove(u.rig.root); u.rig.dispose(); }
    for (const c of this.commanders) if (c.rig) { this.unitGroup.remove(c.rig.root); c.rig.dispose(); }
    for (const s of this.allStructures) {
      if (s.model) { this.scene.remove(s.model); s.model.traverse(o => o.geometry?.dispose()); }
      if (s.ring) { this.scene.remove(s.ring); s.ring.geometry.dispose(); s.ring.material.dispose(); }
    }
    for (const p of this.points) if (p.model) { this.scene.remove(p.model); p.model.traverse(o => o.geometry?.dispose()); }
    this.scene.remove(this.unitGroup);
    this.scene.remove(this.field.group);
    this.field.dispose();
    this.fxSys.clear();
    this.units.length = 0;
  }
}

/* ------------------------------------------------------------- helpers */

function closest(u, list) {
  let best = null, bd = Infinity;
  for (const e of list) {
    const d = (e.x - u.x) ** 2 + (e.z - u.z) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
const closestOf = closest;

const IDLE_INTENT = {
  moveX: 0, moveZ: 0, attack: false, attackPressed: false, attackReleased: false,
  dodge: false, ability: null, potion: null,
};
