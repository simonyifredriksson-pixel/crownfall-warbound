import { ic } from '../art/Icons.js';
/* Recipes.js — crafting.

   Two stations, two flavours:
     FORGE    (the blacksmith) — weapons, armour, refining raw metal
     ALCHEMY  (the Library)    — potions, reagents, transmutation

   Recipes start hidden and are *discovered*: by clearing a region, by
   completing research, or by finding a schematic as loot. The player therefore
   sees their crafting options grow rather than facing a wall of grey rows on
   day one.
*/

export const RECIPES = {

  /* ======================================================= FORGE — refining */

  refineSteel: {
    id: 'refineSteel', station: 'forge', kind: 'material', out: { steel: 1 },
    name: 'Fold Steel', icon: ic('gear'),
    cost: { iron: 4, gold: 30 },
    unlock: { region: 'blackbriar' },
    desc: 'Four ingots, a hot fire and an afternoon of hammering.',
  },
  refineSilver: {
    id: 'refineSilver', station: 'forge', kind: 'material', out: { silver: 1 },
    name: 'Draw Silverbloom', icon: ic('coin'),
    cost: { steel: 2, arcaneDust: 2, gold: 90 },
    unlock: { region: 'hollowmere' },
    desc: 'Steel and arcane dust, quenched in moonlight. The Wizard says the moonlight is not optional; the smith disagrees loudly.',
  },
  refineDragonbone: {
    id: 'refineDragonbone', station: 'forge', kind: 'material', out: { dragonbone: 1 },
    name: 'Cure Dragonbone', icon: ic('dragon'),
    cost: { emberglass: 3, steel: 3, gold: 260 },
    unlock: { research: 'boneCuring' },
    desc: 'Emberglass keeps the bone warm while it sets. Cool it too fast and you have very expensive gravel.',
  },

  /* ==================================================== FORGE — weapons */

  craftSteelLongsword: {
    id: 'craftSteelLongsword', station: 'forge', kind: 'item', out: 'steelLongsword',
    name: 'Steel Longsword', icon: ic('dagger'),
    cost: { steel: 6, leather: 3, gold: 320 },
    unlock: { region: 'blackbriar' },
  },
  craftIronGreatsword: {
    id: 'craftIronGreatsword', station: 'forge', kind: 'item', out: 'ironGreatsword',
    name: 'Iron Greatsword', icon: ic('swords'),
    cost: { iron: 8, oak: 3, gold: 180 },
    unlock: {},
  },
  craftHuntingSpear: {
    id: 'craftHuntingSpear', station: 'forge', kind: 'item', out: 'huntingSpear',
    name: 'Hunting Spear', icon: ic('trident'),
    cost: { iron: 3, oak: 4, gold: 120 },
    unlock: {},
  },
  craftIronMaul: {
    id: 'craftIronMaul', station: 'forge', kind: 'item', out: 'ironMaul',
    name: 'Iron Maul', icon: ic('hammer'),
    cost: { iron: 7, oak: 3, gold: 200 },
    unlock: {},
  },
  craftShortbow: {
    id: 'craftShortbow', station: 'forge', kind: 'item', out: 'shortbow',
    name: 'Shortbow', icon: ic('bow'),
    cost: { oak: 6, leather: 4, gold: 140 },
    unlock: {},
  },
  craftWoodaxe: {
    id: 'craftWoodaxe', station: 'forge', kind: 'item', out: 'woodaxe',
    name: "Woodsman's Axe", icon: ic('axe'),
    cost: { iron: 4, oak: 3, gold: 110 },
    unlock: {},
  },
  craftCutpurseKnives: {
    id: 'craftCutpurseKnives', station: 'forge', kind: 'item', out: 'cutpurseKnives',
    name: 'Cutpurse Knives', icon: ic('dagger'),
    cost: { iron: 4, leather: 5, gold: 260 },
    unlock: { region: 'blackbriar' },
    desc: 'Taken off Mara\'s people and copied, badly, by an honest smith.',
  },
  craftReaverAxe: {
    id: 'craftReaverAxe', station: 'forge', kind: 'item', out: 'reaverAxe',
    name: 'Reaver Axe', icon: ic('axe'),
    cost: { steel: 8, leather: 4, emberglass: 2, gold: 620 },
    unlock: { region: 'ashenwaste' },
  },
  craftSilverbrand: {
    id: 'craftSilverbrand', station: 'forge', kind: 'item', out: 'silverbrand',
    name: 'Silverbrand', icon: ic('swords'),
    cost: { silver: 6, steel: 6, arcaneDust: 4, gold: 900 },
    unlock: { region: 'hollowmere' },
    desc: 'Holy damage. In Hollowmere this is not a nice-to-have.',
  },
  craftWyrmlance: {
    id: 'craftWyrmlance', station: 'forge', kind: 'item', out: 'wyrmlance',
    name: 'Wyrmlance', icon: ic('trident'),
    cost: { dragonbone: 4, steel: 8, emberglass: 4, gold: 1400 },
    unlock: { research: 'boneCuring' },
  },
  craftDragonboneCleaver: {
    id: 'craftDragonboneCleaver', station: 'forge', kind: 'item', out: 'dragonboneCleaver',
    name: 'Dragonbone Cleaver', icon: ic('dragon'),
    cost: { dragonbone: 7, steel: 10, leather: 6, gold: 2100 },
    unlock: { research: 'boneCuring' },
  },
  craftMountainbreaker: {
    id: 'craftMountainbreaker', station: 'forge', kind: 'item', out: 'mountainbreaker',
    name: 'Mountainbreaker', icon: ic('mountain'),
    cost: { starIron: 3, dragonbone: 5, runestone: 3, gold: 2800 },
    unlock: { research: 'starforging' },
  },
  craftNightfang: {
    id: 'craftNightfang', station: 'forge', kind: 'item', out: 'nightfang',
    name: 'Nightfang', icon: ic('void'),
    cost: { voidEmber: 4, silver: 6, leather: 8, gold: 2400 },
    unlock: { research: 'voidwork' },
  },
  craftStormdraw: {
    id: 'craftStormdraw', station: 'forge', kind: 'item', out: 'stormdraw',
    name: 'Stormdraw', icon: ic('stamina'),
    cost: { heartwood: 5, runestone: 4, silver: 4, gold: 2400 },
    unlock: { research: 'voidwork' },
  },
  craftApprenticeStaff: {
    id: 'craftApprenticeStaff', station: 'forge', kind: 'item', out: 'apprenticeStaff',
    name: 'Apprentice Staff', icon: ic('arcane'),
    cost: { oak: 5, arcaneDust: 2, gold: 150 },
    unlock: { research: 'alchemy1' },
    desc: 'The Wizard supplies the focusing gem and complains about it.',
  },
  craftEmberstaff: {
    id: 'craftEmberstaff', station: 'forge', kind: 'item', out: 'emberstaff',
    name: 'Emberstaff', icon: ic('flame'),
    cost: { emberglass: 5, oak: 6, arcaneDust: 5, gold: 780 },
    unlock: { region: 'ashenwaste' },
  },
  craftAethervoidStaff: {
    id: 'craftAethervoidStaff', station: 'forge', kind: 'item', out: 'aethervoidStaff',
    name: 'Staff of the Aethervoid', icon: ic('vortex'),
    cost: { crownshard: 3, voidEmber: 8, runestone: 6, aether: 1, gold: 8400 },
    unlock: { research: 'crownwork' },
  },
  craftKingsEdge: {
    id: 'craftKingsEdge', station: 'forge', kind: 'item', out: 'kingsEdge',
    name: "The King's Edge", icon: ic('crown'),
    cost: { crownshard: 4, starIron: 6, dragonbone: 8, runestone: 4, gold: 9000 },
    unlock: { research: 'crownwork' },
    desc: 'The smith goes quiet when you bring him the shards. He has been waiting his whole career to be asked.',
  },

  /* ==================================================== FORGE — armour */

  craftIronPlateSet: {
    id: 'craftIronPlateSet', station: 'forge', kind: 'item', out: 'ironPlate',
    name: 'Iron Cuirass', icon: ic('chest'), cost: { iron: 6, leather: 3, gold: 160 }, unlock: {},
  },
  craftIronHelm: {
    id: 'craftIronHelm', station: 'forge', kind: 'item', out: 'ironHelm',
    name: 'Iron Helm', icon: ic('helm'), cost: { iron: 4, leather: 2, gold: 100 }, unlock: {},
  },
  craftLeatherJerkin: {
    id: 'craftLeatherJerkin', station: 'forge', kind: 'item', out: 'leatherJerkin',
    name: 'Leather Jerkin', icon: ic('chest'), cost: { leather: 6, cloth: 3, gold: 110 }, unlock: {},
  },
  craftIronGauntlets: {
    id: 'craftIronGauntlets', station: 'forge', kind: 'item', out: 'ironGauntlets',
    name: 'Iron Gauntlets', icon: ic('gloves'), cost: { iron: 3, leather: 2, gold: 90 }, unlock: {},
  },
  craftIronSabatons: {
    id: 'craftIronSabatons', station: 'forge', kind: 'item', out: 'ironSabatons',
    name: 'Iron Sabatons', icon: ic('boots'), cost: { iron: 3, leather: 2, gold: 90 }, unlock: {},
  },
  craftLeatherHood: {
    id: 'craftLeatherHood', station: 'forge', kind: 'item', out: 'leatherHood',
    name: 'Leather Hood', icon: ic('helm'), cost: { leather: 4, cloth: 2, gold: 80 }, unlock: {},
  },
  craftKnightPlate: {
    id: 'craftKnightPlate', station: 'forge', kind: 'item', out: 'knightPlate',
    name: "Knight's Plate", icon: ic('chest'), cost: { steel: 10, leather: 5, gold: 700 }, unlock: { region: 'blackbriar' },
  },
  craftKnightHelm: {
    id: 'craftKnightHelm', station: 'forge', kind: 'item', out: 'knightHelm',
    name: "Knight's Great Helm", icon: ic('helm'), cost: { steel: 6, cloth: 3, gold: 420 }, unlock: { region: 'blackbriar' },
  },
  craftKnightGauntlets: {
    id: 'craftKnightGauntlets', station: 'forge', kind: 'item', out: 'knightGauntlets',
    name: "Knight's Gauntlets", icon: ic('gloves'), cost: { steel: 5, leather: 3, gold: 340 }, unlock: { region: 'blackbriar' },
  },
  craftKnightSabatons: {
    id: 'craftKnightSabatons', station: 'forge', kind: 'item', out: 'knightSabatons',
    name: "Knight's Sabatons", icon: ic('boots'), cost: { steel: 5, leather: 3, gold: 340 }, unlock: { region: 'blackbriar' },
  },
  craftRangerCoat: {
    id: 'craftRangerCoat', station: 'forge', kind: 'item', out: 'rangerCoat',
    name: "Ranger's Coat", icon: ic('chest'), cost: { leather: 12, cloth: 6, steel: 3, gold: 640 }, unlock: { region: 'ashenwaste' },
  },
  craftRangerHood: {
    id: 'craftRangerHood', station: 'forge', kind: 'item', out: 'rangerHood',
    name: "Ranger's Hood", icon: ic('helm'), cost: { leather: 7, cloth: 4, gold: 380 }, unlock: { region: 'ashenwaste' },
  },
  craftRangerGloves: {
    id: 'craftRangerGloves', station: 'forge', kind: 'item', out: 'rangerGloves',
    name: "Ranger's Bracers", icon: ic('gloves'), cost: { leather: 6, cloth: 3, gold: 320 }, unlock: { region: 'ashenwaste' },
  },
  craftRangerBoots: {
    id: 'craftRangerBoots', station: 'forge', kind: 'item', out: 'rangerBoots',
    name: 'Pathfinder Boots', icon: ic('boots'), cost: { leather: 6, heartwood: 1, gold: 340 }, unlock: { region: 'ashenwaste' },
  },
  craftTowerShield: {
    id: 'craftTowerShield', station: 'forge', kind: 'item', out: 'towerShield',
    name: 'Tower Shield', icon: ic('shield'), cost: { steel: 9, oak: 6, gold: 560 }, unlock: { region: 'blackbriar' },
  },
  craftDragonPlate: {
    id: 'craftDragonPlate', station: 'forge', kind: 'item', out: 'dragonPlate',
    name: 'Dragonbone Harness', icon: ic('dragon'), cost: { dragonbone: 9, steel: 8, emberglass: 5, gold: 2600 }, unlock: { research: 'boneCuring' },
  },
  craftDragonHelm: {
    id: 'craftDragonHelm', station: 'forge', kind: 'item', out: 'dragonHelm',
    name: 'Dragonbone Helm', icon: ic('dragon'), cost: { dragonbone: 5, steel: 5, gold: 1500 }, unlock: { research: 'boneCuring' },
  },
  craftDragonGauntlets: {
    id: 'craftDragonGauntlets', station: 'forge', kind: 'item', out: 'dragonGauntlets',
    name: 'Dragonbone Gauntlets', icon: ic('dragon'), cost: { dragonbone: 4, steel: 4, gold: 1300 }, unlock: { research: 'boneCuring' },
  },
  craftDragonGreaves: {
    id: 'craftDragonGreaves', station: 'forge', kind: 'item', out: 'dragonGreaves',
    name: 'Dragonbone Greaves', icon: ic('dragon'), cost: { dragonbone: 4, steel: 4, gold: 1300 }, unlock: { research: 'boneCuring' },
  },
  craftCrownHelm: {
    id: 'craftCrownHelm', station: 'forge', kind: 'item', out: 'crownHelm',
    name: 'The Iron Crown', icon: ic('crown'),
    cost: { crownshard: 5, starIron: 5, aether: 2, gold: 12000 },
    unlock: { research: 'crownwork' },
    desc: 'You are not making a helmet. You are re-making a crown, and it will notice.',
  },
  craftCrownAegis: {
    id: 'craftCrownAegis', station: 'forge', kind: 'item', out: 'crownAegis',
    name: 'Aegis of the Crown', icon: ic('shield'),
    cost: { crownshard: 4, starIron: 5, runestone: 6, gold: 8600 },
    unlock: { research: 'crownwork' },
  },

  /* ============================================= LIBRARY — enchanted gear
     Robes, wards and trinkets are woven rather than beaten, so they are the
     Wizard's work, not the smith's. This also gives the Library a third
     purpose beyond research and brewing.
     ===================================================================== */

  weaveApprenticeRobe: {
    id: 'weaveApprenticeRobe', station: 'alchemy', kind: 'item', out: 'apprenticeRobe',
    name: 'Apprentice Robe', icon: ic('robe'),
    cost: { cloth: 6, arcaneDust: 3, gold: 180 }, unlock: { research: 'alchemy1' },
    desc: 'Almost no physical protection, and considerable protection from the things armour ignores.',
  },
  weaveApprenticeHood: {
    id: 'weaveApprenticeHood', station: 'alchemy', kind: 'item', out: 'apprenticeHood',
    name: 'Apprentice Hood', icon: ic('mage'),
    cost: { cloth: 4, arcaneDust: 2, gold: 120 }, unlock: { research: 'alchemy1' },
  },
  weaveApprenticeGloves: {
    id: 'weaveApprenticeGloves', station: 'alchemy', kind: 'item', out: 'apprenticeGloves',
    name: 'Sigil Wraps', icon: ic('gloves'),
    cost: { cloth: 4, arcaneDust: 2, gold: 120 }, unlock: { research: 'alchemy1' },
  },
  weaveApprenticeShoes: {
    id: 'weaveApprenticeShoes', station: 'alchemy', kind: 'item', out: 'apprenticeShoes',
    name: 'Soft Shoes', icon: ic('boots'),
    cost: { cloth: 4, leather: 2, gold: 100 }, unlock: { research: 'alchemy1' },
  },

  weaveArchmageRobe: {
    id: 'weaveArchmageRobe', station: 'alchemy', kind: 'item', out: 'archmageRobe',
    name: "Archmage's Vestments", icon: ic('robe'),
    cost: { cloth: 14, runestone: 4, silver: 5, arcaneDust: 12, gold: 2600 },
    unlock: { research: 'voidwork' },
  },
  weaveArchmageHood: {
    id: 'weaveArchmageHood', station: 'alchemy', kind: 'item', out: 'archmageHood',
    name: "Archmage's Circlet", icon: ic('spark'),
    cost: { silver: 5, runestone: 3, arcaneDust: 8, gold: 1500 },
    unlock: { research: 'voidwork' },
  },
  weaveArchmageGloves: {
    id: 'weaveArchmageGloves', station: 'alchemy', kind: 'item', out: 'archmageGloves',
    name: 'Conduit Wraps', icon: ic('gloves'),
    cost: { cloth: 8, runestone: 2, arcaneDust: 8, gold: 1300 },
    unlock: { research: 'voidwork' },
  },
  weaveArchmageShoes: {
    id: 'weaveArchmageShoes', station: 'alchemy', kind: 'item', out: 'archmageShoes',
    name: 'Stepless Slippers', icon: ic('boots'),
    cost: { cloth: 8, frostLotus: 3, arcaneDust: 6, gold: 1300 },
    unlock: { research: 'voidwork' },
  },

  weaveWardingSigil: {
    id: 'weaveWardingSigil', station: 'alchemy', kind: 'item', out: 'wardingSigil',
    name: 'Warding Sigil', icon: ic('talisman'),
    cost: { runestone: 4, arcaneDust: 10, silver: 3, gold: 1900 },
    unlock: { research: 'transmutation' },
    desc: 'Floats beside you and takes a third off every spell aimed your way. Works with two-handed weapons.',
  },
  weaveShadowHood: {
    id: 'weaveShadowHood', station: 'alchemy', kind: 'item', out: 'shadowHood',
    name: 'Shroud of Nine Nights', icon: ic('void'),
    cost: { crownshard: 2, voidEmber: 8, cloth: 12, aether: 1, gold: 7600 },
    unlock: { research: 'crownwork' },
  },

  /* ---- trinkets: the build-defining slots ---- */
  bindBloodPendant: {
    id: 'bindBloodPendant', station: 'alchemy', kind: 'item', out: 'bloodPendant',
    name: 'Pendant of Red Hours', icon: ic('amulet'),
    cost: { leather: 6, herb: 6, iron: 4, gold: 340 }, unlock: { research: 'alchemy1' },
    desc: 'Eight per cent of the damage you deal comes back as health.',
  },
  bindScholarRing: {
    id: 'bindScholarRing', station: 'alchemy', kind: 'item', out: 'scholarRing',
    name: 'Ring of Long Study', icon: ic('ring'),
    cost: { arcaneDust: 6, silver: 1, gold: 420 }, unlock: { research: 'alchemy1' },
    desc: 'The Wizard has three. He will pretend this is the only one.',
  },
  bindWarhorn: {
    id: 'bindWarhorn', station: 'alchemy', kind: 'item', out: 'warhorn',
    name: 'Old Warhorn', icon: ic('horn'),
    cost: { steel: 5, leather: 6, arcaneDust: 4, gold: 900 }, unlock: { research: 'quartermaster' },
  },
  bindStoneheart: {
    id: 'bindStoneheart', station: 'alchemy', kind: 'item', out: 'stoneheart',
    name: 'Stoneheart', icon: ic('rock'),
    cost: { runestone: 2, steel: 8, boneMeal: 6, gold: 1100 }, unlock: { research: 'transmutation' },
  },
  bindPhoenixFeather: {
    id: 'bindPhoenixFeather', station: 'alchemy', kind: 'item', out: 'phoenixFeather',
    name: 'Phoenix Feather', icon: ic('feather'),
    cost: { emberglass: 10, dragonbone: 3, aether: 1, gold: 3200 }, unlock: { research: 'alchemy3' },
    desc: 'The first time you fall in a battle, you get back up at half health. Once.',
  },
  bindVoidSigil: {
    id: 'bindVoidSigil', station: 'alchemy', kind: 'item', out: 'voidSigil',
    name: 'Sigil of the Void', icon: ic('vortex'),
    cost: { voidEmber: 6, runestone: 5, aether: 1, gold: 3400 }, unlock: { research: 'voidwork' },
  },
  bindCrownSeal: {
    id: 'bindCrownSeal', station: 'alchemy', kind: 'item', out: 'crownSeal',
    name: 'Seal of the Iron Crown', icon: ic('medal'),
    cost: { crownshard: 3, starIron: 4, aether: 2, runestone: 8, gold: 11000 },
    unlock: { research: 'crownwork' },
    desc: 'A fifth card slot in your hand. The single best item in the game, and it takes the whole war to earn.',
  },

  /* ==================================================== LIBRARY — potions */

  brewHealth: {
    id: 'brewHealth', station: 'alchemy', kind: 'potion', out: 'healthPotion', qty: 3,
    name: 'Health Draughts ×3', icon: ic('flask'),
    cost: { herb: 3, cloth: 1, gold: 40 }, unlock: {},
    desc: 'Bitterleaf, boiled, strained, and mixed with something the Wizard will not name.',
  },
  brewSpeed: {
    id: 'brewSpeed', station: 'alchemy', kind: 'potion', out: 'speedPotion', qty: 2,
    name: 'Draughts of Swiftness ×2', icon: ic('stamina'),
    cost: { herb: 4, arcaneDust: 1, gold: 70 }, unlock: { region: 'blackbriar' },
  },
  brewStrength: {
    id: 'brewStrength', station: 'alchemy', kind: 'potion', out: 'strengthPotion', qty: 2,
    name: 'Draughts of Wrath ×2', icon: ic('might'),
    cost: { herb: 3, emberglass: 1, gold: 90 }, unlock: { region: 'ashenwaste' },
  },
  brewDefense: {
    id: 'brewDefense', station: 'alchemy', kind: 'potion', out: 'defensePotion', qty: 2,
    name: 'Draughts of Stone ×2', icon: ic('rock'),
    cost: { herb: 3, iron: 2, gold: 80 }, unlock: { region: 'blackbriar' },
  },
  brewMagic: {
    id: 'brewMagic', station: 'alchemy', kind: 'potion', out: 'magicPotion', qty: 2,
    name: 'Draughts of Insight ×2', icon: ic('orb'),
    cost: { arcaneDust: 4, herb: 3, gold: 220 }, unlock: { research: 'alchemy2' },
  },
  brewAntidote: {
    id: 'brewAntidote', station: 'alchemy', kind: 'potion', out: 'antidote', qty: 3,
    name: 'Antidotes ×3', icon: ic('clover'),
    cost: { herb: 5, boneMeal: 2, gold: 140 }, unlock: { research: 'alchemy2' },
  },
  brewCommand: {
    id: 'brewCommand', station: 'alchemy', kind: 'potion', out: 'commandPotion', qty: 1,
    name: 'Banner Elixir', icon: ic('banner'),
    cost: { arcaneDust: 5, silver: 2, herb: 4, gold: 420 }, unlock: { research: 'alchemy3' },
  },
  brewPhoenix: {
    id: 'brewPhoenix', station: 'alchemy', kind: 'potion', out: 'phoenixTonic', qty: 1,
    name: 'Phoenix Tonic', icon: ic('flame'),
    cost: { emberglass: 6, dragonbone: 2, herb: 8, aether: 1, gold: 1600 },
    unlock: { research: 'alchemy3' },
    desc: 'The Wizard brews this one personally and watches you put it in your belt with visible regret.',
  },

  /* =============================================== LIBRARY — transmutation */

  transmuteDust: {
    id: 'transmuteDust', station: 'alchemy', kind: 'material', out: { arcaneDust: 3 },
    name: 'Grind Arcane Dust', icon: ic('spark'),
    cost: { runestone: 1, gold: 120 }, unlock: { research: 'transmutation' },
    desc: 'Runestones are rare and dust is useful. The Wizard calls this vandalism; he still does it.',
  },
  transmuteShards: {
    id: 'transmuteShards', station: 'alchemy', kind: 'special', out: 'randomShards',
    name: 'Echo of Battles Past', icon: ic('crystal'),
    cost: { arcaneDust: 8, boneMeal: 4, gold: 500 }, unlock: { research: 'transmutation' },
    desc: 'Produces 12 shards for a random card you already own. The Library remembers everyone who fought for you.',
  },
  transmuteAether: {
    id: 'transmuteAether', station: 'alchemy', kind: 'material', out: { aether: 1 },
    name: 'Distil Aether', icon: ic('vortex'),
    cost: { voidEmber: 4, runestone: 3, starIron: 1, gold: 2200 },
    unlock: { research: 'voidwork' },
  },
  forgeCrownShard: {
    id: 'forgeCrownShard', station: 'alchemy', kind: 'material', out: { crownshard: 1 },
    name: 'Reforge a Crown Shard', icon: ic('crown'),
    cost: { starIron: 4, aether: 2, runestone: 5, gold: 5000 },
    unlock: { research: 'crownwork' },
    desc: 'You cannot find more shards. You can, with enough star iron and enough nerve, make one.',
  },
};

export const RECIPE_LIST = Object.values(RECIPES);
export const getRecipe = id => RECIPES[id];

export function recipesFor(station) {
  return RECIPE_LIST.filter(r => r.station === station);
}

/** Is this recipe visible to the player yet? */
export function isDiscovered(recipe, state) {
  const u = recipe.unlock || {};
  if (!u.region && !u.research && !u.level && !u.flag) return true;
  if (u.region && !state.progress.regions?.[u.region]?.unlocked) return false;
  if (u.research && !state.research.includes(u.research)) return false;
  if (u.level && state.level < u.level) return false;
  if (u.flag && !state.flags[u.flag]) return false;
  return true;
}
