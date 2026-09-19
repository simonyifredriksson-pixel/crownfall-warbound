import { ic } from '../art/Icons.js';
/* Materials.js — every resource that is not gold.

   Tiers gate progression: a tier-3 material simply does not drop in the first
   two regions, so a recipe that needs it is visibly out of reach rather than
   silently impossible. Each material has exactly one primary source so the
   player always knows where to go for more.
*/

export const MATERIALS = {

  /* ------------------------------------------------------------ tier 1 */
  iron:      { id: 'iron',      name: 'Iron Ingot',      icon: ic('ingot'), tier: 1, kind: 'metal',  color: '#8d95a3',
               desc: 'Common smelted iron. Every blade in the army starts here.', source: 'Any battle · Greenmarch caves' },
  oak:       { id: 'oak',       name: 'Seasoned Oak',    icon: ic('log'), tier: 1, kind: 'wood',   color: '#8a6a3a',
               desc: 'Hafts, shields and siege frames.', source: 'Greenmarch · forest nodes' },
  leather:   { id: 'leather',   name: 'Boiled Leather',  icon: ic('hide'), tier: 1, kind: 'hide',   color: '#a07040',
               desc: 'Light armour and straps. Cheap and everywhere.', source: 'Beast battles' },
  cloth:     { id: 'cloth',     name: 'Spun Cloth',      icon: ic('cloth'), tier: 1, kind: 'cloth',  color: '#d8cbb0',
               desc: 'Robes, padding and bandages.', source: 'Marketplace · bandit battles' },
  herb:      { id: 'herb',      name: 'Bitterleaf',      icon: ic('leaf'), tier: 1, kind: 'herb',   color: '#5fa25a',
               desc: 'The base of almost every potion the Wizard brews.', source: 'Exploration nodes' },

  /* ------------------------------------------------------------ tier 2 */
  steel:     { id: 'steel',     name: 'Folded Steel',    icon: ic('gear'), tier: 2, kind: 'metal',  color: '#b0b8c4',
               desc: 'Iron, beaten thin and folded forty times. Holds an edge.', source: 'Blackbriar Fen · forged from iron' },
  silver:    { id: 'silver',    name: 'Silverbloom',     icon: ic('coin'), tier: 2, kind: 'metal',  color: '#d8e0e8',
               desc: 'Silver that grew rather than being mined. Bites the undead.', source: 'Hollowmere · elite battles' },
  arcaneDust:{ id: 'arcaneDust',name: 'Arcane Dust',     icon: ic('spark'), tier: 2, kind: 'arcane', color: '#9a6fe0',
               desc: 'What is left when a spell finishes being a spell.', source: 'Caster enemies · the Library' },
  boneMeal:  { id: 'boneMeal',  name: 'Grave Ash',       icon: ic('bone'), tier: 2, kind: 'dark',   color: '#c8c0a8',
               desc: 'Ground bone and grave dirt. The Wizard insists it is hygienic.', source: 'Undead battles' },
  emberglass:{ id: 'emberglass',name: 'Emberglass',      icon: ic('flame'), tier: 2, kind: 'fire',   color: '#e8823a',
               desc: 'Sand fused by dragonfire. Still warm, centuries later.', source: 'Ashen Waste' },
  frostLotus:{ id: 'frostLotus',name: 'Frost Lotus',     icon: ic('frost'), tier: 2, kind: 'frost',  color: '#79cfe0',
               desc: 'Grows only where something very cold died.', source: 'Stormspire · frost nodes' },

  /* ------------------------------------------------------------ tier 3 */
  dragonbone:{ id: 'dragonbone',name: 'Dragonbone',      icon: ic('dragon'), tier: 3, kind: 'exotic', color: '#c8a860',
               desc: 'Lighter than steel, harder than stone, and it hums.', source: 'Boss battles' },
  voidEmber: { id: 'voidEmber', name: 'Void Ember',      icon: ic('void'), tier: 3, kind: 'exotic', color: '#b07fd0',
               desc: 'A coal that burns cold and casts no light.', source: 'Stormspire · Dark Conclave' },
  starIron:  { id: 'starIron',  name: 'Star Iron',       icon: ic('star'), tier: 3, kind: 'metal',  color: '#ffd479',
               desc: 'Fell from the sky. The Wizard has strong opinions about where it came from.', source: 'Rare nodes · mythic chests' },
  runestone: { id: 'runestone', name: 'Runestone',       icon: ic('talisman'), tier: 3, kind: 'arcane', color: '#5aa6d8',
               desc: 'A fragment of something older, still carrying an instruction.', source: 'Ancient Guardian battles' },
  heartwood: { id: 'heartwood', name: 'Heartwood',       icon: ic('forest'), tier: 3, kind: 'wood',   color: '#5fa25a',
               desc: 'Cut from a tree that fought back.', source: 'Treant and beast bosses' },

  /* ------------------------------------------------------------ tier 4 */
  crownshard:{ id: 'crownshard',name: 'Crown Shard',     icon: ic('crown'), tier: 4, kind: 'legend', color: '#e0a02e',
               desc: 'A piece of the Iron Crown itself. There are not many.', source: 'Region bosses · first clears' },
  aether:    { id: 'aether',    name: 'Distilled Aether', icon: ic('vortex'), tier: 4, kind: 'legend', color: '#e0455f',
               desc: 'The raw stuff between worlds, in a bottle, which the Wizard says is "broadly safe".', source: 'Mythic research · final region' },
};

/* Universal upgrade currencies, kept separate from crafting materials so the
   UI can show them in the top bar. */
export const CURRENCIES = {
  gold:      { id: 'gold',      name: 'Gold',        icon: ic('coin'), color: '#d9a441', desc: 'Pays for upgrades, forging and the marketplace.' },
  warSeal:   { id: 'warSeal',   name: 'War Seal',    icon: ic('medal'), color: '#c5362b', desc: 'Earned from elite and boss victories. The Wizard trades for these and asks no questions.' },
  scroll:    { id: 'scroll',    name: 'Research Scroll', icon: ic('scroll'), color: '#5aa6d8', desc: 'Spent in the Library to unlock research.' },
};

export const MAT_LIST = Object.values(MATERIALS);
export const getMaterial = id => MATERIALS[id] || CURRENCIES[id];

/** Icon + colour for any resource id, including card shards. */
export function resourceIcon(id) {
  const m = getMaterial(id);
  if (m) return m.icon;
  if (id.startsWith('shard:')) return ic('crystal');
  return ic('unknown');
}
export function resourceName(id) {
  const m = getMaterial(id);
  if (m) return m.name;
  if (id.startsWith('shard:')) return id.slice(6) + ' shards';
  return id;
}

/** Which materials a region can drop. Keeps loot legible and directs travel. */
export const REGION_MATERIALS = {
  greenmarch:  ['iron', 'oak', 'leather', 'cloth', 'herb'],
  blackbriar:  ['iron', 'oak', 'leather', 'herb', 'steel', 'arcaneDust'],
  ashenwaste:  ['iron', 'steel', 'leather', 'emberglass', 'arcaneDust', 'dragonbone'],
  hollowmere:  ['steel', 'silver', 'boneMeal', 'cloth', 'arcaneDust', 'heartwood'],
  stormspire:  ['steel', 'silver', 'frostLotus', 'voidEmber', 'runestone', 'starIron', 'dragonbone'],
};

/** Drop weights by tier — higher tiers are rarer everywhere they appear. */
export const TIER_WEIGHT = { 1: 100, 2: 38, 3: 9, 4: 1.4 };
