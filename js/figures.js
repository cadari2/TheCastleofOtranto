/* figures.js — stylized human figures. Deliberately hooded/cloaked/armored
   with shadowed or averted faces: right for 1764 Gothic, and it sidesteps the
   uncanny-valley of procedural realistic faces. Each figure is a Group with
   helpers: faceTo(x,z), setIdle(), walkTo(...), and an optional collider. */
'use strict';
(function (OTR) {

  const lib = () => OTR.materials.lib;
  const F = OTR.figures = {};

  function robeMaterial(color, rough = 0.95) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.0 });
  }
  function steelMaterial(color) {
    return new THREE.MeshStandardMaterial({ color: color || 0x565b66, roughness: 0.42, metalness: 0.88 });
  }
  const V2 = (x, y) => new THREE.Vector2(x, y);

  // A lathe-turned robe profile: flared hem, nipped waist, filled chest and
  // shoulders, tapering to a neck — then a subtle cloth-fold undulation is
  // pressed into the skirt so the cloth hangs in gathers instead of
  // revolving perfectly. Returns a BufferGeometry.
  function robeGeometry(H) {
    const R = 0.44; // hem radius
    const p = [
      V2(0.00, 0.00),          // closed base at the floor
      V2(R * 0.96, 0.015),
      V2(R, 0.10),             // hem outer
      V2(R * 0.90, H * 0.22),
      V2(R * 0.88, H * 0.30),  // skirt
      V2(R * 0.70, H * 0.44),
      V2(R * 0.60, H * 0.50),  // waist
      V2(R * 0.66, H * 0.56),
      V2(R * 0.78, H * 0.64),  // chest
      V2(R * 0.80, H * 0.71),  // shoulders (widest of the torso)
      V2(R * 0.52, H * 0.78),  // shoulder slope
      V2(R * 0.30, H * 0.82),
      V2(0.16, H * 0.85),      // neck
      V2(0.13, H * 0.87),
    ];
    const geo = new THREE.LatheGeometry(p, 28);
    // cloth folds: gentle radial gathers, strongest at the hem, fading out
    // by the waist so the torso stays clean
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 0.02) continue;
      const a = Math.atan2(z, x);
      const fade = OTR.clamp(1 - y / (H * 0.5), 0, 1);
      const fold = 1 + (0.045 * Math.sin(a * 7) + 0.02 * Math.sin(a * 3 + 1.1)) * fade;
      pos.setX(i, x * fold); pos.setZ(i, z * fold);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Build a cloaked figure. opts: {color, height, hood, armor, torch, face}
  F.make = function (world, x, z, opts = {}) {
    const g = new THREE.Group();
    const groundY = world.groundHeight(x, z);
    g.position.set(x, groundY, z);
    const H = opts.height || 1.75;
    const col = opts.color || 0x2a2530;

    const robe = robeMaterial(col);
    const dark = robeMaterial(new THREE.Color(col).multiplyScalar(0.62));
    const darker = robeMaterial(new THREE.Color(col).multiplyScalar(0.4));

    // ---- body: the turned robe ----
    const body = mkMesh(robeGeometry(H), robe, 0, 0, 0);
    body.material.side = THREE.DoubleSide;
    g.add(body);

    // shoulder mantle / capelet draping over the upper body
    const mantle = mkMesh(new THREE.CylinderGeometry(0.20, 0.42, H * 0.30, 20, 1, true), dark, 0, H * 0.60, 0);
    mantle.material.side = THREE.DoubleSide;
    g.add(mantle);
    // a collar roll at the neck of the mantle
    g.add(mkMesh(new THREE.TorusGeometry(0.15, 0.05, 8, 16), dark, 0, H * 0.78, 0, { rotX: Math.PI / 2 }));

    // ---- neck + head ----
    const skinMat = robeMaterial(opts.faceColor || 0xc9ad8a, 0.72);
    g.add(mkMesh(new THREE.CylinderGeometry(0.075, 0.09, H * 0.08, 10), skinMat, 0, H * 0.85, 0));
    const head = mkMesh(new THREE.SphereGeometry(0.125, 18, 14), skinMat, 0, H * 0.93, 0);
    head.scale.set(0.92, 1.08, 0.98); // slightly ovoid, human
    g.add(head);

    // hood shadowing the face (most non-armoured figures)
    if (opts.hood !== false) {
      // cowl: a cone that sits over the crown and drapes to the shoulders,
      // opened toward -Z... we model it as a full cowl and cut the face with a
      // dark recess so the face reads as shadowed rather than blank.
      const cowl = mkMesh(new THREE.SphereGeometry(0.185, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.66), dark, 0, H * 0.94, 0);
      cowl.scale.set(1.05, 1.35, 1.12);
      cowl.position.z -= 0.015;
      cowl.material.side = THREE.DoubleSide; // interior depth: the inside of the cowl is visible past the rim
      g.add(cowl);
      // raised cowl rim around the face opening
      const rim = mkMesh(new THREE.TorusGeometry(0.15, 0.028, 8, 18), dark, 0, H * 0.945, 0.09);
      rim.rotation.x = 0.25;
      g.add(rim);
      // drape of the hood onto the back and shoulders
      const drape = mkMesh(new THREE.ConeGeometry(0.22, 0.34, 14, 1, true, Math.PI * 0.75, Math.PI * 1.5), dark, 0, H * 0.80, -0.05);
      drape.material.side = THREE.DoubleSide;
      g.add(drape);
      // dark recess of the face inside the hood, set deeper behind the rim
      const shadow = mkMesh(new THREE.SphereGeometry(0.125, 12, 10), new THREE.MeshBasicMaterial({ color: 0x0a0810 }), 0, H * 0.935, 0.035, { cast: false });
      shadow.scale.set(1, 1.15, 0.8);
      g.add(shadow);
    }

    // ---- belt with hanging trim (robed figures) ----
    if (!opts.armor) {
      const belt = mkMesh(new THREE.TorusGeometry(0.275, 0.024, 8, 20), darker, 0, H * 0.50, 0, { rotX: Math.PI / 2 });
      belt.scale.set(1, 1, 1.4); // thicker vertically once rotated flat
      g.add(belt);
      // hanging strap-end at the front
      g.add(mkMesh(new THREE.BoxGeometry(0.05, H * 0.13, 0.018), darker, 0.05, H * 0.435, 0.265));
    }

    // ---- armour plating (Manfred / Frederic / knights) ----
    if (opts.armor) {
      const steel = steelMaterial(opts.armorColor);
      const steelDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.armorColor || 0x565b66).multiplyScalar(0.7), roughness: 0.45, metalness: 0.9 });
      // breastplate — a fitted cuirass with a slight keel
      const cuirass = mkMesh(new THREE.CylinderGeometry(0.27, 0.31, H * 0.34, 18), steel, 0, H * 0.585, 0.01);
      cuirass.scale.set(1, 1, 0.82); g.add(cuirass);
      g.add(mkMesh(new THREE.SphereGeometry(0.12, 14, 8), steel, 0, H * 0.5, 0.15, { cast: false })); // keel ridge
      // fauld skirt of overlapping plates at the hips
      g.add(mkMesh(new THREE.CylinderGeometry(0.31, 0.36, H * 0.12, 18, 1, true), steelDark, 0, H * 0.42, 0));
      // gorget at the throat
      g.add(mkMesh(new THREE.TorusGeometry(0.135, 0.045, 8, 16), steel, 0, H * 0.78, 0, { rotX: Math.PI / 2 }));
      // pauldrons
      g.add(mkMesh(new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), steel, -0.30, H * 0.73, 0));
      g.add(mkMesh(new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), steel, 0.30, H * 0.73, 0));
      // helm: a rounded bascinet with a raised comb and a visor slit
      const helm = mkMesh(new THREE.SphereGeometry(0.155, 18, 14), steel, 0, H * 0.935, 0);
      helm.scale.set(0.96, 1.06, 1.04); g.add(helm);
      g.add(mkMesh(new THREE.BoxGeometry(0.04, 0.16, 0.30), steelDark, 0, H * 0.99, 0)); // comb
      g.add(mkMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.10, 16, 1, true), steelDark, 0, H * 0.885, 0)); // brow band
      const visor = mkMesh(new THREE.BoxGeometry(0.24, 0.035, 0.05), new THREE.MeshBasicMaterial({ color: 0x07060a }), 0, H * 0.925, 0.15, { cast: false });
      g.add(visor);
    }

    // ---- sleeved arms held slightly away from the robe ----
    // (upper arm + forearm in loose sleeves with visible cuffs, bent at the
    // elbow; armour keeps fitted steel arms instead of cloth sleeves)
    const armMat = opts.armor ? steelMaterial(opts.armorColor) : dark;
    function buildArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.27, H * 0.72, 0.02);
      const sleeved = !opts.armor;
      const upper = sleeved
        ? mkMesh(new THREE.CylinderGeometry(0.085, 0.068, H * 0.24, 10), armMat, 0, -H * 0.12, 0)
        : mkMesh(new THREE.CylinderGeometry(0.065, 0.058, H * 0.24, 9), armMat, 0, -H * 0.12, 0);
      shoulder.add(upper);
      const fore = new THREE.Group();
      fore.position.set(0, -H * 0.24, 0.01);
      const forearm = sleeved
        ? mkMesh(new THREE.CylinderGeometry(0.072, 0.058, H * 0.22, 10), armMat, 0, -H * 0.11, 0)
        : mkMesh(new THREE.CylinderGeometry(0.055, 0.05, H * 0.22, 9), armMat, 0, -H * 0.11, 0);
      fore.add(forearm);
      if (sleeved) { // cuff flare at the wrist
        fore.add(mkMesh(new THREE.CylinderGeometry(0.082, 0.06, H * 0.045, 10), darker, 0, -H * 0.21, 0));
      }
      // hand
      fore.add(mkMesh(new THREE.SphereGeometry(0.052, 10, 8), skinMat, 0, -H * 0.23, 0.01));
      fore.rotation.x = 0.35; // slight forward bend at the elbow
      shoulder.add(fore);
      // held away from the robe so the arm silhouette separates from the body
      shoulder.rotation.z = side * (sleeved ? 0.17 : 0.10);
      g.add(shoulder);
      return fore;
    }
    const larm = buildArm(-1);
    const rarm = buildArm(1);
    g.userData.rarm = rarm; g.userData.larm = larm;

    // held torch
    if (opts.torch) {
      const t = world.torch(0, 0, 0, { intensity: 2.0, distance: 9 });
      t.group.position.set(0.34, H * 0.52, 0.28);
      g.add(t.group);
      g.userData.torch = t;
    }

    // Shadow budget: a crowd of figures × ~12 sub-meshes each would flood the
    // shadow pass. Cast from the robe body only — that silhouette already reads
    // as the whole figure — and let the detail meshes skip the shadow map.
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    body.castShadow = true;

    world.add(g);

    // API
    g.userData.figure = true;
    g.faceTo = (tx, tz) => { g.rotation.y = Math.atan2(tx - g.position.x, tz - g.position.z); };
    g.facePlayer = () => g.faceTo(OTR.player.pos.x, OTR.player.pos.z);
    g.setCollider = (r = 0.4) => { g.userData.col = world.cyl(g.position.x, g.position.z, r, groundY, groundY + H); return g; };
    g.removeCollider = () => { if (g.userData.col) { g.userData.col.r = 0.01; g.userData.col.x = 99999; } };
    g.moveCollider = () => { if (g.userData.col) { g.userData.col.x = g.position.x; g.userData.col.z = g.position.z; } };

    // idle sway
    const swaySeed = Math.random() * 10;
    world.addUpdater((dt, e) => {
      if (g.userData.walking) return;
      g.position.y = groundY + Math.sin(e * 1.3 + swaySeed) * 0.01;
      body.rotation.z = Math.sin(e * 0.8 + swaySeed) * 0.02;
    });

    // walk to a point over time; returns promise
    g.walkTo = function (tx, tz, speed = 1.4) {
      return new Promise((resolve) => {
        g.userData.walking = true;
        g.faceTo(tx, tz);
        const step = () => {
          // stop if the chapter that owns this figure has been torn down
          if (world.disposed) { g.userData.walking = false; resolve(); return; }
          const dx = tx - g.position.x, dz = tz - g.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.08) { g.userData.walking = false; resolve(); return; }
          const s = Math.min(d, speed * 0.016);
          g.position.x += dx / d * s; g.position.z += dz / d * s;
          g.position.y = world.groundHeight(g.position.x, g.position.z) + Math.abs(Math.sin(performance.now() / 120)) * 0.03;
          g.moveCollider();
          requestAnimationFrame(step);
        };
        step();
      });
    };

    return g;
  };

  function mkMesh(geo, mat, x, y, z, opts) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (opts && opts.rotX) m.rotation.x = opts.rotX;
    m.castShadow = !opts || opts.cast !== false;
    m.receiveShadow = false;
    return m;
  }

  // Presets keyed to the novel's cast
  F.manfred = (world, x, z) => F.make(world, x, z, { color: 0x3a1518, armor: true, armorColor: 0x4a4048, height: 1.82, hood: false });
  F.theodoreGhostly = (world, x, z) => F.make(world, x, z, { color: 0x9099a8, height: 1.78 });
  F.isabella = (world, x, z) => F.make(world, x, z, { color: 0x3d4a6a, faceColor: 0xd8bd9a, height: 1.66 });
  F.matilda = (world, x, z) => F.make(world, x, z, { color: 0x5a4a66, faceColor: 0xd8bd9a, height: 1.66 });
  F.jerome = (world, x, z) => F.make(world, x, z, { color: 0x2b2620, height: 1.74 }); // friar
  F.frederic = (world, x, z) => F.make(world, x, z, { color: 0x2a3d2a, armor: true, armorColor: 0x606672, height: 1.8, hood: false });
  F.guard = (world, x, z) => F.make(world, x, z, { color: 0x2a2622, armor: true, armorColor: 0x50535c, height: 1.76, hood: false, torch: true });
  F.peasant = (world, x, z) => F.make(world, x, z, { color: 0x4a3a28, faceColor: 0xc9ad8a, height: 1.72 });

})(window.OTR);
