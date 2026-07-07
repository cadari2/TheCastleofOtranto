/* world.js — the World holds the active scene, colliders, interactables,
   triggers, per-frame updaters, and lighting. Chapters build into a World
   through its helper API; props.js and figures.js add geometry to it. */
'use strict';
(function (OTR) {

  class World {
    constructor(scene, renderer) {
      this.scene = scene;
      this.renderer = renderer;
      this.colliders = [];
      this.interactables = []; // {x,z,r,prompt,key,once,used,onUse,enabled,visibleCheck}
      this.triggers = [];      // {x,z,r,once,fired,onEnter}
      this.updaters = [];      // fn(dt, elapsed)
      this.torches = [];
      this.groundFn = null;    // (x,z) => y
      this.hardFloor = false;
      this.disposables = [];
      this._grid = new Map();
      this._elapsed = 0;
    }

    // ---------- lifecycle ----------
    dispose() {
      this.disposed = true; // lets zombie animation loops (walkTo, etc.) bail out
      this.scene.traverse(o => {
        if (o.geometry) o.geometry.dispose && o.geometry.dispose();
      });
      // Per-chapter environment / background maps are freshly built canvas
      // textures (materials.makeEnv, scene.background colours or textures);
      // free them so they don't accumulate on the GPU across chapters. Shared
      // library materials/textures are reused every chapter and left alone.
      const env = this.scene.environment, bg = this.scene.background;
      if (env && env.isTexture && !(env.userData && env.userData.shared)) env.dispose();
      if (bg && bg.isTexture && !(bg.userData && bg.userData.shared)) bg.dispose();
      this.disposables.forEach(d => { try { d(); } catch (e) {} });
    }

    // ---------- scene helpers ----------
    add(obj) { this.scene.add(obj); return obj; }

    addCollider(c) { this.colliders.push(c); this._indexCollider(c); return c; }
    box(cx, cz, w, d, minY, maxY) { return this.addCollider(OTR.aabb(cx, cz, w, d, minY, maxY)); }
    boxFromTo(x0, z0, x1, z1, minY, maxY) { return this.addCollider(OTR.aabbFromTo(x0, z0, x1, z1, minY, maxY)); }
    cyl(x, z, r, minY, maxY) { return this.addCollider(OTR.circle(x, z, r, minY, maxY)); }

    _cellKey(ix, iz) { return ix + ',' + iz; }
    _indexCollider(c) {
      // register collider into spatial grid cells it overlaps (cell size 6)
      let minX, maxX, minZ, maxZ;
      if (c.kind === 'aabb') { minX = c.minX; maxX = c.maxX; minZ = c.minZ; maxZ = c.maxZ; }
      else { minX = c.x - c.r; maxX = c.x + c.r; minZ = c.z - c.r; maxZ = c.z + c.r; }
      const S = 6;
      for (let ix = Math.floor(minX / S); ix <= Math.floor(maxX / S); ix++)
        for (let iz = Math.floor(minZ / S); iz <= Math.floor(maxZ / S); iz++) {
          const k = this._cellKey(ix, iz);
          let arr = this._grid.get(k); if (!arr) { arr = []; this._grid.set(k, arr); }
          arr.push(c);
        }
    }
    collidersNear(x, z, pad) {
      const S = 6;
      const set = new Set();
      const r = 1;
      const ix0 = Math.floor((x - r) / S), ix1 = Math.floor((x + r) / S);
      const iz0 = Math.floor((z - r) / S), iz1 = Math.floor((z + r) / S);
      for (let ix = ix0; ix <= ix1; ix++)
        for (let iz = iz0; iz <= iz1; iz++) {
          const arr = this._grid.get(this._cellKey(ix, iz));
          if (arr) arr.forEach(c => set.add(c));
        }
      return set;
    }

    groundHeight(x, z) { return this.groundFn ? this.groundFn(x, z) : 0; }

    addInteractable(o) {
      o.enabled = o.enabled !== false; o.used = false; o.r = o.r || 2.2; o.key = o.key || 'E';
      this.interactables.push(o); return o;
    }
    addTrigger(t) { t.fired = false; t.r = t.r || 2.5; this.triggers.push(t); return t; }
    addUpdater(fn) { this.updaters.push(fn); return fn; }

    // ---------- lighting rigs ----------
    setFog(color, near, far) { this.scene.fog = new THREE.Fog(color, near, far); }
    setFogExp(color, density) { this.scene.fog = new THREE.FogExp2(color, density); }

    sun(color, intensity, dir, ambientColor, ambientInt, opts = {}) {
      const sun = new THREE.DirectionalLight(color, intensity);
      sun.position.copy(dir);
      sun.castShadow = true;
      // 4096 where the GPU comfortably allows it — the texel density is what
      // keeps crenellation and figure shadows from dissolving into blobs.
      const maxTex = this.renderer.capabilities.maxTextureSize || 4096;
      const mapSize = opts.mapSize || (maxTex >= 8192 ? 4096 : 2048);
      sun.shadow.mapSize.set(mapSize, mapSize);
      const s = opts.area || 60; // fit the frustum to the playable area
      sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
      sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.03;
      sun.shadow.radius = 3.5; // softer PCF penumbra instead of hard edges
      this.scene.add(sun);
      this.scene.add(sun.target);
      if (opts.follow) {
        // big roaming chapters: keep the (small, sharp) shadow frustum
        // centred on the player. Snapped to shadow-texel-sized steps so the
        // shadow edges don't crawl as the camera moves.
        const dirOff = dir.clone();
        const step = (2 * s) / mapSize * 8;
        this.addUpdater(() => {
          const px = Math.round(OTR.player.pos.x / step) * step;
          const pz = Math.round(OTR.player.pos.z / step) * step;
          sun.target.position.set(px, 0, pz);
          sun.position.set(px + dirOff.x, dirOff.y, pz + dirOff.z);
        });
      }
      const hemi = new THREE.HemisphereLight(ambientColor || 0x9fb8d8, 0x30322c, ambientInt != null ? ambientInt : 0.5);
      this.scene.add(hemi);
      this.sunLight = sun; this.hemi = hemi;
      return sun;
    }

    // A torch/lamp: layered burning fire — crossed animated flame planes
    // cycling a shared spritesheet, a small rising-ember stream, and a point
    // light with a two-frequency flicker plus positional jitter. The old
    // oversized glow sprite is now a faint core halo; the fire itself
    // carries the light.
    torch(x, y, z, opts = {}) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const color = opts.color || 0xffb04a;
      const light = new THREE.PointLight(color, opts.intensity || 2.2, opts.distance || 12, 1.7);
      light.castShadow = !!opts.shadow;
      if (opts.shadow) { light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.004; light.shadow.camera.far = opts.distance || 12; }
      light.position.set(0, 0, 0);
      g.add(light);

      // Scale fire to the light's reach so a candle doesn't burn like a brazier.
      const sz = OTR.clamp((opts.distance || 12) / 12, 0.5, 1.25);
      const lib = OTR.materials.lib;
      const frames = lib.flameSheetFrames;

      // 2–3 crossed flame planes at offset spritesheet phases. Texture clones
      // share the GPU image; only the UV offset differs per plane.
      const planeN = sz < 0.7 ? 2 : 3;
      const planes = [];
      for (let i = 0; i < planeN; i++) {
        const tex = lib.flameSheet.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1 / frames, 1);
        const mat = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide, fog: false
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * sz, 0.9 * sz), mat);
        m.position.y = 0.30 * sz;
        m.rotation.y = (i / planeN) * Math.PI + (i ? 0.2 : 0);
        m.layers.set(1); // layer 1: skipped by the postfx depth prepass
        g.add(m);
        planes.push({ m, tex, mat, phase: Math.random() * frames, speed: 9 + i * 2.3 });
        this.disposables.push(() => { tex.dispose(); mat.dispose(); });
      }

      // faint core halo only — small and opacity-clamped so bloom cannot
      // inflate it into the old wandering orbs
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: lib.glowTex, color: color, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.22, fog: false
      }));
      glow.scale.set(1.1 * sz, 1.1 * sz, 1);
      glow.position.y = 0.22 * sz;
      glow.layers.set(1);
      g.add(glow);

      // rising ember stream: tiny respawning Points pool
      const EN = 14;
      const epos = new Float32Array(EN * 3);
      const elife = new Float32Array(EN);   // 0..1, dies at 1
      const espd = new Float32Array(EN);
      const edx = new Float32Array(EN), edz = new Float32Array(EN);
      const respawn = (i) => {
        epos[i * 3] = (Math.random() - 0.5) * 0.12 * sz;
        epos[i * 3 + 1] = 0.15 * sz;
        epos[i * 3 + 2] = (Math.random() - 0.5) * 0.12 * sz;
        elife[i] = Math.random(); // stagger
        espd[i] = (0.5 + Math.random() * 0.6) * sz;
        edx[i] = (Math.random() - 0.5) * 0.14;
        edz[i] = (Math.random() - 0.5) * 0.14;
      };
      for (let i = 0; i < EN; i++) respawn(i);
      const egeo = new THREE.BufferGeometry();
      egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
      const emat = new THREE.PointsMaterial({
        size: 0.035 * sz, map: lib.moteTex, color: 0xffb46a, transparent: true,
        opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
      });
      const embers = new THREE.Points(egeo, emat);
      embers.layers.set(1);
      g.add(embers);
      this.disposables.push(() => { emat.dispose(); });

      this.scene.add(g);
      const base = opts.intensity || 2.2;
      const seed = Math.random() * 10;
      const rec = { group: g, light, flame: planes[0].m, planes, glow, embers, base, seed, on: true };
      this.torches.push(rec);
      this.addUpdater((dt, e) => {
        if (!rec.on) {
          light.intensity = 0;
          planes.forEach(p => { p.m.visible = false; });
          glow.visible = false; embers.visible = false;
          return;
        }
        planes.forEach(p => { p.m.visible = true; });
        glow.visible = true; embers.visible = true;
        // two combined sine frequencies + slight positional jitter: shadows
        // and wall light breathe like firelight instead of pulsing
        const f = 0.80 + 0.20 * (Math.sin(e * 11 + seed) * 0.55 + Math.sin(e * 23 + seed * 2) * 0.45);
        light.intensity = base * f;
        light.position.set(
          Math.sin(e * 17 + seed) * 0.02,
          0.02 + Math.sin(e * 13 + seed * 3) * 0.015,
          Math.cos(e * 19 + seed) * 0.02);
        // spritesheet frame cycling at offset phases + per-plane scale wobble
        for (let i = 0; i < planes.length; i++) {
          const p = planes[i];
          p.tex.offset.x = (Math.floor(e * p.speed + p.phase) % frames) / frames;
          const w = 0.92 + 0.16 * Math.sin(e * 9 + seed + i * 2.1);
          p.m.scale.set(w, 0.9 + f * 0.25, 1);
        }
        glow.material.opacity = OTR.clamp(0.16 + f * 0.12, 0, 0.3);
        // embers rise, drift and die
        for (let i = 0; i < EN; i++) {
          elife[i] += dt * 0.9;
          if (elife[i] >= 1) { respawn(i); elife[i] = 0; }
          epos[i * 3] += edx[i] * dt + Math.sin(e * 3 + i) * 0.02 * dt;
          epos[i * 3 + 1] += espd[i] * dt;
          epos[i * 3 + 2] += edz[i] * dt;
        }
        egeo.attributes.position.needsUpdate = true;
        emat.opacity = 0.55 + 0.25 * f;
      });
      return rec;
    }

    // ambient particulate: dust motes (interior) or pollen (exterior)
    particles(count, box, color, size, drift) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = box.x0 + Math.random() * (box.x1 - box.x0);
        pos[i * 3 + 1] = box.y0 + Math.random() * (box.y1 - box.y0);
        pos[i * 3 + 2] = box.z0 + Math.random() * (box.z1 - box.z0);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        size: size || 0.05, map: OTR.materials.lib.moteTex, color: color || 0xffe9c0,
        transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });
      const pts = new THREE.Points(geo, mat);
      pts.layers.set(1); // skipped by the postfx depth prepass
      this.scene.add(pts);
      const arr = geo.attributes.position.array;
      this.addUpdater((dt, e) => {
        for (let i = 0; i < count; i++) {
          arr[i * 3] += Math.sin(e * 0.3 + i) * drift * dt;
          arr[i * 3 + 1] += (drift * 0.4) * dt * Math.sin(e * 0.2 + i * 1.3);
          if (arr[i * 3 + 1] > box.y1) arr[i * 3 + 1] = box.y0;
        }
        geo.attributes.position.needsUpdate = true;
      });
      return pts;
    }

    // ---------- lamp / torch the player carries ----------
    enableLamp(opts = {}) {
      const light = new THREE.PointLight(opts.color || 0xffb45a, 0, opts.distance || 14, 1.5);
      this.scene.add(light);
      // small flame sprite offset in front-right
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: OTR.materials.lib.flameTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, fog: false
      }));
      flame.scale.set(0.16, 0.26, 1);
      flame.renderOrder = 5;
      flame.layers.set(1); // skipped by the postfx depth prepass
      this.scene.add(flame);
      const lamp = {
        light, flame, fuel: 1, base: opts.intensity || 2.6, on: true,
        steadiness: 1, // 1 steady, dips in drafts
        gutter(sec = 1) { this._draft = Math.max(this._draft || 0, sec); },
        _draft: 0,
        setFuel(v) { this.fuel = OTR.clamp(v, 0, 1); },
        relight() { this.fuel = 1; this._draft = 0; OTR.audio.footstep && OTR.audio.footstep(false); }
      };
      this._lamp = lamp;
      OTR.ui.showLamp(true);
      this.addUpdater((dt, e) => {
        if (!lamp.on) { light.intensity = 0; flame.visible = false; return; }
        // draft handling
        if (lamp._draft > 0) { lamp._draft -= dt; lamp.fuel = Math.max(0.02, lamp.fuel - dt * 0.5); }
        else { lamp.fuel = Math.min(1, lamp.fuel + dt * 0.06); }
        const draftDip = lamp._draft > 0 ? (0.25 + 0.4 * Math.abs(Math.sin(e * 22))) : 1;
        const flick = 0.82 + 0.18 * (Math.sin(e * 13) * 0.5 + Math.sin(e * 27 + 1.3) * 0.5);
        const lvl = lamp.base * lamp.fuel * draftDip * flick;
        light.intensity = lvl;
        // position: at player's hand, slightly forward-right
        const p = OTR.player, fwd = p.forwardVec();
        const rx = fwd.z, rz = -fwd.x;
        light.position.set(p.pos.x + fwd.x * 0.3 + rx * 0.35, p.pos.y - 0.2, p.pos.z + fwd.z * 0.3 + rz * 0.35);
        flame.position.copy(light.position);
        flame.material.opacity = OTR.clamp(lamp.fuel * draftDip * 1.2, 0, 1);
        flame.scale.set(0.12 + lvl * 0.02, 0.2 + lvl * 0.03, 1);
        OTR.ui.setLamp(lamp.fuel * (lamp._draft > 0 ? 0.5 : 1));
      });
      return lamp;
    }
    get lamp() { return this._lamp; }

    // ---------- per-frame ----------
    update(dt) {
      this._elapsed += dt;
      const e = this._elapsed;
      for (const fn of this.updaters) fn(dt, e);

      const px = OTR.player.pos.x, pz = OTR.player.pos.z;

      // triggers
      for (const t of this.triggers) {
        if (t.fired && t.once !== false) continue;
        if (OTR.dist2D(px, pz, t.x, t.z) <= t.r) {
          if (!t.fired || t.once === false) {
            t.fired = true;
            t.onEnter && t.onEnter();
          }
        } else if (t.once === false) {
          t.fired = false;
        }
      }

      // nearest interactable prompt
      if (!OTR.ui.isDialogue() && !OTR.player.frozen) {
        let best = null, bestD = Infinity;
        for (const o of this.interactables) {
          if (!o.enabled || (o.once && o.used)) continue;
          const d = OTR.dist2D(px, pz, o.x, o.z);
          if (d <= o.r && d < bestD) { best = o; bestD = d; }
        }
        this._nearInteract = best;
        if (best) OTR.ui.showPrompt(best.prompt, best.key);
        else OTR.ui.hidePrompt();
      } else {
        OTR.ui.hidePrompt();
        this._nearInteract = null;
      }
    }

    tryInteract() {
      const o = this._nearInteract;
      if (!o) return false;
      if (o.once) o.used = true;
      OTR.audio.click && OTR.audio.click();
      o.onUse && o.onUse(o);
      return true;
    }
  }

  OTR.World = World;

})(window.OTR);
