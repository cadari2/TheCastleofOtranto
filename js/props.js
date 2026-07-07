/* props.js — reusable architecture & object builders. Each takes the World
   and adds meshes (and, where solid, colliders). Geometry is detailed enough
   to avoid a "low-poly" read: arches, vaults, mouldings, crenellations. */
'use strict';
(function (OTR) {

  const lib = () => OTR.materials.lib;
  const P = OTR.props = {};

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
      const plH = Math.min(1.5, height * 0.2);
      const plinth = mesh(new THREE.BoxGeometry(thick * 1.35, plH, len), material, cx, baseY + plH / 2, cz);
      plinth.rotation.y = ang;
      world.add(plinth);
      const ux = Math.cos(ang), uz = -Math.sin(ang); // wall-face normal
      for (const side of [-1, 1]) { // chamfered wash atop the plinth
        const wash = mesh(new THREE.BoxGeometry(0.26, 0.09, len), material,
          cx + ux * side * (thick * 0.62), baseY + plH + 0.02, cz + uz * side * (thick * 0.62));
        wash.rotation.y = ang;
        wash.rotation.z = side * 0.9;
        world.add(wash);
      }
      const scH = 0.24;
      const course = mesh(new THREE.BoxGeometry(thick * 1.2, scH, len), material, cx, baseY + height * 0.66, cz);
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

  P.crenellations = function (world, x0, z0, x1, z1, topY, thick, material) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const ang = Math.atan2(dx, dz);
    const merlonW = 0.7, gap = 0.5, step = merlonW + gap, h = 0.8;
    const n = Math.floor(len / step);
    const startOff = (len - n * step) / 2;
    for (let i = 0; i < n; i++) {
      const d = startOff + i * step + merlonW / 2;
      const x = x0 + ux * d, z = z0 + uz * d;
      const geo = new THREE.BoxGeometry(thick, h, merlonW);
      const m = mesh(geo, material, x, topY + h / 2, z);
      m.rotation.y = ang;
      world.add(m);
      // slightly proud cap so each merlon catches a highlight edge
      const cap = mesh(new THREE.BoxGeometry(thick * 1.16, 0.14, merlonW * 1.16), material, x, topY + h + 0.07, z);
      cap.rotation.y = ang;
      world.add(cap);
    }
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
    // semicircular arch made of voussoir boxes. The voussoirs are sized to the
    // arc spacing (with overlap) and packed densely enough that they read as a
    // continuous stone arch rather than a ring of floating blocks.
    const arcR = width / 2 + legW / 2;
    const segs = Math.max(11, Math.round(arcR * 4));
    const voussoirW = (Math.PI * arcR / segs) * 1.6; // tangential, overlaps its neighbours
    for (let i = 0; i <= segs; i++) {
      const a = Math.PI * (i / segs);
      const vx = -Math.cos(a) * arcR;
      const vy = height + Math.sin(a) * arcR;
      const box = new THREE.BoxGeometry(voussoirW, 0.55, depth);
      const vm = mesh(box, material, vx, vy, 0);
      vm.rotation.z = a - Math.PI / 2;
      g.add(vm);
    }
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
    // crenellation ring
    const merlons = 16;
    for (let i = 0; i < merlons; i++) {
      const a = (i / merlons) * Math.PI * 2;
      const mx = Math.cos(a) * radius, mz = Math.sin(a) * radius;
      const box = new THREE.BoxGeometry(0.6, 0.9, 0.5);
      const m = mesh(box, material, mx, height + 0.45, mz);
      m.rotation.y = -a;
      g.add(m);
    }
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
    // visor slits
    const slitMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 });
    for (let i = 0; i < 2; i++) {
      const s = mesh(new THREE.BoxGeometry(2.4, 0.14, 0.2), slitMat, 0, 0.9 - i * 0.4, 1.75);
      g.add(s);
    }
    // brim
    g.add(mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.25, 24), steel, 0, -1.0, 0));
    // black plumes (sable feathers): a crest of curved quills that spring from
    // the crown, rise, and droop at the tips — a flowing plume, not a spike-ball.
    const plumeMat = new THREE.MeshStandardMaterial({ color: 0x151119, roughness: 0.82, metalness: 0.08, side: THREE.DoubleSide });
    const N = 46;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const rr = 0.1 + Math.random() * 0.55;           // where it roots on the crown
      const len = 2.8 + Math.random() * 2.6;
      const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
      // outward lean grows with root radius so inner feathers stand tall and
      // outer ones sweep wide; every feather droops back down at the tip.
      const lean = 0.25 + rr * 1.1 + Math.random() * 0.2;
      const ox = Math.cos(a), oz = Math.sin(a);
      // Curve is built relative to the feather's root so the quill can sway
      // about where it springs from the crown.
      const p0 = new THREE.Vector3(0, 0, 0);
      const p1 = new THREE.Vector3(ox * len * 0.45 * lean, len * 0.62, oz * len * 0.45 * lean);
      const p2 = new THREE.Vector3(ox * len * (0.7 + lean * 0.5), len * 0.72 - len * 0.28, oz * len * (0.7 + lean * 0.5));
      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      const tube = new THREE.TubeGeometry(curve, 12, 0.12, 6, false);
      const feather = new THREE.Group();
      feather.position.set(bx, 3.0, bz);
      const pl = new THREE.Mesh(tube, plumeMat);
      pl.castShadow = false; // 46 quills in the shadow pass isn't worth it; the dome casts
      feather.add(pl);
      g.add(feather);
      feather.userData.baseRot = { a, phase: Math.random() * Math.PI * 2 };
    }
    g.scale.setScalar(scale);
    world.add(g);
    // gentle plume sway updater — each feather nods from its root
    world.addUpdater((dt, e) => {
      g.children.forEach(c => {
        if (c.userData.baseRot) {
          const b = c.userData.baseRot;
          c.rotation.x = Math.sin(e * 1.1 + b.phase) * 0.05;
          c.rotation.z = Math.cos(e * 0.9 + b.phase) * 0.05;
        }
      });
    });
    if (world) world.cyl(x, z, 2.2 * scale, y, y + 6 * scale);
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
    const blade = mesh(new THREE.BoxGeometry(0.6, 0.16, 9), steel, 0, 0, 1.5);
    // taper the tip
    const tip = mesh(new THREE.ConeGeometry(0.32, 1.2, 4), steel, 0, 0, 6.6);
    tip.rotation.x = Math.PI / 2; tip.rotation.y = Math.PI / 4;
    g.add(blade); g.add(tip);
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
    // recumbent effigy (a knight, hands crossed) — stylized blocky forms
    const eff = new THREE.Group(); eff.position.set(0, 1.5, 0);
    eff.add(mesh(new THREE.BoxGeometry(1.3, 0.5, 4.4), marb, 0, 0.3, 0)); // body
    eff.add(mesh(new THREE.SphereGeometry(0.5, 16, 12), marb, 0, 0.5, -2.3)); // head
    eff.add(mesh(new THREE.BoxGeometry(1.5, 0.25, 1.2), marb, 0, 0.55, 0.2)); // crossed arms
    // feet
    eff.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 0.7), marb, 0, 0.35, 2.4));
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

  // ---------- torch bracket (wall-mounted, non-colliding) ----------
  P.wallTorch = function (world, x, y, z, ang, opts = {}) {
    const ux = Math.cos(ang), uz = -Math.sin(ang);
    const bracket = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), lib().darkIron, x + ux * 0.25, y, z + uz * 0.25);
    bracket.rotation.z = Math.PI / 2 * 0.6; bracket.rotation.y = ang;
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
    return world.torch(x + ux * 0.55, y + 0.35, z + uz * 0.55, Object.assign({ intensity: 2.4, distance: 11 }, opts));
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
