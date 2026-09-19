/* Formations.js — how a squad stands, and why it matters.

   A formation is TWO things, and it is only worth having because of both:

     1. A SHAPE. Where each soldier stands relative to the squad's anchor and
        facing. This decides frontage, depth, how many of them can reach the
        enemy at once, and how much of the squad a single fireball covers.

     2. A TRADE. Every formation is good at something and bad at something
        else. There is no "best" one — a shield wall that is wonderful against
        a frontal charge is a disaster when cavalry comes round the end of it.

   Slots are in SQUAD-LOCAL space: +Z is the way the squad faces, +X is its
   right. `Command.js` rotates them into the world.

   Formations are LEARNED. You start knowing the line and the column, and
   Captain Roon teaches the rest — that is what makes drilling your army a
   progression system rather than a menu.
*/

import { ic } from '../art/Icons.js';

/* Helper: lay `n` bodies out in `cols` columns, centred, facing +Z. */
function grid(n, cols, dx, dz) {
  const out = [];
  const rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    // centre each rank individually so a short back rank sits in the middle
    const inRow = Math.min(cols, n - r * cols);
    out.push({
      x: (c - (inRow - 1) / 2) * dx,
      z: -(r - (rows - 1) / 2) * dz,
    });
  }
  return out;
}

export const FORMATIONS = {

  line: {
    id: 'line', name: 'Line', icon: ic('link'), key: 1,
    blurb: 'Two ranks, shoulder to shoulder.',
    desc: 'The default. Wide frontage means every soldier can reach something, and a wide line is very hard to walk around.',
    good: 'Frontage. Nothing gets past a line without fighting it.',
    bad: 'Spread thin. A concentrated charge at one point will punch through.',
    unlock: null,                          // known from the start
    slots(n) { return grid(n, Math.min(6, Math.max(3, Math.ceil(n / 2))), 1.9, 1.7); },
    mods: { rangedTakenMult: 0.88 },
    speed: 1.0,
  },

  column: {
    id: 'column', name: 'Column', icon: ic('chevron'), key: 2,
    blurb: 'Two abreast, marching order.',
    desc: 'How an army moves, not how it fights. Narrow and quick, and it fits through a gate.',
    good: 'Fast. Gets across open ground before the enemy is ready.',
    bad: 'Only the front two can fight. Caught in column, a squad is nearly useless.',
    unlock: null,
    slots(n) { return grid(n, 2, 1.7, 1.9); },
    mods: { dmgTakenMult: 1.12 },
    speed: 1.38,
  },

  shieldwall: {
    id: 'shieldwall', name: 'Shield Wall', icon: ic('shieldwall'), key: 3,
    blurb: 'Locked shields, three deep.',
    desc: 'Overlapping shields and no gaps. The front rank takes a fraction of what hits it and the ranks behind push.',
    good: 'Frontal defence. A charge into a shield wall stops dead.',
    bad: 'Barely moves, and the flanks are wide open. Never let it be turned.',
    unlock: 'drill_shieldwall', drillGold: 350, drillScroll: 1,
    drillText: 'Shields overlap, left over right, and nobody steps back. It is not complicated. It is just very hard to make men do.',
    slots(n) { return grid(n, Math.min(5, Math.max(3, Math.ceil(n / 2))), 1.35, 1.25); },
    mods: { frontalTakenMult: 0.62, ccResist: true },
    speed: 0.62,
  },

  wedge: {
    id: 'wedge', name: 'Wedge', icon: ic('chevron'), key: 4,
    blurb: 'A point, driving forward.',
    desc: 'The heaviest soldier at the tip and the rest fanned back behind him. Built to break a line at one spot rather than push on all of it.',
    good: 'Breaks through. Enormous damage on the moment of contact.',
    bad: 'Narrow. Easy to surround once it has stopped moving.',
    unlock: 'drill_wedge', drillGold: 700, drillScroll: 2,
    drillText: 'Heaviest man at the point. Everyone behind him goes where he goes and does not think about it. You are aiming at one man in their line, not at their line.',
    slots(n) {
      const out = [];
      let i = 0, row = 0;
      while (i < n) {
        const inRow = row + 1;
        for (let c = 0; c < inRow && i < n; c++, i++) {
          out.push({ x: (c - (inRow - 1) / 2) * 1.8, z: -row * 1.55 });
        }
        row++;
      }
      // push the whole wedge forward so the tip leads the anchor
      const shift = (row - 1) * 1.55 * 0.5;
      return out.map(s => ({ x: s.x, z: s.z + shift }));
    },
    mods: { chargeMult: 1.4 },
    speed: 1.12,
  },

  skirmish: {
    id: 'skirmish', name: 'Skirmish', icon: ic('swarm'), key: 5,
    blurb: 'Loose, scattered, no two together.',
    desc: 'Deliberately spread out so that nothing which hits one of them hits two. How you cross ground that is being shot at.',
    good: 'Splash and area damage lose most of their value. Extra reach for bows.',
    bad: 'No mutual support. In a melee they are picked off one at a time.',
    unlock: 'drill_skirmish', drillGold: 1100, drillScroll: 2,
    drillText: 'Spread until you feel lonely, then spread a bit more. One arrow, one man. That is the whole idea.',
    slots(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        // a deterministic scatter: same squad, same shape, every time
        const a = i * 2.39996;                       // golden angle
        const r = 1.9 + Math.sqrt(i) * 1.55;
        out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r * 0.75 });
      }
      return out;
    },
    mods: { splashTakenMult: 0.5, rangeMult: 1.15 },
    speed: 1.14,
  },

  echelon: {
    id: 'echelon', name: 'Echelon', icon: ic('angle'), key: 6,
    blurb: 'A staircase, refusing one flank.',
    desc: 'Each man set back and to the side of the one in front. It presents a slanted face, so an enemy trying to come round the end arrives at another rank instead of your back.',
    good: 'Cannot be flanked. Attacks from the side hit a front, not a rear.',
    bad: 'Half the squad is out of the fight at any moment.',
    unlock: 'drill_echelon', drillGold: 1800, drillScroll: 3,
    drillText: 'Each man a pace back and a pace out from the one ahead. Whoever comes round the end of the line arrives at a face, not a back. It takes a month to teach and it wins battles.',
    slots(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push({ x: (i - (n - 1) / 2) * 1.55, z: -(i - (n - 1) / 2) * 1.35 });
      }
      return out;
    },
    mods: { noFlank: true },
    speed: 0.95,
  },
};

export const FORMATION_LIST = Object.values(FORMATIONS);

/** Which formations the player can actually use right now. */
export function knownFormations(state) {
  return FORMATION_LIST.filter(f => !f.unlock || state?.drills?.includes(f.unlock));
}

export const getFormation = id => FORMATIONS[id] || FORMATIONS.line;
