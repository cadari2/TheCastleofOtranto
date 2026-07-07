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
  function moonShaft(world, x, z, intensity = 2.2) {
    const spot = new THREE.SpotLight(0x9fb4e0, intensity, 26, 0.5, 0.7, 1.0);
    spot.position.set(x, 12, z); spot.target.position.set(x, 0, z);
    world.scene.add(spot); world.scene.add(spot.target);
    const beam = P().mesh(new THREE.ConeGeometry(1.8, 11, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9fb4e0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
      x, 5.5, z, { cast: false, receive: false });
    world.add(beam);
    const hole = P().mesh(new THREE.CircleGeometry(1.8, 16), new THREE.MeshBasicMaterial({ color: 0x11151f, fog: false }), x, 4.4, z, { cast: false });
    hole.rotation.x = Math.PI / 2; world.add(hole);
    world.particles(26, { x0: x - 1.6, x1: x + 1.6, y0: 0.2, y1: 9, z0: z - 1.6, z1: z + 1.6 }, 0xb8c8ec, 0.045, 0.04);
    return spot;
  }

  OTR.chapters[2] = {
    name: 'The Vaults',
    quote: '&ldquo;An awful silence reigned throughout those subterraneous regions&hellip;&rdquo;',
    ambience: { drone: { freqs: [42, 63, 84], gain: 0.06 }, wind: 0.02 },

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
      moonShaft(world, 31, 22, 2.6);
      corridorZ(world, 31, 26.5, 43.5, 5, H);     // D north to trap chamber
      hall(world, 31, 49, 11, 11, H, false);      // T trap-door chamber
      moonShaft(world, 33, 50, 1.8);

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

      P().rock(world, -3, -1, 0.5, 0, L().vaultStone);
      P().rock(world, 1.7, 8, 0.6, 0, L().vaultStone);   // leans on A's east wall
      P().rock(world, 12, 18.4, 0.5, 0, L().vaultStone); // leans on B's south wall
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
      const lampGlow = new THREE.PointLight(0xffb45a, 0.6, 4, 2); lampGlow.position.set(1.5, 0.4, -1.5); world.add(lampGlow);
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

  function followUpdater(world, isabella) {
    world.addUpdater(() => {
      if (!isabella.userData.follow) return;
      const p = OTR.player, d = OTR.dist2D(isabella.position.x, isabella.position.z, p.pos.x, p.pos.z);
      if (d > 3) {
        const dx = p.pos.x - isabella.position.x, dz = p.pos.z - isabella.position.z;
        const s = Math.min(d - 2.6, 0.06);
        isabella.position.x += dx / d * s; isabella.position.z += dz / d * s;
        isabella.position.y = world.groundHeight(isabella.position.x, isabella.position.z);
        isabella.faceTo(p.pos.x, p.pos.z);
      }
    });
  }

  function beginMaze(world, ctx, lamp) {
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

    const searcher = F().guard(world, 10, 20);
    // patrol stays inside corridor B (walls at z 17.5 / 22.5) — the old last
    // waypoint (24, 23) sat beyond the north wall, so he clipped through it
    searcher.userData.wp = [[2, 20], [23, 20], [23, 21.5], [2, 20]];
    searcher.userData.wpi = 0;
    let caughtCooldown = 0;
    world.addUpdater((dt) => {
      const wp = searcher.userData.wp[searcher.userData.wpi];
      const dx = wp[0] - searcher.position.x, dz = wp[1] - searcher.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) { searcher.userData.wpi = (searcher.userData.wpi + 1) % searcher.userData.wp.length; }
      else {
        const s = 1.5 * dt;
        searcher.position.x += dx / d * s; searcher.position.z += dz / d * s;
        searcher.position.y = world.groundHeight(searcher.position.x, searcher.position.z);
        searcher.faceTo(wp[0], wp[1]);
      }
      caughtCooldown -= dt;
      const pd = OTR.dist2D(searcher.position.x, searcher.position.z, OTR.player.pos.x, OTR.player.pos.z);
      const exposed = lamp.fuel > 0.3 && lamp._draft <= 0;
      if (pd < 2.6 && exposed && caughtCooldown <= 0) {
        caughtCooldown = 3;
        OTR.audio.stinger('hit');
        ctx.fail('trapdoor', 'A torch swung toward you&mdash;you were seized and dragged back into the dark.');
      }
    });

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
        const lid = P().mesh(new THREE.BoxGeometry(1.4, 0.12, 1.4), L().planks, tx, 0.1, tz);
        world.add(lid);
        const start = performance.now();
        (function anim() {
          const t = Math.min(1, (performance.now() - start) / 700);
          lid.rotation.x = -OTR.smoothstep(0, 1, t) * 1.4; lid.position.y = 0.1 + t * 0.6;
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
