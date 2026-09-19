/* ScreenResults.js — the after-battle payoff.

   Rewards arrive as a sequence, not a list: the verdict, then the loot popping
   in one at a time, then the experience bar filling, then any new cards. That
   ordering is most of what makes a win feel like a win.
*/

import { State } from '../game/State.js';
import { UI } from './UI.js';
import { section, cardEl, empty, button } from './Widgets.js';
import { UNITS } from '../data/Units.js';
import { MATERIALS, resourceIcon, resourceName } from '../data/Materials.js';
import { REGIONS } from '../data/Campaign.js';
import { CFG } from '../core/Config.js';
import { audio } from '../core/Audio.js';
import { esc, commas, formatNum, formatTime, clamp } from '../core/Util.js';
import { ic } from '../art/Icons.js';

export const ScreenResults = {
  id: 'results',

  build(el, args, ui) {
    const { summary, result } = args;
    const parts = ui.scaffold(el, {
      icon: result.victory ? ic('crown') : ic('skull'),
      title: result.victory ? 'Victory' : 'Defeat',
      blurb: summary.node ? esc(summary.node.name) : 'The Endless War',
      foot: true,
    });
    build(parts.body, parts.foot, summary, result, ui);
  },
};

function build(body, foot, summary, result, ui) {
  const wrap = document.createElement('div');
  wrap.className = 'results';
  body.appendChild(wrap);

  /* ---------------------------------------------------------- verdict */
  const v = document.createElement('div');
  v.className = 'res-verdict ' + (result.victory ? 'win' : 'lose');
  v.innerHTML = `<div class="v">${result.victory ? 'VICTORY' : 'DEFEAT'}</div>
    <div class="sub">${verdictLine(result, summary)}</div>`;
  wrap.appendChild(v);

  /* ---------------------------------------------------------- rewards */
  const rw = summary.rewards || {};
  const row = document.createElement('div');
  row.className = 'rewardrow';
  wrap.appendChild(row);

  const items = [];
  if (rw.gold) items.push([ic('coin'), formatNum(rw.gold), 'Gold']);
  if (rw.xp) items.push([ic('spark'), formatNum(rw.xp), 'Experience']);
  if (rw.scroll) items.push([ic('scroll'), rw.scroll, 'Scrolls']);
  if (rw.warSeal) items.push([ic('medal'), rw.warSeal, 'War Seals']);
  for (const k in (rw.mats || {})) items.push([resourceIcon(k), rw.mats[k], resourceName(k)]);
  for (const k in (rw.shards || {})) items.push([ic('crystal'), rw.shards[k], (UNITS[k]?.name || k) + ' shards']);
  for (const k in (rw.potions || {})) items.push([ic('flask'), rw.potions[k], 'Potions']);

  if (!items.length) items.push(['—', '', 'No spoils']);

  items.forEach(([icon, val, label], i) => {
    const d = document.createElement('div');
    d.className = 'reward';
    d.style.animationDelay = (i * 0.07) + 's';
    d.innerHTML = `<div class="ri">${icon}</div><div class="rv">${val}</div><div class="rl">${esc(label)}</div>`;
    row.appendChild(d);
  });
  if (items.length > 1) setTimeout(() => audio.play('coin'), 220);

  /* ------------------------------------------------- first clear bonus */
  if (summary.firstBundle) {
    const fc = document.createElement('div');
    fc.className = 'lvlup';
    fc.innerHTML = `<div style="font-size:28px">${ic('medal')}</div>
      <div><div class="big">First Clear</div>
      <div class="sub" style="font-style:normal">${firstText(summary.firstBundle)}</div></div>`;
    wrap.appendChild(fc);
  }

  /* --------------------------------------------------------- new cards */
  if (summary.newCards?.length) {
    const nc = document.createElement('div');
    nc.appendChild(section('New Cards', 'Added to your collection.'));
    const g = document.createElement('div');
    g.className = 'card-grid';
    g.style.gridTemplateColumns = 'repeat(auto-fill,minmax(130px,1fr))';
    for (const id of summary.newCards) {
      g.appendChild(cardEl({ unitId: id, level: 1, shards: 0, showUpgrade: false }));
    }
    nc.appendChild(g);
    wrap.appendChild(nc);
    setTimeout(() => audio.play('unlock'), 500);
  }

  /* ---------------------------------------------------- region unlock */
  if (summary.unlockedRegion) {
    const r = REGIONS[summary.unlockedRegion];
    const u = document.createElement('div');
    u.className = 'lvlup';
    u.innerHTML = `<div style="font-size:28px">${r.icon}</div>
      <div><div class="big">${esc(r.name)} unlocked</div>
      <div class="sub" style="font-style:normal">${esc(r.tagline)} — recommended level ${r.recommendedLevel}.</div></div>`;
    wrap.appendChild(u);
  }

  /* ------------------------------------------------------- experience */
  const xpLine = document.createElement('div');
  xpLine.className = 'xpline';
  const pct = clamp(State.s.xp / State.xpToNext(), 0, 1);
  xpLine.innerHTML = `
    <div class="lb"><span>Commander level ${State.s.level}</span><span>${commas(State.s.xp)} / ${commas(State.xpToNext())}</span></div>
    <div class="xptrack"><i style="width:0%"></i></div>`;
  wrap.appendChild(xpLine);
  requestAnimationFrame(() => {
    xpLine.querySelector('i').style.width = (pct * 100).toFixed(1) + '%';
  });

  if (summary.levelAfter > summary.levelBefore) {
    const lu = document.createElement('div');
    lu.className = 'lvlup';
    lu.innerHTML = `<div style="font-size:28px">${ic('medal')}</div>
      <div><div class="big">Level ${summary.levelAfter}</div>
      <div class="sub" style="font-style:normal">+${(summary.levelAfter - summary.levelBefore) * CFG.cmd.hpPerLevel} health, and your gear scales with you.</div></div>`;
    wrap.appendChild(lu);
  }

  /* ------------------------------------------------------------ stats */
  wrap.appendChild(section('The Battle', ''));
  const st = result.stats;
  const grid = document.createElement('div');
  grid.className = 'statgrid';
  const cells = [
    ['Duration', formatTime(result.duration)],
    ['Enemies slain', commas(st.kills)],
    ['Units lost', commas(st.losses)],
    ['Damage dealt', formatNum(st.damage)],
    ['Command spent', Math.round(st.commandSpent)],
    ['Cards played', st.deployed],
    ['Your banner', Math.round(result.bannerHpOwn * 100) + '%'],
    ['Their banner', Math.round(result.bannerHpFoe * 100) + '%'],
    ['Ground held', formatTime(st.pointsHeld)],
    ['Score', commas(st.score)],
  ];
  grid.innerHTML = cells.map(([k, v]) => `<div class="statcell"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  wrap.appendChild(grid);

  /* -------------------------------------------------- per-card report */
  const byCard = Object.entries(result.killsByCard || {}).sort((a, b) => b[1] - a[1]);
  if (byCard.length) {
    const mvp = document.createElement('div');
    mvp.appendChild(section('Who Did The Work', ''));
    const list = document.createElement('div');
    list.className = 'statblock';
    for (const [id, n] of byCard.slice(0, 6)) {
      const u = UNITS[id];
      list.innerHTML += `<div class="sbrow"><span class="k">${esc(u?.name || id)}</span><span class="v">${n} kills</span></div>`;
    }
    mvp.appendChild(list);
    wrap.appendChild(mvp);
  }

  /* ----------------------------------------------------------- advice */
  if (!result.victory) {
    const tip = document.createElement('div');
    tip.className = 'advice';
    tip.innerHTML = defeatAdvice(result, summary);
    wrap.appendChild(tip);
  }

  /* ------------------------------------------------------------ footer */
  foot.innerHTML = '<div class="growr"></div>';
  foot.appendChild(button('To the war map', 'ghost', () => {
    UI.closeAll();
    import('./ScreenMap.js').then(m => UI.open(m.ScreenMap, { region: summary.region?.id }));
  }));
  if (summary.node && summary.node.type !== 'endless') {
    foot.appendChild(button('Fight again', 'ghost', () => {
      UI.closeAll();
      UI.onStartBattle?.({ node: summary.node, region: summary.region });
    }));
  }
  foot.appendChild(button('Return to the keep', 'gold lg', () => { UI.closeAll(); UI.onReturnHub?.(); }));
}

function verdictLine(result, summary) {
  if (result.victory) {
    if (result.reason === 'time') return 'Time ran out with their banner in worse shape than yours.';
    if (summary.node?.boss) return 'Their commander is down.';
    return 'Their banner is broken.';
  }
  if (result.reason === 'forfeit') return 'You withdrew.';
  if (result.reason === 'time') return 'Time ran out and their banner stood taller than yours.';
  return 'Your banner has fallen.';
}

function firstText(f) {
  const bits = [];
  if (f.gold) bits.push(`${ic('coin')} ${formatNum(f.gold)}`);
  if (f.cards) bits.push(...f.cards.map(c => `${ic('cards')} ${UNITS[c]?.name || c}`));
  if (f.mats) bits.push(...Object.entries(f.mats).map(([k, v]) => `${resourceIcon(k)} ${resourceName(k)} ×${v}`));
  if (f.scroll) bits.push(`${ic('scroll')} ${f.scroll}`);
  return bits.join(' · ');
}

function defeatAdvice(result, summary) {
  const st = result.stats;
  const node = summary.node;
  const lines = [];

  if (st.commandSpent / Math.max(1, result.duration) < 0.25)
    lines.push('You barely spent any Command. Deploy more often — banked Command earns you nothing.');
  if (st.losses > st.kills * 1.6)
    lines.push('You lost far more than you killed. That usually means a counter problem, not a numbers problem — check the armour advice on the briefing screen.');
  if (st.pointsHeld < result.duration * 0.25)
    lines.push('You never held ground. Control points give faster Command and push your deployment line forward eleven metres each.');
  if (st.cmdDamageTaken > 400)
    lines.push('Your commander took a beating. You are a unit, not a spectator — but you are also not a frontline.');
  if (result.dmgTypes < 3)
    lines.push('Your army fields fewer than three damage types. Some enemies simply armour against one.');
  if (node?.mechanic)
    lines.push(`<b>The mechanic:</b> ${esc(node.mechanic)}`);

  if (!lines.length) lines.push('Close. Try a different composition, or upgrade a card or two first.');
  return lines.join('<br><br>');
}
