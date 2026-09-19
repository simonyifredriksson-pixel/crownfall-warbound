/* Items.js — the commander's equipment and consumables.

   Your commander is a unit on the battlefield, so gear is not a stat screen:
   a heavy plate build genuinely plays differently from a robed caster build.

   STATS
     might    melee weapon damage
     focus    ability power (commander abilities and staff attacks)
     vigor    max health
     armor    flat damage reduction (diminishing, same curve as units)
     haste    attack speed and ability cooldown rate
     weight   subtracts move speed — the whole tension of the armour system
     lifesteal / thorns / cdr / critChance / commandRegen  — situational affixes

   Every piece declares `visual`, which CommanderArt reads to actually build
   the mesh. Equipment you can see is equipment you care about.
*/

export const SLOTS = {
  weapon:  { id: 'weapon',  name: 'Weapon',    icon: '⚔' },
  offhand: { id: 'offhand', name: 'Off-hand',  icon: '🛡' },
  head:    { id: 'head',    name: 'Helm',      icon: '🪖' },
  chest:   { id: 'chest',   name: 'Chest',     icon: '🦺' },
  hands:   { id: 'hands',   name: 'Gauntlets', icon: '🧤' },
  feet:    { id: 'feet',    name: 'Boots',     icon: '🥾' },
  trinket1:{ id: 'trinket1',name: 'Trinket I', icon: '💍', family: 'trinket' },
  trinket2:{ id: 'trinket2',name: 'Trinket II',icon: '📿', family: 'trinket' },
};
export const SLOT_ORDER = ['weapon', 'offhand', 'head', 'chest', 'hands', 'feet', 'trinket1', 'trinket2'];

/* ==========================================================================
   WEAPON CLASSES — how the commander actually swings
   ========================================================================== */

export const WEAPON_CLASSES = {
  sword: {
    id: 'sword', name: 'Sword', icon: '🗡',
    desc: 'A three-hit combo, quick recovery, forgiving. The generalist.',
    combo: [{ arc: 1.5, reach: 2.6, mult: 1.0, wind: 0.13 },
            { arc: 1.5, reach: 2.6, mult: 1.05, wind: 0.12 },
            { arc: 2.6, reach: 3.0, mult: 1.45, wind: 0.2 }],
    dmgType: 'slash', swingTime: 0.42, moveWhileSwinging: 0.6,
  },
  greatsword: {
    id: 'greatsword', name: 'Greatsword', icon: '⚔',
    desc: 'Slow, enormous arcs that hit everything in front of you. Commits you to the swing.',
    combo: [{ arc: 3.0, reach: 3.6, mult: 1.6, wind: 0.32 },
            { arc: 3.4, reach: 3.8, mult: 2.1, wind: 0.4 }],
    dmgType: 'slash', swingTime: 0.75, moveWhileSwinging: 0.2, knockback: 2.4,
  },
  axe: {
    id: 'axe', name: 'Axe', icon: '🪓',
    desc: 'Heavy chops that leave wounds. Every hit stacks Bleeding.',
    combo: [{ arc: 1.8, reach: 2.7, mult: 1.25, wind: 0.2 },
            { arc: 2.2, reach: 2.9, mult: 1.5, wind: 0.26 }],
    dmgType: 'slash', swingTime: 0.56, moveWhileSwinging: 0.4,
    onHit: { status: 'bleeding', dur: 5, dpsFrac: 0.12 },
  },
  hammer: {
    id: 'hammer', name: 'Warhammer', icon: '🔨',
    desc: 'Blunt: 50% more against heavy armour, and a chance to stagger anything it lands on.',
    combo: [{ arc: 1.6, reach: 2.8, mult: 1.7, wind: 0.34 }],
    dmgType: 'blunt', swingTime: 0.82, moveWhileSwinging: 0.25, knockback: 3.4,
    onHit: { status: 'stunned', dur: 0.55, chance: 0.3 },
  },
  spear: {
    id: 'spear', name: 'Spear', icon: '🔱',
    desc: 'Long reach thrusts. You fight from outside their range and they hate it.',
    combo: [{ arc: 0.7, reach: 4.2, mult: 1.15, wind: 0.14 },
            { arc: 0.7, reach: 4.6, mult: 1.35, wind: 0.16 }],
    dmgType: 'pierce', swingTime: 0.46, moveWhileSwinging: 0.7,
  },
  daggers: {
    id: 'daggers', name: 'Twin Daggers', icon: '🔪',
    desc: 'Very fast, very short. Doubles backstab damage; you will be circling all battle.',
    combo: [{ arc: 1.1, reach: 2.0, mult: 0.6, wind: 0.08 },
            { arc: 1.1, reach: 2.0, mult: 0.6, wind: 0.08 },
            { arc: 1.4, reach: 2.2, mult: 0.95, wind: 0.1 }],
    dmgType: 'pierce', swingTime: 0.24, moveWhileSwinging: 0.85, backstabBonus: 1.0,
  },
  bow: {
    id: 'bow', name: 'Bow', icon: '🏹',
    desc: 'Ranged. Hold to draw for up to triple damage; you are helpless while you draw.',
    ranged: true, maxRange: 26, drawTime: 0.85, maxChargeMult: 3.0,
    dmgType: 'pierce', swingTime: 0.5, moveWhileSwinging: 0.45,
  },
  staff: {
    id: 'staff', name: 'Staff', icon: '🪄',
    desc: 'Ranged bolts that scale with Focus instead of Might, and pierce the first target.',
    ranged: true, maxRange: 20, dmgType: 'arcane', swingTime: 0.62, moveWhileSwinging: 0.5,
    scalesWith: 'focus', pierceCount: 2,
  },
};

/* Shorthand */
const I = (o) => ({
  rarity: 'common', tier: 1, level: 1, maxLevel: 10,
  stats: {}, visual: {}, tags: [], ...o,
});

/* ==========================================================================
   WEAPONS
   ========================================================================== */

export const ITEMS = {

  /* --------------------------------------------------------- swords */
  ironSword: I({
    id: 'ironSword', name: 'Iron Sword', slot: 'weapon', wclass: 'sword', rarity: 'common', tier: 1,
    icon: '🗡', stats: { might: 16, weight: 4 },
    visual: { blade: 0xb0b8c4, hilt: 0x5a4a3a, guard: 0x8a8070, length: 1.05 },
    desc: 'A soldier\'s sword. Nothing about it is remarkable, which is exactly what you want when you are learning.',
  }),
  steelLongsword: I({
    id: 'steelLongsword', name: 'Steel Longsword', slot: 'weapon', wclass: 'sword', rarity: 'uncommon', tier: 2,
    icon: '🗡', stats: { might: 34, haste: 5, weight: 5 },
    visual: { blade: 0xd0d8e4, hilt: 0x3a3a48, guard: 0xc0a040, length: 1.2, fuller: true },
    desc: 'Folded steel, properly balanced. The third hit of the combo comes around noticeably faster.',
  }),
  silverbrand: I({
    id: 'silverbrand', name: 'Silverbrand', slot: 'weapon', wclass: 'sword', rarity: 'rare', tier: 2,
    icon: '⚔', stats: { might: 48, focus: 10, weight: 5 },
    special: { dmgTypeOverride: 'holy' },
    visual: { blade: 0xe8f0f8, hilt: 0xd9c98a, guard: 0xe8e0c8, length: 1.2, glow: 0xf3d98a, fuller: true },
    desc: 'Silverbloom in the edge. Deals holy damage — which is to say, it doubles against anything in Hollowmere.',
  }),
  kingsEdge: I({
    id: 'kingsEdge', name: "The King's Edge", slot: 'weapon', wclass: 'sword', rarity: 'legendary', tier: 4,
    icon: '👑', stats: { might: 118, focus: 34, haste: 14, vigor: 180, weight: 6 },
    special: { ability: 'cmdCrownStrike', critChance: 0.12 },
    visual: { blade: 0xffe9a8, hilt: 0x2a1d06, guard: 0xd9a441, length: 1.35, glow: 0xffd479, aura: 0xd9a441, fuller: true, runes: true },
    desc: 'Forged from Crown Shards and star iron. It remembers every commander who carried it, and it is not impressed by you yet.',
    legendary: 'Crown Strike — a wide golden arc that blinds and blesses every ally it passes through.',
  }),

  /* ---------------------------------------------------- greatswords */
  ironGreatsword: I({
    id: 'ironGreatsword', name: 'Iron Greatsword', slot: 'weapon', wclass: 'greatsword', rarity: 'common', tier: 1,
    icon: '⚔', stats: { might: 28, weight: 14 },
    visual: { blade: 0xa8b0bc, hilt: 0x4a3a2a, guard: 0x7a7060, length: 1.7, wide: true },
    desc: 'Two hands, no shield, and a swing that catches three goblins at once.',
  }),
  dragonboneCleaver: I({
    id: 'dragonboneCleaver', name: 'Dragonbone Cleaver', slot: 'weapon', wclass: 'greatsword', rarity: 'epic', tier: 3,
    icon: '🐉', stats: { might: 92, vigor: 120, weight: 11 },
    special: { lifesteal: 0.1 },
    visual: { blade: 0xc8a860, hilt: 0x3a2a1a, guard: 0x8a6a3a, length: 1.9, wide: true, glow: 0xe8823a, jagged: true },
    desc: 'Lighter than steel and it drinks. Ten per cent of everything it cuts comes back to you.',
  }),

  /* ------------------------------------------------------------ axes */
  woodaxe: I({
    id: 'woodaxe', name: 'Woodsman\'s Axe', slot: 'weapon', wclass: 'axe', rarity: 'common', tier: 1,
    icon: '🪓', stats: { might: 20, weight: 6 },
    visual: { blade: 0x9aa0aa, hilt: 0x6a5a3a, length: 1.0, axeHead: true },
    desc: 'Not made for people. Works on people.',
  }),
  reaverAxe: I({
    id: 'reaverAxe', name: 'Reaver Axe', slot: 'weapon', wclass: 'axe', rarity: 'rare', tier: 2,
    icon: '🪓', stats: { might: 52, haste: 8, weight: 8 },
    special: { bleedBonus: 1.0 },
    visual: { blade: 0xb8703a, hilt: 0x3a2a1a, length: 1.15, axeHead: true, jagged: true, glow: 0xc5362b },
    desc: 'Bleed stacks twice as fast. Anything that runs from you dies tired.',
  }),

  /* -------------------------------------------------------- hammers */
  ironMaul: I({
    id: 'ironMaul', name: 'Iron Maul', slot: 'weapon', wclass: 'hammer', rarity: 'common', tier: 1,
    icon: '🔨', stats: { might: 26, armor: 3, weight: 16 },
    visual: { head: 0x8a9098, hilt: 0x5a4a3a, length: 1.2, hammerHead: true },
    desc: 'Blunt damage does half again as much to heavy armour. Bring it to a knight fight.',
  }),
  mountainbreaker: I({
    id: 'mountainbreaker', name: 'Mountainbreaker', slot: 'weapon', wclass: 'hammer', rarity: 'epic', tier: 3,
    icon: '⛰', stats: { might: 104, armor: 14, vigor: 160, weight: 24 },
    special: { ability: 'cmdShockwave', knockbackBonus: 1.5 },
    visual: { head: 0x7a7a68, hilt: 0x3a2a1a, length: 1.4, hammerHead: true, glow: 0xd9a441, runes: true },
    desc: 'Heavy enough that you feel it in your boots. Shockwave on demand; everything nearby goes over.',
  }),

  /* --------------------------------------------------------- spears */
  huntingSpear: I({
    id: 'huntingSpear', name: 'Hunting Spear', slot: 'weapon', wclass: 'spear', rarity: 'common', tier: 1,
    icon: '🔱', stats: { might: 17, haste: 4, weight: 5 },
    visual: { head: 0xa8b0bc, shaft: 0x6a5a3a, length: 2.2 },
    desc: 'Four metres of reach. You can fight a knight without ever being in his range.',
  }),
  wyrmlance: I({
    id: 'wyrmlance', name: 'Wyrmlance', slot: 'weapon', wclass: 'spear', rarity: 'rare', tier: 3,
    icon: '🔱', stats: { might: 58, haste: 12, focus: 14, weight: 6 },
    special: { pierceArmor: 0.4 },
    visual: { head: 0xc8a860, shaft: 0x3a2a1a, length: 2.5, glow: 0xe8823a, runes: true },
    desc: 'Ignores 40% of armour. The correct answer to a wall of plate that you personally have to walk through.',
  }),

  /* -------------------------------------------------------- daggers */
  cutpurseKnives: I({
    id: 'cutpurseKnives', name: 'Cutpurse Knives', slot: 'weapon', wclass: 'daggers', rarity: 'uncommon', tier: 1,
    icon: '🔪', stats: { might: 13, haste: 18, weight: 2 },
    visual: { blade: 0x9aa0aa, hilt: 0x2a2a35, length: 0.55, paired: true },
    desc: 'Taken off Mara\'s people. Fast enough that you can circle a giant all day.',
  }),
  nightfang: I({
    id: 'nightfang', name: 'Nightfang', slot: 'weapon', wclass: 'daggers', rarity: 'epic', tier: 3,
    icon: '🌑', stats: { might: 44, haste: 30, focus: 20, weight: 2 },
    special: { dmgTypeOverride: 'shadow', ability: 'cmdBlink', backstabBonus: 0.6 },
    visual: { blade: 0x4a3a5a, hilt: 0x14151b, length: 0.6, paired: true, glow: 0xb07fd0 },
    desc: 'Shadow damage — strong against heavy armour and magical wards both. Comes with a blink, because of course it does.',
  }),

  /* ------------------------------------------------------------ bows */
  shortbow: I({
    id: 'shortbow', name: 'Shortbow', slot: 'weapon', wclass: 'bow', rarity: 'common', tier: 1,
    icon: '🏹', stats: { might: 18, haste: 6, weight: 3 },
    visual: { wood: 0x6a5a3a, string: 0xd8cbb0, length: 1.1 },
    desc: 'You fight from the back and let your army do the pushing. Perfectly legitimate.',
  }),
  stormdraw: I({
    id: 'stormdraw', name: 'Stormdraw', slot: 'weapon', wclass: 'bow', rarity: 'epic', tier: 3,
    icon: '⚡', stats: { might: 76, focus: 30, haste: 16, weight: 4 },
    special: { dmgTypeOverride: 'arcane', chainOnFullDraw: 3 },
    visual: { wood: 0x2a3a5a, string: 0x9fd0ff, length: 1.3, glow: 0x9fd0ff, runes: true },
    desc: 'A full draw chains to three targets. Learning to hold the shot is the whole skill of this weapon.',
  }),

  /* ---------------------------------------------------------- staves */
  apprenticeStaff: I({
    id: 'apprenticeStaff', name: 'Apprentice Staff', slot: 'weapon', wclass: 'staff', rarity: 'common', tier: 1,
    icon: '🪄', stats: { focus: 22, might: 4, weight: 3 },
    visual: { shaft: 0x6a5a3a, gem: 0x9a6fe0, length: 1.7, glow: 0x9a6fe0 },
    desc: 'The Wizard gives these away. He says it is generosity; it is mostly storage space.',
  }),
  emberstaff: I({
    id: 'emberstaff', name: 'Emberstaff', slot: 'weapon', wclass: 'staff', rarity: 'rare', tier: 2,
    icon: '🔥', stats: { focus: 54, vigor: 60, weight: 4 },
    special: { dmgTypeOverride: 'fire', ability: 'cmdFirewall' },
    visual: { shaft: 0x5a3a2a, gem: 0xe8823a, length: 1.8, glow: 0xe8823a, runes: true },
    desc: 'Fire, and a wall of it on command. Pair it with an Oil Flinger and stop worrying about frontlines.',
  }),
  aethervoidStaff: I({
    id: 'aethervoidStaff', name: 'Staff of the Aethervoid', slot: 'weapon', wclass: 'staff', rarity: 'legendary', tier: 4,
    icon: '🌀', stats: { focus: 142, vigor: 140, haste: 18, weight: 5 },
    special: { ignoreArmor: true, ability: 'cmdVoidRift', cdr: 0.2 },
    visual: { shaft: 0x2a1a4a, gem: 0xb07fd0, length: 1.95, glow: 0xb07fd0, aura: 0x9a6fe0, runes: true, floating: true },
    desc: 'Your bolts ignore armour entirely. Against Ancient Guardians this is not a weapon, it is a solution.',
    legendary: 'Void Rift — tears a hole that drags everything nearby into it and holds them there.',
  }),

  /* ==========================================================================
     OFF-HAND
     ========================================================================== */

  woodShield: I({
    id: 'woodShield', name: 'Oak Shield', slot: 'offhand', rarity: 'common', tier: 1,
    icon: '🛡', stats: { armor: 10, vigor: 50, weight: 7 },
    visual: { shape: 'round', face: 0x8a6a3a, boss: 0x8a8070 },
    desc: 'Blocks things. That is the whole feature list and it is enough.',
    requires: { notWclass: ['greatsword', 'bow', 'staff', 'spear'] },
  }),
  towerShield: I({
    id: 'towerShield', name: 'Tower Shield', slot: 'offhand', rarity: 'rare', tier: 2,
    icon: '🛡', stats: { armor: 32, vigor: 180, weight: 22 },
    special: { blockChance: 0.2 },
    visual: { shape: 'tower', face: 0x4a5260, boss: 0xc0a040, trim: 0xc0a040 },
    desc: 'A door with a handle. Twenty per cent of everything simply does not happen.',
    requires: { notWclass: ['greatsword', 'bow', 'staff', 'spear'] },
  }),
  wardingSigil: I({
    id: 'wardingSigil', name: 'Warding Sigil', slot: 'offhand', rarity: 'epic', tier: 3,
    icon: '🪬', stats: { focus: 48, armor: 14, vigor: 100, weight: 2 },
    special: { magicResist: 0.3 },
    visual: { shape: 'sigil', face: 0x3a2a4a, glow: 0xb07fd0, floating: true },
    desc: 'Floats beside you and takes 30% off every spell aimed your way. Works with two-handed weapons.',
  }),
  crownAegis: I({
    id: 'crownAegis', name: 'Aegis of the Crown', slot: 'offhand', rarity: 'legendary', tier: 4,
    icon: '👑', stats: { armor: 64, vigor: 380, focus: 40, weight: 18 },
    special: { blockChance: 0.3, reflect: 0.25, ability: 'cmdBastion' },
    visual: { shape: 'tower', face: 0xd9a441, boss: 0xffe9a8, trim: 0xffe9a8, glow: 0xffd479, aura: 0xd9a441 },
    desc: 'Blocks a third of everything and returns a quarter of what gets through. On command, it becomes a wall your whole army can stand behind.',
    legendary: 'Bastion — plant the shield; allies behind it take 60% less damage for six seconds.',
    requires: { notWclass: ['greatsword', 'bow', 'staff'] },
  }),

  /* ==========================================================================
     ARMOUR — three families, three playstyles
     HEAVY  most armour, most weight, slowest
     LIGHT  least armour, negligible weight, fastest, best dodge
     MAGIC  focus and magic resistance, poor physical armour
     ========================================================================== */

  /* --- heavy ----------------------------------------------------------- */
  ironHelm:   I({ id: 'ironHelm', name: 'Iron Helm', slot: 'head', rarity: 'common', tier: 1, icon: '🪖',
    stats: { armor: 8, vigor: 40, weight: 6 }, family: 'heavy',
    visual: { style: 'great', metal: 0x8a9098, trim: 0x5a5a62 },
    desc: 'Heavy, hot, and the reason you still have a head.' }),
  ironPlate:  I({ id: 'ironPlate', name: 'Iron Cuirass', slot: 'chest', rarity: 'common', tier: 1, icon: '🦺',
    stats: { armor: 16, vigor: 90, weight: 14 }, family: 'heavy',
    visual: { style: 'plate', metal: 0x8a9098, trim: 0x5a5a62 },
    desc: 'Solid front and back plate. You will not be dodging much.' }),
  ironGauntlets: I({ id: 'ironGauntlets', name: 'Iron Gauntlets', slot: 'hands', rarity: 'common', tier: 1, icon: '🧤',
    stats: { armor: 6, might: 6, weight: 5 }, family: 'heavy',
    visual: { style: 'plate', metal: 0x8a9098 }, desc: 'Articulated fingers. Mostly.' }),
  ironSabatons: I({ id: 'ironSabatons', name: 'Iron Sabatons', slot: 'feet', rarity: 'common', tier: 1, icon: '🥾',
    stats: { armor: 6, vigor: 30, weight: 7 }, family: 'heavy',
    visual: { style: 'plate', metal: 0x8a9098 }, desc: 'Heavy boots for a heavy commander.' }),

  knightHelm: I({ id: 'knightHelm', name: 'Knight\'s Great Helm', slot: 'head', rarity: 'uncommon', tier: 2, icon: '🪖',
    stats: { armor: 20, vigor: 90, weight: 8 }, family: 'heavy',
    visual: { style: 'winged', metal: 0xc0c8d4, trim: 0xc0a040, plume: 0x2f5f8f },
    desc: 'Folded steel with a plume, because morale is a real statistic.' }),
  knightPlate: I({ id: 'knightPlate', name: 'Knight\'s Plate', slot: 'chest', rarity: 'uncommon', tier: 2, icon: '🦺',
    stats: { armor: 42, vigor: 220, weight: 20 }, family: 'heavy',
    visual: { style: 'plate', metal: 0xc0c8d4, trim: 0xc0a040, tabard: 0x2f5f8f },
    desc: 'Full harness. Eight points of move speed and worth every one of them if you fight in the line.' }),
  knightGauntlets: I({ id: 'knightGauntlets', name: 'Knight\'s Gauntlets', slot: 'hands', rarity: 'uncommon', tier: 2, icon: '🧤',
    stats: { armor: 14, might: 16, weight: 6 }, family: 'heavy',
    visual: { style: 'plate', metal: 0xc0c8d4, trim: 0xc0a040 }, desc: 'Good steel, good grip.' }),
  knightSabatons: I({ id: 'knightSabatons', name: 'Knight\'s Sabatons', slot: 'feet', rarity: 'uncommon', tier: 2, icon: '🥾',
    stats: { armor: 14, vigor: 70, weight: 8 }, family: 'heavy',
    visual: { style: 'plate', metal: 0xc0c8d4, trim: 0xc0a040 }, desc: 'You can hear yourself coming.' }),

  dragonHelm: I({ id: 'dragonHelm', name: 'Dragonbone Helm', slot: 'head', rarity: 'epic', tier: 3, icon: '🐉',
    stats: { armor: 46, vigor: 200, might: 18, weight: 6 }, family: 'heavy',
    visual: { style: 'horned', metal: 0xc8a860, trim: 0xe8823a, glow: 0xe8823a },
    desc: 'Dragonbone weighs almost nothing and stops almost everything.' }),
  dragonPlate: I({ id: 'dragonPlate', name: 'Dragonbone Harness', slot: 'chest', rarity: 'epic', tier: 3, icon: '🐉',
    stats: { armor: 92, vigor: 520, might: 26, weight: 13 }, family: 'heavy',
    special: { fireResist: 0.4 },
    visual: { style: 'scale', metal: 0xc8a860, trim: 0xe8823a, glow: 0xe8823a },
    desc: 'Plate protection at two-thirds the weight, and fire barely notices you.' }),
  dragonGauntlets: I({ id: 'dragonGauntlets', name: 'Dragonbone Gauntlets', slot: 'hands', rarity: 'epic', tier: 3, icon: '🐉',
    stats: { armor: 30, might: 40, haste: 8, weight: 4 }, family: 'heavy',
    visual: { style: 'scale', metal: 0xc8a860, trim: 0xe8823a }, desc: 'Claw-tipped. Slightly theatrical.' }),
  dragonGreaves: I({ id: 'dragonGreaves', name: 'Dragonbone Greaves', slot: 'feet', rarity: 'epic', tier: 3, icon: '🐉',
    stats: { armor: 30, vigor: 180, weight: 5 }, family: 'heavy',
    visual: { style: 'scale', metal: 0xc8a860, trim: 0xe8823a }, desc: 'Fast, for plate.' }),

  crownHelm: I({ id: 'crownHelm', name: 'The Iron Crown', slot: 'head', rarity: 'legendary', tier: 4, icon: '👑',
    stats: { armor: 72, vigor: 400, might: 40, focus: 40, haste: 10, weight: 4 }, family: 'heavy',
    special: { commandRegen: 0.2, auraRadius: 4 },
    visual: { style: 'crown', metal: 0xffe9a8, trim: 0xd9a441, glow: 0xffd479, aura: 0xd9a441 },
    desc: 'The crown itself. Your Command regenerates 20% faster and your rally aura covers four more metres. This is the endgame, and the whole game is named after it.' }),

  /* --- light ----------------------------------------------------------- */
  leatherHood: I({ id: 'leatherHood', name: 'Leather Hood', slot: 'head', rarity: 'common', tier: 1, icon: '🧢',
    stats: { armor: 4, haste: 6, weight: 1 }, family: 'light',
    visual: { style: 'hood', cloth: 0x5a4a3a }, desc: 'You can actually see out of it, which matters more than you would think.' }),
  leatherJerkin: I({ id: 'leatherJerkin', name: 'Leather Jerkin', slot: 'chest', rarity: 'common', tier: 1, icon: '🦺',
    stats: { armor: 8, vigor: 50, haste: 8, weight: 3 }, family: 'light',
    visual: { style: 'jerkin', cloth: 0x6a4a2a, trim: 0x3a2a1a }, desc: 'Fast, quiet and thoroughly unreassuring.' }),
  leatherGloves: I({ id: 'leatherGloves', name: 'Leather Gloves', slot: 'hands', rarity: 'common', tier: 1, icon: '🧤',
    stats: { haste: 8, might: 4, weight: 1 }, family: 'light',
    visual: { style: 'wrap', cloth: 0x5a4a3a }, desc: 'Grip, and nothing else.' }),
  leatherBoots: I({ id: 'leatherBoots', name: 'Travelling Boots', slot: 'feet', rarity: 'common', tier: 1, icon: '🥾',
    stats: { armor: 3, weight: 1 }, special: { moveBonus: 0.7 }, family: 'light',
    visual: { style: 'boot', cloth: 0x5a4a3a }, desc: 'Plainly better if you intend to keep moving.' }),

  rangerHood: I({ id: 'rangerHood', name: 'Ranger\'s Hood', slot: 'head', rarity: 'rare', tier: 2, icon: '🧢',
    stats: { armor: 16, haste: 16, might: 14, weight: 1 }, family: 'light',
    special: { critChance: 0.05 },
    visual: { style: 'hood', cloth: 0x3a4a34, trim: 0x7a5a2a }, desc: 'Cuts through the noise. Five per cent more of your hits land badly for the other man.' }),
  rangerCoat: I({ id: 'rangerCoat', name: 'Ranger\'s Coat', slot: 'chest', rarity: 'rare', tier: 2, icon: '🦺',
    stats: { armor: 30, vigor: 190, haste: 22, weight: 5 }, family: 'light',
    special: { dodgeCdr: 0.25 },
    visual: { style: 'coat', cloth: 0x3a4a34, trim: 0x7a5a2a, cape: 0x2f3f2a }, desc: 'Dodge comes back a quarter faster. A light build lives on that number.' }),
  rangerGloves: I({ id: 'rangerGloves', name: 'Ranger\'s Bracers', slot: 'hands', rarity: 'rare', tier: 2, icon: '🧤',
    stats: { haste: 24, might: 18, weight: 1 }, family: 'light',
    visual: { style: 'wrap', cloth: 0x3a4a34, trim: 0x7a5a2a }, desc: 'Draw faster, swing faster, think faster.' }),
  rangerBoots: I({ id: 'rangerBoots', name: 'Pathfinder Boots', slot: 'feet', rarity: 'rare', tier: 2, icon: '🥾',
    stats: { armor: 12, haste: 12, weight: 1 }, special: { moveBonus: 1.6 }, family: 'light',
    visual: { style: 'boot', cloth: 0x3a4a34, trim: 0x7a5a2a }, desc: 'A metre and a half a second of extra speed. You will feel it immediately.' }),

  shadowHood: I({ id: 'shadowHood', name: 'Shroud of Nine Nights', slot: 'head', rarity: 'legendary', tier: 4, icon: '🌑',
    stats: { armor: 44, haste: 46, might: 70, focus: 40, weight: 1 }, family: 'light',
    special: { critChance: 0.16, ability: 'cmdVanish', backstabBonus: 0.5 },
    visual: { style: 'hood', cloth: 0x14151b, trim: 0xb07fd0, glow: 0xb07fd0, aura: 0x7a4fa0 },
    desc: 'You vanish on command and come out of it behind whoever mattered most. A light build\'s answer to a boss.' }),

  /* --- magic ----------------------------------------------------------- */
  apprenticeHood: I({ id: 'apprenticeHood', name: 'Apprentice Hood', slot: 'head', rarity: 'common', tier: 1, icon: '🎓',
    stats: { focus: 14, weight: 1 }, family: 'magic',
    visual: { style: 'hood', cloth: 0x3b3f7a, trim: 0x9a6fe0 }, desc: 'The Library issues these. The Wizard signs them out reluctantly.' }),
  apprenticeRobe: I({ id: 'apprenticeRobe', name: 'Apprentice Robe', slot: 'chest', rarity: 'common', tier: 1, icon: '👘',
    stats: { focus: 26, vigor: 40, armor: 3, weight: 2 }, family: 'magic',
    special: { magicResist: 0.1 },
    visual: { style: 'robe', cloth: 0x3b3f7a, trim: 0x9a6fe0 }, desc: 'Almost no physical protection. Considerable protection from the things physical armour does nothing about.' }),
  apprenticeGloves: I({ id: 'apprenticeGloves', name: 'Sigil Wraps', slot: 'hands', rarity: 'common', tier: 1, icon: '🧤',
    stats: { focus: 16, weight: 1 }, family: 'magic',
    visual: { style: 'wrap', cloth: 0x3b3f7a, glow: 0x9a6fe0 }, desc: 'Inked to the elbow.' }),
  apprenticeShoes: I({ id: 'apprenticeShoes', name: 'Soft Shoes', slot: 'feet', rarity: 'common', tier: 1, icon: '🥿',
    stats: { focus: 10, weight: 0 }, special: { moveBonus: 0.4 }, family: 'magic',
    visual: { style: 'shoe', cloth: 0x3b3f7a }, desc: 'The Wizard insists that stomping ruins concentration.' }),

  archmageHood: I({ id: 'archmageHood', name: 'Archmage\'s Circlet', slot: 'head', rarity: 'epic', tier: 3, icon: '💫',
    stats: { focus: 88, vigor: 120, armor: 14, weight: 1 }, family: 'magic',
    special: { cdr: 0.15 },
    visual: { style: 'circlet', metal: 0xe8d8a0, glow: 0x9a6fe0, floating: true }, desc: 'Cooldowns fifteen per cent shorter. For a caster build that is the only stat that matters.' }),
  archmageRobe: I({ id: 'archmageRobe', name: 'Archmage\'s Vestments', slot: 'chest', rarity: 'epic', tier: 3, icon: '👘',
    stats: { focus: 150, vigor: 340, armor: 26, weight: 3 }, family: 'magic',
    special: { magicResist: 0.35, manaShield: 0.25 },
    visual: { style: 'robe', cloth: 0x1f2a5a, trim: 0xffd479, glow: 0x9a6fe0, aura: 0x9a6fe0 },
    desc: 'A quarter of all damage you take is absorbed by a ward before it reaches you. Seraphel wore one of these; she is not getting it back.' }),
  archmageGloves: I({ id: 'archmageGloves', name: 'Conduit Wraps', slot: 'hands', rarity: 'epic', tier: 3, icon: '🧤',
    stats: { focus: 66, haste: 14, weight: 1 }, family: 'magic',
    visual: { style: 'wrap', cloth: 0x1f2a5a, glow: 0xffd479 }, desc: 'Every rune on them does something. The Wizard checked.' }),
  archmageShoes: I({ id: 'archmageShoes', name: 'Stepless Slippers', slot: 'feet', rarity: 'epic', tier: 3, icon: '🥿',
    stats: { focus: 54, vigor: 100, weight: 0 }, special: { moveBonus: 1.2 }, family: 'magic',
    visual: { style: 'shoe', cloth: 0x1f2a5a, glow: 0x9a6fe0, floating: true }, desc: 'Your feet do not quite touch the ground. Nobody has explained this satisfactorily.' }),

  /* ==========================================================================
     TRINKETS — the build-defining slots
     ========================================================================== */

  bloodPendant: I({ id: 'bloodPendant', name: 'Pendant of Red Hours', slot: 'trinket1', family: 'trinket', rarity: 'uncommon', tier: 1, icon: '📿',
    stats: { might: 14, vigor: 70 }, special: { lifesteal: 0.08 },
    visual: { gem: 0xc5362b }, desc: 'Eight per cent of the damage you deal comes back as health. Aggressive builds live on it.' }),
  scholarRing: I({ id: 'scholarRing', name: 'Ring of Long Study', slot: 'trinket1', family: 'trinket', rarity: 'uncommon', tier: 1, icon: '💍',
    stats: { focus: 30 }, special: { cdr: 0.1 },
    visual: { gem: 0x5aa6d8 }, desc: 'The Wizard has three. He will pretend this is the only one.' }),
  warhorn: I({ id: 'warhorn', name: 'Old Warhorn', slot: 'trinket1', family: 'trinket', rarity: 'rare', tier: 2, icon: '📯',
    stats: { vigor: 140 }, special: { commandRegen: 0.15, auraRadius: 3 },
    visual: { gem: 0xd9a441 }, desc: 'Command regenerates 15% faster and your aura reaches three metres further. Boring, and it wins games.' }),
  stoneheart: I({ id: 'stoneheart', name: 'Stoneheart', slot: 'trinket1', family: 'trinket', rarity: 'rare', tier: 2, icon: '🪨',
    stats: { armor: 30, vigor: 260, weight: 4 }, special: { ccResist: 0.4 },
    visual: { gem: 0x8d95a3 }, desc: 'Stuns and knockbacks last 40% less. Gharuk becomes survivable.' }),
  phoenixFeather: I({ id: 'phoenixFeather', name: 'Phoenix Feather', slot: 'trinket1', family: 'trinket', rarity: 'epic', tier: 3, icon: '🪶',
    stats: { vigor: 300, focus: 40 }, special: { reviveOnce: true, fireResist: 0.3 },
    visual: { gem: 0xe8823a, glow: 0xff8a3a }, desc: 'The first time you fall in a battle, you get back up at half health. Once.' }),
  voidSigil: I({ id: 'voidSigil', name: 'Sigil of the Void', slot: 'trinket1', family: 'trinket', rarity: 'epic', tier: 3, icon: '🌀',
    stats: { focus: 90, haste: 20 }, special: { ignoreArmor: 0.35, magicResist: 0.2 },
    visual: { gem: 0xb07fd0, glow: 0xb07fd0 }, desc: 'Ignores 35% of armour on everything you do.' }),
  crownSeal: I({ id: 'crownSeal', name: 'Seal of the Iron Crown', slot: 'trinket1', family: 'trinket', rarity: 'legendary', tier: 4, icon: '🎖',
    stats: { might: 60, focus: 60, vigor: 400, armor: 40, haste: 20 },
    special: { commandRegen: 0.25, extraHandSlot: true, auraDamage: 0.06 },
    visual: { gem: 0xffd479, glow: 0xffd479, aura: 0xd9a441 },
    desc: 'A fifth card slot in your hand, a quarter more Command, and every ally in your aura hits harder. The single best item in the game and it took the whole war to earn.' }),
};

/* ==========================================================================
   COMMANDER ABILITIES granted by gear (the Q / E / R slots)
   ========================================================================== */

export const CMD_ABILITIES = {
  cmdRally: {
    id: 'cmdRally', name: 'Rally', icon: '📯', cd: 22, key: 'Q', innate: true,
    desc: 'Every ally within 12m is Rallied for 8s: +15% damage, immune to fear, and heals for 12% of their maximum.',
    run(b, c) {
      b.sound('horn', c.x, c.z);
      b.fx('rallyRing', c.x, 0.3, c.z, { scale: 12 });
      for (const a of b.alliesNear(c, c.x, c.z, 12)) {
        b.applyStatus(a, 'rallied', 8, { src: c });
        b.heal(a, a.maxHp * 0.12, c);
      }
    },
  },
  cmdWarcry: {
    id: 'cmdWarcry', name: 'War Cry', icon: '💢', cd: 26, key: 'E', innate: true,
    desc: 'Routs every enemy within 9m for 2.5s and strips 3 armour from them for 8s.',
    run(b, c) {
      b.sound('horn', c.x, c.z);
      b.fx('shockwave', c.x, 0.4, c.z, { scale: 9, color: 0xc5362b });
      b.shake(0.3);
      for (const e of b.enemiesNear(c, c.x, c.z, 9)) {
        if (!e.mods.fearImmune && !e.mods.ccImmune) b.applyStatus(e, 'feared', 2.5, { src: c });
        b.applyStatus(e, 'sundered', 8, { src: c, stacks: 1 });
      }
    },
  },
  cmdCrownStrike: {
    id: 'cmdCrownStrike', name: 'Crown Strike', icon: '👑', cd: 16, key: 'R',
    desc: 'A golden arc: heavy holy damage in a wide cone, and every ally it passes through is Blessed for 8s.',
    run(b, c) {
      const a = c.facing;
      b.fx('goldArc', c.x, 1.2, c.z, { angle: a, len: 9 });
      b.sound('holy', c.x, c.z);
      for (const e of b.enemiesInCone(c, a, 1.2, 9))
        b.dealDamage(c, e, c.focus * 3.2 + c.might * 2, 'holy', { isAbility: true });
      for (const al of b.alliesInCone(c, a, 1.2, 9)) b.applyStatus(al, 'blessed', 8, { src: c });
    },
  },
  cmdShockwave: {
    id: 'cmdShockwave', name: 'Shockwave', icon: '💥', cd: 14, key: 'R',
    desc: 'Slams the ground: blunt damage, knockback and a stagger on everything within 8m.',
    run(b, c) {
      b.fx('shockwave', c.x, 0.15, c.z, { scale: 8 });
      b.sound('stomp', c.x, c.z); b.shake(0.5);
      for (const e of b.enemiesNear(c, c.x, c.z, 8)) {
        b.dealDamage(c, e, c.might * 3.4, 'blunt', { isAbility: true });
        b.knockback(e, c.x, c.z, 6);
        if (!e.mods.ccImmune) b.applyStatus(e, 'stunned', 0.8, { src: c });
      }
    },
  },
  cmdFirewall: {
    id: 'cmdFirewall', name: 'Firewall', icon: '🔥', cd: 18, key: 'R',
    desc: 'Raises a burning wall in front of you for 7s. Nothing living crosses it without cost.',
    run(b, c) {
      const a = c.facing;
      for (let i = -2; i <= 2; i++) {
        const px = c.x + Math.cos(a) * 5 - Math.sin(a) * i * 2.4;
        const pz = c.z + Math.sin(a) * 5 + Math.cos(a) * i * 2.4;
        b.fx('firestorm', px, 0.2, pz, { scale: 1.8, life: 7 });
        b.groundEffect({ x: px, z: pz, r: 2.0, dur: 7, team: c.team, interval: 0.4, decal: 'fire',
          onTick: u => { b.dealDamage(c, u, c.focus * 0.5, 'fire', { silent: true, noCrit: true }); b.applyStatus(u, 'burning', 3, { src: c, dps: c.focus * 0.25 }); } });
      }
      b.sound('fire', c.x, c.z);
    },
  },
  cmdVoidRift: {
    id: 'cmdVoidRift', name: 'Void Rift', icon: '🌀', cd: 24, key: 'R',
    desc: 'Tears a rift that drags everything within 12m into it and roots them for 3s, then collapses for heavy arcane damage.',
    run(b, c) {
      const t = b.nearestEnemy(c, 18) || { x: c.x + Math.cos(c.facing) * 9, z: c.z + Math.sin(c.facing) * 9 };
      b.fx('voidRift', t.x, 0.8, t.z, { scale: 6, life: 3 });
      b.sound('shadow', t.x, t.z);
      for (const e of b.enemiesNear(c, t.x, t.z, 12)) {
        b.pull(e, t.x, t.z, 14);
        if (!e.mods.ccImmune) b.applyStatus(e, 'rooted', 3, { src: c });
      }
      b.castDelayed(c, 3, () => {
        b.fx('arcaneNova', t.x, 0.9, t.z, { scale: 6 });
        b.shake(0.6);
        for (const e of b.enemiesNear(c, t.x, t.z, 6))
          b.dealDamage(c, e, c.focus * 5.5, 'arcane', { isAbility: true });
      });
    },
  },
  cmdBastion: {
    id: 'cmdBastion', name: 'Bastion', icon: '🛡', cd: 28, key: 'R',
    desc: 'Plants the aegis. For 6s, allies within 9m take 60% less damage. You cannot move while it holds.',
    run(b, c) {
      b.fx('bastionDome', c.x, 0, c.z, { scale: 9, life: 6 });
      b.sound('block', c.x, c.z);
      b.applyStatus(c, 'channeling', 6, { src: c });
      b.zoneEffect({ x: c.x, z: c.z, r: 9, dur: 6, team: c.team, friendly: true,
        onTick: u => { u.auraDmgTaken *= 0.4; } });
    },
  },
  cmdBlink: {
    id: 'cmdBlink', name: 'Blink', icon: '💨', cd: 9, key: 'R',
    desc: 'Teleports 10m forward. Arriving behind an enemy makes your next strike a backstab.',
    run(b, c) {
      const nx = c.x + Math.cos(c.facing) * 10, nz = c.z + Math.sin(c.facing) * 10;
      b.fx('smoke', c.x, 0.9, c.z, {});
      b.teleport(c, nx, nz);
      b.fx('smoke', c.x, 0.9, c.z, {});
      c.nextIsBackstab = true;
      b.sound('shadow', c.x, c.z, { vol: 0.5 });
    },
  },
  cmdVanish: {
    id: 'cmdVanish', name: 'Vanish', icon: '🌑', cd: 20, key: 'R',
    desc: 'Vanish for 4s: untargetable, faster, and your next attack is a guaranteed backstab.',
    run(b, c) {
      b.applyStatus(c, 'stealthed', 4, { src: c });
      c.nextIsBackstab = true;
      b.fx('smoke', c.x, 0.9, c.z, { scale: 2 });
      b.sound('shadow', c.x, c.z);
    },
  },
};

/* ==========================================================================
   POTIONS — battle consumables, crafted in the Library
   ========================================================================== */

export const POTIONS = {
  healthPotion: {
    id: 'healthPotion', name: 'Health Draught', icon: '🧪', color: '#c5362b', tier: 1,
    desc: 'Restores 40% of your maximum health instantly.',
    use(b, c) { b.heal(c, c.maxHp * 0.4, c); b.fx('healBurst', c.x, 1.2, c.z, { scale: 1.6 }); b.sound('heal', c.x, c.z); },
  },
  speedPotion: {
    id: 'speedPotion', name: 'Draught of Swiftness', icon: '⚡', color: '#ffd479', tier: 1,
    desc: '+35% move speed and +30% attack speed for 14s.',
    use(b, c) { b.applyStatus(c, 'hastened', 14, { src: c }); b.fx('rallyRing', c.x, 0.3, c.z, { scale: 2 }); },
  },
  strengthPotion: {
    id: 'strengthPotion', name: 'Draught of Wrath', icon: '💪', color: '#e8823a', tier: 1,
    desc: '+45% damage for 16s. Does nothing for your survivability, which is the point.',
    use(b, c) { b.applyStatus(c, 'enraged', 16, { src: c, stacks: 4 }); b.fx('rage', c.x, 1.4, c.z, { scale: 2 }); },
  },
  defensePotion: {
    id: 'defensePotion', name: 'Draught of Stone', icon: '🪨', color: '#8d95a3', tier: 1,
    desc: '+25 armour and immunity to knockback for 18s.',
    use(b, c) { b.applyStatus(c, 'braced', 0.01, { src: c }); b.applyStatus(c, 'fortified', 18, { src: c }); c.tempCcImmune = b.t + 18; },
  },
  magicPotion: {
    id: 'magicPotion', name: 'Draught of Insight', icon: '🔮', color: '#9a6fe0', tier: 2,
    desc: 'Ability cooldowns reset immediately and run 40% faster for 12s.',
    use(b, c) { c.resetCooldowns(); b.applyStatus(c, 'empowered', 12, { src: c, stacks: 3 }); c.tempCdr = { until: b.t + 12, v: 0.4 }; b.fx('arcaneNova', c.x, 1.2, c.z, { scale: 2 }); },
  },
  commandPotion: {
    id: 'commandPotion', name: 'Banner Elixir', icon: '🚩', color: '#d9a441', tier: 2,
    desc: 'Instantly grants 4 Command. The most expensive four Command you will ever spend, and sometimes the only ones.',
    use(b, c) { b.grantCommand(c.team, 4); b.fx('rallyRing', c.x, 0.3, c.z, { scale: 3, color: 0xd9a441 }); b.sound('coin', c.x, c.z); },
  },
  antidote: {
    id: 'antidote', name: 'Antidote', icon: '🍀', color: '#8fbf4a', tier: 2,
    desc: 'Removes every debuff on you and grants 10s of immunity to poison and curses.',
    use(b, c) { b.cleanse(c); c.debuffImmuneUntil = b.t + 10; b.fx('healBurst', c.x, 1.2, c.z, { scale: 1.4 }); },
  },
  phoenixTonic: {
    id: 'phoenixTonic', name: 'Phoenix Tonic', icon: '🔥', color: '#ff8a3a', tier: 3,
    desc: 'Heals you to full, cleanses everything, and burns everything within 8m for heavy fire damage.',
    use(b, c) {
      b.heal(c, c.maxHp, c); b.cleanse(c);
      b.fx('phoenixBurst', c.x, 1.2, c.z, { scale: 8 }); b.sound('fire', c.x, c.z); b.shake(0.5);
      for (const e of b.enemiesNear(c, c.x, c.z, 8)) {
        b.dealDamage(c, e, c.focus * 4 + 200, 'fire', { isAbility: true });
        b.applyStatus(e, 'burning', 8, { src: c, dps: 30 });
      }
    },
  },
};

/* ------------------------------------------------------------------ helpers */

export const getItem = id => ITEMS[id];
export const getPotion = id => POTIONS[id];
export const ITEM_LIST = Object.values(ITEMS);

/** Item stats at a given upgrade level. +11% per level, compounding. */
export function itemStatsAt(item, level = 1) {
  const m = Math.pow(1.11, level - 1);
  const out = {};
  for (const k in item.stats) {
    // weight does not grow — upgrading your plate does not make it heavier
    out[k] = k === 'weight' ? item.stats[k] : Math.round(item.stats[k] * m);
  }
  return out;
}

/** Gold + materials to take an item from `level` to `level+1`. */
export function itemUpgradeCost(item, level) {
  const tierMats = { 1: ['iron', 'oak'], 2: ['steel', 'leather'], 3: ['dragonbone', 'runestone'], 4: ['crownshard', 'starIron'] }[item.tier] || ['iron'];
  const n = Math.ceil(2 + level * 1.3);
  const cost = { gold: Math.round(120 * Math.pow(1.42, level - 1) * item.tier) };
  for (const m of tierMats) cost[m] = n;
  return cost;
}

/** Roll up the whole equipped set into one stat bundle. */
export function aggregateStats(equipped, itemLevels = {}) {
  const total = { might: 0, focus: 0, vigor: 0, armor: 0, haste: 0, weight: 0 };
  const specials = {};
  for (const slot of SLOT_ORDER) {
    const id = equipped[slot];
    if (!id) continue;
    const item = ITEMS[id];
    if (!item) continue;
    const st = itemStatsAt(item, itemLevels[id] || 1);
    for (const k in st) total[k] = (total[k] || 0) + st[k];
    if (item.special) {
      for (const k in item.special) {
        const v = item.special[k];
        if (typeof v === 'number') specials[k] = (specials[k] || 0) + v;
        else specials[k] = v;
      }
    }
  }
  return { total, specials };
}

/** Can this item go in this slot with this weapon equipped? */
export function canEquip(item, slot, equipped) {
  if (!item) return false;
  const slotDef = SLOTS[slot];
  if (item.family === 'trinket') return slotDef.family === 'trinket';
  if (item.slot !== slot) return false;
  if (item.requires?.notWclass) {
    const w = ITEMS[equipped.weapon];
    if (w && item.requires.notWclass.includes(w.wclass)) return false;
  }
  return true;
}

/** Starting kit — deliberately poor, so the first forge upgrade feels good. */
export const STARTER_KIT = {
  weapon: 'ironSword', offhand: 'woodShield', head: 'ironHelm',
  chest: 'ironPlate', hands: 'leatherGloves', feet: 'leatherBoots',
};
