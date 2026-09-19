/* Commander.js — you, on the field.

   The commander is a first-class combatant, not a camera. Movement is direct
   (WASD), attacks are weapon-class driven combos, and every equipment stat
   shows up in how the character actually plays:

     weight  → move speed and dodge distance
     might   → melee damage
     focus   → ability and staff damage
     haste   → swing speed and cooldown rate
     armor   → damage taken

   The enemy commander uses the same class with `ai = true`.
*/

import { CFG, resolveDamage } from '../core/Config.js';
import { WEAPON_CLASSES, ITEMS, POTIONS, CMD_ABILITIES } from '../data/Items.js';
import { clamp, clamp01, angleDelta, TAU, rng, lerp } from '../core/Util.js';
import { foldMods } from '../data/Statuses.js';

export class Commander {
  constructor(o) {
    this.isCommander = true;
    this.id = -1 - (o.team || 0);
    this.team = o.team ?? 0;
    this.name = o.name || 'Commander';
    this.ai = !!o.ai;

    const st = o.stats;
    this.stats = st;
    this.maxHp = st.maxHp;
    this.hp = this.maxHp;
    this.might = st.might;
    this.focus = st.focus;
    this.baseArmor = st.armor;
    this.armor = st.armor;
    this.baseMove = st.moveSpeed;
    this.moveSpeed = st.moveSpeed;
    this.atkSpeedMult = st.atkSpeedMult;
    this.cdr = st.cdr;
    this.specials = st.specials || {};
    this.weapon = ITEMS[o.equipped?.weapon] || ITEMS.ironSword;
    this.wclass = WEAPON_CLASSES[this.weapon.wclass] || WEAPON_CLASSES.sword;
    this.equipped = o.equipped || {};

    this.x = o.x ?? 0;
    this.z = o.z ?? 0;
    this.y = 0;
    this.vx = 0; this.vz = 0;
    this.facing = this.team === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.speedNow = 0;

    this.radius = 0.5;
    this.mass = 3;
    this.alive = true;
    this.armorType = 'heavy';
    this.dmgType = this.specials.dmgTypeOverride || this.wclass.dmgType;
    this.role = 'commander';
    this.tags = ['commander'];
    this.lvl = st.level;
    this.statMult = 1 + st.level * 0.04;
    this.unit = { name: this.name, art: {} };
    this.cardId = '__commander';

    /* combat state */
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.swing = 0;
    this.swingActive = null;
    this.swingHit = false;
    this.attackCd = 0;
    this.drawT = 0;            // bow charge
    this.drawing = false;
    this.dodgeT = 0;
    this.dodgeCd = 0;
    this.dodgeDir = { x: 0, z: 0 };
    this.iframes = 0;
    this.stamina = CFG.cmd.staminaMax;
    this.respawnT = 0;
    this.hurtT = 0;
    this.deathT = 0;
    this.nextIsBackstab = false;
    this.damageDealt = 0;
    this.kills = 0;
    this.damageTaken = 0;

    /* statuses reuse the unit system so buffs/debuffs behave identically */
    this.statuses = [];
    this.mods = foldMods([]);
    this.auraArmor = 0; this.auraDmgMult = 1; this.auraDmgTaken = 1;
    this.auraAtkSpeed = 1; this.auraMagicResist = 1; this.auraStructureMult = 1;
    this.healCap = 1;

    /* abilities */
    this.abilities = (o.abilities || []).map(a => ({ def: a, cd: 0 }));
    this.potions = o.potions || [];        // [{id, count}]
    this.aura = { radius: CFG.cmd.auraRadius + (this.specials.auraRadius || 0), dmg: CFG.cmd.auraDamageBonus + (this.specials.auraDamage || 0) };

    this.rig = null;
    this.debuffImmuneUntil = 0;
    this.tempCcImmune = 0;
    this.tempCdr = null;
    this.revived = false;
  }

  get hp01() { return clamp01(this.hp / this.maxHp); }
  get ready() { return this.alive; }
  get untargetable() { return !!this.mods.untargetable; }
  get isMelee() { return !this.wclass.ranged; }
  get range() { return this.wclass.ranged ? this.wclass.maxRange : 3.0; }

  hasStatus(id) { return this.statuses.some(s => s.id === id); }
  getStatus(id) { return this.statuses.find(s => s.id === id); }
  removeStatus(id) { const i = this.statuses.findIndex(s => s.id === id); if (i >= 0) this.statuses.splice(i, 1); }
  cleanse() { this.statuses = this.statuses.filter(s => !s.debuff); }

  addStatus(id, dur, data = {}) {
    const isDebuff = data.debuff ?? null;
    let st = this.statuses.find(s => s.id === id);
    if (st) { st.t = Math.max(st.t, dur); if (data.stacks) st.stacks += data.stacks; return st; }
    st = { id, t: dur, max: dur, stacks: data.stacks || 1, src: data.src, dps: data.dps || 0, hps: data.hps || 0, hp: data.hp || 0, acc: 0, debuff: false };
    // classify via the shared table
    const def = (data.def) || null;
    st.debuff = def ? def.kind === 'debuff' : ['burning', 'poisoned', 'bleeding', 'slowed', 'frozen', 'stunned', 'rooted', 'feared', 'taunted', 'silenced', 'marked', 'oiled', 'sundered', 'cursed', 'knockedback'].includes(id);
    if (st.debuff && this.debuffImmuneUntil > 0) return null;
    this.statuses.push(st);
    return st;
  }

  recalc() {
    const m = foldMods(this.statuses);
    m.dmgMult *= this.auraDmgMult;
    m.dmgTakenMult *= this.auraDmgTaken;
    m.atkSpeedMult *= this.auraAtkSpeed;
    m.armorAdd += this.auraArmor;
    this.mods = m;
    this.armor = Math.max(0, this.baseArmor + m.armorAdd);
    this.moveSpeed = this.baseMove * m.moveMult;
    this.stunned = !!m.stunned || this.dodgeT > 0 && false;
    this.silenced = !!m.silenced;
    this.dmgType = this.specials.dmgTypeOverride || this.wclass.dmgType;

    this.auraArmor = 0; this.auraDmgMult = 1; this.auraDmgTaken = 1;
    this.auraAtkSpeed = 1; this.auraMagicResist = 1; this.auraStructureMult = 1;
    this.healCap = 1;
  }

  resetCooldowns() { for (const a of this.abilities) a.cd = 0; }

  /* ======================================================================
     UPDATE
     ====================================================================== */

  /**
   * @param intent {
   *   moveX, moveZ,      normalised input direction (world space)
   *   aimX, aimZ,        world point being aimed at
   *   attack: bool,      held
   *   attackPressed,     this frame
   *   attackReleased,    this frame (bow release)
   *   dodge: bool,
   *   ability: index|null,
   *   potion: index|null,
   * }
   */
  update(b, dt, intent) {
    if (!this.alive) {
      this.deathT += dt;
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn(b);
      return;
    }

    this.recalc();
    this._tickStatuses(b, dt);

    if (this.debuffImmuneUntil > 0) this.debuffImmuneUntil = Math.max(0, this.debuffImmuneUntil - dt);
    if (this.tempCdr && b.t > this.tempCdr.until) this.tempCdr = null;
    this.hurtT = Math.max(0, this.hurtT - dt * 4);

    const cdrNow = clamp(this.cdr + (this.tempCdr ? this.tempCdr.v : 0), 0, 0.75);
    for (const a of this.abilities) if (a.cd > 0) a.cd = Math.max(0, a.cd - dt * (1 + cdrNow));
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.comboIndex = 0;

    if (this.stamina < CFG.cmd.staminaMax) {
      this.stamina = Math.min(CFG.cmd.staminaMax, this.stamina + CFG.cmd.staminaRegen * dt);
    }

    /* ---- knockback ----
       The commander is a unit on the field, so a Colossus quake or a Dragoon
       charge has to move them. Without this, every knockback in the game
       silently did nothing to the player and boss telegraphs lost their point.
       Stoneheart and the Draught of Stone shorten it. */
    if (this.knock && this.knock.t > 0) {
      const resist = 1 - Math.min(0.85, (this.specials.ccResist || 0) + (this.tempCcImmune > b.t ? 1 : 0));
      if (resist <= 0.001) {
        this.knock = null;
      } else {
        this.knock.t -= dt;
        this._move(b, dt, this.knock.vx * resist, this.knock.vz * resist, true);
        this.knock.vx *= 0.86; this.knock.vz *= 0.86;
        if (this.knock.t <= 0) this.knock = null;
        this._updateRig(dt, intent);
        return;
      }
    }

    /* ---- dodge ---- */
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      const t = 1 - this.dodgeT / CFG.cmd.dodgeTime;
      const speed = CFG.cmd.dodgeSpeed * (1 - t * 0.55);
      this._move(b, dt, this.dodgeDir.x * speed, this.dodgeDir.z * speed, true);
      if (this.dodgeT <= 0) this.dodgeT = 0;
      this._updateRig(dt, intent);
      return;
    }

    const canAct = !this.mods.stunned;

    if (canAct && intent.dodge && this.dodgeCd <= 0 && this.stamina >= CFG.cmd.dodgeCost) {
      const mx = intent.moveX, mz = intent.moveZ;
      const l = Math.hypot(mx, mz);
      this.dodgeDir = l > 0.01 ? { x: mx / l, z: mz / l } : { x: Math.cos(this.facing), z: Math.sin(this.facing) };
      this.dodgeT = CFG.cmd.dodgeTime;
      const cdrDodge = 1 - (this.specials.dodgeCdr || 0);
      this.dodgeCd = CFG.cmd.dodgeCooldown * cdrDodge;
      this.iframes = CFG.cmd.dodgeIFrames;
      this.stamina -= CFG.cmd.dodgeCost;
      this.swing = 0; this.swingActive = null; this.drawing = false; this.drawT = 0;
      b.sound('swing', this.x, this.z, { vol: 0.5 });
      b.fx('dust', this.x, 0.1, this.z, {});
      this._updateRig(dt, intent);
      return;
    }

    /* ---- facing ---- */
    if (intent.aimX !== undefined && canAct) {
      const want = Math.atan2(intent.aimZ - this.z, intent.aimX - this.x);
      const rate = this.swing > 0 ? 3 : 14;
      this.facing += clamp(angleDelta(this.facing, want), -rate * dt, rate * dt);
    }

    /* ---- attack ---- */
    if (canAct) this._attack(b, dt, intent);

    /* ---- abilities ---- */
    if (canAct && intent.ability !== null && intent.ability !== undefined) {
      this.useAbility(b, intent.ability);
    }
    if (intent.potion !== null && intent.potion !== undefined) {
      this.usePotion(b, intent.potion);
    }

    /* ---- movement ---- */
    let mx = intent.moveX, mz = intent.moveZ;
    let spd = this.moveSpeed;
    if (this.swing > 0 && this.swingActive) spd *= this.wclass.moveWhileSwinging;
    if (this.drawing) spd *= 0.45;
    if (this.mods.moveMult === 0) spd = 0;
    this._move(b, dt, mx * spd, mz * spd);

    this._updateRig(dt, intent);
  }

  _move(b, dt, vx, vz, isDodge = false) {
    const nx = this.x + vx * dt;
    const nz = this.z + vz * dt;
    const f = b.field;
    if (!f.isBlocked(nx, this.z)) this.x = nx;
    if (!f.isBlocked(this.x, nz)) this.z = nz;
    this.x = clamp(this.x, -f.W / 2 + 2, f.W / 2 - 2);
    this.z = clamp(this.z, -f.L / 2 + 2, f.L / 2 - 2);
    this.y = f.heightAt(this.x, this.z);
    this.speedNow = Math.hypot(vx, vz);
    this.vx = vx; this.vz = vz;
  }

  /* ---------------------------------------------------------- attacking */

  _attack(b, dt, intent) {
    const wc = this.wclass;

    /* --- bow / charged ranged --- */
    if (wc.ranged && wc.drawTime) {
      if (intent.attack && this.attackCd <= 0) {
        this.drawing = true;
        this.drawT = Math.min(wc.drawTime, this.drawT + dt);
      } else if (this.drawing && (!intent.attack || intent.attackReleased)) {
        const charge = clamp01(this.drawT / wc.drawTime);
        this._fireProjectile(b, charge);
        this.drawing = false; this.drawT = 0;
        this.attackCd = wc.swingTime / this.atkSpeedMult;
      }
      return;
    }

    /* --- staff / instant ranged --- */
    if (wc.ranged) {
      if (intent.attack && this.attackCd <= 0) {
        this._fireProjectile(b, 1);
        this.attackCd = wc.swingTime / this.atkSpeedMult;
      }
      return;
    }

    /* --- melee combo --- */
    if (this.swing > 0) {
      const step = wc.combo[this.swingActive];
      const dur = wc.swingTime / this.atkSpeedMult;
      this.swing -= dt / dur;
      const prog = 1 - this.swing;
      if (!this.swingHit && prog >= 0.42) {
        this.swingHit = true;
        this._meleeHit(b, step);
      }
      if (this.swing <= 0) {
        this.swing = 0;
        this.swingActive = null;
        this.comboTimer = 0.55;
        this.attackCd = dur * 0.22;
      }
      return;
    }

    if (intent.attack && this.attackCd <= 0) {
      this.swingActive = this.comboIndex % wc.combo.length;
      this.comboIndex++;
      this.swing = 1;
      this.swingHit = false;
      b.sound('swing', this.x, this.z, { vol: 0.6 });
    }
  }

  _meleeHit(b, step) {
    const wc = this.wclass;
    const reach = step.reach;
    const arc = step.arc;
    const dmgBase = this.might * step.mult * 1.0;
    let hitAny = false;

    const list = b.enemiesNear(this, this.x, this.z, reach + 1.2);
    for (const e of list) {
      const a = Math.atan2(e.z - this.z, e.x - this.x);
      if (Math.abs(angleDelta(this.facing, a)) > arc / 2) continue;
      if (this.distTo(e) > reach + (e.radius || 0.5)) continue;

      hitAny = true;
      const backstab = this.nextIsBackstab || (e.isFlankedBy && e.isFlankedBy(this) && wc.backstabBonus > 0);
      const mults = [];
      if (backstab && wc.backstabBonus) mults.push(1 + wc.backstabBonus + (this.specials.backstabBonus || 0));
      const res = b.dealDamage(this, e, dmgBase, this.dmgType, {
        mults, backstab: this.nextIsBackstab,
        ignoreArmor: this.specials.ignoreArmor,
        pierceArmor: this.specials.pierceArmor,
      });
      if (wc.knockback) b.knockback(e, this.x, this.z, wc.knockback * (1 + (this.specials.knockbackBonus || 0)));
      if (wc.onHit) {
        const h = wc.onHit;
        if (!h.chance || rng.chance(h.chance)) {
          b.applyStatus(e, h.status, h.dur, { src: this, dps: dmgBase * (h.dpsFrac || 0) });
        }
      }
      if (this.specials.lifesteal) b.heal(this, res * this.specials.lifesteal, this);
    }
    this.nextIsBackstab = false;

    // swing arc visual
    b.fx(hitAny ? 'impact' : 'dust', this.x + Math.cos(this.facing) * reach * 0.7, 1.1,
      this.z + Math.sin(this.facing) * reach * 0.7, { scale: hitAny ? 1.2 : 0.6 });
    if (hitAny) b.sound('hit.flesh', this.x, this.z, { vol: 0.8 });
  }

  _fireProjectile(b, charge) {
    const wc = this.wclass;
    const scale = wc.scalesWith === 'focus' ? this.focus : this.might;
    const chargeMult = wc.maxChargeMult ? lerp(0.45, wc.maxChargeMult, charge) : 1;
    const dmg = scale * 1.15 * chargeMult;

    b.projectile({
      src: this, x: this.x, y: 1.3, z: this.z,
      angle: this.facing, speed: wc.ranged ? (wc.drawTime ? 44 : 30) : 30,
      range: wc.maxRange, dmg, dmgType: this.dmgType,
      pierce: wc.pierceCount || 0,
      color: this.dmgType === 'arcane' ? 0x9a6fe0 : this.dmgType === 'fire' ? 0xe8823a : 0xd8cbb0,
      trail: wc.scalesWith === 'focus' ? 'arcaneTrail' : null,
      ignoreArmor: this.specials.ignoreArmor,
      onHit: (tgt) => {
        if (this.specials.lifesteal) b.heal(this, dmg * this.specials.lifesteal, this);
        if (this.specials.chainOnFullDraw && charge >= 0.98) {
          let from = tgt, n = this.specials.chainOnFullDraw;
          const hit = new Set([tgt.id]);
          while (n-- > 0) {
            const next = b.enemiesNear(this, from.x, from.z, 8).find(e => !hit.has(e.id));
            if (!next) break;
            hit.add(next.id);
            b.beam(from, next, { color: 0x9fd0ff, width: 0.16, life: 0.16, jagged: true });
            b.dealDamage(this, next, dmg * 0.6, 'arcane', { isAbility: true });
            from = next;
          }
        }
      },
    });
    b.sound(wc.drawTime ? 'bow' : 'cast', this.x, this.z, { vol: 0.7 });
  }

  /* --------------------------------------------------------- abilities */

  useAbility(b, i) {
    const a = this.abilities[i];
    if (!a || a.cd > 0 || this.mods.silenced || !this.alive) {
      if (a && a.cd > 0) b.sound('ui.deny', this.x, this.z, { vol: 0.4 });
      return false;
    }
    a.cd = a.def.cd;
    a.def.run(b, this);
    b.onCommanderAbility?.(this, a.def);
    return true;
  }

  usePotion(b, i) {
    const p = this.potions[i];
    if (!p || p.count <= 0) { b.sound('ui.deny', this.x, this.z, { vol: 0.4 }); return false; }
    const def = POTIONS[p.id];
    if (!def) return false;
    p.count--;
    def.use(b, this);
    b.onPotionUsed?.(this, p.id);
    b.sound('heal', this.x, this.z, { vol: 0.6 });
    return true;
  }

  /* ------------------------------------------------------ damage & death */

  onDamaged(b, amount, attacker) {
    this.damageTaken += amount;
    this.hurtT = 1;
    if (this.specials.reflect && attacker && attacker !== this) {
      b.dealDamage(this, attacker, amount * this.specials.reflect, 'blunt', { silent: true, noCrit: true });
    }
  }

  die(b, killer) {
    if (!this.alive) return;
    // Phoenix Feather / archmage ward: one free resurrection
    if (this.specials.reviveOnce && !this.revived) {
      this.revived = true;
      this.hp = this.maxHp * 0.5;
      b.fx('phoenixBurst', this.x, 1.2, this.z, { scale: 5 });
      b.sound('fire', this.x, this.z);
      b.log(this.name + ' rises again', this.team);
      for (const e of b.enemiesNear(this, this.x, this.z, 6))
        b.dealDamage(this, e, this.focus * 3, 'fire', { isAbility: true });
      return;
    }
    this.alive = false;
    this.hp = 0;
    this.deathT = 0;
    this.respawnT = CFG.battle.respawnSec;
    this.drawing = false; this.swing = 0;
    b.onCommanderDown?.(this, killer);
  }

  respawn(b) {
    const banner = b.structures(this.team).find(s => s.kind === 'banner');
    this.x = banner ? banner.x : 0;
    this.z = banner ? banner.z + (this.team === 0 ? 4 : -4) : (this.team === 0 ? -38 : 38);
    this.y = b.field.heightAt(this.x, this.z);
    this.hp = this.maxHp * 0.7;
    this.alive = true;
    this.deathT = 0;
    this.statuses.length = 0;
    this.stamina = CFG.cmd.staminaMax;
    b.fx('holyBurst', this.x, 1.2, this.z, { scale: 3 });
    b.sound('unlock', this.x, this.z, { vol: 0.5 });
  }

  _tickStatuses(b, dt) {
    for (let i = this.statuses.length - 1; i >= 0; i--) {
      const st = this.statuses[i];
      st.t -= dt;
      if (st.id === 'burning' || st.id === 'poisoned' || st.id === 'bleeding') {
        st.acc = (st.acc || 0) + dt;
        if (st.acc >= 0.5) {
          st.acc -= 0.5;
          b.dealDamage(st.src || this, this, st.dps * 0.5 * st.stacks,
            st.id === 'burning' ? 'fire' : st.id === 'poisoned' ? 'poison' : 'slash',
            { silent: true, noCrit: true });
        }
      } else if (st.id === 'regenerating') {
        st.acc = (st.acc || 0) + dt;
        if (st.acc >= 0.5) { st.acc -= 0.5; b.heal(this, st.hps * 0.5, this); }
      }
      if (st.t <= 0) this.statuses.splice(i, 1);
    }
  }

  distTo(o) { return Math.hypot(o.x - this.x, o.z - this.z); }
  isFlankedBy(o) {
    const a = Math.atan2(o.z - this.z, o.x - this.x);
    return Math.abs(angleDelta(this.facing, a)) > CFG.battle.flankAngle / 2;
  }
  threat() { return this.might * 4 + this.focus * 3; }
  get facingSign() { return this.team === 0 ? 1 : -1; }

  _updateRig(dt, intent) {
    if (!this.rig) return;
    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.pivot.rotation.y = -this.facing + Math.PI / 2;
    this._rigState = {
      moving: clamp01(this.speedNow / Math.max(1, this.baseMove)),
      attacking: this.swing > 0 ? 1 - this.swing : 0,
      drawing: this.drawing ? clamp01(this.drawT / (this.wclass.drawTime || 1)) : 0,
      dodging: this.dodgeT > 0 ? 1 - this.dodgeT / CFG.cmd.dodgeTime : 0,
      casting: 0,
      dead: this.alive ? 0 : clamp01(this.deathT),
      hurt: this.hurtT,
      speedFactor: 1.1,
      blocking: false,
    };
  }
}
