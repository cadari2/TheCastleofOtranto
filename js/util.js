/* util.js — shared helpers. Everything lives under the OTR namespace. */
'use strict';
window.OTR = window.OTR || {};

(function (OTR) {

  // Single shared version constant: shown on the title screen and echoed in
  // README / the index.html cache-busting query.
  OTR.VERSION = '0.1';

  OTR.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  OTR.lerp = (a, b, t) => a + (b - a) * t;
  OTR.smoothstep = (a, b, t) => {
    const x = OTR.clamp((t - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  };

  // Deterministic RNG so the world looks the same on every visit.
  OTR.rng = function (seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  // 2D value noise (used for terrain heights and canvas textures).
  const perm = new Uint8Array(512);
  {
    const r = OTR.rng(1764); // year of publication
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (r() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }
  function fade(t) { return t * t * (3 - 2 * t); }
  function grad2(h, x, y) {
    switch (h & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  }
  OTR.noise2 = function (x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    return OTR.lerp(
      OTR.lerp(grad2(aa, x, y), grad2(ba, x - 1, y), u),
      OTR.lerp(grad2(ab, x, y - 1), grad2(bb, x - 1, y - 1), u),
      v) * 0.7071;
  };
  OTR.fbm = function (x, y, oct = 4, lac = 2.0, gain = 0.5) {
    let amp = 0.5, f = 1, sum = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * OTR.noise2(x * f, y * f);
      amp *= gain; f *= lac;
    }
    return sum;
  };

  // ------- collision shapes -------
  // AABB: {minX,maxX,minZ,maxZ,minY,maxY}  Circle: {x,z,r,minY,maxY}
  OTR.aabb = function (cx, cz, w, d, minY = -Infinity, maxY = Infinity) {
    return { kind: 'aabb', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY, maxY };
  };
  OTR.aabbFromTo = function (x0, z0, x1, z1, minY = -Infinity, maxY = Infinity) {
    return { kind: 'aabb', minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), minY, maxY };
  };
  OTR.circle = function (x, z, r, minY = -Infinity, maxY = Infinity) {
    return { kind: 'circle', x, z, r, minY, maxY };
  };

  // Push a point (px,pz) with radius pr out of collider c; returns [nx,nz] or null.
  OTR.resolveCollider = function (c, px, pz, pr, py, ph) {
    if (py + ph < c.minY || py > c.maxY) return null;
    if (c.kind === 'aabb') {
      const nx = OTR.clamp(px, c.minX, c.maxX);
      const nz = OTR.clamp(pz, c.minZ, c.maxZ);
      let dx = px - nx, dz = pz - nz;
      let d2 = dx * dx + dz * dz;
      if (d2 > pr * pr) return null;
      if (d2 === 0) {
        // inside the box: push out through the nearest face
        const dl = px - c.minX, dr = c.maxX - px, db = pz - c.minZ, df = c.maxZ - pz;
        const m = Math.min(dl, dr, db, df);
        if (m === dl) return [c.minX - pr, pz];
        if (m === dr) return [c.maxX + pr, pz];
        if (m === db) return [px, c.minZ - pr];
        return [px, c.maxZ + pr];
      }
      const d = Math.sqrt(d2);
      return [nx + dx / d * pr, nz + dz / d * pr];
    } else {
      const dx = px - c.x, dz = pz - c.z;
      const rr = pr + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 === 0) return null;
      const d = Math.sqrt(d2);
      return [c.x + dx / d * rr, c.z + dz / d * rr];
    }
  };

  OTR.dist2D = function (ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  };

  // Simple event bus
  OTR.events = {
    map: {},
    on(name, fn) { (this.map[name] = this.map[name] || []).push(fn); },
    emit(name, arg) { (this.map[name] || []).forEach(fn => fn(arg)); },
    clear() { this.map = {}; }
  };

})(window.OTR);
