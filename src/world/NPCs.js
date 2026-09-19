/* NPCs.js — the people in the world, and the conversation UI.

   NPCs are simple: a procedural humanoid built from the same rig as everything
   else, a gentle idle, a name plate that faces the camera, and a dialogue tree.
   The Wizard gets a rotating greeting chosen from the player's actual state,
   which is what stops him going stale over hundreds of visits.
*/

import * as THREE from '../../lib/three.module.js';
import { box, taperBox, sphere, cyl, cone, torus, meshOf, ring, transformed, mirrorX } from '../art/Geo.js';
import { PAL, MATS } from '../art/Palette.js';
import { buildUnitModel, UnitRig } from '../art/UnitArt.js';
import { NPCS, WIZARD_GREETINGS, WIZARD_TREE, SMITH_TREE, QM_TREE, MERCHANT_TREE, DRILL_TREE, MARSHAL_TREE } from '../data/Dialogue.js';
import { State } from '../game/State.js';
import { UI } from '../ui/UI.js';
import { bus, EV } from '../core/Bus.js';
import { audio } from '../core/Audio.js';
import { esc, rng, TAU, clamp } from '../core/Util.js';
import { RESEARCH } from '../data/Research.js';
import { CFG } from '../core/Config.js';

/* ==========================================================================
   THE PEOPLE

   These six are the faces of the game, so none of them is allowed to be the
   base humanoid in a different colour. Each starts from the shared rig and
   then gets HAND-BUILT geometry that changes the SILHOUETTE, because that is
   the thing you read across a room:

     Vaelthorn   a cone. Floor-length robe, enormous hood, no visible face.
     Dunnick     a barrel. Bare shoulders twice anyone else's, leather apron.
     Bell        a box. Wide kettle-helm brim, ledger, satchels, crossbelts.
     Odessa      a narrow flare. High collar, long skirted coat, pouches.
     Roon        a vertical line. Planted spear taller than he is.
     Corr        upright and bare-headed. Long field coat, map case across
                 her back, sabre scabbard at the hip.

   You should be able to name any of them from thirty metres with the colour
   turned off.
   ========================================================================== */

const NPC_ART = {
  wizard: {
    archetype: 'humanoid', build: 'slim', primary: 0x3b3f7a, accent: 0x9a6fe0,
    metal: 0xd9c98a, weapon: 'archstaff', robe: true, hood: true, glow: 0x9a6fe0,
    aura: 0x9a6fe0, scale: 1.12,
  },
  smith: {
    archetype: 'humanoid', build: 'orc', primary: 0x5a3a2a, accent: 0xe8823a,
    skin: 0xa8784c, metal: 0x8a8070, weapon: 'hammer', bare: true, scale: 1.02,
  },
  quartermaster: {
    archetype: 'humanoid', build: 'medium', primary: 0x2f5f8f, accent: 0xd9a441,
    metal: 0xb0b8c4, weapon: 'shortsword', helm: 'kettle', scale: 1.0,
  },
  merchant: {
    archetype: 'humanoid', build: 'slim', primary: 0x5a3a4a, accent: 0x8fbf4a,
    metal: 0xd9a441, weapon: 'dagger', scale: 0.98,
  },
  drillmaster: {
    archetype: 'humanoid', build: 'heavy', primary: 0x4a4a52, accent: 0xc5362b,
    metal: 0xa8b0bc, helm: 'great', cape: 0xc5362b, scale: 1.04,
  },
  marshal: {
    archetype: 'humanoid', build: 'medium', primary: 0x4a4438, accent: 0xd9a441,
    metal: 0xb4bcc8, helm: null, scale: 1.0,
  },
};

/* Per-character geometry, in PIVOT space: y = 0 is the ground, the shoulder
   line is about 1.30 and the head sits near 1.56. */
const NPC_EXTRAS = {

  wizard: () => [
    // the hood is the whole read: a cone wider than his shoulders, with a
    // void where a face would be
    cone(0.33, 0.68, 7, { color: 0x2a2b52, y: 1.76 }),
    sphere(0.16, 8, { color: 0x0e0d16, y: 1.50, z: 0.10, grad: 0 }),
    // shoulder mantle
    cyl(0.24, 0.44, 0.14, 9, { color: 0x252650, y: 1.28 }),
    // beard, hanging out of the dark
    taperBox(0.20, 0.44, 0.13, 0.45, { color: 0xd8d0bc, y: 1.28, z: 0.17 }),
    // robe hem, pooling on the floor
    cyl(0.34, 0.60, 0.18, 11, { color: 0x33356b, y: 0.09 }),
    // a chained book at the belt
    box(0.20, 0.07, 0.16, { color: 0x5a3a24, x: 0.27, y: 0.80, rz: 0.22 }),
    box(0.19, 0.02, 0.15, { color: 0xd9c98a, x: 0.27, y: 0.835, rz: 0.22 }),
    cyl(0.012, 0.012, 0.22, 4, { color: 0xb0b8c4, x: 0.25, y: 0.92 }),
  ],

  smith: () => [
    // shoulders. Everything about him is shoulders.
    sphere(0.22, 8, { color: 0xa8784c, x: 0.46, y: 1.24, sy: 0.85 }),
    sphere(0.22, 8, { color: 0xa8784c, x: -0.46, y: 1.24, sy: 0.85 }),
    // leather apron — chest to knee, narrower than he is, so his shoulders
    // still read past it
    taperBox(0.46, 0.78, 0.10, 0.78, { color: 0x4a2f1c, y: 0.72, z: 0.31 }),
    box(0.40, 0.06, 0.10, { color: 0x3a2314, y: 1.10, z: 0.31 }),
    box(0.06, 0.24, 0.05, { color: 0x3a2314, y: 1.22, z: 0.30, rz: 0.4 }),
    box(0.06, 0.24, 0.05, { color: 0x3a2314, y: 1.22, z: 0.30, rz: -0.4 }),
    // a soot-red headband, and no helmet ever
    box(0.42, 0.08, 0.38, { color: 0x8a2f22, y: 1.56 }),
    // tongs and a horseshoe on the belt
    torus(0.11, 0.032, { color: PAL.iron, x: -0.32, y: 0.84, z: 0.06, ry: Math.PI / 2 }),
    box(0.05, 0.30, 0.05, { color: PAL.ironDark, x: -0.34, y: 0.74, rz: 0.2 }),
  ],

  quartermaster: () => [
    // the brim is the silhouette
    cyl(0.36, 0.36, 0.05, 14, { color: PAL.iron, y: 1.64 }),
    // a ledger clamped under the left arm, always
    box(0.09, 0.32, 0.26, { color: 0x6a4a2a, x: -0.34, y: 1.04, rz: 0.16 }),
    box(0.02, 0.29, 0.23, { color: 0xe8e0c8, x: -0.30, y: 1.04, rz: 0.16 }),
    // crossbelts — thin and tan; at full thickness they read as a black X
    box(0.44, 0.045, 0.04, { color: 0x6a4a2a, y: 1.08, z: 0.22, rz: 0.62 }),
    box(0.44, 0.045, 0.04, { color: 0x6a4a2a, y: 1.08, z: 0.22, rz: -0.62 }),
    // satchels
    box(0.28, 0.24, 0.16, { color: 0x4a3a28, x: 0.30, y: 0.84, z: -0.06 }),
    box(0.18, 0.16, 0.12, { color: 0x4a3a28, x: -0.28, y: 0.78, z: -0.10 }),
  ],

  merchant: () => [
    // a high collar that FRAMES the head — set any higher and it swallows it
    cone(0.30, 0.30, 8, { color: 0x4a2f3c, y: 1.26, rx: Math.PI }),
    // long skirted coat: narrow at the waist, wide at the hem
    taperBox(0.40, 0.84, 0.30, 0.52, { color: 0x5a3a4a, y: 0.44 }),
    box(0.44, 0.06, 0.34, { color: 0x8fbf4a, y: 0.86 }),
    // a row of pouches, because she is carrying everything she owns
    box(0.12, 0.14, 0.10, { color: 0x3a2a34, x: 0.22, y: 0.80, z: 0.14 }),
    box(0.10, 0.12, 0.09, { color: 0x3a2a34, x: -0.20, y: 0.80, z: 0.15 }),
    box(0.11, 0.13, 0.09, { color: 0x3a2a34, x: 0.02, y: 0.78, z: 0.19 }),
    // scales hooked on the belt — she weighs things in front of you
    cyl(0.015, 0.015, 0.26, 4, { color: 0xd9a441, x: -0.30, y: 0.92 }),
    cyl(0.07, 0.07, 0.02, 9, { color: 0xd9a441, x: -0.30, y: 0.80 }),
  ],

  drillmaster: () => [
    // the planted spear: a vertical line beside a bulky man
    cyl(0.045, 0.05, 2.5, 6, { color: PAL.woodDark, x: 0.50, y: 1.25 }),
    cone(0.075, 0.34, 5, { color: PAL.steel, x: 0.50, y: 2.62 }),
    box(0.10, 0.20, 0.02, { color: 0xc5362b, x: 0.50, y: 2.32, z: 0.05 }),
    // tabard
    box(0.32, 0.70, 0.03, { color: 0xc5362b, y: 1.00, z: 0.24 }),
    // signal horn on the hip
    cyl(0.055, 0.10, 0.28, 7, { color: 0xd8cbb0, x: -0.32, y: 0.84, rz: 0.95 }),
  ],

  marshal: () => [
    // bare-headed on purpose: she is the only person in the courtyard without
    // a helmet, which is most of how you pick her out
    sphere(0.14, 9, { color: 0xb8b2a4, y: 1.58, z: -0.15, sz: 0.85 }),
    box(0.26, 0.10, 0.18, { color: 0xb8b2a4, y: 1.66 }),
    // long field coat
    taperBox(0.42, 0.80, 0.32, 0.62, { color: 0x4a4438, y: 0.46 }),
    box(0.46, 0.07, 0.36, { color: 0x2f2b22, y: 0.88 }),
    // gorget and epaulettes — rank, worn plainly
    cyl(0.20, 0.25, 0.09, 10, { color: PAL.steel, y: 1.34 }),
    box(0.17, 0.05, 0.21, { color: 0xd9a441, x: 0.30, y: 1.30 }),
    box(0.17, 0.05, 0.21, { color: 0xd9a441, x: -0.30, y: 1.30 }),
    // the map case across her back, and a sabre scabbard at the hip
    cyl(0.075, 0.075, 0.66, 7, { color: 0x6a5236, y: 1.14, z: -0.20, rz: 0.78 }),
    cyl(0.08, 0.08, 0.06, 7, { color: 0xd9a441, x: 0.24, y: 1.36, z: -0.20, rz: 0.78 }),
    box(0.055, 0.56, 0.09, { color: 0x2f2b22, x: -0.27, y: 0.80, rz: 0.26 }),
    box(0.05, 0.10, 0.08, { color: PAL.steel, x: -0.34, y: 1.06, rz: 0.26 }),
  ],
};

const TREES = {
  wizard: WIZARD_TREE, smith: SMITH_TREE, quartermaster: QM_TREE,
  merchant: MERCHANT_TREE, drillmaster: DRILL_TREE, marshal: MARSHAL_TREE,
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

    // the hand-built half of the character, in pivot space so it stands on the
    // ground with them rather than bobbing with the torso
    const extras = NPC_EXTRAS[id];
    // `art.scale` is applied to rig.root, so pivot-space geometry is already
    // in the same units as the rig's own parts — no compensation here.
    if (extras) this.rig.pivot.add(meshOf(extras(), MATS.body));
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
