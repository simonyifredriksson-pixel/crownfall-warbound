/* Quests.js — challenges and the long-term goal list.

   Every quest is a counter with a target. `track` names the bus event and a
   predicate; Progression wires them up generically, so adding a quest here
   needs no code anywhere else.
*/

import { EV } from '../core/Bus.js';
import { ic } from '../art/Icons.js';

const Q = (o) => ({ repeatable: false, hidden: false, ...o });

export const QUESTS = {

  /* ------------------------------------------------- opening objectives */

  firstBlood: Q({
    id: 'firstBlood', name: 'First Blood', icon: ic('swords'), chapter: 1,
    desc: 'Win your first battle.',
    target: 1, track: { evt: EV.BATTLE_END, test: p => p.victory },
    reward: { gold: 100, xp: 50 },
  }),

  learnTheLine: Q({
    id: 'learnTheLine', name: 'Hold the Line', icon: ic('shield'), chapter: 1,
    desc: 'Win a battle without losing a single guardian.',
    target: 1, track: { evt: EV.BATTLE_END, test: p => p.victory && p.stats.guardiansLost === 0 },
    reward: { gold: 200, shards: { knight: 15 } },
  }),

  firstUpgrade: Q({
    id: 'firstUpgrade', name: 'Veteran Steel', icon: ic('chevron'), chapter: 1,
    desc: 'Upgrade any card to level 3.',
    target: 1, track: { evt: EV.CARD_UPGRADED, test: p => p.level >= 3 },
    reward: { gold: 150, scroll: 2 },
  }),

  meetTheWizard: Q({
    id: 'meetTheWizard', name: 'Mind the Third Step', icon: ic('mage'), chapter: 1,
    desc: 'Visit the Wizard in the Library.',
    target: 1, track: { evt: EV.NPC_TALK, test: p => p.npc === 'wizard' },
    reward: { scroll: 3, gold: 100 },
  }),

  firstForge: Q({
    id: 'firstForge', name: 'Hot Work', icon: ic('hammer'), chapter: 1,
    desc: 'Craft your first piece of equipment.',
    target: 1, track: { evt: EV.ITEM_CRAFTED, test: () => true },
    reward: { gold: 250, mats: { iron: 6 } },
  }),

  /* ------------------------------------------------- tactical challenges */

  combinedArms: Q({
    id: 'combinedArms', name: 'Combined Arms', icon: ic('scales'), chapter: 2,
    desc: 'Win a battle with a deck containing four or more damage types.',
    target: 1, track: { evt: EV.BATTLE_END, test: p => p.victory && p.dmgTypes >= 4 },
    reward: { gold: 400, scroll: 3 },
  }),

  theCheapWay: Q({
    id: 'theCheapWay', name: 'The Cheap Way', icon: ic('swarm'), chapter: 2,
    desc: 'Win a battle in which your deck\'s average Command cost is 3.0 or lower.',
    target: 1, track: { evt: EV.BATTLE_END, test: p => p.victory && p.avgCost <= 3.0 },
    reward: { gold: 400, shards: { militia: 20 } },
  }),

  untouched: Q({
    id: 'untouched', name: 'Untouched', icon: ic('crown'), chapter: 2,
    desc: 'Win a battle without your commander taking any damage.',
    target: 1, track: { evt: EV.BATTLE_END, test: p => p.victory && p.stats.cmdDamageTaken === 0 },
    reward: { gold: 600, warSeal: 2 },
  }),

  pointsMatter: Q({
    id: 'pointsMatter', name: 'Ground Is Everything', icon: ic('banner'), chapter: 2,
    desc: 'Hold every control point at once in a single battle.',
    target: 1, track: { evt: EV.POINT_CAPTURED, test: p => p.allHeld },
    reward: { gold: 350, scroll: 2 },
  }),

  siegeMaster: Q({
    id: 'siegeMaster', name: 'Siege Master', icon: ic('rock'), chapter: 3,
    desc: 'Destroy an enemy banner while it still has both towers standing.',
    target: 1, track: { evt: EV.STRUCTURE_DESTROYED, test: p => p.kind === 'banner' && p.towersAlive === 2 },
    reward: { gold: 700, mats: { steel: 10 } },
  }),

  perfectCounter: Q({
    id: 'perfectCounter', name: 'The Right Tool', icon: ic('target'), chapter: 3,
    desc: 'Deal 20,000 damage at a counter multiplier of 1.5 or better across all battles.',
    target: 20000, track: { evt: EV.DAMAGE_DEALT, test: p => p.counter >= 1.5, amount: p => p.dmg },
    reward: { gold: 900, scroll: 4 },
  }),

  oilAndFlame: Q({
    id: 'oilAndFlame', name: 'Pitch and Flame', icon: ic('flame'), chapter: 3,
    desc: 'Kill 50 enemies with fire damage while they are Oiled.',
    target: 50, track: { evt: EV.UNIT_DIED, test: p => p.byFire && p.wasOiled },
    reward: { gold: 800, cards: ['firebomber'], mats: { emberglass: 6 } },
  }),

  /* ------------------------------------------------- collection & growth */

  collector1: Q({
    id: 'collector1', name: 'A Real Army', icon: ic('cards'), chapter: 2,
    desc: 'Unlock 12 different cards.',
    target: 12, track: { evt: EV.CARD_UNLOCKED, test: () => true },
    reward: { gold: 500, scroll: 3 },
  }),
  collector2: Q({
    id: 'collector2', name: 'The Full Roster', icon: ic('cards'), chapter: 4,
    desc: 'Unlock 28 different cards.',
    target: 28, track: { evt: EV.CARD_UNLOCKED, test: () => true },
    reward: { gold: 2000, warSeal: 5, mats: { crownshard: 1 } },
  }),

  tenTen: Q({
    id: 'tenTen', name: 'Ten at Ten', icon: ic('chevron'), chapter: 4,
    desc: 'Have ten different cards at level 10 or higher.',
    target: 10, track: { evt: EV.CARD_UPGRADED, test: p => p.level === 10, unique: true },
    reward: { gold: 2500, scroll: 8 },
  }),

  awakened: Q({
    id: 'awakened', name: 'Awakened', icon: ic('star'), chapter: 5,
    desc: 'Awaken any card.',
    target: 1, track: { evt: EV.CARD_AWAKENED, test: () => true },
    reward: { gold: 3000, warSeal: 6 },
  }),

  wellDressed: Q({
    id: 'wellDressed', name: 'Well Dressed', icon: ic('chest'), chapter: 3,
    desc: 'Have every equipment slot filled at once.',
    target: 1, track: { evt: EV.ITEM_EQUIPPED, test: p => p.allSlotsFilled },
    reward: { gold: 700, mats: { steel: 8, leather: 8 } },
  }),

  scholar: Q({
    id: 'scholar', name: 'Scholar', icon: ic('book'), chapter: 4,
    desc: 'Complete 8 research projects.',
    target: 8, track: { evt: EV.RESEARCH_DONE, test: () => true },
    reward: { gold: 2200, mats: { runestone: 4 } },
  }),

  /* ---------------------------------------------------------- campaign */

  region1: Q({ id: 'region1', name: 'The Greenmarch is Ours', icon: ic('tree'), chapter: 1,
    desc: 'Defeat Gribnak, Goblin King.', target: 1,
    track: { evt: EV.NODE_CLEARED, test: p => p.nodeId === 'gm9' },
    reward: { gold: 600, scroll: 4 } }),
  region2: Q({ id: 'region2', name: 'The Fen is Quiet', icon: ic('wheat'), chapter: 2,
    desc: 'Defeat Mara Blackhand.', target: 1,
    track: { evt: EV.NODE_CLEARED, test: p => p.nodeId === 'bb9' },
    reward: { gold: 1200, scroll: 5 } }),
  region3: Q({ id: 'region3', name: 'The Waste Holds', icon: ic('volcano'), chapter: 3,
    desc: 'Defeat Warchief Gharuk.', target: 1,
    track: { evt: EV.NODE_CLEARED, test: p => p.nodeId === 'aw9' },
    reward: { gold: 2400, scroll: 6, mats: { dragonbone: 3 } } }),
  region4: Q({ id: 'region4', name: 'Hollowmere Rests', icon: ic('skull'), chapter: 4,
    desc: 'Defeat Morvant the Undying.', target: 1,
    track: { evt: EV.NODE_CLEARED, test: p => p.nodeId === 'hm9' },
    reward: { gold: 4000, scroll: 8, mats: { silver: 10 } } }),
  region5: Q({ id: 'region5', name: 'The Crown Restored', icon: ic('crown'), chapter: 5,
    desc: 'Defeat the Stone Warden.', target: 1,
    track: { evt: EV.NODE_CLEARED, test: p => p.nodeId === 'ss9' },
    reward: { gold: 12000, warSeal: 20, mats: { crownshard: 3, aether: 2 } } }),

  /* --------------------------------------------------------- repeatable */

  dailyDrill: Q({
    id: 'dailyDrill', name: 'Keep Them Sharp', icon: ic('medal'), chapter: 0, repeatable: true,
    desc: 'Win 3 battles.',
    target: 3, track: { evt: EV.BATTLE_END, test: p => p.victory },
    reward: { gold: 300, scroll: 1 },
  }),
  slayer: Q({
    id: 'slayer', name: 'Attrition', icon: ic('skull'), chapter: 0, repeatable: true,
    desc: 'Defeat 150 enemy units.',
    target: 150, track: { evt: EV.UNIT_DIED, test: p => p.team === 1 },
    reward: { gold: 400, shards: 20 },
  }),
};

export const QUEST_LIST = Object.values(QUESTS);
export const getQuest = id => QUESTS[id];

/** Quests the player should currently see, by chapter (region count cleared). */
export function visibleQuests(state, chapter) {
  return QUEST_LIST.filter(q => q.chapter <= chapter + 1 && (!state.quests[q.id]?.done || q.repeatable));
}
