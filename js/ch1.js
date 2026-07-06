/* ch1.js — Chapter I: The Helmet.
   Sunlit courtyard. The giant plumed casque has crushed Conrad. The crowd
   names it Alfonso's helmet; Manfred, frantic, accuses the young peasant
   (the player, Theodore) of sorcery and imprisons him beneath it. Theodore
   finds the broken pavement and descends into the vaults. */
'use strict';
(function (OTR) {
  OTR.chapters = OTR.chapters || {};
  const F = () => OTR.figures;
  const P = () => OTR.props;
  const L = () => OTR.materials.lib;

  OTR.chapters[1] = {
    name: 'The Helmet',
    quote: '&ldquo;Oh! the helmet! the helmet!&rdquo;',
    ambience: { wind: 0.05, birds: 0.8 },

    build(world, ctx) {
      const scene = world.scene;
      // ---- sky & light: warm late afternoon ----
      const sunDir = new THREE.Vector3(28, 46, 38).normalize();
      OTR.materials.sky(world, {
        seed: 3,
        top: 0x2a5a9c, high: 0x86aad2, horizon: 0xe6d2a0, ground: 0x5c5844, groundDeep: 0x34301f,
        sunDir, sunColor: 0xffeccb, clouds: 0.9, cloudLit: 0xfff3da, cloudShade: 0xb9c6da,
        haze: 0.8, envIntensity: 0.55
      });
      world.setFog(0xcdbf9e, 40, 190);
      const sun = world.sun(0xffe6b4, 2.5, new THREE.Vector3(28, 46, 38), 0xbcd0ea, 0.55);
      sun.target.position.set(0, 0, 0);
      // sky fill from the opposite side so shadowed faces are not black
      const fill = new THREE.DirectionalLight(0x9fb6d8, 0.32);
      fill.position.set(-30, 24, -20); scene.add(fill);
      // Exposure pulled well under 1 so the pale courtyard paving keeps its
      // detail instead of clipping to white under the strong sun + IBL.
      OTR.game.renderer.toneMappingExposure = 0.95;
      document.getElementById('vignette').style.opacity = 0.5;

      // ---- ground ----
      P().groundPlane(world, 600, L().grass, -0.04);
      P().floor(world, 0, 0, 46, 46, 0.0, L().pavingCourt);

      // ---- castle enclosure (square, walls with corner towers) ----
      const R = 24, H = 9, T = 1.4;
      const mat = L().stoneWall;
      // north wall with a great gate gap toward the church
      P().wall(world, -R, R, -6, R, H, T, mat, { crenellate: true });
      P().wall(world, 6, R, R, R, H, T, mat, { crenellate: true });
      P().wall(world, R, R, R, -R, H, T, mat, { crenellate: true });   // east
      P().wall(world, -R, -R, R, -R, H, T, mat, { crenellate: true });  // south
      P().wall(world, -R, R, -R, -R, H, T, mat, { crenellate: true });  // west
      // corner towers
      [[-R, R], [R, R], [R, -R], [-R, -R]].forEach(c => P().tower(world, c[0], c[1], 3, H + 3, mat, { roof: true }));
      // gate arch (north opening toward the church)
      P().archway(world, 0, R, 0, 8, 6.5, T, mat);

      // keep facade on the west (great hall / gallery block) with door
      P().wall(world, -R + 0.1, 12, -R + 0.1, -12, H + 2, 0.6, L().plaster, { collide: false });
      P().archway(world, -R + 0.8, -2, Math.PI / 2, 3.2, 4.5, 1, L().stoneWall);

      // chapel doorway on the east
      P().archway(world, R - 0.8, 6, -Math.PI / 2, 3, 4.2, 1, L().stoneWall);

      // ---- church of St Nicholas, glimpsed beyond the north gate ----
      buildChurchExterior(world, 0, R + 30);

      // countryside: scattered cypress-like trees beyond the walls
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, d = 34 + Math.random() * 120;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.abs(x) < 10 && z > R && z < R + 40) continue; // keep church approach clear
        P().tree(world, x, z, 0.7 + Math.random() * 0.7, -0.04);
      }

      // pollen motes in the sun
      world.particles(90, { x0: -R, x1: R, y0: 0.5, y1: 8, z0: -R, z1: R }, 0xfff0c8, 0.06, 0.15);

      // ---- the giant helmet, crushing Conrad ----
      const helmet = P().giantHelmet(world, 0, 0, 2, 1.0);
      world._helmet = helmet;
      // a shrouded mound (Conrad) at its base
      const mound = P().mesh(new THREE.SphereGeometry(1.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), L().blackCloth, 0.8, 0.1, 4.4);
      mound.scale.set(1, 0.5, 1.6); world.add(mound);

      // ---- figures: Manfred, mourners, peasants ----
      const manfred = F().manfred(world, -3.5, 2);
      manfred.faceTo(0, 2); manfred.setCollider(0.4);
      world._manfred = manfred;
      const crowd = [];
      const spots = [[4, 3], [5.5, 6], [-5, 5.5], [3, -3], [-4, -4], [6, -1], [-6, 0], [2, 7]];
      spots.forEach((s, i) => {
        const f = (i % 3 === 0) ? F().guard(world, s[0], s[1]) : F().peasant(world, s[0], s[1]);
        f.faceTo(0, 2); f.setCollider(0.35); crowd.push(f);
      });
      world._crowd = crowd;

      // ---- player ----
      OTR.player.eyeHeight = 1.68; OTR.player.canRun = true;
      if (ctx.startBeat === 'confined') { enterConfined(world, ctx, true); return; }

      OTR.player.reset(0, -15, 0);
      ctx.freeze(false);

      // ---- scripted beats ----
      ctx.objective('Approach the fallen helmet');

      let intro = false;
      world.addTrigger({
        x: 0, z: -11, r: 3, onEnter: async () => {
          if (intro) return; intro = true;
          await ctx.say([
            { name: 'A peasant, near you', text: 'It is exactly like the helmet on the figure of Alfonso the Good&mdash;in the church of St. Nicholas.' },
            { name: '', text: '<span class="dim">The Prince turns at the words. His face is terrible.</span>' },
          ]);
          ctx.objective('Stand before the Prince');
        }
      });

      // accusation trigger — closer to the helmet / Manfred
      let accused = false;
      world.addTrigger({
        x: 0, z: -3, r: 3.2, onEnter: async () => {
          if (accused || !intro) { if (!intro) { ctx.toast('The crowd stirs about the casque&hellip;'); } return; }
          accused = true;
          ctx.freeze(true);
          manfred.faceTo(OTR.player.pos.x, OTR.player.pos.z);
          OTR.audio.stinger('hit');
          await ctx.say([
            { name: 'Manfred', text: 'Villain! What sayest thou? How darest thou utter such treason?' },
            { name: 'Manfred', text: 'Monster! Sorcerer! &rsquo;tis thou hast done this! &rsquo;tis thou hast slain my son!' },
            { name: 'The mob', text: 'Ay, ay; &rsquo;tis he! He has stolen the helmet from good Alfonso&rsquo;s tomb!' },
            { name: 'Manfred', text: 'Keep the magician prisoner under the helmet itself. Let him be guarded, and given no food.' },
          ]);
          // guards close in
          await Promise.all(crowd.slice(0, 2).map((c, i) => c.walkTo(OTR.player.pos.x + (i ? 1.2 : -1.2), OTR.player.pos.z + 1.5, 1.8)));
          OTR.audio.stinger('rise');
          await OTR.ui.fadeOut(1600);
          enterConfined(world, ctx, false);
          // enterConfined rebuilds the scene while black; fade back in so play
          // resumes. (The resume-from-checkpoint path fades in via startChapter,
          // but this mid-chapter transition must do it itself.)
          await OTR.ui.fadeIn(1400);
        }
      });
    }
  };

  // ---- the confined beat: trapped beneath the casque ----
  function enterConfined(world, ctx, resumed) {
    ctx.checkpoint('confined');
    // dim the world to a claustrophobic gloom under the great helm
    world.setFog(0x0e0c0a, 3, 32);
    OTR.materials.interiorEnv(world, { top: 0x2a2c34, mid: 0x1a1a1f, bottom: 0x0c0c10, envIntensity: 0.7 });
    if (world.sunLight) world.sunLight.intensity = 0.2;
    if (world.hemi) { world.hemi.intensity = 0.35; world.hemi.color.set(0x50607a); world.hemi.groundColor.set(0x1a1510); }
    OTR.game.renderer.toneMappingExposure = 1.0;
    document.getElementById('vignette').style.opacity = 0.82;
    OTR.audio.setAmbience({ wind: 0.03, drone: { freqs: [44, 66], gain: 0.06 } });

    // hide the crowd/manfred (they have withdrawn, gates locked)
    (world._crowd || []).forEach(c => { c.visible = false; c.removeCollider(); });
    if (world._manfred) { world._manfred.visible = false; world._manfred.removeCollider(); }

    // Build a dark iron enclosure AROUND the player: the underside of the casque.
    const CX = 0, CZ = 2;
    const steel = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.7, metalness: 0.75, side: THREE.BackSide });
    const shell = new THREE.Group(); shell.position.set(CX, 0, CZ);
    // wall cylinder
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 9, 32, 1, true), steel);
    wall.position.y = 4.5; wall.receiveShadow = true; shell.add(wall);
    // domed top
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), steel);
    dome.position.y = 9; shell.add(dome);
    // riveted ribs on the inside
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0f, roughness: 0.6, metalness: 0.8 });
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.25, 9, 0.4), ribMat);
      rib.position.set(Math.cos(a) * 4.8, 4.5, Math.sin(a) * 4.8);
      rib.lookAt(new THREE.Vector3(0, 4.5, 0)); shell.add(rib);
    }
    world.add(shell);
    // enclosure colliders
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      world.cyl(CX + Math.cos(a) * 4.8, CZ + Math.sin(a) * 4.8, 0.6, 0, 8);
    }

    // one thin shaft of daylight through a visor slit
    const shaft = new THREE.SpotLight(0xffe6b8, 22, 26, 0.42, 0.55, 1.1);
    shaft.position.set(CX + 0.5, 11, CZ + 1); shaft.target.position.set(CX + 1.2, 0, CZ + 2.4);
    world.scene.add(shaft); world.scene.add(shaft.target);
    // a soft ambient fill so the iron shell is legible
    const fill = new THREE.PointLight(0x8090b0, 1.1, 14, 2); fill.position.set(CX, 4, CZ); world.add(fill);
    // dust motes catching the shaft
    world.particles(40, { x0: CX - 2, x1: CX + 2, y0: 0.3, y1: 8, z0: CZ - 1, z1: CZ + 3 }, 0xffe6c0, 0.05, 0.05);
    // visible volumetric shaft (additive cone)
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe6b8, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const beam = OTR.props.mesh(new THREE.ConeGeometry(1.4, 10, 16, 1, true), beamMat, CX + 0.9, 5, CZ + 1.7, { cast: false, receive: false });
    world.add(beam);
    // visible slit of sky
    const slit = OTR.props.mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: 0xbcd4f0, fog: false }), CX + 0.4, 8.4, CZ + 4.7, { cast: false });
    world.add(slit);

    // the broken cheek of the casque, forced through the pavement — a lit gap
    const gapX = CX + 1.6, gapZ = CZ + 2.6;
    const gapMat = new THREE.MeshBasicMaterial({ color: 0x38507e, fog: false });
    const gap = OTR.props.mesh(new THREE.CircleGeometry(1.5, 20), gapMat, gapX, 0.02, gapZ, { cast: false });
    gap.rotation.x = -Math.PI / 2; world.add(gap);
    // glowing rim to draw the eye
    const rim = OTR.props.mesh(new THREE.RingGeometry(1.5, 1.9, 24), new THREE.MeshBasicMaterial({ color: 0x6f8fd0, fog: false, transparent: true, opacity: 0.5, side: THREE.DoubleSide }), gapX, 0.04, gapZ, { cast: false });
    rim.rotation.x = -Math.PI / 2; world.add(rim);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const s = OTR.props.mesh(new THREE.BoxGeometry(0.7, 0.3, 1.1), L().vaultStone, gapX + Math.cos(a) * 1.7, 0.12, gapZ + Math.sin(a) * 1.7);
      s.rotation.set((Math.random() - .5) * 0.4, a, (Math.random() - .5) * 0.4); world.add(s);
    }
    // cool glow rising from the vault below
    const under = new THREE.PointLight(0x6f8fd0, 3.5, 14, 2); under.position.set(gapX, -0.4, gapZ); world.add(under);
    // faint blue beam rising from the broken pavement to mark the descent
    const upMat = new THREE.MeshBasicMaterial({ color: 0x7fa0e0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const upBeam = OTR.props.mesh(new THREE.CylinderGeometry(1.3, 1.5, 4, 16, 1, true), upMat, gapX, 2, gapZ, { cast: false, receive: false });
    world.add(upBeam);
    // floor inside the shell so we stand on stone, not void
    OTR.props.floor(world, CX, CZ, 11, 11, 0.0, L().vaultStone);

    OTR.player.reset(CX - 1.5, CZ - 1.5, 0);
    OTR.player.pos.set(CX - 1.5, OTR.player.eyeHeight, CZ - 1.5);
    OTR.player.yaw = Math.atan2(gapX - (CX - 1.5), gapZ - (CZ - 1.5));
    ctx.freeze(false);

    setTimeout(() => {
      ctx.objective('Beneath the casque &mdash; find a way down');
      OTR.ui.toast('The Providence that delivered you from the helmet may yet show you a lock&hellip;', 5000);
    }, resumed ? 200 : 400);

    world.addInteractable({
      x: gapX, z: gapZ, r: 2.4, once: true,
      prompt: 'Descend through the broken pavement',
      onUse: async () => {
        ctx.freeze(true);
        await ctx.say([
          { name: '', text: '<span class="dim">One cheek of the enchanted casque has forced its way through the pavement of the court, and broken into the vault below.</span>' },
          { name: 'Theodore', text: 'Wherever these steps lead, I could not be in a worse situation than I am.' },
        ]);
        OTR.audio.stinger('rise');
        await OTR.ui.fadeOut(1500);
        ctx.win();
      }
    });
  }

  function buildChurchExterior(world, x, z) {
    const P = OTR.props, L = OTR.materials.lib;
    // nave block
    P.wall(world, x - 7, z - 10, x - 7, z + 10, 12, 1, L.stoneWall);
    P.wall(world, x + 7, z - 10, x + 7, z + 10, 12, 1, L.stoneWall);
    P.wall(world, x - 7, z + 10, x + 7, z + 10, 12, 1, L.stoneWall);
    // gabled facade toward the castle with a great arched door
    P.wall(world, x - 7, z - 10, x - 2.2, z - 10, 12, 1, L.stoneWall);
    P.wall(world, x + 2.2, z - 10, x + 7, z - 10, 12, 1, L.stoneWall);
    P.archway(world, x, z - 10, 0, 3.6, 6, 1, L.stoneWall, { collide: false });
    // gable + roof
    const roof = P.mesh(new THREE.ConeGeometry(11, 6, 4), L.roof, x, 15, z);
    roof.rotation.y = Math.PI / 4; world.add(roof);
    // bell tower
    P.tower(world, x + 9, z - 8, 2.4, 18, L.stoneWall, { roof: true });
    // rose window (emissive ring)
    const rose = P.mesh(new THREE.RingGeometry(1.1, 1.6, 16), new THREE.MeshStandardMaterial({ color: 0x5a4a2a, emissive: 0x3a2e12, roughness: 0.6 }), x, 10, z - 9.4, { cast: false });
    world.add(rose);
  }

})(window.OTR);
