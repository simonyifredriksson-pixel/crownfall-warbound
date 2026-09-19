/* Widgets.js — reusable interface pieces.

   Cards, stat blocks, cost rows, ability lists and the counter matrix. Every
   screen composes these rather than writing its own markup, so a card looks
   and behaves identically in the collection, the deck builder, the battle hand
   and the reward screen.
*/

import { State } from '../game/State.js';
import { UI } from './UI.js';
import { UNITS, ROLE_INFO, statsAt, tierOf, threatScore } from '../data/Units.js';
import { ABILITIES, abilitiesFor } from '../data/Abilities.js';
import { RARITY, CFG, COUNTER, counterMult, counterLabel, DAMAGE_TYPES, ARMOR_TYPES } from '../core/Config.js';
import { MATERIALS, getMaterial, resourceIcon, resourceName } from '../data/Materials.js';
import { ITEMS, SLOTS, SLOT_ORDER, itemStatsAt, WEAPON_CLASSES } from '../data/Items.js';
import { esc, commas, formatNum, roman, clamp } from '../core/Util.js';
import { paintPortrait, Thumbs, ROLE_GLYPH } from './Thumbs.js';
import { ic } from '../art/Icons.js';

/* ==========================================================================
   CARDS
   ========================================================================== */

/**
 * A full collection card.
 * @param o { unitId, level, shards, owned, selected, dim, locked, onClick, showUpgrade }
 */
export function cardEl(o) {
  const u = UNITS[o.unitId];
  if (!u) return document.createElement('div');
  const lvl = o.level || 1;
  const owned = o.owned !== false;
  const rarity = u.rarity;

  const el = document.createElement('div');
  el.className = `card r-${rarity}`;
  if (o.selected) el.classList.add('sel');
  if (o.dim) el.classList.add('dim');
  if (!owned || o.locked) el.classList.add('locked');
  el.dataset.unit = u.id;

  const art = document.createElement('div');
  art.className = 'art';
  el.appendChild(art);

  const cost = document.createElement('div');
  cost.className = 'cost';
  cost.textContent = u.cost;
  el.appendChild(cost);

  if (owned) {
    const lb = document.createElement('div');
    lb.className = 'lvlbadge';
    lb.textContent = 'Lv' + lvl;
    el.appendChild(lb);
  }

  const rolebar = document.createElement('div');
  rolebar.className = 'rolebar';
  rolebar.textContent = (ROLE_INFO[u.role]?.name || u.role);
  el.appendChild(rolebar);

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = u.name;
  el.appendChild(name);

  if (owned && o.shards !== undefined) {
    const foot = document.createElement('div');
    foot.className = 'foot';
    const need = State.upgradeCost(u.id)?.shards ?? 0;
    const pct = need ? clamp(o.shards / need, 0, 1) : 1;
    foot.innerHTML = `
      <div class="xpbar"><i style="width:${(pct * 100).toFixed(0)}%"></i></div>
      <div class="shards">${formatNum(o.shards)} / ${formatNum(need)}</div>`;
    el.appendChild(foot);
    if (State.canUpgradeCard(u.id) && o.showUpgrade !== false) el.classList.add('upgradable');
  }

  paintPortrait(art, u.id, lvl);

  el.dataset.tip = 'card:' + u.id + ':' + lvl;
  if (o.onClick) el.addEventListener('click', () => o.onClick(u.id, el));
  return el;
}

/** The small card used in deck slots and the battle hand. */
export function miniCardEl(unitId, level, onClick) {
  const u = UNITS[unitId];
  const el = document.createElement('div');
  if (!u) { el.className = 'mini empty'; if (onClick) el.onclick = () => onClick(null, el); return el; }
  el.className = 'mini r-' + u.rarity;
  el.style.setProperty('--rc', RARITY[u.rarity].color);
  el.innerHTML = `<div class="art"></div><div class="cost">${u.cost}</div><div class="nm">${esc(u.name)}</div>`;
  paintPortrait(el.querySelector('.art'), unitId, level || 1);
  el.dataset.tip = 'card:' + unitId + ':' + (level || 1);
  if (onClick) el.addEventListener('click', () => onClick(unitId, el));
  return el;
}

export function emptySlotEl(onClick) {
  const el = document.createElement('div');
  el.className = 'mini empty';
  if (onClick) el.addEventListener('click', () => onClick(null, el));
  return el;
}

/* ==========================================================================
   CARD DETAIL PANEL
   ========================================================================== */

export function cardDetail(unitId, opts = {}) {
  const u = UNITS[unitId];
  const save = State.card(unitId);
  const lvl = opts.level ?? (save?.level || 1);
  const owned = !!save;
  const st = statsAt(u, lvl, CFG.cards.statGrowth);
  const nextSt = lvl < State.cardLevelCap() ? statsAt(u, lvl + 1, CFG.cards.statGrowth) : null;
  const tier = tierOf(lvl);
  const rarity = RARITY[u.rarity];

  const wrap = document.createElement('div');
  wrap.className = 'detail';
  wrap.style.setProperty('--rc', rarity.color);

  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.innerHTML = `<div class="rare-lab">${rarity.name}${save?.awakened ? ' · Awakened' : ''}</div>`;
  const heroArt = Thumbs.getHero(unitId, lvl, { w: 340, h: 190 });
  if (heroArt) { heroArt.style.width = '100%'; heroArt.style.height = '100%'; hero.appendChild(heroArt); }
  wrap.appendChild(hero);

  const body = document.createElement('div');
  body.className = 'body';
  wrap.appendChild(body);

  const dps = (st.dmg * u.atkSpeed * (u.count || 1)).toFixed(0);
  body.innerHTML = `
    <h3>${esc(u.name)}</h3>
    <div class="rowflex gap6" style="margin-top:4px">
      <span class="tag">${ROLE_INFO[u.role]?.icon || ''} ${ROLE_INFO[u.role]?.name || u.role}</span>
      <span class="tag t-${u.dmgType}">${u.dmgType}</span>
      <span class="tag">${u.armorType} armour</span>
      ${u.count > 1 ? `<span class="tag">×${u.count}</span>` : ''}
      <span class="tag">Cost ${u.cost}</span>
      ${owned ? `<span class="tag">Tier ${roman(tier + 1)}</span>` : ''}
    </div>
    <div class="lore">${esc(u.lore || '')}</div>
    <div class="statrows">
      ${statRow('Health', st.hp, nextSt?.hp, 4200, 'hp')}
      ${statRow('Damage', st.dmg, nextSt?.dmg, 250, 'dmg')}
      ${statRow('DPS', dps, null, 600, 'dmg')}
      ${statRow('Attack speed', u.atkSpeed.toFixed(2) + '/s', null, null, '')}
      ${statRow('Range', u.range.toFixed(1) + 'm', null, 34, 'rng')}
      ${statRow('Speed', u.moveSpeed.toFixed(1) + 'm/s', null, 8, 'spd')}
      ${statRow('Armour', st.armor, nextSt?.armor, 34, '')}
      ${statRow('Mass', ['—', 'Small', 'Medium', 'Large', 'Huge', 'Colossal'][u.mass] || u.mass, null, null, '')}
    </div>
    <div class="h-rule" style="margin:12px 0 6px"><h2 style="font-size:13px">Abilities</h2></div>
    <div id="abils"></div>
    ${u.mechanic ? `<div class="advice mt10">${esc(u.mechanic)}</div>` : ''}
  `;

  const ab = body.querySelector('#abils');
  for (const a of abilitiesFor({ ...u, _awakened: save?.awakened }, lvl)) {
    const row = document.createElement('div');
    row.className = 'abil' + (a.unlocked ? '' : ' lockd');
    const reqTxt = a.awaken ? 'Requires awakening'
      : `Unlocks at level ${a.tierReq * CFG.cards.tierEvery + 1}`;
    row.innerHTML = `
      <div class="ai">${a.ability.icon}</div>
      <div>
        <div class="an">${esc(a.ability.name)}</div>
        <div class="ad">${a.ability.desc({ statMult: st.mult, mods: {} })}</div>
        ${a.unlocked ? '' : `<div class="req">${reqTxt}</div>`}
      </div>`;
    ab.appendChild(row);
  }

  if (owned && opts.showUpgrade !== false) {
    const cap = State.cardLevelCap();
    const line = document.createElement('div');
    line.className = 'costline';
    if (lvl >= cap) {
      if (save.awakened) {
        line.innerHTML = `<div class="sub" style="font-style:normal">Fully awakened.</div>`;
      } else if (State.bonuses.awakeningUnlocked) {
        const cost = State.awakenCost(unitId);
        line.innerHTML = `<div class="costs">${costList(cost)}</div>`;
        const btn = document.createElement('div');
        btn.className = 'btn gold' + (State.canAwaken(unitId) ? '' : ' dis');
        btn.textContent = 'Awaken';
        btn.onclick = () => { if (State.awakenCard(unitId)) opts.onChange?.(); };
        line.appendChild(btn);
      } else {
        line.innerHTML = `<div class="sub">Maximum level. The Wizard can take the ceiling off — ask him about the Awakening Rite.</div>`;
      }
    } else {
      const cost = State.upgradeCost(unitId);
      line.innerHTML = `<div class="costs">
        <span class="ci${save.shards >= cost.shards ? '' : ' short'}">${ic('crystal')} ${formatNum(save.shards)}/${formatNum(cost.shards)}</span>
        <span class="ci${State.s.gold >= cost.gold ? '' : ' short'}">${ic('coin')} ${formatNum(cost.gold)}</span>
      </div>`;
      const btn = document.createElement('div');
      btn.className = 'btn gold' + (State.canUpgradeCard(unitId) ? '' : ' dis');
      btn.innerHTML = `Upgrade to ${lvl + 1}`;
      btn.onclick = () => {
        if (State.upgradeCard(unitId)) {
          Thumbs.invalidate(unitId);
          opts.onChange?.();
        }
      };
      line.appendChild(btn);
    }
    body.appendChild(line);
  }

  if (!owned) {
    const note = document.createElement('div');
    note.className = 'costline';
    const have = State.s.shards[unitId] || 0;
    const need = Math.round(20 * rarity.shardMult);
    note.innerHTML = `<div class="sub" style="font-style:normal">Not yet in your collection.<br>
      Shards found: <b>${have} / ${need}</b></div>`;
    body.appendChild(note);
  }

  return wrap;
}

function statRow(label, v, next, max, cls) {
  const num = typeof v === 'number' ? v : parseFloat(v);
  const pct = max && !isNaN(num) ? clamp(num / max, 0, 1) * 100 : null;
  const up = next !== null && next !== undefined && next !== v
    ? `<span class="up">+${Math.round((next - v) * 10) / 10}</span>` : '';
  return `<div class="statrow ${cls}">
    <span class="k">${label}</span>
    ${pct !== null ? `<span class="bar"><i style="width:${pct.toFixed(0)}%"></i></span>` : '<span></span>'}
    <span class="v">${typeof v === 'number' ? commas(v) : v} ${up}</span>
  </div>`;
}

/* ==========================================================================
   COSTS
   ========================================================================== */

export function costList(cost, opts = {}) {
  return Object.entries(cost).map(([k, n]) => {
    const have = State.count(k);
    const short = have < n;
    return `<span class="mat${short ? ' short' : ''}" data-tip="res:${k}">
      <span class="mi">${resourceIcon(k)}</span>${formatNum(n)}${opts.showHave ? ` <span class="muted">/${formatNum(have)}</span>` : ''}
    </span>`;
  }).join('');
}

export function canAffordHtml(cost) { return State.canAfford(cost); }

/* ==========================================================================
   DECK COMPOSITION METER
   ========================================================================== */

export function compositionMeter(units) {
  const buckets = {
    Frontline: { n: 0, color: '#8d95a3', roles: ['guardian', 'melee'] },
    Ranged: { n: 0, color: '#5fa25a', roles: ['ranged'] },
    Magic: { n: 0, color: '#9a6fe0', roles: ['caster', 'support', 'summoner'] },
    Mobile: { n: 0, color: '#e8823a', roles: ['assassin', 'cavalry', 'flyer', 'beast'] },
    Siege: { n: 0, color: '#c8a98a', roles: ['siege'] },
  };
  for (const u of units) {
    for (const k in buckets) if (buckets[k].roles.includes(u.role)) { buckets[k].n++; break; }
  }
  const total = Math.max(1, units.length);
  const bars = Object.entries(buckets).filter(([, b]) => b.n > 0)
    .map(([, b]) => `<i style="width:${(b.n / total * 100).toFixed(1)}%;background:${b.color}"></i>`).join('');
  const legend = Object.entries(buckets).filter(([, b]) => b.n > 0)
    .map(([k, b]) => `<span><b style="background:${b.color}"></b>${k} ${b.n}</span>`).join('');
  return `<div class="compmeter">${bars}</div><div class="complegend">${legend}</div>`;
}

/* ==========================================================================
   THE COUNTER MATRIX
   ========================================================================== */

export function counterMatrix() {
  let html = '<div class="matrix"><table><thead><tr><th>Damage \\ Armour</th>';
  for (const a of ARMOR_TYPES) html += `<th>${a}</th>`;
  html += '</tr></thead><tbody>';
  for (const d of DAMAGE_TYPES) {
    html += `<tr><td>${d}</td>`;
    for (const a of ARMOR_TYPES) {
      const m = counterMult(d, a);
      const lab = counterLabel(m);
      html += `<td class="${lab.cls}">${m.toFixed(2)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

/* ==========================================================================
   ITEMS
   ========================================================================== */

export function itemCell(item, opts = {}) {
  const def = ITEMS[item.id];
  const el = document.createElement('div');
  el.className = 'itemcell';
  el.style.setProperty('--rc', RARITY[def.rarity].color);
  el.innerHTML = `${def.icon}<span class="lvl">${item.level > 1 ? '+' + (item.level - 1) : ''}</span>`;
  if (opts.equipped) el.classList.add('eq');
  el.dataset.tip = 'item:' + item.uid;
  if (opts.onClick) el.addEventListener('click', () => opts.onClick(item, el));
  return el;
}

export function itemTooltip(item) {
  const def = ITEMS[item.id];
  if (!def) return null;
  const st = itemStatsAt(def, item.level);
  const wc = def.wclass ? WEAPON_CLASSES[def.wclass] : null;
  const rows = Object.entries(st).filter(([, v]) => v).map(([k, v]) =>
    `<li>${STAT_LABEL[k] || k} <em>${k === 'weight' ? '' : '+'}${v}</em></li>`).join('');
  const specials = def.special ? Object.entries(def.special).map(([k, v]) =>
    `<li class="pos">${SPECIAL_LABEL(k, v)}</li>`).join('') : '';
  return `<h4 style="color:${RARITY[def.rarity].color}">${def.icon} ${esc(def.name)}</h4>
    <div class="tip-sub">${RARITY[def.rarity].name} · ${SLOTS[def.slot]?.name || def.family || ''}${item.level > 1 ? ` · +${item.level - 1}` : ''}</div>
    ${wc ? `<div style="margin-bottom:6px"><em>${wc.name}</em> — ${esc(wc.desc)}</div>` : ''}
    <ul>${rows}${specials}</ul>
    <div style="margin-top:7px;font-style:italic;color:var(--vel-3)">${esc(def.desc || '')}</div>
    ${def.legendary ? `<div style="margin-top:6px;color:var(--gold)"><b>${esc(def.legendary)}</b></div>` : ''}`;
}

const STAT_LABEL = {
  might: 'Might', focus: 'Focus', vigor: 'Health', armor: 'Armour',
  haste: 'Haste', weight: 'Weight',
};

function SPECIAL_LABEL(k, v) {
  const pct = n => Math.round(n * 100) + '%';
  switch (k) {
    case 'lifesteal': return `Heals for ${pct(v)} of damage dealt`;
    case 'cdr': return `Ability cooldowns ${pct(v)} shorter`;
    case 'critChance': return `+${pct(v)} critical chance`;
    case 'magicResist': return `${pct(v)} less magical damage taken`;
    case 'fireResist': return `${pct(v)} less fire damage taken`;
    case 'blockChance': return `${pct(v)} chance to block outright`;
    case 'reflect': return `Reflects ${pct(v)} of damage taken`;
    case 'moveBonus': return `+${v} move speed`;
    case 'commandRegen': return `Command regenerates ${pct(v)} faster`;
    case 'auraRadius': return `+${v}m commander aura`;
    case 'auraDamage': return `+${pct(v)} damage to allies in your aura`;
    case 'ccResist': return `Crowd control lasts ${pct(v)} less`;
    case 'dodgeCdr': return `Dodge recharges ${pct(v)} faster`;
    case 'pierceArmor': return `Ignores ${pct(v)} of armour`;
    case 'ignoreArmor': return typeof v === 'number' ? `Ignores ${pct(v)} of armour` : 'Ignores armour entirely';
    case 'backstabBonus': return `+${pct(v)} backstab damage`;
    case 'knockbackBonus': return `+${pct(v)} knockback`;
    case 'bleedBonus': return `Bleed stacks ${pct(1 + v)} as fast`;
    case 'manaShield': return `${pct(v)} of damage absorbed by a ward`;
    case 'reviveOnce': return 'Revives you once per battle at half health';
    case 'extraHandSlot': return 'A fifth card slot in your hand';
    case 'dmgTypeOverride': return `Deals ${v} damage`;
    case 'ability': return `Grants an ability`;
    case 'chainOnFullDraw': return `A full draw chains to ${v} targets`;
    default: return `${k}: ${v}`;
  }
}

/* ==========================================================================
   CARD TOOLTIP (registered with UI)
   ========================================================================== */

export function cardTooltip(unitId, level) {
  const u = UNITS[unitId];
  if (!u) return null;
  const st = statsAt(u, level || 1, CFG.cards.statGrowth);
  const r = RARITY[u.rarity];
  const best = bestCounters(u.dmgType);
  return `<h4 style="color:${r.color}">${esc(u.name)}</h4>
    <div class="tip-sub">${r.name} · ${ROLE_INFO[u.role]?.name || u.role} · Cost ${u.cost}${u.count > 1 ? ` · ×${u.count}` : ''}</div>
    <ul>
      <li>Health <em>${commas(st.hp)}</em>${u.count > 1 ? ` <span class="muted">each</span>` : ''}</li>
      <li>Damage <em>${st.dmg}</em> <span class="t-${u.dmgType}">${u.dmgType}</span> · ${u.atkSpeed.toFixed(2)}/s</li>
      <li>Range <em>${u.range.toFixed(1)}m</em> · Speed <em>${u.moveSpeed.toFixed(1)}</em></li>
      <li>Armour <em>${st.armor}</em> (${u.armorType})</li>
    </ul>
    <div style="margin-top:6px"><span class="pos">Strong vs</span> ${best.strong} · <span class="neg">weak vs</span> ${best.weak}</div>
    <div style="margin-top:6px;font-style:italic;color:var(--vel-3)">${esc(u.lore || '')}</div>`;
}

export function bestCounters(dmgType) {
  const row = COUNTER[dmgType] || {};
  const entries = Object.entries(row).sort((a, b) => b[1] - a[1]);
  const strong = entries.slice(0, 2).map(([k, v]) => `${k} (${v.toFixed(2)})`).join(', ');
  const weak = entries.slice(-2).map(([k, v]) => `${k} (${v.toFixed(2)})`).join(', ');
  return { strong, weak };
}

/* ==========================================================================
   SMALL HELPERS
   ========================================================================== */

export function section(title, sub) {
  const el = document.createElement('div');
  el.innerHTML = `<div class="h-rule"><h2>${esc(title)}</h2></div>${sub ? `<div class="sub mb10">${sub}</div>` : ''}`;
  return el;
}

export function button(label, cls, onClick) {
  const b = document.createElement('div');
  b.className = 'btn ' + (cls || '');
  b.innerHTML = label;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function empty(text) {
  const d = document.createElement('div');
  d.className = 'empty-note';
  d.textContent = text;
  return d;
}

/* Register the `card:<id>:<level>` tooltip once, at module load. */
UI.addTipProvider((key) => {
  if (!key.startsWith('card:')) return null;
  const [, id, lvl] = key.split(':');
  return cardTooltip(id, parseInt(lvl, 10) || 1);
});

export function filterBar(opts) {
  const el = document.createElement('div');
  el.className = 'filterbar';
  el.innerHTML = opts.chips.map(c =>
    `<span class="chip${c.on ? ' on' : ''}" data-f="${c.id}">${c.icon ? c.icon + ' ' : ''}${esc(c.name)}</span>`).join('')
    + (opts.search ? `<input class="searchbox" placeholder="Search…" id="fb-search">` : '');
  el.addEventListener('click', e => {
    const id = e.target.closest('[data-f]')?.dataset.f;
    if (id) opts.onFilter?.(id);
  });
  const s = el.querySelector('#fb-search');
  if (s) s.addEventListener('input', () => opts.onSearch?.(s.value.toLowerCase()));
  return el;
}
