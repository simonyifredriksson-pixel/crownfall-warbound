import { ic } from '../art/Icons.js';
/* Units.js — the card roster and every fielded creature in the game.

   One table drives everything: the collection UI, the battle sim, the enemy
   armies, the codex and the procedural model builder. Adding a unit means
   adding one entry here; nothing else needs to know it exists.

   FIELDS
     id           stable key (save data references this — never rename)
     name         display
     rarity       common | uncommon | rare | epic | legendary | mythic
     cost         Command to deploy (1..9)
     count        how many bodies arrive per deployment
     role         drives AI behaviour, see ROLES below
     hp/dmg       level-1 values; scaled by CFG.cards.statGrowth
     atkSpeed     attacks per second
     range        metres; <= 2.2 counts as melee
     moveSpeed    metres/second
     mass         1 small · 2 medium · 3 large · 4 huge · 5 colossal
                  (mass gates knockback, trample and anti-large bonuses)
     armor        flat armour rating
     dmgType      slash pierce blunt arcane fire frost poison holy shadow
     armorType    unarmored light heavy magical beast undead structure
     abilities    ids from Abilities.js, in unlock order
     tags         free-form: used by synergies, codex filters and AI
     art          instructions for UnitArt.js
     lore         flavour, shown on the card back
     collectible  false = enemy-only / summon; never appears in your collection

   ROLES
     guardian  holds the line, advances slowly, protects what is behind it
     melee     advances and engages the nearest threat
     ranged    keeps its distance, prefers high ground, kites when closed on
     caster    ranged but uses abilities as its main damage, very fragile
     support   stays behind the line, heals and buffs, never advances alone
     assassin  flanks wide, ignores the frontline, hunts soft targets
     siege     targets structures, ignores units until they block it
     summoner  hangs back and produces bodies
     beast     fast, aggressive, packs
     flyer     ignores terrain and ground blockers
     cavalry   charges, wants open ground
*/

export const ROLE_INFO = {
  guardian: { name: 'Guardian', icon: ic('shield'), blurb: 'Holds ground and shields what stands behind it.' },
  melee:    { name: 'Melee',    icon: ic('swords'), blurb: 'Closes the distance and fights in the press.' },
  ranged:   { name: 'Ranged',   icon: ic('bow'), blurb: 'Kills from a distance; dies fast if reached.' },
  caster:   { name: 'Caster',   icon: ic('orb'), blurb: 'Abilities are the weapon. Protect it.' },
  support:  { name: 'Support',  icon: ic('heal'), blurb: 'Keeps the line alive. Kill it first.' },
  assassin: { name: 'Assassin', icon: ic('dagger'), blurb: 'Goes around the wall, not through it.' },
  siege:    { name: 'Siege',    icon: ic('siege'), blurb: 'Breaks structures. Helpless alone.' },
  summoner: { name: 'Summoner', icon: ic('coffin'), blurb: 'Turns time into bodies.' },
  beast:    { name: 'Beast',    icon: ic('wolf'), blurb: 'Fast, savage, better in numbers.' },
  flyer:    { name: 'Flyer',    icon: ic('wing'), blurb: 'Ignores the ground war entirely.' },
  cavalry:  { name: 'Cavalry',  icon: ic('horse'), blurb: 'Needs room to run. Devastating when it gets it.' },
};

/* Shorthand so the table below stays readable. */
const U = (o) => ({
  count: 1, mass: 2, armor: 0, sight: 14, collectible: true, abilities: [], tags: [],
  faction: 'crown', ...o,
});

export const UNITS = {

  /* =======================================================================
     ═══ STARTERS ═══
     Deliberately mediocre at level 1. They are the spine of your first ten
     hours and every one of them becomes frightening once awakened.
     ======================================================================= */

  knight: U({
    id: 'knight', name: 'Knight', rarity: 'common', cost: 3, role: 'guardian',
    hp: 520, dmg: 38, atkSpeed: 0.85, range: 1.9, moveSpeed: 3.4, mass: 2, armor: 14,
    dmgType: 'slash', armorType: 'heavy',
    abilities: ['shieldBrace', 'holdTheLine', 'vengefulGuard', 'lastStand'],
    tags: ['human', 'shieldwall', 'frontline', 'starter'],
    art: { archetype: 'humanoid', build: 'heavy', primary: 0x6d7789, accent: 0x2f5f8f, metal: 0xb8c0cc, weapon: 'sword', shield: 'kite', helm: 'great', cape: 0x2f5f8f, scale: 1.0 },
    lore: 'Third son of a minor house, which is to say: a man with good armour and no inheritance. He will hold a bridge until you tell him to stop.',
  }),

  mage: U({
    id: 'mage', name: 'Mage', rarity: 'common', cost: 4, role: 'caster',
    hp: 210, dmg: 30, atkSpeed: 0.7, range: 12.5, moveSpeed: 3.1, mass: 1, armor: 0,
    dmgType: 'arcane', armorType: 'unarmored',
    abilities: ['arcaneNova', 'manaShield', 'emberbolt', 'elementalMastery'],
    tags: ['human', 'caster', 'aoe', 'starter'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x3b3f7a, accent: 0x9a6fe0, metal: 0xd9c98a, weapon: 'staff', robe: true, hood: true, glow: 0x9a6fe0, scale: 0.98 },
    lore: 'She left the Library over a disagreement about whether fire counts as a research method. The Wizard still writes to her.',
  }),

  giant: U({
    id: 'giant', name: 'Giant', rarity: 'common', cost: 6, role: 'melee',
    hp: 1750, dmg: 105, atkSpeed: 0.45, range: 2.6, moveSpeed: 2.3, mass: 4, armor: 6,
    dmgType: 'blunt', armorType: 'heavy',
    abilities: ['groundSlam', 'wallbreaker', 'unstoppable', 'titanfall'],
    tags: ['giant', 'frontline', 'siege', 'starter'],
    art: { archetype: 'giant', build: 'huge', primary: 0x8a7a63, accent: 0x4a3f33, metal: 0x77705f, weapon: 'club', scale: 2.15 },
    lore: 'Hill-born, slow to anger and slower to stop. Pays for his own beer, which is more than most soldiers manage.',
  }),

  /* =======================================================================
     ═══ COMMON ═══
     ======================================================================= */

  militia: U({
    id: 'militia', name: 'Militia', rarity: 'common', cost: 2, role: 'melee', count: 3,
    hp: 140, dmg: 22, atkSpeed: 1.1, range: 1.7, moveSpeed: 4.1, mass: 1, armor: 2,
    dmgType: 'slash', armorType: 'light',
    abilities: ['swarmTactics'],
    tags: ['human', 'swarm', 'cheap'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x6a5c44, accent: 0x8a3a30, metal: 0x9aa0aa, weapon: 'shortsword', helm: 'cap', scale: 0.9 },
    lore: 'Farmers with spears they were given yesterday. Three of them cost less than one knight and, in the right place, do more.',
  }),

  archer: U({
    id: 'archer', name: 'Archer', rarity: 'common', cost: 3, role: 'ranged', count: 2,
    hp: 155, dmg: 31, atkSpeed: 1.0, range: 14, moveSpeed: 3.7, mass: 1, armor: 1,
    dmgType: 'pierce', armorType: 'light',
    abilities: ['volley', 'highGround', 'pinningShot'],
    tags: ['human', 'ranged', 'backline'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x3f5a3a, accent: 0x6a4a2a, metal: 0x9aa0aa, weapon: 'bow', helm: 'hood', scale: 0.94 },
    lore: 'Two shillings a day and all the arrows they can carry. Put them on the ridge and the ridge becomes the battle.',
  }),

  spearman: U({
    id: 'spearman', name: 'Spearman', rarity: 'common', cost: 3, role: 'guardian', count: 2,
    hp: 290, dmg: 34, atkSpeed: 0.8, range: 2.9, moveSpeed: 3.5, mass: 2, armor: 7,
    dmgType: 'pierce', armorType: 'light',
    abilities: ['braceForCharge', 'phalanx'],
    tags: ['human', 'shieldwall', 'antilarge', 'frontline'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x5a6a7a, accent: 0x9a7a3a, metal: 0xa8b0bc, weapon: 'spear', shield: 'round', helm: 'kettle', scale: 0.96 },
    lore: 'The answer to cavalry, giants and anything else that thinks charging is a plan. Keep them in a line or they are just men with sticks.',
  }),

  scout: U({
    id: 'scout', name: 'Scout', rarity: 'common', cost: 2, role: 'ranged',
    hp: 130, dmg: 20, atkSpeed: 1.3, range: 10, moveSpeed: 6.2, mass: 1, armor: 0,
    dmgType: 'pierce', armorType: 'unarmored',
    abilities: ['scout'],
    tags: ['human', 'fast', 'utility', 'capture'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x4a5a3a, accent: 0x6a5a3a, metal: 0x8a9098, weapon: 'dagger', helm: 'hood', cloak: 0x3a4a2f, scale: 0.88 },
    lore: 'Fast, cheap, and the only unit in your army who reliably comes back. Excellent at taking ground nobody is defending yet.',
  }),

  sapper: U({
    id: 'sapper', name: 'Sapper', rarity: 'common', cost: 3, role: 'siege',
    hp: 175, dmg: 26, atkSpeed: 0.7, range: 1.6, moveSpeed: 4.4, mass: 1, armor: 2,
    dmgType: 'blunt', armorType: 'light',
    abilities: ['sabotage'],
    tags: ['human', 'siege', 'suicide'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x5a4a3a, accent: 0xc25a2a, metal: 0x8a8070, weapon: 'keg', helm: 'cap', scale: 0.92 },
    lore: 'Carries forty pounds of black powder toward a wall, whistling. Nobody asks him to come back.',
  }),

  /* =======================================================================
     ═══ UNCOMMON ═══
     ======================================================================= */

  shieldbearer: U({
    id: 'shieldbearer', name: 'Shieldbearer', rarity: 'uncommon', cost: 4, role: 'guardian',
    hp: 1150, dmg: 26, atkSpeed: 0.7, range: 1.8, moveSpeed: 2.8, mass: 3, armor: 22,
    dmgType: 'blunt', armorType: 'heavy',
    abilities: ['taunt', 'bulwark', 'thornplate'],
    tags: ['human', 'shieldwall', 'frontline', 'tank'],
    art: { archetype: 'humanoid', build: 'heavy', primary: 0x4a5260, accent: 0xc0a040, metal: 0xc8ced8, weapon: 'mace', shield: 'tower', helm: 'great', scale: 1.06 },
    lore: 'Carries a door into battle and hides behind it. This is a more sophisticated strategy than it sounds.',
  }),

  crossbowman: U({
    id: 'crossbowman', name: 'Crossbowman', rarity: 'uncommon', cost: 4, role: 'ranged', count: 2,
    hp: 175, dmg: 62, atkSpeed: 0.42, range: 16, moveSpeed: 3.2, mass: 1, armor: 4,
    dmgType: 'pierce', armorType: 'light',
    abilities: ['highGround'],
    tags: ['human', 'ranged', 'armorpierce', 'backline'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x4a4a5a, accent: 0x8a2a2a, metal: 0xa0a8b4, weapon: 'crossbow', helm: 'kettle', scale: 0.96 },
    lore: 'Slow to load, and it does not matter. A bolt at thirty paces goes through plate, the man inside, and a good deal of his opinion about plate.',
    pierceArmor: 0.5,
  }),

  battlePriest: U({
    id: 'battlePriest', name: 'Battle Priest', rarity: 'uncommon', cost: 4, role: 'support',
    hp: 330, dmg: 28, atkSpeed: 0.75, range: 8, moveSpeed: 3.3, mass: 2, armor: 8,
    dmgType: 'holy', armorType: 'light',
    abilities: ['mendWounds', 'sanctuary', 'purge', 'martyrdom'],
    tags: ['human', 'healer', 'holy', 'backline'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0xe8e0cc, accent: 0xd9a441, metal: 0xd9c98a, weapon: 'mace', robe: true, glow: 0xf3d98a, scale: 0.98 },
    lore: 'Believes firmly in mercy and carries a mace in case of disagreement. Pair one with a guardian and watch the enemy run out of patience.',
  }),

  houndPack: U({
    id: 'houndPack', name: 'Hound Pack', rarity: 'uncommon', cost: 3, role: 'beast', count: 3,
    hp: 175, dmg: 30, atkSpeed: 1.25, range: 1.5, moveSpeed: 6.8, mass: 1, armor: 2,
    dmgType: 'slash', armorType: 'beast',
    abilities: ['packHunter', 'pounce'],
    tags: ['beast', 'fast', 'antiranged'],
    art: { archetype: 'beast4', primary: 0x5a4a3a, accent: 0x2a2018, scale: 0.8 },
    lore: 'They do not understand formations, chokepoints or orders. They understand that the archers are over there.',
  }),

  oilFlinger: U({
    id: 'oilFlinger', name: 'Oil Flinger', rarity: 'uncommon', cost: 3, role: 'ranged',
    hp: 200, dmg: 14, atkSpeed: 0.5, range: 13, moveSpeed: 3.2, mass: 1, armor: 2,
    dmgType: 'blunt', armorType: 'light',
    abilities: ['slickOil'],
    tags: ['human', 'support', 'oil', 'combo'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x4a3f2a, accent: 0x6a5a2a, metal: 0x8a8070, weapon: 'flask', helm: 'cap', scale: 0.93 },
    lore: 'Does almost no damage. Doubles the damage of every fire unit you own. Nobody writes songs about the oil flinger.',
  }),

  pikewall: U({
    id: 'pikewall', name: 'Pikewall', rarity: 'uncommon', cost: 5, role: 'guardian', count: 3,
    hp: 330, dmg: 40, atkSpeed: 0.7, range: 3.4, moveSpeed: 2.9, mass: 2, armor: 10,
    dmgType: 'pierce', armorType: 'heavy',
    abilities: ['braceForCharge', 'phalanx', 'holdTheLine'],
    tags: ['human', 'shieldwall', 'antilarge', 'frontline'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x4a5464, accent: 0xb8a050, metal: 0xb0b8c4, weapon: 'pike', helm: 'kettle', scale: 1.0 },
    lore: 'Three of them are a wall. Two of them are a suggestion. One of them is a man holding a very long stick, alone, in a field.',
  }),

  firebomber: U({
    id: 'firebomber', name: 'Firebomber', rarity: 'uncommon', cost: 4, role: 'ranged',
    hp: 185, dmg: 44, atkSpeed: 0.45, range: 12, moveSpeed: 3.0, mass: 1, armor: 1,
    dmgType: 'fire', armorType: 'light',
    abilities: ['firestorm'],
    tags: ['human', 'fire', 'aoe', 'combo'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x6a3a2a, accent: 0xe8823a, metal: 0x9a8070, weapon: 'flask', helm: 'cap', glow: 0xe8823a, scale: 0.94 },
    splash: 2.8,
    lore: 'Throws pots of burning pitch with the casual accuracy of a man who has done it four hundred times and never once been thanked.',
  }),

  ranger: U({
    id: 'ranger', name: 'Ranger', rarity: 'uncommon', cost: 4, role: 'ranged',
    hp: 205, dmg: 40, atkSpeed: 0.95, range: 15.5, moveSpeed: 4.6, mass: 1, armor: 3,
    dmgType: 'pierce', armorType: 'light',
    abilities: ['highGround', 'pinningShot'],
    tags: ['human', 'ranged', 'mark', 'combo'],
    onHitStatus: { id: 'marked', dur: 5 },
    art: { archetype: 'humanoid', build: 'slim', primary: 0x3a4a34, accent: 0x7a5a2a, metal: 0x98a0aa, weapon: 'longbow', helm: 'hood', cloak: 0x2f3f2a, scale: 0.96 },
    lore: 'Marks a target and everything you own shoots it. The marking is the point; the arrow is a formality.',
  }),

  /* =======================================================================
     ═══ RARE ═══
     ======================================================================= */

  paladin: U({
    id: 'paladin', name: 'Paladin', rarity: 'rare', cost: 5, role: 'guardian',
    hp: 980, dmg: 66, atkSpeed: 0.75, range: 2.0, moveSpeed: 3.2, mass: 3, armor: 20,
    dmgType: 'holy', armorType: 'heavy',
    abilities: ['sanctuary', 'holdTheLine', 'purge', 'lastStand'],
    tags: ['human', 'holy', 'frontline', 'antiundead'],
    art: { archetype: 'humanoid', build: 'heavy', primary: 0xd8d0bc, accent: 0xd9a441, metal: 0xe8e0c8, weapon: 'greatsword', shield: 'kite', helm: 'winged', cape: 0xd9a441, glow: 0xf3d98a, scale: 1.08 },
    lore: 'Holy damage does double against the undead, which makes her worth six of anyone else in Hollowmere and merely very good everywhere else.',
  }),

  frostMage: U({
    id: 'frostMage', name: 'Frost Mage', rarity: 'rare', cost: 4, role: 'caster',
    hp: 230, dmg: 26, atkSpeed: 0.8, range: 13, moveSpeed: 3.1, mass: 1, armor: 0,
    dmgType: 'frost', armorType: 'unarmored',
    abilities: ['frostbite', 'manaShield', 'blizzard'],
    tags: ['human', 'caster', 'control', 'combo'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x2a4a6a, accent: 0x79cfe0, metal: 0xc8e8f0, weapon: 'staff', robe: true, hood: true, glow: 0x79cfe0, scale: 0.98 },
    lore: 'Does not kill things quickly. Makes sure everything else does.',
  }),

  assassin: U({
    id: 'assassin', name: 'Assassin', rarity: 'rare', cost: 4, role: 'assassin',
    hp: 260, dmg: 78, atkSpeed: 1.15, range: 1.6, moveSpeed: 6.4, mass: 1, armor: 3,
    dmgType: 'shadow', armorType: 'unarmored',
    abilities: ['shadowstep', 'markTheWeak', 'vanish', 'exsanguinate', 'deathmark'],
    tags: ['human', 'stealth', 'antibackline'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x1f2028, accent: 0x7a4fa0, metal: 0x6a7080, weapon: 'twinblades', helm: 'hood', cloak: 0x14151b, scale: 0.92 },
    lore: 'Goes around your wall. Every point of armour on your frontline is a point that does nothing about her.',
  }),

  catapult: U({
    id: 'catapult', name: 'Catapult', rarity: 'rare', cost: 5, role: 'siege',
    hp: 420, dmg: 130, atkSpeed: 0.22, range: 22, moveSpeed: 1.7, mass: 3, armor: 5,
    dmgType: 'blunt', armorType: 'structure',
    abilities: ['siegeShot', 'minimumRange', 'ranging'],
    tags: ['siege', 'artillery', 'backline'],
    splash: 3.6,
    art: { archetype: 'siege', variant: 'catapult', primary: 0x6a5a40, accent: 0x8a7050, metal: 0x8a9098, scale: 1.3 },
    lore: 'Cannot hit anything within eight metres and will not try. Guard it or lose it; those are the only two options.',
  }),

  berserker: U({
    id: 'berserker', name: 'Berserker', rarity: 'rare', cost: 4, role: 'melee',
    hp: 560, dmg: 60, atkSpeed: 1.0, range: 1.9, moveSpeed: 4.8, mass: 2, armor: 4,
    dmgType: 'slash', armorType: 'light',
    abilities: ['bloodlust', 'whirlwind', 'execute', 'riposte'],
    tags: ['human', 'frontline', 'scaling'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x8a4a3a, accent: 0xc5362b, metal: 0xa89080, weapon: 'twinaxes', bare: true, scale: 1.04 },
    lore: 'Fights better the closer he is to dying, which he considers a feature. Healing him is, counter-intuitively, a nerf.',
  }),

  griffonRider: U({
    id: 'griffonRider', name: 'Griffon Rider', rarity: 'rare', cost: 5, role: 'flyer',
    hp: 480, dmg: 58, atkSpeed: 0.9, range: 1.8, moveSpeed: 7.2, mass: 2, armor: 6,
    dmgType: 'slash', armorType: 'beast',
    abilities: ['flying', 'diveAttack'],
    tags: ['beast', 'flyer', 'antibackline'],
    art: { archetype: 'flyer', variant: 'griffon', primary: 0xc8a860, accent: 0x8a6a3a, metal: 0xa8b0bc, rider: true, scale: 1.25 },
    lore: 'Terrain does not apply. Chokepoints do not apply. Your carefully-placed spear wall does not apply.',
  }),

  necromancer: U({
    id: 'necromancer', name: 'Necromancer', rarity: 'rare', cost: 5, role: 'summoner',
    hp: 280, dmg: 24, atkSpeed: 0.6, range: 11, moveSpeed: 2.9, mass: 1, armor: 2,
    dmgType: 'shadow', armorType: 'unarmored',
    abilities: ['raiseDead', 'summonSkeletons', 'soulHarvest', 'corpseExplosion'],
    tags: ['undeadlord', 'summoner', 'backline', 'attrition'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x2a2434, accent: 0x7a4fa0, metal: 0x6a6070, weapon: 'staff', robe: true, hood: true, glow: 0x9a6fe0, scale: 0.98 },
    lore: 'Every corpse on the field is a resource, including yours. Especially yours.',
  }),

  warden: U({
    id: 'warden', name: 'Warden', rarity: 'rare', cost: 4, role: 'caster',
    hp: 360, dmg: 34, atkSpeed: 0.7, range: 10, moveSpeed: 3.2, mass: 2, armor: 6,
    dmgType: 'poison', armorType: 'light',
    abilities: ['entangle', 'regrowth'],
    tags: ['nature', 'control', 'combo'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x3a5a3a, accent: 0x8fbf4a, metal: 0x7a8a6a, weapon: 'staff', robe: true, glow: 0x8fbf4a, scale: 1.0 },
    lore: 'Turns open ground into a swamp and a bridge into a wall. Archers adore her.',
  }),

  standardBearer: U({
    id: 'standardBearer', name: 'Standard Bearer', rarity: 'rare', cost: 3, role: 'support',
    hp: 420, dmg: 30, atkSpeed: 0.7, range: 1.9, moveSpeed: 3.3, mass: 2, armor: 10,
    dmgType: 'slash', armorType: 'heavy',
    abilities: ['warBanner', 'logistics'],
    tags: ['human', 'banner', 'aura', 'frontline'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x5a4a6a, accent: 0xd9a441, metal: 0xb0b8c4, weapon: 'banner', helm: 'great', cape: 0xd9a441, scale: 1.02 },
    lore: 'Holds a flag. The flag is worth more than his sword, and he knows it, and he is fine with that.',
  }),

  /* =======================================================================
     ═══ EPIC ═══
     ======================================================================= */

  arcaneGolem: U({
    id: 'arcaneGolem', name: 'Arcane Golem', rarity: 'epic', cost: 6, role: 'guardian',
    hp: 1850, dmg: 88, atkSpeed: 0.5, range: 2.3, moveSpeed: 2.5, mass: 4, armor: 18,
    dmgType: 'arcane', armorType: 'magical',
    abilities: ['reflectSpells', 'antimagic', 'unstoppable'],
    tags: ['construct', 'frontline', 'anticaster'],
    art: { archetype: 'golem', primary: 0x4a4a6a, accent: 0x9a6fe0, metal: 0x8a90a8, glow: 0x9a6fe0, scale: 1.7 },
    lore: 'Its skin is one continuous rune. Throw a fireball at it and the fireball comes back with interest and an apology.',
  }),

  dragoon: U({
    id: 'dragoon', name: 'Dragoon', rarity: 'epic', cost: 5, role: 'cavalry',
    hp: 760, dmg: 72, atkSpeed: 0.8, range: 2.6, moveSpeed: 7.4, mass: 3, armor: 14,
    dmgType: 'pierce', armorType: 'heavy',
    abilities: ['charge', 'momentum', 'trample'],
    tags: ['human', 'cavalry', 'mobile'],
    art: { archetype: 'cavalry', primary: 0x5a3a4a, accent: 0xd9a441, metal: 0xc0c8d4, weapon: 'lance', helm: 'winged', cape: 0x8a2a3a, scale: 1.35 },
    lore: 'Give her twenty metres of open ground and she will delete a line of archers. Give her a bridge and she is an expensive horse.',
  }),

  stormCaller: U({
    id: 'stormCaller', name: 'Storm Caller', rarity: 'epic', cost: 5, role: 'caster',
    hp: 275, dmg: 34, atkSpeed: 0.65, range: 14, moveSpeed: 3.0, mass: 1, armor: 0,
    dmgType: 'arcane', armorType: 'unarmored',
    abilities: ['chainLightning', 'manaShield', 'empoweredCast'],
    tags: ['caster', 'aoe', 'antiswarm'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x2a3a5a, accent: 0x9fd0ff, metal: 0xc8d8f0, weapon: 'staff', robe: true, glow: 0x9fd0ff, scale: 1.0 },
    lore: 'Punishes tight formations. The enemy learns to spread out, which is itself a kind of victory.',
  }),

  trebuchet: U({
    id: 'trebuchet', name: 'Trebuchet', rarity: 'epic', cost: 7, role: 'siege',
    hp: 520, dmg: 240, atkSpeed: 0.13, range: 34, moveSpeed: 1.2, mass: 4, armor: 6,
    dmgType: 'blunt', armorType: 'structure',
    abilities: ['siegeShot', 'minimumRange', 'ranging', 'crewed'],
    tags: ['siege', 'artillery', 'backline'],
    splash: 5.0, minRange: 12,
    art: { archetype: 'siege', variant: 'trebuchet', primary: 0x5a4a34, accent: 0x8a7050, metal: 0x7a8088, scale: 1.7 },
    lore: 'Can hit the enemy banner from your own deployment line. Cannot hit anything within twelve metres, including the man currently setting it on fire.',
  }),

  shadowStalker: U({
    id: 'shadowStalker', name: 'Shadow Stalker', rarity: 'epic', cost: 5, role: 'assassin',
    hp: 420, dmg: 96, atkSpeed: 1.0, range: 1.7, moveSpeed: 6.0, mass: 2, armor: 5,
    dmgType: 'shadow', armorType: 'unarmored',
    abilities: ['shadowstep', 'markTheWeak', 'vanish', 'deathmark'],
    tags: ['shadow', 'stealth', 'antibackline', 'elite'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x14151d, accent: 0xb07fd0, metal: 0x4a4a5a, weapon: 'scythe', helm: 'hood', cloak: 0x0d0e14, glow: 0xb07fd0, scale: 1.05 },
    lore: 'Teleports behind whichever of your units is most annoying. Shadow damage is strong against heavy armour and magical wards alike, so there is no correct thing to protect.',
  }),

  treant: U({
    id: 'treant', name: 'Treant', rarity: 'epic', cost: 6, role: 'guardian',
    hp: 2400, dmg: 78, atkSpeed: 0.42, range: 2.8, moveSpeed: 1.9, mass: 4, armor: 12,
    dmgType: 'blunt', armorType: 'beast',
    abilities: ['regrowth', 'entangle', 'unstoppable'],
    tags: ['nature', 'frontline', 'control'],
    weakness: 'fire',
    art: { archetype: 'treant', primary: 0x4a3f2a, accent: 0x5fa25a, scale: 2.0 },
    lore: 'Regenerates faster than most armies can whittle it down. Bring fire. It takes 35% more from fire and it knows it.',
  }),

  inquisitor: U({
    id: 'inquisitor', name: 'Inquisitor', rarity: 'epic', cost: 5, role: 'support',
    hp: 560, dmg: 54, atkSpeed: 0.8, range: 7, moveSpeed: 3.4, mass: 2, armor: 12,
    dmgType: 'holy', armorType: 'magical',
    abilities: ['silence', 'antimagic', 'purge'],
    tags: ['holy', 'anticaster', 'elite'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x8a1a2a, accent: 0xd9c98a, metal: 0xc8c0a8, weapon: 'censer', robe: true, hood: true, glow: 0xf3d98a, scale: 1.04 },
    lore: 'Walks into a caster line and turns it off. Entire enemy compositions stop functioning; she does not even need to draw her weapon.',
  }),

  wyvern: U({
    id: 'wyvern', name: 'Wyvern', rarity: 'epic', cost: 6, role: 'flyer',
    hp: 820, dmg: 64, atkSpeed: 0.7, range: 2.2, moveSpeed: 6.6, mass: 3, armor: 8,
    dmgType: 'poison', armorType: 'beast',
    abilities: ['flying', 'venomBreath', 'diveAttack'],
    tags: ['beast', 'flyer', 'poison', 'aoe'],
    art: { archetype: 'flyer', variant: 'wyvern', primary: 0x3a5a3a, accent: 0x8fbf4a, scale: 1.7 },
    lore: 'Poison does almost nothing to the undead and murders everything alive. Read the enemy roster before you spend six Command on it.',
  }),

  batteringRam: U({
    id: 'batteringRam', name: 'Battering Ram', rarity: 'epic', cost: 6, role: 'siege',
    hp: 1400, dmg: 165, atkSpeed: 0.35, range: 2.4, moveSpeed: 2.2, mass: 4, armor: 16,
    dmgType: 'blunt', armorType: 'structure',
    abilities: ['crewed', 'wallbreaker', 'unstoppable'],
    tags: ['siege', 'frontline', 'antistructure'],
    art: { archetype: 'siege', variant: 'ram', primary: 0x4a3a2a, accent: 0x8a7050, metal: 0x8a9098, scale: 1.5 },
    lore: 'Ignores your soldiers completely and walks to the banner. You cannot ignore it back.',
  }),

  /* =======================================================================
     ═══ LEGENDARY ═══
     ======================================================================= */

  archmage: U({
    id: 'archmage', name: 'Seraphel, Archmage', rarity: 'legendary', cost: 7, role: 'caster',
    hp: 380, dmg: 46, atkSpeed: 0.6, range: 17, moveSpeed: 2.9, mass: 1, armor: 2,
    dmgType: 'arcane', armorType: 'magical',
    abilities: ['meteor', 'manaShield', 'chainLightning', 'elementalMastery'],
    tags: ['caster', 'aoe', 'legendary', 'nuke'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x1f2a5a, accent: 0xffd479, metal: 0xe8d8a0, weapon: 'archstaff', robe: true, crown: true, glow: 0xffd479, aura: 0x9a6fe0, scale: 1.1 },
    lore: 'The Wizard\'s old rival, and the reason the Library has a rule about summoning indoors. Seven Command buys you one meteor, and one meteor is usually enough.',
  }),

  ironColossus: U({
    id: 'ironColossus', name: 'Iron Colossus', rarity: 'legendary', cost: 8, role: 'melee',
    hp: 4200, dmg: 190, atkSpeed: 0.38, range: 3.2, moveSpeed: 1.8, mass: 5, armor: 30,
    dmgType: 'blunt', armorType: 'heavy',
    abilities: ['quake', 'unstoppable', 'wallbreaker', 'reflectSpells'],
    tags: ['construct', 'frontline', 'siege', 'legendary'],
    art: { archetype: 'golem', variant: 'iron', primary: 0x55606e, accent: 0xd9a441, metal: 0x9aa4b4, glow: 0xe8823a, scale: 2.5 },
    lore: 'Twenty tonnes of forged war. It will reach your banner. The only real question is how much of your army is left when it does.',
  }),

  phoenix: U({
    id: 'phoenix', name: 'Phoenix', rarity: 'legendary', cost: 6, role: 'flyer',
    hp: 700, dmg: 72, atkSpeed: 0.85, range: 7, moveSpeed: 7.0, mass: 2, armor: 4,
    dmgType: 'fire', armorType: 'magical',
    abilities: ['flying', 'rebirth', 'firestorm', 'everburning'],
    tags: ['fire', 'flyer', 'legendary', 'combo'],
    art: { archetype: 'flyer', variant: 'phoenix', primary: 0xe8823a, accent: 0xffd479, glow: 0xff8a3a, scale: 1.5 },
    lore: 'Dies once for free. Pair it with an Oil Flinger and the free death becomes an extermination.',
  }),

  lichKing: U({
    id: 'lichKing', name: 'Morvant, Lich King', rarity: 'legendary', cost: 8, role: 'summoner',
    hp: 1100, dmg: 58, atkSpeed: 0.55, range: 13, moveSpeed: 2.4, mass: 3, armor: 14,
    dmgType: 'shadow', armorType: 'undead',
    abilities: ['immortalHost', 'raiseDead', 'corpseExplosion', 'summonSkeletons'],
    tags: ['undeadlord', 'summoner', 'legendary', 'attrition'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x2a2438, accent: 0x79cfe0, metal: 0x8a90a0, weapon: 'archstaff', robe: true, crown: true, skull: true, glow: 0x79cfe0, aura: 0x4a3a6a, scale: 1.2 },
    lore: 'Wins battles by not ending them. Every minute that passes, he has more soldiers and you have fewer.',
  }),

  sunblade: U({
    id: 'sunblade', name: 'Sunblade Champion', rarity: 'legendary', cost: 6, role: 'melee',
    hp: 1250, dmg: 145, atkSpeed: 0.95, range: 2.2, moveSpeed: 4.6, mass: 3, armor: 22,
    dmgType: 'holy', armorType: 'heavy',
    abilities: ['sunblade', 'execute', 'riposte', 'whirlwind'],
    tags: ['holy', 'duellist', 'legendary', 'antiundead'],
    art: { archetype: 'humanoid', build: 'heavy', primary: 0xf0e4c4, accent: 0xffd479, metal: 0xffe9a8, weapon: 'sunsword', helm: 'winged', cape: 0xffd479, glow: 0xffd479, aura: 0xf3d98a, scale: 1.2 },
    lore: 'One woman who beats entire undead armies by herself and heals your line while doing it. In Hollowmere she is not a card, she is a policy.',
  }),

  krakenSpawn: U({
    id: 'krakenSpawn', name: 'Kraken Spawn', rarity: 'legendary', cost: 7, role: 'guardian',
    hp: 2600, dmg: 84, atkSpeed: 0.6, range: 4.2, moveSpeed: 1.6, mass: 5, armor: 10,
    dmgType: 'blunt', armorType: 'beast',
    abilities: ['tentacles', 'unstoppable', 'thornplate'],
    tags: ['beast', 'control', 'legendary', 'antiranged'],
    art: { archetype: 'kraken', primary: 0x2a4a5a, accent: 0x5aa6d8, glow: 0x79cfe0, scale: 2.2 },
    lore: 'Drags your archers into the water. There is no water. It drags them anyway.',
  }),

  /* =======================================================================
     ═══ MYTHIC ═══
     Deliberately awkward. Each one is a whole strategy, not an upgrade.
     ======================================================================= */

  worldEnder: U({
    id: 'worldEnder', name: 'The World Ender', rarity: 'mythic', cost: 9, role: 'caster',
    hp: 900, dmg: 40, atkSpeed: 0.4, range: 20, moveSpeed: 2.0, mass: 3, armor: 8,
    dmgType: 'fire', armorType: 'magical',
    abilities: ['cataclysm', 'meteor', 'reflectSpells'],
    tags: ['mythic', 'nuke', 'aoe'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x1a1018, accent: 0xff5a2a, metal: 0x8a5a3a, weapon: 'archstaff', robe: true, crown: true, glow: 0xff5a2a, aura: 0xc5362b, scale: 1.35 },
    lore: 'Nine Command. You will have it once, perhaps twice, in a battle. Spend it correctly and the battle is decided in four seconds.',
  }),

  firstFlame: U({
    id: 'firstFlame', name: 'Avatar of the First Flame', rarity: 'mythic', cost: 8, role: 'melee',
    hp: 2200, dmg: 130, atkSpeed: 0.8, range: 2.8, moveSpeed: 3.8, mass: 4, armor: 12,
    dmgType: 'fire', armorType: 'magical',
    abilities: ['everburning', 'rebirth', 'firestorm', 'unstoppable'],
    tags: ['mythic', 'fire', 'zonecontrol', 'combo'],
    art: { archetype: 'elemental', variant: 'flame', primary: 0xff6a2a, accent: 0xffd479, glow: 0xff8a3a, scale: 2.1 },
    lore: 'Leaves permanent fire wherever it walks. Half the battlefield stops being available to the enemy — and to you, if you are careless.',
  }),

  hollowCrown: U({
    id: 'hollowCrown', name: 'The Hollow Crown', rarity: 'mythic', cost: 8, role: 'summoner',
    hp: 1400, dmg: 96, atkSpeed: 0.7, range: 2.4, moveSpeed: 3.2, mass: 3, armor: 16,
    dmgType: 'shadow', armorType: 'undead',
    abilities: ['dominate', 'immortalHost', 'cursedAura'],
    tags: ['mythic', 'undeadlord', 'conversion'],
    art: { archetype: 'humanoid', build: 'heavy', primary: 0x1a1a24, accent: 0xb07fd0, metal: 0x5a5a6a, weapon: 'greatsword', helm: 'crownhelm', cape: 0x2a1a3a, glow: 0xb07fd0, aura: 0x7a4fa0, hollow: true, scale: 1.4 },
    lore: 'Everything it kills fights for you. Against a big expensive enemy army, that is not a card — it is a coup.',
  }),

  aethervoid: U({
    id: 'aethervoid', name: 'Aethervoid Serpent', rarity: 'mythic', cost: 7, role: 'melee',
    hp: 1600, dmg: 155, atkSpeed: 0.75, range: 3.0, moveSpeed: 5.2, mass: 3, armor: 0,
    dmgType: 'arcane', armorType: 'magical',
    abilities: ['voidPhase', 'unstoppable', 'quake'],
    tags: ['mythic', 'ignorearmor', 'mobile'],
    art: { archetype: 'serpent', primary: 0x2a1a4a, accent: 0x9a6fe0, glow: 0xb07fd0, scale: 1.9 },
    lore: 'Armour does nothing. Wards do nothing. Every heavily-armoured wall in the game exists to stop something, and it is not this.',
  }),

  /* =======================================================================
     ═══ SUMMONS (never collectible) ═══
     ======================================================================= */

  skeleton: U({
    id: 'skeleton', name: 'Skeleton', rarity: 'common', cost: 0, role: 'melee', collectible: false,
    hp: 95, dmg: 18, atkSpeed: 1.0, range: 1.6, moveSpeed: 4.0, mass: 1, armor: 2,
    dmgType: 'slash', armorType: 'undead', tags: ['undead', 'summon'],
    art: { archetype: 'skeleton', primary: 0xd8d0b8, accent: 0x5a5040, weapon: 'shortsword', scale: 0.88 },
    lore: 'Free, endless and almost useless individually.',
  }),

  ghoul: U({
    id: 'ghoul', name: 'Ghoul', rarity: 'common', cost: 0, role: 'melee', collectible: false,
    hp: 210, dmg: 30, atkSpeed: 0.95, range: 1.6, moveSpeed: 4.6, mass: 1, armor: 1,
    dmgType: 'slash', armorType: 'undead', tags: ['undead', 'summon'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x6a7a5a, accent: 0x3a4030, bare: true, hunched: true, scale: 0.94 },
    lore: 'Was someone. Is now a resource.',
  }),

  wight: U({
    id: 'wight', name: 'Wight', rarity: 'uncommon', cost: 0, role: 'melee', collectible: false,
    hp: 480, dmg: 52, atkSpeed: 0.8, range: 1.9, moveSpeed: 3.6, mass: 2, armor: 10,
    dmgType: 'shadow', armorType: 'undead', tags: ['undead', 'summon'],
    art: { archetype: 'humanoid', build: 'heavy', primary: 0x3a3a48, accent: 0x79cfe0, metal: 0x6a7080, weapon: 'sword', helm: 'great', glow: 0x79cfe0, scale: 1.02 },
    lore: 'A knight who kept his armour and lost everything else.',
  }),

  /* =======================================================================
     ═══ ENEMY FACTION UNITS ═══
     Each faction fights differently, not just in a different colour.
     ======================================================================= */

  /* --- GOBLIN WARBAND: cheap, fast, overwhelming numbers, fragile --- */
  goblinCutter: U({
    id: 'goblinCutter', name: 'Goblin Cutter', rarity: 'common', cost: 2, role: 'melee', count: 3, collectible: false,
    faction: 'goblin', hp: 110, dmg: 20, atkSpeed: 1.3, range: 1.5, moveSpeed: 5.4, mass: 1, armor: 1,
    dmgType: 'slash', armorType: 'light', abilities: ['swarmTactics'], tags: ['goblin', 'swarm'],
    art: { archetype: 'humanoid', build: 'goblin', primary: 0x6a8a3a, accent: 0x8a4a2a, metal: 0x8a8070, weapon: 'shortsword', scale: 0.74 },
    lore: 'Individually pathetic. Nine of them at once is a different proposition.',
  }),
  goblinArcher: U({
    id: 'goblinArcher', name: 'Goblin Slinger', rarity: 'common', cost: 3, role: 'ranged', count: 2, collectible: false,
    faction: 'goblin', hp: 90, dmg: 22, atkSpeed: 1.1, range: 12, moveSpeed: 4.8, mass: 1, armor: 0,
    dmgType: 'pierce', armorType: 'unarmored', tags: ['goblin', 'ranged'],
    art: { archetype: 'humanoid', build: 'goblin', primary: 0x5a7a3a, accent: 0x6a5a2a, weapon: 'bow', scale: 0.72 },
    lore: 'Throws rocks. Very many rocks.',
  }),
  goblinBomber: U({
    id: 'goblinBomber', name: 'Goblin Bomber', rarity: 'uncommon', cost: 3, role: 'siege', collectible: false,
    faction: 'goblin', hp: 130, dmg: 18, atkSpeed: 0.6, range: 1.6, moveSpeed: 6.0, mass: 1, armor: 0,
    dmgType: 'fire', armorType: 'unarmored', abilities: ['sabotage'], tags: ['goblin', 'suicide'],
    art: { archetype: 'humanoid', build: 'goblin', primary: 0x7a6a2a, accent: 0xe8823a, weapon: 'keg', glow: 0xe8823a, scale: 0.76 },
    lore: 'Runs at your most expensive unit, giggling.',
  }),
  goblinShaman: U({
    id: 'goblinShaman', name: 'Goblin Shaman', rarity: 'uncommon', cost: 4, role: 'support', collectible: false,
    faction: 'goblin', hp: 170, dmg: 20, atkSpeed: 0.7, range: 9, moveSpeed: 3.8, mass: 1, armor: 0,
    dmgType: 'poison', armorType: 'unarmored', abilities: ['mendWounds'], tags: ['goblin', 'healer'],
    art: { archetype: 'humanoid', build: 'goblin', primary: 0x4a6a3a, accent: 0x8fbf4a, weapon: 'staff', hood: true, glow: 0x8fbf4a, scale: 0.78 },
    lore: 'Keeps the horde standing far longer than it has any right to.',
  }),
  goblinWolfRider: U({
    id: 'goblinWolfRider', name: 'Wolf Rider', rarity: 'rare', cost: 4, role: 'cavalry', count: 2, collectible: false,
    faction: 'goblin', hp: 280, dmg: 36, atkSpeed: 1.0, range: 1.6, moveSpeed: 7.8, mass: 2, armor: 3,
    dmgType: 'slash', armorType: 'beast', abilities: ['packHunter', 'pounce'], tags: ['goblin', 'beast', 'fast'],
    art: { archetype: 'cavalry', variant: 'wolf', primary: 0x5a5a4a, accent: 0x6a8a3a, scale: 1.0 },
    lore: 'Goes straight past your line and eats the archers.',
  }),

  /* --- BANDIT COALITION: disruption, theft, traps, elite duellists --- */
  banditCutthroat: U({
    id: 'banditCutthroat', name: 'Cutthroat', rarity: 'common', cost: 3, role: 'assassin', count: 2, collectible: false,
    faction: 'bandit', hp: 190, dmg: 44, atkSpeed: 1.1, range: 1.6, moveSpeed: 5.8, mass: 1, armor: 2,
    dmgType: 'slash', armorType: 'light', abilities: ['markTheWeak', 'exsanguinate'], tags: ['bandit', 'antibackline'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x3a3028, accent: 0x8a2a2a, weapon: 'dagger', helm: 'hood', scale: 0.92 },
    lore: 'Not brave. Very effective.',
  }),
  banditCrossbow: U({
    id: 'banditCrossbow', name: 'Poacher', rarity: 'common', cost: 3, role: 'ranged', count: 2, collectible: false,
    faction: 'bandit', hp: 150, dmg: 48, atkSpeed: 0.45, range: 15, moveSpeed: 3.6, mass: 1, armor: 2,
    dmgType: 'pierce', armorType: 'light', tags: ['bandit', 'ranged'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x4a3a2a, accent: 0x5a6a3a, weapon: 'crossbow', helm: 'hood', scale: 0.94 },
    lore: 'Used to shoot deer. The principle is the same.',
  }),
  banditBruiser: U({
    id: 'banditBruiser', name: 'Bruiser', rarity: 'uncommon', cost: 4, role: 'melee', collectible: false,
    faction: 'bandit', hp: 640, dmg: 62, atkSpeed: 0.8, range: 1.9, moveSpeed: 4.0, mass: 2, armor: 8,
    dmgType: 'blunt', armorType: 'light', abilities: ['bloodFrenzy'], tags: ['bandit', 'frontline'],
    art: { archetype: 'humanoid', build: 'heavy', primary: 0x5a4a3a, accent: 0x8a4a2a, metal: 0x8a8070, weapon: 'club', bare: true, scale: 1.08 },
    lore: 'Hits harder the more you hit him, which is a poor incentive structure for you.',
  }),
  banditCutpurse: U({
    id: 'banditCutpurse', name: 'Cutpurse', rarity: 'rare', cost: 4, role: 'support', collectible: false,
    faction: 'bandit', hp: 240, dmg: 26, atkSpeed: 0.9, range: 6, moveSpeed: 5.4, mass: 1, armor: 2,
    dmgType: 'slash', armorType: 'light', abilities: ['commandTheft'], tags: ['bandit', 'disruption'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x3a3a48, accent: 0xd9a441, weapon: 'dagger', helm: 'hood', cloak: 0x2a2a35, scale: 0.9 },
    lore: 'Steals your Command. Kill it or spend the whole battle poor.',
  }),

  /* --- ORC HORDE: heavy, aggressive, big damage, poor at range --- */
  orcGrunt: U({
    id: 'orcGrunt', name: 'Orc Grunt', rarity: 'common', cost: 3, role: 'melee', count: 2, collectible: false,
    faction: 'orc', hp: 520, dmg: 54, atkSpeed: 0.85, range: 1.8, moveSpeed: 4.0, mass: 2, armor: 8,
    dmgType: 'slash', armorType: 'heavy', abilities: ['bloodFrenzy'], tags: ['orc', 'frontline'],
    art: { archetype: 'humanoid', build: 'orc', primary: 0x5a7a4a, accent: 0x8a3a2a, metal: 0x7a7060, weapon: 'axe', scale: 1.12 },
    lore: 'Walks forward. Keeps walking forward.',
  }),
  orcBerserker: U({
    id: 'orcBerserker', name: 'Orc Berserker', rarity: 'uncommon', cost: 4, role: 'melee', collectible: false,
    faction: 'orc', hp: 680, dmg: 78, atkSpeed: 1.05, range: 1.8, moveSpeed: 5.2, mass: 2, armor: 3,
    dmgType: 'slash', armorType: 'light', abilities: ['bloodlust', 'whirlwind'], tags: ['orc', 'scaling'],
    art: { archetype: 'humanoid', build: 'orc', primary: 0x6a8a4a, accent: 0xc5362b, weapon: 'twinaxes', bare: true, scale: 1.14 },
    lore: 'Half-dead is when it starts working properly.',
  }),
  orcShaman: U({
    id: 'orcShaman', name: 'Orc Shaman', rarity: 'rare', cost: 5, role: 'caster', collectible: false,
    faction: 'orc', hp: 320, dmg: 38, atkSpeed: 0.6, range: 12, moveSpeed: 3.0, mass: 2, armor: 4,
    dmgType: 'fire', armorType: 'light', abilities: ['firestorm', 'mendWounds'], tags: ['orc', 'caster'],
    art: { archetype: 'humanoid', build: 'orc', primary: 0x4a6a3a, accent: 0xe8823a, weapon: 'staff', hood: true, glow: 0xe8823a, scale: 1.08 },
    lore: 'Sets the ground on fire and then walks his own troops through it, apparently on purpose.',
  }),
  orcWarboar: U({
    id: 'orcWarboar', name: 'War Boar', rarity: 'rare', cost: 5, role: 'cavalry', collectible: false,
    faction: 'orc', hp: 880, dmg: 74, atkSpeed: 0.7, range: 2.2, moveSpeed: 6.4, mass: 3, armor: 12,
    dmgType: 'blunt', armorType: 'beast', abilities: ['charge', 'trample'], tags: ['orc', 'beast', 'charge'],
    art: { archetype: 'cavalry', variant: 'boar', primary: 0x6a4a3a, accent: 0x8a6a4a, scale: 1.3 },
    lore: 'Two tonnes of bad temper on four legs. Set your spears.',
  }),
  orcSiegeThrower: U({
    id: 'orcSiegeThrower', name: 'Stone Thrower', rarity: 'rare', cost: 5, role: 'siege', collectible: false,
    faction: 'orc', hp: 480, dmg: 120, atkSpeed: 0.2, range: 20, moveSpeed: 1.8, mass: 3, armor: 6,
    dmgType: 'blunt', armorType: 'structure', abilities: ['siegeShot', 'minimumRange'], splash: 3.4, tags: ['orc', 'siege'],
    art: { archetype: 'siege', variant: 'catapult', primary: 0x5a4a3a, accent: 0x6a8a4a, scale: 1.3 },
    lore: 'Aims roughly. Compensates with volume.',
  }),

  /* --- UNDEAD LEGION: attrition, raising, immune to poison, weak to holy --- */
  undeadRisen: U({
    id: 'undeadRisen', name: 'Risen', rarity: 'common', cost: 2, role: 'melee', count: 4, collectible: false,
    faction: 'undead', hp: 160, dmg: 22, atkSpeed: 0.8, range: 1.6, moveSpeed: 3.0, mass: 1, armor: 2,
    dmgType: 'slash', armorType: 'undead', tags: ['undead', 'swarm'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x6a6a5a, accent: 0x3a3a30, bare: true, hunched: true, scale: 0.9 },
    lore: 'Slow. Numerous. Comes back.',
  }),
  undeadBoneArcher: U({
    id: 'undeadBoneArcher', name: 'Bone Archer', rarity: 'common', cost: 3, role: 'ranged', count: 2, collectible: false,
    faction: 'undead', hp: 120, dmg: 28, atkSpeed: 0.85, range: 14, moveSpeed: 2.8, mass: 1, armor: 1,
    dmgType: 'pierce', armorType: 'undead', tags: ['undead', 'ranged'],
    art: { archetype: 'skeleton', primary: 0xc8c0a8, accent: 0x4a4a3a, weapon: 'bow', scale: 0.9 },
    lore: 'Does not blink, flinch or get tired.',
  }),
  undeadBoneGiant: U({
    id: 'undeadBoneGiant', name: 'Bone Giant', rarity: 'epic', cost: 6, role: 'melee', collectible: false,
    faction: 'undead', hp: 2300, dmg: 118, atkSpeed: 0.45, range: 2.8, moveSpeed: 2.2, mass: 4, armor: 10,
    dmgType: 'blunt', armorType: 'undead', abilities: ['groundSlam', 'unstoppable'], tags: ['undead', 'frontline'],
    art: { archetype: 'skeleton', variant: 'giant', primary: 0xd0c8b0, accent: 0x5a5040, weapon: 'club', scale: 2.1 },
    lore: 'Built out of whatever was left after the last three battles.',
  }),
  undeadWraith: U({
    id: 'undeadWraith', name: 'Wraith', rarity: 'rare', cost: 4, role: 'assassin', collectible: false,
    faction: 'undead', hp: 300, dmg: 66, atkSpeed: 1.0, range: 1.8, moveSpeed: 5.6, mass: 1, armor: 0,
    dmgType: 'shadow', armorType: 'undead', abilities: ['shadowstep', 'markTheWeak', 'vanish'], tags: ['undead', 'stealth'],
    art: { archetype: 'wraith', primary: 0x3a3a52, accent: 0x9a6fe0, glow: 0xb07fd0, scale: 1.1 },
    lore: 'Goes through your line without acknowledging that it is there.',
  }),
  undeadPlagueCart: U({
    id: 'undeadPlagueCart', name: 'Plague Cart', rarity: 'rare', cost: 5, role: 'siege', collectible: false,
    faction: 'undead', hp: 820, dmg: 40, atkSpeed: 0.4, range: 8, moveSpeed: 2.0, mass: 3, armor: 8,
    dmgType: 'poison', armorType: 'structure', abilities: ['corpseExplosion', 'plague'], tags: ['undead', 'poison'],
    art: { archetype: 'siege', variant: 'cart', primary: 0x4a4a3a, accent: 0x8fbf4a, glow: 0x8fbf4a, scale: 1.3 },
    lore: 'Leaves a trail. Do not walk in the trail.',
  }),

  /* --- DARK CONCLAVE: casters, wards, silences, glass cannons --- */
  conclaveAdept: U({
    id: 'conclaveAdept', name: 'Conclave Adept', rarity: 'uncommon', cost: 4, role: 'caster', count: 2, collectible: false,
    faction: 'conclave', hp: 190, dmg: 40, atkSpeed: 0.7, range: 13, moveSpeed: 3.2, mass: 1, armor: 0,
    dmgType: 'arcane', armorType: 'unarmored', abilities: ['arcaneNova'], tags: ['conclave', 'caster'],
    art: { archetype: 'humanoid', build: 'slim', primary: 0x2a1a3a, accent: 0xb07fd0, weapon: 'staff', robe: true, hood: true, glow: 0xb07fd0, scale: 0.96 },
    lore: 'Two of these behind a wall will delete your entire frontline given ninety seconds.',
  }),
  conclaveWarden: U({
    id: 'conclaveWarden', name: 'Ward Keeper', rarity: 'rare', cost: 5, role: 'guardian', collectible: false,
    faction: 'conclave', hp: 1050, dmg: 46, atkSpeed: 0.6, range: 2.1, moveSpeed: 2.7, mass: 3, armor: 14,
    dmgType: 'arcane', armorType: 'magical', abilities: ['reflectSpells', 'antimagic'], tags: ['conclave', 'anticaster'],
    art: { archetype: 'golem', variant: 'ward', primary: 0x3a2a4a, accent: 0xb07fd0, glow: 0xb07fd0, scale: 1.5 },
    lore: 'Your mages stop working. Bring steel.',
  }),
  conclaveSilencer: U({
    id: 'conclaveSilencer', name: 'Silencer', rarity: 'epic', cost: 5, role: 'support', collectible: false,
    faction: 'conclave', hp: 400, dmg: 44, atkSpeed: 0.8, range: 9, moveSpeed: 3.6, mass: 2, armor: 8,
    dmgType: 'shadow', armorType: 'magical', abilities: ['silence', 'antimagic'], tags: ['conclave', 'anticaster'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x1a1a2a, accent: 0x7a4fa0, robe: true, hood: true, weapon: 'censer', glow: 0x7a4fa0, scale: 1.02 },
    lore: 'Seals your abilities. Every clever thing your deck does, it stops doing.',
  }),
  conclaveVoidling: U({
    id: 'conclaveVoidling', name: 'Voidling', rarity: 'epic', cost: 5, role: 'melee', count: 2, collectible: false,
    faction: 'conclave', hp: 420, dmg: 78, atkSpeed: 0.9, range: 1.9, moveSpeed: 5.0, mass: 2, armor: 0,
    dmgType: 'arcane', armorType: 'magical', abilities: ['voidPhase'], tags: ['conclave', 'ignorearmor'],
    art: { archetype: 'elemental', variant: 'void', primary: 0x2a1a4a, accent: 0x9a6fe0, glow: 0xb07fd0, scale: 1.2 },
    lore: 'Ignores armour. Your heavy line is decoration.',
  }),

  /* --- ANCIENT GUARDIANS: structures, pylons, rotating immunities --- */
  guardianSentinel: U({
    id: 'guardianSentinel', name: 'Sentinel', rarity: 'rare', cost: 5, role: 'guardian', collectible: false,
    faction: 'ancient', hp: 1400, dmg: 70, atkSpeed: 0.5, range: 2.4, moveSpeed: 2.0, mass: 4, armor: 24,
    dmgType: 'blunt', armorType: 'structure', abilities: ['unstoppable'], tags: ['ancient', 'construct'],
    art: { archetype: 'golem', variant: 'stone', primary: 0x6a6a5a, accent: 0xd9c98a, glow: 0xf3d98a, scale: 1.8 },
    lore: 'Has stood there for nine hundred years. Does not consider your siege timetable relevant.',
  }),
  guardianSeeker: U({
    id: 'guardianSeeker', name: 'Seeker', rarity: 'epic', cost: 5, role: 'flyer', collectible: false,
    faction: 'ancient', hp: 600, dmg: 62, atkSpeed: 1.0, range: 10, moveSpeed: 6.8, mass: 2, armor: 8,
    dmgType: 'arcane', armorType: 'magical', abilities: ['flying', 'chainLightning'], tags: ['ancient', 'flyer'],
    art: { archetype: 'flyer', variant: 'seeker', primary: 0x8a8a7a, accent: 0xf3d98a, glow: 0xffd479, scale: 1.3 },
    lore: 'An eye, a ring of stone, and extremely poor manners.',
  }),
  guardianColossus: U({
    id: 'guardianColossus', name: 'Ancient Colossus', rarity: 'legendary', cost: 8, role: 'melee', collectible: false,
    faction: 'ancient', hp: 4600, dmg: 175, atkSpeed: 0.4, range: 3.4, moveSpeed: 1.7, mass: 5, armor: 32,
    dmgType: 'blunt', armorType: 'structure', abilities: ['quake', 'unstoppable', 'wallbreaker'], tags: ['ancient', 'construct'],
    art: { archetype: 'golem', variant: 'ancient', primary: 0x7a7a68, accent: 0xd9c98a, glow: 0xffd479, scale: 2.6 },
    lore: 'Carved from one piece of the mountain. Still carrying out an order given by a king nobody remembers.',
  }),

  /* --- BEAST WILDS: fast, poison, terrain-heavy --- */
  beastDireWolf: U({
    id: 'beastDireWolf', name: 'Dire Wolf', rarity: 'uncommon', cost: 3, role: 'beast', count: 2, collectible: false,
    faction: 'beast', hp: 320, dmg: 44, atkSpeed: 1.15, range: 1.6, moveSpeed: 7.2, mass: 2, armor: 3,
    dmgType: 'slash', armorType: 'beast', abilities: ['packHunter', 'pounce'], tags: ['beast', 'fast'],
    art: { archetype: 'beast4', variant: 'dire', primary: 0x4a4a52, accent: 0x2a2a30, scale: 1.05 },
    lore: 'Hunts the smallest unit you own, then the next smallest.',
  }),
  beastSpider: U({
    id: 'beastSpider', name: 'Web Spinner', rarity: 'rare', cost: 4, role: 'caster', count: 2, collectible: false,
    faction: 'beast', hp: 280, dmg: 34, atkSpeed: 0.8, range: 9, moveSpeed: 4.4, mass: 1, armor: 2,
    dmgType: 'poison', armorType: 'beast', abilities: ['entangle'], tags: ['beast', 'control', 'poison'],
    art: { archetype: 'spider', primary: 0x3a2a3a, accent: 0x8fbf4a, scale: 1.0 },
    lore: 'Roots your cavalry. Cavalry hates this more than anything in the game.',
  }),
  beastBehemoth: U({
    id: 'beastBehemoth', name: 'Behemoth', rarity: 'epic', cost: 7, role: 'melee', collectible: false,
    faction: 'beast', hp: 3100, dmg: 130, atkSpeed: 0.45, range: 3.0, moveSpeed: 2.6, mass: 5, armor: 14,
    dmgType: 'blunt', armorType: 'beast', abilities: ['groundSlam', 'unstoppable', 'bloodFrenzy'], tags: ['beast', 'frontline'],
    art: { archetype: 'giant', variant: 'behemoth', primary: 0x5a4a3a, accent: 0x8a6a4a, scale: 2.4 },
    lore: 'Fire hurts it badly — 35% more, like everything with fur. Plan accordingly.',
  }),

  /* =======================================================================
     ═══ ENEMY COMMANDERS / BOSSES ═══
     ======================================================================= */

  bossGribnak: U({
    id: 'bossGribnak', name: 'Gribnak, Goblin King', rarity: 'rare', cost: 0, role: 'summoner', collectible: false, isBoss: true,
    faction: 'goblin', hp: 5200, dmg: 62, atkSpeed: 0.9, range: 2.0, moveSpeed: 3.6, mass: 3, armor: 10,
    dmgType: 'slash', armorType: 'light', abilities: ['summonWave', 'totemBound', 'whirlwind'],
    tags: ['goblin', 'boss'],
    waveKinds: ['goblinCutter', 'goblinCutter', 'goblinArcher', 'goblinBomber'],
    art: { archetype: 'humanoid', build: 'goblin', primary: 0x7a9a4a, accent: 0xd9a441, metal: 0xc0a040, weapon: 'twinaxes', crown: true, cape: 0x8a3a2a, scale: 1.1 },
    lore: 'Wears a crown made of three other crowns. Untouchable while his totems stand — and he will not tell you that.',
    mechanic: 'Immune while any totem stands. Destroy the three totems, then kill the king.',
  }),

  bossMara: U({
    id: 'bossMara', name: 'Mara Blackhand', rarity: 'epic', cost: 0, role: 'assassin', collectible: false, isBoss: true,
    faction: 'bandit', hp: 6400, dmg: 110, atkSpeed: 1.2, range: 1.8, moveSpeed: 6.6, mass: 2, armor: 12,
    dmgType: 'slash', armorType: 'light', abilities: ['commandTheft', 'vanish', 'exsanguinate', 'riposte', 'markTheWeak'],
    tags: ['bandit', 'boss'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x2a2028, accent: 0xc5362b, metal: 0x8a8090, weapon: 'twinblades', helm: 'hood', cloak: 0x1a1418, scale: 1.08 },
    lore: 'Robs you during the fight. Every seventeen seconds you are two Command poorer, and she is the one who decided that.',
    mechanic: 'Steals Command on a timer and vanishes after kills. Bring a Scout or you will never see her coming.',
  }),

  bossGharuk: U({
    id: 'bossGharuk', name: 'Warchief Gharuk', rarity: 'epic', cost: 0, role: 'melee', collectible: false, isBoss: true,
    faction: 'orc', hp: 9800, dmg: 165, atkSpeed: 0.8, range: 2.6, moveSpeed: 4.2, mass: 4, armor: 22,
    dmgType: 'slash', armorType: 'heavy', abilities: ['enrageAtHalf', 'charge', 'whirlwind', 'bloodFrenzy', 'summonWave'],
    tags: ['orc', 'boss'],
    waveKinds: ['orcGrunt', 'orcGrunt', 'orcBerserker'],
    art: { archetype: 'humanoid', build: 'orc', primary: 0x6a8a4a, accent: 0xc5362b, metal: 0x9a8070, weapon: 'greataxe', helm: 'horned', cape: 0x6a2a2a, scale: 1.5 },
    lore: 'Below half health he stops fighting your army and comes for you personally. Be somewhere else.',
    mechanic: 'Enrages permanently at 50% and hunts your commander. Kite him; do not trade.',
  }),

  bossMorvant: U({
    id: 'bossMorvant', name: 'Morvant the Undying', rarity: 'legendary', cost: 0, role: 'summoner', collectible: false, isBoss: true,
    faction: 'undead', hp: 8600, dmg: 96, atkSpeed: 0.6, range: 14, moveSpeed: 2.4, mass: 3, armor: 20,
    dmgType: 'shadow', armorType: 'undead', abilities: ['immortalHost', 'raiseDead', 'corpseExplosion', 'summonSkeletons', 'plague'],
    tags: ['undead', 'boss'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x2a2438, accent: 0x79cfe0, metal: 0x8a90a0, weapon: 'archstaff', robe: true, crown: true, skull: true, glow: 0x79cfe0, aura: 0x4a3a6a, scale: 1.4 },
    lore: 'Raises every corpse on the field, including your dead. The longer the battle, the bigger his army and the smaller yours.',
    mechanic: 'Feeds on corpses. Fire damage burns corpses away before he can use them — bring something that burns.',
  }),

  bossSolveil: U({
    id: 'bossSolveil', name: 'Archon Solveil', rarity: 'legendary', cost: 0, role: 'caster', collectible: false, isBoss: true,
    faction: 'conclave', hp: 7800, dmg: 130, atkSpeed: 0.7, range: 16, moveSpeed: 3.0, mass: 3, armor: 16,
    dmgType: 'arcane', armorType: 'magical', abilities: ['rotatingWard', 'meteor', 'chainLightning', 'silence', 'blizzard'],
    tags: ['conclave', 'boss'],
    art: { archetype: 'humanoid', build: 'medium', primary: 0x1a1030, accent: 0xb07fd0, metal: 0x9a8ab0, weapon: 'archstaff', robe: true, crown: true, glow: 0xb07fd0, aura: 0x7a4fa0, scale: 1.35 },
    lore: 'Immune to one damage type at a time. The colour of her ward tells you which. A mono-type deck simply cannot kill her.',
    mechanic: 'Rotating immunity every 8s: slash → pierce → arcane → fire. Field at least three damage types.',
  }),

  bossWarden: U({
    id: 'bossWarden', name: 'The Stone Warden', rarity: 'mythic', cost: 0, role: 'guardian', collectible: false, isBoss: true,
    faction: 'ancient', hp: 14000, dmg: 210, atkSpeed: 0.45, range: 3.6, moveSpeed: 1.6, mass: 5, armor: 34,
    dmgType: 'blunt', armorType: 'structure', abilities: ['pylonLinked', 'quake', 'unstoppable', 'reflectSpells'],
    tags: ['ancient', 'boss', 'final'],
    art: { archetype: 'golem', variant: 'warden', primary: 0x7a7a68, accent: 0xffd479, metal: 0x9a9a88, glow: 0xffd479, aura: 0xd9a441, scale: 3.0 },
    lore: 'The last order it was given was "hold". The king who gave it has been dust for six centuries. It is still holding.',
    mechanic: 'Four pylons feed it. Each pylon alive grants a different aura — armour, haste, reflection, regeneration. Break them in the right order.',
  }),
};

/* ---------------------------------------------------------------- queries */

export const COLLECTIBLE = Object.values(UNITS).filter(u => u.collectible);
export const STARTERS = ['knight', 'mage', 'giant'];

export const getUnit = id => UNITS[id];

export function unitsByRarity(rarity) {
  return COLLECTIBLE.filter(u => u.rarity === rarity);
}

export function unitsByTag(tag) {
  return Object.values(UNITS).filter(u => u.tags?.includes(tag));
}

/** Level-scaled stats. One function, used by the sim, the card UI and the AI. */
export function statsAt(unit, level, growth = 1.088) {
  const m = Math.pow(growth, level - 1);
  return {
    hp: Math.round(unit.hp * m),
    dmg: Math.round(unit.dmg * m * 10) / 10,
    armor: Math.round(unit.armor * (1 + (level - 1) * 0.045)),
    mult: m,
  };
}

/** Visual tier 0..4 — drives armour detail, trim, glow and aura in UnitArt. */
export const tierOf = (level) => Math.min(4, Math.floor((level - 1) / 3));

/** Rough "how scary is it" number, for AI target priority and briefing screens. */
export function threatScore(unit, level = 1) {
  const s = statsAt(unit, level);
  const dps = s.dmg * unit.atkSpeed * (unit.count || 1);
  const ehp = s.hp * (1 + s.armor / 40) * (unit.count || 1);
  const rangeBonus = unit.range > 8 ? 1.25 : 1;
  const roleBonus = { support: 1.6, caster: 1.4, summoner: 1.5, siege: 1.2 }[unit.role] || 1;
  return Math.round(Math.sqrt(dps * ehp) * rangeBonus * roleBonus / 10);
}
