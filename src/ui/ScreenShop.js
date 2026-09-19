/* ScreenShop.js — Odessa's marketplace.

   Stock rotates on a seed derived from how many battles you have fought, so
   it changes as you play rather than on a real-world clock. A gold refresh is
   available for players who want a specific material now.
*/

import { State } from '../game/State.js';
import { UI } from './UI.js';
import { section, empty, button, costList } from './Widgets.js';
import { CHESTS, rollShop, openChest } from '../game/Rewards.js';
import { MATERIALS, resourceIcon, resourceName } from '../data/Materials.js';
import { UNITS } from '../data/Units.js';
import { POTIONS } from '../data/Items.js';
import { RARITY } from '../core/Config.js';
import { audio } from '../core/Audio.js';
import { esc, formatNum, commas } from '../core/Util.js';

export const ScreenShop = {
  id: 'shop',

  build(el, args, ui) {
    const parts = ui.scaffold(el, {
      icon: '💰',
      title: 'The Marketplace',
      blurb: 'Odessa Vane. Everything here is legally hers as of about an hour ago.',
    });
    build(parts.body, ui);
  },
};

function seedFor() {
  return ((State.s.stats.battles * 2654435761) ^ (State.s.flags.shopRefresh || 0)) >>> 0;
}

function build(body, ui) {
  const stock = rollShop(State, seedFor());
  const bought = State.s.flags.shopBought || {};

  body.appendChild(section('Stock', 'Rotates as you fight. Buying something removes it until the next rotation.'));

  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(270px,1fr))';
  body.appendChild(grid);

  stock.forEach((s, i) => {
    const key = seedFor() + ':' + i;
    const sold = bought[key];
    const el = document.createElement('div');
    el.className = 'recipe' + (sold ? ' undisc' : '');
    let icon = '📦', name = '', desc = '', rc = '#3d4453';

    if (s.kind === 'chest') {
      const c = CHESTS[s.id];
      icon = c.icon; name = c.name; desc = c.desc; rc = c.color;
    } else if (s.kind === 'material') {
      const m = MATERIALS[s.id];
      icon = m.icon; name = `${m.name} ×${s.qty}`; desc = m.desc; rc = m.color;
    } else if (s.kind === 'shards') {
      const u = UNITS[s.id];
      icon = '🔷'; name = `${u.name} shards ×${s.qty}`;
      desc = `Upgrade material for ${u.name}. You hold ${formatNum(State.card(s.id)?.shards || 0)}.`;
      rc = RARITY[u.rarity].color;
    } else if (s.kind === 'potion') {
      const p = POTIONS[s.id];
      icon = p.icon; name = `${p.name} ×${s.qty}`; desc = p.desc; rc = p.color;
    }

    el.style.setProperty('--rc', rc);
    el.innerHTML = `
      <div class="ric">${icon}</div>
      <div>
        <div class="rn">${esc(name)}</div>
        <div class="rd">${esc(desc)}</div>
        <div class="matlist"><span class="mat${State.s.gold >= s.price ? '' : ' short'}">🪙 ${formatNum(s.price)}</span></div>
      </div>
      <div></div>`;

    if (!sold) {
      const b = button('Buy', 'sm gold' + (State.s.gold >= s.price ? '' : ' dis'), () => {
        if (State.s.gold < s.price) { audio.play('ui.deny'); return; }
        State.addGold(-s.price, 'shop');
        buy(s, ui);
        State.s.flags.shopBought = { ...bought, [key]: true };
        State.mark();
        ui.refresh();
      });
      el.lastElementChild.appendChild(b);
    } else {
      el.lastElementChild.innerHTML = '<span class="chip">Sold</span>';
    }
    grid.appendChild(el);
  });

  /* ------------------------------------------------------------ refresh */
  const refreshCost = 250 + (State.s.flags.shopRefresh || 0) * 120;
  const foot = document.createElement('div');
  foot.className = 'rowflex mt16';
  foot.appendChild(button(`Refresh stock — 🪙 ${formatNum(refreshCost)}`, 'ghost' + (State.s.gold >= refreshCost ? '' : ' dis'), () => {
    if (State.s.gold < refreshCost) { audio.play('ui.deny'); return; }
    State.addGold(-refreshCost, 'shop');
    State.s.flags.shopRefresh = (State.s.flags.shopRefresh || 0) + 1;
    State.s.flags.shopBought = {};
    State.mark();
    audio.play('ui.click');
    ui.refresh();
  }));
  body.appendChild(foot);
}

function buy(s, ui) {
  if (s.kind === 'chest') {
    const loot = openChest(s.id, State);
    State.grant({ ...loot, mats: loot.mats }, 'chest');
    if (loot.shards) for (const k in loot.shards) State.addShards(k, loot.shards[k]);
    audio.play('unlock');
    showChest(CHESTS[s.id], loot);
  } else if (s.kind === 'material') {
    State.addResource(s.id, s.qty, 'shop');
    audio.play('coin');
    UI.toast(`${MATERIALS[s.id].name} ×${s.qty}`, 'good', MATERIALS[s.id].icon);
  } else if (s.kind === 'shards') {
    State.addShards(s.id, s.qty);
    audio.play('coin');
    UI.toast(`${UNITS[s.id].name} shards ×${s.qty}`, 'good', '🔷');
  } else if (s.kind === 'potion') {
    State.addPotion(s.id, s.qty);
    audio.play('coin');
    UI.toast(`${POTIONS[s.id].name} ×${s.qty}`, 'good', POTIONS[s.id].icon);
  }
}

function showChest(chest, loot) {
  const items = [];
  if (loot.gold) items.push(['🪙', formatNum(loot.gold), 'Gold']);
  if (loot.warSeal) items.push(['🎖', loot.warSeal, 'War Seals']);
  if (loot.scroll) items.push(['📜', loot.scroll, 'Scrolls']);
  for (const k in (loot.mats || {})) items.push([resourceIcon(k), loot.mats[k], resourceName(k)]);
  for (const k in (loot.shards || {})) items.push(['🔷', loot.shards[k], (UNITS[k]?.name || k) + ' shards']);
  for (const c of (loot.cards || [])) items.push(['🃏', '', UNITS[c]?.name || c]);

  UI.overlay(`
    <div class="h-rule"><h2>${chest.icon} ${esc(chest.name)}</h2></div>
    <div class="rewardrow">
      ${items.map(([i, v, l], k) => `<div class="reward" style="animation-delay:${k * 0.06}s">
        <div class="ri">${i}</div><div class="rv">${v}</div><div class="rl">${esc(l)}</div></div>`).join('')}
    </div>
    <div class="rowflex mt16" style="justify-content:flex-end"><div class="btn gold" data-ok>Take it all</div></div>
  `, (el, close) => { el.querySelector('[data-ok]').onclick = () => { audio.play('ui.click'); close(); }; });
}
