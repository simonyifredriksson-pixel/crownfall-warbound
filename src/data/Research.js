/* Research.js — the Library's research tree.

   Research is the Wizard's half of progression: it does not make any single
   card stronger, it changes the rules. Each node either opens crafting the
   player could not otherwise do, or applies a permanent global effect.

   `effect` is read by Progression.globalBonuses(); nothing else interprets it.
*/

export const RESEARCH = {

  /* ================================================== BRANCH: METALLURGY */

  metallurgy: {
    id: 'metallurgy', name: 'Metallurgy', branch: 'forge', icon: '⚙', tier: 1,
    desc: 'Teaches the smith to fold steel properly. Unlocks steel refining and steel gear, and all forge crafting costs 10% less gold.',
    cost: { scroll: 2, iron: 10, gold: 250 },
    requires: [],
    effect: { forgeDiscount: 0.1 },
    unlocksRecipes: ['refineSteel'],
    wizardLine: 'Steel is just iron that has been shouted at correctly. I can show him how.',
  },

  boneCuring: {
    id: 'boneCuring', name: 'Bone Curing', branch: 'forge', icon: '🐉', tier: 3,
    desc: 'Dragonbone can be cured into armour and blades. Unlocks the entire dragonbone line.',
    cost: { scroll: 6, dragonbone: 2, emberglass: 6, gold: 1600 },
    requires: ['metallurgy'],
    effect: {},
    unlocksRecipes: ['refineDragonbone', 'craftWyrmlance', 'craftDragonboneCleaver', 'craftDragonPlate', 'craftDragonHelm', 'craftDragonGauntlets', 'craftDragonGreaves'],
    wizardLine: 'Dragonbone is not bone, incidentally. Nobody has ever been able to tell me what it is.',
  },

  starforging: {
    id: 'starforging', name: 'Starforging', branch: 'forge', icon: '⭐', tier: 4,
    desc: 'Star iron can be worked, if you are patient and slightly reckless. Your equipment upgrade costs drop 15%.',
    cost: { scroll: 10, starIron: 3, runestone: 4, gold: 3400 },
    requires: ['boneCuring'],
    effect: { itemUpgradeDiscount: 0.15 },
    unlocksRecipes: ['craftMountainbreaker'],
    wizardLine: 'It came from somewhere. I have three theories and I dislike all of them.',
  },

  crownwork: {
    id: 'crownwork', name: 'Crownwork', branch: 'forge', icon: '👑', tier: 5,
    desc: 'The lost art of the Crown smiths. Unlocks legendary equipment and lets you reforge Crown Shards.',
    cost: { scroll: 20, crownshard: 2, aether: 2, starIron: 6, gold: 9000 },
    requires: ['starforging', 'voidwork'],
    effect: {},
    unlocksRecipes: ['craftKingsEdge', 'craftCrownHelm', 'craftCrownAegis', 'forgeCrownShard'],
    wizardLine: 'I have wanted to read this book for four hundred years. Do not touch anything.',
  },

  /* =================================================== BRANCH: ALCHEMY */

  alchemy1: {
    id: 'alchemy1', name: 'Practical Alchemy', branch: 'alchemy', icon: '🧪', tier: 1,
    desc: 'Opens the brewing station. Potions become craftable and you may carry two potion types into battle.',
    cost: { scroll: 1, herb: 6, gold: 120 },
    requires: [],
    effect: { potionSlots: 2 },
    unlocksRecipes: ['brewHealth'],
    wizardLine: 'Anyone can boil a leaf. Doing it without poisoning the commander is the discipline.',
  },

  alchemy2: {
    id: 'alchemy2', name: 'Refined Reagents', branch: 'alchemy', icon: '⚗', tier: 2,
    desc: 'Better extraction. Unlocks Insight and Antidote draughts, and every potion you brew yields one extra.',
    cost: { scroll: 4, herb: 12, arcaneDust: 4, gold: 520 },
    requires: ['alchemy1'],
    effect: { potionYield: 1 },
    unlocksRecipes: ['brewMagic', 'brewAntidote'],
    wizardLine: 'Yes, more potions. No, you may not drink them in the Library.',
  },

  alchemy3: {
    id: 'alchemy3', name: 'Grand Distillation', branch: 'alchemy', icon: '🍶', tier: 4,
    desc: 'The dangerous end of the craft. Unlocks Banner Elixirs and the Phoenix Tonic, and a third potion slot.',
    cost: { scroll: 12, aether: 1, emberglass: 8, herb: 20, gold: 2400 },
    requires: ['alchemy2', 'transmutation'],
    effect: { potionSlots: 3 },
    unlocksRecipes: ['brewCommand', 'brewPhoenix'],
    wizardLine: 'I will need the room to myself and you will need to not ask questions afterwards.',
  },

  transmutation: {
    id: 'transmutation', name: 'Transmutation', branch: 'alchemy', icon: '✨', tier: 3,
    desc: 'Turn one thing into another, badly and expensively. Unlocks material transmutation and shard echoes.',
    cost: { scroll: 6, arcaneDust: 10, runestone: 1, gold: 900 },
    requires: ['alchemy1'],
    effect: {},
    unlocksRecipes: ['transmuteDust', 'transmuteShards'],
    wizardLine: 'Everything is the same thing wearing a different hat. This is a metaphor until it very much is not.',
  },

  voidwork: {
    id: 'voidwork', name: 'Voidwork', branch: 'alchemy', icon: '🌀', tier: 4,
    desc: 'The study of the gaps between things. Unlocks aether distillation and the void-touched weapons.',
    cost: { scroll: 14, voidEmber: 5, runestone: 4, gold: 3000 },
    requires: ['transmutation'],
    effect: {},
    unlocksRecipes: ['transmuteAether', 'craftNightfang', 'craftStormdraw'],
    wizardLine: 'I would prefer you did not. I will show you anyway. That is the arrangement we have.',
  },

  /* =================================================== BRANCH: WARFARE */

  drillmaster: {
    id: 'drillmaster', name: 'Drillmaster', branch: 'war', icon: '🎖', tier: 1,
    desc: 'Study of formations. Every unit you deploy gains +5% health.',
    cost: { scroll: 2, leather: 8, gold: 200 },
    requires: [],
    effect: { unitHpMult: 1.05 },
    wizardLine: 'The Library has nine hundred books on tactics. Eight hundred of them are wrong, which is itself informative.',
  },

  quartermaster: {
    id: 'quartermaster', name: 'Quartermaster', branch: 'war', icon: '📯', tier: 2,
    desc: 'Command regenerates 8% faster in every battle.',
    cost: { scroll: 5, iron: 12, cloth: 8, gold: 600 },
    requires: ['drillmaster'],
    effect: { commandRegenMult: 1.08 },
    wizardLine: 'Wars are won by the man who counts the arrows. Nobody writes songs about him either.',
  },

  fieldSurgery: {
    id: 'fieldSurgery', name: 'Field Surgery', branch: 'war', icon: '💚', tier: 2,
    desc: 'All healing in battle, from any source, is 20% stronger.',
    cost: { scroll: 5, herb: 10, cloth: 8, gold: 560 },
    requires: ['drillmaster'],
    effect: { healMult: 1.2 },
    wizardLine: 'Battle priests are wonderful people who have never once read a book about anatomy.',
  },

  siegecraft: {
    id: 'siegecraft', name: 'Siegecraft', branch: 'war', icon: '🪨', tier: 3,
    desc: 'Siege units gain +25% structure damage and +2m range. Enemy towers take 20% more damage from everything.',
    cost: { scroll: 8, oak: 16, steel: 8, gold: 1200 },
    requires: ['quartermaster'],
    effect: { siegeStructureMult: 1.25, structureDamageMult: 1.2 },
    wizardLine: 'Walls are an argument. Trebuchets are a rebuttal.',
  },

  veterancy: {
    id: 'veterancy', name: 'Veterancy', branch: 'war', icon: '🏅', tier: 3,
    desc: 'Raises the card level cap from 15 to 20 and grants +10% experience from every battle.',
    cost: { scroll: 10, silver: 4, dragonbone: 2, gold: 2000 },
    requires: ['fieldSurgery', 'quartermaster'],
    effect: { cardLevelCap: 20, xpMult: 1.1 },
    wizardLine: 'Soldiers who survive long enough stop being soldiers and start being a resource.',
  },

  awakening: {
    id: 'awakening', name: 'The Awakening Rite', branch: 'war', icon: '🌟', tier: 4,
    desc: 'Lets you Awaken any card at maximum level, unlocking its final, build-defining ability.',
    cost: { scroll: 16, crownshard: 1, aether: 1, runestone: 6, gold: 4200 },
    requires: ['veterancy', 'transmutation'],
    effect: { awakeningUnlocked: true },
    wizardLine: 'Every card you hold is a person, or was, or will insist it was. Waking them up properly is the least we can do.',
  },

  /* ================================================== BRANCH: KNOWLEDGE */

  cartography: {
    id: 'cartography', name: 'Cartography', branch: 'lore', icon: '🗺', tier: 1,
    desc: 'Reveals enemy army composition on the war map before you commit to a battle.',
    cost: { scroll: 2, cloth: 6, gold: 180 },
    requires: [],
    effect: { revealEnemies: true },
    wizardLine: 'Knowing what is over the hill is worth more than a regiment. Cheaper, too.',
  },

  bestiary: {
    id: 'bestiary', name: 'Bestiary', branch: 'lore', icon: '📖', tier: 2,
    desc: 'The Codex records every enemy you have fought, with their counters. Also: +15% gold from every battle.',
    cost: { scroll: 4, boneMeal: 6, cloth: 6, gold: 500 },
    requires: ['cartography'],
    effect: { goldMult: 1.15, codexFull: true },
    wizardLine: 'I have been writing this for six hundred years. You may read it. Gently.',
  },

  prospecting: {
    id: 'prospecting', name: 'Prospecting', branch: 'lore', icon: '⛏', tier: 2,
    desc: 'You find 30% more crafting materials, and exploration nodes yield an extra roll.',
    cost: { scroll: 4, iron: 10, oak: 10, gold: 480 },
    requires: ['cartography'],
    effect: { materialMult: 1.3, extraExploreRoll: 1 },
    wizardLine: 'Most people walk past the useful half of a battlefield.',
  },

  scholarship: {
    id: 'scholarship', name: 'Scholarship', branch: 'lore', icon: '🎓', tier: 3,
    desc: 'You earn one extra Research Scroll from every battle, and card shards drop 25% more often.',
    cost: { scroll: 8, arcaneDust: 8, silver: 3, gold: 1400 },
    requires: ['bestiary', 'prospecting'],
    effect: { scrollBonus: 1, shardMult: 1.25 },
    wizardLine: 'Research funds research. This is either elegant or a scam; I have stopped asking.',
  },

  farsight: {
    id: 'farsight', name: 'Farsight', branch: 'lore', icon: '👁', tier: 4,
    desc: 'You see the enemy commander\'s next deployment two seconds before it lands. Enormous, and nearly impossible to explain to anyone.',
    cost: { scroll: 14, runestone: 5, voidEmber: 3, gold: 3200 },
    requires: ['scholarship'],
    effect: { enemyIntent: true },
    wizardLine: 'You will not see the future. You will see two seconds of it, which is the useful part.',
  },
};

export const RESEARCH_LIST = Object.values(RESEARCH);
export const BRANCHES = {
  forge:   { id: 'forge',   name: 'Metallurgy', icon: '⚙', color: '#8d95a3' },
  alchemy: { id: 'alchemy', name: 'Alchemy',    icon: '🧪', color: '#8fbf4a' },
  war:     { id: 'war',     name: 'Warfare',    icon: '🎖', color: '#c5362b' },
  lore:    { id: 'lore',    name: 'Lore',       icon: '📖', color: '#5aa6d8' },
};

export const getResearch = id => RESEARCH[id];

export function researchAvailable(node, doneList) {
  return (node.requires || []).every(r => doneList.includes(r));
}

/** Fold every completed node into one bonus bundle. */
export function foldResearch(doneList) {
  const b = {
    forgeDiscount: 0, itemUpgradeDiscount: 0, potionSlots: 1, potionYield: 0,
    unitHpMult: 1, commandRegenMult: 1, healMult: 1, siegeStructureMult: 1,
    structureDamageMult: 1, cardLevelCap: 15, xpMult: 1, goldMult: 1,
    materialMult: 1, shardMult: 1, scrollBonus: 0, extraExploreRoll: 0,
    revealEnemies: false, codexFull: false, awakeningUnlocked: false, enemyIntent: false,
  };
  for (const id of doneList) {
    const n = RESEARCH[id];
    if (!n || !n.effect) continue;
    for (const k in n.effect) {
      const v = n.effect[k];
      if (typeof v === 'boolean') b[k] = b[k] || v;
      else if (k.endsWith('Mult')) b[k] *= v;
      else if (k === 'cardLevelCap' || k === 'potionSlots') b[k] = Math.max(b[k], v);
      else b[k] += v;
    }
  }
  return b;
}
