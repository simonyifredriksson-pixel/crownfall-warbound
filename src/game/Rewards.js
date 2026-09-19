/* Rewards.js — what a battle pays out.

   Design intent: every battle must give at least one thing the player wanted.
   So a reward roll is not purely random — it is weighted toward
     (a) shards for cards already in the deck,
     (b) materials the player is short of for a recipe they can already see,
   with a genuinely random tail on top so there is still a surprise.
*/

import { RARITY, RARITY_ORDER } from '../core/Config.js';
import { makeRng, bagAdd, bagMerge } from '../core/Util.js';
import { UNITS, COLLECTIBLE, unitsByRarity } from '../data/Units.js';
import { MATERIALS, REGION_MATERIALS, TIER_WEIGHT } from '../data/Materials.js';
import { RECIPES, isDiscovered } from '../data/Recipes.js';

/**
 * Roll the reward bundle for a completed node.
 *
 * @param node     the campaign node
 * @param region   the region it belongs to
 * @param state    the GameState wrapper (for "what do they need?")
 * @param opt      { victory, first, score, seed, bonuses }
 */
export function rollRewards(node, region, state, opt = {}) {
  const rng = makeRng(opt.seed ?? ((Date.now() ^ (node.id.length * 2654435761)) >>> 0));
  const b = opt.bonuses || {};
  const victory = opt.victory !== false;
  const base = node.rewards || {};
  const out = { gold: 0, xp: 0, mats: {}, shards: {}, cards: [], scroll: 0, warSeal: 0, items: [], potions: {} };

  const lossMult = victory ? 1 : 0.3;
  const firstMult = (victory && opt.first) ? 1 : 1;   // first-clear is a separate bundle

  /* ---- currency ---- */
  out.gold = Math.round((base.gold || 0) * lossMult * (b.goldMult || 1) * (0.9 + rng() * 0.25));
  out.xp = Math.round((base.xp || 0) * (victory ? 1 : 0.45) * (b.xpMult || 1));
  out.scroll = (base.scroll || 0) + (victory ? (b.scrollBonus || 0) : 0);
  out.warSeal = victory ? (base.warSeal || 0) : 0;

  /* ---- materials ---- */
  const pool = (region.materials || REGION_MATERIALS[region.id] || ['iron']).filter(m => MATERIALS[m]);
  // the node's declared drops, scaled
  for (const k in (base.mats || {})) {
    const n = Math.round(base.mats[k] * lossMult * (b.materialMult || 1) * (0.8 + rng() * 0.5));
    if (n > 0) bagAdd(out.mats, k, n);
  }
  // plus a couple of weighted extras from the region pool
  if (victory) {
    const rolls = 2 + (node.type === 'elite' ? 1 : 0) + (node.type === 'boss' ? 2 : 0);
    for (let i = 0; i < rolls; i++) {
      const pick = rng.weighted(pool.map(id => ({ id, w: TIER_WEIGHT[MATERIALS[id].tier] || 1 })));
      bagAdd(out.mats, pick.id, Math.max(1, Math.round(rng.range(1, 3) * (b.materialMult || 1))));
    }
    // a targeted drop: something they are short of for a visible recipe
    const wanted = neededMaterial(state, pool, rng);
    if (wanted) bagAdd(out.mats, wanted, Math.max(1, Math.round(rng.range(1, 3))));
  }

  /* ---- shards ---- */
  const shardBudget = Math.round((base.shards || 0) * lossMult * (b.shardMult || 1));
  if (shardBudget > 0) {
    const deck = state.s.deck.filter(id => state.s.cards[id]);
    const owned = Object.keys(state.s.cards);
    // 60% into deck cards, 25% into other owned, 15% into something not owned
    let left = shardBudget;
    const put = (id, n) => { if (id && n > 0) bagAdd(out.shards, id, n); };

    if (deck.length) {
      const n = Math.round(shardBudget * 0.6);
      const per = Math.max(1, Math.floor(n / Math.min(3, deck.length)));
      const picks = rng.shuffle(deck).slice(0, 3);
      for (const id of picks) { put(id, per); left -= per; }
    }
    if (owned.length && left > 0) {
      const n = Math.max(1, Math.round(shardBudget * 0.25));
      put(rng.pick(owned), Math.min(left, n));
      left -= n;
    }
    if (left > 0) {
      const locked = COLLECTIBLE.filter(u => !state.s.cards[u.id]);
      if (locked.length) {
        const pick = rng.weighted(locked.map(u => ({ u, w: RARITY[u.rarity].dropWeight })));
        put(pick.u.id, left);
      } else if (owned.length) {
        put(rng.pick(owned), left);
      }
    }
  }

  /* ---- card drop ---- */
  if (victory) {
    const chance = { battle: 0.10, elite: 0.28, boss: 0.65, cache: 0.04, explore: 0 }[node.type] ?? 0.08;
    if (rng.chance(chance)) {
      const tier = region.order;
      const maxRarity = Math.min(5, 1 + tier);
      const candidates = COLLECTIBLE.filter(u => RARITY[u.rarity].order <= maxRarity && !state.s.cards[u.id]);
      if (candidates.length) {
        const pick = rng.weighted(candidates.map(u => ({ u, w: RARITY[u.rarity].dropWeight })));
        out.cards.push(pick.u.id);
      }
    }
  }

  /* ---- potions ---- */
  if (victory && rng.chance(0.3)) bagAdd(out.potions, 'healthPotion', rng.int(1, 2));

  return out;
}

/** First-clear bonus is a separate, guaranteed, generous bundle. */
export function firstClearBundle(node) {
  return node.first || null;
}

/** A material the player needs for a recipe they can already see. */
function neededMaterial(state, pool, rng) {
  const wants = [];
  for (const r of Object.values(RECIPES)) {
    if (!isDiscovered(r, state.s)) continue;
    for (const k in r.cost) {
      if (k === 'gold') continue;
      const have = state.count(k);
      if (have < r.cost[k] && pool.includes(k)) wants.push(k);
    }
  }
  if (!wants.length) return null;
  return rng.pick(wants);
}

/* ==========================================================================
   CHESTS — used by caches, the shop and endless mode
   ========================================================================== */

export const CHESTS = {
  supply: {
    id: 'supply', name: 'Supply Crate', icon: '📦', color: '#9aa3af', price: 400,
    desc: 'Common materials and a handful of shards.',
    roll: (state, rng) => ({
      gold: rng.int(60, 160),
      mats: rollMats(rng, 1, 5, 2),
      shards: rollShards(state, rng, 18, 1),
    }),
  },
  war: {
    id: 'war', name: 'War Chest', icon: '⚔', color: '#4f8fd4', price: 1400,
    desc: 'Tier-2 materials, a solid shard payout and a real chance of a new card.',
    roll: (state, rng) => ({
      gold: rng.int(200, 500),
      mats: rollMats(rng, 2, 7, 3),
      shards: rollShards(state, rng, 55, 2),
      cards: rng.chance(0.35) ? [pickCard(state, rng, 3)] : [],
    }),
  },
  relic: {
    id: 'relic', name: 'Relic Vault', icon: '🏺', color: '#9a6fe0', price: 4200,
    desc: 'Rare materials, a large shard payout, and a guaranteed Epic-or-better card.',
    roll: (state, rng) => ({
      gold: rng.int(600, 1400),
      mats: rollMats(rng, 3, 8, 4),
      shards: rollShards(state, rng, 140, 3),
      cards: [pickCard(state, rng, 5, 3)],
      warSeal: rng.int(1, 3),
    }),
  },
  crown: {
    id: 'crown', name: 'Crown Reliquary', icon: '👑', color: '#e0a02e', price: 12000,
    desc: 'Everything, including a Crown Shard. The Wizard disapproves of the whole arrangement.',
    roll: (state, rng) => ({
      gold: rng.int(1500, 3200),
      mats: { ...rollMats(rng, 3, 10, 5), crownshard: 1, starIron: rng.int(1, 3) },
      shards: rollShards(state, rng, 320, 4),
      cards: [pickCard(state, rng, 5, 4)],
      warSeal: rng.int(4, 8), scroll: rng.int(2, 5),
    }),
  },
};

function rollMats(rng, maxTier, count, spread) {
  const ids = Object.values(MATERIALS).filter(m => m.tier <= maxTier).map(m => ({ id: m.id, w: TIER_WEIGHT[m.tier] }));
  const out = {};
  for (let i = 0; i < count; i++) {
    const p = rng.weighted(ids);
    bagAdd(out, p.id, rng.int(1, 1 + spread));
  }
  return out;
}

function rollShards(state, rng, budget, spread) {
  const owned = Object.keys(state.s.cards);
  const out = {};
  if (!owned.length) return out;
  const n = Math.min(owned.length, 1 + spread);
  const picks = rng.shuffle(owned).slice(0, n);
  const per = Math.max(1, Math.floor(budget / n));
  for (const id of picks) bagAdd(out, id, per);
  return out;
}

function pickCard(state, rng, maxRarityOrder, minRarityOrder = 0) {
  const pool = COLLECTIBLE.filter(u => {
    const o = RARITY[u.rarity].order;
    return o <= maxRarityOrder && o >= minRarityOrder;
  });
  const unowned = pool.filter(u => !state.s.cards[u.id]);
  const use = unowned.length ? unowned : pool;
  return rng.weighted(use.map(u => ({ u, w: RARITY[u.rarity].dropWeight }))).u.id;
}

export function openChest(chestId, state) {
  const c = CHESTS[chestId];
  if (!c) return null;
  const rng = makeRng((Math.random() * 0xffffffff) >>> 0);
  return c.roll(state, rng);
}

/* ==========================================================================
   SHOP — rotating stock
   ========================================================================== */

export function rollShop(state, seed) {
  const rng = makeRng(seed >>> 0);
  const stock = [];
  const chapter = state.chaptersCleared();

  // chests are always available
  stock.push({ kind: 'chest', id: 'supply', price: CHESTS.supply.price });
  if (chapter >= 1) stock.push({ kind: 'chest', id: 'war', price: CHESTS.war.price });
  if (chapter >= 3) stock.push({ kind: 'chest', id: 'relic', price: CHESTS.relic.price });
  if (chapter >= 4) stock.push({ kind: 'chest', id: 'crown', price: CHESTS.crown.price });

  // three material lots
  const pool = Object.values(MATERIALS).filter(m => m.tier <= Math.min(4, 1 + chapter));
  for (let i = 0; i < 3; i++) {
    const m = rng.weighted(pool.map(x => ({ x, w: TIER_WEIGHT[x.tier] }))).x;
    const qty = m.tier <= 1 ? rng.int(6, 12) : m.tier === 2 ? rng.int(3, 6) : rng.int(1, 3);
    stock.push({ kind: 'material', id: m.id, qty, price: Math.round(qty * (28 * Math.pow(3.1, m.tier - 1)) * rng.range(0.9, 1.15)) });
  }

  // two shard lots for cards the player owns
  const owned = Object.keys(state.s.cards);
  for (let i = 0; i < 2 && owned.length; i++) {
    const id = rng.pick(owned);
    const u = UNITS[id];
    const qty = rng.int(8, 24);
    stock.push({ kind: 'shards', id, qty, price: Math.round(qty * 22 * RARITY[u.rarity].shardMult) });
  }

  // one potion lot
  stock.push({ kind: 'potion', id: 'healthPotion', qty: 5, price: 260 });

  return stock;
}
