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
      this.scene.traverse(o => {
        if (o.geometry) o.geometry.dispose && o.geometry.dispose();
      });
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

    sun(color, intensity, dir, ambientColor, ambientInt) {
      const sun = new THREE.DirectionalLight(color, intensity);
      sun.position.copy(dir);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const s = 60;
      sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
      sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.03;
      this.scene.add(sun);
      this.scene.add(sun.target);
      const hemi = new THREE.HemisphereLight(ambientColor || 0x9fb8d8, 0x30322c, ambientInt != null ? ambientInt : 0.5);
      this.scene.add(hemi);
      this.sunLight = sun; this.hemi = hemi;
      return sun;
    }

    // A torch/lamp: flame sprite + glow + flickering point light.
    torch(x, y, z, opts = {}) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const color = opts.color || 0xffb04a;
      const light = new THREE.PointLight(color, opts.intensity || 2.2, opts.distance || 12, 1.7);
      light.castShadow = !!opts.shadow;
      if (opts.shadow) { light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.004; light.shadow.camera.far = opts.distance || 12; }
      light.position.set(0, 0, 0);
      g.add(light);

      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: OTR.materials.lib.flameTex, color: 0xffffff, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      flame.scale.set(0.5, 0.8, 1);
      g.add(flame);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: OTR.materials.lib.glowTex, color: color, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5, fog: false
      }));
      glow.scale.set(3, 3, 1);
      g.add(glow);

      this.scene.add(g);
      const base = opts.intensity || 2.2;
      const seed = Math.random() * 10;
      const rec = { group: g, light, flame, glow, base, seed, on: true };
      this.torches.push(rec);
      this.addUpdater((dt, e) => {
        if (!rec.on) return;
        const f = 0.78 + 0.22 * (Math.sin(e * 11 + seed) * 0.5 + Math.sin(e * 23 + seed * 2) * 0.5);
        light.intensity = base * f;
        flame.scale.set(0.42 + f * 0.16, 0.7 + f * 0.28, 1);
        flame.material.rotation = Math.sin(e * 7 + seed) * 0.14;
        glow.material.opacity = 0.35 + f * 0.25;
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
