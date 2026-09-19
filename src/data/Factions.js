import { ic } from '../art/Icons.js';
/* Factions.js — the armies you fight, and how each one thinks.

   A faction is not a palette swap. Each has its own roster, its own deployment
   doctrine (how the enemy director spends Command) and a stated weakness the
   player can actually exploit once they have read the codex.
*/

export const FACTIONS = {

  goblin: {
    id: 'goblin', name: 'Goblin Warband', icon: ic('goblin'),
    color: '#6a8a3a', accent: '#d9a441',
    banner: 'ragged', terrain: 'forest',
    roster: ['goblinCutter', 'goblinArcher', 'goblinBomber', 'goblinShaman', 'goblinWolfRider'],
    doctrine: {
      // how the AI spends: aggression 0..1, how much it saves, how it groups
      aggression: 0.85, saveThreshold: 4, preferSwarm: true, pushInterval: 5,
      opening: ['goblinCutter', 'goblinCutter', 'goblinArcher'],
    },
    identity: 'Cheap, fast, endless. They arrive before you are ready and they do not stop arriving.',
    strength: 'Overwhelming numbers. A goblin push is nine bodies, not one.',
    weakness: 'Everything they field is fragile and unarmoured. Any area damage — a Mage, a Firebomber, a Giant\'s slam — removes an entire wave at once.',
    counterAdvice: 'Bring area damage and a body that can hold a chokepoint. Single-target damage will drown.',
    codex: 'The warbands of the Greenmarch have no strategy worth the name and do not need one. They simply out-number the problem.',
  },

  bandit: {
    id: 'bandit', name: 'Bandit Coalition', icon: ic('dagger'),
    color: '#8a4a2a', accent: '#c5362b',
    banner: 'black', terrain: 'fen',
    roster: ['banditCutthroat', 'banditCrossbow', 'banditBruiser', 'banditCutpurse'],
    doctrine: {
      aggression: 0.55, saveThreshold: 6, preferFlank: true, pushInterval: 8,
      opening: ['banditCrossbow', 'banditCutthroat'],
      harass: true,
    },
    identity: 'They do not fight your army. They go around it, rob you, and fight whatever is left.',
    strength: 'Flankers and stealth. Your backline is their actual target.',
    weakness: 'No real frontline. If you force them into a straight fight at a chokepoint they lose badly.',
    counterAdvice: 'A Scout or any reveal effect turns their entire plan off. Guard your casters and hold ground rather than chasing.',
    codex: 'Mara Blackhand runs the Fen coalition the way a good merchant runs a warehouse: nothing moves without her knowing.',
  },

  orc: {
    id: 'orc', name: 'Orc Horde', icon: ic('axe'),
    color: '#5a7a4a', accent: '#c5362b',
    banner: 'bone', terrain: 'waste',
    roster: ['orcGrunt', 'orcBerserker', 'orcShaman', 'orcWarboar', 'orcSiegeThrower'],
    doctrine: {
      aggression: 0.95, saveThreshold: 5, preferBig: true, pushInterval: 6,
      opening: ['orcGrunt', 'orcGrunt'],
      relentless: true,
    },
    identity: 'Heavy armour, heavy damage, forward at all times. They never defend.',
    strength: 'Straight-line power. An orc push that reaches your line will break it.',
    weakness: 'Almost no ranged presence and no answer to control. Roots, slows and freezes stop them dead — literally.',
    counterAdvice: 'Blunt damage does 50% extra to their heavy armour. A Frost Mage or a Warden buys you all the time you need.',
    codex: 'Gharuk does not believe in reserves. He believes everything should be at the front, including himself, especially himself.',
  },

  undead: {
    id: 'undead', name: 'Undead Legion', icon: ic('skull'),
    color: '#6a6a5a', accent: '#79cfe0',
    banner: 'tattered', terrain: 'mere',
    roster: ['undeadRisen', 'undeadBoneArcher', 'undeadWraith', 'undeadPlagueCart', 'undeadBoneGiant'],
    doctrine: {
      aggression: 0.7, saveThreshold: 5, attrition: true, pushInterval: 7,
      opening: ['undeadRisen', 'undeadBoneArcher'],
    },
    identity: 'They win by lasting longer than you. Every corpse on the field is theirs eventually.',
    strength: 'Attrition. They raise your dead and their own, and the army grows as the battle runs.',
    weakness: 'Holy damage does DOUBLE to undead armour. Poison does almost nothing. Fire burns the corpses away before they can be raised.',
    counterAdvice: 'A Paladin or Battle Priest is worth three of anything else here. Bring at least one source of fire to deny the corpses.',
    codex: 'Morvant was a scholar before he was a problem. He still annotates the margins of the orders he gives.',
  },

  conclave: {
    id: 'conclave', name: 'Dark Conclave', icon: ic('orb'),
    color: '#3a2a4a', accent: '#b07fd0',
    banner: 'sigil', terrain: 'spire',
    roster: ['conclaveAdept', 'conclaveWarden', 'conclaveSilencer', 'conclaveVoidling'],
    doctrine: {
      aggression: 0.45, saveThreshold: 7, protectCasters: true, pushInterval: 9,
      opening: ['conclaveWarden', 'conclaveAdept'],
      counterPlay: true,
    },
    identity: 'A caster army that turns off whatever you were relying on, then kills it slowly.',
    strength: 'Silences, wards and reflection. Your abilities stop working and your mages hurt themselves.',
    weakness: 'Almost nothing they field has real health. Anything fast that reaches the back line ends the fight.',
    counterAdvice: 'Assassins, flyers and cavalry. Do not try to out-magic them — their wards make arcane damage nearly useless.',
    codex: 'The Conclave believes that magic is the only real force in the world and that everything else is a delay.',
  },

  beast: {
    id: 'beast', name: 'Beasts of the Wild', icon: ic('wolf'),
    color: '#4a4a52', accent: '#8fbf4a',
    banner: 'none', terrain: 'forest',
    roster: ['beastDireWolf', 'beastSpider', 'beastBehemoth', 'houndPack'],
    doctrine: {
      aggression: 0.8, saveThreshold: 4, preferFlank: true, pushInterval: 5,
      opening: ['beastDireWolf', 'beastDireWolf'],
    },
    identity: 'Fast, coordinated and entirely uninterested in your formation.',
    strength: 'Speed. They are on your archers in four seconds.',
    weakness: 'Fire does 35% extra to beast hide, and they have no ranged units at all.',
    counterAdvice: 'Anything that burns. Keep your ranged units tucked behind a guardian or lose them.',
    codex: 'Not an army. A migration that happens to be pointed at you.',
  },

  ancient: {
    id: 'ancient', name: 'Ancient Guardians', icon: ic('statue'),
    color: '#7a7a68', accent: '#ffd479',
    banner: 'stone', terrain: 'ruin',
    roster: ['guardianSentinel', 'guardianSeeker', 'guardianColossus'],
    doctrine: {
      aggression: 0.35, saveThreshold: 8, defensive: true, pushInterval: 12,
      opening: ['guardianSentinel'],
      holdPoints: true,
    },
    identity: 'They do not attack. They occupy, and everything you send is ground down against them.',
    strength: 'Enormous armour and structure-class defences. Ordinary damage does almost nothing.',
    weakness: 'Structure armour takes 45% extra from blunt damage, and every one of them is slow. Anything that ignores armour outright deletes them.',
    counterAdvice: 'Blunt and armour-ignoring damage. Take the control points instead of trading — they cannot chase you.',
    codex: 'Nine hundred years of standing perfectly still, waiting for an order that will not come. They will outlast this war too.',
  },

  /* The player's own side, for the codex and unit colouring. */
  crown: {
    id: 'crown', name: 'Army of the Iron Crown', icon: ic('crown'),
    color: '#2f5f8f', accent: '#d9a441',
    banner: 'crown', terrain: 'keep',
    roster: [],
    identity: 'Whatever you build it into.',
    codex: 'Yours.',
  },
};

export const getFaction = id => FACTIONS[id] || FACTIONS.crown;
export const FACTION_LIST = Object.values(FACTIONS).filter(f => f.id !== 'crown');

/** Team colours used by the battle renderer and the HUD. */
export const TEAM_COLOR = {
  0: { primary: 0x2f5f8f, glow: 0x7fb6e8, ring: 0x5aa6d8, name: 'Yours' },
  1: { primary: 0x8e3229, glow: 0xe08b7f, ring: 0xc5362b, name: 'Enemy' },
};
