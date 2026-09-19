import { ic } from '../art/Icons.js';
/* Dialogue.js — NPC voices and exploration events.

   Dialogue nodes are a small tree:
     { text, opts:[{ label, to, action, requires, hint }] }
   `to: null` closes. `action` is a verb string handed to the world layer.

   The Wizard has the most lines because he is the progression hub and the
   player will speak to him hundreds of times: his greeting rotates by context
   (region reached, research pending, first visit) so he does not go stale.
*/

/* ==========================================================================
   NPCs
   ========================================================================== */

export const NPCS = {

  wizard: {
    id: 'wizard', name: 'Vaelthorn', title: 'Keeper of the Library', icon: ic('mage'),
    color: '#9a6fe0',
    portrait: { robe: 0x3b3f7a, trim: 0x9a6fe0, beard: 0xd8d0bc, glow: 0x9a6fe0 },
    zone: 'library',
    bio: 'Has been in the Library for four hundred and eleven years, of which he will admit to "a while". Knows everything and volunteers roughly a twentieth of it.',
  },

  smith: {
    id: 'smith', name: 'Dunnick Ore', title: 'Master of the Forge', icon: ic('hammer'),
    color: '#e8823a',
    portrait: { apron: 0x5a3a2a, skin: 0xa07040, glow: 0xe8823a },
    zone: 'forge',
    bio: 'Third-generation Crown smith. Speaks in short sentences and long silences. Has been waiting his entire career for someone to bring him Crown Shards.',
  },

  quartermaster: {
    id: 'quartermaster', name: 'Serjeant Bell', title: 'Quartermaster', icon: ic('horn'),
    color: '#d9a441',
    portrait: { coat: 0x2f5f8f, trim: 0xd9a441, glow: 0xd9a441 },
    zone: 'camp',
    bio: 'Runs the camp, the roster and, in practice, most of the army. Keeps a ledger you are not allowed to read.',
  },

  merchant: {
    id: 'merchant', name: 'Odessa Vane', title: 'Trader', icon: ic('purse'),
    color: '#5fa25a',
    portrait: { coat: 0x5a3a4a, trim: 0x8fbf4a, glow: 0x8fbf4a },
    zone: 'market',
    bio: 'Sells things that were recently somebody else\'s. Fair prices, no questions, and an unshakeable belief that the war is good for business.',
  },

  drillmaster: {
    id: 'drillmaster', name: 'Captain Roon', title: 'Drillmaster', icon: ic('medal'),
    color: '#c5362b',
    portrait: { coat: 0x4a4a52, trim: 0xc5362b, glow: 0xc5362b },
    zone: 'training',
    bio: 'Trains the recruits and has strong opinions about your deck. Will tell you them whether or not you ask.',
  },

  marshal: {
    id: 'marshal', name: 'Marshal Corr', title: 'Your Second', icon: ic('scales'),
    color: '#cbbb99',
    portrait: { coat: 0x4a4438, trim: 0xcbbb99, glow: 0xd9a441 },
    zone: 'keep',
    bio: 'Aveline Corr held the Greenmarch line for eleven days with two hundred people and no orders. She is the reason there is still a keep to stand in. She teaches by stating the obvious exactly once and then expecting you to have heard it.',
  },
};

/* ==========================================================================
   THE WIZARD — greetings rotate by context
   ========================================================================== */

export const WIZARD_GREETINGS = {
  first: [
    'Ah. The new commander. Come in, mind the third step, it is older than the building.',
    'I am Vaelthorn. I keep the Library, which is to say I keep everything in it from arguing with everything else in it.',
  ],
  default: [
    'Commander. The kettle is somewhere. Speak while I look for it.',
    'You have the look of someone who wants something translated, transmuted or made lethal.',
    'Come in. Do not touch the blue books.',
    'I was reading. I am always reading. Get on with it.',
    'Careful of the floor there — something spilled in 1187 and it has opinions.',
    'You smell of a battlefield. Good. That means the cards are being used.',
  ],
  research: [
    'There is research waiting on the desk and you are standing in front of it, which I find pointed.',
    'You have scrolls. I have books. The arithmetic here is not complicated.',
  ],
  awaken: [
    'One of your cards is at its ceiling. I can take the ceiling off, if you are prepared for what is underneath.',
  ],
  bossDown: [
    'You killed it. Good. Now I want to know what it was made of — bring me anything that came off it.',
  ],
  regionNew: [
    'A new region. I will find the relevant volume. There is always a relevant volume; that is the entire trouble with this place.',
  ],
};

export const WIZARD_TREE = {
  root: {
    text: 'What do you need?',
    opts: [
      { label: 'Upgrade my cards.', to: null, action: 'openCardUpgrade' },
      { label: 'Show me the research.', to: null, action: 'openResearch' },
      { label: 'I want to brew something.', to: null, action: 'openAlchemy', requires: { research: 'alchemy1' } },
      { label: 'Awaken a card.', to: null, action: 'openAwaken', requires: { research: 'awakening' } },
      { label: 'Tell me about the enemy.', to: 'bestiary' },
      { label: 'Tell me about yourself.', to: 'about' },
      { label: 'Nothing. Just looking.', to: 'idle' },
    ],
  },

  about: {
    text: 'I have been here four hundred and eleven years. Before that I was somewhere else, doing something worse. The Library was a punishment; I have made it a hobby.',
    opts: [
      { label: 'Four hundred years?', to: 'about2' },
      { label: 'What were you punished for?', to: 'about3' },
      { label: 'Back.', to: 'root' },
    ],
  },
  about2: {
    text: 'And eleven. The eleven matter to me. You get very particular about the small numbers when the large ones stop meaning anything.',
    opts: [{ label: 'Back.', to: 'root' }],
  },
  about3: {
    text: 'I gave a king an honest answer. <span class="em">Once.</span> I have been considerably more careful since, which you may have noticed and been irritated by.',
    opts: [
      { label: 'Which king?', to: 'about4' },
      { label: 'Back.', to: 'root' },
    ],
  },
  about4: {
    text: 'The one whose crown you are trying to put back together. He asked me whether the Guardians could be turned off. I told him. He did not like it. Neither, in the end, did anyone.',
    opts: [{ label: '...Back.', to: 'root' }],
  },

  bestiary: {
    text: 'Which of them is currently ruining your week?',
    opts: [
      { label: 'The goblins.', to: 'b_goblin' },
      { label: 'The bandits.', to: 'b_bandit' },
      { label: 'The orcs.', to: 'b_orc' },
      { label: 'The undead.', to: 'b_undead' },
      { label: 'The Conclave.', to: 'b_conclave' },
      { label: 'The Guardians.', to: 'b_ancient' },
      { label: 'Back.', to: 'root' },
    ],
  },
  b_goblin: {
    text: 'Numerous and fragile. They will put nine bodies in front of you and every one of them dies to a single decent area attack. If you are losing to goblins you are killing them one at a time, which is a choice you are making.',
    opts: [{ label: 'Back.', to: 'bestiary' }],
  },
  b_bandit: {
    text: 'They do not fight your army; they go around it. Everything Mara fields is aimed at whatever you left unguarded. Put a Scout on the field and half her plan simply stops existing.',
    opts: [{ label: 'Back.', to: 'bestiary' }],
  },
  b_orc: {
    text: 'Heavy plate and no patience. <span class="em">Blunt damage does half again as much to heavy armour</span> — a Giant is worth three swordsmen against them. And they have no answer at all to being slowed down.',
    opts: [{ label: 'Back.', to: 'bestiary' }],
  },
  b_undead: {
    text: 'Holy damage does <span class="em">double</span>. Poison does essentially nothing — fifteen per cent, which is an insult dressed as a number. And Morvant raises corpses, so bring fire and burn them before he gets to them.',
    opts: [{ label: 'Back.', to: 'bestiary' }],
  },
  b_conclave: {
    text: 'They silence you, ward against you and reflect your magic. Do not try to out-cast them; it is what they are built for. Send something fast with a knife.',
    opts: [{ label: 'Back.', to: 'bestiary' }],
  },
  b_ancient: {
    text: 'Structure armour. Blunt hurts them, everything else apologises. And they cannot chase — take the control points and let them stand there being magnificent at nobody.',
    opts: [{ label: 'Back.', to: 'bestiary' }],
  },

  idle: {
    text: 'Then look. It is a good Library. Do not open the cabinet at the back; the cabinet is not a cabinet.',
    opts: [{ label: 'Leave.', to: null }],
  },
};

/* ==========================================================================
   OTHER NPC TREES
   ========================================================================== */

export const SMITH_TREE = {
  root: {
    text: 'Commander.',
    opts: [
      { label: 'Forge something.', to: null, action: 'openForge' },
      { label: 'Upgrade my equipment.', to: null, action: 'openUpgradeGear' },
      { label: 'Talk to me about armour.', to: 'armour' },
      { label: 'Nothing.', to: null },
    ],
  },
  armour: {
    text: 'Three families. Heavy stops more and slows you. Light stops less and keeps you alive by not being there when it lands. Magic stops the things the other two cannot.',
    opts: [
      { label: 'Which should I wear?', to: 'armour2' },
      { label: 'Back.', to: 'root' },
    ],
  },
  armour2: {
    text: 'Depends what you do. Stand in the line — heavy. Circle and stab — light. Cast — robes, and accept that a crossbow bolt ends the conversation.\n\nWeight is the honest cost. Every point of it is speed you do not have.',
    opts: [{ label: 'Back.', to: 'root' }],
  },
};

export const QM_TREE = {
  root: {
    text: 'Commander. Roster\'s current, the men are fed, and nobody\'s deserted since Tuesday.',
    opts: [
      { label: 'Show me the army.', to: null, action: 'openArmy' },
      { label: 'Show me the collection.', to: null, action: 'openCollection' },
      { label: 'Any advice?', to: 'advice' },
      { label: 'Carry on, Serjeant.', to: null },
    ],
  },
  advice: {
    text: 'Eight cards. Not seven good ones and a favourite.\n\nAnd mind your average cost — if everything you own costs five, you will spend the first minute of every battle watching.',
    opts: [
      { label: 'What should a deck look like?', to: 'advice2' },
      { label: 'Back.', to: 'root' },
    ],
  },
  advice2: {
    text: 'Something that holds. Something that kills at range. Something cheap you can throw away. Something that answers a big single target, and something that answers twelve small ones.\n\nAfter that, taste.',
    opts: [{ label: 'Back.', to: 'root' }],
  },
};

export const MERCHANT_TREE = {
  root: {
    text: 'Commander! Come in, come in. Everything here is legally mine as of about an hour ago.',
    opts: [
      { label: 'Show me your stock.', to: null, action: 'openShop' },
      { label: 'Where do you get all this?', to: 'source' },
      { label: 'Not today.', to: null },
    ],
  },
  source: {
    text: 'Battlefields, mostly. You would be amazed what an army leaves lying about once it stops needing things.\n\nI prefer to think of it as redistribution.',
    opts: [{ label: 'Back.', to: 'root' }],
  },
};

export const DRILL_TREE = {
  root: {
    text: 'Commander. Ground\'s free if you want to work.',
    opts: [
      { label: 'Run a practice battle.', to: null, action: 'openTraining' },
      { label: 'Explain the counters to me.', to: null, action: 'openCounters' },
      { label: 'Tell me about positioning.', to: 'pos' },
      { label: 'Later.', to: null },
    ],
  },
  pos: {
    text: 'Three things, and only three.\n\n<span class="em">One:</span> ranged units behind a guardian hit twenty-two per cent harder. Walk them up together.\n\n<span class="em">Two:</span> attacks from outside a unit\'s front arc do twenty per cent more. Flank, and do not be flanked.\n\n<span class="em">Three:</span> archers on high ground gain range and damage both. The ridge is not scenery.',
    opts: [
      { label: 'And the control points?', to: 'pos2' },
      { label: 'Back.', to: 'root' },
    ],
  },
  pos2: {
    text: 'Each one you hold gives you Command faster and pushes your deployment line eleven metres forward. Forward deployment is worth more than the Command, most days — it means your reinforcements arrive in the fight instead of walking to it.',
    opts: [{ label: 'Back.', to: 'root' }],
  },
};

/* --------------------------------------------------------------- MARSHAL
   The Marshal is the game's teacher. Her tree is the permanent version of
   the tutorial: anything the opening explained once, she will explain again,
   on demand, forever. A player who skipped the tutorial or came back after a
   month can get the whole game out of her in six clicks. */

export const MARSHAL_TREE = {
  root: {
    text: 'Commander. The table is yours whenever you want it.',
    opts: [
      { label: 'Remind me what I am doing.', to: 'loop' },
      { label: 'How do battles actually work?', to: 'battle' },
      { label: 'What are cards, and how do I get more?', to: 'cards' },
      { label: 'Who is who around here?', to: 'people' },
      { label: 'Open the war map.', to: null, action: 'map' },
      { label: 'Nothing right now.', to: null },
    ],
  },
  loop: {
    text: 'Win a battle. It pays gold, experience and shards.\n\n<span class="em">Shards</span> go to the Wizard and make a card stronger. <span class="em">Gold and materials</span> go to the smith and make YOU stronger. A stronger army opens harder ground, and harder ground pays better.\n\nThat is the entire war. Everything else is detail.',
    opts: [
      { label: 'Where do new cards come from?', to: 'cards' },
      { label: 'Back.', to: 'root' },
    ],
  },
  battle: {
    text: 'You are on the field yourself — you are not watching from a cloud.\n\n<span class="em">Command</span> fills up on its own. Spend it to put cards down inside your deploy zone. Hold the <span class="em">control points</span> and it fills faster and your deploy line moves forward.\n\nKill their banner, or have more banner left than they do when time runs out.',
    opts: [
      { label: 'What about me personally?', to: 'you' },
      { label: 'Back.', to: 'root' },
    ],
  },
  you: {
    text: 'WASD moves you, Space dodges, Q E R are whatever your gear grants you. Your armour decides what kind of commander you are: plate stands in the line, leather goes round the flank, robes stay behind the Giant and burn things.\n\nYou can die. You come back at the banner, and it costs you a Command. Try not to make a habit of it.',
    opts: [{ label: 'Back.', to: 'root' }],
  },
  cards: {
    text: 'Cards come from <span class="em">first clears</span> — the first time you take a piece of ground it hands you something new — from <span class="em">chests</span> in the market, and from shards piling up until they become a card on their own.\n\nYou started with three slots. Every couple of victories earns you another, up to eight. Do not rush it; three cards you understand beat eight you do not.',
    opts: [
      { label: 'How do I make one stronger?', to: 'upgrade' },
      { label: 'Back.', to: 'root' },
    ],
  },
  upgrade: {
    text: 'Shards and gold, at the Wizard\'s Card Study. Every level is more health and more damage, and every third level the unit visibly changes — better trim, then pauldrons and a plume, then a cape and lit runes.\n\nThat is deliberate. You should be able to look at a line of knights and know which ones have been somewhere.',
    opts: [
      { label: 'Take me there.', to: null, action: 'library' },
      { label: 'Back.', to: 'root' },
    ],
  },
  people: {
    text: '<span class="em">Vaelthorn</span> in the Library: card levels, research, potions, and the Codex if you want to know what you are fighting.\n\n<span class="em">Dunnick</span> at the Forge: your weapons and armour.\n\n<span class="em">Serjeant Bell</span> at the camp: the roster and the challenge board.\n\n<span class="em">Odessa</span> in the market: sells anything.\n\n<span class="em">Captain Roon</span> on the training ground: practice fights, and the counter table.',
    opts: [{ label: 'Back.', to: 'root' }],
  },
};

/* ==========================================================================
   EXPLORATION EVENTS
   Choices with real trade-offs: risk material for material, or take a fight.
   ========================================================================== */

export const EVENTS = {

  orchard: {
    title: 'The Old Orchard',
    scene: 'forest',
    text: 'The trees have gone feral and the fruit is small and hard and everywhere. Something has been eating here: the grass is flattened in a wide circle, and there are bones in it that are not apple.',
    opts: [
      { label: 'Gather what you can and leave quickly.',
        result: { mats: { herb: 4, cloth: 2 }, gold: 60 },
        text: 'You fill two sacks and are back on the road before the light goes. Unglamorous. Effective.' },
      { label: 'Follow the flattened grass.',
        risk: 0.45,
        result: { mats: { herb: 6, leather: 5 }, gold: 140, shards: 8 },
        fail: { hpCost: 0.2, mats: { herb: 2 } },
        text: 'The trail leads to a den, and the den leads to a very short argument.' },
      { label: 'Burn the dead trees for the ash.',
        result: { mats: { oak: 6 }, gold: 30, flag: 'burnedOrchard' },
        text: 'The smoke is visible for three days. The Greenmarch is not sorry to see the orchard go.' },
    ],
  },

  chapel: {
    title: 'The Drowned Chapel',
    scene: 'ruins',
    text: 'Half a chapel, standing in three feet of black water. The altar is still above the waterline. Someone has left offerings on it — recently.',
    opts: [
      { label: 'Take the offerings.',
        result: { gold: 260, mats: { silver: 1 } },
        text: 'Coin, a silver clasp, and a note you decide not to read.' },
      { label: 'Leave them and search the vestry instead.',
        result: { mats: { cloth: 6, arcaneDust: 3 }, scroll: 2 },
        text: 'Robes, candles, and a bundle of research notes in a hand the Wizard will recognise immediately.' },
      { label: 'Dive for whatever is under the water.',
        risk: 0.5,
        result: { mats: { steel: 4, arcaneDust: 4 }, gold: 220, shards: 12 },
        fail: { hpCost: 0.25 },
        text: 'Cold, black, and deeper than it looks.' },
    ],
  },

  slagpits: {
    title: 'The Slag Pits',
    scene: 'waste',
    text: 'Emberglass, whole seams of it, glittering in the pit walls. It is also four hundred feet down and the walls are not stable, which is presumably why the orcs have not bothered.',
    opts: [
      { label: 'Work the upper seams carefully.',
        result: { mats: { emberglass: 4, iron: 6 } },
        text: 'Slow, safe, and enough emberglass to matter.' },
      { label: 'Go deep.',
        risk: 0.5,
        result: { mats: { emberglass: 10, dragonbone: 2, steel: 4 }, gold: 300 },
        fail: { hpCost: 0.3, mats: { emberglass: 2 } },
        text: 'The good seams are at the bottom. Everything is at the bottom.' },
      { label: 'Collapse the pit and take the surface scatter.',
        result: { mats: { emberglass: 6 }, gold: 160, flag: 'collapsedPit' },
        text: 'Nobody else is getting anything out of this pit. That was, if you are honest, most of the appeal.' },
    ],
  },

  archivist: {
    title: "The Archivist's House",
    scene: 'crypt',
    text: 'Morvant\'s study, exactly as he left it four hundred years ago, down to a cup of something on the desk. The shelves are alphabetised. The window is open.\n\nThe Wizard asked you to bring back anything with his handwriting on it.',
    opts: [
      { label: "Take the notes for the Wizard.",
        result: { scroll: 5, mats: { arcaneDust: 6 }, flag: 'morvantNotes' },
        text: 'Vaelthorn will be delighted and will pretend to be merely interested.' },
      { label: 'Take the valuables instead.',
        result: { gold: 700, mats: { silver: 4 } },
        text: 'A scholar\'s life savings. He has not needed them for some time.' },
      { label: 'Read the last entry.',
        result: { scroll: 3, xp: 400, flag: 'readMorvant', codex: 'morvant' },
        text: '"They will not let me finish the index. I have found a way to finish the index." The handwriting does not change at all.' },
    ],
  },

  hollow: {
    title: 'The Hollow Below',
    scene: 'spire',
    text: 'A shaft going down into the mountain, lined with carved stone that predates every language you know. Cold air comes up it. So, occasionally, does light.',
    opts: [
      { label: 'Descend to the first landing.',
        result: { mats: { voidEmber: 3, runestone: 2 }, scroll: 3 },
        text: 'Void embers, cold to the touch, in a carved bowl that was clearly put there for collecting them.' },
      { label: 'Go all the way down.',
        risk: 0.55,
        result: { mats: { voidEmber: 6, runestone: 5, starIron: 2 }, gold: 900, shards: 20, codex: 'hollow' },
        fail: { hpCost: 0.35, mats: { voidEmber: 2 } },
        text: 'There is a floor. There is something on the floor. It does not follow you back up, which you spend several days thinking about.' },
      { label: 'Seal it.',
        result: { gold: 400, xp: 600, flag: 'sealedHollow' },
        text: 'Whatever the Guardians were built to hold, you have just given them a hand. It is the responsible decision and it costs you a fortune in materials you will never see.' },
    ],
  },

  /* ------------------------------------------------------------ camps */

  camp1: {
    title: 'The Standing Stones',
    scene: 'forest', npc: 'quartermaster',
    text: '<span class="em">Serjeant Bell:</span> "First proper camp since we set out. The men are calling it a victory, which it isn\'t, but I\'m not going to be the one to tell them.\n\nYou\'ve a choice, Commander. Rest and we go in fresh. Push on and we go in first."',
    opts: [
      { label: 'Rest. Let them have the night.',
        result: { heal: 1, mats: { herb: 3 }, xp: 120 },
        text: 'They sing badly for two hours and sleep like the dead. In the morning everything is easier.' },
      { label: 'Push on before dawn.',
        result: { gold: 300, xp: 260, flag: 'pushedOn' },
        text: 'You take the hill before the warband knows you are in the region. Bell says nothing, which is itself a comment.' },
      { label: 'Drill through the night.',
        result: { xp: 400, scroll: 1 },
        text: 'Captain Roon would approve. The men do not. They are, however, noticeably better.' },
    ],
  },

  camp2: {
    title: 'Fenwatch Ruin',
    scene: 'ruins', npc: 'quartermaster',
    text: '<span class="em">Serjeant Bell:</span> "Found something in the cellar, Commander. Coalition strongbox. Three locks on it, and the third one\'s not a lock."',
    opts: [
      { label: 'Force it.', risk: 0.4,
        result: { gold: 600, mats: { steel: 5 }, shards: 14 },
        fail: { hpCost: 0.15 },
        text: 'The third lock was a trap, and the trap was only partly successful.' },
      { label: 'Leave it for the Wizard.',
        result: { scroll: 4, mats: { arcaneDust: 5 }, xp: 200 },
        text: 'Vaelthorn opens it in six seconds and refuses to explain how.' },
      { label: 'Rest instead.',
        result: { heal: 1, mats: { herb: 4, cloth: 3 }, xp: 150 },
        text: 'Three walls is more shelter than you have had in a week.' },
    ],
  },

  camp3: {
    title: 'The Last Well',
    scene: 'waste', npc: 'drillmaster',
    text: '<span class="em">Captain Roon:</span> "Clean water and forty miles of glass in every direction. This is the last good ground before Gharuk.\n\nI can drill them, or you can let them drink and sleep. I\'ll tell you honestly, Commander: I don\'t know which is right."',
    opts: [
      { label: 'Drill them.',
        result: { xp: 700, flag: 'drilledAtWell' },
        text: 'They hate every minute of it. In four days, several of them will be alive because of it.' },
      { label: 'Let them rest.',
        result: { heal: 1, xp: 250, mats: { herb: 5 }, gold: 200 },
        text: 'Roon says nothing and lets them sleep, which from Roon is practically tenderness.' },
      { label: 'Send scouts to Gharuk\'s camp.',
        result: { scroll: 3, xp: 350, flag: 'scoutedGharuk', codex: 'gharuk' },
        text: 'Two go out. Two come back, which is better than you had budgeted for. Now you know where he stands and what he is waiting for.' },
    ],
  },

  camp4: {
    title: 'The Lantern Row',
    scene: 'crypt', npc: 'wizard',
    text: '<span class="em">Vaelthorn:</span> "Somebody lights these. Every night, for four hundred years, somebody walks this row with a taper.\n\nIt is not Morvant. I checked. I would like very much to know who it is, and I would like even more to not find out while standing here."',
    opts: [
      { label: 'Wait and watch.',
        result: { scroll: 5, xp: 600, codex: 'lanterns', flag: 'sawLanternKeeper' },
        text: 'At the third hour, something small and patient comes down the row with a taper, and nods to you, and carries on.' },
      { label: 'Take the lanterns.',
        result: { mats: { silver: 5, arcaneDust: 6 }, gold: 500 },
        text: 'Silver, every one of them. The Wizard is quiet on the walk back.' },
      { label: 'Rest and move on.',
        result: { heal: 1, xp: 300, mats: { boneMeal: 6 } },
        text: 'You sleep badly, but you sleep.' },
    ],
  },

  camp5: {
    title: 'The Last Camp',
    scene: 'spire', npc: 'wizard',
    text: '<span class="em">Vaelthorn:</span> "I have not left the Library in eighty years and I have now walked up a mountain. I want that on a record somewhere.\n\nThe Warden is through that gate. I told a king, once, that it could not be turned off. I have spent four hundred years deciding whether I was right."',
    opts: [
      { label: 'Were you?',
        result: { scroll: 8, xp: 1200, codex: 'warden', flag: 'wizardConfession' },
        text: '"No," he says. "There is a way. It is the four pylons, and it is obvious, and I did not see it for three hundred years because I was not looking for a way — I was looking for an excuse."' },
      { label: 'Rest. Tomorrow is enough.',
        result: { heal: 1, xp: 800, mats: { starIron: 1 } },
        text: 'Nobody sleeps. Everybody pretends to. In the morning you go up.' },
      { label: 'Ask him to come in with you.',
        result: { xp: 1000, scroll: 6, flag: 'wizardJoins' },
        text: 'He looks at the gate for a long moment. "I will be at the back," he says, "shouting useful things." It is, from Vaelthorn, an act of enormous courage.' },
    ],
  },
};

/* ==========================================================================
   TUTORIAL / HINT LINES — surfaced by the battle HUD at the right moment
   ========================================================================== */

export const TUTORIALS = {
  deploy: {
    title: 'Deploying',
    lines: [
      'Press <b>1–4</b> or click a card, then click the ground to deploy.',
      'You can only deploy inside the blue zone. Take control points to push it forward.',
      'Command regenerates over time. Spending it all at once leaves you with nothing when they push.',
    ],
  },
  chokepoint: {
    title: 'Chokepoints',
    lines: [
      'A narrow crossing means only a few units can fight at once.',
      'That favours whoever has <b>fewer, better</b> units. Hold the bridge; do not race across it.',
    ],
  },
  highground: {
    title: 'High Ground',
    lines: [
      'Ranged units on a ridge gain <b>+25% range and +20% damage</b>.',
      'Taking the ridge is usually worth more than the kill you gave up to take it.',
    ],
  },
  armortypes: {
    title: 'Armour Types',
    lines: [
      'Orc plate is <b>heavy armour</b>. Pierce glances off it (×0.62). Blunt crushes it (×1.50).',
      'The card tells you its damage type. The enemy roster on the briefing screen tells you their armour.',
    ],
  },
  antilarge: {
    title: 'Stopping a Charge',
    lines: [
      'Spearmen and Pikewall deal <b>+120% damage to large units</b> (mass 3+).',
      'A charge that hits a set spear wall stops being a charge.',
    ],
  },
  flank: {
    title: 'Flanking',
    lines: [
      'Attacks from outside a unit\'s front arc do <b>+20%</b> damage.',
      'Assassins ignore your frontline entirely and go for casters and healers. Keep something fast at home.',
    ],
  },
  cover: {
    title: 'Cover',
    lines: [
      'Units in the treeline take <b>25% less ranged damage</b>.',
      'It works for both sides. If they are hiding in cover, close the distance.',
    ],
  },
  holy: {
    title: 'Holy and the Undead',
    lines: [
      'Holy damage does <b>double</b> to undead armour. Poison does <b>15%</b>.',
      'One Paladin or Battle Priest in Hollowmere is worth three of anything else.',
    ],
  },
  corpses: {
    title: 'Corpses',
    lines: [
      'The undead raise corpses — including yours.',
      '<b>Fire destroys corpses.</b> A single burning unit denies their entire economy.',
    ],
  },
  silence: {
    title: 'Silence',
    lines: [
      'Silenced units cannot use abilities at all.',
      'Kill the Silencer first, or field units whose value is in their raw statistics rather than their tricks.',
    ],
  },
  reflect: {
    title: 'Reflection',
    lines: [
      'Ward Keepers reflect <b>35%</b> of magical damage back at the caster.',
      'Send steel at them, not spells.',
    ],
  },
  structurearmor: {
    title: 'Structure Armour',
    lines: [
      'Guardians use <b>structure armour</b>: blunt does ×1.45, slash does ×0.45.',
      'Siege units and Giants are the answer. Swords are not.',
    ],
  },
};
