/* NPCs.js — the people in the world, and the conversation UI.

   NPCs are simple: a procedural humanoid built from the same rig as everything
   else, a gentle idle, a name plate that faces the camera, and a dialogue tree.
   The Wizard gets a rotating greeting chosen from the player's actual state,
   which is what stops him going stale over hundreds of visits.
*/

import * as THREE from '../../lib/three.module.js';
import { box, sphere, cyl, cone, meshOf, ring } from '../art/Geo.js';
import { PAL, MATS } from '../art/Palette.js';
import { buildUnitModel, UnitRig } from '../art/UnitArt.js';
import { NPCS, WIZARD_GREETINGS, WIZARD_TREE, SMITH_TREE, QM_TREE, MERCHANT_TREE, DRILL_TREE } from '../data/Dialogue.js';
import { State } from '../game/State.js';
import { UI } from '../ui/UI.js';
import { bus, EV } from '../core/Bus.js';
import { audio } from '../core/Audio.js';
import { esc, rng, TAU, clamp } from '../core/Util.js';
import { RESEARCH } from '../data/Research.js';
import { CFG } from '../core/Config.js';

/* Each NPC is dressed as a unit archetype with hand-picked colours. */
const NPC_ART = {
  wizard: {
    archetype: 'humanoid', build: 'medium', primary: 0x3b3f7a, accent: 0x9a6fe0,
    metal: 0xd9c98a, weapon: 'archstaff', robe: true, hood: true, glow: 0x9a6fe0,
    aura: 0x9a6fe0, scale: 1.05,
  },
  smith: {
    archetype: 'humanoid', build: 'heavy', primary: 0x5a3a2a, accent: 0xe8823a,
    metal: 0x8a8070, weapon: 'hammer', bare: true, scale: 1.08,
  },
  quartermaster: {
    archetype: 'humanoid', build: 'medium', primary: 0x2f5f8f, accent: 0xd9a441,
    metal: 0xb0b8c4, weapon: 'shortsword', helm: 'kettle', cape: 0x2f5f8f, scale: 1.0,
  },
  merchant: {
    archetype: 'humanoid', build: 'slim', primary: 0x5a3a4a, accent: 0x8fbf4a,
    metal: 0xd9a441, weapon: 'dagger', cloak: 0x3a2a34, scale: 0.98,
  },
  drillmaster: {
    archetype: 'humanoid', build: 'heavy', primary: 0x4a4a52, accent: 0xc5362b,
    metal: 0xa8b0bc, weapon: 'spear', helm: 'great', cape: 0xc5362b, scale: 1.04,
  },
};

const TREES = {
  wizard: WIZARD_TREE, smith: SMITH_TREE, quartermaster: QM_TREE,
  merchant: MERCHANT_TREE, drillmaster: DRILL_TREE,
};

export class NPC {
  constructor(id, x, z, facing) {
    this.id = id;
    this.def = NPCS[id];
    this.x = x; this.z = z;
    this.facing = facing ?? 0;
    this.phase = rng.range(0, TAU);

    const art = NPC_ART[id] || NPC_ART.quartermaster;
    this.rig = buildUnitModel({ id, name: this.def?.name || id, art, rarity: 'rare', abilities: [], tags: [] }, 7, 0);
    if (this.rig.parts.teamRing) this.rig.parts.teamRing.visible = false;
    if (this.rig.parts.aura) this.rig.parts.aura.visible = false;
    this.rig.root.position.set(x, 0, z);
    this.rig.pivot.rotation.y = -facing + Math.PI / 2;

    // a soft marker so you can find them across a room
    const mat = MATS.emissive(this.def?.color ? parseInt(this.def.color.slice(1), 16) : 0xd9a441, 0.4).clone();
    mat.transparent = true;
    this.marker = new THREE.Mesh(ring(0.55, 0.72, 22, { color: 0xffffff, rx: -Math.PI / 2, grad: 0 }), mat);
    this.marker.position.y = 0.03;
    this.marker.renderOrder = 2;
    this.rig.root.add(this.marker);

    this.group = this.rig.root;
  }

  update(dt, t) {
    this.phase += dt;
    this.rig.update(dt, {
      moving: 0, attacking: 0, casting: this.id === 'wizard' ? 0.15 : 0,
      dead: 0, hurt: 0, speedFactor: 0.5, blocking: false,
    });
    // a little sway so they are not statues
    this.rig.pivot.position.y = Math.sin(this.phase * 0.9) * 0.02;
    this.marker.material.opacity = 0.22 + Math.sin(this.phase * 1.6) * 0.1;
  }

  dispose() { this.rig.dispose(); }
}

/* ==========================================================================
   DIALOGUE
   ========================================================================== */

let activeDialogue = null;

export function talkTo(npcId, onAction) {
  const def = NPCS[npcId];
  const tree = TREES[npcId];
  if (!def || !tree) return;

  bus.emit(EV.NPC_TALK, { npc: npcId });

  const greeting = npcId === 'wizard' ? wizardGreeting() : null;
  openDialogue(def, tree, 'root', onAction, greeting);
}

function wizardGreeting() {
  const s = State.s;
  if (!s.flags.metWizard) {
    State.setFlag('metWizard', true);
    return WIZARD_GREETINGS.first.join('\n\n');
  }
  const canResearch = Object.keys(RESEARCH).some(id => State.canResearch(id));
  const canAwaken = State.bonuses.awakeningUnlocked &&
    State.ownedCards().some(c => c.save.level >= CFG.cards.awakenLevel && !c.save.awakened);

  const pool = [];
  if (canResearch) pool.push(...WIZARD_GREETINGS.research);
  if (canAwaken) pool.push(...WIZARD_GREETINGS.awaken);
  pool.push(...WIZARD_GREETINGS.default);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function openDialogue(def, tree, nodeId, onAction, overrideText) {
  closeDialogue();

  const node = tree[nodeId];
  if (!node) { closeDialogue(); return; }

  const el = document.createElement('div');
  el.className = 'dialogue';
  el.innerHTML = `
    <div class="who">
      <div class="por">${def.icon}</div>
      <div>
        <div class="nm">${esc(def.name)}</div>
        <div class="ti">${esc(def.title)}</div>
      </div>
    </div>
    <div class="box">
      <div class="txt" id="d-txt"></div>
      <div class="opts" id="d-opts"></div>
    </div>`;
  document.getElementById('ui').appendChild(el);
  activeDialogue = el;

  const txt = el.querySelector('#d-txt');
  const opts = el.querySelector('#d-opts');
  const full = (overrideText || node.text).replace(/\n/g, '<br>');

  /* typewriter — click anywhere to skip to the end */
  let i = 0, done = false;
  const plain = full.replace(/<[^>]*>/g, '');
  const finish = () => { done = true; txt.innerHTML = full; renderOpts(); };
  const step = () => {
    if (done) return;
    i += 2;
    // walk the html safely by slicing the plain text and re-appending tags at the end
    txt.textContent = plain.slice(0, i);
    if (i >= plain.length) finish();
    else setTimeout(step, 12);
  };
  step();
  el.addEventListener('click', (e) => { if (!done && !e.target.closest('.dopt')) finish(); });

  function renderOpts() {
    opts.innerHTML = '';
    (node.opts || []).forEach((o, k) => {
      let locked = false, lockTxt = '';
      if (o.requires?.research && !State.s.research.includes(o.requires.research)) {
        locked = true;
        lockTxt = 'Needs ' + (RESEARCH[o.requires.research]?.name || o.requires.research);
      }
      const d = document.createElement('div');
      d.className = 'dopt' + (locked ? ' dis' : '');
      d.innerHTML = `<span class="n">${k + 1}</span><span>${esc(o.label)}</span>
        ${locked ? `<span class="rq">${esc(lockTxt)}</span>` : ''}`;
      if (!locked) {
        d.onclick = () => {
          audio.play('ui.click');
          if (o.action) { closeDialogue(); onAction?.(o.action); return; }
          if (o.to) openDialogue(def, tree, o.to, onAction);
          else closeDialogue();
        };
      }
      opts.appendChild(d);
    });
    if (!node.opts?.length) {
      const d = document.createElement('div');
      d.className = 'dopt';
      d.innerHTML = '<span class="n">1</span><span>Leave</span>';
      d.onclick = () => { audio.play('ui.back'); closeDialogue(); };
      opts.appendChild(d);
    }
  }

  audio.play('page');
}

export function closeDialogue() {
  if (activeDialogue) { activeDialogue.remove(); activeDialogue = null; }
}

export const dialogueOpen = () => !!activeDialogue;
