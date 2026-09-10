/* quality.js — graphics presets, an Ultra "4K" mode, and auto-tuning.

   The renderer's cost scales with the drawing-buffer size, shadow-map size,
   ambient-occlusion resolution/samples and the bloom tiers. Four presets:

     low     1× pixels, 1024 shadows, half-res AO ×7, no wide bloom
     medium  ≤1.5× pixels, 2048 shadows, half-res AO ×11
     high    ≤2× pixels (native on HiDPI), 4096 shadows, half-res AO ×11
     ultra   ≥2× pixels — on a 1080p 1× display that is a 3840×2160 internal
             render supersampled down; on a 4K/Retina display it is native —
             4096 shadows, FULL-res AO ×16, 16× anisotropy, wide bloom

   "Auto" (default) starts at High and watches real frame times while the
   player is in the world: sustained slow windows step it down, sustained
   fast ones step it up, once, with a lock so it never seesaws. The choice
   persists in localStorage and can be cycled from the title and pause
   menus. Everything applies live — no reload. */
'use strict';
(function (OTR) {

  const Q = OTR.quality = {};
  const KEY = 'otranto.quality';
  const LEVELS = ['low', 'medium', 'high', 'ultra'];
  const PRESETS = {
    low:    { label: 'Low',      pixel: 1,   minPixel: 1, shadow: 1024, aoScale: 0.5, aoSamples: 7,  wideBloom: false, aniso: 4,  aberration: 0 },
    medium: { label: 'Medium',   pixel: 1.5, minPixel: 1, shadow: 2048, aoScale: 0.5, aoSamples: 11, wideBloom: true,  aniso: 8,  aberration: 0.002 },
    high:   { label: 'High',     pixel: 2,   minPixel: 1, shadow: 4096, aoScale: 0.5, aoSamples: 11, wideBloom: true,  aniso: 16, aberration: 0.0025 },
    ultra:  { label: 'Ultra 4K', pixel: 3,   minPixel: 2, shadow: 4096, aoScale: 1.0, aoSamples: 16, wideBloom: true,  aniso: 16, aberration: 0.003 },
  };
  Q.LEVELS = LEVELS; Q.PRESETS = PRESETS;

  Q.mode = 'auto';      // 'auto' or a level name
  Q.level = 'high';     // the level in effect
  Q.shadowMapSize = 4096;
  Q.anisotropy = 16;
  let G = null, lastApplied = null;

  function load() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  Q.preset = () => PRESETS[Q.level];

  // pixel ratio for a level, given the display and the GPU's texture limit
  function pixelRatioFor(p) {
    const dpr = window.devicePixelRatio || 1;
    let pr = Math.max(p.minPixel, Math.min(p.pixel, dpr));
    // keep the drawing buffer inside what the GPU can address (and sane)
    const maxTex = (G && G.renderer && G.renderer.capabilities.maxTextureSize) || 4096;
    const longest = Math.max(window.innerWidth, window.innerHeight) * pr;
    if (longest > Math.min(maxTex, 8192)) pr *= Math.min(maxTex, 8192) / longest;
    return pr;
  }

  Q.apply = function (level, quiet) {
    if (!PRESETS[level]) level = 'high';
    Q.level = level;
    const p = PRESETS[level];
    Q.shadowMapSize = p.shadow;
    Q.anisotropy = p.aniso;
    if (!G) return;
    const r = G.renderer;
    const pr = pixelRatioFor(p);
    r.setPixelRatio(pr);
    r.setSize(window.innerWidth, window.innerHeight);
    if (G.postfx) {
      G.postfx.setQuality({ aoScale: p.aoScale, aoSamples: p.aoSamples, wideBloom: p.wideBloom, aberration: p.aberration });
      const s = r.getDrawingBufferSize(new THREE.Vector2());
      G.postfx.setSize(s.x, s.y);
    }
    // live scene: resize directional shadow maps (three rebuilds a null map)
    if (G.scene) {
      const maxTex = r.capabilities.maxTextureSize || 4096;
      const size = Math.min(p.shadow, maxTex >= 8192 ? 4096 : 2048);
      G.scene.traverse(o => {
        if (o.isDirectionalLight && o.castShadow && o.shadow.mapSize.x !== size) {
          if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
          o.shadow.mapSize.set(size, size);
        }
      });
    }
    if (OTR.materials && OTR.materials.setAnisotropy) OTR.materials.setAnisotropy(p.aniso);
    if (lastApplied && lastApplied !== level && !quiet && OTR.ui && OTR.ui.toast && G.running)
      OTR.ui.toast(`Graphics: ${p.label}${Q.mode === 'auto' ? ' (auto)' : ''}`, 2400);
    lastApplied = level;
    Q.refreshButtons();
  };

  Q.setMode = function (mode, quiet) {
    Q.mode = mode;
    save(mode);
    auto.locked = false; auto.acc = 0; auto.n = 0; auto.cool = 2;
    Q.apply(mode === 'auto' ? Q.level : mode, quiet);
  };
  Q.cycle = function () {
    const order = ['auto'].concat(LEVELS);
    const i = order.indexOf(Q.mode);
    Q.setMode(order[(i + 1) % order.length]);
  };
  Q.label = function () {
    const p = PRESETS[Q.level];
    return Q.mode === 'auto' ? `Graphics: Auto · ${p.label}` : `Graphics: ${p.label}`;
  };
  Q.refreshButtons = function () {
    document.querySelectorAll('.btn-quality').forEach(b => { b.textContent = Q.label(); });
  };

  // ---- auto-tuning ----
  // Windows of ~3 s of in-world frames. Step down when the mean frame time
  // is over 26 ms (< 38 fps); step up when under 9 ms (> 110 fps). One step
  // per window, a cooldown after each, and a lock after any down-step that
  // follows an up-step, so it can never oscillate.
  const auto = { acc: 0, n: 0, cool: 3, locked: false, steppedUp: false };
  Q.tick = function (dt, active) {
    if (Q.mode !== 'auto' || !active || !G) return;
    if (auto.cool > 0) { auto.cool -= dt; return; }
    auto.acc += dt; auto.n++;
    if (auto.acc < 3) return;
    const mean = auto.acc / auto.n;
    auto.acc = 0; auto.n = 0;
    const i = LEVELS.indexOf(Q.level);
    if (mean > 0.026 && i > 0) {
      if (auto.steppedUp) auto.locked = true;
      Q.apply(LEVELS[i - 1]); auto.cool = 4;
    } else if (mean < 0.009 && i < LEVELS.length - 1 && !auto.locked) {
      auto.steppedUp = true;
      Q.apply(LEVELS[i + 1]); auto.cool = 4;
    }
  };

  Q.init = function (game) {
    G = game;
    const saved = load();
    Q.mode = (saved === 'auto' || PRESETS[saved]) ? saved : 'auto';
    Q.level = Q.mode === 'auto' ? 'high' : Q.mode;
    Q.apply(Q.level, true);
    document.querySelectorAll('.btn-quality').forEach(b => { b.onclick = () => Q.cycle(); });
    Q.refreshButtons();
    window.addEventListener('resize', () => Q.apply(Q.level, true));
  };

})(window.OTR);
