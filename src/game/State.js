/* State.js — the player profile and every mutation that can happen to it.

   One object, one place. Systems never write to `state` directly; they call a
   method here, which keeps the save marked dirty, fires the right bus event,
   and keeps derived values (research bonuses, commander stats) consistent.
*/

import { CFG, RARITY } from '../core/Config.js';
import { bus, EV } from '../core/Bus.js';
import { Save } from '../core/Save.js';
import { bagAdd, bagHas, bagPay, bagMerge, clamp, deepClone } from '../core/Util.js';
import { UNITS, STARTERS, statsAt, tierOf } from '../data/Units.js';
import { ITEMS, SLOT_ORDER, SLOTS, STARTER_KIT, aggregateStats, itemStatsAt, itemUpgradeCost, canEquip, POTIONS, CMD_ABILITIES, WEAPON_CLASSES } from '../data/Items.js';
import { RECIPES, isDiscovered } from '../data/Recipes.js';
import { RESEARCH, foldResearch, researchAvailable } from '../data/Research.js';
import { REGIONS, REGION_LIST, findNode } from '../data/Campaign.js';
import { QUESTS, QUEST_LIST } from '../data/Quests.js';

/* ------------------------------------------------------------ new profile */

export function newProfile() {
  const s = {
    version: 1,
    createdAt: Date.now(),
    name: 'Commander',

    /* resources */
    gold: CFG.econ.startGold,
    warSeal: 0,
    scroll: 3,
    materials: { iron: 6, oak: 4, leather: 3, cloth: 3, herb: 4 },
    shards: {},

    /* cards: { [unitId]: { level, xp, shards, awakened, unlockedAt, battles, kills } } */
    cards: {},
    deck: [],

    /* items: [{ id, level, uid }] and equipped slot -> uid */
    items: [],
    equipped: {},
    itemSeq: 1,

    /* potions: { [potionId]: count }, battleSlots: [potionId,...] */
    potions: { healthPotion: 3 },
    potionSlots: ['healthPotion', null, null],

    /* commander */
    level: 1,
    xp: 0,
    skillPoints: 0,
    skills: {},

    /* knowledge */
    research: [],
    recipes: [],
    codex: { units: [], factions: [], lore: [], entries: [] },

    /* campaign */
    progress: { regions: { greenmarch: { unlocked: true } }, nodes: {} },
    currentRegion: 'greenmarch',

    /* meta */
    quests: {},
    flags: { firstRun: true },
    stats: { battles: 0, wins: 0, losses: 0, kills: 0, deaths: 0, damage: 0, goldEarned: 0, playtime: 0 },
    settings: {
      master: 0.7, sfx: 0.85, music: 0.4,
      bloom: true, shadows: true, damageNumbers: true, cameraShake: true, tutorialHints: true,
      lookSensitivity: 1.0, invertY: false,
    },
    endless: { best: 0 },
  };

  // starter cards
  for (const id of STARTERS) {
    s.cards[id] = { level: 1, shards: 0, awakened: false, unlockedAt: Date.now(), battles: 0, kills: 0 };
  }
  s.deck = [...STARTERS];

  // starter kit
  for (const slot in STARTER_KIT) {
    const uid = s.itemSeq++;
    s.items.push({ uid, id: STARTER_KIT[slot], level: 1 });
    s.equipped[slot] = uid;
  }

  return s;
}

/* ========================================================================== */

class GameState {
  constructor() { this.s = null; this.bonuses = null; }

  /* ---------------------------------------------------------- lifecycle */

  init() {
    const blob = Save.load();
    this.s = blob ? blob.state : newProfile();
    this._repair();
    this.recomputeBonuses();
    return this.s;
  }

  reset() {
    Save.wipe();
    this.s = newProfile();
    this.recomputeBonuses();
    bus.emit(EV.STATE_CHANGED, { reason: 'reset' });
    Save.write(this.s);
  }

  save() { Save.write(this.s); }
  mark() { Save.mark(); bus.emit(EV.STATE_CHANGED, {}); }
  tick(dt) { this.s.stats.playtime += dt; Save.tick(this.s); }

  /** Fill in anything a content patch expects but an old save lacks. */
  _repair() {
    const s = this.s;
    const base = newProfile();
    for (const k in base) if (s[k] === undefined) s[k] = deepClone(base[k]);
    for (const k in base.settings) if (s.settings[k] === undefined) s.settings[k] = base.settings[k];
    for (const k in base.stats) if (s.stats[k] === undefined) s.stats[k] = base.stats[k];
    s.codex = s.codex || { units: [], factions: [], lore: [], entries: [] };
    s.codex.entries = s.codex.entries || [];
    if (!s.deck.length) s.deck = [...STARTERS];
    // drop references to content that no longer exists
    s.deck = s.deck.filter(id => UNITS[id]);
    for (const id in s.cards) if (!UNITS[id]) delete s.cards[id];
    s.items = s.items.filter(it => ITEMS[it.id]);
    for (const slot of SLOT_ORDER) {
      const uid = s.equipped[slot];
      if (uid && !s.items.find(i => i.uid === uid)) delete s.equipped[slot];
    }
  }

  /* ---------------------------------------------------------- resources */

  get gold() { return this.s.gold; }

  addGold(n, reason) {
    if (!n) return;
    this.s.gold = Math.max(0, this.s.gold + n);
    if (n > 0) this.s.stats.goldEarned += n;
    bus.emit(EV.RESOURCE_GAINED, { id: 'gold', n, reason });
    this.mark();
  }

  addResource(id, n, reason) {
    if (!n) return;
    if (id === 'gold') return this.addGold(n, reason);
    if (id === 'warSeal') { this.s.warSeal = Math.max(0, this.s.warSeal + n); }
    else if (id === 'scroll') { this.s.scroll = Math.max(0, this.s.scroll + n); }
    else if (id.startsWith('shard:')) { this.addShards(id.slice(6), n); return; }
    else bagAdd(this.s.materials, id, n);
    bus.emit(EV.RESOURCE_GAINED, { id, n, reason });
    this.mark();
  }

  /** How much of `id` the player has, whatever kind of resource it is. */
  count(id) {
    if (id === 'gold') return this.s.gold;
    if (id === 'warSeal') return this.s.warSeal;
    if (id === 'scroll') return this.s.scroll;
    if (id.startsWith('shard:')) return this.s.cards[id.slice(6)]?.shards || 0;
    return this.s.materials[id] || 0;
  }

  canAfford(cost) {
    for (const k in cost) if (this.count(k) < cost[k]) return false;
    return true;
  }

  pay(cost, reason) {
    if (!this.canAfford(cost)) return false;
    for (const k in cost) this.addResource(k, -cost[k], reason);
    return true;
  }

  grant(bundle, reason) {
    if (!bundle) return;
    if (bundle.gold) this.addGold(bundle.gold, reason);
    if (bundle.warSeal) this.addResource('warSeal', bundle.warSeal, reason);
    if (bundle.scroll) this.addResource('scroll', bundle.scroll, reason);
    if (bundle.xp) this.addXp(bundle.xp);
    if (bundle.mats) for (const k in bundle.mats) this.addResource(k, bundle.mats[k], reason);
    if (bundle.potions) for (const k in bundle.potions) this.addPotion(k, bundle.potions[k]);
    if (bundle.cards) for (const id of bundle.cards) this.unlockCard(id);
    if (bundle.shards) {
      if (typeof bundle.shards === 'object') for (const k in bundle.shards) this.addShards(k, bundle.shards[k]);
    }
    if (bundle.flag) this.setFlag(bundle.flag, true);
    if (bundle.unlocks) this.unlockRegion(bundle.unlocks);
    if (bundle.codex) this.addCodex(bundle.codex);
  }

  /* -------------------------------------------------------------- cards */

  hasCard(id) { return !!this.s.cards[id]; }

  card(id) { return this.s.cards[id]; }

  /** Unlock a card, or convert the duplicate into shards. */
  unlockCard(id, silent = false) {
    if (!UNITS[id]) return false;
    if (this.s.cards[id]) {
      const bonus = Math.round(12 * RARITY[UNITS[id].rarity].shardMult);
      this.addShards(id, bonus);
      return false;
    }
    this.s.cards[id] = { level: 1, shards: 0, awakened: false, unlockedAt: Date.now(), battles: 0, kills: 0 };
    if (!silent) bus.emit(EV.CARD_UNLOCKED, { id, unit: UNITS[id] });
    this.mark();
    return true;
  }

  addShards(id, n) {
    if (!this.s.cards[id]) {
      // shards for a card you do not own yet accumulate; at the threshold it
      // unlocks itself, which makes shard drops always meaningful
      this.s.shards[id] = (this.s.shards[id] || 0) + n;
      const need = Math.round(20 * RARITY[UNITS[id]?.rarity || 'common'].shardMult);
      if (this.s.shards[id] >= need) {
        delete this.s.shards[id];
        this.unlockCard(id);
      }
      this.mark();
      return;
    }
    this.s.cards[id].shards += n;
    bus.emit(EV.RESOURCE_GAINED, { id: 'shard:' + id, n });
    this.mark();
  }

  cardLevelCap() { return this.bonuses.cardLevelCap; }

  upgradeCost(id) {
    const c = this.s.cards[id];
    if (!c) return null;
    const lvl = c.level;
    const rar = RARITY[UNITS[id].rarity];
    return {
      shards: Math.round(CFG.cards.upgradeShards(lvl) * rar.shardMult),
      gold: Math.round(CFG.cards.upgradeGold(lvl) * (1 + rar.order * 0.3)),
    };
  }

  canUpgradeCard(id) {
    const c = this.s.cards[id];
    if (!c || c.level >= this.cardLevelCap()) return false;
    const cost = this.upgradeCost(id);
    return c.shards >= cost.shards && this.s.gold >= cost.gold;
  }

  upgradeCard(id) {
    if (!this.canUpgradeCard(id)) return false;
    const c = this.s.cards[id];
    const cost = this.upgradeCost(id);
    c.shards -= cost.shards;
    this.addGold(-cost.gold, 'upgrade');
    const before = tierOf(c.level);
    c.level++;
    const after = tierOf(c.level);
    bus.emit(EV.CARD_UPGRADED, { id, level: c.level, tierUp: after > before, unit: UNITS[id] });
    this.mark();
    return true;
  }

  awakenCost(id) {
    const rar = RARITY[UNITS[id].rarity];
    return {
      gold: Math.round(2400 * rar.awakenCost),
      warSeal: Math.round(4 * rar.awakenCost),
      runestone: Math.round(3 * rar.awakenCost),
      ['shard:' + id]: Math.round(60 * rar.shardMult),
    };
  }

  canAwaken(id) {
    const c = this.s.cards[id];
    if (!c || c.awakened) return false;
    if (!this.bonuses.awakeningUnlocked) return false;
    if (c.level < CFG.cards.awakenLevel) return false;
    return this.canAfford(this.awakenCost(id));
  }

  awakenCard(id) {
    if (!this.canAwaken(id)) return false;
    this.pay(this.awakenCost(id), 'awaken');
    this.s.cards[id].awakened = true;
    bus.emit(EV.CARD_AWAKENED, { id, unit: UNITS[id] });
    this.mark();
    return true;
  }

  /** Runtime stats for a card at its current level, with research folded in. */
  cardStats(id) {
    const c = this.s.cards[id];
    const u = UNITS[id];
    if (!u) return null;
    const lvl = c ? c.level : 1;
    const st = statsAt(u, lvl, CFG.cards.statGrowth);
    st.hp = Math.round(st.hp * this.bonuses.unitHpMult);
    return { ...st, level: lvl, tier: tierOf(lvl), awakened: !!c?.awakened };
  }

  ownedCards() {
    return Object.keys(this.s.cards).map(id => ({ id, unit: UNITS[id], save: this.s.cards[id] })).filter(c => c.unit);
  }

  /* --------------------------------------------------------------- deck */

  setDeck(ids) {
    this.s.deck = ids.filter(id => this.s.cards[id]).slice(0, CFG.battle.deckSize);
    this.mark();
  }

  deckValid() { return this.s.deck.length === CFG.battle.deckSize; }

  deckUnits() { return this.s.deck.map(id => UNITS[id]).filter(Boolean); }

  deckAvgCost() {
    const u = this.deckUnits();
    return u.length ? u.reduce((a, x) => a + x.cost, 0) / u.length : 0;
  }

  /* -------------------------------------------------------------- items */

  addItem(id, level = 1) {
    if (!ITEMS[id]) return null;
    const it = { uid: this.s.itemSeq++, id, level };
    this.s.items.push(it);
    this.mark();
    return it;
  }

  itemByUid(uid) { return this.s.items.find(i => i.uid === uid); }

  equipItem(uid, slot) {
    const it = this.itemByUid(uid);
    if (!it) return false;
    const def = ITEMS[it.id];
    if (!canEquip(def, slot, this.equippedIds())) return false;

    // changing to a two-hander clears the off-hand
    if (slot === 'weapon') {
      const wc = WEAPON_CLASSES[def.wclass];
      const offUid = this.s.equipped.offhand;
      if (offUid) {
        const off = ITEMS[this.itemByUid(offUid)?.id];
        if (off && !canEquip(off, 'offhand', { weapon: it.id })) delete this.s.equipped.offhand;
      }
    }
    // if this item is equipped elsewhere, take it off there first
    for (const s of SLOT_ORDER) if (this.s.equipped[s] === uid) delete this.s.equipped[s];

    this.s.equipped[slot] = uid;
    bus.emit(EV.ITEM_EQUIPPED, { uid, slot, id: it.id, allSlotsFilled: SLOT_ORDER.every(s => this.s.equipped[s]) });
    this.mark();
    return true;
  }

  unequipSlot(slot) {
    delete this.s.equipped[slot];
    this.mark();
  }

  equippedIds() {
    const out = {};
    for (const slot of SLOT_ORDER) {
      const uid = this.s.equipped[slot];
      const it = uid && this.itemByUid(uid);
      if (it) out[slot] = it.id;
    }
    return out;
  }

  itemLevels() {
    const out = {};
    for (const it of this.s.items) out[it.id] = Math.max(out[it.id] || 1, it.level);
    return out;
  }

  /** Full commander stat block, gear + level + research. */
  commanderStats() {
    const eq = this.equippedIds();
    const levels = {};
    for (const slot of SLOT_ORDER) {
      const uid = this.s.equipped[slot];
      const it = uid && this.itemByUid(uid);
      if (it) levels[it.id] = it.level;
    }
    const { total, specials } = aggregateStats(eq, levels);
    const lvl = this.s.level;

    const maxHp = Math.round(CFG.cmd.baseHp + CFG.cmd.hpPerLevel * (lvl - 1) + total.vigor);
    const might = CFG.cmd.baseMight + Math.round(lvl * 1.4) + total.might;
    const focus = CFG.cmd.baseFocus + Math.round(lvl * 1.2) + total.focus;
    const armor = CFG.cmd.baseArmor + Math.round(lvl * 0.4) + total.armor;
    const haste = total.haste;
    const weight = total.weight;
    const moveSpeed = Math.max(3.2,
      CFG.cmd.moveSpeed - weight * CFG.cmd.weightSpeedPenalty * 100 / 100 * 1
      + (specials.moveBonus || 0));

    return {
      level: lvl, maxHp, might, focus, armor, haste, weight,
      moveSpeed: Math.max(3.2, CFG.cmd.moveSpeed - weight * CFG.cmd.weightSpeedPenalty + (specials.moveBonus || 0)),
      atkSpeedMult: 1 + haste / 220,
      cdr: clamp((specials.cdr || 0) + haste / 600, 0, 0.6),
      specials,
      weaponClass: ITEMS[eq.weapon]?.wclass || 'sword',
      raw: total,
    };
  }

  /** Which Q/E/R abilities the commander currently has. */
  commanderAbilities() {
    const eq = this.equippedIds();
    const out = [CMD_ABILITIES.cmdRally, CMD_ABILITIES.cmdWarcry];
    for (const slot of SLOT_ORDER) {
      const it = ITEMS[eq[slot]];
      const aid = it?.special?.ability;
      if (aid && CMD_ABILITIES[aid] && !out.includes(CMD_ABILITIES[aid])) out.push(CMD_ABILITIES[aid]);
    }
    return out.slice(0, 3);
  }

  upgradeItem(uid) {
    const it = this.itemByUid(uid);
    if (!it) return false;
    const def = ITEMS[it.id];
    if (it.level >= (def.maxLevel || 10)) return false;
    const cost = this.itemCost(it);
    if (!this.pay(cost, 'itemUpgrade')) return false;
    it.level++;
    this.mark();
    return true;
  }

  itemCost(it) {
    const def = ITEMS[it.id];
    const raw = itemUpgradeCost(def, it.level);
    const disc = 1 - this.bonuses.itemUpgradeDiscount;
    return { ...raw, gold: Math.round(raw.gold * disc) };
  }

  /* ------------------------------------------------------------ potions */

  addPotion(id, n = 1) {
    if (!POTIONS[id]) return;
    this.s.potions[id] = (this.s.potions[id] || 0) + n;
    this.mark();
  }

  usePotion(id) {
    if (!this.s.potions[id]) return false;
    this.s.potions[id]--;
    if (this.s.potions[id] <= 0) delete this.s.potions[id];
    this.mark();
    return true;
  }

  potionSlotCount() { return this.bonuses.potionSlots; }

  setPotionSlot(i, id) {
    this.s.potionSlots[i] = id;
    this.mark();
  }

  /* ----------------------------------------------------------- crafting */

  knownRecipes() {
    return Object.values(RECIPES).filter(r => isDiscovered(r, this.s));
  }

  craft(recipeId) {
    const r = RECIPES[recipeId];
    if (!r || !isDiscovered(r, this.s)) return { ok: false, why: 'unknown' };
    const cost = { ...r.cost };
    if (r.station === 'forge' && cost.gold) cost.gold = Math.round(cost.gold * (1 - this.bonuses.forgeDiscount));
    if (!this.canAfford(cost)) return { ok: false, why: 'cost' };
    this.pay(cost, 'craft');

    let result = null;
    if (r.kind === 'item') {
      const it = this.addItem(r.out, 1);
      result = { kind: 'item', item: it, def: ITEMS[r.out] };
      bus.emit(EV.ITEM_CRAFTED, { id: r.out, uid: it.uid });
    } else if (r.kind === 'potion') {
      const n = (r.qty || 1) + this.bonuses.potionYield;
      this.addPotion(r.out, n);
      result = { kind: 'potion', id: r.out, n };
    } else if (r.kind === 'material') {
      for (const k in r.out) this.addResource(k, r.out[k], 'craft');
      result = { kind: 'material', out: r.out };
    } else if (r.kind === 'special' && r.out === 'randomShards') {
      const owned = Object.keys(this.s.cards);
      const pick = owned[Math.floor(Math.random() * owned.length)];
      this.addShards(pick, 12);
      result = { kind: 'shards', id: pick, n: 12 };
    }
    this.mark();
    return { ok: true, result };
  }

  /* ----------------------------------------------------------- research */

  canResearch(id) {
    const n = RESEARCH[id];
    if (!n || this.s.research.includes(id)) return false;
    if (!researchAvailable(n, this.s.research)) return false;
    return this.canAfford(n.cost);
  }

  doResearch(id) {
    if (!this.canResearch(id)) return false;
    const n = RESEARCH[id];
    this.pay(n.cost, 'research');
    this.s.research.push(id);
    this.recomputeBonuses();
    bus.emit(EV.RESEARCH_DONE, { id, node: n });
    this.mark();
    return true;
  }

  recomputeBonuses() { this.bonuses = foldResearch(this.s.research); return this.bonuses; }

  /* --------------------------------------------------------- commander */

  xpToNext() { return CFG.cmd.xpPerLevel(this.s.level); }

  addXp(n) {
    if (!n) return;
    n = Math.round(n * this.bonuses.xpMult);
    this.s.xp += n;
    let leveled = 0;
    while (this.s.level < CFG.cmd.maxLevel && this.s.xp >= this.xpToNext()) {
      this.s.xp -= this.xpToNext();
      this.s.level++;
      this.s.skillPoints++;
      leveled++;
    }
    if (leveled) bus.emit(EV.LEVEL_UP, { level: this.s.level, gained: leveled });
    this.mark();
  }

  /* --------------------------------------------------------- campaign */

  regionUnlocked(id) { return !!this.s.progress.regions[id]?.unlocked; }

  unlockRegion(id) {
    if (!REGIONS[id] || this.regionUnlocked(id)) return;
    this.s.progress.regions[id] = { unlocked: true, at: Date.now() };
    bus.emit(EV.REGION_UNLOCKED, { id, region: REGIONS[id] });
    this.mark();
  }

  nodeCleared(nodeId) { return !!this.s.progress.nodes[nodeId]?.cleared; }

  nodeAvailable(regionId, node) {
    if (!this.regionUnlocked(regionId)) return false;
    return (node.requires || []).every(r => this.nodeCleared(r));
  }

  clearNode(nodeId, data = {}) {
    const rec = this.s.progress.nodes[nodeId] || (this.s.progress.nodes[nodeId] = { cleared: false, clears: 0, best: 0 });
    const first = !rec.cleared;
    rec.cleared = true;
    rec.clears++;
    if (data.score) rec.best = Math.max(rec.best, data.score);
    bus.emit(EV.NODE_CLEARED, { nodeId, first, ...data });
    this.mark();
    return first;
  }

  regionProgress(regionId) {
    const r = REGIONS[regionId];
    if (!r) return 0;
    const done = r.nodes.filter(n => this.nodeCleared(n.id)).length;
    return done / r.nodes.length;
  }

  chaptersCleared() {
    return REGION_LIST.filter(r => r.nodes.some(n => n.type === 'boss' && this.nodeCleared(n.id))).length;
  }

  /* ------------------------------------------------------------- flags */

  setFlag(k, v = true) { this.s.flags[k] = v; this.mark(); }
  flag(k) { return !!this.s.flags[k]; }

  addCodex(entry) {
    if (!this.s.codex.entries.includes(entry)) { this.s.codex.entries.push(entry); this.mark(); }
  }
  seeUnit(id) {
    if (!this.s.codex.units.includes(id)) { this.s.codex.units.push(id); this.mark(); }
  }
  seeFaction(id) {
    if (!this.s.codex.factions.includes(id)) { this.s.codex.factions.push(id); this.mark(); }
  }

  /* ------------------------------------------------------------ quests */

  questRecord(id) {
    return this.s.quests[id] || (this.s.quests[id] = { n: 0, done: false, claimed: false, seen: [] });
  }

  questProgress(id, amount = 1, uniqueKey = null) {
    const q = QUESTS[id];
    if (!q) return;
    const rec = this.questRecord(id);
    if (rec.done && !q.repeatable) return;
    if (uniqueKey) {
      if (rec.seen.includes(uniqueKey)) return;
      rec.seen.push(uniqueKey);
    }
    rec.n += amount;
    if (rec.n >= q.target && !rec.done) {
      rec.done = true;
      bus.emit(EV.QUEST_COMPLETE, { id, quest: q });
    } else {
      bus.emit(EV.QUEST_PROGRESS, { id, quest: q, n: rec.n });
    }
    this.mark();
  }

  claimQuest(id) {
    const q = QUESTS[id];
    const rec = this.questRecord(id);
    if (!q || !rec.done || rec.claimed) return false;
    this.grant(q.reward, 'quest');
    if (q.repeatable) { rec.n = 0; rec.done = false; rec.seen = []; }
    else rec.claimed = true;
    this.mark();
    return true;
  }

  /* ---------------------------------------------------------- settings */

  setSetting(k, v) { this.s.settings[k] = v; this.mark(); }
}

export const State = new GameState();
