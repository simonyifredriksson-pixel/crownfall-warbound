/* PostFX.js — a small, hand-rolled post chain.

   three.module.js is the core build, so EffectComposer/UnrealBloomPass are not
   available. This is a deliberately minimal replacement:

     scene ─▶ HDR target
              ├─ bright pass (½ res)
              ├─ blur ×2 at ½ and ¼ res      (separable, 9-tap)
              └─ composite: scene + bloom, vignette, slight desaturation
                            at the edges, ACES-ish tonemap

   It runs in one extra full-screen pass plus four small ones. On a weak
   device `enabled = false` falls back to rendering straight to the canvas and
   nothing else in the game needs to know.
*/

import * as THREE from '../../lib/three.module.js';
import { CFG } from '../core/Config.js';

const QUAD_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = `
uniform sampler2D tex;
uniform float threshold;
uniform float knee;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tex, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // soft knee so the bloom does not pop on at a hard edge
  float s = clamp((l - threshold + knee) / (2.0 * knee), 0.0, 1.0);
  float w = max(l - threshold, s * s * knee) / max(l, 0.0001);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const BLUR_FRAG = `
uniform sampler2D tex;
uniform vec2 dir;
varying vec2 vUv;
void main(){
  // 9-tap gaussian, linear-sampled to 5 fetches
  vec4 c = texture2D(tex, vUv) * 0.227027;
  c += texture2D(tex, vUv + dir * 1.3846153846) * 0.3162162162;
  c += texture2D(tex, vUv - dir * 1.3846153846) * 0.3162162162;
  c += texture2D(tex, vUv + dir * 3.2307692308) * 0.0702702703;
  c += texture2D(tex, vUv - dir * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`;

const COMPOSITE_FRAG = `
uniform sampler2D tScene;
uniform sampler2D tBloomA;
uniform sampler2D tBloomB;
uniform float bloomStrength;
uniform float exposure;
uniform float vignette;
uniform float flash;
uniform vec3 flashColor;
varying vec2 vUv;

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

/* Linear -> sRGB.
   three.js applies this automatically for its own materials, but NOT for a raw
   ShaderMaterial drawing to the default framebuffer. Without it every value
   this pass writes is displayed about a gamma too dark: linear 0.5 shows as
   sRGB 0.5 when it should show as 0.73. That made the whole game — and
   interiors like the Library especially — look nearly black. */
vec3 linearToSRGB(vec3 c){
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92,
             1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
             step(vec3(0.0031308), c));
}

void main(){
  vec3 col = texture2D(tScene, vUv).rgb;
  vec3 bloom = texture2D(tBloomA, vUv).rgb * 0.62 + texture2D(tBloomB, vUv).rgb * 0.38;
  col += bloom * bloomStrength;

  col *= exposure;
  col = aces(col);

  // vignette: a gentle fall-off so the centre reads first. Kept subtle — it
  // was doing a third of the darkening on its own.
  vec2 d = vUv - 0.5;
  float v = 1.0 - dot(d, d) * vignette;
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(grey), col, mix(0.92, 1.0, v));
  col *= mix(0.82, 1.0, clamp(v, 0.0, 1.0));

  col = mix(col, flashColor, flash);
  col = linearToSRGB(col);

  gl_FragColor = vec4(col, 1.0);
}`;

export class PostFX {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.enabled = opts.enabled !== false;
    this.flash = 0;
    this.flashColor = new THREE.Color(0xffffff);

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(this.quadGeo, null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const mk = (w, h) => new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type, depthBuffer: false, stencilBuffer: false,
    });
    this._mk = mk;

    // The scene target needs a real depth buffer, requested at construction —
    // the blur targets do not. Everything here stays in LINEAR space; the
    // composite pass is the single place that encodes to sRGB for display.
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type, depthBuffer: true, stencilBuffer: false,
    });
    this.rtScene.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.rtA = mk(2, 2);
    this.rtB = mk(2, 2);
    this.rtC = mk(2, 2);
    this.rtD = mk(2, 2);

    this.mBright = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BRIGHT_FRAG,
      uniforms: { tex: { value: null }, threshold: { value: CFG.render.bloomThreshold }, knee: { value: 0.28 } },
      depthTest: false, depthWrite: false,
    });
    this.mBlur = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG,
      uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
    });
    this.mComposite = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
        bloomStrength: { value: CFG.render.bloomStrength },
        exposure: { value: CFG.render.exposure },
        vignette: { value: 0.85 },
        flash: { value: 0 },
        flashColor: { value: new THREE.Vector3(1, 1, 1) },
      },
      depthTest: false, depthWrite: false,
    });

    this.setSize(renderer.domElement.width, renderer.domElement.height);
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.rtScene.setSize(w, h);
    this.rtA.setSize(w >> 1, h >> 1);
    this.rtB.setSize(w >> 1, h >> 1);
    this.rtC.setSize(w >> 2, h >> 2);
    this.rtD.setSize(w >> 2, h >> 2);
  }

  /** A full-screen colour pulse — hit flashes, level-up, boss phase. */
  pulse(color = 0xffffff, strength = 0.35) {
    this.flashColor.setHex(color);
    this.flash = Math.max(this.flash, strength);
  }

  update(dt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
  }

  _blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target || null);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    // 1. scene
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    // 2. bright pass at half res
    this.mBright.uniforms.tex.value = this.rtScene.texture;
    this._blit(this.mBright, this.rtA);

    // 3. blur: half res H/V
    const hw = 1 / (this.w >> 1), hh = 1 / (this.h >> 1);
    this.mBlur.uniforms.tex.value = this.rtA.texture;
    this.mBlur.uniforms.dir.value.set(hw * CFG.render.bloomRadius, 0);
    this._blit(this.mBlur, this.rtB);
    this.mBlur.uniforms.tex.value = this.rtB.texture;
    this.mBlur.uniforms.dir.value.set(0, hh * CFG.render.bloomRadius);
    this._blit(this.mBlur, this.rtA);

    // 4. blur again at quarter res for the wide halo
    const qw = 1 / (this.w >> 2), qh = 1 / (this.h >> 2);
    this.mBlur.uniforms.tex.value = this.rtA.texture;
    this.mBlur.uniforms.dir.value.set(qw * CFG.render.bloomRadius * 2, 0);
    this._blit(this.mBlur, this.rtC);
    this.mBlur.uniforms.tex.value = this.rtC.texture;
    this.mBlur.uniforms.dir.value.set(0, qh * CFG.render.bloomRadius * 2);
    this._blit(this.mBlur, this.rtD);

    // 5. composite
    const u = this.mComposite.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tBloomA.value = this.rtA.texture;
    u.tBloomB.value = this.rtD.texture;
    u.flash.value = this.flash;
    u.flashColor.value.set(this.flashColor.r, this.flashColor.g, this.flashColor.b);
    this._blit(this.mComposite, null);
  }

  set bloomStrength(v) { this.mComposite.uniforms.bloomStrength.value = v; }
  get bloomStrength() { return this.mComposite.uniforms.bloomStrength.value; }
  set vignette(v) { this.mComposite.uniforms.vignette.value = v; }
  set exposure(v) { this.mComposite.uniforms.exposure.value = v; }

  dispose() {
    for (const rt of [this.rtScene, this.rtA, this.rtB, this.rtC, this.rtD]) rt.dispose();
    this.mBright.dispose(); this.mBlur.dispose(); this.mComposite.dispose();
    this.quadGeo.dispose();
  }
}
