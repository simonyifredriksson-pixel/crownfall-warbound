import { ic } from '../art/Icons.js';
/* Campaign.js — the world map: five regions, forty-odd nodes.

   Node types
     battle   a standard fight
     elite    harder, guaranteed rare+ reward, enemy deck is tuned to punish
              one specific lazy strategy
     boss     a commander with a stated mechanic
     explore  a choose-your-path event; no battle, real rewards and risks
     cache    a guaranteed material haul, repeatable once per day-equivalent
     camp     narrative beat + free heal + a card offer

   `field` names a battlefield preset from Field.js. Terrain is the quiet
   strategic layer: a bridge map makes swarms strong and cavalry useless; a
   ridge map makes archers decisive.
*/

export const REGIONS = {

  /* =====================================================================
     I — THE GREENMARCH
     Teaching region. Introduces deployment, counters, control points.
     ===================================================================== */
  greenmarch: {
    id: 'greenmarch', name: 'The Greenmarch', order: 0, icon: ic('tree'),
    faction: 'goblin', color: '#5fa25a',
    tagline: 'Rolling farmland going slowly feral.',
    desc: 'Three days\' ride from the keep and already not yours. The warbands came down out of the hills in spring and nobody stopped them, because there was nobody to do it.',
    unlockedBy: null,
    recommendedLevel: 1,
    materials: ['iron', 'oak', 'leather', 'cloth', 'herb'],
    nodes: [
      {
        /* The first battle in the game is a WAVE battle, not a skirmish.
           The free-form enemy director is a genuine opponent and therefore
           unteachable: nothing it does is repeatable and nothing can be
           explained while it happens. Four scripted waves, each introducing
           exactly one idea, and the fight ends when the last one is dead. */
        id: 'gm1', name: 'The Broken Fence', type: 'battle', x: 12, y: 74, requires: [],
        faction: 'goblin', level: 1, field: 'open',
        enemyDeck: ['goblinCutter', 'goblinCutter', 'goblinArcher'],
        intro: 'Six goblins and a hole in a fence. Everyone starts somewhere.',
        tutorial: 'deploy',
        waveLeadIn: 6,
        waves: [
          {
            name: 'A scout, alone', units: ['goblinCutter'], gap: 7,
            teach: 'Press 1 to pick the Knight, then click the ground inside the blue zone.',
            after: 'That is the whole loop. Command builds up, you spend it, the card fights.',
          },
          {
            name: 'They brought a bow', units: ['goblinCutter', 'goblinArcher'], gap: 7,
            teach: 'The archer stays at the back and shoots. Put the Mage behind the Knight and let the Knight walk into it.',
            after: 'Whatever is closest to the enemy is what the enemy kills. Choose who that is.',
          },
          {
            name: 'A proper rush', units: ['goblinCutter', 'goblinCutter', 'goblinCutter'], gap: 8,
            teach: 'Three at once. Drop them in front of your line, not behind it — a unit that has to walk past your knight arrives alone.',
            after: 'Numbers beat quality until quality is standing in a doorway.',
          },
          {
            name: 'Something big', units: ['goblinShaman', 'goblinCutter', 'goblinCutter'], gap: 6,
            teach: 'The shaman heals the others. Kill it first, or kill nothing.',
          },
        ],
        rewards: { gold: 90, xp: 60, mats: { iron: 3, oak: 2 }, shards: 6 },
        /* The first clear must hand over ENOUGH SHARDS FOR AN ACTUAL UPGRADE.
           The tutorial's next instruction is "go and level a card", and six
           shards split three ways is two each — not enough for anything. An
           onboarding step the player cannot complete is worse than no step. */
        first: { gold: 150, cards: ['militia'], shards: { knight: 14, mage: 8, giant: 8 } },
      },
      {
        id: 'gm2', name: 'Millstone Ford', type: 'battle', x: 24, y: 62, requires: ['gm1'],
        faction: 'goblin', level: 2, field: 'bridge',
        enemyDeck: ['goblinCutter', 'goblinCutter', 'goblinArcher', 'goblinBomber'],
        intro: 'One crossing, and they are already on it. A narrow front suits whoever has fewer bodies — that is you.',
        tutorial: 'chokepoint',
        waveLeadIn: 6,
        waves: [
          {
            name: 'Testing the crossing', units: ['goblinCutter', 'goblinCutter'], gap: 7,
            teach: 'One crossing. Put the Giant in it and nothing gets past him.',
          },
          {
            name: 'Slingers on the far bank', units: ['goblinArcher', 'goblinArcher', 'goblinCutter'], gap: 7,
            teach: 'Ranged units will not close. Your Mage outranges them — set her up behind the Giant.',
            after: 'A chokepoint turns their numbers into a queue.',
          },
          {
            name: 'A bomber', units: ['goblinBomber', 'goblinCutter', 'goblinCutter'], gap: 8,
            teach: 'Bombs do splash. A tight cluster is a gift — spread out.',
            after: 'Formation is a decision, not a default.',
          },
          {
            name: 'Everything left', units: ['goblinCutter', 'goblinCutter', 'goblinArcher', 'goblinBomber'], gap: 6,
            teach: 'All of it at once. Hold the ford.',
          },
        ],
        rewards: { gold: 110, xp: 75, mats: { iron: 3, oak: 3 }, shards: 8 },
        first: { gold: 180, cards: ['archer'] },
      },
      {
        id: 'gm3', name: 'The Old Orchard', type: 'explore', x: 16, y: 48, requires: ['gm1'],
        icon: ic('apple'),
        intro: 'Apple trees gone wild, and something moving in the rows.',
        event: 'orchard',
      },
      {
        id: 'gm4', name: 'Hollow Barrow', type: 'battle', x: 36, y: 52, requires: ['gm2'],
        faction: 'goblin', level: 3, field: 'ridge',
        enemyDeck: ['goblinCutter', 'goblinArcher', 'goblinArcher', 'goblinShaman'],
        intro: 'They have the high ground and slingers on it. Archers on a ridge shoot further and hit harder — take the ridge or take the losses.',
        tutorial: 'highground',
        rewards: { gold: 140, xp: 95, mats: { iron: 4, leather: 3 }, shards: 9 },
        first: { gold: 220, cards: ['spearman'] },
      },
      {
        id: 'gm5', name: 'Thornbrake Warren', type: 'battle', x: 30, y: 36, requires: ['gm4'],
        faction: 'beast', level: 4, field: 'forest',
        enemyDeck: ['beastDireWolf', 'houndPack', 'beastDireWolf'],
        intro: 'Not goblins. Something the goblins were running from.',
        rewards: { gold: 160, xp: 110, mats: { leather: 5, herb: 3 }, shards: 10 },
        first: { gold: 240, cards: ['houndPack'], mats: { heartwood: 1 } },
      },
      {
        id: 'gm6', name: 'Cutter\'s Camp', type: 'elite', x: 48, y: 42, requires: ['gm4'],
        faction: 'goblin', level: 5, field: 'open',
        enemyDeck: ['goblinCutter', 'goblinCutter', 'goblinCutter', 'goblinWolfRider', 'goblinShaman'],
        modifiers: ['swarm'],
        intro: 'Nine bodies at once, twice a minute. Single-target damage will not hold this.',
        rewards: { gold: 230, xp: 150, mats: { iron: 6, oak: 4 }, shards: 14, warSeal: 1 },
        first: { gold: 320, cards: ['scout'], scroll: 2 },
      },
      {
        id: 'gm7', name: 'Ashfield Cache', type: 'cache', x: 42, y: 26, requires: ['gm5'],
        icon: ic('crate'), repeatable: true,
        intro: 'A supply wagon the warband never got round to emptying.',
        rewards: { gold: 80, mats: { iron: 5, oak: 5, leather: 4, cloth: 3 } },
      },
      {
        id: 'gm8', name: 'The Standing Stones', type: 'camp', x: 58, y: 30, requires: ['gm6'],
        icon: ic('flame'),
        intro: 'Somewhere to put your back against for a night.',
        event: 'camp1',
      },
      {
        id: 'gm9', name: 'Gribnak\'s Totem Hill', type: 'boss', x: 72, y: 20, requires: ['gm6', 'gm8'],
        faction: 'goblin', level: 7, field: 'ridge', boss: 'bossGribnak',
        enemyDeck: ['goblinCutter', 'goblinCutter', 'goblinArcher', 'goblinShaman', 'goblinWolfRider'],
        mechanic: 'Three totems ring the hill. Gribnak takes almost no damage while any of them stands. Kill totems first, king second.',
        intro: 'He is wearing three crowns and standing behind three totems, and he genuinely believes both facts make him safe.',
        rewards: { gold: 500, xp: 340, mats: { iron: 10, oak: 8, leather: 6 }, shards: 25, warSeal: 3, scroll: 3 },
        first: { gold: 900, cards: ['shieldbearer', 'battlePriest'], mats: { crownshard: 1 }, unlocks: 'blackbriar' },
      },
    ],
  },

  /* =====================================================================
     II — BLACKBRIAR FEN
     Teaches: protecting your backline, reveal, chokepoint discipline.
     ===================================================================== */
  blackbriar: {
    id: 'blackbriar', name: 'Blackbriar Fen', order: 1, icon: ic('wheat'),
    faction: 'bandit', color: '#8a6a3a',
    tagline: 'Wet ground, bad footing, worse people.',
    desc: 'The Coalition took the fen because nobody else wanted it, and then discovered that everything worth taking has to pass through it. Mara Blackhand charges a toll and calls it governance.',
    unlockedBy: 'gm9',
    recommendedLevel: 6,
    materials: ['iron', 'oak', 'leather', 'herb', 'steel', 'arcaneDust'],
    nodes: [
      {
        id: 'bb1', name: 'The Toll Road', type: 'battle', x: 10, y: 70, requires: [],
        faction: 'bandit', level: 7, field: 'open',
        enemyDeck: ['banditCrossbow', 'banditCutthroat', 'banditBruiser'],
        intro: 'Cutthroats come around your flanks, not through your line. Watch what they are actually walking toward.',
        tutorial: 'flank',
        rewards: { gold: 190, xp: 150, mats: { iron: 5, leather: 4 }, shards: 12 },
        first: { gold: 280, cards: ['crossbowman'] },
      },
      {
        id: 'bb2', name: 'Sunken Causeway', type: 'battle', x: 24, y: 58, requires: ['bb1'],
        faction: 'bandit', level: 8, field: 'bridge',
        enemyDeck: ['banditCrossbow', 'banditCrossbow', 'banditBruiser', 'banditCutthroat'],
        intro: 'Two crossings and a great deal of water. Whoever holds the causeway decides the battle.',
        rewards: { gold: 220, xp: 170, mats: { steel: 2, leather: 5 }, shards: 13 },
        first: { gold: 320, cards: ['oilFlinger'], mats: { steel: 3 } },
      },
      {
        id: 'bb3', name: 'The Drowned Chapel', type: 'explore', x: 14, y: 44, requires: ['bb1'],
        icon: ic('chapel'), intro: 'Half a chapel, standing in three feet of water.', event: 'chapel',
      },
      {
        id: 'bb4', name: 'Poacher\'s Hollow', type: 'battle', x: 36, y: 46, requires: ['bb2'],
        faction: 'bandit', level: 9, field: 'forest',
        enemyDeck: ['banditCrossbow', 'banditCrossbow', 'banditCutthroat', 'banditCutthroat'],
        modifiers: ['cover'],
        intro: 'Thick cover. Ranged attacks into the trees lose a quarter of their bite — you will want to close, and they know it.',
        tutorial: 'cover',
        rewards: { gold: 240, xp: 185, mats: { leather: 6, herb: 4 }, shards: 14 },
        first: { gold: 340, cards: ['ranger'] },
      },
      {
        id: 'bb5', name: 'Widow\'s Mire', type: 'battle', x: 30, y: 30, requires: ['bb3'],
        faction: 'beast', level: 9, field: 'forest',
        enemyDeck: ['beastSpider', 'beastSpider', 'beastDireWolf'],
        intro: 'Web Spinners root everything that tries to cross. Bring something that does not need to move.',
        rewards: { gold: 250, xp: 190, mats: { herb: 6, leather: 5, arcaneDust: 2 }, shards: 14 },
        first: { gold: 360, cards: ['warden'] },
      },
      {
        id: 'bb6', name: 'The Hanging Tree', type: 'elite', x: 48, y: 34, requires: ['bb4'],
        faction: 'bandit', level: 11, field: 'open',
        enemyDeck: ['banditCutthroat', 'banditCutthroat', 'banditCutpurse', 'banditBruiser', 'banditCrossbow'],
        modifiers: ['thief'],
        intro: 'A Cutpurse is on the field. Every seventeen seconds you are two Command poorer. Kill it or play the whole battle broke.',
        rewards: { gold: 380, xp: 280, mats: { steel: 5, leather: 6 }, shards: 20, warSeal: 2, scroll: 1 },
        first: { gold: 520, cards: ['firebomber'], scroll: 2 },
      },
      {
        id: 'bb7', name: 'Smuggler\'s Cache', type: 'cache', x: 42, y: 18, requires: ['bb5'],
        icon: ic('crate'), repeatable: true,
        intro: 'Six crates under a rotten jetty. Two of them are worth carrying.',
        rewards: { gold: 140, mats: { steel: 3, leather: 6, cloth: 5, arcaneDust: 2 } },
      },
      {
        id: 'bb8', name: 'Fenwatch Ruin', type: 'camp', x: 58, y: 22, requires: ['bb6'],
        icon: ic('flame'), intro: 'A watchtower with three walls left.', event: 'camp2',
      },
      {
        id: 'bb9', name: 'Blackhand\'s Table', type: 'boss', x: 74, y: 30, requires: ['bb6', 'bb8'],
        faction: 'bandit', level: 13, field: 'ruins', boss: 'bossMara',
        enemyDeck: ['banditCutthroat', 'banditCrossbow', 'banditBruiser', 'banditCutpurse'],
        mechanic: 'Mara steals your Command on a timer and vanishes after every kill. A Scout — or anything that reveals — turns her from a nightmare into a duel.',
        intro: 'She has laid a place for you. She is not being polite; she wants you to sit down where she can reach you.',
        rewards: { gold: 800, xp: 560, mats: { steel: 10, leather: 8, arcaneDust: 6 }, shards: 32, warSeal: 4, scroll: 4 },
        first: { gold: 1400, cards: ['assassin', 'pikewall'], mats: { crownshard: 1 }, unlocks: 'ashenwaste' },
      },
    ],
  },

  /* =====================================================================
     III — THE ASHEN WASTE
     Teaches: heavy armour counters, control, blunt damage.
     ===================================================================== */
  ashenwaste: {
    id: 'ashenwaste', name: 'The Ashen Waste', order: 2, icon: ic('volcano'),
    faction: 'orc', color: '#c25a2a',
    tagline: 'Black glass and old fire.',
    desc: 'Something burned here long enough that the sand turned to glass. The horde moved in because nothing else would, and Gharuk has been walking west ever since.',
    unlockedBy: 'bb9',
    recommendedLevel: 12,
    materials: ['iron', 'steel', 'leather', 'emberglass', 'arcaneDust', 'dragonbone'],
    nodes: [
      {
        id: 'aw1', name: 'The Glass Flats', type: 'battle', x: 10, y: 66, requires: [],
        faction: 'orc', level: 13, field: 'open',
        enemyDeck: ['orcGrunt', 'orcGrunt', 'orcBerserker'],
        intro: 'Heavy armour, walking straight at you. Pierce damage will glance off. Blunt will not.',
        tutorial: 'armortypes',
        rewards: { gold: 300, xp: 260, mats: { steel: 5, emberglass: 2 }, shards: 16 },
        first: { gold: 460, cards: ['berserker'] },
      },
      {
        id: 'aw2', name: 'Cinder Pass', type: 'battle', x: 24, y: 54, requires: ['aw1'],
        faction: 'orc', level: 14, field: 'canyon',
        enemyDeck: ['orcGrunt', 'orcBerserker', 'orcShaman'],
        intro: 'A canyon with one way through. Their shaman sets the floor on fire and marches his own troops over it.',
        rewards: { gold: 330, xp: 285, mats: { emberglass: 4, steel: 4 }, shards: 17 },
        first: { gold: 500, cards: ['frostMage'], mats: { emberglass: 4 } },
      },
      {
        id: 'aw3', name: 'The Slag Pits', type: 'explore', x: 16, y: 40, requires: ['aw1'],
        icon: ic('pick'), intro: 'Emberglass, if you are willing to go down for it.', event: 'slagpits',
      },
      {
        id: 'aw4', name: 'Boarpen Ridge', type: 'battle', x: 36, y: 42, requires: ['aw2'],
        faction: 'orc', level: 15, field: 'ridge',
        enemyDeck: ['orcWarboar', 'orcGrunt', 'orcGrunt', 'orcSiegeThrower'],
        intro: 'War Boars charge in a straight line at enormous speed. Spears stop charges. Everything else gets run over.',
        tutorial: 'antilarge',
        rewards: { gold: 360, xp: 310, mats: { steel: 6, leather: 6 }, shards: 18 },
        first: { gold: 540, cards: ['dragoon'] },
      },
      {
        id: 'aw5', name: 'The Burning Wall', type: 'battle', x: 30, y: 26, requires: ['aw3'],
        faction: 'orc', level: 16, field: 'ruins',
        enemyDeck: ['orcShaman', 'orcShaman', 'orcGrunt', 'orcSiegeThrower'],
        modifiers: ['fireGround'],
        intro: 'Two shamans and a stone thrower behind a wall. Your siege or their siege — pick.',
        rewards: { gold: 390, xp: 330, mats: { emberglass: 6, steel: 5 }, shards: 19 },
        first: { gold: 580, cards: ['catapult'] },
      },
      {
        id: 'aw6', name: 'The Bone Yard', type: 'elite', x: 48, y: 30, requires: ['aw4'],
        faction: 'orc', level: 18, field: 'open',
        enemyDeck: ['orcWarboar', 'orcWarboar', 'orcBerserker', 'orcBerserker', 'orcShaman'],
        modifiers: ['enraged'],
        intro: 'Everything here enrages below half health. Finishing wounded enemies quickly is not optional.',
        rewards: { gold: 600, xp: 480, mats: { dragonbone: 2, steel: 8, emberglass: 5 }, shards: 26, warSeal: 3, scroll: 2 },
        first: { gold: 850, cards: ['griffonRider'], mats: { dragonbone: 2 }, scroll: 3 },
      },
      {
        id: 'aw7', name: 'Firewind Cache', type: 'cache', x: 42, y: 14, requires: ['aw5'],
        icon: ic('crate'), repeatable: true,
        intro: 'A caravan that did not make it out.',
        rewards: { gold: 220, mats: { emberglass: 5, steel: 5, iron: 8, dragonbone: 1 } },
      },
      {
        id: 'aw8', name: 'The Last Well', type: 'camp', x: 60, y: 18, requires: ['aw6'],
        icon: ic('flame'), intro: 'Clean water in the Waste. People have died for less.', event: 'camp3',
      },
      {
        id: 'aw9', name: 'Gharuk\'s Warcamp', type: 'boss', x: 76, y: 28, requires: ['aw6', 'aw8'],
        faction: 'orc', level: 20, field: 'canyon', boss: 'bossGharuk',
        enemyDeck: ['orcGrunt', 'orcBerserker', 'orcWarboar', 'orcShaman'],
        mechanic: 'Below half health Gharuk enrages permanently and stops fighting your army — he comes for you. Do not be standing still when he does.',
        intro: 'He has been told you are coming. He has cleared a space.',
        rewards: { gold: 1300, xp: 900, mats: { dragonbone: 5, steel: 12, emberglass: 10 }, shards: 40, warSeal: 6, scroll: 5 },
        first: { gold: 2200, cards: ['arcaneGolem', 'trebuchet'], mats: { crownshard: 1 }, unlocks: 'hollowmere' },
      },
    ],
  },

  /* =====================================================================
     IV — HOLLOWMERE
     Teaches: damage-type specialisation, denial, attrition management.
     ===================================================================== */
  hollowmere: {
    id: 'hollowmere', name: 'Hollowmere', order: 3, icon: ic('skull'),
    faction: 'undead', color: '#79cfe0',
    tagline: 'A lake that does not freeze and a town that does not empty.',
    desc: 'Morvant was the Crown\'s own archivist. He is still, technically, employed. He has simply reinterpreted the post, and the population of Hollowmere with it.',
    unlockedBy: 'aw9',
    recommendedLevel: 19,
    materials: ['steel', 'silver', 'boneMeal', 'cloth', 'arcaneDust', 'heartwood'],
    nodes: [
      {
        id: 'hm1', name: 'The Wet Fields', type: 'battle', x: 10, y: 68, requires: [],
        faction: 'undead', level: 20, field: 'open',
        enemyDeck: ['undeadRisen', 'undeadRisen', 'undeadBoneArcher'],
        intro: 'Holy damage does double to the undead. Poison does almost nothing. This is the whole region in one sentence.',
        tutorial: 'holy',
        rewards: { gold: 460, xp: 420, mats: { boneMeal: 4, steel: 5 }, shards: 20 },
        first: { gold: 680, cards: ['paladin'] },
      },
      {
        id: 'hm2', name: 'Drowned Hollowmere', type: 'battle', x: 24, y: 56, requires: ['hm1'],
        faction: 'undead', level: 21, field: 'crypt',
        enemyDeck: ['undeadRisen', 'undeadBoneArcher', 'undeadWraith', 'undeadPlagueCart'],
        intro: 'Wraiths go straight past your line for your casters. Keep something fast at home.',
        rewards: { gold: 500, xp: 450, mats: { boneMeal: 5, silver: 2 }, shards: 22 },
        first: { gold: 740, cards: ['necromancer'], mats: { silver: 3 } },
      },
      {
        id: 'hm3', name: 'The Archivist\'s House', type: 'explore', x: 15, y: 42, requires: ['hm1'],
        icon: ic('codex'), intro: 'Morvant\'s old study. The Wizard would very much like to know what is in it.', event: 'archivist',
      },
      {
        id: 'hm4', name: 'Bonefield', type: 'battle', x: 36, y: 44, requires: ['hm2'],
        faction: 'undead', level: 23, field: 'open',
        enemyDeck: ['undeadRisen', 'undeadRisen', 'undeadBoneGiant', 'undeadBoneArcher'],
        modifiers: ['corpseRise'],
        intro: 'Every corpse on this field gets back up. Fire burns them before they can. So does winning quickly.',
        tutorial: 'corpses',
        rewards: { gold: 540, xp: 490, mats: { boneMeal: 7, silver: 3 }, shards: 23 },
        first: { gold: 800, cards: ['inquisitor'] },
      },
      {
        id: 'hm5', name: 'The Quiet Grove', type: 'battle', x: 30, y: 28, requires: ['hm3'],
        faction: 'beast', level: 23, field: 'forest',
        enemyDeck: ['beastBehemoth', 'beastSpider', 'beastDireWolf'],
        intro: 'Something still alive in Hollowmere, and extremely defensive about it.',
        rewards: { gold: 560, xp: 500, mats: { heartwood: 3, leather: 8 }, shards: 23 },
        first: { gold: 820, cards: ['treant'], mats: { heartwood: 3 } },
      },
      {
        id: 'hm6', name: 'The Ossuary', type: 'elite', x: 48, y: 32, requires: ['hm4'],
        faction: 'undead', level: 25, field: 'crypt',
        enemyDeck: ['undeadBoneGiant', 'undeadWraith', 'undeadWraith', 'undeadPlagueCart', 'undeadBoneArcher'],
        modifiers: ['corpseRise', 'poisonGround'],
        intro: 'Poison ground and a plague cart. Your healers will be working the entire battle.',
        rewards: { gold: 900, xp: 760, mats: { silver: 6, boneMeal: 10, arcaneDust: 8 }, shards: 30, warSeal: 4, scroll: 3 },
        first: { gold: 1300, cards: ['shadowStalker'], scroll: 4 },
      },
      {
        id: 'hm7', name: 'Reliquary Vault', type: 'cache', x: 42, y: 16, requires: ['hm5'],
        icon: ic('crate'), repeatable: true,
        intro: 'Grave goods. Nobody is using them.',
        rewards: { gold: 320, mats: { silver: 4, boneMeal: 8, arcaneDust: 6, cloth: 6 } },
      },
      {
        id: 'hm8', name: 'The Lantern Row', type: 'camp', x: 60, y: 20, requires: ['hm6'],
        icon: ic('flame'), intro: 'Someone still lights these. Nobody will say who.', event: 'camp4',
      },
      {
        id: 'hm9', name: 'The Undying Court', type: 'boss', x: 78, y: 30, requires: ['hm6', 'hm8'],
        faction: 'undead', level: 27, field: 'crypt', boss: 'bossMorvant',
        enemyDeck: ['undeadRisen', 'undeadBoneArcher', 'undeadWraith', 'undeadBoneGiant'],
        mechanic: 'Morvant raises every corpse on the field, yours included, every six seconds. Fire destroys corpses outright — without a single source of fire this fight has no end.',
        intro: 'He apologises for the state of the hall. He has been busy. He says this without any detectable irony.',
        rewards: { gold: 2000, xp: 1400, mats: { silver: 12, boneMeal: 16, heartwood: 5 }, shards: 48, warSeal: 8, scroll: 6 },
        first: { gold: 3200, cards: ['sunblade', 'lichKing'], mats: { crownshard: 1 }, unlocks: 'stormspire' },
      },
    ],
  },

  /* =====================================================================
     V — THE STORMSPIRE
     Endgame. Teaches: mixed damage, ward rotation, pylon priority.
     ===================================================================== */
  stormspire: {
    id: 'stormspire', name: 'The Stormspire', order: 4, icon: ic('stamina'),
    faction: 'conclave', color: '#b07fd0',
    tagline: 'A mountain with a hole in the sky above it.',
    desc: 'The Conclave took the Spire for the view and stayed for what they found underneath it. The Ancient Guardians were already there, and are not interested in either side.',
    unlockedBy: 'hm9',
    recommendedLevel: 26,
    materials: ['steel', 'silver', 'frostLotus', 'voidEmber', 'runestone', 'starIron', 'dragonbone'],
    nodes: [
      {
        id: 'ss1', name: 'The Long Stair', type: 'battle', x: 10, y: 72, requires: [],
        faction: 'conclave', level: 27, field: 'canyon',
        enemyDeck: ['conclaveAdept', 'conclaveAdept', 'conclaveWarden'],
        intro: 'Ward Keepers reflect a third of your magic back at you. Bring steel.',
        tutorial: 'reflect',
        rewards: { gold: 700, xp: 620, mats: { runestone: 2, silver: 5 }, shards: 24 },
        first: { gold: 1000, cards: ['stormCaller'] },
      },
      {
        id: 'ss2', name: 'Frostlotus Terrace', type: 'battle', x: 24, y: 60, requires: ['ss1'],
        faction: 'conclave', level: 28, field: 'ridge',
        enemyDeck: ['conclaveAdept', 'conclaveSilencer', 'conclaveVoidling'],
        modifiers: ['silenceAura'],
        intro: 'A Silencer on the field. Your abilities will not fire. Everything your deck cleverly does, it stops doing — plan for a battle of raw statistics.',
        tutorial: 'silence',
        rewards: { gold: 760, xp: 660, mats: { frostLotus: 4, runestone: 2 }, shards: 25 },
        first: { gold: 1100, cards: ['wyvern'], mats: { frostLotus: 4 } },
      },
      {
        id: 'ss3', name: 'The Hollow Below', type: 'explore', x: 15, y: 46, requires: ['ss1'],
        icon: ic('pit'), intro: 'The Guardians came from down there. So did the Void Embers.', event: 'hollow',
      },
      {
        id: 'ss4', name: 'Pylon Field', type: 'battle', x: 36, y: 46, requires: ['ss2'],
        faction: 'ancient', level: 30, field: 'ruins',
        enemyDeck: ['guardianSentinel', 'guardianSeeker', 'guardianSentinel'],
        intro: 'Structure armour. Blunt damage does nearly half again as much; everything else scratches.',
        tutorial: 'structurearmor',
        rewards: { gold: 820, xp: 720, mats: { runestone: 4, starIron: 1 }, shards: 26 },
        first: { gold: 1200, cards: ['batteringRam'], mats: { runestone: 4 } },
      },
      {
        id: 'ss5', name: 'The Screaming Vault', type: 'battle', x: 30, y: 30, requires: ['ss3'],
        faction: 'conclave', level: 31, field: 'crypt',
        enemyDeck: ['conclaveVoidling', 'conclaveVoidling', 'conclaveSilencer', 'conclaveWarden'],
        intro: 'Voidlings ignore armour entirely. Your heavy line is decoration here; bring health, not plate.',
        rewards: { gold: 880, xp: 760, mats: { voidEmber: 4, runestone: 3 }, shards: 27 },
        first: { gold: 1300, cards: ['krakenSpawn'], mats: { voidEmber: 4 } },
      },
      {
        id: 'ss6', name: 'Archon\'s Antechamber', type: 'boss', x: 50, y: 36, requires: ['ss4'],
        faction: 'conclave', level: 33, field: 'spire', boss: 'bossSolveil',
        enemyDeck: ['conclaveAdept', 'conclaveWarden', 'conclaveSilencer'],
        mechanic: 'Solveil is immune to one damage type at a time and rotates every eight seconds — slash, pierce, arcane, fire. The colour of her ward tells you which. A single-damage-type deck cannot kill her at all.',
        intro: 'She has been expecting you for some time and has prepared four separate reasons why you cannot hurt her.',
        rewards: { gold: 2400, xp: 1800, mats: { voidEmber: 8, runestone: 8, starIron: 3 }, shards: 52, warSeal: 9, scroll: 7 },
        first: { gold: 3600, cards: ['archmage', 'phoenix'], mats: { crownshard: 1, aether: 1 } },
      },
      {
        id: 'ss7', name: 'Starfall Cache', type: 'cache', x: 44, y: 16, requires: ['ss5'],
        icon: ic('crate'), repeatable: true,
        intro: 'Star iron, if you can get to it before the Seekers do.',
        rewards: { gold: 500, mats: { starIron: 2, runestone: 4, voidEmber: 3, frostLotus: 4 } },
      },
      {
        id: 'ss8', name: 'The Last Camp', type: 'camp', x: 64, y: 22, requires: ['ss6'],
        icon: ic('flame'), intro: 'The Wizard has come out of the Library for this one.', event: 'camp5',
      },
      {
        id: 'ss9', name: 'The Warden\'s Gate', type: 'boss', x: 82, y: 34, requires: ['ss6', 'ss8'],
        faction: 'ancient', level: 36, field: 'spire', boss: 'bossWarden',
        enemyDeck: ['guardianSentinel', 'guardianSeeker', 'guardianColossus'],
        mechanic: 'Four pylons feed the Warden, each granting a different aura: Armour, Haste, Reflection, Regeneration. Break Regeneration first or you will never out-damage it. Break Reflection before you commit casters.',
        intro: 'It has been holding this gate since before the Crown existed. It will listen to your explanation. It will not be moved by it.',
        rewards: { gold: 5000, xp: 3600, mats: { starIron: 8, runestone: 12, aether: 2 }, shards: 80, warSeal: 15, scroll: 12 },
        first: { gold: 9000, cards: ['ironColossus', 'worldEnder'], mats: { crownshard: 3, aether: 2 }, flag: 'campaignComplete' },
      },
      {
        id: 'ss10', name: 'The Endless War', type: 'endless', x: 88, y: 60, requires: ['ss9'],
        icon: ic('infinity'), faction: 'ancient', level: 36, field: 'spire',
        intro: 'The war does not finish. It only changes management. Fight waves of escalating armies for as long as you can hold.',
        desc: 'Endless mode: each wave mixes factions and raises levels. Rewards scale with the wave you reach.',
      },
    ],
  },
};

export const REGION_LIST = Object.values(REGIONS).sort((a, b) => a.order - b.order);
export const getRegion = id => REGIONS[id];

export function getNode(regionId, nodeId) {
  const r = REGIONS[regionId];
  return r ? r.nodes.find(n => n.id === nodeId) : null;
}

export function findNode(nodeId) {
  for (const r of REGION_LIST) {
    const n = r.nodes.find(x => x.id === nodeId);
    if (n) return { region: r, node: n };
  }
  return null;
}

/** Battlefield modifiers a node can carry. Explained in the briefing screen. */
export const MODIFIERS = {
  swarm:       { name: 'Endless Ranks', icon: ic('swarm'), desc: 'The enemy deploys in larger groups and regenerates Command 25% faster.' },
  cover:       { name: 'Heavy Cover', icon: ic('forest'), desc: 'Ranged attacks into the treeline do 25% less damage. Both sides.' },
  thief:       { name: 'Cutpurse', icon: ic('purse'), desc: 'The enemy steals 2 Command from you every 17 seconds until the thief is dead.' },
  fireGround:  { name: 'Burning Ground', icon: ic('flame'), desc: 'Patches of the field are alight. Anything that stands in one burns.' },
  poisonGround:{ name: 'Miasma', icon: ic('poison'), desc: 'Low ground is poisonous. Flyers are unaffected.' },
  enraged:     { name: 'Bloodfury', icon: ic('rage'), desc: 'Every enemy enrages below half health: +60% attack speed.' },
  corpseRise:  { name: 'The Dead Rise', icon: ic('skull'), desc: 'Corpses on the field are raised as Risen by the enemy every 8s. Fire destroys corpses.' },
  silenceAura: { name: 'Sealed Air', icon: ic('silence'), desc: 'Your units within 10m of an enemy Silencer cannot use abilities.' },
  nightfall:   { name: 'Nightfall', icon: ic('moon'), desc: 'Sight range halved for both sides. Assassins and scouts become far more valuable.' },
  highWind:    { name: 'High Wind', icon: ic('wind'), desc: 'Ranged attacks lose 3m of range. Flyers move 20% faster.' },
};

/** Endless-mode wave generator — mixes factions and scales. */
export function endlessWave(n) {
  const factions = ['goblin', 'bandit', 'orc', 'undead', 'conclave', 'beast', 'ancient'];
  const pick = factions[(n * 3 + 1) % factions.length];
  const alt = factions[(n * 5 + 3) % factions.length];
  return {
    wave: n,
    level: 20 + n * 2,
    factions: n < 3 ? [pick] : [pick, alt],
    modifiers: n >= 5 ? [['swarm', 'enraged', 'nightfall', 'corpseRise'][n % 4]] : [],
    bossEvery: 5,
    reward: { gold: 300 + n * 140, xp: 200 + n * 90, shards: 10 + n * 4, warSeal: Math.floor(n / 3) },
  };
}
