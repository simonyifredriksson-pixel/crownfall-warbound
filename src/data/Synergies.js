/* Synergies.js — why army composition matters.

   Three kinds, all in one table so the UI can explain them in one place:

     DECK   evaluated once, from the eight cards you bring. Shown in the army
            screen so you can build for it deliberately.
     FIELD  evaluated four times a second from actual unit positions. This is
            the one that rewards *play* rather than deckbuilding — a Knight
            standing in front of your Mage is a different thing from a Knight
            and a Mage both being in the deck.
     COMBO  status interactions (oil + fire, chill + heavy hitter). These are
            implemented by the status mods themselves; the entries here exist
            so the player can find out they are real.

   A synergy never simply adds damage. Each one should change what you would
   do on the field.
*/

export const SYNERGIES = {

  /* ======================================================== DECK SYNERGIES */

  shieldWall: {
    id: 'shieldWall', name: 'Shield Wall', kind: 'deck', icon: '🛡',
    desc: 'Three or more shield-wall units: every one of them gains +6 armour and +12% health.',
    detail: 'A wall is a wall because it is continuous. Two spearmen are a gap.',
    check: (deck) => deck.filter(c => c.tags?.includes('shieldwall')).length >= 3,
    apply: (u) => { if (u.tags?.includes('shieldwall')) { u.bonusArmor += 6; u.bonusHpMult *= 1.12; } },
  },

  arcaneConduit: {
    id: 'arcaneConduit', name: 'Arcane Conduit', kind: 'deck', icon: '🔮',
    desc: 'Three or more casters: all ability cooldowns are 22% shorter.',
    detail: 'Mages resonate. It is mostly showing off, but it works.',
    check: (deck) => deck.filter(c => c.role === 'caster').length >= 3,
    apply: (u) => { if (u.role === 'caster') u.cdMult *= 0.78; },
  },

  hordeDoctrine: {
    id: 'hordeDoctrine', name: 'Horde Doctrine', kind: 'deck', icon: '🐜',
    desc: 'Four or more cards costing 3 or less: every one of them deploys with +1 body and +10% move speed.',
    detail: 'Cheap and many beats expensive and few — if you can actually reach them.',
    check: (deck) => deck.filter(c => c.cost <= 3).length >= 4,
    apply: (u) => { if (u.cost <= 3 && u.cost > 0) { u.bonusCount += 1; u.bonusMoveMult *= 1.1; } },
  },

  siegeTrain: {
    id: 'siegeTrain', name: 'Siege Train', kind: 'deck', icon: '🪨',
    desc: 'Two or more siege units: all of them gain +30% structure damage and +2m range.',
    detail: 'One engine is a target. Two engines are a plan.',
    check: (deck) => deck.filter(c => c.role === 'siege').length >= 2,
    apply: (u) => { if (u.role === 'siege') { u.structureMult *= 1.3; u.bonusRange += 2; } },
  },

  necroticTide: {
    id: 'necroticTide', name: 'Necrotic Tide', kind: 'deck', icon: '⚰',
    desc: 'Two or more summoners or undead lords: your slain units leave corpses that last twice as long.',
    detail: 'You do not lose soldiers. You bank them.',
    check: (deck) => deck.filter(c => c.tags?.includes('undeadlord') || c.role === 'summoner').length >= 2,
    apply: () => {},
    global: (b) => { b.corpseLingerMult = 2; },
  },

  holyOrder: {
    id: 'holyOrder', name: 'Holy Order', kind: 'deck', icon: '✨',
    desc: 'Three or more holy units: all of them gain +18% damage and your healing is 25% stronger.',
    detail: 'In Hollowmere this is not a bonus, it is the entire strategy.',
    check: (deck) => deck.filter(c => c.tags?.includes('holy')).length >= 3,
    apply: (u) => { if (u.tags?.includes('holy')) { u.bonusDmgMult *= 1.18; u.healMult *= 1.25; } },
  },

  fireAndOil: {
    id: 'fireAndOil', name: 'Pitch and Flame', kind: 'deck', icon: '🔥',
    desc: 'At least one oil unit and one fire unit: oil lasts 50% longer and fire units gain +15% damage.',
    detail: 'The single most efficient two-card interaction in the game, and it costs seven Command total.',
    check: (deck) => deck.some(c => c.tags?.includes('oil')) && deck.some(c => c.tags?.includes('fire')),
    apply: (u) => { if (u.tags?.includes('fire')) u.bonusDmgMult *= 1.15; },
    global: (b) => { b.oilDurationMult = 1.5; },
  },

  skyDominance: {
    id: 'skyDominance', name: 'Sky Dominance', kind: 'deck', icon: '🪽',
    desc: 'Two or more flyers: all flyers gain +15% move speed and take 20% less damage from ranged attacks.',
    detail: 'Two flyers split the enemy archers. One flyer just dies to them.',
    check: (deck) => deck.filter(c => c.role === 'flyer').length >= 2,
    apply: (u) => { if (u.role === 'flyer') { u.bonusMoveMult *= 1.15; u.rangedTakenMult *= 0.8; } },
  },

  shadowPact: {
    id: 'shadowPact', name: 'Shadow Pact', kind: 'deck', icon: '🌑',
    desc: 'Two or more assassins: stealth lasts 2s longer and backstabs deal an extra 25%.',
    detail: 'Two knives arriving at the same backline from two directions is not twice as good. It is much worse than that.',
    check: (deck) => deck.filter(c => c.role === 'assassin').length >= 2,
    apply: (u) => { if (u.role === 'assassin') { u.stealthBonus = 2; u.backstabBonus = 0.25; } },
  },

  balancedArms: {
    id: 'balancedArms', name: 'Combined Arms', kind: 'deck', icon: '⚖',
    desc: 'Four or more different damage types in the deck: every unit gains +8% damage. No enemy can armour against all of you.',
    detail: 'The answer to rotating wards, magical golems and every "immune to X" enemy in the game.',
    check: (deck) => new Set(deck.map(c => c.dmgType)).size >= 4,
    apply: (u) => { u.bonusDmgMult *= 1.08; },
  },

  fieldCommand: {
    id: 'fieldCommand', name: 'Field Command', kind: 'deck', icon: '🚩',
    desc: 'A banner unit plus a support unit: Command regenerates 12% faster all battle.',
    detail: 'Boring. Wins battles.',
    check: (deck) => deck.some(c => c.tags?.includes('banner')) && deck.some(c => c.role === 'support'),
    apply: () => {},
    global: (b) => { b.commandRegenMult *= 1.12; },
  },

  /* ======================================================= FIELD SYNERGIES */

  bulwarkGuard: {
    id: 'bulwarkGuard', name: 'Bulwark', kind: 'field', icon: '🛡',
    desc: 'A support unit within 8m of a guardian: the guardian takes 18% less damage.',
    detail: 'Position, not deckbuilding. Walk your priest up behind the wall and the wall stops dying.',
    field(b, u, allies) {
      if (u.role !== 'guardian') return false;
      if (!allies.some(a => a.role === 'support')) return false;
      u.auraDmgTaken *= 0.82;
      return true;
    },
    radius: 8,
  },

  coveringFire: {
    id: 'coveringFire', name: 'Covering Fire', kind: 'field', icon: '🏹',
    desc: 'A ranged unit standing behind a guardian (within 7m): +22% damage.',
    detail: 'Archers shoot better when nothing is chewing on them. This is the Knight + Mage formation, formalised.',
    field(b, u, allies) {
      if (u.role !== 'ranged' && u.role !== 'caster') return false;
      const guard = allies.find(a => a.role === 'guardian' && (a.z - u.z) * (u.team === 0 ? 1 : -1) > 0.5);
      if (!guard) return false;
      u.auraDmgMult *= 1.22;
      return true;
    },
    radius: 7,
  },

  focusedVolley: {
    id: 'focusedVolley', name: 'Focused Volley', kind: 'field', icon: '🎯',
    desc: 'Ranged units deal +30% damage to targets that are rooted, frozen or chilled.',
    detail: 'A Warden and four archers is a kill box.',
    field: null,   // implemented in the damage pipeline; listed here for the codex
    passive: true,
  },

  siegebreaker: {
    id: 'siegebreaker', name: 'Siegebreaker', kind: 'field', icon: '🏚',
    desc: 'A siege unit within 10m of a large melee unit (mass 4+): both gain +35% structure damage.',
    detail: 'The Giant opens the gate. The catapult walks through it.',
    field(b, u, allies) {
      if (u.role === 'siege') {
        if (!allies.some(a => a.mass >= 4)) return false;
        u.auraStructureMult *= 1.35; return true;
      }
      if (u.mass >= 4 && u.role !== 'siege') {
        if (!allies.some(a => a.role === 'siege')) return false;
        u.auraStructureMult *= 1.35; return true;
      }
      return false;
    },
    radius: 10,
  },

  packBond: {
    id: 'packBond', name: 'Pack Bond', kind: 'field', icon: '🐺',
    desc: 'Three or more beasts within 6m of each other: all of them gain +20% attack speed.',
    detail: 'Beasts are a mass-action card. Trickling them in one at a time wastes them.',
    field(b, u, allies) {
      if (!u.tags?.includes('beast')) return false;
      const n = allies.filter(a => a.tags?.includes('beast')).length;
      if (n < 2) return false;
      u.auraAtkSpeed *= 1.2;
      return true;
    },
    radius: 6,
  },

  wardedAdvance: {
    id: 'wardedAdvance', name: 'Warded Advance', kind: 'field', icon: '🚯',
    desc: 'An antimagic unit within 7m of a heavy unit: the heavy unit takes 30% less arcane and shadow damage.',
    detail: 'The counter to enemy caster stacks, if you actually walk them together.',
    field(b, u, allies) {
      if (u.armorType !== 'heavy') return false;
      if (!allies.some(a => a.tags?.includes('anticaster'))) return false;
      u.auraMagicResist *= 0.7;
      return true;
    },
    radius: 7,
  },

  rallyPoint: {
    id: 'rallyPoint', name: 'Rally Point', kind: 'field', icon: '👑',
    desc: 'Units within your commander\'s aura gain +6% damage. Standing with your troops matters.',
    detail: 'Your commander is not a spectator. Lead from the front and the whole line hits harder.',
    field: null,
    passive: true,
  },

  /* ============================================================== COMBOS */

  oilBurn: {
    id: 'oilBurn', name: 'Oil + Fire', kind: 'combo', icon: '🔥',
    desc: 'Oiled targets take 85% more fire damage.',
    detail: 'Oil Flinger → Firebomber is the cheapest hard-counter to a heavy push in the game.',
  },

  chillShatter: {
    id: 'chillShatter', name: 'Chill → Shatter', kind: 'combo', icon: '🧊',
    desc: 'Four stacks of Chilled freeze a target, and frozen targets take 40% more damage from everything.',
    detail: 'Frost Mage sets it up; anything with a big single hit cashes it in.',
  },

  sunderCrush: {
    id: 'sunderCrush', name: 'Sunder → Crush', kind: 'combo', icon: '🪓',
    desc: 'Sundered strips 6 armour per stack. Blunt damage already does 50% extra to heavy armour; together they delete plate.',
    detail: 'Elemental Mastery\'s arcane cycle applies Sunder. Follow it with a Giant.',
  },

  markedVolley: {
    id: 'markedVolley', name: 'Mark → Volley', kind: 'combo', icon: '🔻',
    desc: 'Marked targets take 25% more ranged damage. Ranger marks; everything else shoots.',
    detail: 'One Ranger meaningfully upgrades every archer you own.',
  },

  rootExecute: {
    id: 'rootExecute', name: 'Root → Execute', kind: 'combo', icon: '🌿',
    desc: 'Rooted enemies cannot retreat, and Execute doubles damage below 30% health.',
    detail: 'Warden plus Berserker means nothing wounded ever gets away.',
  },

  corpseFuel: {
    id: 'corpseFuel', name: 'Corpses are Ammunition', kind: 'combo', icon: '💀',
    desc: 'Necromancers raise the dead of both armies. Fire damage burns corpses away before they can be used.',
    detail: 'Against Morvant, a single fire unit is worth more than a good frontline.',
  },
};

export const DECK_SYNERGIES = Object.values(SYNERGIES).filter(s => s.kind === 'deck');
export const FIELD_SYNERGIES = Object.values(SYNERGIES).filter(s => s.kind === 'field' && s.field);
export const COMBO_SYNERGIES = Object.values(SYNERGIES).filter(s => s.kind === 'combo');

/**
 * Which deck synergies a given set of cards activates.
 * @param {Array} cards — unit definitions (not instances)
 */
export function activeDeckSynergies(cards) {
  return DECK_SYNERGIES.filter(s => {
    try { return s.check(cards); } catch (e) { return false; }
  });
}

/** Apply every active deck synergy to a spawn-time stat bundle. */
export function applyDeckSynergies(synergies, unitStats) {
  for (const s of synergies) { if (s.apply) s.apply(unitStats); }
  return unitStats;
}
