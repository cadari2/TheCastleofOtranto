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

  // Build a cloaked figure. opts: {color, height, hood, armor, torch, face}
  F.make = function (world, x, z, opts = {}) {
    const g = new THREE.Group();
    const groundY = world.groundHeight(x, z);
    g.position.set(x, groundY, z);
    const H = opts.height || 1.75;
    const col = opts.color || 0x2a2530;

    const robe = robeMaterial(col);
    const dark = robeMaterial(new THREE.Color(col).multiplyScalar(0.6));

    // body: tapered robe (cone-ish) so it reads as a standing figure in cloth
    const bodyGeo = new THREE.CylinderGeometry(0.19, 0.42, H * 0.72, 14, 1, true);
    const body = mkMesh(bodyGeo, robe, 0, H * 0.36, 0);
    body.material.side = THREE.DoubleSide;
    g.add(body);
    // shoulders / mantle
    g.add(mkMesh(new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), dark, 0, H * 0.72, 0));

    // head
    const headMat = robeMaterial(opts.faceColor || 0xc9ad8a, 0.7);
    const head = mkMesh(new THREE.SphereGeometry(0.135, 16, 12), headMat, 0, H * 0.9, 0);
    g.add(head);

    // hood shadowing the face (most figures)
    if (opts.hood !== false) {
      const hood = mkMesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.72), dark, 0, H * 0.9, 0);
      hood.scale.set(1, 1.2, 1.05);
      hood.position.z -= 0.02;
      g.add(hood);
      // dark inside of hood over the face
      const shadow = mkMesh(new THREE.CircleGeometry(0.12, 14), new THREE.MeshBasicMaterial({ color: 0x0a0810 }), 0, H * 0.9, 0.13, { cast: false });
      g.add(shadow);
    }

    // armor plating option (Manfred/Frederic/knights)
    if (opts.armor) {
      const steel = new THREE.MeshStandardMaterial({ color: opts.armorColor || 0x565b66, roughness: 0.5, metalness: 0.85 });
      g.add(mkMesh(new THREE.CylinderGeometry(0.3, 0.34, H * 0.4, 14), steel, 0, H * 0.55, 0)); // cuirass
      g.add(mkMesh(new THREE.SphereGeometry(0.16, 14, 10), steel, 0, H * 0.9, 0)); // helm over head
      // helm brim / visor
      const visor = mkMesh(new THREE.BoxGeometry(0.28, 0.05, 0.14), new THREE.MeshBasicMaterial({ color: 0x08070a }), 0, H * 0.9, 0.14, { cast: false });
      g.add(visor);
      // pauldrons
      g.add(mkMesh(new THREE.SphereGeometry(0.13, 12, 8), steel, -0.28, H * 0.72, 0));
      g.add(mkMesh(new THREE.SphereGeometry(0.13, 12, 8), steel, 0.28, H * 0.72, 0));
    }

    // arms (simple)
    const armMat = opts.armor ? new THREE.MeshStandardMaterial({ color: opts.armorColor || 0x565b66, roughness: 0.5, metalness: 0.8 }) : robe;
    const larm = mkMesh(new THREE.CylinderGeometry(0.07, 0.09, H * 0.42, 8), armMat, -0.3, H * 0.55, 0.02);
    larm.rotation.z = 0.2; g.add(larm);
    const rarm = mkMesh(new THREE.CylinderGeometry(0.07, 0.09, H * 0.42, 8), armMat, 0.3, H * 0.55, 0.02);
    rarm.rotation.z = -0.2; g.add(rarm);
    g.userData.rarm = rarm; g.userData.larm = larm;

    // held torch
    if (opts.torch) {
      const t = world.torch(0, 0, 0, { intensity: 2.0, distance: 9 });
      t.group.position.set(0.42, H * 0.62, 0.2);
      g.add(t.group);
      g.userData.torch = t;
    }

    // hem line
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
