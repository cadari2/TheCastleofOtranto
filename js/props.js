/* props.js — reusable architecture & object builders. Each takes the World
   and adds meshes (and, where solid, colliders). Geometry is detailed enough
   to avoid a "low-poly" read: arches, vaults, mouldings, crenellations. */
'use strict';
(function (OTR) {

  const lib = () => OTR.materials.lib;
  const P = OTR.props = {};

  // Merge a list of BufferGeometries (position/normal/uv + index) into one.
  // BufferGeometryUtils lives in three's examples, not the vendored core
  // build, so this is done by hand. Inputs are consumed (disposed).
  function mergeGeoms(geoms) {
    let vTotal = 0, iTotal = 0;
    for (const g of geoms) { vTotal += g.attributes.position.count; iTotal += g.index ? g.index.count : g.attributes.position.count; }
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const itemSize = geoms[0].attributes[name].itemSize;
      const arr = new Float32Array(vTotal * itemSize);
      let off = 0;
      for (const g of geoms) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
    }
    const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
    let iOff = 0, vOff = 0;
    for (const g of geoms) {
      const gi = g.index ? g.index.array : null;
      const n = gi ? gi.length : g.attributes.position.count;
      for (let i = 0; i < n; i++) idx[iOff + i] = (gi ? gi[i] : i) + vOff;
      iOff += n; vOff += g.attributes.position.count;
      g.dispose();
    }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }
  P.mergeGeoms = mergeGeoms;

  function mesh(geo, mat, x, y, z, opts) {
    const m = new THREE.Mesh(geo, mat);
    if (x !== undefined) m.position.set(x, y, z);
    m.castShadow = !opts || opts.cast !== false;
    m.receiveShadow = !opts || opts.receive !== false;
    return m;
  }
  P.mesh = mesh;

  // ---------- ground ----------
  P.groundPlane = function (world, size, material, y = 0) {
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const m = mesh(geo, material, 0, y, 0, { cast: false });
    world.add(m);
    return m;
  };

  // Height-field terrain from a function; returns the mesh and sets groundFn.
  P.terrain = function (world, size, seg, material, heightFn) {
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, heightFn(x, z));
    }
    geo.computeVertexNormals();
    const m = mesh(geo, material, 0, 0, 0, { cast: false });
    world.add(m);
    world.groundFn = heightFn;
    return m;
  };

  // ---------- walls ----------
  // Wall segment between (x0,z0)-(x1,z1), given height/thickness. Adds collider.
  P.wall = function (world, x0, z0, x1, z1, height, thick, material, opts = {}) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const baseY = opts.baseY || 0;
    const geo = new THREE.BoxGeometry(thick, height, len);
    const m = mesh(geo, material, cx, baseY + height / 2, cz);
    m.rotation.y = ang;
    world.add(m);
    // architectural detail (visual only, colliders unchanged): a battered
    // plinth with chamfered wash at the base and a string course at 2/3
    // height, so tall walls stop reading as extruded rectangles.
    if (opts.detail !== false && height >= 4 && len >= 4) {
      // mouldings run past the wall ends by the plinth's own overhang so
      // plinth/wash/course close at wall corners instead of leaving notches
      const ext = thick * 0.7;
      const plH = Math.min(1.5, height * 0.2);
      const plinth = mesh(new THREE.BoxGeometry(thick * 1.35, plH, len + ext), material, cx, baseY + plH / 2, cz);
      plinth.rotation.y = ang;
      world.add(plinth);
      const ux = Math.cos(ang), uz = -Math.sin(ang); // wall-face normal
      for (const side of [-1, 1]) { // chamfered wash atop the plinth
        const wash = mesh(new THREE.BoxGeometry(0.26, 0.09, len + ext), material,
          cx + ux * side * (thick * 0.62), baseY + plH + 0.02, cz + uz * side * (thick * 0.62));
        wash.rotation.y = ang;
        wash.rotation.z = side * 0.9;
        world.add(wash);
      }
      const scH = 0.24;
      const course = mesh(new THREE.BoxGeometry(thick * 1.2, scH, len + ext), material, cx, baseY + height * 0.66, cz);
      course.rotation.y = ang;
      world.add(course);
    }
    if (opts.collide !== false) {
      // approximate rotated wall with an AABB per axis-aligned or a thin box.
      addRotatedBoxCollider(world, cx, cz, thick, len, ang, baseY, baseY + height);
    }
    if (opts.crenellate) P.crenellations(world, x0, z0, x1, z1, baseY + height, thick, material);
    return m;
  };

  // Add a collider for a rotated box by splitting into a few circles along its length
  function addRotatedBoxCollider(world, cx, cz, thick, len, ang, minY, maxY) {
    const ux = Math.sin(ang), uz = Math.cos(ang);
    const r = thick / 2;
    const n = Math.max(1, Math.ceil(len / (r * 1.6)));
    for (let i = 0; i <= n; i++) {
      const t = (i / n - 0.5) * len;
      world.cyl(cx + ux * t, cz + uz * t, r, minY, maxY);
    }
  }

  // Merlon + seated cap merged into a single BufferGeometry per wall run:
  // one mesh (and one shadow caster) instead of ~2 meshes per merlon.
  P.crenellations = function (world, x0, z0, x1, z1, topY, thick, material) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const ang = Math.atan2(dx, dz);
    const merlonW = 0.7, gap = 0.5, step = merlonW + gap, h = 0.8;
    const n = Math.floor(len / step);
    if (n <= 0) return null;
    const startOff = (len - n * step) / 2;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const d = startOff + i * step + merlonW / 2;
      const x = x0 + ux * d, z = z0 + uz * d;
      const body = new THREE.BoxGeometry(thick, h, merlonW);
      body.rotateY(ang); body.translate(x, topY + h / 2, z);
      // cap seated flush on the merlon top (spans exactly [h, h+0.14])
      const cap = new THREE.BoxGeometry(thick * 1.16, 0.14, merlonW * 1.16);
      cap.rotateY(ang); cap.translate(x, topY + h + 0.07, z);
      parts.push(body, cap);
    }
    const m = mesh(mergeGeoms(parts), material);
    world.add(m);
    return m;
  };

  // ---------- arched doorway cut look (freestanding arch frame) ----------
  P.archway = function (world, x, z, ang, width, height, depth, material, opts = {}) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ang;
    const legW = 0.5;
    const legGeo = new THREE.BoxGeometry(legW, height, depth);
    const l = mesh(legGeo, material, -(width / 2 + legW / 2), height / 2, 0); g.add(l);
    const r = mesh(legGeo.clone(), material, (width / 2 + legW / 2), height / 2, 0); g.add(r);
    // impost blocks where the arch springs from the jambs
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(legW * 1.5, 0.32, depth * 1.15), material, s * (width / 2 + legW / 2), height - 0.16, 0));
      g.add(mesh(new THREE.BoxGeometry(legW * 1.35, 0.35, depth * 1.1), material, s * (width / 2 + legW / 2), 0.18, 0));
    }
    // Semicircular arch as one continuous swept band: an extruded
    // half-annulus (no more ragged voussoir ring), with carved joint lines
    // and a keystone reading against the smooth sweep. Fewer meshes than the
    // old ~26-box crown.
    const R1 = width / 2, R2 = width / 2 + legW;
    const shape = new THREE.Shape();
    shape.moveTo(R2, 0);
    shape.absarc(0, 0, R2, 0, Math.PI, false);
    shape.lineTo(-R1, 0);
    shape.absarc(0, 0, R1, Math.PI, 0, true);
    shape.closePath();
    const bandGeo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 36 });
    bandGeo.translate(0, 0, -depth / 2);
    // extrude UVs are position-derived (world units); scale to roughly match
    // the stone repeat on adjacent walls
    const uv = bandGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.35, uv.getY(i) * 0.35);
    const band = mesh(bandGeo, material, 0, height, 0);
    g.add(band);
    // carved joint lines: thin dark strips radiating across the band
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x241f1a, roughness: 1 });
    const nJ = Math.max(7, Math.round(R2 * 2.4)) | 1; // odd → keystone at apex
    const rm = (R1 + R2) / 2;
    const joints = [];
    for (let i = 1; i < nJ; i++) {
      const a = Math.PI * (i / nJ);
      if (Math.abs(a - Math.PI / 2) < 0.14) continue; // keystone takes the apex
      const j = new THREE.BoxGeometry(0.035, legW * 1.01, depth * 1.02);
      j.rotateZ(a - Math.PI / 2);
      j.translate(Math.cos(a) * rm, Math.sin(a) * rm, 0);
      joints.push(j);
    }
    const jm = mesh(mergeGeoms(joints), jointMat, 0, height, 0, { cast: false });
    g.add(jm);
    // keystone: slightly proud wedge at the apex
    const key = mesh(new THREE.BoxGeometry(Math.max(0.42, R2 * 0.22), legW + 0.22, depth * 1.12), material, 0, height + rm, 0);
    g.add(key);
    world.add(g);
    if (opts.collide !== false) {
      // two door jambs as colliders; opening left clear
      const ux = Math.cos(ang), uz = -Math.sin(ang);
      world.cyl(x - ux * (width / 2 + legW / 2), z - uz * (width / 2 + legW / 2), legW / 2, 0, height);
      world.cyl(x + ux * (width / 2 + legW / 2), z + uz * (width / 2 + legW / 2), legW / 2, 0, height);
    }
    return g;
  };

  // ---------- columns & arcades ----------
  P.column = function (world, x, z, height, radius, material, opts = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const shaft = mesh(new THREE.CylinderGeometry(radius * 0.86, radius, height, 16), material, 0, height / 2, 0);
    g.add(shaft);
    const capGeo = new THREE.CylinderGeometry(radius * 1.35, radius * 0.9, 0.4, 16);
    g.add(mesh(capGeo, material, 0, height - 0.2, 0));
    const baseGeo = new THREE.CylinderGeometry(radius * 1.1, radius * 1.35, 0.4, 16);
    g.add(mesh(baseGeo, material, 0, 0.2, 0));
    world.add(g);
    if (opts.collide !== false) world.cyl(x, z, radius * 1.1, 0, height);
    return g;
  };

  // barrel-vaulted corridor ceiling spanning along +Z, centered at x
  P.barrelVault = function (world, x, z0, z1, width, springY, material) {
    const len = Math.abs(z1 - z0);
    const zc = (z0 + z1) / 2;
    const geo = new THREE.CylinderGeometry(width / 2, width / 2, len, 20, 1, true, 0, Math.PI);
    geo.rotateZ(Math.PI / 2);
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, springY, zc);
    m.rotation.x = Math.PI; // dome upward
    m.receiveShadow = true; m.castShadow = true;
    material.side = THREE.DoubleSide;
    world.add(m);
    return m;
  };

  // groin/flat ceiling slab
  P.ceiling = function (world, cx, cz, w, d, y, material) {
    const geo = new THREE.BoxGeometry(w, 0.4, d);
    const m = mesh(geo, material, cx, y, cz);
    world.add(m); return m;
  };

  P.floor = function (world, cx, cz, w, d, y, material, opts = {}) {
    const geo = new THREE.BoxGeometry(w, 0.4, d);
    const m = mesh(geo, material, cx, y - 0.2, cz, { cast: false });
    world.add(m); return m;
  };

  // ---------- tower ----------
  P.tower = function (world, x, z, radius, height, material, opts = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const wall = mesh(new THREE.CylinderGeometry(radius, radius * 1.08, height, 24, 1, true), material, 0, height / 2, 0);
    wall.material = material.clone(); wall.material.side = THREE.DoubleSide;
    g.add(wall);
    // battered base flare + corbelled ring under the parapet: the two details
    // that most say "defensive tower" in silhouette
    g.add(mesh(new THREE.CylinderGeometry(radius * 1.09, radius * 1.3, height * 0.16, 24), material, 0, height * 0.08, 0));
    g.add(mesh(new THREE.CylinderGeometry(radius * 1.18, radius * 1.0, 0.6, 24), material, 0, height - 0.3, 0));
    // crenellation ring, merged to one mesh
    const merlons = 16, ringParts = [];
    for (let i = 0; i < merlons; i++) {
      const a = (i / merlons) * Math.PI * 2;
      const box = new THREE.BoxGeometry(0.6, 0.9, 0.5);
      box.rotateY(-a);
      box.translate(Math.cos(a) * radius, height + 0.45, Math.sin(a) * radius);
      ringParts.push(box);
    }
    g.add(mesh(mergeGeoms(ringParts), material));
    if (opts.roof) {
      const roofGeo = new THREE.ConeGeometry(radius * 1.15, radius * 1.5, 24);
      g.add(mesh(roofGeo, lib().roof, 0, height + radius * 0.75, 0));
    }
    world.add(g);
    if (opts.collide !== false) world.cyl(x, z, radius, 0, height + 2);
    return g;
  };

  // ---------- the great motifs ----------
  // Giant plumed helmet (Chapter 1). Returns group; huge scale.
  P.giantHelmet = function (world, x, y, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const steel = lib().metalDark;
    // skull/dome
    const dome = mesh(new THREE.SphereGeometry(2.1, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), steel, 0, 1.4, 0);
    g.add(dome);
    // face / body of helm
    const body = mesh(new THREE.CylinderGeometry(2.1, 1.7, 2.4, 24), steel, 0, 0.2, 0);
    g.add(body);
    // face guard: a plate curving across the front of the helm, proud of the
    // body so it reads from every angle (the old slits sat buried inside the
    // body cylinder and never showed)
    const guardMat = steel.clone(); guardMat.side = THREE.DoubleSide;
    const guard = mesh(new THREE.CylinderGeometry(2.22, 2.06, 1.9, 24, 1, true, -Math.PI * 0.34, Math.PI * 0.68), guardMat, 0, 0.55, 0);
    g.add(guard);
    // rim mouldings top and bottom of the guard
    for (const [yy, rr] of [[1.5, 2.24], [-0.4, 2.08]]) {
      const rim = mesh(new THREE.TorusGeometry(rr, 0.06, 8, 24, Math.PI * 0.68), steel, 0, yy, 0);
      rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI * 0.16; // centre the arc on +Z
      g.add(rim);
    }
    const slitMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 });
    // eye holes, dark and deep-set
    for (const s of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.3, 14, 10), slitMat, s * 0.66, 1.02, 2.1, { cast: false });
      eye.scale.set(1, 0.62, 0.3);
      eye.rotation.y = s * 0.3; // follow the curve of the guard
      g.add(eye);
    }
    // breathing slits below the eyes
    for (let i = 0; i < 2; i++) {
      const sl = mesh(new THREE.BoxGeometry(1.5, 0.1, 0.12), slitMat, 0, 0.3 - i * 0.32, 2.12, { cast: false });
      g.add(sl);
    }
    // brim
    g.add(mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.25, 24), steel, 0, -1.0, 0));
    // Black plumes (sable feathers): each quill is a tapered blade ribbon
    // plus a thin spine ribbon crossed through it, so the crest reads as
    // feathers, not an urchin of bare tubes. Quills are merged into three
    // cluster meshes (three draw calls, ~few k triangles), and the sway is
    // a phase-offset nod — not the old perfect-circle precession.
    const plumeMat = new THREE.MeshStandardMaterial({ color: 0x6a1420, roughness: 0.82, metalness: 0.08, side: THREE.DoubleSide });
    const N = 46, CLUSTERS = 3;
    const rndp = OTR.rng(1764);
    // one quill = blade ribbon + spine ribbon, both strips along the curve
    function quillGeoms(curve, len, ox, oz, bx, bz) {
      const segs = 10;
      const wide = new THREE.Vector3(-oz, 0, ox);           // blade width dir
      function ribbon(dirFn, widthFn) {
        const posArr = new Float32Array((segs + 1) * 2 * 3);
        const uvArr = new Float32Array((segs + 1) * 2 * 2);
        const idx = new Uint16Array(segs * 6);
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const p = curve.getPoint(t);
          const w = widthFn(t) / 2;
          const d = dirFn(t);
          const o = s * 6;
          posArr[o] = bx + p.x - d.x * w; posArr[o + 1] = 3.0 + p.y - d.y * w; posArr[o + 2] = bz + p.z - d.z * w;
          posArr[o + 3] = bx + p.x + d.x * w; posArr[o + 4] = 3.0 + p.y + d.y * w; posArr[o + 5] = bz + p.z + d.z * w;
          uvArr[s * 4] = 0; uvArr[s * 4 + 1] = t; uvArr[s * 4 + 2] = 1; uvArr[s * 4 + 3] = t;
          if (s < segs) {
            const b = s * 2, io = s * 6;
            idx[io] = b; idx[io + 1] = b + 1; idx[io + 2] = b + 2;
            idx[io + 3] = b + 1; idx[io + 4] = b + 3; idx[io + 5] = b + 2;
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeVertexNormals();
        return geo;
      }
      // blade: widest mid-length, tapering at root and tip
      const blade = ribbon(() => wide, (t) => 0.03 + 0.30 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
      // spine: thin, perpendicular to the blade (crossed strip)
      const up = new THREE.Vector3();
      const spine = ribbon((t) => up.copy(curve.getTangent(t)).cross(wide).normalize(), () => 0.05);
      return [blade, spine];
    }
    const clusterGeoms = Array.from({ length: CLUSTERS }, () => []);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (rndp() - 0.5) * 0.25;
      const rr = 0.1 + rndp() * 0.55;                  // root radius on the crown
      const len = 2.8 + rndp() * 2.6;
      const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
      const lean = 0.25 + rr * 1.1 + rndp() * 0.2;
      const ox = Math.cos(a), oz = Math.sin(a);
      const p0 = new THREE.Vector3(0, 0, 0);
      const p1 = new THREE.Vector3(ox * len * 0.45 * lean, len * 0.62, oz * len * 0.45 * lean);
      const p2 = new THREE.Vector3(ox * len * (0.7 + lean * 0.5), len * 0.72 - len * 0.28, oz * len * (0.7 + lean * 0.5));
      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      clusterGeoms[i % CLUSTERS].push(...quillGeoms(curve, len, ox, oz, bx, bz));
    }
    const clusters = clusterGeoms.map((geoms, ci) => {
      const m = new THREE.Mesh(mergeGeoms(geoms), plumeMat);
      m.castShadow = false; // the dome casts; the crest isn't worth the shadow pass
      m.receiveShadow = false;
      m.userData.baseRot = { phase: ci * 2.1 };
      g.add(m);
      return m;
    });
    g.scale.setScalar(scale);
    world.add(g);
    // gentle sway: quills nod (two incommensurate sines, tiny z component)
    // instead of orbiting — no more "moves around and around"
    world.addUpdater((dt, e) => {
      for (const c of clusters) {
        const b = c.userData.baseRot;
        c.rotation.x = Math.sin(e * 1.1 + b.phase) * 0.04;
        c.rotation.z = Math.sin(e * 0.7 + b.phase * 1.7) * 0.015;
      }
    });
    if (world) g.userData.collider = world.cyl(x, z, 2.2 * scale, y, y + 6 * scale);
    g.userData.plumeGroup = g;
    return g;
  };

  // Giant armoured foot & lower leg (glimpsed in the gallery-chamber)
  P.giantFoot = function (world, x, y, z, ang) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ang || 0;
    const steel = lib().metal;
    // greave (shin)
    g.add(mesh(new THREE.CylinderGeometry(0.9, 1.2, 5, 18), steel, 0, 2.4, 0));
    // knee dome
    g.add(mesh(new THREE.SphereGeometry(1.1, 18, 14), steel, 0, 4.6, 0));
    // foot: sabaton (flattened boxes, tapered)
    const foot = new THREE.Group(); foot.position.set(0, 0.4, 1.6);
    for (let i = 0; i < 5; i++) {
      const w = 1.8 - i * 0.18;
      foot.add(mesh(new THREE.BoxGeometry(w, 0.6, 0.7), steel, 0, 0 - i * 0.03, i * 0.7));
    }
    g.add(foot);
    world.add(g);
    world.cyl(x, z, 1.4, y, y + 6);
    return g;
  };

  // Gigantic sword resting in the court / found in the wood
  P.giantSword = function (world, x, y, z, ang, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ang || 0;
    const steel = lib().metal;
    // Blade as one extruded outline with a bevelled cross-section and a true
    // tapered tip (replaces the old box + rotated cone, whose seam always
    // showed). Shape is drawn in (width, length) and swung to lie along +Z.
    const bl = 10.2, hw = 0.3; // blade length (incl. tip), half-width
    const bshape = new THREE.Shape();
    bshape.moveTo(-hw, 0);
    bshape.lineTo(-hw, bl * 0.82);
    bshape.quadraticCurveTo(-hw * 0.55, bl * 0.93, 0, bl); // tapered tip
    bshape.quadraticCurveTo(hw * 0.55, bl * 0.93, hw, bl * 0.82);
    bshape.lineTo(hw, 0);
    bshape.closePath();
    const bgeo = new THREE.ExtrudeGeometry(bshape, {
      depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 1
    });
    bgeo.translate(0, 0, -0.04); // center the thickness
    bgeo.rotateX(Math.PI / 2);   // length now along +Z, edge bevels up/down
    const blade = mesh(bgeo, steel, 0, 0, -3);
    g.add(blade);
    // fuller groove down the middle of the blade
    const fuller = mesh(new THREE.BoxGeometry(0.09, 0.17, bl * 0.62), lib().metalDark, 0, 0, -3 + bl * 0.36);
    g.add(fuller);
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.3, 0.5), lib().gold, 0, 0, -3.2)); // crossguard
    const grip = mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 12), lib().woodDark, 0, 0, -4.6);
    grip.rotation.x = Math.PI / 2; g.add(grip);
    g.add(mesh(new THREE.SphereGeometry(0.4, 12, 10), lib().gold, 0, 0, -5.8)); // pommel
    g.scale.setScalar(scale);
    world.add(g);
    world.cyl(x, z, 0.7 * scale, y - 0.5, y + 1);
    return g;
  };

  // ---------- tomb of Alfonso: black marble effigy on a plinth ----------
  P.tomb = function (world, x, z, ang, material) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ang || 0;
    const marb = material || lib().marbleTomb;
    // plinth
    g.add(mesh(new THREE.BoxGeometry(3.4, 1.1, 6.4), marb, 0, 0.55, 0));
    g.add(mesh(new THREE.BoxGeometry(3.8, 0.3, 6.8), marb, 0, 1.2, 0));
    // recumbent effigy (a knight, hands crossed): a lathe-turned body under
    // a drape instead of the old stacked boxes — the silhouette swells and
    // narrows like a figure in stone
    const eff = new THREE.Group(); eff.position.set(0, 1.35, 0);
    const V2 = (x, y) => new THREE.Vector2(x, y);
    const bodyProf = [
      V2(0.02, 0.0),  V2(0.30, 0.12), V2(0.26, 0.55),  // feet, ankles
      V2(0.36, 1.20), V2(0.46, 1.90),                  // calves, thighs
      V2(0.54, 2.35), V2(0.47, 2.75),                  // hips, waist
      V2(0.58, 3.25), V2(0.53, 3.70),                  // chest, shoulders
      V2(0.20, 3.95), V2(0.02, 4.05)                   // neck, crown-end
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProf, 20);
    bodyGeo.rotateX(-Math.PI / 2);  // lay the figure along -Z (head at -Z)
    bodyGeo.scale(1.15, 0.52, 1);   // flatten against the slab
    const body = mesh(bodyGeo, marb, 0, 0.28, 2.05);
    eff.add(body);
    // drape over the legs: an open half-shell falling to the slab
    const drapeMat = marb.clone(); drapeMat.side = THREE.DoubleSide;
    const drapeGeo = new THREE.CylinderGeometry(0.68, 0.72, 2.3, 14, 1, true, 0, Math.PI);
    drapeGeo.rotateZ(Math.PI / 2); drapeGeo.rotateY(Math.PI / 2); // trough → shell over the body
    drapeGeo.scale(1, 0.55, 1);
    const drape = mesh(drapeGeo, drapeMat, 0, 0.32, 1.1);
    eff.add(drape);
    eff.add(mesh(new THREE.SphereGeometry(0.42, 16, 12), marb, 0, 0.42, -2.3)); // head on a stone pillow
    eff.add(mesh(new THREE.BoxGeometry(1.0, 0.22, 0.6), marb, 0, 0.18, -2.35)); // pillow
    eff.add(mesh(new THREE.BoxGeometry(1.15, 0.22, 1.0), marb, 0, 0.62, -0.7)); // crossed arms over the chest
    g.add(eff);
    world.add(g);
    world.box(x, z, 3.8, 6.8, 0, 2);
    g.userData.effigy = eff;
    return g;
  };

  // ---------- portrait ----------
  // Painted panel of a figure. kind: 'alfonso' (noble knight) or 'grandsire'.
  P.portrait = function (world, x, y, z, ang, kind, w = 2.2, h = 3.4) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ang || 0;
    // frame
    const frameMat = lib().gold;
    const fr = 0.22;
    g.add(mesh(new THREE.BoxGeometry(w + fr * 2, fr, 0.25), frameMat, 0, h / 2 + fr / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(w + fr * 2, fr, 0.25), frameMat, 0, -h / 2 - fr / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(fr, h + fr * 2, 0.25), frameMat, -w / 2 - fr / 2, 0, 0));
    g.add(mesh(new THREE.BoxGeometry(fr, h + fr * 2, 0.25), frameMat, w / 2 + fr / 2, 0, 0));
    // painting
    const tex = paintPortrait(kind);
    const canvasMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const panel = mesh(new THREE.PlaneGeometry(w, h), canvasMat, 0, 0, 0.13, { cast: false });
    g.add(panel);
    world.add(g);
    g.userData.panel = panel;
    return g;
  };

  function paintPortrait(kind) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 768;
    const ctx = c.getContext('2d');
    // dark ground
    const bg = ctx.createRadialGradient(256, 300, 40, 256, 384, 500);
    if (kind === 'grandsire') { bg.addColorStop(0, '#4a3c2a'); bg.addColorStop(1, '#140f0a'); }
    else { bg.addColorStop(0, '#3a4a5e'); bg.addColorStop(1, '#0c1018'); }
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 768);
    // cloak
    ctx.fillStyle = kind === 'grandsire' ? '#5a1518' : '#2a3d55';
    ctx.beginPath(); ctx.moveTo(256, 300); ctx.lineTo(120, 768); ctx.lineTo(392, 768); ctx.closePath(); ctx.fill();
    // armor torso (for alfonso) / robe
    if (kind === 'alfonso') {
      ctx.fillStyle = '#8b93a0';
      ctx.beginPath(); ctx.ellipse(256, 430, 95, 130, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9cfd8'; ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(256 + i * 30, 340); ctx.lineTo(256 + i * 24, 540); ctx.stroke(); }
      // gorget
      ctx.fillStyle = '#c9a227'; ctx.beginPath(); ctx.ellipse(256, 330, 60, 22, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#3a2b1a';
      ctx.beginPath(); ctx.ellipse(256, 440, 100, 150, 0, 0, Math.PI * 2); ctx.fill();
    }
    // face (shadowed, noble)
    const skin = kind === 'grandsire' ? '#c9a884' : '#d8bd9a';
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(256, 250, 52, 64, 0, 0, Math.PI * 2); ctx.fill();
    // hair
    ctx.fillStyle = kind === 'grandsire' ? '#5a5048' : '#241b12';
    ctx.beginPath(); ctx.ellipse(256, 210, 58, 46, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(220, 250, 16, 44, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(292, 250, 16, 44, -0.3, 0, Math.PI * 2); ctx.fill();
    // shadow modelling
    ctx.fillStyle = 'rgba(20,12,8,0.28)';
    ctx.beginPath(); ctx.ellipse(292, 262, 26, 50, -0.15, 0, Math.PI * 2); ctx.fill();
    // eyes (grave)
    ctx.fillStyle = '#2a2018';
    ctx.beginPath(); ctx.ellipse(236, 250, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(276, 250, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    // nose + mouth
    ctx.strokeStyle = 'rgba(60,40,28,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(256, 252); ctx.lineTo(252, 282); ctx.lineTo(262, 286); ctx.stroke();
    ctx.strokeStyle = 'rgba(90,40,34,0.7)';
    ctx.beginPath(); ctx.moveTo(240, 300); ctx.quadraticCurveTo(256, 308, 272, 300); ctx.stroke();
    // aged varnish vignette
    const vg = ctx.createRadialGradient(256, 300, 120, 256, 384, 470);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,12,6,0.7)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, 512, 768);
    // craquelure
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
    const r = OTR.rng(kind === 'alfonso' ? 5 : 9);
    for (let i = 0; i < 120; i++) {
      ctx.beginPath(); const x = r() * 512, y = r() * 768;
      ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  P.paintPortrait = paintPortrait;

  // ---------- trees & rocks (forest) ----------
  // bright: foliage lightness (day ~0.34, night ~0.12). hue/sat also tuned.
  // Foliage is real geometry (noise-displaced icosahedron lobes), not camera
  // billboards: it takes light, fog, shadows and SSAO like everything else,
  // and holds its silhouette when the player walks past.
  function foliageLobe(radius, seed) {
    const geo = new THREE.IcosahedronGeometry(radius, 2);
    const pos = geo.attributes.position;
    // coherent noise displacement (neighbouring vertices move together) so
    // the lobe goes lumpy like a crown, not crumpled like foil
    const s = (seed % 100) * 0.37;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = 0.88 + 0.28 * OTR.fbm((x + z) * 0.55 / radius + s, (y + z * 0.5) * 0.55 / radius - s, 2);
      pos.setXYZ(i, x * k, y * 0.78 * k, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  }
  P.tree = function (world, x, z, scale = 1, groundY = 0, bright = 0.34) {
    const g = new THREE.Group(); g.position.set(x, groundY, z);
    const h = (5 + Math.random() * 3) * scale;
    const trunk = mesh(new THREE.CylinderGeometry(0.15 * scale, 0.42 * scale, h, 7), lib().wood, 0, h / 2, 0);
    trunk.rotation.z = (Math.random() - 0.5) * 0.15;
    g.add(trunk);
    // a couple of boughs reaching into the crown
    const boughs = 2 + (Math.random() * 2 | 0);
    for (let i = 0; i < boughs; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = mesh(new THREE.CylinderGeometry(0.05 * scale, 0.12 * scale, h * 0.5, 5), lib().wood,
        Math.cos(a) * 0.5 * scale, h * (0.55 + Math.random() * 0.15), Math.sin(a) * 0.5 * scale);
      b.rotation.z = Math.cos(a) * 0.7; b.rotation.x = -Math.sin(a) * 0.7;
      g.add(b);
    }
    const night = bright < 0.2;
    const clusters = 5 + (Math.random() * 3 | 0);
    for (let i = 0; i < clusters; i++) {
      // first lobe sits centred and large so the crown has no see-through core
      const central = i === 0;
      const cs = (central ? 2.3 : 1.6 + Math.random() * 1.2) * scale;
      const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
      if (night) {
        const v = 0.05 + Math.random() * 0.05;
        mat.color.setRGB(v * 0.7, v, v * 0.9);
      } else {
        mat.color.setHSL(0.24 + Math.random() * 0.06, 0.42, bright + Math.random() * 0.06);
      }
      const lobe = mesh(foliageLobe(cs, (x * 13 + z * 7 + i * 31) | 0 || 1), mat,
        central ? 0 : (Math.random() - 0.5) * 2.0 * scale,
        h * (central ? 0.86 : 0.72 + Math.random() * 0.35),
        central ? 0 : (Math.random() - 0.5) * 2.0 * scale);
      g.add(lobe);
    }
    world.add(g);
    world.cyl(x, z, 0.4 * scale, groundY, groundY + h);
    return g;
  };

  // ---------- instanced grass ----------
  // A field of crossed alpha-tested blade cards with a simple wind sway,
  // one draw call. area: {x0,x1,z0,z1}; skip: optional (x,z)=>bool to keep
  // paths/buildings clear. Blades follow world.groundHeight.
  P.grassField = function (world, area, count, opts = {}) {
    const lib_ = lib();
    if (!lib_.grassBladeTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const rnd = OTR.rng(77);
      for (let i = 0; i < 13; i++) {
        const bx = 5 + rnd() * 54, top = 6 + rnd() * 16, w = 3.5 + rnd() * 3;
        const lean = (rnd() - 0.5) * 12;
        const g0 = 95 + rnd() * 70;
        ctx.fillStyle = `rgb(${g0 * 0.55 | 0},${g0 | 0},${g0 * 0.42 | 0})`;
        ctx.beginPath();
        ctx.moveTo(bx - w, 64); ctx.quadraticCurveTo(bx - w * 0.4 + lean, 34, bx + lean, top);
        ctx.quadraticCurveTo(bx + w * 0.4 + lean, 34, bx + w, 64);
        ctx.closePath(); ctx.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      lib_.grassBladeTex = t;
    }
    const bladeH = opts.height || 0.5, bladeW = opts.width || 0.6;
    const plane = new THREE.PlaneGeometry(bladeW, bladeH);
    plane.translate(0, bladeH / 2, 0);
    // crossed pair merged by hand (BufferGeometryUtils lives in three's
    // examples, not the vendored core build)
    const p2 = plane.clone().rotateY(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const a = plane.attributes[name], b = p2.attributes[name];
      const arr = new Float32Array(a.array.length + b.array.length);
      arr.set(a.array, 0); arr.set(b.array, a.array.length);
      geo.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    const ia = plane.index.array, ib = p2.index.array, vtx = plane.attributes.position.count;
    const idx = new Uint16Array(ia.length + ib.length);
    idx.set(ia, 0);
    for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + vtx;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshStandardMaterial({
      map: lib_.grassBladeTex, alphaTest: 0.22, side: THREE.DoubleSide,
      roughness: 1, metalness: 0, color: opts.color || 0xffffff
    });
    const timeU = { value: 0 };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeU;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float otrPhase = instanceMatrix[3][0] * 2.7 + instanceMatrix[3][2] * 3.3;
          transformed.xz += vec2(sin(uTime * 1.7 + otrPhase), cos(uTime * 1.3 + otrPhase))
                            * (position.y * ${(0.14).toFixed(2)});`);
    };
    mat.customProgramCacheKey = () => 'otr-grass';
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.castShadow = false; inst.receiveShadow = true;
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
    let placed = 0;
    for (let tries = 0; tries < count * 4 && placed < count; tries++) {
      const x = area.x0 + Math.random() * (area.x1 - area.x0);
      const z = area.z0 + Math.random() * (area.z1 - area.z0);
      if (opts.skip && opts.skip(x, z)) continue;
      const y = world.groundHeight(x, z) + (opts.yOffset || 0);
      E.set(0, Math.random() * Math.PI, 0);
      Q.setFromEuler(E);
      const s = 0.6 + Math.random() * 0.8;
      S.set(s, s * (0.7 + Math.random() * 0.6), s);
      M4.compose(new THREE.Vector3(x, y, z), Q, S);
      inst.setMatrixAt(placed++, M4);
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    world.add(inst);
    world.addUpdater((dt, e) => { timeU.value = e; });
    return inst;
  };

  P.rock = function (world, x, z, scale = 1, groundY = 0, material) {
    const geo = new THREE.DodecahedronGeometry(scale, 1);
    const pos = geo.attributes.position;
    const r = OTR.rng((x * 31 + z * 17) | 0 || 1);
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) * (0.8 + r() * 0.5), pos.getY(i) * (0.7 + r() * 0.4), pos.getZ(i) * (0.8 + r() * 0.5));
    }
    geo.computeVertexNormals();
    const m = mesh(geo, material || lib().rock, x, groundY + scale * 0.4, z);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    world.add(m);
    world.cyl(x, z, scale * 0.8, groundY, groundY + scale);
    return m;
  };

  // ---------- ground mist ----------
  // Layered translucent noise planes that drift slowly — reads as low fog
  // crawling over vault floors / the forest floor. Visual only; on layer 1
  // so the SSAO depth prepass ignores it.
  P.mist = function (world, area, y = 0.4, opts = {}) {
    const lib_ = lib();
    if (!lib_.mistTex) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const ctx = c.getContext('2d');
      const rnd = OTR.rng(23);
      for (let i = 0; i < 120; i++) {
        const x = rnd() * 256, yy = rnd() * 256, r = 18 + rnd() * 46;
        const g = ctx.createRadialGradient(x, yy, 1, x, yy, r);
        const a = 0.05 + rnd() * 0.07;
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        // draw wrapped so the texture tiles without seams
        for (const ox of [0, -256, 256]) for (const oy of [0, -256, 256])
          ctx.fillRect(x - r + ox, yy - r + oy, r * 2, r * 2);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      lib_.mistTex = t;
    }
    const w = area.x1 - area.x0, d = area.z1 - area.z0;
    const cx = (area.x0 + area.x1) / 2, cz = (area.z0 + area.z1) / 2;
    const color = opts.color != null ? opts.color : 0xaab4cc;
    const layers = opts.layers || 3;
    const mats = [];
    for (let i = 0; i < layers; i++) {
      const map = lib_.mistTex.clone();
      map.needsUpdate = true;
      map.repeat.set(Math.max(1, w / 30), Math.max(1, d / 30));
      const mat = new THREE.MeshBasicMaterial({
        map, color, transparent: true, depthWrite: false,
        opacity: (opts.opacity != null ? opts.opacity : 0.16) * (1 - i * 0.22)
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, y + i * (opts.gap || 0.35), cz);
      m.renderOrder = 4;
      m.layers.set(1);
      world.add(m);
      mats.push({ map, sx: 0.006 * (i + 1) * (i % 2 ? 1 : -1), sz: 0.004 * (i + 1) });
    }
    world.addUpdater((dt) => {
      for (const rec of mats) { rec.map.offset.x += rec.sx * dt; rec.map.offset.y += rec.sz * dt; }
    });
  };

  // ---------- torch bracket (wall-mounted, non-colliding) ----------
  P.wallTorch = function (world, x, y, z, ang, opts = {}) {
    const ux = Math.cos(ang), uz = -Math.sin(ang);
    const bracket = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), lib().darkIron, x + ux * 0.25, y, z + uz * 0.25);
    // negative tilt leans the bracket's tip AWAY from the wall (out along +ux)
    bracket.rotation.z = -Math.PI / 2 * 0.6; bracket.rotation.y = ang;
    world.add(bracket);
    // soot stain rising up the wall — years of the same torch burning here
    const soot = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.7),
      new THREE.MeshBasicMaterial({
        map: lib().sootTex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.85
      })
    );
    soot.position.set(x + ux * 0.03, y + 1.15, z + uz * 0.03);
    soot.rotation.y = ang;
    soot.renderOrder = 1;
    world.add(soot);
    // seat the fire on the bracket's tip (≈0.53 out, 0.21 up from the mount)
    // instead of floating half a metre above it
    return world.torch(x + ux * 0.55, y + 0.05, z + uz * 0.55, Object.assign({ intensity: 2.4, distance: 11 }, opts));
  };

  // ---------- simple door (swings open) ----------
  P.door = function (world, x, z, ang, w, h, material, opts = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ang;
    const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, 0);
    const panel = mesh(new THREE.BoxGeometry(w, h, 0.16), material || lib().planks, w / 2, h / 2, 0);
    // iron studs
    for (let i = 0; i < 6; i++) {
      const stud = mesh(new THREE.SphereGeometry(0.06, 8, 6), lib().darkIron, w * (0.2 + 0.6 * Math.random()), h * (0.15 + 0.7 * Math.random()), 0.09);
      panel.add(stud);
    }
    hinge.add(panel); g.add(hinge); world.add(g);
    const col = world.cyl(x, z, 0.5, 0, h); // blocks while closed
    g.userData = { hinge, col, open: false };
    g.open = function () {
      if (g.userData.open) return; g.userData.open = true;
      // remove collider by shrinking it away
      col.r = 0.01; col.x = 9999; col.z = 9999;
      const start = performance.now();
      function anim() {
        const t = Math.min(1, (performance.now() - start) / 700);
        hinge.rotation.y = -OTR.smoothstep(0, 1, t) * Math.PI * 0.62;
        if (t < 1) requestAnimationFrame(anim);
      }
      anim();
      OTR.audio.footstep && OTR.audio.footstep(false);
    };
    return g;
  };

  // ---------- banner / tapestry ----------
  P.banner = function (world, x, y, z, ang, color) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ang;
    const mat = new THREE.MeshStandardMaterial({ color: color || 0x6a1220, roughness: 0.9, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1.6, 3.2, 1, 8);
    const cloth = mesh(geo, mat, 0, -1.6, 0, { cast: false });
    g.add(cloth);
    // simple emblem
    g.add(mesh(new THREE.RingGeometry(0.3, 0.42, 16), lib().gold, 0, -1.4, 0.03, { cast: false }));
    world.add(g);
    const base = geo.attributes.position.array.slice();
    world.addUpdater((dt, e) => {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < geo.attributes.position.count; i++) {
        const yy = base[i * 3 + 1];
        arr[i * 3 + 2] = Math.sin(e * 1.5 + yy) * 0.12 * (1 - (yy + 3.2) / 3.2);
      }
      geo.attributes.position.needsUpdate = true;
    });
    return g;
  };

  // ---------- stairs ----------
  P.stairs = function (world, x, z, ang, steps, stepW, stepH, stepD, material) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ang;
    for (let i = 0; i < steps; i++) {
      const s = mesh(new THREE.BoxGeometry(stepW, stepH, stepD), material, 0, stepH / 2 + i * stepH, -i * stepD);
      g.add(s);
    }
    world.add(g);
    return g;
  };

})(window.OTR);
