/* TutorialScript.js — the first hour, written down.

   The old opening told a new player "YOUR ARMY NEEDS 8 CARDS" and stopped.
   That sentence assumes the player already knows what a card is, where cards
   come from, why eight, and what to do about it. None of that was anywhere in
   the game.

   This is the replacement. It is a LIST OF STEPS, not a wall of text. Each
   step:
     - states one objective in the imperative,
     - says WHERE to go,
     - is spoken by a person (the Marshal) rather than a popup,
     - and completes on something the player actually did, never on a timer.

   Nothing here is a special case in code: `Tutorial.js` walks this list
   generically, so the opening can be rewritten without touching a system.
*/

import { EV } from '../core/Bus.js';

/**
 * step = {
 *   id        save key
 *   objective the one line shown in the objective panel, imperative
 *   hint      where to go / what to press. Shown smaller, under it.
 *   say       [lines] the Marshal says when the step BEGINS (optional)
 *   beckon    which nav-dock button to pulse (optional)
 *   at        { zone, x, z, label } a world beacon to raise (optional)
 *   inBattle  true if this step belongs to a fight
 *   done      { evt, test(payload) } what completes it
 *   grant     bundle handed over on completion (optional)
 * }
 */
export const TUTORIAL = [

  {
    id: 'greet',
    objective: 'Speak to Marshal Corr',
    hint: 'She is waiting at the war table in the middle of the courtyard. Walk over and press E.',
    at: { zone: 'keep', x: -3.4, z: -4.6, label: 'Marshal Corr' },
    say: [
      'You are the commander now. That is not a promotion, it is what is left.',
      'Come to the table. I will show you what you have.',
    ],
    done: { evt: EV.NPC_TALK, test: p => p.npc === 'marshal' },
  },

  {
    id: 'army',
    objective: 'Look at your army',
    hint: 'Open ARMY on the bar at the bottom of the screen.',
    beckon: 'army',
    say: [
      'Three cards. That is the whole army.',
      'A card is a unit you can call onto a battlefield. The KNIGHT stands in front and takes the hits. The MAGE kills things from behind him. The GIANT soaks up a beating nothing else could.',
      'Three is enough to start. You will earn a fourth by winning.',
    ],
    done: { evt: EV.SCREEN_OPEN, test: p => p.id === 'army' },
  },

  {
    id: 'map',
    objective: 'Open the War Map',
    hint: 'The war table in the courtyard, or WAR MAP on the bar.',
    beckon: 'map',
    at: { zone: 'keep', x: 0, z: -6, label: 'War Table' },
    say: ['The map. Every mark on it is somewhere that used to pay us taxes.'],
    done: { evt: EV.SCREEN_OPEN, test: p => p.id === 'map' },
  },

  {
    id: 'fight1',
    objective: 'March on The Broken Fence',
    hint: 'Pick the first node on the map and give the order.',
    say: ['Start with the fence. Six goblins and a hole in a wall. Everyone starts somewhere.'],
    done: { evt: EV.BATTLE_START, test: p => p.nodeId === 'gm1' },
  },

  /* ------------------------------------------------------------- battle */

  {
    id: 'deployKnight',
    objective: 'Deploy the Knight',
    hint: 'Press 1 to pick the Knight, then click the ground inside the blue deploy zone.',
    inBattle: true,
    say: [
      'There they are. Knight first — always the Knight first.',
      'Press 1, then click the ground. He costs Command; Command fills up on its own, so you are never stuck.',
    ],
    done: { evt: EV.UNIT_DEPLOYED, test: p => p.cardId === 'knight' },
  },

  {
    id: 'deployMage',
    objective: 'Put the Mage BEHIND the Knight',
    hint: 'Press 2, then click the ground behind your knight — not in front of him.',
    inBattle: true,
    say: [
      'Now the Mage. Behind him. Not beside him, behind him.',
      'The Mage does more damage than anything else you own and dies to a stiff breeze. Whatever is closest to the enemy is what the enemy kills.',
    ],
    done: { evt: EV.UNIT_DEPLOYED, test: p => p.cardId === 'mage' },
  },

  {
    id: 'orders',
    objective: 'Give your army an order',
    hint: 'V follow me · G hold ground · B advance on the crosshair · N charge. F changes formation.',
    inBattle: true,
    say: [
      'They are yours, Commander. Tell them something.',
      'Press <span class="em">V</span> and they keep station on you. <span class="em">G</span> and they plant where they stand and do not chase. <span class="em">B</span> sends them at whatever you are looking at.',
      '<span class="em">F</span> changes the shape they stand in. You know the line and the column; Captain Roon can teach you the rest.',
    ],
    done: { evt: EV.ARMY_ORDER },
  },

  {
    id: 'win1',
    objective: 'Beat every wave',
    hint: 'Hold the line. Each wave is a little harder than the last.',
    inBattle: true,
    say: ['Hold. They come in waves — kill one lot and the next comes on.'],
    done: { evt: EV.BATTLE_END, test: p => p.victory },
  },

  /* ------------------------------------------------------- the loop back */

  {
    id: 'rewards',
    objective: 'Take your reward',
    hint: 'Gold, experience, and SHARDS — the things that make a card stronger.',
    done: { evt: EV.SCREEN_CLOSE, test: p => p.id === 'results' },
  },

  {
    id: 'upgrade',
    objective: 'Upgrade a card in the Library',
    hint: 'The Wizard\'s Library, west side of the courtyard. Card Study.',
    beckon: 'library',
    at: { zone: 'keep', x: -16, z: -4.2, label: "The Wizard's Library" },
    say: [
      'Shards go to the Wizard. He turns them into levels.',
      'A levelled card is not just bigger numbers — at every third level the unit visibly changes. You will be able to tell a veteran knight from a raw one across the field.',
    ],
    done: { evt: EV.CARD_UPGRADED },
  },

  {
    id: 'forge',
    objective: 'Visit the Forge',
    hint: 'East side of the courtyard. Your own armour is made there.',
    beckon: 'forge',
    at: { zone: 'keep', x: 16, z: -4.2, label: 'The Forge' },
    say: [
      'The Forge is for YOU, not your cards. You fight on that field too.',
      'Heavy plate keeps you alive and slows you down. Light kit is fast and thin. Robes trade steel for power. Pick the fight you want to have.',
    ],
    done: { evt: EV.ZONE_ENTER, test: p => p.id === 'forge' },
  },

  {
    id: 'fight2',
    objective: 'March on Millstone Ford',
    hint: 'Back to the War Map. The second node is open.',
    beckon: 'map',
    say: [
      'One crossing, and they are already on it.',
      'A narrow front suits whoever has fewer bodies. That is you. Put the Giant in the gap and let them break on him.',
    ],
    done: { evt: EV.BATTLE_START, test: p => p.nodeId === 'gm2' },
  },
];

/** The Marshal's closing word, once the list is finished. */
export const TUTORIAL_OUTRO = [
  'That is the whole shape of it, Commander.',
  'Fight, get paid, make the army bigger, fight something worse. The Wizard has research if you can afford it, the smith takes commissions, and Odessa in the market will sell you anything including things that are not hers.',
  'I will be at the table when you need me.',
];
