/* materials.js — texture loading, canvas compositing, and the material library.
   Textures are CC0 (ambientCG / cc0textures.com) files vendored under assets/textures.
   Every material has a procedural fallback so the game still runs if images
   cannot load (e.g. opened via file:// in a browser that blocks local images). */
'use strict';
(function (OTR) {

  const M = OTR.materials = { lib: {}, anisotropy: 1, texturesOk: true };
  const loader = new THREE.TextureLoader();

  function canvasTex(size, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.repeat.set(repeat, repeat);
    return t;
  }

  // Procedural fallback: mottled color noise
  function fallbackTex(base, vary) {
    return canvasTex(256, (ctx, s) => {
      ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        const x = Math.random() * s, y = Math.random() * s;
        ctx.fillStyle = `rgba(${vary[0]},${vary[1]},${vary[2]},${Math.random() * 0.16})`;
        ctx.fillRect(x, y, 2 + Math.random() * 4, 2 + Math.random() * 4);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Texture failure registry. Every image-backed texture slot on a library
  // material is recorded here; if the image never arrives (file:// blocks,
  // 404, ...) the slot is stripped from the material so it can never sample
  // a dead texture as black (roughness 0 → mirror walls, the reported
  // wandering-glare artifact). Stripping is idempotent.
  // ---------------------------------------------------------------------
  const mapRegistry = []; // { tex, mat, slot, rough }

  function registerMap(mat, slot, tex) {
    mapRegistry.push({ tex, mat, slot, rough: mat.roughness });
  }
  function stripRecord(rec) {
    if (rec.mat[rec.slot] === rec.tex) {
      rec.mat[rec.slot] = null;
      if (rec.slot === 'roughnessMap') rec.mat.roughness = rec.rough; // restore authored value
      rec.mat.needsUpdate = true;
    }
  }
  function stripTexture(tex) {
    mapRegistry.forEach(rec => { if (rec.tex === tex) stripRecord(rec); });
  }
  // Safety net for loaders whose error event never fires: strip any
  // registered texture that still has no decoded image dimensions.
  M.stripDeadMaps = function () {
    mapRegistry.forEach(rec => {
      const img = rec.tex.image;
      if (!img || !(img.width > 0)) { M.texturesOk = false; stripRecord(rec); }
    });
  };

  function loadMap(file, { srgb = true, onfail = null } = {}) {
    const t = loader.load('assets/textures/' + file, undefined, undefined, () => {
      M.texturesOk = false;
      stripTexture(t); // never leave a dead texture attached anywhere
      if (onfail) onfail(t);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = M.anisotropy;
    return t;
  }

  // Build a MeshStandardMaterial from an ambientCG set name.
  function pbr(setName, { repeat = 1, rough = 1.0, color = 0xffffff, normalScale = 1,
                          metal = 0, fallbackColor = '#777', fallbackVary = [40, 40, 40] } = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal
    });
    const fb = () => { if (!mat.userData.fellBack) { mat.userData.fellBack = true; mat.map = fallbackTex(fallbackColor, fallbackVary); mat.map.repeat.set(repeat, repeat); mat.normalMap = null; mat.roughnessMap = null; mat.needsUpdate = true; } };
    mat.map = loadMap(setName + '_Color.jpg', { onfail: fb });
    mat.normalMap = loadMap(setName + '_Normal.jpg', { srgb: false });
    mat.roughnessMap = loadMap(setName + '_Roughness.jpg', { srgb: false });
    mat.map.repeat.set(repeat, repeat);
    mat.normalMap.repeat.set(repeat, repeat);
    mat.roughnessMap.repeat.set(repeat, repeat);
    mat.normalScale = new THREE.Vector2(normalScale, normalScale);
    // partial failure (color OK, secondary maps dead) strips only the dead
    // slots via the registry; total failure additionally swaps in fb above
    registerMap(mat, 'map', mat.map);
    registerMap(mat, 'normalMap', mat.normalMap);
    registerMap(mat, 'roughnessMap', mat.roughnessMap);
    return mat;
  }

  // Castle wall: CC0 concrete base composited with drawn ashlar block joints.
  function stoneBlockMaterial({ repeat = 1, tint = 0xffffff, blockW = 96, blockH = 44, dark = false } = {}) {
    const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.96, metalness: 0.0 });
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    function drawBlocks(baseImg) {
      if (baseImg) {
        ctx.drawImage(baseImg, 0, 0, size, size);
      } else {
        ctx.fillStyle = dark ? '#5a564f' : '#8f8a80';
        ctx.fillRect(0, 0, size, size);
      }
      // per-block tint variation + mortar joints
      const rows = Math.round(size / blockH);
      const rnd = OTR.rng(dark ? 99 : 7);
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * blockW / 2;
        for (let x = -blockW; x < size + blockW; x += blockW) {
          const v = (rnd() - 0.5) * 0.16;
          ctx.fillStyle = v > 0 ? `rgba(255,244,220,${v})` : `rgba(10,8,16,${-v})`;
          ctx.fillRect(x + off + 1, r * blockH + 1, blockW - 2, blockH - 2);
        }
      }
      ctx.strokeStyle = dark ? 'rgba(8,6,10,0.85)' : 'rgba(28,24,20,0.7)';
      ctx.lineWidth = 3;
      for (let r = 0; r <= rows; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * blockH); ctx.lineTo(size, r * blockH); ctx.stroke();
        const off = (r % 2) * blockW / 2;
        for (let x = -blockW; x < size + blockW; x += blockW) {
          ctx.beginPath(); ctx.moveTo(x + off, r * blockH); ctx.lineTo(x + off, r * blockH + blockH); ctx.stroke();
        }
      }
      // weathering streaks
      for (let i = 0; i < 46; i++) {
        const x = rnd() * size, y = rnd() * size, h = 60 + rnd() * 300;
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, 'rgba(20,16,12,0.16)');
        g.addColorStop(1, 'rgba(20,16,12,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 4 + rnd() * 16, h);
      }
      tex.needsUpdate = true;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = M.anisotropy;
    drawBlocks(null); // immediate fallback content

    const img = new Image();
    // anonymous, like TextureLoader: without it a file:// image can load yet
    // TAINT the canvas, and a tainted canvas texture can never be uploaded —
    // the walls silently fall back to whatever was in GPU memory
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // a tainted draw would poison the whole texture; probe before committing
      try {
        const probe = document.createElement('canvas'); probe.width = probe.height = 2;
        const pctx = probe.getContext('2d');
        pctx.drawImage(img, 0, 0, 2, 2);
        pctx.getImageData(0, 0, 1, 1); // throws if tainted
      } catch (e) { return; } // keep drawn fallback
      drawBlocks(img);
    };
    img.onerror = () => {}; // keep drawn fallback
    img.src = 'assets/textures/Concrete031_Color.jpg';

    mat.map = tex; // safe canvas texture — never needs the registry
    // reuse the concrete normal/roughness maps for surface response; both
    // registered so a blocked load strips them instead of sampling black
    mat.normalMap = loadMap('Concrete031_Normal.jpg', { srgb: false });
    mat.roughnessMap = loadMap('Concrete031_Roughness.jpg', { srgb: false });
    mat.normalMap.repeat.set(repeat, repeat);
    mat.roughnessMap.repeat.set(repeat, repeat);
    mat.normalScale = new THREE.Vector2(0.8, 0.8);
    registerMap(mat, 'normalMap', mat.normalMap);
    registerMap(mat, 'roughnessMap', mat.roughnessMap);
    return mat;
  }

  // Roof tiles drawn procedurally (no good CC0 set available offline).
  function roofMaterial(repeat = 3) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    mat.map = canvasTex(512, (ctx, s) => {
      ctx.fillStyle = '#6e3f2a'; ctx.fillRect(0, 0, s, s);
      const rows = 12, tileW = s / 8;
      const rnd = OTR.rng(31);
      for (let r = 0; r < rows; r++) {
        const y = r * s / rows;
        const off = (r % 2) * tileW / 2;
        for (let x = -tileW; x < s + tileW; x += tileW) {
          const v = rnd();
          ctx.fillStyle = `rgb(${96 + v * 50},${52 + v * 26},${34 + v * 18})`;
          ctx.beginPath();
          ctx.roundRect(x + off + 1, y + 1, tileW - 2, s / rows - 2, 7);
          ctx.fill();
          ctx.strokeStyle = 'rgba(30,14,8,0.8)'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    }, repeat);
    return mat;
  }

  // ---------------------------------------------------------------------
  // Stochastic (hex-blend) texture tiling: makes a repeating color map
  // aperiodic by blending three randomly-offset lookups on a triangular
  // grid, plus a low-frequency macro tint so big surfaces stop reading as
  // wallpaper. Injected into MeshStandardMaterial via onBeforeCompile;
  // only the diffuse map is de-tiled (normal/roughness repeats are far
  // less visible, and blending them would soften surface response).
  // ---------------------------------------------------------------------
  const STOCHASTIC_HELPERS = `
    vec2 otrHash2(vec2 p) {
      return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
    }
    float otrVNoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = otrHash2(i).x, b = otrHash2(i + vec2(1, 0)).x;
      float c = otrHash2(i + vec2(0, 1)).x, d = otrHash2(i + vec2(1, 1)).x;
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    vec4 otrStochastic(sampler2D tex, vec2 uv) {
      vec2 skew = mat2(1.0, 0.0, -0.57735027, 1.15470054) * (uv * 3.4641);
      vec2 cell = floor(skew);
      vec3 bc = vec3(fract(skew), 0.0);
      bc.z = 1.0 - bc.x - bc.y;
      vec2 v1, v2, v3; vec3 w;
      if (bc.z > 0.0) { v1 = cell; v2 = cell + vec2(0, 1); v3 = cell + vec2(1, 0); w = vec3(bc.z, bc.y, bc.x); }
      else { v1 = cell + vec2(1, 1); v2 = cell + vec2(1, 0); v3 = cell + vec2(0, 1); w = vec3(-bc.z, 1.0 - bc.y, 1.0 - bc.x); }
      w = pow(max(w, 0.0), vec3(4.0)); w /= (w.x + w.y + w.z); // sharpen: less ghosting
      vec2 dx = dFdx(uv), dy = dFdy(uv);
      return textureGrad(tex, uv + otrHash2(v1), dx, dy) * w.x
           + textureGrad(tex, uv + otrHash2(v2), dx, dy) * w.y
           + textureGrad(tex, uv + otrHash2(v3), dx, dy) * w.z;
    }
    void main() {`;

  const STOCHASTIC_MAP_FRAGMENT = `
    #ifdef USE_MAP
      vec4 sampledDiffuseColor = otrStochastic(map, vMapUv);
      // macro variation: broad light/dark patches break up remaining repetition
      float otrMacro = otrVNoise(vMapUv * 0.13) * 0.6 + otrVNoise(vMapUv * 0.031) * 0.4;
      sampledDiffuseColor.rgb *= 0.80 + 0.40 * otrMacro;
      diffuseColor *= sampledDiffuseColor;
    #endif`;

  M.stochastic = function (mat) {
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', STOCHASTIC_HELPERS)
        .replace('#include <map_fragment>', STOCHASTIC_MAP_FRAGMENT);
    };
    mat.customProgramCacheKey = () => 'otr-stochastic';
    return mat;
  };

  M.init = function (renderer) {
    M.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const lib = M.lib;

    lib.stoneWall   = stoneBlockMaterial({ repeat: 3 });
    lib.stoneWallBig= stoneBlockMaterial({ repeat: 6 });
    lib.vaultStone  = stoneBlockMaterial({ repeat: 3, dark: true, blockW: 128, blockH: 64, tint: 0xb8bdd0 });
    lib.plaster     = pbr('Concrete034', { repeat: 3, fallbackColor: '#b3ab9c' });
    // Large tiled surfaces get stochastic sampling — the courtyard paving and
    // grass repeat 10–24 times and read as wallpaper without it. Regular
    // patterns (block walls, planks, checker) must stay aligned, so not these.
    lib.paving      = M.stochastic(pbr('PavingStones098', { repeat: 10, fallbackColor: '#6a675f' }));
    lib.pavingCourt = M.stochastic(pbr('PavingStones098', { repeat: 22, fallbackColor: '#6a675f' }));
    lib.grass       = M.stochastic(pbr('Moss002', { repeat: 24, fallbackColor: '#5d7a3a', fallbackVary: [30, 60, 20] }));
    lib.grassNear   = M.stochastic(pbr('Moss002', { repeat: 8, fallbackColor: '#5d7a3a', fallbackVary: [30, 60, 20] }));
    lib.forestFloor = M.stochastic(pbr('Ground041', { repeat: 18, fallbackColor: '#4a3a26', fallbackVary: [70, 50, 20] }));
    lib.dirt        = M.stochastic(pbr('Ground042', { repeat: 14, fallbackColor: '#5d4d35', fallbackVary: [60, 45, 25] }));
    lib.rock        = M.stochastic(pbr('Rock035', { repeat: 5, color: 0x9aa0a8, fallbackColor: '#4d5258' }));
    lib.rockBig     = M.stochastic(pbr('Rock035', { repeat: 10, color: 0x8d949e, fallbackColor: '#4d5258' }));
    lib.caveRock    = M.stochastic(pbr('Rock035', { repeat: 4, color: 0x777f8c, fallbackColor: '#3c4148' }));
    lib.marbleBlack = pbr('Marble006', { repeat: 2, rough: 0.35, fallbackColor: '#1c1c22' });
    lib.marbleTomb  = pbr('Marble006', { repeat: 1, rough: 0.3, fallbackColor: '#1c1c22' });
    lib.checker     = pbr('Tiles074', { repeat: 8, rough: 0.5, fallbackColor: '#888' });
    lib.planks      = pbr('Planks020', { repeat: 3, fallbackColor: '#6c4f30', fallbackVary: [60, 40, 20] });
    lib.wood        = pbr('Wood027', { repeat: 2, fallbackColor: '#5a3c22', fallbackVary: [50, 35, 20] });
    lib.woodDark    = pbr('Wood027', { repeat: 2, color: 0x8a7a68, fallbackColor: '#3a2818' });
    lib.metal       = pbr('Metal030', { repeat: 2, rough: 0.55, metal: 0.9, color: 0xc8ccd4, fallbackColor: '#8a8f99' });
    lib.metalDark   = pbr('Metal030', { repeat: 2, rough: 0.44, metal: 0.85, color: 0x7b818f, fallbackColor: '#42454e' });
    lib.roof        = roofMaterial(3);

    lib.blackCloth  = new THREE.MeshStandardMaterial({ color: 0x17141a, roughness: 0.95 });
    lib.darkIron    = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.6, metalness: 0.85 });
    lib.gold        = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.9 });
    lib.bone        = new THREE.MeshStandardMaterial({ color: 0xd9cfb4, roughness: 0.7 });
    lib.candle      = new THREE.MeshStandardMaterial({ color: 0xe9dcb8, roughness: 0.6 });

    // Safety net (see registry above): some browsers/loaders swallow the
    // image error event on file://; 5 s in, strip anything still dead.
    setTimeout(M.stripDeadMaps, 5000);

    // animated flame spritesheet shared by every torch (see flameSheetTex)
    lib.flameSheetFrames = 8;
    lib.flameSheet = M.flameSheetTex(lib.flameSheetFrames);

    // flame sprite texture
    lib.flameTex = canvasTex(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s * 0.62, 4, s / 2, s * 0.55, s * 0.5);
      g.addColorStop(0, 'rgba(255,246,214,1)');
      g.addColorStop(0.25, 'rgba(255,196,92,0.9)');
      g.addColorStop(0.6, 'rgba(226,102,20,0.42)');
      g.addColorStop(1, 'rgba(120,30,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
    // soft radial glow
    lib.glowTex = canvasTex(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
    // dust mote / particle
    lib.moteTex = canvasTex(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,250,235,0.9)');
      g.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
    // soot smudge: rising smoke stain for the wall above a torch
    lib.sootTex = (function () {
      const c = document.createElement('canvas'); c.width = 128; c.height = 192;
      const ctx = c.getContext('2d');
      const rnd = OTR.rng(41);
      for (let i = 0; i < 70; i++) {
        const t = rnd();                       // 0 bottom (dense) → 1 top (wispy)
        const y = 176 - t * 168;
        const x = 64 + (rnd() - 0.5) * (18 + t * 64);
        const r = 10 + rnd() * 16 + t * 10;
        const g = ctx.createRadialGradient(x, y, 1, x, y, r);
        const a = (0.10 + rnd() * 0.10) * (1 - t * 0.7);
        g.addColorStop(0, `rgba(12,10,8,${a})`);
        g.addColorStop(1, 'rgba(12,10,8,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    // foliage billboard: painterly leaf cluster with alpha
    lib.leafTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const ctx = c.getContext('2d');
      const rnd = OTR.rng(52);
      for (let i = 0; i < 330; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.6) * 108;
        const x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr * 0.86;
        const g = 60 + rnd() * 80, r = 22 + rnd() * 42;
        ctx.fillStyle = `rgba(${g * 0.45 | 0},${g | 0},${g * 0.34 | 0},${0.16 + rnd() * 0.24})`;
        ctx.beginPath(); ctx.ellipse(x, y, 8 + rnd() * 17, 6 + rnd() * 13, a, 0, Math.PI * 2); ctx.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
  };

  // ---------------------------------------------------------------------
  // Procedurally drawn N-frame flame spritesheet. Each frame is a teardrop
  // flame whose noise lobes wander with the frame phase, so cycling the
  // frames reads as genuinely burning fire, not a pulsing sprite. One
  // texture shared by all torches; per-plane clones only offset the UVs
  // (same GPU image).
  // ---------------------------------------------------------------------
  M.flameSheetTex = function (frames = 8, fw = 96, fh = 160) {
    const c = document.createElement('canvas');
    c.width = fw * frames; c.height = fh;
    const ctx = c.getContext('2d');
    for (let f = 0; f < frames; f++) {
      const cx = f * fw + fw / 2;
      const ph = (f / frames) * Math.PI * 2; // cyclic phase → seamless loop
      // three nested tongues: outer orange, mid amber, hot core
      const layers = [
        { col: '235,96,12',   a: 0.34, r: fw * 0.34, h: 0.58 },
        { col: '255,178,54',  a: 0.55, r: fw * 0.24, h: 0.74 },
        { col: '255,244,198', a: 0.85, r: fw * 0.13, h: 0.88 },
      ];
      for (const L of layers) {
        const steps = 15;
        for (let i = 0; i < steps; i++) {
          const t = i / (steps - 1); // 0 base → 1 tip
          // side-to-side lobes; amplitude grows toward the tip and the two
          // sine frequencies beat against each other frame to frame
          const wob = (Math.sin(ph + t * 5.5) * 0.09 + Math.sin(ph * 2 + t * 9.0 + 1.7) * 0.055) * fw * t;
          const x = cx + wob;
          const y = fh * 0.94 - t * fh * L.h * (0.95 + 0.08 * Math.sin(ph * 3 + t * 4));
          const r = Math.max(2, L.r * (1 - t * 0.72) * (0.88 + 0.2 * Math.sin(ph + i * 1.9)));
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(${L.col},${(L.a * (1 - t * 0.45)).toFixed(3)})`);
          g.addColorStop(1, `rgba(${L.col},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(1 / frames, 1);
    return t;
  };

  // Cheap environment map (equirectangular gradient) so metals/roughs have
  // something to reflect. Without this, high-metalness materials render black.
  M.makeEnv = function (topColor, midColor, bottomColor) {
    const w = 256, h = 128;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#' + new THREE.Color(topColor).getHexString());
    g.addColorStop(0.5, '#' + new THREE.Color(midColor).getHexString());
    g.addColorStop(1, '#' + new THREE.Color(bottomColor).getHexString());
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // a soft bright spot = the sun/lamp, for a highlight to catch
    const sun = ctx.createRadialGradient(w * 0.7, h * 0.28, 2, w * 0.7, h * 0.28, 40);
    sun.addColorStop(0, 'rgba(255,246,220,0.9)'); sun.addColorStop(1, 'rgba(255,246,220,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // ---------------------------------------------------------------------
  // Procedural equirectangular sky (2048x1024 canvas): gradient atmosphere,
  // sun/moon disc with halo, layered clouds, stars, horizon haze. Used both
  // as the visible scene.background and — run through PMREMGenerator — as
  // proper image-based lighting in scene.environment, replacing the old
  // 256px gradient env map.
  // ---------------------------------------------------------------------

  // direction (unit vector) -> equirect canvas position, matching three's
  // equirectUv(): u = atan(z, x)/2pi + 0.5, v = asin(y)/pi + 0.5. Canvas
  // y runs downward while v runs upward, so y = (1 - v) * H.
  function dirToCanvas(dir, W, H) {
    const d = dir.clone().normalize();
    const u = Math.atan2(d.z, d.x) / (Math.PI * 2) + 0.5;
    const v = Math.asin(OTR.clamp(d.y, -1, 1)) / Math.PI + 0.5;
    return { x: u * W, y: (1 - v) * H };
  }

  // Draw at x and both wrap neighbours so radial gradients survive the seam.
  function wrapped(ctx, W, drawAt) { [0, -W, W].forEach(off => drawAt(off)); }

  M.makeSkyTexture = function (opts = {}) {
    const W = 2048, H = 1024;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const col = (v) => '#' + new THREE.Color(v).getHexString();
    const horizonY = H / 2;

    // ---- atmosphere gradient (zenith -> horizon -> ground) ----
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.0, col(opts.top != null ? opts.top : 0x2f5d96));
    g.addColorStop(0.34, col(opts.high != null ? opts.high : 0x6f95c4));
    g.addColorStop(0.5, col(opts.horizon != null ? opts.horizon : 0xd8c9a4));
    g.addColorStop(0.54, col(opts.horizon != null ? opts.horizon : 0xd8c9a4));
    g.addColorStop(0.7, col(opts.ground != null ? opts.ground : 0x4a4436));
    g.addColorStop(1.0, col(opts.groundDeep != null ? opts.groundDeep : (opts.ground != null ? opts.ground : 0x2c2820)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const rnd = OTR.rng(opts.seed || 11);

    // ---- stars (night) ----
    if (opts.stars) {
      for (let i = 0; i < 900 * opts.stars; i++) {
        const x = rnd() * W, y = Math.pow(rnd(), 1.4) * horizonY * 0.96;
        const a = 0.25 + rnd() * 0.75, r = rnd() < 0.06 ? 1.6 : 0.9;
        ctx.fillStyle = `rgba(${220 + rnd() * 35 | 0},${220 + rnd() * 35 | 0},255,${a})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      // milky-way style faint band
      ctx.save();
      ctx.translate(W * 0.5, horizonY * 0.5); ctx.rotate(-0.5);
      const mw = ctx.createLinearGradient(0, -90, 0, 90);
      mw.addColorStop(0, 'rgba(150,170,220,0)');
      mw.addColorStop(0.5, 'rgba(150,170,220,0.05)');
      mw.addColorStop(1, 'rgba(150,170,220,0)');
      ctx.fillStyle = mw; ctx.fillRect(-W, -90, W * 2, 180);
      ctx.restore();
    }

    // ---- sun / moon ----
    if (opts.sunDir) {
      const p = dirToCanvas(opts.sunDir, W, H);
      const sunCol = new THREE.Color(opts.sunColor != null ? opts.sunColor : 0xfff2cc);
      const r255 = (cc, a) => `rgba(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0},${a})`;
      const haloR = opts.haloR || 320, discR = opts.discR || 26;
      wrapped(ctx, W, (off) => {
        // broad halo
        let hg = ctx.createRadialGradient(p.x + off, p.y, discR, p.x + off, p.y, haloR);
        hg.addColorStop(0, r255(sunCol, opts.moon ? 0.30 : 0.55));
        hg.addColorStop(0.4, r255(sunCol, opts.moon ? 0.10 : 0.22));
        hg.addColorStop(1, r255(sunCol, 0));
        ctx.fillStyle = hg;
        ctx.fillRect(p.x + off - haloR, p.y - haloR, haloR * 2, haloR * 2);
        // disc
        let dg = ctx.createRadialGradient(p.x + off, p.y, 0, p.x + off, p.y, discR);
        dg.addColorStop(0, 'rgba(255,255,255,1)');
        dg.addColorStop(0.7, r255(sunCol, 1));
        dg.addColorStop(1, r255(sunCol, 0));
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.arc(p.x + off, p.y, discR, 0, Math.PI * 2); ctx.fill();
        if (opts.moon) { // mare blotches so it reads as a moon, not a lamp
          ctx.fillStyle = 'rgba(120,130,160,0.30)';
          ctx.beginPath(); ctx.arc(p.x + off - discR * 0.25, p.y - discR * 0.1, discR * 0.28, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(p.x + off + discR * 0.2, p.y + discR * 0.28, discR * 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(p.x + off + discR * 0.3, p.y - discR * 0.3, discR * 0.16, 0, Math.PI * 2); ctx.fill();
        }
      });
    }

    // ---- clouds: layered soft streaks, lit toward the sun ----
    if (opts.clouds) {
      const sunP = opts.sunDir ? dirToCanvas(opts.sunDir, W, H) : { x: W * 0.7, y: H * 0.3 };
      const lit = new THREE.Color(opts.cloudLit != null ? opts.cloudLit : 0xfff0d8);
      const shade = new THREE.Color(opts.cloudShade != null ? opts.cloudShade : 0xb8c4d8);
      const n = 140 * opts.clouds;
      for (let i = 0; i < n; i++) {
        // clouds hug a band above the horizon; higher = sparser
        const y = horizonY * (0.30 + Math.pow(rnd(), 0.65) * 0.66);
        const x = rnd() * W;
        const scale = 0.5 + (y / horizonY) * 1.6;          // perspective: lower = bigger
        const rx = (40 + rnd() * 130) * scale, ry = rx * (0.16 + rnd() * 0.12);
        // proximity to sun (wrapped) decides lit vs shaded tint
        let dx = Math.abs(x - sunP.x); dx = Math.min(dx, W - dx);
        const t = OTR.clamp(1 - Math.hypot(dx, (y - sunP.y) * 2) / (W * 0.5), 0, 1);
        const cc = shade.clone().lerp(lit, t * t);
        const alpha = (0.045 + rnd() * 0.075) * (opts.cloudAlpha || 1);
        wrapped(ctx, W, (off) => {
          const cg = ctx.createRadialGradient(x + off, y, 1, x + off, y, rx);
          cg.addColorStop(0, `rgba(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0},${alpha})`);
          cg.addColorStop(1, `rgba(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0},0)`);
          ctx.fillStyle = cg;
          ctx.save(); ctx.translate(x + off, y); ctx.scale(1, ry / rx); ctx.translate(-(x + off), -y);
          ctx.fillRect(x + off - rx, y - rx, rx * 2, rx * 2);
          ctx.restore();
        });
      }
    }

    // ---- horizon haze band ----
    const hazeA = opts.haze != null ? opts.haze : 0.5;
    if (hazeA > 0) {
      const hz = ctx.createLinearGradient(0, horizonY * 0.62, 0, horizonY * 1.2);
      const hcol = new THREE.Color(opts.hazeColor != null ? opts.hazeColor : (opts.horizon != null ? opts.horizon : 0xd8c9a4));
      hz.addColorStop(0, `rgba(${hcol.r * 255 | 0},${hcol.g * 255 | 0},${hcol.b * 255 | 0},0)`);
      hz.addColorStop(0.62, `rgba(${hcol.r * 255 | 0},${hcol.g * 255 | 0},${hcol.b * 255 | 0},${0.5 * hazeA})`);
      hz.addColorStop(1, `rgba(${hcol.r * 255 | 0},${hcol.g * 255 | 0},${hcol.b * 255 | 0},0)`);
      ctx.fillStyle = hz; ctx.fillRect(0, horizonY * 0.62, W, horizonY * 0.6);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // Install an equirect texture as the scene's environment. r160 PMREM-filters
  // equirect environment maps internally (and noticeably brighter than an
  // explicit PMREMGenerator pass — the game's interiors were tuned against
  // that path), so the texture is assigned directly. envIntensity scales IBL
  // on every material in the scene after the chapter has built (applied
  // lazily on the next frame via a one-shot updater).
  M.applyEnvironment = function (world, tex, envIntensity) {
    tex.userData.shared = true; // world.dispose: skip; disposed via disposables
    world.scene.environment = tex;
    if (envIntensity == null) envIntensity = 1; // materials are shared across
    // chapters — always (re)apply, or one chapter's value leaks into the next
    {
      // apply after build completes (materials are shared across chapters;
      // each chapter sets its own value, so mutation is safe)
      let done = false;
      world.addUpdater(() => {
        if (done) return; done = true;
        world.scene.traverse(o => {
          const m = o.material;
          if (m && m.isMeshStandardMaterial) m.envMapIntensity = envIntensity;
        });
      });
    }
    return tex;
  };

  // One call for exterior chapters: build sky, set as visible background,
  // and light the scene with it.
  M.sky = function (world, opts = {}) {
    const tex = M.makeSkyTexture(opts);
    tex.userData.shared = true; // disposed via world.disposables below
    if (opts.background !== false) {
      world.scene.background = tex;
      if (opts.backgroundIntensity != null) world.scene.backgroundIntensity = opts.backgroundIntensity;
    }
    M.applyEnvironment(world, tex, opts.envIntensity);
    world.disposables.push(() => tex.dispose());
    return tex;
  };

  // Interiors: no visible sky, but the environment map still shapes every
  // material response. Gradient plus a few painted glow spots (torch warmth,
  // a cold light-well) so metals and marble pick up believable reflections.
  M.interiorEnv = function (world, opts = {}) {
    const W = 512, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const col = (v) => '#' + new THREE.Color(v).getHexString();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, col(opts.top != null ? opts.top : 0x1c2230));
    g.addColorStop(0.5, col(opts.mid != null ? opts.mid : 0x11131a));
    g.addColorStop(1, col(opts.bottom != null ? opts.bottom : 0x07070a));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    (opts.glows || []).forEach(gl => {
      const x = (gl.u != null ? gl.u : 0.5) * W, y = (gl.v != null ? gl.v : 0.4) * H;
      const r = (gl.r != null ? gl.r : 0.1) * W;
      const cc = new THREE.Color(gl.color != null ? gl.color : 0xffb04a);
      const a = gl.intensity != null ? gl.intensity : 0.5;
      wrapped(ctx, W, (off) => {
        const rg = ctx.createRadialGradient(x + off, y, 1, x + off, y, r);
        rg.addColorStop(0, `rgba(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0},${a})`);
        rg.addColorStop(1, `rgba(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0},0)`);
        ctx.fillStyle = rg; ctx.fillRect(x + off - r, y - r, r * 2, r * 2);
      });
    });
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    M.applyEnvironment(world, tex, opts.envIntensity);
    world.disposables.push(() => tex.dispose());
    return tex;
  };

  // sky: big gradient dome via vertex-color trick
  M.makeSky = function (topColor, midColor, bottomColor) {
    const geo = new THREE.SphereGeometry(900, 24, 16);
    const top = new THREE.Color(topColor), mid = new THREE.Color(midColor), bot = new THREE.Color(bottomColor);
    const colors = [];
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 900; // -1..1
      const c = y > 0 ? mid.clone().lerp(top, Math.pow(y, 0.62)) : mid.clone().lerp(bot, Math.pow(-y, 0.5));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -10;
    return mesh;
  };

})(window.OTR);
