/* Progression.js — the glue between a finished battle and a bigger army.

   Two jobs:
     1. Wire every quest's `track` descriptor to the bus, generically, so
        adding a quest in data needs no code here.
     2. Turn a battle result into rewards, node clears, level-ups and codex
        entries — in that order, so the results screen can show them as a
        sequence.
*/

import { bus, EV } from '../core/Bus.js';
import { State } from './State.js';
import { rollRewards, firstClearBundle } from './Rewards.js';
import { QUESTS, QUEST_LIST } from '../data/Quests.js';
import { RESEARCH } from '../data/Research.js';
import { findNode, REGIONS, endlessWave } from '../data/Campaign.js';
import { UNITS } from '../data/Units.js';
import { CFG } from '../core/Config.js';
import { bagMerge } from '../core/Util.js';

let wired = false;

/** Hook every quest tracker onto the bus. Call once at boot. */
export function wireQuests() {
  if (wired) return;
  wired = true;

  for (const q of QUEST_LIST) {
    const t = q.track;
    if (!t) continue;
    bus.on(t.evt, (payload) => {
      try {
        if (!t.test(payload || {})) return;
        const amount = t.amount ? t.amount(payload) : 1;
        const key = t.unique ? String(payload?.id ?? payload?.nodeId ?? payload?.cardId ?? JSON.stringify(payload)) : null;
        State.questProgress(q.id, amount, key);
      } catch (e) { /* a quest predicate must never break the game */ }
    });
  }

  // auto-claim is deliberate: quests are a reward drip, not a chore list
  bus.on(EV.QUEST_COMPLETE, ({ id }) => {
    State.claimQuest(id);
  });
}

/* ==========================================================================
   BATTLE RESULT
   ========================================================================== */

/**
 * @param result {
 *   victory, nodeId, regionId, endlessWave,
 *   stats: { kills, losses, damage, cmdDamageTaken, guardiansLost, duration, ... },
 *   dmgTypes, avgCost
 * }
 * @returns a summary object for the results screen
 */
export function processBattleResult(result) {
  const s = State.s;
  const found = result.nodeId ? findNode(result.nodeId) : null;
  const node = found?.node;
  const region = found?.region;

  s.stats.battles++;
  if (result.victory) s.stats.wins++; else s.stats.losses++;
  s.stats.kills += result.stats?.kills || 0;
  s.stats.damage += Math.round(result.stats?.damage || 0);

  // per-card usage, so the collection can show "your most-used card"
  for (const id of s.deck) {
    const c = s.cards[id];
    if (!c) continue;
    c.battles = (c.battles || 0) + 1;
  }
  if (result.killsByCard) {
    for (const id in result.killsByCard) {
      if (s.cards[id]) s.cards[id].kills = (s.cards[id].kills || 0) + result.killsByCard[id];
    }
  }

  const summary = {
    victory: result.victory,
    node, region,
    first: false,
    rewards: null,
    firstBundle: null,
    levelBefore: s.level,
    xpBefore: s.xp,
    levelAfter: s.level,
    newCards: [],
    unlockedRegion: null,
    quests: [],
  };

  /* ---- endless mode pays from its own table ---- */
  if (result.endlessWave) {
    const w = endlessWave(result.endlessWave);
    const bundle = { gold: w.reward.gold, xp: w.reward.xp, warSeal: w.reward.warSeal, shards: {} };
    // spread shards across the deck
    const per = Math.max(1, Math.round(w.reward.shards / Math.max(1, s.deck.length)));
    for (const id of s.deck) bundle.shards[id] = per;
    summary.rewards = bundle;
    applyBundle(bundle, summary);
    s.endless.best = Math.max(s.endless.best, result.endlessWave);
    State.mark();
    summary.levelAfter = s.level;
    return summary;
  }

  if (!node) { State.mark(); return summary; }

  /* ---- reward roll ---- */
  const wasCleared = State.nodeCleared(node.id);
  const first = result.victory && !wasCleared;
  summary.first = first;

  const rewards = rollRewards(node, region, State, {
    victory: result.victory, first, bonuses: State.bonuses,
  });
  summary.rewards = rewards;
  applyBundle(rewards, summary);

  /* ---- first-clear bundle ---- */
  if (first) {
    const fb = firstClearBundle(node);
    if (fb) {
      summary.firstBundle = fb;
      applyBundle(normaliseBundle(fb), summary);
    }
  }

  /* ---- node + codex ---- */
  if (result.victory) {
    State.clearNode(node.id, { score: result.stats?.score || 0, nodeId: node.id, first });
    if (node.faction) State.seeFaction(node.faction);
    for (const u of node.enemyDeck || []) State.seeUnit(u);
    if (node.boss) State.seeUnit(node.boss);
  }

  summary.levelAfter = s.level;
  State.save();
  return summary;
}

/** Turn a data-authored bundle (node.first) into the standard shape. */
function normaliseBundle(b) {
  return {
    gold: b.gold || 0, xp: b.xp || 0, scroll: b.scroll || 0, warSeal: b.warSeal || 0,
    mats: b.mats || {}, shards: typeof b.shards === 'object' ? b.shards : {},
    cards: b.cards || [], potions: b.potions || {},
    flag: b.flag, unlocks: b.unlocks, codex: b.codex,
  };
}

function applyBundle(b, summary) {
  if (!b) return;
  if (b.gold) State.addGold(b.gold, 'battle');
  if (b.xp) State.addXp(b.xp);
  if (b.scroll) State.addResource('scroll', b.scroll, 'battle');
  if (b.warSeal) State.addResource('warSeal', b.warSeal, 'battle');
  for (const k in (b.mats || {})) State.addResource(k, b.mats[k], 'battle');
  for (const k in (b.shards || {})) State.addShards(k, b.shards[k]);
  for (const k in (b.potions || {})) State.addPotion(k, b.potions[k]);
  for (const id of (b.cards || [])) {
    const isNew = State.unlockCard(id);
    if (isNew && summary) summary.newCards.push(id);
  }
  if (b.flag) State.setFlag(b.flag, true);
  if (b.codex) State.addCodex(b.codex);
  if (b.unlocks) {
    State.unlockRegion(b.unlocks);
    if (summary) summary.unlockedRegion = b.unlocks;
  }
}

/* ==========================================================================
   EXPLORATION EVENTS
   ========================================================================== */

/**
 * Resolve an explore-node choice.
 * @returns { success, text, gained }
 */
export function resolveEvent(node, event, optionIndex) {
  const opt = event.opts[optionIndex];
  if (!opt) return null;

  const risky = opt.risk !== undefined;
  const success = !risky || Math.random() > opt.risk;
  const bundle = success ? opt.result : (opt.fail || {});

  const gained = { gold: 0, mats: {}, shards: 0, scroll: 0, xp: 0, cards: [], hpCost: 0 };

  if (bundle.gold) { State.addGold(bundle.gold, 'explore'); gained.gold = bundle.gold; }
  if (bundle.xp) { State.addXp(bundle.xp); gained.xp = bundle.xp; }
  if (bundle.scroll) { State.addResource('scroll', bundle.scroll, 'explore'); gained.scroll = bundle.scroll; }
  if (bundle.warSeal) State.addResource('warSeal', bundle.warSeal, 'explore');
  const matMult = State.bonuses.materialMult;
  for (const k in (bundle.mats || {})) {
    const n = Math.max(1, Math.round(bundle.mats[k] * matMult));
    State.addResource(k, n, 'explore');
    gained.mats[k] = n;
  }
  if (bundle.shards) {
    // spread across the deck
    const per = Math.max(1, Math.round(bundle.shards / Math.max(1, State.s.deck.length)));
    for (const id of State.s.deck) State.addShards(id, per);
    gained.shards = bundle.shards;
  }
  if (bundle.flag) State.setFlag(bundle.flag, true);
  if (bundle.codex) State.addCodex(bundle.codex);
  if (bundle.heal) State.setFlag('rested', true);
  if (bundle.hpCost) gained.hpCost = bundle.hpCost;

  // one extra roll from Prospecting
  if (success && State.bonuses.extraExploreRoll > 0 && bundle.mats) {
    for (const k in bundle.mats) {
      const n = Math.max(1, Math.round(bundle.mats[k] * 0.4));
      State.addResource(k, n, 'explore');
      gained.mats[k] = (gained.mats[k] || 0) + n;
    }
  }

  State.clearNode(node.id, { nodeId: node.id, explore: true });
  State.save();

  return {
    success,
    text: success ? opt.text : (opt.failText || 'It does not go the way you hoped.'),
    gained,
  };
}

/* ==========================================================================
   DERIVED VIEWS FOR THE UI
   ========================================================================== */

/** "What should I do next?" — drives the dock badges and the war-map hints. */
export function nextActions() {
  const out = [];
  const s = State.s;

  // upgradable cards
  const up = Object.keys(s.cards).filter(id => State.canUpgradeCard(id));
  if (up.length) out.push({ kind: 'upgrade', n: up.length, label: `${up.length} card${up.length > 1 ? 's' : ''} ready to upgrade` });

  // affordable research
  const res = Object.keys(RESEARCH).filter(id => State.canResearch(id));
  if (res.length) out.push({ kind: 'research', n: res.length, label: `${res.length} research project${res.length > 1 ? 's' : ''} affordable` });

  // craftable recipes
  const craft = State.knownRecipes().filter(r => State.canAfford(r.cost));
  if (craft.length) out.push({ kind: 'craft', n: craft.length, label: `${craft.length} recipe${craft.length > 1 ? 's' : ''} you can make` });

  // claimable quests
  const q = QUEST_LIST.filter(x => { const r = s.quests[x.id]; return r && r.done && !r.claimed; });
  if (q.length) out.push({ kind: 'quest', n: q.length, label: `${q.length} challenge${q.length > 1 ? 's' : ''} complete` });

  // deck not full
  // only nag when there is a free slot AND a card to put in it
  const cap = State.deckCapacity();
  if (s.deck.length < cap && Object.keys(s.cards).length > s.deck.length) {
    out.push({ kind: 'deck', n: cap - s.deck.length, label: `${cap - s.deck.length} empty army slot${cap - s.deck.length > 1 ? 's' : ''}` });
  }

  return out;
}
