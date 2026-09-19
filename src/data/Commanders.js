/* Commanders.js — the people on the other side of the field.

   A house battle is not a fight against a spawner. It is a fight against a
   PERSON, who is standing in their own line, wearing their own armour, with
   a name and a way of fighting. Kill them and the battle is over — their army
   does not need to be wiped out, and neither does yours.

   Each entry is a stat block plus a doctrine. `Battle` builds a real
   `Commander` out of it, exactly like yours: it walks, swings, uses abilities
   and can be flanked. The only difference is that it is driven by the sim
   rather than by a mouse.

   The stat curve is deliberately a little below a player commander of the
   same level. You should beat them by fighting better, not by being a bigger
   number — and when you lose it should be because you let their line get
   round yours.
*/

import { ic } from '../art/Icons.js';

const C = (o) => ({
  weaponClass: 'sword', armor: 12, haste: 10, cdr: 0.1, weight: 22,
  moveSpeed: 7.2, atkSpeedMult: 1.0, specials: {}, raw: {},
  ...o,
});

/**
 * @param level the node's level, so the same commander scales across a region
 */
export function commanderStats(def, level) {
  const l = level || def.level || 1;
  return C({
    level: l,
    maxHp: Math.round(def.hp0 + def.hpPer * (l - 1)),
    might: Math.round(def.might0 + def.mightPer * (l - 1)),
    focus: Math.round(def.focus0 + def.focusPer * (l - 1)),
    armor: Math.round(def.armor0 + (def.armorPer ?? 0.6) * (l - 1)),
    haste: def.haste ?? 10,
    weight: def.weight ?? 22,
    moveSpeed: def.moveSpeed ?? 7.2,
    atkSpeedMult: def.atkSpeedMult ?? 1.0,
    cdr: def.cdr ?? 0.1,
    weaponClass: def.weaponClass || 'sword',
    specials: def.specials || {},
  });
}

export const COMMANDERS = {

  /* ---------------------------------------------------------- HOUSE VERRIN */

  aldric: {
    id: 'aldric', name: 'Ser Aldric Verrin', title: 'The Grey Marshal',
    house: 'verrin', icon: ic('shieldwall'),
    hp0: 680, hpPer: 52, might0: 26, mightPer: 2.6, focus0: 12, focusPer: 0.8,
    armor0: 18, armorPer: 1.1, weight: 34, moveSpeed: 6.2, weaponClass: 'sword',
    equipped: { weapon: 'longsword', offhand: 'kiteShield', helm: 'plateHelm', chest: 'plateChest' },
    doctrine: { holds: true, guardBanner: true },
    line: 'You will find no gap in my line, Commander. Men have looked for one for thirty years.',
    mechanic: 'Aldric never leaves his own line. Kill the line and he is alone; try to reach him through it and you will not.',
    codex: 'Has commanded in nine wars and lost ground in two. Both times on purpose.',
  },

  mirelle: {
    id: 'mirelle', name: 'Captain Mirelle Vance', title: 'Warden of the Ford',
    house: 'verrin', icon: ic('bow'),
    hp0: 520, hpPer: 40, might0: 20, mightPer: 1.9, focus0: 22, focusPer: 1.8,
    armor0: 10, armorPer: 0.7, weight: 16, moveSpeed: 8.2, weaponClass: 'bow',
    equipped: { weapon: 'huntingBow', helm: 'leatherCap', chest: 'leatherChest' },
    doctrine: { kites: true },
    line: 'Come across, then. Take your time.',
    mechanic: 'Mirelle will not stand and fight. She falls back behind her crossbows and shoots you while you chase her.',
    codex: 'Held Millstone Ford for six days with forty people and a lot of very good arrows.',
  },

  /* ------------------------------------------------------------ HOUSE KARN */

  halvi: {
    id: 'halvi', name: 'Dame Halvi Karn', title: 'The Red Spur',
    house: 'karn', icon: ic('horse'),
    hp0: 900, hpPer: 64, might0: 34, mightPer: 3.4, focus0: 10, focusPer: 0.6,
    armor0: 16, armorPer: 1.0, weight: 28, moveSpeed: 9.4, atkSpeedMult: 1.12,
    weaponClass: 'greatsword',
    equipped: { weapon: 'greatsword', helm: 'plateHelm', chest: 'plateChest' },
    doctrine: { charges: true, huntsCommander: true },
    line: 'I have no interest in your army. Where are you?',
    mechanic: 'Halvi ignores your line entirely and comes for YOU. Standing still is how people die to her.',
    codex: 'Has never given the order to withdraw. Her serjeants have, twice, and she has forgiven them once.',
  },

  brant: {
    id: 'brant', name: 'Brant Karn', title: 'The Younger',
    house: 'karn', icon: ic('swords'),
    hp0: 740, hpPer: 50, might0: 30, mightPer: 2.8, focus0: 12, focusPer: 0.7,
    armor0: 14, armorPer: 0.9, weight: 26, moveSpeed: 8.4, weaponClass: 'axe',
    equipped: { weapon: 'battleAxe', helm: 'plateHelm', chest: 'mailChest' },
    doctrine: { charges: true },
    line: 'My sister says you are dangerous. My sister says a lot of things.',
    mechanic: 'Brant leads the charge personally and arrives before his own cavalry. Punish the gap.',
    codex: 'Competent, overconfident, and two years from being genuinely frightening.',
  },

  /* ------------------------------------------------------------ HOUSE ORSA */

  tolvarr: {
    id: 'tolvarr', name: 'Magister Tolvarr Orsa', title: 'Master of Engines',
    house: 'orsa', icon: ic('siege'),
    hp0: 640, hpPer: 46, might0: 18, mightPer: 1.6, focus0: 28, focusPer: 2.4,
    armor0: 12, armorPer: 0.8, weight: 20, moveSpeed: 6.8, weaponClass: 'staff',
    equipped: { weapon: 'ironStaff', helm: 'mailCoif', chest: 'mailChest' },
    doctrine: { holds: true, guardBanner: true, kites: true },
    line: 'I have measured this field. You are standing in the part I measured first.',
    mechanic: 'Tolvarr stays behind his bombards. The engines are the fight; he is the last part of it.',
    codex: 'Sells to both sides and has never been accused of favouritism, only of accuracy.',
  },

  /* ----------------------------------------------------- THE FREE COMPANY */

  ysolde: {
    id: 'ysolde', name: 'Captain Ysolde Marrek', title: 'The Free Company',
    house: 'freeCompany', icon: ic('medal'),
    hp0: 1050, hpPer: 72, might0: 33, mightPer: 3.2, focus0: 20, focusPer: 1.6,
    armor0: 20, armorPer: 1.2, weight: 26, moveSpeed: 7.8, atkSpeedMult: 1.08,
    weaponClass: 'sword',
    equipped: { weapon: 'longsword', offhand: 'heaterShield', helm: 'plateHelm', chest: 'plateChest' },
    doctrine: { adapts: true, huntsCommander: true },
    line: 'Nothing personal. It very rarely is.',
    mechanic: 'Ysolde reads the battle and changes her army\'s formation to counter yours. Whatever you are doing, she will have an answer within about twenty seconds.',
    codex: 'Six wars on the winning side and none on the losing one, which she describes as a matter of paperwork.',
  },
};

export const getCommander = id => COMMANDERS[id] || null;
export const COMMANDER_LIST = Object.values(COMMANDERS);
