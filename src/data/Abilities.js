/* Abilities.js — the verbs of the game.

   ===========================================================================
   CONTRACT
   Every ability is handed `(b, self, ctx)` where `b` is the battle facade.
   Abilities never touch the scene graph, the UI or the save; they only speak
   this vocabulary, which is what lets the same ability data drive the sim, the
   tooltips and the enemy AI.

     b.dealDamage(src, tgt, amount, type, opt)   opt: {silent,noCrit,isAbility,backstab,mults}
     b.heal(tgt, amount, src)
     b.applyStatus(tgt, id, dur, data)           data: {src, dps, hps, stacks, hp, ...}
     b.removeStatus(tgt, id)
     b.hasStatus(u, id)
     b.enemiesNear(self, x, z, r)  -> Entity[]
     b.alliesNear(self, x, z, r)   -> Entity[]   (excludes self unless opt.withSelf)
     b.nearestEnemy(self, r)
     b.lowestHpAlly(self, r, opt)
     b.spawn(unitId, team, x, z, opt)            opt: {lvl, summoned, scale}
     b.projectile(opt)
     b.beam(from, to, opt)
     b.knockback(tgt, fromX, fromZ, force)
     b.pull(tgt, toX, toZ, force)
     b.teleport(u, x, z)
     b.corpsesNear(x, z, r)  -> Corpse[]         (consume with corpse.used = true)
     b.consumeCorpse(c)
     b.structures(team) -> Structure[]
     b.fx(name, x, y, z, opt)
     b.sound(name, x, z, opt)
     b.shake(amount)
     b.log(text, team)
     b.t          — battle clock, seconds
   ===========================================================================

   `kind` decides when the sim calls it:
     passive   — never called; `mods` folded into the unit's stats
     aura      — `aura(b,self)` four times a second
     active    — `run(b,self)` when the cooldown is up and `want()` says yes
     onHit     — after this unit lands an attack:  run(b,self,{target,dmg})
     onDamaged — after this unit is hurt:          run(b,self,{attacker,dmg})
     onKill    — after this unit kills something:  run(b,self,{victim})
     onDeath   — when this unit dies:              run(b,self,{killer})
     onSpawn   — once, when deployed
*/

import { CFG } from '../core/Config.js';
import { rng, clamp, TAU } from '../core/Util.js';
import { ic } from '../art/Icons.js';

/** Ability strength scales with the card's level exactly like its stats do. */
const S = (self, base) => base * (self.statMult || 1) * (self.mods?.abilityMult || 1);

export const ABILITIES = {

  /* =======================================================================
     KNIGHT LINE
     ======================================================================= */

  shieldBrace: {
    id: 'shieldBrace', name: 'Shield Brace', icon: ic('shield'), tier: 0, kind: 'active',
    cd: 9, dur: 3.2,
    desc: () => 'Plants the shield: takes 55% less damage and gains armour for 3.2s, but cannot advance. Allies directly behind are covered too.',
    want: (b, self) => b.enemiesNear(self, self.x, self.z, 7).length >= 1 && self.hp < self.maxHp * 0.92,
    run(b, self) {
      b.applyStatus(self, 'braced', this.dur, { src: self });
      b.fx('shieldFlare', self.x, 1.1, self.z, { color: 0x7fb6e8, scale: self.radius * 2.4 });
      b.sound('block', self.x, self.z);
      // cover the file behind — this is what makes Knight+Mage a real formation
      for (const a of b.alliesNear(self, self.x, self.z, 5)) {
        const behind = (a.z - self.z) * self.facingSign < 0;
        if (behind) b.applyStatus(a, 'shielded', this.dur, { src: self, hp: S(self, 55) });
      }
    },
  },

  holdTheLine: {
    id: 'holdTheLine', name: 'Hold the Line', icon: ic('wall'), tier: 2, kind: 'aura',
    radius: 5.5,
    desc: () => 'Nearby allies gain +5 armour. The bonus doubles while this unit is braced.',
    aura(b, self) {
      const mult = b.hasStatus(self, 'braced') ? 2 : 1;
      for (const a of b.alliesNear(self, self.x, self.z, this.radius)) a.auraArmor += 5 * mult;
    },
  },

  vengefulGuard: {
    id: 'vengefulGuard', name: 'Vengeful Guard', icon: ic('swords'), tier: 3, kind: 'onDamaged',
    desc: () => 'Returns 22% of melee damage taken straight back at the attacker.',
    run(b, self, ctx) {
      if (!ctx.attacker || ctx.attacker.range > 4) return;
      b.dealDamage(self, ctx.attacker, ctx.dmg * 0.22, 'slash', { silent: true, noCrit: true });
    },
  },

  lastStand: {
    id: 'lastStand', name: 'Last Stand', icon: ic('skull'), tier: 4, awaken: true, kind: 'passive',
    desc: () => 'The first killing blow instead leaves it at 1 health and grants 3s of Warded and Enraged. Once per battle.',
    onLethal(b, self) {
      if (self._lastStandUsed) return false;
      self._lastStandUsed = true;
      self.hp = 1;
      b.applyStatus(self, 'shielded', 3, { src: self, hp: S(self, 180) });
      b.applyStatus(self, 'enraged', 6, { src: self, stacks: 3 });
      b.fx('holyBurst', self.x, 1.2, self.z, { color: 0xf3d98a, scale: 3 });
      b.sound('holy', self.x, self.z);
      b.log(self.name + ' refuses to fall', self.team);
      return true;
    },
  },

  /* =======================================================================
     MAGE LINE
     ======================================================================= */

  arcaneNova: {
    id: 'arcaneNova', name: 'Arcane Nova', icon: ic('burst'), tier: 0, kind: 'active',
    cd: 7.5, range: 15, radius: 4.4,
    desc: (self) => `Detonates arcane force at the densest cluster of enemies, dealing ${Math.round(S(self || {}, 46))} arcane damage in a ${4.4}m circle.`,
    want: (b, self) => !!bestCluster(b, self, 15, 4.4, 2),
    run(b, self) {
      const spot = bestCluster(b, self, this.range, this.radius, 1);
      if (!spot) return;
      b.castDelayed(self, 0.45, () => {
        b.fx('arcaneNova', spot.x, 0.9, spot.z, { scale: this.radius });
        b.sound('arcane.hit', spot.x, spot.z);
        b.shake(0.18);
        for (const e of b.enemiesNear(self, spot.x, spot.z, this.radius))
          b.dealDamage(self, e, S(self, 46), 'arcane', { isAbility: true });
      });
      b.fx('castRing', self.x, 0.6, self.z, { color: 0x9a6fe0 });
      b.sound('cast', self.x, self.z);
    },
  },

  manaShield: {
    id: 'manaShield', name: 'Mana Shield', icon: ic('ward'), tier: 2, kind: 'onDamaged',
    cd: 14,
    desc: () => 'When first brought below half health, raises a ward that absorbs damage.',
    run(b, self, ctx) {
      if (self.hp > self.maxHp * 0.5 || self._manaShieldT > b.t) return;
      self._manaShieldT = b.t + this.cd;
      b.applyStatus(self, 'shielded', 8, { src: self, hp: S(self, 120) });
      b.fx('shieldFlare', self.x, 1.1, self.z, { color: 0x5aa6d8, scale: 2.2 });
      b.sound('cast', self.x, self.z);
    },
  },

  emberbolt: {
    id: 'emberbolt', name: 'Emberbolt', icon: ic('flame'), tier: 3, kind: 'onHit',
    desc: () => 'Every third bolt ignites the target, burning it for 6s. Devastating on anything oiled.',
    run(b, self, ctx) {
      self._emberN = (self._emberN || 0) + 1;
      if (self._emberN % 3) return;
      b.applyStatus(ctx.target, 'burning', 6, { src: self, dps: S(self, 11) });
      b.fx('ember', ctx.target.x, 1, ctx.target.z, {});
    },
  },

  elementalMastery: {
    id: 'elementalMastery', name: 'Elemental Mastery', icon: ic('rainbow'), tier: 4, awaken: true, kind: 'passive',
    desc: () => 'Cycles between fire, frost and arcane with each cast — fire burns, frost chills, arcane sunders. No enemy can armour itself against all three.',
    cycle: ['fire', 'frost', 'arcane'],
    pickType(self) {
      self._elemN = (self._elemN || 0) + 1;
      return this.cycle[self._elemN % 3];
    },
    // NOT called `onCast`: that name is the generic passive hook the sim fires
    // with (b, self) after every ability. This one needs the hit list.
    applyElement(b, self, targets, type) {
      for (const t of targets) {
        if (type === 'fire') b.applyStatus(t, 'burning', 4, { src: self, dps: S(self, 9) });
        else if (type === 'frost') b.applyStatus(t, 'slowed', 3, { src: self });
        else b.applyStatus(t, 'sundered', 5, { src: self });
      }
    },
  },

  /* =======================================================================
     GIANT LINE
     ======================================================================= */

  groundSlam: {
    id: 'groundSlam', name: 'Ground Slam', icon: ic('fist'), tier: 0, kind: 'active',
    cd: 8.5, radius: 5.2,
    desc: (self) => `Smashes the earth for ${Math.round(S(self || {}, 62))} blunt damage in a wide ring, staggering everything caught in it.`,
    want: (b, self) => b.enemiesNear(self, self.x, self.z, 5.2).length >= 2,
    run(b, self) {
      b.castDelayed(self, 0.5, () => {
        b.fx('shockwave', self.x, 0.2, self.z, { scale: this.radius });
        b.sound('stomp', self.x, self.z);
        b.shake(0.4);
        for (const e of b.enemiesNear(self, self.x, self.z, this.radius)) {
          b.dealDamage(self, e, S(self, 62), 'blunt', { isAbility: true });
          if (e.mass < 3) {
            b.knockback(e, self.x, self.z, 5.5);
            b.applyStatus(e, 'stunned', 0.7, { src: self });
          }
        }
      });
    },
  },

  wallbreaker: {
    id: 'wallbreaker', name: 'Wallbreaker', icon: ic('ruin'), tier: 2, kind: 'passive',
    desc: () => 'Deals 90% more damage to towers and banners.',
    mods: { structureMult: 1.9 },
  },

  unstoppable: {
    id: 'unstoppable', name: 'Unstoppable', icon: ic('boots'), tier: 3, kind: 'passive',
    desc: () => 'Immune to knockback and stuns, and tramples small units it walks through for blunt damage.',
    mods: { ccImmune: true, trample: 18 },
  },

  titanfall: {
    id: 'titanfall', name: 'Titanfall', icon: ic('volcano'), tier: 4, awaken: true, kind: 'onDeath',
    desc: () => 'Its corpse lands like a siege stone: heavy blunt damage in a wide circle, and the ground stays broken and slow for 8s.',
    run(b, self) {
      b.fx('crater', self.x, 0.1, self.z, { scale: 7 });
      b.sound('structure.down', self.x, self.z);
      b.shake(0.7);
      for (const e of b.enemiesNear(self, self.x, self.z, 7))
        b.dealDamage(self, e, S(self, 110), 'blunt', { isAbility: true });
      b.groundEffect({ x: self.x, z: self.z, r: 7, dur: 8, team: self.team, onTick(u) { b.applyStatus(u, 'slowed', 0.5, { src: self }); } });
    },
  },

  /* =======================================================================
     INFANTRY & SKIRMISHERS
     ======================================================================= */

  braceForCharge: {
    id: 'braceForCharge', name: 'Set Spears', icon: ic('trident'), tier: 0, kind: 'passive',
    desc: () => 'Deals 120% bonus damage to large units (mass 3+) and to anything that charges into it.',
    onOutgoing(self, target, dmg) { return target.mass >= 3 ? dmg * 2.2 : dmg; },
  },

  phalanx: {
    id: 'phalanx', name: 'Phalanx', icon: ic('link'), tier: 2, kind: 'aura',
    radius: 3.2,
    desc: () => 'For each other spear-wall ally standing shoulder to shoulder, gains +18% damage and +4 armour. Three of them are a wall.',
    aura(b, self) {
      let n = 0;
      for (const a of b.alliesNear(self, self.x, self.z, this.radius)) if (a.tags?.includes('shieldwall')) n++;
      if (n) { self.auraDmgMult *= 1 + 0.18 * Math.min(n, 3); self.auraArmor += 4 * Math.min(n, 3); }
    },
  },

  volley: {
    id: 'volley', name: 'Volley', icon: ic('bow'), tier: 0, kind: 'active',
    cd: 11, range: 20, radius: 3.4,
    desc: (self) => `Arcs a rain of arrows onto a marked spot after 1.1s — ${Math.round(S(self || {}, 26))} pierce damage per arrow, three arrows.`,
    want: (b, self) => !!bestCluster(b, self, 20, 3.4, 2),
    run(b, self) {
      const spot = bestCluster(b, self, this.range, this.radius, 1);
      if (!spot) return;
      b.telegraph(spot.x, spot.z, this.radius, 1.1, 0xd9a441);
      b.sound('bow', self.x, self.z);
      for (let i = 0; i < 3; i++) {
        b.castDelayed(self, 1.1 + i * 0.22, () => {
          b.fx('arrowRain', spot.x, 0.2, spot.z, { scale: this.radius });
          for (const e of b.enemiesNear(self, spot.x, spot.z, this.radius))
            b.dealDamage(self, e, S(self, 26), 'pierce', { isAbility: true });
        });
      }
    },
  },

  highGround: {
    id: 'highGround', name: 'Keen Eye', icon: ic('eye'), tier: 2, kind: 'passive',
    desc: () => 'On high ground: +25% range and +20% damage. Archers on the ridge are worth two on the flat.',
    onRecalc(self, m) { if (self.onHighGround) { m.rangeMult *= 1.25; m.dmgMult *= 1.2; } },
  },

  pinningShot: {
    id: 'pinningShot', name: 'Pinning Shot', icon: ic('pin'), tier: 3, kind: 'onHit',
    desc: () => 'Every fourth arrow roots the target for 1.2s.',
    run(b, self, ctx) {
      self._pinN = (self._pinN || 0) + 1;
      if (self._pinN % 4) return;
      b.applyStatus(ctx.target, 'rooted', 1.2, { src: self });
      b.fx('pin', ctx.target.x, 0.4, ctx.target.z, {});
    },
  },

  swarmTactics: {
    id: 'swarmTactics', name: 'Swarm', icon: ic('swarm'), tier: 0, kind: 'aura',
    radius: 4.5,
    desc: () => '+12% attack speed for each nearby ally of the same kind, up to +48%. Numbers are their own weapon.',
    aura(b, self) {
      let n = 0;
      for (const a of b.alliesNear(self, self.x, self.z, this.radius)) if (a.cardId === self.cardId) n++;
      if (n) self.auraAtkSpeed *= 1 + 0.12 * Math.min(n, 4);
    },
  },

  scout: {
    id: 'scout', name: 'Outrider', icon: ic('reveal'), tier: 0, kind: 'aura',
    radius: 12,
    desc: () => 'Reveals hidden enemies nearby and makes them targetable. Assassins hate this unit.',
    aura(b, self) {
      for (const e of b.enemiesNear(self, self.x, self.z, this.radius)) b.removeStatus(e, 'stealthed');
    },
  },

  sabotage: {
    id: 'sabotage', name: 'Sapper Charge', icon: ic('bomb'), tier: 0, kind: 'onDeath',
    desc: () => 'Detonates the powder keg on death: heavy blunt damage to structures and everything standing next to it.',
    run(b, self) {
      b.fx('explosion', self.x, 0.6, self.z, { scale: 4 });
      b.sound('fire', self.x, self.z);
      b.shake(0.34);
      for (const e of b.enemiesNear(self, self.x, self.z, 4.2))
        b.dealDamage(self, e, S(self, 70), 'blunt', { isAbility: true });
      for (const s of b.structures(self.team === 0 ? 1 : 0))
        if (Math.hypot(s.x - self.x, s.z - self.z) < 6) b.dealDamage(self, s, S(self, 240), 'blunt', { isAbility: true });
    },
  },

  /* =======================================================================
     SUPPORT
     ======================================================================= */

  mendWounds: {
    id: 'mendWounds', name: 'Mend', icon: ic('heal'), tier: 0, kind: 'active',
    cd: 3.6, range: 11,
    desc: (self) => `Heals the most wounded ally within 11m for ${Math.round(S(self || {}, 52))}.`,
    want: (b, self) => !!b.lowestHpAlly(self, 11, { hurtOnly: true }),
    run(b, self) {
      const t = b.lowestHpAlly(self, this.range, { hurtOnly: true });
      if (!t) return;
      b.heal(t, S(self, 52), self);
      b.beam(self, t, { color: 0x8fe09a, width: 0.14, life: 0.35 });
      b.fx('healBurst', t.x, 1.1, t.z, {});
      b.sound('heal', t.x, t.z);
    },
  },

  sanctuary: {
    id: 'sanctuary', name: 'Sanctuary', icon: ic('chapel'), tier: 2, kind: 'aura',
    radius: 6.5,
    desc: () => 'Allies inside the circle take 12% less damage. Stacks with a guardian in front for a genuinely immovable line.',
    aura(b, self) {
      for (const a of b.alliesNear(self, self.x, self.z, this.radius)) a.auraDmgTaken *= 0.88;
    },
  },

  purge: {
    id: 'purge', name: 'Purge', icon: ic('dove'), tier: 3, kind: 'active',
    cd: 13, range: 10,
    desc: () => 'Strips every curse, poison, burn and chill from nearby allies and blesses the most wounded one.',
    want: (b, self) => b.alliesNear(self, self.x, self.z, 10).some(a => a.statuses.some(s => s.debuff)),
    run(b, self) {
      const allies = b.alliesNear(self, self.x, self.z, this.range, { withSelf: true });
      for (const a of allies) b.cleanse(a);
      const hurt = b.lowestHpAlly(self, this.range, { hurtOnly: true, withSelf: true });
      if (hurt) b.applyStatus(hurt, 'blessed', 6, { src: self });
      b.fx('holyBurst', self.x, 1.2, self.z, { scale: this.range * 0.6 });
      b.sound('holy', self.x, self.z);
    },
  },

  martyrdom: {
    id: 'martyrdom', name: 'Martyrdom', icon: ic('cross'), tier: 4, awaken: true, kind: 'onDeath',
    desc: () => 'On death, heals every ally in 12m to full-ish and blesses them for 8s. Killing the healer becomes a trap.',
    run(b, self) {
      for (const a of b.alliesNear(self, self.x, self.z, 12)) {
        b.heal(a, S(self, 150), self);
        b.applyStatus(a, 'blessed', 8, { src: self });
      }
      b.fx('holyPillar', self.x, 0, self.z, { scale: 4 });
      b.sound('holy', self.x, self.z);
      b.log('The light does not go out', self.team);
    },
  },

  warBanner: {
    id: 'warBanner', name: 'War Banner', icon: ic('banner'), tier: 0, kind: 'aura',
    radius: 8,
    desc: () => 'Allies under the banner are Rallied: +15% damage and immune to fear.',
    aura(b, self) {
      for (const a of b.alliesNear(self, self.x, self.z, this.radius, { withSelf: true }))
        b.applyStatus(a, 'rallied', 0.5, { src: self });
    },
  },

  logistics: {
    id: 'logistics', name: 'Field Logistics', icon: ic('horn'), tier: 2, kind: 'passive',
    desc: () => 'While this unit lives, your Command regenerates 14% faster.',
    commandRegenBonus: 0.14,
  },

  /* =======================================================================
     ASSASSINS
     ======================================================================= */

  shadowstep: {
    id: 'shadowstep', name: 'Shadowstep', icon: ic('void'), tier: 0, kind: 'onSpawn',
    desc: () => 'Enters the field hidden. Cannot be targeted until it strikes, and the first strike is a backstab.',
    run(b, self) { b.applyStatus(self, 'stealthed', 6, { src: self }); },
  },

  markTheWeak: {
    id: 'markTheWeak', name: 'Hunt the Soft', icon: ic('target'), tier: 0, kind: 'passive',
    desc: () => 'Ignores the frontline entirely: seeks out enemy casters, healers and archers, and deals +45% damage to unarmoured targets.',
    targetPriority: ['support', 'ranged', 'caster', 'siege'],
    onOutgoing(self, target, dmg) { return target.armorType === 'unarmored' ? dmg * 1.45 : dmg; },
  },

  vanish: {
    id: 'vanish', name: 'Vanish', icon: ic('wind'), tier: 2, kind: 'onKill',
    desc: () => 'After a kill, slips back into the shadows for 3s and refreshes its backstab.',
    run(b, self) {
      b.applyStatus(self, 'stealthed', 3, { src: self });
      b.fx('smoke', self.x, 0.8, self.z, {});
    },
  },

  exsanguinate: {
    id: 'exsanguinate', name: 'Exsanguinate', icon: ic('drop'), tier: 3, kind: 'onHit',
    desc: () => 'Every strike stacks Bleeding. The target bleeds out as it chases.',
    run(b, self, ctx) { b.applyStatus(ctx.target, 'bleeding', 5, { src: self, dps: S(self, 10) }); },
  },

  deathmark: {
    id: 'deathmark', name: 'Death Mark', icon: ic('skull'), tier: 4, awaken: true, kind: 'active',
    cd: 18, range: 22,
    desc: () => 'Marks the single most dangerous enemy on the field. Teleports behind it and executes it outright below 22% health.',
    want: (b, self) => !!b.highestThreatEnemy(self, 22),
    run(b, self) {
      const t = b.highestThreatEnemy(self, this.range);
      if (!t) return;
      const a = Math.atan2(t.z - self.z, t.x - self.x);
      b.fx('smoke', self.x, 0.8, self.z, {});
      b.teleport(self, t.x - Math.cos(a) * 1.4, t.z - Math.sin(a) * 1.4);
      b.fx('smoke', self.x, 0.8, self.z, {});
      b.sound('shadow', self.x, self.z);
      if (t.hp / t.maxHp <= 0.22) {
        b.dealDamage(self, t, t.hp * 3, 'shadow', { isAbility: true, execute: true });
        b.log(self.name + ' executes ' + t.name, self.team);
      } else {
        b.dealDamage(self, t, S(self, 130), 'shadow', { isAbility: true, backstab: true });
      }
    },
  },

  /* =======================================================================
     TANKS & GUARDIANS
     ======================================================================= */

  taunt: {
    id: 'taunt', name: 'Bellow', icon: ic('horn'), tier: 0, kind: 'active',
    cd: 10, radius: 8,
    desc: () => 'Forces every enemy within 8m to attack this unit for 3.5s. The reason your mage is still alive.',
    want: (b, self) => b.enemiesNear(self, self.x, self.z, 8).length >= 2,
    run(b, self) {
      let n = 0;
      for (const e of b.enemiesNear(self, self.x, self.z, this.radius)) {
        if (e.mods.ccImmune) continue;
        b.applyStatus(e, 'taunted', 3.5, { src: self });
        e.forcedTarget = self; n++;
      }
      if (n) { b.fx('tauntRing', self.x, 0.3, self.z, { scale: this.radius }); b.sound('horn', self.x, self.z, { vol: 0.5 }); }
    },
  },

  bulwark: {
    id: 'bulwark', name: 'Bulwark', icon: ic('shield'), tier: 2, kind: 'passive',
    desc: () => 'Takes 30% less damage from ranged attacks and cannot be knocked back.',
    mods: { rangedTakenMult: 0.7, ccImmune: true },
  },

  thornplate: {
    id: 'thornplate', name: 'Thornplate', icon: ic('thorns'), tier: 3, kind: 'onDamaged',
    desc: () => 'Attackers in melee take 30 blunt damage back per swing.',
    run(b, self, ctx) {
      if (!ctx.attacker || ctx.attacker.range > 4) return;
      b.dealDamage(self, ctx.attacker, S(self, 30), 'blunt', { silent: true, noCrit: true });
    },
  },

  /* =======================================================================
     BEASTS & MONSTERS
     ======================================================================= */

  packHunter: {
    id: 'packHunter', name: 'Pack Hunter', icon: ic('wolf'), tier: 0, kind: 'aura',
    radius: 6,
    desc: () => '+14% damage per nearby pack-mate. Alone it is a nuisance; in a pack it is a problem.',
    aura(b, self) {
      let n = 0;
      for (const a of b.alliesNear(self, self.x, self.z, this.radius)) if (a.tags?.includes('beast')) n++;
      if (n) self.auraDmgMult *= 1 + 0.14 * Math.min(n, 4);
    },
  },

  pounce: {
    id: 'pounce', name: 'Pounce', icon: ic('paw'), tier: 2, kind: 'active',
    cd: 7, range: 11,
    desc: () => 'Leaps onto a ranged or support target, knocking it down for 1s.',
    want: (b, self) => !!b.nearestEnemy(self, 11, { prefer: ['ranged', 'support', 'caster'] }),
    run(b, self) {
      const t = b.nearestEnemy(self, this.range, { prefer: ['ranged', 'support', 'caster'] });
      if (!t) return;
      b.leap(self, t.x, t.z, 0.45, () => {
        b.dealDamage(self, t, S(self, 44), 'slash', { isAbility: true });
        if (!t.mods.ccImmune) b.applyStatus(t, 'stunned', 1.0, { src: self });
        b.fx('impact', t.x, 0.6, t.z, {});
        b.sound('hit.flesh', t.x, t.z);
      });
    },
  },

  bloodFrenzy: {
    id: 'bloodFrenzy', name: 'Blood Frenzy', icon: ic('rage'), tier: 0, kind: 'onDamaged',
    desc: () => 'Every wound taken stacks Enraged: +12% damage and +10% attack speed, up to five times.',
    run(b, self) { b.applyStatus(self, 'enraged', 7, { src: self, stacks: 1 }); },
  },

  venomBreath: {
    id: 'venomBreath', name: 'Venom Breath', icon: ic('poison'), tier: 0, kind: 'active',
    cd: 9, range: 13, cone: 0.7,
    desc: (self) => `Breathes a cone of venom: ${Math.round(S(self || {}, 30))} poison damage and heavy Poison stacks. Useless against the undead.`,
    want: (b, self) => b.enemiesNear(self, self.x, self.z, 13).length >= 1,
    run(b, self) {
      const t = b.nearestEnemy(self, this.range);
      if (!t) return;
      const a = Math.atan2(t.z - self.z, t.x - self.x);
      b.fx('breathCone', self.x, 1.4, self.z, { angle: a, len: this.range, color: 0x8fbf4a });
      b.sound('fire', self.x, self.z, { vol: 0.6 });
      for (const e of b.enemiesInCone(self, a, this.cone, this.range)) {
        b.dealDamage(self, e, S(self, 30), 'poison', { isAbility: true });
        b.applyStatus(e, 'poisoned', 8, { src: self, dps: S(self, 9), stacks: 2 });
      }
    },
  },

  diveAttack: {
    id: 'diveAttack', name: 'Dive', icon: ic('bird'), tier: 0, kind: 'active',
    cd: 8, range: 16,
    desc: () => 'Folds its wings and drops on a target for triple damage, then climbs back out of melee reach.',
    want: (b, self) => !!b.nearestEnemy(self, 16),
    run(b, self) {
      const t = b.nearestEnemy(self, this.range, { prefer: ['ranged', 'support', 'caster'] });
      if (!t) return;
      b.leap(self, t.x, t.z, 0.4, () => {
        b.dealDamage(self, t, S(self, 55) * 3, 'pierce', { isAbility: true });
        b.fx('impact', t.x, 0.9, t.z, { scale: 1.6 });
        b.sound('hit.flesh', t.x, t.z);
        b.knockback(t, self.x, self.z, 3);
      }, { arc: 4.5 });
    },
  },

  flying: {
    id: 'flying', name: 'Flying', icon: ic('wing'), tier: 0, kind: 'passive',
    desc: () => 'Ignores terrain, chokepoints and ground units entirely. Only ranged attacks can reach it.',
    mods: { flying: true },
  },

  regrowth: {
    id: 'regrowth', name: 'Heartwood', icon: ic('forest'), tier: 0, kind: 'onSpawn',
    desc: () => 'Constantly knits itself back together. Whittling it down with chip damage does not work.',
    run(b, self) { b.applyStatus(self, 'regenerating', 9999, { src: self, hps: S(self, 16) }); },
  },

  entangle: {
    id: 'entangle', name: 'Entangle', icon: ic('leaf'), tier: 2, kind: 'active',
    cd: 11, range: 12, radius: 4,
    desc: () => 'Roots everything in a 4m circle for 2.2s. Turns a bridge into a wall.',
    want: (b, self) => !!bestCluster(b, self, 12, 4, 2),
    run(b, self) {
      const spot = bestCluster(b, self, this.range, this.radius, 1);
      if (!spot) return;
      b.fx('vines', spot.x, 0.1, spot.z, { scale: this.radius });
      b.sound('cast', spot.x, spot.z);
      for (const e of b.enemiesNear(self, spot.x, spot.z, this.radius))
        if (!e.mods.ccImmune && !e.mods.flying) b.applyStatus(e, 'rooted', 2.2, { src: self });
    },
  },

  /* =======================================================================
     SIEGE
     ======================================================================= */

  siegeShot: {
    id: 'siegeShot', name: 'Siege Shot', icon: ic('rock'), tier: 0, kind: 'passive',
    desc: () => 'Attacks land as a splash instead of a single hit, and only structures are worth the stone.',
    splash: 3.6, structurePriority: true,
    mods: { structureMult: 2.2 },
  },

  minimumRange: {
    id: 'minimumRange', name: 'Minimum Range', icon: ic('ban'), tier: 0, kind: 'passive',
    desc: () => 'Cannot fire at anything closer than 8m. Leave it unescorted and it is free kills for the enemy.',
    minRange: 8,
  },

  ranging: {
    id: 'ranging', name: 'Ranging Shot', icon: ic('angle'), tier: 2, kind: 'passive',
    desc: () => 'Each consecutive shot at the same target does 20% more damage, up to +60%. Punishes anyone who stands still.',
    onOutgoing(self, target, dmg) {
      if (self._lastTgt === target.id) self._rangeN = Math.min(3, (self._rangeN || 0) + 1);
      else { self._lastTgt = target.id; self._rangeN = 0; }
      return dmg * (1 + 0.2 * self._rangeN);
    },
  },

  crewed: {
    id: 'crewed', name: 'Crewed', icon: ic('group'), tier: 0, kind: 'onSpawn',
    desc: () => 'Arrives with two crew who defend it. Kill the crew and the engine is helpless.',
    run(b, self) {
      for (let i = 0; i < 2; i++)
        b.spawn('militia', self.team, self.x + (i ? 1.6 : -1.6), self.z - 1, { summoned: true, lvl: self.lvl, escort: self });
    },
  },

  /* =======================================================================
     CASTERS — CONTROL & ELEMENTS
     ======================================================================= */

  frostbite: {
    id: 'frostbite', name: 'Frostbite', icon: ic('frost'), tier: 0, kind: 'onHit',
    desc: () => 'Every hit chills. Four stacks of chill freeze the target solid for 1.5s.',
    run(b, self, ctx) {
      b.applyStatus(ctx.target, 'slowed', 4, { src: self, stacks: 1 });
      const st = ctx.target.statuses.find(s => s.id === 'slowed');
      if (st && st.stacks >= 4) {
        b.removeStatus(ctx.target, 'slowed');
        if (!ctx.target.mods.ccImmune) b.applyStatus(ctx.target, 'frozen', 1.5, { src: self });
        b.fx('freeze', ctx.target.x, 1, ctx.target.z, {});
        b.sound('frost', ctx.target.x, ctx.target.z);
      }
    },
  },

  blizzard: {
    id: 'blizzard', name: 'Blizzard', icon: ic('frost'), tier: 3, kind: 'active',
    cd: 16, range: 16, radius: 5.5, dur: 5,
    desc: () => 'A standing storm: everything inside is chilled and takes frost damage for 5s. The single best answer to a swarm push.',
    want: (b, self) => !!bestCluster(b, self, 16, 5.5, 3),
    run(b, self) {
      const spot = bestCluster(b, self, this.range, this.radius, 1);
      if (!spot) return;
      b.fx('blizzard', spot.x, 0.2, spot.z, { scale: this.radius, life: this.dur });
      b.sound('frost', spot.x, spot.z);
      b.groundEffect({
        x: spot.x, z: spot.z, r: this.radius, dur: this.dur, team: self.team, interval: 0.5,
        onTick: (u) => {
          b.dealDamage(self, u, S(self, 13), 'frost', { silent: true, isAbility: true, noCrit: true });
          b.applyStatus(u, 'slowed', 1, { src: self });
        },
      });
    },
  },

  chainLightning: {
    id: 'chainLightning', name: 'Chain Lightning', icon: ic('stamina'), tier: 0, kind: 'active',
    cd: 6.5, range: 15, jumps: 4,
    desc: (self) => `Arcs between up to 4 enemies for ${Math.round(S(self || {}, 40))} arcane damage, losing 15% each jump. Dense formations are a liability.`,
    want: (b, self) => !!b.nearestEnemy(self, 15),
    run(b, self) {
      let cur = b.nearestEnemy(self, this.range);
      if (!cur) return;
      const hit = new Set();
      let dmg = S(self, 40), from = self;
      b.sound('lightning', self.x, self.z);
      for (let i = 0; i < this.jumps && cur; i++) {
        hit.add(cur.id);
        b.beam(from, cur, { color: 0x9fd0ff, width: 0.2, life: 0.18, jagged: true });
        b.dealDamage(self, cur, dmg, 'arcane', { isAbility: true });
        dmg *= 0.85;
        from = cur;
        cur = b.enemiesNear(self, cur.x, cur.z, 7).find(e => !hit.has(e.id));
      }
    },
  },

  firestorm: {
    id: 'firestorm', name: 'Firestorm', icon: ic('flame'), tier: 0, kind: 'active',
    cd: 12, range: 17, radius: 4.8, dur: 4,
    desc: () => 'Sets a patch of ground alight for 4s. Anything oiled that walks in dies.',
    want: (b, self) => !!bestCluster(b, self, 17, 4.8, 2),
    run(b, self) {
      const spot = bestCluster(b, self, this.range, this.radius, 1);
      if (!spot) return;
      b.telegraph(spot.x, spot.z, this.radius, 0.7, 0xe8823a);
      b.castDelayed(self, 0.7, () => {
        b.fx('firestorm', spot.x, 0.2, spot.z, { scale: this.radius, life: this.dur });
        b.sound('fire', spot.x, spot.z);
        b.groundEffect({
          x: spot.x, z: spot.z, r: this.radius, dur: this.dur, team: self.team, interval: 0.5,
          onTick: (u) => {
            b.dealDamage(self, u, S(self, 15), 'fire', { silent: true, isAbility: true, noCrit: true });
            b.applyStatus(u, 'burning', 3, { src: self, dps: S(self, 8) });
          },
        });
      });
    },
  },

  slickOil: {
    id: 'slickOil', name: 'Oil Flask', icon: ic('barrel'), tier: 0, kind: 'active',
    cd: 8, range: 14, radius: 4.2,
    desc: () => 'Coats enemies in oil for 9s: they take 85% more fire damage. Worthless alone — brutal next to any fire unit.',
    want: (b, self) => !!bestCluster(b, self, 14, 4.2, 2),
    run(b, self) {
      const spot = bestCluster(b, self, this.range, this.radius, 1);
      if (!spot) return;
      b.fx('oilSplash', spot.x, 0.1, spot.z, { scale: this.radius });
      for (const e of b.enemiesNear(self, spot.x, spot.z, this.radius))
        b.applyStatus(e, 'oiled', 9, { src: self });
      b.groundEffect({ x: spot.x, z: spot.z, r: this.radius, dur: 9, team: self.team, interval: 0.6, decal: 'oil',
        onTick: (u) => b.applyStatus(u, 'oiled', 1.2, { src: self }) });
    },
  },

  silence: {
    id: 'silence', name: 'Seal of Silence', icon: ic('silence'), tier: 0, kind: 'active',
    cd: 13, range: 15, radius: 5,
    desc: () => 'Seals enemy abilities in a 5m circle for 4s. Turns an enemy archmage into a man with a stick.',
    want: (b, self) => b.enemiesNear(self, self.x, self.z, 15).some(e => e.role === 'caster' || e.role === 'support'),
    run(b, self) {
      const spot = bestCluster(b, self, this.range, this.radius, 1, e => (e.role === 'caster' || e.role === 'support') ? 3 : 1);
      if (!spot) return;
      b.fx('silenceRing', spot.x, 0.6, spot.z, { scale: this.radius });
      b.sound('shadow', spot.x, spot.z);
      for (const e of b.enemiesNear(self, spot.x, spot.z, this.radius)) b.applyStatus(e, 'silenced', 4, { src: self });
    },
  },

  empoweredCast: {
    id: 'empoweredCast', name: 'Gathering Storm', icon: ic('orb'), tier: 2, kind: 'passive',
    desc: () => 'Every ability cast stacks Empowered: +18% ability damage, up to three stacks. The longer it is left alone, the worse the next spell is.',
    onCast(b, self) { b.applyStatus(self, 'empowered', 10, { src: self, stacks: 1 }); },
  },

  cursedAura: {
    id: 'cursedAura', name: 'Pall of the Crown', icon: ic('skull'), tier: 2, kind: 'aura',
    radius: 9,
    desc: () => 'Enemies within 9m deal 12% less damage and cannot be healed above 80% health.',
    aura(b, self) {
      for (const e of b.enemiesNear(self, self.x, self.z, this.radius)) {
        e.auraDmgMult *= 0.88;
        e.healCap = Math.min(e.healCap ?? 1, 0.8);
      }
    },
  },

  antimagic: {
    id: 'antimagic', name: 'Antimagic Field', icon: ic('ban'), tier: 2, kind: 'aura',
    radius: 7,
    desc: () => 'Allies nearby take 35% less magical damage. A hard counter to caster-heavy armies.',
    aura(b, self) {
      for (const a of b.alliesNear(self, self.x, self.z, this.radius, { withSelf: true })) a.auraMagicResist *= 0.65;
    },
  },

  /* =======================================================================
     SUMMONERS & NECROMANCY
     ======================================================================= */

  raiseDead: {
    id: 'raiseDead', name: 'Raise Dead', icon: ic('coffin'), tier: 0, kind: 'active',
    cd: 5, range: 12,
    desc: () => 'Raises a Ghoul from any corpse within 12m — friend or foe. Every fight it loses feeds it.',
    want: (b, self) => b.corpsesNear(self.x, self.z, 12).length > 0,
    run(b, self) {
      const cs = b.corpsesNear(self.x, self.z, this.range);
      if (!cs.length) return;
      const c = cs[0];
      b.consumeCorpse(c);
      b.spawn('ghoul', self.team, c.x, c.z, { summoned: true, lvl: self.lvl, owner: self });
      b.fx('necroBurst', c.x, 0.3, c.z, {});
      b.sound('shadow', c.x, c.z, { vol: 0.6 });
    },
  },

  summonSkeletons: {
    id: 'summonSkeletons', name: 'Call the Bones', icon: ic('bone'), tier: 0, kind: 'active',
    cd: 11, count: 3,
    desc: () => 'Pulls three skeletons out of the ground beside it. They are weak, expendable and endless.',
    want: () => true,
    run(b, self) {
      for (let i = 0; i < this.count; i++) {
        const a = (i / this.count) * TAU + rng.range(0, 1);
        b.spawn('skeleton', self.team, self.x + Math.cos(a) * 2.2, self.z + Math.sin(a) * 2.2,
          { summoned: true, lvl: self.lvl, owner: self });
      }
      b.fx('necroBurst', self.x, 0.3, self.z, { scale: 2.6 });
      b.sound('shadow', self.x, self.z);
    },
  },

  soulHarvest: {
    id: 'soulHarvest', name: 'Soul Harvest', icon: ic('ghost'), tier: 2, kind: 'onDeath',
    desc: () => 'When one of its summons dies, this unit heals. Grinding through the minions feeds the summoner.',
    onMinionDeath(b, self) { b.heal(self, S(self, 30), self); },
  },

  plague: {
    id: 'plague', name: 'Plague', icon: ic('plague'), tier: 3, kind: 'onHit',
    desc: () => 'Poison spreads from the target to everything within 4m when it dies.',
    run(b, self, ctx) {
      b.applyStatus(ctx.target, 'poisoned', 7, { src: self, dps: S(self, 11), stacks: 1, spread: true });
    },
  },

  /* =======================================================================
     CAVALRY & MOMENTUM
     ======================================================================= */

  charge: {
    id: 'charge', name: 'Charge', icon: ic('horse'), tier: 0, kind: 'active',
    cd: 10, range: 18,
    desc: () => 'Builds speed over 18m and slams through the enemy line, knocking everything aside. Wasted if there is no room to run.',
    want: (b, self) => { const t = b.nearestEnemy(self, 18); return t && Math.hypot(t.x - self.x, t.z - self.z) > 8; },
    run(b, self) {
      const t = b.nearestEnemy(self, this.range);
      if (!t) return;
      const a = Math.atan2(t.z - self.z, t.x - self.x);
      b.sound('horn', self.x, self.z, { vol: 0.5 });
      b.dash(self, a, 26, 0.75, {
        onPass: (e) => {
          b.dealDamage(self, e, S(self, 68), 'blunt', { isAbility: true });
          b.knockback(e, self.x, self.z, 6.5);
          if (!e.mods.ccImmune) b.applyStatus(e, 'stunned', 0.6, { src: self });
          b.fx('impact', e.x, 0.9, e.z, { scale: 1.3 });
        },
      });
    },
  },

  momentum: {
    id: 'momentum', name: 'Momentum', icon: ic('wind'), tier: 2, kind: 'passive',
    desc: () => 'Damage scales with how fast it is moving — up to +50% at a full gallop. Standing still, it is just a horse.',
    onOutgoing(self, target, dmg) {
      // A rooted, frozen or braced unit has moveSpeed 0, and 0/0 is NaN — which
      // used to propagate straight through the damage pipeline into a unit's
      // health and never come back.
      if (!(self.moveSpeed > 0)) return dmg;
      return dmg * (1 + 0.5 * clamp(self.speedNow / self.moveSpeed, 0, 1));
    },
  },

  trample: {
    id: 'trample', name: 'Trample', icon: ic('horse'), tier: 3, kind: 'passive',
    desc: () => 'Runs straight through units of mass 1, hurting them as it passes.',
    mods: { trample: 26 },
  },

  /* =======================================================================
     BERSERKERS & DUELLISTS
     ======================================================================= */

  bloodlust: {
    id: 'bloodlust', name: 'Bloodlust', icon: ic('drop'), tier: 0, kind: 'passive',
    desc: () => 'Gains up to +80% attack speed and +45% damage as its health falls. At death\'s door it is at its most dangerous.',
    onRecalc(self, m) {
      const missing = 1 - self.hp / self.maxHp;
      m.atkSpeedMult *= 1 + 0.8 * missing;
      m.dmgMult *= 1 + 0.45 * missing;
    },
  },

  execute: {
    id: 'execute', name: 'Execute', icon: ic('dagger'), tier: 2, kind: 'passive',
    desc: () => 'Deals double damage to enemies below 30% health. Finishes fights instead of prolonging them.',
    onOutgoing(self, target, dmg) { return (target.hp / target.maxHp < 0.3) ? dmg * 2 : dmg; },
  },

  riposte: {
    id: 'riposte', name: 'Riposte', icon: ic('swords'), tier: 3, kind: 'onDamaged',
    desc: () => 'A 25% chance to parry a melee blow outright and counter for 70 slash damage.',
    run(b, self, ctx) {
      if (!ctx.attacker || ctx.attacker.range > 4 || !rng.chance(0.25)) return;
      ctx.negate = true;
      b.dealDamage(self, ctx.attacker, S(self, 70), 'slash', { isAbility: true });
      b.fx('parry', self.x, 1.2, self.z, {});
      b.sound('block', self.x, self.z);
    },
  },

  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind', icon: ic('vortex'), tier: 0, kind: 'active',
    cd: 7, radius: 3.6,
    desc: (self) => `Spins through everything within 3.6m for ${Math.round(S(self || {}, 42))} slash damage, three times.`,
    want: (b, self) => b.enemiesNear(self, self.x, self.z, 3.6).length >= 2,
    run(b, self) {
      for (let i = 0; i < 3; i++) {
        b.castDelayed(self, i * 0.22, () => {
          b.fx('whirl', self.x, 1, self.z, { scale: this.radius });
          b.sound('swing', self.x, self.z);
          for (const e of b.enemiesNear(self, self.x, self.z, this.radius))
            b.dealDamage(self, e, S(self, 42), 'slash', { isAbility: true });
        });
      }
    },
  },

  /* =======================================================================
     LEGENDARY / MYTHIC SIGNATURES
     ======================================================================= */

  meteor: {
    id: 'meteor', name: 'Meteor', icon: ic('comet'), tier: 0, kind: 'active',
    cd: 22, range: 26, radius: 7,
    desc: (self) => `Calls down a mountain. After a 2s telegraph: ${Math.round(S(self || {}, 260))} fire damage in a 7m crater, and the ground burns for 6s.`,
    want: (b, self) => !!bestCluster(b, self, 26, 7, 3),
    run(b, self) {
      const spot = bestCluster(b, self, this.range, this.radius, 1);
      if (!spot) return;
      b.telegraph(spot.x, spot.z, this.radius, 2.0, 0xe8823a, { danger: true });
      b.sound('cast', self.x, self.z);
      b.castDelayed(self, 2.0, () => {
        b.fx('meteor', spot.x, 0, spot.z, { scale: this.radius });
        b.sound('structure.down', spot.x, spot.z);
        b.shake(0.9);
        for (const e of b.enemiesNear(self, spot.x, spot.z, this.radius))
          b.dealDamage(self, e, S(self, 260), 'fire', { isAbility: true });
        b.groundEffect({ x: spot.x, z: spot.z, r: this.radius, dur: 6, team: self.team, interval: 0.5,
          onTick: u => b.dealDamage(self, u, S(self, 18), 'fire', { silent: true, noCrit: true }) });
      });
    },
  },

  rebirth: {
    id: 'rebirth', name: 'Rebirth', icon: ic('flame'), tier: 0, kind: 'onDeath',
    desc: () => 'Burns to ash and rises again at 60% health, once per battle, immolating everything nearby as it returns.',
    run(b, self) {
      if (self._reborn) return;
      self._reborn = true;
      b.revive(self, 0.6);
      b.fx('phoenixBurst', self.x, 1.2, self.z, { scale: 6 });
      b.sound('fire', self.x, self.z);
      b.shake(0.5);
      for (const e of b.enemiesNear(self, self.x, self.z, 6)) {
        b.dealDamage(self, e, S(self, 120), 'fire', { isAbility: true });
        b.applyStatus(e, 'burning', 6, { src: self, dps: S(self, 14) });
      }
      b.log('The Phoenix rises', self.team);
    },
  },

  immortalHost: {
    id: 'immortalHost', name: 'Immortal Host', icon: ic('crown'), tier: 0, kind: 'aura',
    radius: 14, interval: 6,
    desc: () => 'Every 6s, raises a Wight from the nearest corpse and curses a living enemy. The longer the battle runs, the worse it gets for you.',
    aura(b, self) {
      if ((self._hostT || 0) > b.t) return;
      self._hostT = b.t + this.interval;
      const cs = b.corpsesNear(self.x, self.z, this.radius);
      if (cs.length) {
        b.consumeCorpse(cs[0]);
        b.spawn('wight', self.team, cs[0].x, cs[0].z, { summoned: true, lvl: self.lvl, owner: self });
        b.fx('necroBurst', cs[0].x, 0.3, cs[0].z, {});
      }
      const e = b.highestThreatEnemy(self, this.radius);
      if (e) { b.applyStatus(e, 'cursed', 6, { src: self }); b.fx('curse', e.x, 1.4, e.z, {}); }
    },
  },

  sunblade: {
    id: 'sunblade', name: 'Sunblade', icon: ic('star'), tier: 0, kind: 'onHit',
    desc: () => 'Every strike is holy: annihilates undead, and every third strike heals the nearest wounded ally for a third of the damage dealt.',
    run(b, self, ctx) {
      self._sunN = (self._sunN || 0) + 1;
      if (self._sunN % 3) return;
      const a = b.lowestHpAlly(self, 10, { hurtOnly: true, withSelf: true });
      if (a) { b.heal(a, ctx.dmg * 0.33, self); b.beam(self, a, { color: 0xf3d98a, width: 0.1, life: 0.3 }); }
    },
  },

  voidPhase: {
    id: 'voidPhase', name: 'Void Phase', icon: ic('vortex'), tier: 0, kind: 'passive',
    desc: () => 'Exists only partly in this world: ignores armour entirely, and every 5s it blinks out for 1s, untouchable.',
    mods: { ignoreArmor: true },
    tickInterval: 5,
    onTick(b, self) {
      b.applyStatus(self, 'phased', 1, { src: self });
      b.fx('voidBlink', self.x, 1.2, self.z, {});
    },
  },

  cataclysm: {
    id: 'cataclysm', name: 'Cataclysm', icon: ic('volcano'), tier: 0, kind: 'active',
    cd: 34, range: 40,
    desc: () => 'Ends things. Three meteors walk across the enemy half of the field, each leaving burning ground behind.',
    want: (b, self) => b.enemiesNear(self, self.x, self.z, 40).length >= 3,
    run(b, self) {
      const dir = self.team === 0 ? 1 : -1;
      for (let i = 0; i < 3; i++) {
        const x = rng.range(-16, 16), z = dir * (14 + i * 9);
        b.telegraph(x, z, 7, 1.6 + i * 0.4, 0xe8823a, { danger: true });
        b.castDelayed(self, 1.6 + i * 0.4, () => {
          b.fx('meteor', x, 0, z, { scale: 7 });
          b.sound('structure.down', x, z);
          b.shake(1.0);
          for (const e of b.enemiesNear(self, x, z, 7))
            b.dealDamage(self, e, S(self, 220), 'fire', { isAbility: true });
          for (const s of b.structures(self.team === 0 ? 1 : 0))
            if (Math.hypot(s.x - x, s.z - z) < 9) b.dealDamage(self, s, S(self, 300), 'fire', { isAbility: true });
          b.groundEffect({ x, z, r: 7, dur: 7, team: self.team, interval: 0.5,
            onTick: u => b.dealDamage(self, u, S(self, 20), 'fire', { silent: true, noCrit: true }) });
        });
      }
      b.log('CATACLYSM', self.team);
    },
  },

  dominate: {
    id: 'dominate', name: 'The Hollow Crown', icon: ic('crown'), tier: 0, kind: 'onKill',
    desc: () => 'Anything it kills rises again fighting for you, at half strength, for 20s. Every enemy on the field is a potential recruit.',
    run(b, self, ctx) {
      if (!ctx.victim || ctx.victim.summoned || ctx.victim.isStructure) return;
      b.spawn(ctx.victim.cardId, self.team, ctx.victim.x, ctx.victim.z, {
        summoned: true, lvl: Math.max(1, ctx.victim.lvl - 2), scale: 0.5, life: 20, owner: self,
      });
      b.fx('dominate', ctx.victim.x, 1.2, ctx.victim.z, {});
      b.sound('shadow', ctx.victim.x, ctx.victim.z);
    },
  },

  everburning: {
    id: 'everburning', name: 'Everburning', icon: ic('flame'), tier: 0, kind: 'aura',
    radius: 6,
    desc: () => 'Permanently sets fire to the ground it walks over. Denies whole lanes.',
    aura(b, self) {
      if ((self._burnT || 0) > b.t) return;
      self._burnT = b.t + 0.8;
      b.groundEffect({ x: self.x, z: self.z, r: 3.4, dur: 10, team: self.team, interval: 0.5, decal: 'fire',
        onTick: u => { b.dealDamage(self, u, S(self, 14), 'fire', { silent: true, noCrit: true }); b.applyStatus(u, 'burning', 2, { src: self, dps: S(self, 8) }); } });
    },
  },

  quake: {
    id: 'quake', name: 'Quake', icon: ic('globe'), tier: 0, kind: 'active',
    cd: 14, radius: 9,
    desc: () => 'Every step is a tremor. Stuns and damages everything in a 9m radius, and cracks structures within it.',
    want: (b, self) => b.enemiesNear(self, self.x, self.z, 9).length >= 2,
    run(b, self) {
      b.fx('shockwave', self.x, 0.1, self.z, { scale: this.radius, color: 0xc8a98a });
      b.sound('stomp', self.x, self.z);
      b.shake(0.75);
      for (const e of b.enemiesNear(self, self.x, self.z, this.radius)) {
        b.dealDamage(self, e, S(self, 90), 'blunt', { isAbility: true });
        if (!e.mods.ccImmune) b.applyStatus(e, 'stunned', 1.1, { src: self });
      }
      for (const s of b.structures(self.team === 0 ? 1 : 0))
        if (Math.hypot(s.x - self.x, s.z - self.z) < this.radius + 3)
          b.dealDamage(self, s, S(self, 160), 'blunt', { isAbility: true });
    },
  },

  reflectSpells: {
    id: 'reflectSpells', name: 'Runic Skin', icon: ic('talisman'), tier: 0, kind: 'passive',
    desc: () => 'Reflects 35% of all magical damage back at the caster. Arcane armies break themselves on it.',
    reflectMagic: 0.35,
    mods: { magicTakenMult: 0.7 },
  },

  tentacles: {
    id: 'tentacles', name: 'Dragging Tentacles', icon: ic('kraken'), tier: 0, kind: 'active',
    cd: 9, range: 14,
    desc: () => 'Hauls the three nearest enemies into melee range and roots them. Ranged armies suddenly find themselves in a knife fight.',
    want: (b, self) => b.enemiesNear(self, self.x, self.z, 14).length >= 2,
    run(b, self) {
      const list = b.enemiesNear(self, self.x, self.z, this.range)
        .filter(e => !e.mods.ccImmune && e.mass < 4).slice(0, 3);
      for (const e of list) {
        b.beam(self, e, { color: 0x4f8fd4, width: 0.22, life: 0.4 });
        b.pull(e, self.x, self.z, 10);
        b.applyStatus(e, 'rooted', 1.8, { src: self });
        b.dealDamage(self, e, S(self, 36), 'blunt', { isAbility: true });
      }
      if (list.length) b.sound('hit.flesh', self.x, self.z);
    },
  },

  /* =======================================================================
     ENEMY-ONLY / BOSS ABILITIES
     ======================================================================= */

  totemBound: {
    id: 'totemBound', name: 'Totem-Bound', icon: ic('statue'), tier: 0, kind: 'passive',
    desc: () => 'Takes 85% less damage while its totems still stand. Destroy them first.',
    onRecalc(self, m) { if (self.battleRef?.aliveTotems > 0) m.dmgTakenMult *= 0.15; },
  },

  summonWave: {
    id: 'summonWave', name: 'Endless Horde', icon: ic('axe'), tier: 0, kind: 'active',
    cd: 14,
    desc: () => 'Calls a fresh wave of warriors from off the field every 14s.',
    want: () => true,
    run(b, self) {
      const kinds = self.waveKinds || ['goblinCutter', 'goblinCutter', 'goblinArcher'];
      for (let i = 0; i < kinds.length; i++) {
        const a = (i / kinds.length) * TAU;
        b.spawn(kinds[i], self.team, self.x + Math.cos(a) * 3, self.z + Math.sin(a) * 3, { summoned: true, lvl: self.lvl });
      }
      b.fx('horn', self.x, 2, self.z, {});
      b.sound('horn', self.x, self.z);
      b.log('A fresh wave pours in', self.team);
    },
  },

  commandTheft: {
    id: 'commandTheft', name: 'Cutpurse', icon: ic('purse'), tier: 0, kind: 'active',
    cd: 17,
    desc: () => 'Steals 2 Command from the enemy commander.',
    want: () => true,
    run(b, self) {
      const stolen = b.drainCommand(self.team === 0 ? 1 : 0, 2);
      if (stolen > 0) {
        b.log('Your Command was stolen!', self.team === 0 ? 1 : 0);
        b.fx('curse', self.x, 1.6, self.z, {});
        b.sound('ui.deny', self.x, self.z);
      }
    },
  },

  rotatingWard: {
    id: 'rotatingWard', name: 'Rotating Ward', icon: ic('shield'), tier: 0, kind: 'passive',
    desc: () => 'Immune to one damage type at a time; the ward rotates every 8s. Its colour tells you which. Bring a mixed army or bring nothing.',
    cycle: ['slash', 'pierce', 'arcane', 'fire'],
    current(self, t) { return this.cycle[Math.floor(t / 8) % this.cycle.length]; },
    onIncoming(self, dmgType, dmg, t) { return this.current(self, t) === dmgType ? 0 : dmg; },
  },

  pylonLinked: {
    id: 'pylonLinked', name: 'Pylon-Linked', icon: ic('crystal'), tier: 0, kind: 'passive',
    desc: () => 'Draws power from four pylons. Each one still standing grants a different, dangerous aura.',
  },

  enrageAtHalf: {
    id: 'enrageAtHalf', name: 'Wrath', icon: ic('rage'), tier: 0, kind: 'onDamaged',
    desc: () => 'Below half health it enrages permanently: +60% attack speed, +35% damage, and it hunts the enemy commander.',
    run(b, self) {
      if (self._wrath || self.hp > self.maxHp * 0.5) return;
      self._wrath = true;
      b.applyStatus(self, 'enraged', 9999, { src: self, stacks: 4 });
      self.huntCommander = true;
      b.fx('rage', self.x, 1.6, self.z, { scale: 3 });
      b.sound('horn', self.x, self.z);
      b.log(self.name + ' is enraged!', self.team);
      b.bossPhase(self, 2);
    },
  },

  corpseExplosion: {
    id: 'corpseExplosion', name: 'Corpse Bloom', icon: ic('skull'), tier: 0, kind: 'active',
    cd: 8, range: 16,
    desc: () => 'Detonates nearby corpses for poison damage. Burn the dead or drown in them.',
    want: (b, self) => b.corpsesNear(self.x, self.z, 16).length >= 2,
    run(b, self) {
      const cs = b.corpsesNear(self.x, self.z, this.range).slice(0, 4);
      for (const c of cs) {
        b.consumeCorpse(c);
        b.fx('poisonBurst', c.x, 0.5, c.z, { scale: 3 });
        for (const e of b.enemiesNear(self, c.x, c.z, 3.5)) {
          b.dealDamage(self, e, S(self, 54), 'poison', { isAbility: true });
          b.applyStatus(e, 'poisoned', 5, { src: self, dps: S(self, 8) });
        }
      }
    },
  },
};

/* ------------------------------------------------------------------ utils */

/**
 * Find the spot within `range` that maximises weighted enemy count inside
 * `radius`. This is what makes AoE casters feel clever rather than random —
 * they wait for a cluster instead of firing at whoever is closest.
 */
export function bestCluster(b, self, range, radius, minCount = 1, weightOf = null) {
  const cands = b.enemiesNear(self, self.x, self.z, range);
  if (!cands.length) return null;
  let best = null, bestScore = 0;
  const r2 = radius * radius;
  for (const c of cands) {
    let score = 0;
    for (const o of cands) {
      const dx = o.x - c.x, dz = o.z - c.z;
      if (dx * dx + dz * dz <= r2) score += weightOf ? weightOf(o) : (o.mass >= 3 ? 1.5 : 1);
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (!best || bestScore < minCount) return null;
  return { x: best.x, z: best.z, score: bestScore };
}

export const getAbility = id => ABILITIES[id];

/** Abilities a card has unlocked at a given level, in display order. */
export function abilitiesFor(card, level) {
  const tier = Math.floor((level - 1) / CFG.cards.tierEvery);
  const out = [];
  for (const id of card.abilities || []) {
    const a = ABILITIES[id];
    if (!a) continue;
    const req = a.tier || 0;
    out.push({ ability: a, unlocked: tier >= req && !(a.awaken && !card._awakened), tierReq: req, awaken: !!a.awaken });
  }
  return out;
}
