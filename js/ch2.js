/* ch2.js — Chapter II: The Vaults.
   The subterranean cloisters between the castle and the church of St. Nicholas.
   Theodore takes up a fallen lamp, meets the fleeing Isabella, and helps her
   find the trap-door — while Manfred's voice and torches close through the
   dark. A guttering-lamp mechanic and an evasion beat carry the tension. */
'use strict';
(function (OTR) {
  OTR.chapters = OTR.chapters || {};
  const P = () => OTR.props;
  const F = () => OTR.figures;
  const L = () => OTR.materials.lib;

  // ---- local builders ----
  // Floors and ceilings only. Walls are laid out explicitly in build() from a
  // single wall plan: the old per-builder walls ran straight across junctions
  // (sealing the intended path north) while leaving whole room faces open to
  // the void, so the player could — and had to — walk out of the dungeon.
  function corridorZ(world, cx, z0, z1, w, h) {
    const zc = (z0 + z1) / 2, len = Math.abs(z1 - z0);
    P().floor(world, cx, zc, w + 1, len, 0, L().paving);
    P().barrelVault(world, cx, z0, z1, w, h, L().vaultStone);
  }
  function corridorX(world, cz, x0, x1, w, h) {
    const xc = (x0 + x1) / 2, len = Math.abs(x1 - x0);
    P().floor(world, xc, cz, len, w + 1, 0, L().paving);
    P().ceiling(world, xc, cz, len, w + 1, h + 0.2, L().vaultStone);
  }
  function hall(world, cx, cz, w, d, h, cols) {
    P().floor(world, cx, cz, w, d, 0, L().paving);
    P().ceiling(world, cx, cz, w + 1, d + 1, h, L().vaultStone);
    if (cols) {
      for (let ix = -1; ix <= 1; ix += 2)
        for (let iz = -1; iz <= 1; iz += 2)
          P().column(world, cx + ix * w * 0.28, cz + iz * d * 0.28, h, 0.5, L().vaultStone);
    }
  }
  // ceilY: the room's ceiling height — the beam starts there and the dark
  // opening sits flush against it (a gap showed as a bright collar)
  function moonShaft(world, x, z, intensity = 2.2, ceilY = 4.6) {
    const spot = new THREE.SpotLight(0x9fb4e0, intensity, 26, 0.5, 0.7, 1.0);
    spot.position.set(x, 12, z); spot.target.position.set(x, 0, z);
    world.scene.add(spot); world.scene.add(spot.target);
    P().lightShaft(world, x, (ceilY - 0.2) / 2, z, { height: ceilY - 0.2, radiusTop: 0.7, radiusBottom: 1.9, color: 0x9fb4e0, opacity: 0.16 });
    P().lightWell(world, x, ceilY - 0.2, z, { radius: 1.0, depth: 3.4, color: 0x9fb4e0, brightness: 1.7 });
    world.particles(26, { x0: x - 1.6, x1: x + 1.6, y0: 0.2, y1: 9, z0: z - 1.6, z1: z + 1.6 }, 0xb8c8ec, 0.045, 0.04);
    return spot;
  }

  OTR.chapters[2] = {
    name: 'The Vaults',
    quote: '&ldquo;An awful silence reigned throughout those subterraneous regions&hellip;&rdquo;',
    adapt: { from: 0.28, seconds: 9 }, // out of the daylight: the vault resolves slowly
    ambience: { drone: { freqs: [42, 63, 84], gain: 0.06 }, wind: 0.02, scatter: [['drip', 2500, 9000]] },

    build(world, ctx) {
      const scene = world.scene;
      scene.background = new THREE.Color(0x05060a);
      OTR.materials.interiorEnv(world, {
        top: 0x1c2230, mid: 0x11131a, bottom: 0x07070a,
        glows: [
          { u: 0.15, v: 0.42, r: 0.06, color: 0xffb04a, intensity: 0.5 },
          { u: 0.62, v: 0.40, r: 0.05, color: 0xffb04a, intensity: 0.4 },
          { u: 0.88, v: 0.35, r: 0.09, color: 0x6f8fd0, intensity: 0.3 },
          // broad soft spot matching the old makeEnv's painted highlight
          // (same relative size), so ambient stays where darkness was tuned
          { u: 0.7, v: 0.28, r: 0.156, color: 0xfff6dc, intensity: 0.9 },
        ]
      });
      world.setFog(0x06070b, 2, 22);
      if (OTR.atmo) OTR.atmo.set({ noise: 0.5, noiseScale: 0.1 }); // the dark breathes
      world.hardFloor = true;
      OTR.game.renderer.toneMappingExposure = 1.0;
      if (OTR.game.postfx) OTR.game.postfx.setGrade({ tint: 0xe8f0ff, saturation: 0.88 });
      document.getElementById('vignette').style.opacity = 0.9;
      const amb = new THREE.HemisphereLight(0x2a3350, 0x05060a, 0.22); scene.add(amb);

      // cold mist crawling over the vault floors
      OTR.props.mist(world, { x0: -6, x1: 26, z0: -9, z1: 24 }, 0.14, { color: 0x8fa0c0, opacity: 0.06, gap: 0.1, layers: 2 });

      // ---- layout ----
      // Interior spans (x0..x1 / z0..z1):
      //   S start hall      -4.5..4.5   /  -8..2
      //   A north corridor  -2.5..2.5   /   2..17.5
      //   B cross corridor  -2.5..24.5  /  17.5..22.5   (searcher patrol)
      //   C cloister hall   24.5..37.5  /  13.5..26.5
      //   D north corridor  28.5..33.5  /  26.5..43.5
      //   T trap chamber    25.5..36.5  /  43.5..54.5
      const H = 4.6;
      hall(world, 0, -3, 9, 10, H, false);        // S start chamber
      corridorZ(world, 0, 2, 17.5, 5, H);         // A north corridor
      corridorX(world, 20, -2.5, 25, 5, H);       // B cross corridor (searcher)
      hall(world, 31, 20, 13, 13, H + 0.6, true); // C cloister hall
      moonShaft(world, 31, 22, 2.6, H + 0.6);
      corridorZ(world, 31, 26.5, 43.5, 5, H);     // D north to trap chamber
      hall(world, 31, 49, 11, 11, H, false);      // T trap-door chamber
      moonShaft(world, 33, 50, 1.8, H);

      // Wall plan [x0, z0, x1, z1, height?, baseY?]. Every junction gets a
      // doorway-width opening; every dead face is sealed so neither the player
      // nor sightlines escape the vaults.
      const HC = H + 0.6; // the cloister hall is taller than the corridors
      const wallRuns = [
        // S start hall — open north onto A
        [-4.5, -8, -4.5, 2], [4.5, -8, 4.5, 2], [-4.5, -8, 4.5, -8],
        [-4.5, 2, -2.5, 2], [2.5, 2, 4.5, 2],
        // A corridor
        [-2.5, 2, -2.5, 17.5], [2.5, 2, 2.5, 17.5],
        // B corridor — open south onto A and east onto C; dead west end capped
        [2.5, 17.5, 24.5, 17.5], [-2.5, 22.5, 24.5, 22.5], [-2.5, 17.5, -2.5, 22.5],
        // C cloister hall — doorways west (from B) and north (to D)
        [24.5, 13.5, 24.5, 17.5, HC], [24.5, 22.5, 24.5, 26.5, HC],
        [37.5, 13.5, 37.5, 26.5, HC], [24.5, 13.5, 37.5, 13.5, HC],
        [24.5, 26.5, 28.5, 26.5, HC], [33.5, 26.5, 37.5, 26.5, HC],
        [24.5, 17.5, 24.5, 22.5, 0.6, H], // lintel over the west doorway
        [28.5, 26.5, 33.5, 26.5, 0.6, H], // lintel over the north doorway
        // D corridor
        [28.5, 26.5, 28.5, 43.5], [33.5, 26.5, 33.5, 43.5],
        // T trap chamber — open south onto D
        [25.5, 43.5, 25.5, 54.5], [36.5, 43.5, 36.5, 54.5], [25.5, 54.5, 36.5, 54.5],
        [25.5, 43.5, 28.5, 43.5], [33.5, 43.5, 36.5, 43.5],
      ];
      wallRuns.forEach(([x0, z0, x1, z1, h = H, baseY = 0]) =>
        P().wall(world, x0, z0, x1, z1, h, 0.6, L().vaultStone, { baseY }));

      // buttresses along the long cross corridor: cover to crouch behind
      // while the torch passes, and a rhythm for the eye
      for (const bx of [6.5, 13, 19.5]) {
        P().wall(world, bx - 0.45, 17.5, bx + 0.45, 18.6, H, 0.9, L().vaultStone);
        P().wall(world, bx - 0.45, 21.4, bx + 0.45, 22.5, H, 0.9, L().vaultStone);
        OTR.stealth.addHideSpot(world, bx + 1.1, 18.1, 1.0);
        OTR.stealth.addHideSpot(world, bx + 1.1, 21.9, 1.0);
      }
      // pillars flanking the north corridor to the trap chamber
      P().column(world, 29.3, 35, H, 0.55, L().vaultStone);
      P().column(world, 32.7, 39, H, 0.55, L().vaultStone);
      // Isabella's veil, at the dead west end of the cross corridor
      OTR.relics.place(world, 'veil', -1.4, 20.2, 0.25);
      P().rock(world, -3, -1, 0.5, 0, L().vaultStone);
      P().rock(world, 1.7, 8, 0.6, 0, L().vaultStone);   // leans on A's east wall
      P().rock(world, 12, 18.4, 0.5, 0, L().vaultStone); // leans on B's south wall
      // ---- dressing: the things that make these passages a place ----
      // ossuary niches sunk into the walls, skulls stacked to the lintel
      P().ossuary(world, 9.5, 1.35, 17.8, -Math.PI / 2, { width: 1.3 });
      P().ossuary(world, 16, 1.35, 22.2, Math.PI / 2, { width: 1.1, rows: 2 });
      P().ossuary(world, 37.2, 1.35, 18, Math.PI, { width: 1.6, rows: 3 });
      P().ossuary(world, 37.2, 1.35, 23, Math.PI, { width: 1.2, rows: 3 });
      // a knight's chest tomb along the cloister hall's south wall
      P().effigyTomb(world, 31, 15.4, Math.PI / 2);
      // standing water where the vault weeps, and the drips that feed it
      P().puddle(world, 0.8, 9, 0.8, { drip: { ceilY: 6.6, every: 3.5 } });
      P().puddle(world, 8, 19.3, 1.1, { stretch: 0.7, drip: { ceilY: 4.6, every: 5 } });
      P().puddle(world, 28, 22.6, 0.9, { drip: { ceilY: 5.0 } });
      P().puddle(world, 30.2, 36, 0.7, { stretch: 1.4, drip: { ceilY: 6.6, every: 4.2 } });
      P().puddle(world, 34.8, 47.5, 1.0);
      // cobwebs hung across the upper corners
      // (corner point, then the diagonal into the room as atan2(dx, dz))
      P().cobweb(world, -4.2, 4.4, -7.7, Math.PI / 4, 1.2);
      P().cobweb(world, 4.2, 4.4, -7.7, -Math.PI / 4, 0.9);
      P().cobweb(world, -2.2, 4.55, 17.8, Math.PI / 4, 1.1);
      P().cobweb(world, -2.2, 4.55, 22.2, 3 * Math.PI / 4, 0.8);
      P().cobweb(world, 25.8, 4.4, 54.2, 3 * Math.PI / 4, 1.0);
      P().cobweb(world, 36.2, 4.4, 54.2, -3 * Math.PI / 4, 1.2);
      P().cobweb(world, 24.8, 4.95, 13.8, Math.PI / 4, 1.3);
      // chains left hanging from the vaulting, stirring in the draught
      P().chain(world, -1.5, 6.55, 12, 1.4);
      P().chain(world, 1.6, 6.5, 6, 1.0);
      P().chain(world, 27, 5.0, 19, 1.8);
      P().chain(world, 35, 5.0, 24, 1.2);
      P().chain(world, 29.6, 6.55, 33, 1.5);
      // rats along the skirting; they bolt for their holes when you come near
      P().rats(world, [
        [4.2, 18.0, 6.0, 18.0], [16, 22.0, 19.1, 22.0], [36.8, 25, 37.1, 26.2],
        [29.0, 30, 28.9, 26.8], [26.2, 46, 25.9, 44],
      ]);

      // torches sit on walls (bracket + flame) instead of floating mid-passage
      P().wallTorch(world, 0, 2.3, 22.2, Math.PI / 2, { intensity: 1.6, distance: 9 });
      P().wallTorch(world, 24.8, 2.3, 24.3, 0, { intensity: 1.5, distance: 9 });

      OTR.player.eyeHeight = 1.68;

      if (ctx.startBeat === 'trapdoor') { setupFromCheckpoint(world, ctx); return; }

      OTR.player.reset(0, -3, 0);
      const lamp = world.enableLamp({ intensity: 3.8, distance: 15 });
      lamp.on = false; OTR.ui.showLamp(false);
      ctx.freeze(false);

      ctx.objective('Take up the fallen lamp');
      const lampProp = P().mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 10), L().metal, 1.5, 0.2, -1.5);
      world.add(lampProp);
      const lampGlow = new THREE.PointLight(0xffb45a, 1.3, 6, 2); lampGlow.position.set(1.5, 0.4, -1.5); world.add(lampGlow);
      world.addInteractable({
        x: 1.5, z: -1.5, r: 2, once: true, prompt: 'Take up the lamp',
        onUse: async () => {
          lampProp.visible = false; lampGlow.intensity = 0;
          lamp.on = true; OTR.ui.showLamp(true);
          await ctx.say([{ name: 'Theodore', text: 'A lamp, burning at the stair&rsquo;s foot. It will not last&mdash;but it will serve.' }]);
          ctx.objective('Find a way through the cloisters toward the church');
          beginMaze(world, ctx, lamp);
        }
      });
    }
  };

  // Isabella keeps close: she eases into a hurried walk when you draw
  // ahead, slows as she catches up, turns to face you when she stops, and
  // every so often glances back over her shoulder into the dark.
  function followUpdater(world, isabella) {
    let v = 0, glance = 0, glanceT = 4 + Math.random() * 4;
    world.addUpdater((dt, e) => {
      if (!isabella.userData.follow) return;
      const p = OTR.player, d = OTR.dist2D(isabella.position.x, isabella.position.z, p.pos.x, p.pos.z);
      const want = d > 3 ? Math.min(1.9, (d - 2.6) * 1.5) : 0;
      v += (want - v) * Math.min(1, dt * (want > v ? 3 : 6));
      if (v > 0.02) {
        const dx = p.pos.x - isabella.position.x, dz = p.pos.z - isabella.position.z;
        const s = Math.min(Math.max(0, d - 2.4), v * dt);
        isabella.position.x += dx / d * s; isabella.position.z += dz / d * s;
        isabella.position.y = world.groundHeight(isabella.position.x, isabella.position.z);
        isabella.moveCollider && isabella.moveCollider();
      }
      isabella.faceTo(p.pos.x, p.pos.z);
      // the glance back: head turns to the corridor behind her for a moment
      glanceT -= dt;
      if (glanceT <= 0) { glance = 1.6; glanceT = 6 + Math.random() * 7; }
      if (glance > 0) {
        glance -= dt;
        // over the right shoulder (a neck cannot turn fully round)
        const a = isabella.rotation.y + 2.4;
        isabella.lookAt(isabella.position.x + Math.sin(a) * 4, isabella.position.z + Math.cos(a) * 4);
        if (glance <= 0) isabella.lookAt(null);
      }
    });
  }

  function beginMaze(world, ctx, lamp) {
    setTimeout(() => OTR.ui.toast('Crouch (C) to keep low behind the stones. Hood the lamp (F) when torchlight comes near&mdash;it hides you, and blinds you.', 6500), 1800);
    [[0, 12], [10, 20], [22, 20], [31, 34]].forEach(d => {
      world.addTrigger({
        x: d[0], z: d[1], r: 3.5, once: false, onEnter: () => { lamp.gutter(1.4); OTR.audio.whisper && OTR.audio.whisper(); }
      });
    });
    world.addTrigger({ x: 0, z: 10, r: 3, onEnter: () => { OTR.audio.whisper(); OTR.ui.toast('&mdash; a sigh, somewhere in the dark.'); } });

    let met = false;
    const isabella = F().isabella(world, 31, 24);
    isabella.faceTo(31, 20);
    world.addTrigger({
      x: 31, z: 16, r: 4, onEnter: async () => {
        if (met) return; met = true;
        ctx.freeze(true);
        isabella.facePlayer();
        OTR.audio.stinger && OTR.audio.stinger('rise');
        await ctx.say([
          { name: '', text: '<span class="dim">A human form stands close against the wall. She shrieks, then stays herself.</span>' },
          { name: 'Isabella', text: 'Be not alarmed&mdash;whoever you are, take pity on a wretched princess, standing on the brink of destruction.' },
          { name: 'Theodore', text: 'I will die in your defence; but I am unacquainted with this castle.' },
          { name: 'Isabella', text: 'Help me but to find a trap-door that must be hereabout&mdash;a smooth plate of brass set in one of the stones. It leads to the church of St. Nicholas.' },
          { name: 'Theodore', text: 'Then we will find it. Keep by me, and keep to the light.' },
        ]);
        ctx.checkpoint('trapdoor');
        ctx.objective('Lead Isabella to the trap-door beyond the cloister');
        isabella.userData.follow = true;
        ctx.freeze(false);
        followUpdater(world, isabella);
        startSearcher(world, ctx, lamp, isabella);
      }
    });
  }

  function startSearcher(world, ctx, lamp, isabella) {
    setTimeout(() => OTR.ui.say([{ name: 'Manfred (distant)', text: 'Talk not to me of necromancers&mdash;I tell you she must be in the castle; I will find her in spite of enchantment!' }]), 900);

    // Manfred's men: one walks the long cross corridor, one the north
    // passage and the trap chamber itself. Torchlight announces them; the
    // buttresses and pillars are the only cover.
    const onCaught = () => {
      OTR.audio.stinger('hit');
      ctx.fail('trapdoor', 'A torch swung toward you&mdash;you were seized and dragged back into the dark.');
    };
    const s1 = F().guard(world, 10, 20);
    OTR.stealth.addSearcher(world, s1, [[2, 20], [23, 20], [23, 21.5], [2, 20]],
      { speed: 1.4, range: 11, fov: 100, rate: 0.85, onCaught, name: 'A domestic' });
    const s2 = F().guard(world, 31, 42);
    OTR.stealth.addSearcher(world, s2, [[31, 29], [31, 42], [28, 47], [30, 52], [34, 49], [31, 42]],
      { speed: 1.15, range: 10, fov: 95, rate: 0.8, pause: 2.2, onCaught, name: 'Manfred\u2019s captain',
        lines: ['She must be hereabouts&mdash;search every stone!', 'Who moves there?', 'Bring the light!'] });

    placeTrapDoor(world, ctx, isabella);
  }

  function placeTrapDoor(world, ctx, isabella) {
    const tx = 33, tz = 50;
    const plate = P().mesh(new THREE.CircleGeometry(0.5, 16), L().gold, tx, 0.06, tz, { cast: false });
    plate.rotation.x = -Math.PI / 2; world.add(plate);
    const ringGlow = new THREE.PointLight(0xffd27a, 0.0, 5, 2); ringGlow.position.set(tx, 0.5, tz); world.add(ringGlow);
    world.addUpdater((dt, e) => { ringGlow.intensity = 0.3 + 0.2 * Math.sin(e * 2); });

    let opened = false;
    world.addInteractable({
      x: tx, z: tz, r: 2.2, prompt: 'Search the stones for the brass lock',
      onUse: async () => {
        if (opened) return; opened = true;
        ctx.freeze(true);
        await ctx.say([
          { name: '', text: '<span class="dim">A ray of moonshine, through a cranny of the ruin above, falls upon the plate of brass.</span>' },
          { name: 'Isabella', text: 'Oh, transport! Here is the trap-door!' },
        ]);
        // the trap-door lid lies flush over the plate and swings open on a
        // hinge at its far (north) edge, away from the player — no more box
        // materialising mid-air and sweeping through the player's space
        const hinge = new THREE.Group(); hinge.position.set(tx, 0.05, tz + 0.7);
        const lid = P().mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), L().planks, 0, 0, -0.7);
        hinge.add(lid); world.add(hinge);
        const start = performance.now();
        (function anim() {
          const t = Math.min(1, (performance.now() - start) / 900);
          hinge.rotation.x = OTR.smoothstep(0, 1, t) * 1.35;
          if (t < 1) requestAnimationFrame(anim);
        })();
        const stairGlow = new THREE.PointLight(0x6f8fd0, 2, 8, 2); stairGlow.position.set(tx, -1, tz); world.add(stairGlow);
        await ctx.say([{ name: 'Isabella', text: 'It leads directly to the church. Follow me&mdash;dark and dismal as it is, we cannot miss our way.' }]);
        isabella.userData.follow = false;
        await isabella.walkTo(tx, tz, 1.6);
        isabella.visible = false;
        OTR.audio.stinger('rise');
        await ctx.say([
          { name: 'Manfred (near)', text: 'It must be Isabella! She is escaping by the subterraneous passage&mdash;she cannot have got far!' },
          { name: '', text: '<span class="dim">The door slips from your hands. It falls; the spring closes over it. Torches flood the vault.</span>' },
          { name: 'Theodore', text: 'What imported it whether I was seized a minute sooner or later? She is away.' },
        ]);
        OTR.ui.setObjective(null);
        OTR.audio.stinger('hit');
        await OTR.ui.fadeOut(1600);
        ctx.win();
      }
    });
    ctx.objective('Find the trap-door before Manfred&rsquo;s search overtakes you');
  }

  function setupFromCheckpoint(world, ctx) {
    OTR.player.reset(31, 30, 0);
    const lamp = world.enableLamp({ intensity: 3.8, distance: 15 });
    ctx.freeze(false);
    const isabella = F().isabella(world, 31, 32);
    isabella.userData.follow = true;
    followUpdater(world, isabella);
    ctx.objective('Lead Isabella to the trap-door beyond the cloister');
    startSearcher(world, ctx, lamp, isabella);
  }

})(window.OTR);
