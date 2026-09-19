/* Statuses.js — every temporary condition a unit can be under.

   A status is pure data plus (optionally) a per-frame `tick`. The battle sim
   owns application and expiry; nothing here reaches back into the sim except
   through the `b` (battle) API it is handed.

   `mods` are multiplicative/additive modifiers folded together each frame by
   Entity.recalc(). Keeping them declarative means the UI can explain exactly
   why a unit is slow without re-implementing the maths.
*/

export const STATUS = {

  /* --------------------------------------------------------- damage over time */

  burning: {
    id: 'burning', name: 'Burning', icon: '🔥', color: '#e8823a', kind: 'debuff',
    stackable: true, maxStacks: 5, desc: 'Takes fire damage each second. Spreads on death.',
    tick(b, u, st, dt) {
      st.acc = (st.acc || 0) + dt;
      if (st.acc >= 0.5) {
        st.acc -= 0.5;
        b.dealDamage(st.src, u, st.dps * 0.5 * st.stacks, 'fire', { silent: true, noCrit: true });
      }
    },
  },

  poisoned: {
    id: 'poisoned', name: 'Poisoned', icon: '🧪', color: '#8fbf4a', kind: 'debuff',
    stackable: true, maxStacks: 8, desc: 'Takes poison damage each second and heals 50% less.',
    mods: { healTakenMult: 0.5 },
    tick(b, u, st, dt) {
      st.acc = (st.acc || 0) + dt;
      if (st.acc >= 0.5) {
        st.acc -= 0.5;
        b.dealDamage(st.src, u, st.dps * 0.5 * st.stacks, 'poison', { silent: true, noCrit: true });
      }
    },
  },

  bleeding: {
    id: 'bleeding', name: 'Bleeding', icon: '🩸', color: '#c5362b', kind: 'debuff',
    stackable: true, maxStacks: 6, desc: 'Loses health while it moves.',
    tick(b, u, st, dt) {
      if (u.speedNow < 0.4) return;         // stand still and the wound closes
      st.acc = (st.acc || 0) + dt;
      if (st.acc >= 0.4) {
        st.acc -= 0.4;
        b.dealDamage(st.src, u, st.dps * 0.4 * st.stacks, 'slash', { silent: true, noCrit: true });
      }
    },
  },

  /* ------------------------------------------------------------ control */

  slowed: {
    id: 'slowed', name: 'Chilled', icon: '❄', color: '#79cfe0', kind: 'debuff',
    stackable: true, maxStacks: 4, desc: 'Moves and attacks more slowly.',
    mods: { moveMult: 0.72, atkSpeedMult: 0.85 },
  },

  frozen: {
    id: 'frozen', name: 'Frozen', icon: '🧊', color: '#a8e6f0', kind: 'debuff',
    desc: 'Cannot act. Takes 40% more damage, and shatters when it breaks.',
    mods: { moveMult: 0, atkSpeedMult: 0, dmgTakenMult: 1.4, stunned: true },
  },

  stunned: {
    id: 'stunned', name: 'Stunned', icon: '💫', color: '#f3d98a', kind: 'debuff',
    desc: 'Cannot move, attack or use abilities.',
    mods: { moveMult: 0, atkSpeedMult: 0, stunned: true },
  },

  rooted: {
    id: 'rooted', name: 'Rooted', icon: '🌿', color: '#5fa25a', kind: 'debuff',
    desc: 'Cannot move, but can still fight.',
    mods: { moveMult: 0 },
  },

  knockedback: {
    id: 'knockedback', name: 'Staggered', icon: '💨', color: '#c8a98a', kind: 'debuff',
    desc: 'Being thrown. Cannot act until it lands.',
    mods: { atkSpeedMult: 0, stunned: true },
  },

  feared: {
    id: 'feared', name: 'Routed', icon: '😱', color: '#b07fd0', kind: 'debuff',
    desc: 'Flees from the enemy instead of fighting.',
    mods: { fleeing: true, dmgMult: 0 },
  },

  taunted: {
    id: 'taunted', name: 'Taunted', icon: '🎯', color: '#e08b7f', kind: 'debuff',
    desc: 'Forced to attack the taunter.',
  },

  silenced: {
    id: 'silenced', name: 'Silenced', icon: '🤐', color: '#9a6fe0', kind: 'debuff',
    desc: 'Abilities are sealed. Spellcasters are reduced to poking with a stick.',
    mods: { silenced: true },
  },

  /* ---------------------------------------------------------- vulnerability */

  marked: {
    id: 'marked', name: 'Marked', icon: '🔻', color: '#e8823a', kind: 'debuff',
    desc: 'Takes 25% more damage from ranged attacks.',
    mods: { rangedTakenMult: 1.25 },
  },

  oiled: {
    id: 'oiled', name: 'Oiled', icon: '🛢', color: '#8a6f3a', kind: 'debuff',
    desc: 'Drenched in oil — fire damage is nearly doubled and it slips when it turns.',
    mods: { fireTakenMult: 1.85, moveMult: 0.92 },
  },

  sundered: {
    id: 'sundered', name: 'Sundered', icon: '🪓', color: '#c8a98a', kind: 'debuff',
    stackable: true, maxStacks: 5, desc: 'Armour is broken open. −6 armour per stack.',
    mods: { armorAdd: -6 },
  },

  cursed: {
    id: 'cursed', name: 'Cursed', icon: '☠', color: '#7a4fa0', kind: 'debuff',
    desc: 'Deals 30% less damage and cannot be healed.',
    mods: { dmgMult: 0.7, healTakenMult: 0 },
  },

  /* ------------------------------------------------------------- buffs */

  shielded: {
    id: 'shielded', name: 'Warded', icon: '🛡', color: '#5aa6d8', kind: 'buff',
    desc: 'Absorbs incoming damage until the ward breaks.',
    // `st.hp` is the absorb pool; consumed in Battle.dealDamage before health.
  },

  braced: {
    id: 'braced', name: 'Braced', icon: '🧱', color: '#8d95a3', kind: 'buff',
    desc: 'Planted behind the shield: much tougher, but cannot advance.',
    mods: { dmgTakenMult: 0.45, moveMult: 0, armorAdd: 10 },
  },

  enraged: {
    id: 'enraged', name: 'Enraged', icon: '💢', color: '#c5362b', kind: 'buff',
    stackable: true, maxStacks: 5, desc: 'Attacks faster and hits harder with every wound taken.',
    mods: { dmgMult: 1.12, atkSpeedMult: 1.1 },
  },

  blessed: {
    id: 'blessed', name: 'Blessed', icon: '✨', color: '#f3d98a', kind: 'buff',
    desc: 'Holy light: +20% damage and +8 armour.',
    mods: { dmgMult: 1.2, armorAdd: 8 },
  },

  hastened: {
    id: 'hastened', name: 'Hastened', icon: '⚡', color: '#ffd479', kind: 'buff',
    desc: 'Moves and strikes noticeably faster.',
    mods: { moveMult: 1.35, atkSpeedMult: 1.3 },
  },

  rallied: {
    id: 'rallied', name: 'Rallied', icon: '🚩', color: '#d9a441', kind: 'buff',
    desc: 'Under the banner: +15% damage, immune to fear.',
    mods: { dmgMult: 1.15, fearImmune: true },
  },

  stealthed: {
    id: 'stealthed', name: 'Hidden', icon: '🌑', color: '#6a5a96', kind: 'buff',
    desc: 'Cannot be targeted. The next strike from stealth is a backstab.',
    mods: { untargetable: true, moveMult: 1.12 },
  },

  regenerating: {
    id: 'regenerating', name: 'Regenerating', icon: '🌱', color: '#5fa25a', kind: 'buff',
    desc: 'Closes its own wounds each second.',
    tick(b, u, st, dt) {
      st.acc = (st.acc || 0) + dt;
      if (st.acc >= 0.5) { st.acc -= 0.5; b.heal(u, st.hps * 0.5, st.src); }
    },
  },

  phased: {
    id: 'phased', name: 'Phased', icon: '🌀', color: '#9a6fe0', kind: 'buff',
    desc: 'Half in another world: takes 70% less damage but deals none.',
    mods: { dmgTakenMult: 0.3, dmgMult: 0, untargetable: false },
  },

  fortified: {
    id: 'fortified', name: 'Fortified', icon: '🏰', color: '#8d95a3', kind: 'buff',
    desc: 'Structure reinforced: +40% armour.',
    mods: { armorAdd: 14 },
  },

  empowered: {
    id: 'empowered', name: 'Empowered', icon: '🔮', color: '#9a6fe0', kind: 'buff',
    stackable: true, maxStacks: 3, desc: 'Spell power surges: +18% ability damage per stack.',
    mods: { abilityMult: 1.18 },
  },

  channeling: {
    id: 'channeling', name: 'Channelling', icon: '🕯', color: '#d9a441', kind: 'buff',
    desc: 'Locked into a spell. Cannot move; interrupted by stuns.',
    mods: { moveMult: 0 },
  },
};

/** Statuses whose presence should suppress all action. */
export const HARD_CC = ['frozen', 'stunned', 'knockedback'];

export const isDebuff = id => STATUS[id] && STATUS[id].kind === 'debuff';

/** Fold every active status into one modifier bundle. */
export function foldMods(statuses) {
  const m = {
    moveMult: 1, atkSpeedMult: 1, dmgMult: 1, dmgTakenMult: 1, abilityMult: 1,
    healTakenMult: 1, rangedTakenMult: 1, fireTakenMult: 1, rangeMult: 1,
    armorAdd: 0, stunned: false, silenced: false, untargetable: false,
    fleeing: false, fearImmune: false,
  };
  for (const st of statuses) {
    const def = STATUS[st.id];
    if (!def || !def.mods) continue;
    const stacks = def.stackable ? (st.stacks || 1) : 1;
    for (const k in def.mods) {
      const v = def.mods[k];
      if (typeof v === 'boolean') { m[k] = m[k] || v; }
      else if (k === 'armorAdd') { m[k] += v * stacks; }
      else { m[k] *= Math.pow(v, stacks); }
    }
  }
  return m;
}
