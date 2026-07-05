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

  function loadMap(file, { srgb = true, onfail = null } = {}) {
    const t = loader.load('assets/textures/' + file, undefined, undefined, () => {
      M.texturesOk = false;
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
    img.onload = () => drawBlocks(img);
    img.onerror = () => {}; // keep drawn fallback
    img.src = 'assets/textures/Concrete031_Color.jpg';

    mat.map = tex;
    // reuse the concrete normal/roughness maps for surface response
    mat.normalMap = loadMap('Concrete031_Normal.jpg', { srgb: false });
    mat.roughnessMap = loadMap('Concrete031_Roughness.jpg', { srgb: false });
    mat.normalMap.repeat.set(repeat, repeat);
    mat.roughnessMap.repeat.set(repeat, repeat);
    mat.normalScale = new THREE.Vector2(0.8, 0.8);
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

  M.init = function (renderer) {
    M.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const lib = M.lib;

    lib.stoneWall   = stoneBlockMaterial({ repeat: 3 });
    lib.stoneWallBig= stoneBlockMaterial({ repeat: 6 });
    lib.vaultStone  = stoneBlockMaterial({ repeat: 3, dark: true, blockW: 128, blockH: 64, tint: 0xb8bdd0 });
    lib.plaster     = pbr('Concrete034', { repeat: 3, fallbackColor: '#b3ab9c' });
    lib.paving      = pbr('PavingStones098', { repeat: 10, fallbackColor: '#6a675f' });
    lib.pavingCourt = pbr('PavingStones098', { repeat: 22, fallbackColor: '#6a675f' });
    lib.grass       = pbr('Moss002', { repeat: 24, fallbackColor: '#5d7a3a', fallbackVary: [30, 60, 20] });
    lib.grassNear   = pbr('Moss002', { repeat: 8, fallbackColor: '#5d7a3a', fallbackVary: [30, 60, 20] });
    lib.forestFloor = pbr('Ground041', { repeat: 18, fallbackColor: '#4a3a26', fallbackVary: [70, 50, 20] });
    lib.dirt        = pbr('Ground042', { repeat: 14, fallbackColor: '#5d4d35', fallbackVary: [60, 45, 25] });
    lib.rock        = pbr('Rock035', { repeat: 5, color: 0x9aa0a8, fallbackColor: '#4d5258' });
    lib.rockBig     = pbr('Rock035', { repeat: 10, color: 0x8d949e, fallbackColor: '#4d5258' });
    lib.caveRock    = pbr('Rock035', { repeat: 4, color: 0x777f8c, fallbackColor: '#3c4148' });
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
