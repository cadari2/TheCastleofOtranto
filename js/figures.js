/* figures.js — stylized human figures.

   Articulated humanoids built from primitives: hips and two jointed legs,
   an elliptical torso with real shoulders, a neck, an ovoid head with a
   brow, nose and eyes, jointed arms with hands — then the garments over
   that body: a floor-length robe or a knee-length tunic, a belt, a cloak
   hanging from the shoulders, and a cowl opened at the front so the face
   sits in its shadow. Armoured figures get a cuirass, pauldrons, fauld,
   plate legs and a bascinet with a visor slit.

   Nothing here is rotationally symmetric: the old figures were a single
   lathe-turned profile (a bulb, a neck ring, a ball) and read as chess
   pawns from every angle. Shoulders are wider than hips, cross-sections
   are ellipses (deeper side to side than front to back), and the limbs
   hang away from the body so the silhouette is a person.

   Figures walk: an updater measures each frame's displacement and drives
   a stride cycle — legs swing from the hip with a knee bend, the arms
   counter-swing, the body bobs — for walkTo, the stealth searchers and
   the follow behaviour alike; at rest the limbs ease back to idle.

   Faces are shadowed or averted (hood, helm): right for 1764 Gothic, and
   it sidesteps the uncanny valley of procedural realistic faces.

   Turning is eased: faceTo() sets a target yaw and the body turns at a
   human rate (a snap before the first frame, so figures placed at build
   time start facing the right way). The head is on its own joint and
   looks at the player when close and roughly in front, or at a point set
   with lookAt(x,z); it scans left and right when the figure pauses. An
   alert stance (userData.alert) leans the torso in and thrusts the torch
   forward. Footsteps are heard, attenuated by distance.

   API per figure (a Group): faceTo(x,z[,snap]), facePlayer(), lookAt(x,z)
   / lookAt(null), walkTo(x,z,speed), setCollider(r), moveCollider(),
   removeCollider(); userData.rarm/larm are the elbow groups (ch4 swings
   the knight's sword arm with them). opts.static disables animation (an
   effigy, a suit of armour). */
'use strict';
(function (OTR) {

  const F = OTR.figures = {};

  function clothMaterial(color, rough = 0.95) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.0 });
  }
  function steelMaterial(color) {
    return new THREE.MeshStandardMaterial({ color: color || 0x565b66, roughness: 0.42, metalness: 0.88 });
  }
  function mkMesh(geo, mat, x, y, z, opts) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (opts && opts.rotX) m.rotation.x = opts.rotX;
    m.castShadow = !!(opts && opts.cast);
    m.receiveShadow = false;
    return m;
  }
  // an elliptical-section cylinder: deeper side-to-side than front-to-back
  function ellipCyl(rTop, rBot, h, seg, mat, x, y, z, flat = 0.66, opts) {
    const m = mkMesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, x, y, z, opts);
    m.scale.z = flat;
    return m;
  }
  // press gathers into an open skirt so the cloth hangs in folds
  function foldSkirt(geo, amount = 0.05) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const t = OTR.clamp(0.5 - y / (geo.parameters.height), 0, 1); // 0 at waist → 1 at hem
      const fold = 1 + (amount * Math.sin(a * 7) + amount * 0.45 * Math.sin(a * 3 + 1.1)) * t;
      pos.setX(i, x * fold); pos.setZ(i, z * fold);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Build a figure. opts: { color, height, hood, armor, armorColor, torch,
  //   faceColor, tunic (knee-length instead of a floor-length robe), cloak }
  F.make = function (world, x, z, opts = {}) {
    const g = new THREE.Group();
    const groundY = world.groundHeight(x, z);
    g.position.set(x, groundY, z);
    const H = opts.height || 1.75;
    const col = opts.color || 0x2a2530;
    const armor = !!opts.armor;
    const hooded = opts.hood !== false && !armor;
    const tunic = !!opts.tunic;

    const robe = clothMaterial(col);
    const dark = clothMaterial(new THREE.Color(col).multiplyScalar(0.62));
    const darker = clothMaterial(new THREE.Color(col).multiplyScalar(0.4));
    // a hooded face sits in its own shadow: darken the skin so it recedes
    const skin = clothMaterial(new THREE.Color(opts.faceColor || 0xc9ad8a).multiplyScalar(hooded ? 0.55 : 1), 0.72);
    const steel = armor ? steelMaterial(opts.armorColor) : null;
    const steelDark = armor ? new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.armorColor || 0x565b66).multiplyScalar(0.7), roughness: 0.45, metalness: 0.9 }) : null;
    const hair = clothMaterial(0x2a1c14, 0.9);
    const leather = clothMaterial(0x2b2018, 0.85);

    // ---- key heights ----
    const HIP = 0.52 * H, KNEE = 0.28 * H, SHOULDER = 0.81 * H, NECK = 0.845 * H, HEAD = 0.925 * H;
    const HIPW = 0.09, SHW = 0.235;

    // ---- hips ----
    const pelvis = mkMesh(new THREE.SphereGeometry(0.17, 16, 12), armor ? steelDark : darker, 0, HIP, 0, { cast: true });
    pelvis.scale.set(1.05, 0.62, 0.72);
    g.add(pelvis);

    // ---- legs ----
    const legMat = armor ? steel : (tunic ? leather : darker);
    function buildLeg(side) {
      const hip = new THREE.Group(); hip.position.set(side * HIPW, HIP, 0);
      const thighL = HIP - KNEE, shinL = KNEE - 0.05 * H;
      const thigh = mkMesh(new THREE.CapsuleGeometry(armor ? 0.082 : 0.075, thighL - 0.08, 4, 10), legMat, 0, -thighL / 2, 0, { cast: !hooded });
      thigh.scale.z = 0.85;
      hip.add(thigh);
      const knee = new THREE.Group(); knee.position.set(0, -thighL, 0);
      const shin = mkMesh(new THREE.CapsuleGeometry(armor ? 0.065 : 0.058, shinL - 0.06, 4, 10), legMat, 0, -shinL / 2, 0);
      shin.scale.z = 0.85;
      knee.add(shin);
      if (armor) knee.add(mkMesh(new THREE.SphereGeometry(0.07, 10, 8), steel, 0, 0, 0.01)); // poleyn
      // boot / sabaton
      const boot = mkMesh(new THREE.BoxGeometry(0.10, 0.07, 0.24), armor ? steelDark : leather, 0, -shinL + 0.01, 0.05);
      knee.add(boot);
      hip.add(knee);
      g.add(hip);
      return { hip, knee };
    }
    const legL = buildLeg(-1), legR = buildLeg(1);

    // ---- torso ----
    const torso = new THREE.Group(); g.add(torso);
    const chest = ellipCyl(0.215, 0.165, SHOULDER - HIP, 20, armor ? steel : robe, 0, (SHOULDER + HIP) / 2 - 0.01, 0, armor ? 0.7 : 0.64, { cast: true });
    torso.add(chest);
    // shoulders (deltoids)
    for (const s of [-1, 1]) {
      const sh = mkMesh(new THREE.SphereGeometry(0.085, 14, 10), armor ? steel : robe, s * (SHW - 0.03), SHOULDER - 0.02, 0);
      sh.scale.set(1.15, 0.8, 0.9);
      torso.add(sh);
    }
    if (armor) {
      // keel of the cuirass, fauld of overlapping plates, gorget, pauldrons
      const keel = mkMesh(new THREE.SphereGeometry(0.1, 14, 8), steel, 0, HIP + 0.15 * H, 0.085);
      keel.scale.set(0.5, 1.6, 0.5); torso.add(keel);
      const fauld = ellipCyl(0.20, 0.25, 0.11 * H, 18, steelDark, 0, HIP - 0.02, 0, 0.78);
      torso.add(fauld);
      for (const s of [-1, 1]) { // tassets over the thighs
        const t = mkMesh(new THREE.BoxGeometry(0.13, 0.16 * H, 0.05), steelDark, s * 0.11, HIP - 0.11 * H, 0.09);
        t.rotation.x = 0.12; torso.add(t);
      }
      torso.add(mkMesh(new THREE.TorusGeometry(0.11, 0.04, 8, 16), steel, 0, NECK - 0.01, 0, { rotX: Math.PI / 2 }));
      for (const s of [-1, 1]) {
        const p = mkMesh(new THREE.SphereGeometry(0.115, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), steel, s * (SHW + 0.01), SHOULDER, 0, { cast: true });
        p.scale.set(1, 0.85, 0.9); p.rotation.z = -s * 0.45; torso.add(p);
      }
    } else {
      // waist and belt; long robe or knee-length tunic below it
      const belt = mkMesh(new THREE.TorusGeometry(0.185, 0.022, 8, 22), leather, 0, HIP + 0.05 * H, 0, { rotX: Math.PI / 2 });
      belt.scale.set(1, 0.68, 1.6); torso.add(belt);
      torso.add(mkMesh(new THREE.BoxGeometry(0.045, 0.11 * H, 0.014), leather, 0.03, HIP + 0.01 * H, 0.15));
      if (tunic) {
        const skirtH = 0.24 * H;
        const skirt = mkMesh(foldSkirt(new THREE.CylinderGeometry(0.19, 0.25, skirtH, 24, 1, true), 0.035), robe, 0, HIP + 0.05 * H - skirtH / 2, 0, { cast: true });
        skirt.scale.z = 0.72; skirt.material.side = THREE.DoubleSide; torso.add(skirt);
      } else {
        const skirtH = HIP + 0.05 * H - 0.02;
        const skirt = mkMesh(foldSkirt(new THREE.CylinderGeometry(0.19, 0.36, skirtH, 28, 1, true), 0.05), robe, 0, HIP + 0.05 * H - skirtH / 2, 0, { cast: true });
        skirt.scale.z = 0.74; skirt.material.side = THREE.DoubleSide; torso.add(skirt);
      }
    }

    // ---- neck & head ----
    torso.add(mkMesh(new THREE.CylinderGeometry(0.055, 0.07, NECK - SHOULDER + 0.05, 10), skin, 0, (NECK + SHOULDER) / 2, 0));
    const headG = new THREE.Group(); headG.position.set(0, HEAD, 0); torso.add(headG);
    const head = mkMesh(new THREE.SphereGeometry(0.11, 18, 14), skin, 0, 0, 0, { cast: true });
    head.scale.set(0.88, 1.12, 0.96); headG.add(head);
    const jaw = mkMesh(new THREE.SphereGeometry(0.08, 12, 10), skin, 0, -0.055, 0.015);
    jaw.scale.set(0.95, 0.75, 0.95); headG.add(jaw);
    const nose = mkMesh(new THREE.SphereGeometry(0.02, 8, 6), skin, 0, -0.01, 0.10);
    nose.scale.set(0.75, 1.3, 1.1); headG.add(nose);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0b0a0c });
    for (const s of [-1, 1]) headG.add(mkMesh(new THREE.SphereGeometry(0.011, 6, 5), eyeMat, s * 0.036, 0.02, 0.092));
    const brow = mkMesh(new THREE.BoxGeometry(0.11, 0.018, 0.03), skin, 0, 0.045, 0.085); headG.add(brow);
    if (!hooded && !armor) {
      const cap = mkMesh(new THREE.SphereGeometry(0.117, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.012, -0.012);
      cap.scale.set(0.92, 1.1, 1.0); headG.add(cap);
    }

    // ---- hood & cloak ----
    if (hooded) {
      // cowl: a sphere cut open toward +Z (the figure's front), so the face
      // sits recessed in its shadow; DoubleSide shows the dark interior
      const cowl = mkMesh(new THREE.SphereGeometry(0.17, 20, 14, Math.PI * 0.78, Math.PI * 1.44, 0, Math.PI * 0.66), dark, 0, 0.035, -0.035, { cast: true });
      cowl.scale.set(1.02, 1.32, 1.22); cowl.rotation.x = -0.12; // tall, the point leaning back
      cowl.material = dark.clone(); cowl.material.side = THREE.DoubleSide;
      headG.add(cowl);
      // brim of the opening, rolled, so the hood has thickness at the face
      const brimH = mkMesh(new THREE.TorusGeometry(0.135, 0.022, 8, 20, Math.PI * 1.25), dark, 0, 0.02, 0.06);
      brimH.rotation.set(0.35, 0, Math.PI * 0.875); headG.add(brimH);
      // the cowl's fold running down over the shoulders and back
      const drape = mkMesh(new THREE.ConeGeometry(0.24, 0.36, 16, 1, true, Math.PI * 0.6, Math.PI * 1.8), dark, 0, NECK - 0.13, -0.06);
      drape.material = cowl.material; torso.add(drape);
    }
    if (opts.cloak !== false && !armor) {
      // half-tube cape from the shoulders to the calves, open at the front
      const cloakH = SHOULDER - 0.10 * H;
      const cloak = mkMesh(new THREE.CylinderGeometry(0.26, 0.36, cloakH, 18, 1, true, Math.PI * 0.32, Math.PI * 1.36), dark, 0, SHOULDER - cloakH / 2, -0.03, { cast: true });
      cloak.material = dark.clone(); cloak.material.side = THREE.DoubleSide;
      cloak.scale.z = 0.8;
      torso.add(cloak);
    }

    // ---- helm ----
    if (armor) {
      const helm = mkMesh(new THREE.SphereGeometry(0.135, 18, 14), steel, 0, 0.015, -0.005, { cast: true });
      helm.scale.set(0.98, 1.12, 1.06); headG.add(helm);
      headG.add(mkMesh(new THREE.BoxGeometry(0.035, 0.16, 0.26), steelDark, 0, 0.09, -0.02)); // comb
      const brim = mkMesh(new THREE.CylinderGeometry(0.142, 0.142, 0.07, 18, 1, true), steelDark, 0, -0.02, 0);
      headG.add(brim);
      headG.add(mkMesh(new THREE.BoxGeometry(0.20, 0.03, 0.05), eyeMat, 0, 0.01, 0.13)); // visor slit
      // bevor covering the chin
      const bevor = mkMesh(new THREE.SphereGeometry(0.10, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4), steel, 0, -0.03, 0.02);
      bevor.scale.set(1.15, 1.2, 1.15); headG.add(bevor);
    }

    // ---- arms ----
    const armMat = armor ? steel : dark;
    function buildArm(side) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * SHW, SHOULDER - 0.01, 0.01);
      const upperL = 0.19 * H, foreL = 0.17 * H;
      const upper = mkMesh(new THREE.CapsuleGeometry(armor ? 0.058 : 0.07, upperL - 0.06, 4, 10), armMat, 0, -upperL / 2, 0);
      shoulder.add(upper);
      if (armor) shoulder.add(mkMesh(new THREE.SphereGeometry(0.062, 10, 8), steelDark, 0, -upperL, 0)); // couter
      const elbow = new THREE.Group(); elbow.position.set(0, -upperL, 0);
      const fore = mkMesh(new THREE.CapsuleGeometry(armor ? 0.05 : 0.06, foreL - 0.06, 4, 10), armMat, 0, -foreL / 2, 0);
      elbow.add(fore);
      if (!armor) { // sleeve cuff
        const cuff = mkMesh(new THREE.CylinderGeometry(0.075, 0.062, 0.05, 10), darker, 0, -foreL + 0.04, 0);
        elbow.add(cuff);
      }
      const hand = mkMesh(new THREE.SphereGeometry(0.046, 10, 8), armor ? steelDark : skin, 0, -foreL - 0.02, 0.005);
      hand.scale.set(0.8, 1.15, 0.55);
      elbow.add(hand);
      elbow.rotation.x = -0.28;              // slight bend at the elbow
      shoulder.rotation.z = side * 0.13;     // hangs a little away from the body
      shoulder.userData.elbow = elbow; shoulder.userData.hand = hand;
      shoulder.add(elbow);
      torso.add(shoulder);
      return shoulder;
    }
    const shL = buildArm(-1), shR = buildArm(1);
    g.userData.larm = shL.userData.elbow; g.userData.rarm = shR.userData.elbow;
    g.userData.lshoulder = shL; g.userData.rshoulder = shR;

    // ---- held torch: haft in the raised right hand, fire above it ----
    let torchRec = null;
    if (opts.torch) {
      shR.rotation.x = -0.85; shR.rotation.z = 0.25;
      shR.userData.elbow.rotation.x = -1.05;
      const haft = mkMesh(new THREE.CylinderGeometry(0.02, 0.025, 0.55, 8), clothMaterial(0x4a3524, 0.9), 0, -0.17 * H + 0.16, 0.0);
      shR.userData.elbow.add(haft);
      torchRec = world.torch(0, 0, 0, { intensity: 2.0, distance: 9 });
      g.add(torchRec.group);
      g.userData.torch = torchRec;
      g.userData.torchHaft = haft;
    }

    world.add(g);

    // ---- API ----
    g.userData.figure = true;
    // ---- facing: eased yaw ----
    let targetYaw = g.rotation.y, ticked = false;
    g.faceTo = (tx, tz, snap) => {
      targetYaw = Math.atan2(tx - g.position.x, tz - g.position.z);
      if (snap || !ticked || opts.static) g.rotation.y = targetYaw;
    };
    g.facePlayer = () => g.faceTo(OTR.player.pos.x, OTR.player.pos.z);
    // head look target (world x,z) or null for automatic
    let lookT = null;
    g.lookAt = (tx, tz) => { lookT = (tx == null) ? null : [tx, tz]; };
    g.userData.alert = false;
    g.setCollider = (r = 0.4) => { g.userData.col = world.cyl(g.position.x, g.position.z, r, groundY, groundY + H); return g; };
    g.removeCollider = () => { if (g.userData.col) { g.userData.col.r = 0.01; g.userData.col.x = 99999; } };
    g.moveCollider = () => { if (g.userData.col) { g.userData.col.x = g.position.x; g.userData.col.z = g.position.z; } };

    // ---- animation: idle sway + velocity-driven stride ----
    const swaySeed = Math.random() * 10;
    const last = new THREE.Vector3().copy(g.position);
    let phase = Math.random() * 6.28, gait = 0, lastStep = 0, alertK = 0, scanT = 0;
    let headYaw = 0, headPitch = 0, restT = 0;
    const tmp = new THREE.Vector3();
    if (opts.static) { g.userData.static = true; }
    world.addUpdater((dt, e) => {
      if (dt <= 0 || opts.static) return;
      ticked = true;
      // turn toward the target heading at a human rate (faster when walking)
      let dy = targetYaw - g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const turnRate = 2.6 + gait * 3.0;
      g.rotation.y += OTR.clamp(dy, -turnRate * dt, turnRate * dt);
      const dx = g.position.x - last.x, dz = g.position.z - last.z;
      last.copy(g.position);
      const speed = Math.hypot(dx, dz) / dt;
      const moving = speed > 0.08;
      gait += ((moving ? Math.min(1, speed / 1.2) : 0) - gait) * Math.min(1, dt * 8);
      if (moving) phase += dt * Math.min(speed, 2.2) * 3.4;
      const s = Math.sin(phase), c = Math.cos(phase);
      // footsteps: one per half stride, heard within ~14 m
      if (gait > 0.3) {
        const step = Math.floor(phase / Math.PI);
        if (step !== lastStep) {
          lastStep = step;
          const d = OTR.dist2D(g.position.x, g.position.z, OTR.player.pos.x, OTR.player.pos.z);
          if (d < 14 && OTR.audio.footstep) OTR.audio.footstep(true, OTR.clamp(1 - d / 14, 0, 1) * 0.55);
        }
      }
      // ---- head: look at the player when close and in front, else scan while paused ----
      restT = moving ? 0 : restT + dt;
      let wantYaw = 0, wantPitch = 0;
      const p = OTR.player;
      const lt = lookT || ((OTR.dist2D(g.position.x, g.position.z, p.pos.x, p.pos.z) < 7) ? [p.pos.x, p.pos.z] : null);
      if (lt) {
        const ay = Math.atan2(lt[0] - g.position.x, lt[1] - g.position.z) - g.rotation.y;
        const rel = Math.atan2(Math.sin(ay), Math.cos(ay));
        if (lookT) wantYaw = OTR.clamp(rel, -1.4, 1.4); // an explicit glance turns as far as a neck can
        else if (Math.abs(rel) < 1.35) {
          wantYaw = rel;
          const d = OTR.dist2D(g.position.x, g.position.z, p.pos.x, p.pos.z);
          wantPitch = OTR.clamp((p.pos.y - (g.position.y + HEAD)) / Math.max(d, 0.5), -0.5, 0.35);
        }
      } else if (restT > 0.8) {
        scanT += dt;
        wantYaw = Math.sin(scanT * 0.9 + swaySeed) * 0.75;
        wantPitch = Math.sin(scanT * 0.5) * 0.08 - 0.05;
      }
      const hk = Math.min(1, dt * 4.5);
      headYaw += (wantYaw - headYaw) * hk; headPitch += (wantPitch - headPitch) * hk;
      headG.rotation.set(-headPitch, headYaw, 0);
      // ---- alert stance ----
      alertK += ((g.userData.alert ? 1 : 0) - alertK) * Math.min(1, dt * 3);
      if (opts.torch) { shR.rotation.x = -0.85 - 0.55 * alertK; shR.userData.elbow.rotation.x = -1.05 + 0.35 * alertK; }
      const swing = 0.6 * gait;
      legL.hip.rotation.x = s * swing;
      legR.hip.rotation.x = -s * swing;
      legL.knee.rotation.x = Math.max(0, -c) * 0.9 * gait * (s < 0 ? 1 : 0.3);
      legR.knee.rotation.x = Math.max(0, c) * 0.9 * gait * (s > 0 ? 1 : 0.3);
      if (!opts.torch) shR.rotation.x = s * 0.35 * gait;
      shL.rotation.x = -s * 0.35 * gait;
      // body: stride bob while walking, a slow breath and sway at rest
      const bob = Math.abs(Math.sin(phase)) * 0.025 * gait;
      torso.position.y = bob + (1 - gait) * Math.sin(e * 1.3 + swaySeed) * 0.006;
      torso.rotation.z = (1 - gait) * Math.sin(e * 0.8 + swaySeed) * 0.02 + gait * s * 0.03;
      torso.rotation.y = gait * -s * 0.06;
      torso.rotation.x = 0.14 * alertK + gait * 0.05; // lean in when alert, into the stride when walking
      if (!g.userData.walking && !moving) g.position.y = groundY;
      // the fire follows the raised hand
      if (torchRec) {
        g.userData.torchHaft.getWorldPosition(tmp);
        g.worldToLocal(tmp);
        torchRec.group.position.set(tmp.x, tmp.y + 0.36, tmp.z);
      }
    });

    // walk to a point over time; returns promise
    g.walkTo = function (tx, tz, speed = 1.4) {
      return new Promise((resolve) => {
        g.userData.walking = true;
        g.faceTo(tx, tz);
        let prev = performance.now(), v = 0;
        const step = () => {
          if (world.disposed) { g.userData.walking = false; resolve(); return; }
          const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
          const dx = tx - g.position.x, dz = tz - g.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.08) { g.userData.walking = false; resolve(); return; }
          // accelerate over the first stride, slow into the last metre
          v = Math.min(speed, v + speed * 2.2 * dt, Math.max(0.35, d * 1.6));
          const s = Math.min(d, v * dt);
          g.position.x += dx / d * s; g.position.z += dz / d * s;
          g.position.y = world.groundHeight(g.position.x, g.position.z);
          g.moveCollider();
          requestAnimationFrame(step);
        };
        step();
      });
    };

    return g;
  };

  // Presets keyed to the novel's cast
  F.manfred = (world, x, z) => F.make(world, x, z, { color: 0x3a1518, armor: true, armorColor: 0x4a4048, height: 1.82, hood: false });
  F.theodoreGhostly = (world, x, z) => F.make(world, x, z, { color: 0x9099a8, height: 1.78 });
  F.isabella = (world, x, z) => F.make(world, x, z, { color: 0x3d4a6a, faceColor: 0xd8bd9a, height: 1.66 });
  F.matilda = (world, x, z) => F.make(world, x, z, { color: 0x5a4a66, faceColor: 0xd8bd9a, height: 1.66 });
  F.jerome = (world, x, z) => F.make(world, x, z, { color: 0x2b2620, height: 1.74 }); // friar
  F.frederic = (world, x, z) => F.make(world, x, z, { color: 0x2a3d2a, armor: true, armorColor: 0x606672, height: 1.8, hood: false });
  F.guard = (world, x, z) => F.make(world, x, z, { color: 0x2a2622, armor: true, armorColor: 0x50535c, height: 1.76, hood: false, torch: true });
  F.peasant = (world, x, z) => F.make(world, x, z, { color: 0x4a3a28, faceColor: 0xc9ad8a, height: 1.72, tunic: true, cloak: false });

})(window.OTR);
