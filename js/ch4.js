/* ch4.js — Chapter IV: The Wood and the Shore.
   Moonlit forest east of the castle, falling to a labyrinth of sea-caves.
   Theodore follows a fleeing figure — Isabella — and, mistaking a searching
   knight for one of Manfred's captains, fights him. He wins; and the fallen
   knight proves to be Frederic, Isabella's own father. */
'use strict';
(function (OTR) {
  OTR.chapters = OTR.chapters || {};
  const P = () => OTR.props;
  const F = () => OTR.figures;
  const L = () => OTR.materials.lib;

  OTR.chapters[4] = {
    name: 'The Wood and the Shore',
    quote: '&ldquo;A chain of rocks, hollowed into a labyrinth of caverns that reach to the sea coast.&rdquo;',
    adapt: { from: 0.45, seconds: 6 },
    ambience: { wind: 0.16, sea: true, drone: { freqs: [38, 57], gain: 0.03 }, scatter: [['owl', 9000, 26000]] },

    build(world, ctx) {
      const scene = world.scene;
      const moonDir = new THREE.Vector3(-30, 40, 20).normalize();
      OTR.materials.sky(world, {
        seed: 13,
        top: 0x050a16, high: 0x101c33, horizon: 0x1f2c48, ground: 0x070a10, groundDeep: 0x04050a,
        sunDir: moonDir, sunColor: 0xdfe8ff, moon: true, discDeg: 2.6, sunGlow: 0.8,
        stars: 0.9, clouds: 1, cover: 0.36, cloudScale: 2.4, cirrus: 0.25,
        cloudLit: 0x9fb2dc, cloudShade: 0x1a2238, cloudAlpha: 0.95,
        haze: 0.6, hazeColor: 0x1a2440, envIntensity: 0.7
      });
      // Thick night mist: the wood swallows itself a few trees deep. The
      // shore (z ~ 78) only resolves once the path has dropped toward it.
      world.setFog(0x0b1220, 6, 78);
      const moon = world.sun(0x9fb2dc, 1.25, new THREE.Vector3(-30, 40, 20), 0x2b4066, 0.42, { area: 45, follow: true });
      OTR.game.renderer.toneMappingExposure = 1.12;
      if (OTR.game.postfx) {
        OTR.game.postfx.setGrade({ tint: 0xe6f0ff, saturation: 0.95 });
        OTR.game.postfx.setGodrays(moonDir, { strength: 0.24, color: 0xb9c9ec });
      }
      document.getElementById('vignette').style.opacity = 0.8;

      // ---- terrain: forest floor sloping down to a beach (+Z = seaward) ----
      // The wood rolls, then falls in one continuous slope to a beach that
      // meets the sea at the water line — the terrain never dips under the
      // sea plane (it used to: the sea surface hid the whole approach).
      const shoreZ = 78, seaY = -3.6;
      world.groundFn = (x, z) => {
        if (z > shoreZ + 6) return seaY - 0.3; // under the water
        const flat = OTR.smoothstep(46, shoreZ, z);          // the beach smooths out
        let h = OTR.fbm(x * 0.02, z * 0.02, 4) * 3.0 * (1 - flat * 0.85);
        h += OTR.smoothstep(24, shoreZ, z) * -3.3;           // the fall to the shore
        h -= OTR.smoothstep(shoreZ - 4, shoreZ + 6, z) * 0.6; // the water's edge
        const path = Math.exp(-(x * x) / 60) * 1.5;
        h -= path * OTR.smoothstep(0, 40, z) * 0.6 * (1 - flat);
        return h;
      };
      P().terrain(world, 260, 130, L().forestFloor, world.groundFn);
      L().forestFloor.color.set(0x6f7890); // moon-blued leaf litter, not daylight loam
      world.hardFloor = false;
      OTR.player.eyeHeight = 1.68;

      // ---- the sea ----
      // slightly rough so the moon breaks into a broad glitter, not a mirror
      const seaMat = new THREE.MeshStandardMaterial({ color: 0x0e1a2c, roughness: 0.32, metalness: 0.55, transparent: true, opacity: 0.92 });
      const sea = P().mesh(new THREE.PlaneGeometry(400, 200, 40, 20), seaMat, 0, seaY, shoreZ + 96, { cast: false, receive: false });
      sea.rotation.x = -Math.PI / 2; world.add(sea);
      const seaBase = sea.geometry.attributes.position.array.slice();
      world.addUpdater((dt, e) => {
        const a = sea.geometry.attributes.position.array;
        for (let i = 0; i < sea.geometry.attributes.position.count; i++) {
          a[i * 3 + 2] = seaBase[i * 3 + 2] + Math.sin(e * 0.8 + seaBase[i * 3] * 0.1) * 0.3 + Math.cos(e * 0.6 + seaBase[i * 3 + 1] * 0.1) * 0.2;
        }
        sea.geometry.attributes.position.needsUpdate = true;
      });

      // ---- forest ----
      const rng = OTR.rng(41);
      for (let i = 0; i < 150; i++) {
        const x = (rng() - 0.5) * 200, z = -20 + rng() * 90;
        if (Math.abs(x) < 5 && z < 76) continue;    // keep the path (and the cleft) clear
        if (z > shoreZ - 6) continue;               // no trees on the beach
        // fringe only where the crowns stand against the moon: near the path
        P().tree(world, x, z, 0.7 + rng() * 0.8, world.groundHeight(x, z), 0.12, { fringe: Math.abs(x) < 34 });
      }
      // undergrowth: swaying grass tufts along the wood (thins near the beach)
      P().grassField(world, { x0: -55, x1: 55, z0: -20, z1: 62 }, 2000, {
        color: 0xb8c2d4, height: 0.38, width: 0.75, // moonlit tufts, low and soft
        skip: (x, z) => (Math.abs(x) < 3 && z < 60) || z > shoreZ - 14
      });

      // scattered mossy boulders
      for (let i = 0; i < 24; i++) {
        const x = (rng() - 0.5) * 160, z = -10 + rng() * 80;
        if (Math.abs(x) < 3.5 && z < 60) continue;
        P().rock(world, x, z, 0.7 + rng() * 1.6, world.groundHeight(x, z), L().rockBig);
      }

      // ---- the sea caves: a rocky headland with cave mouths near the shore ----
      buildCaves(world, 0, shoreZ - 6);
      // the hermit's beads, on the cave floor beyond the cleft
      OTR.relics.place(world, 'beads', -9, shoreZ + 1, 0.3);

      // moon mist hanging between the trees: a low crawling bed and a taller,
      // thinner drift at head height
      P().mist(world, { x0: -60, x1: 60, z0: -20, z1: 52 }, 0.35, { color: 0x9fb2d8, opacity: 0.17, gap: 0.45, layers: 3 });
      P().mist(world, { x0: -50, x1: 50, z0: -16, z1: 46 }, 1.9, { color: 0x8ea3cc, opacity: 0.07, gap: 0.7, layers: 2 });
      // sea mist creeping up the beach
      P().mist(world, { x0: -60, x1: 60, z0: 60, z1: 96 }, seaY + 0.25, { color: 0x9fb2d8, opacity: 0.13, gap: 0.5, layers: 2 });

      // moonlight breaking through the canopy: thin shafts along the moon's
      // direction, scattered off the path so the player walks between them
      {
        const srng = OTR.rng(97);
        const down = moonDir.clone().negate(); // light travels away from the moon
        for (let i = 0; i < 16; i++) {
          const x = (srng() - 0.5) * 70, z = -12 + srng() * 66;
          if (Math.abs(x) < 3.5) continue;
          const gy = world.groundHeight(x, z);
          const hgt = 12 + srng() * 5;
          // position is the shaft's centre; the top sits up in the crowns
          const top = new THREE.Vector3(x, gy + hgt, z);
          const c = top.clone().addScaledVector(down, hgt * 0.5);
          P().lightShaft(world, c.x, c.y, c.z, {
            height: hgt, radiusTop: 0.12 + srng() * 0.2, radiusBottom: 0.7 + srng() * 0.9,
            color: 0x9fb2dc, opacity: 0.045 + srng() * 0.035, dir: down
          });
        }
      }

      // fireflies / drifting spores in the wood
      world.particles(70, { x0: -60, x1: 60, y0: 0.5, y1: 6, z0: -10, z1: 70 }, 0x8fb0d0, 0.05, 0.1);

      if (ctx.startBeat === 'duel') { setupDuel(world, ctx, true); return; }

      OTR.player.reset(0, -14, 0); // enter from the castle side, facing seaward (+Z)
      ctx.freeze(false);
      setTimeout(() => {
        ctx.objective('Seek concealment among the rocks by the sea');
        OTR.ui.toast('The gloomiest shades suit the melancholy in your mind. Eastward, and down, to the caverns.', 4600);
      }, 400);

      // the giant sabre, half-buried in the wood (Frederic's, from the hermit's grave)
      const sabre = P().giantSword(world, 16, world.groundHeight(16, 24) + 0.6, 24, 0.6, 0.8);
      sabre.rotation.z = 0.25;
      world.addTrigger({
        x: 16, z: 24, r: 5, onEnter: () => {
          OTR.audio.stinger('hit');
          OTR.ui.toast('An enormous sabre lies in the wood &mdash; the fellow of that casque. Words are graven on the blade.');
        }
      });

      // footsteps ahead — someone retreats before you
      let heard = false;
      world.addTrigger({
        x: 0, z: 34, r: 6, onEnter: async () => {
          if (heard) return; heard = true;
          OTR.audio.footstep(false); setTimeout(() => OTR.audio.footstep(false), 300); setTimeout(() => OTR.audio.footstep(false), 600);
          OTR.ui.toast('You hear the steps of some person, who seems to retreat before you&hellip;');
          ctx.objective('Follow the fleeing figure toward the caves');
        }
      });

      // find Isabella near the cave mouth
      const isabella = F().isabella(world, -3, shoreZ - 12);
      isabella.faceTo(-3, 40);
      world._isabella = isabella;
      let found = false;
      world.addTrigger({
        x: -3, z: shoreZ - 16, r: 5, onEnter: async () => {
          if (found) return; found = true;
          ctx.freeze(true);
          isabella.facePlayer();
          await ctx.say([
            { name: '', text: '<span class="dim">A woman falls breathless before you. It is the Lady Isabella.</span>' },
            { name: 'Isabella', text: 'Sure, I have heard that voice before! Art thou not sent in quest of me?' },
            { name: 'Theodore', text: 'No, lady. I have once already delivered thee from his tyranny, and I will place thee out of the reach of his daring.' },
            { name: 'Isabella', text: 'Then thou art the generous unknown I met in the vault. Sure thou art my guardian angel.' },
          ]);
          ctx.checkpoint('duel');
          ctx.freeze(false);
          setupDuel(world, ctx, false);
        }
      });
    }
  };

  function buildCaves(world, cx, cz) {
    // a headland ridge with cave openings, split by a cleft at the path so
    // the beach and the open sea show through as the wood ends
    const ridgeMat = L().caveRock;
    const rng = OTR.rng(613);
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue; // the cleft
      const x = cx + i * 9 + (rng() - 0.5) * 3 + (i < 0 ? -2.5 : 2.5);
      const gy = world.groundHeight(x, cz);
      const rock = P().mesh(new THREE.DodecahedronGeometry(6 + rng() * 3, 1), ridgeMat, x, gy + 2, cz);
      rock.scale.set(1.4, 1.6 + rng() * 0.6, 1.2);
      rock.rotation.set(rng(), rng(), rng());
      world.add(rock);
      world.cyl(x, cz, 4.5, gy - 2, gy + 8);
    }
    // the cave mouth opens off the cleft (the concealment)
    const caveMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 1, side: THREE.BackSide });
    const cave = P().mesh(new THREE.SphereGeometry(7, 20, 14), caveMat, cx - 9, world.groundHeight(cx - 9, cz + 4) + 2, cz + 5, { cast: false });
    world.add(cave);
    const caveGlow = new THREE.PointLight(0x4a6a9a, 0.8, 16, 2); caveGlow.position.set(cx - 9, 2, cz + 4); world.add(caveGlow);
    // a few wet boulders down on the sand
    for (let i = 0; i < 7; i++) {
      const x = (rng() - 0.5) * 60, z = cz + 8 + rng() * 10;
      P().rock(world, x, z, 0.6 + rng() * 1.3, world.groundHeight(x, z), L().caveRock);
    }
  }

  function setupDuel(world, ctx, resumed) {
    if (resumed) { OTR.player.reset(-3, 60, 0); }
    const shoreZ = 78;
    const knight = F().frederic(world, 4, shoreZ - 8);
    knight.faceTo(0, 40);
    knight.setCollider(0.5);
    world._knight = knight;

    ctx.objective('A knight bars the way &mdash; defend Isabella');
    setTimeout(() => OTR.ui.say([
      { name: 'The Knight', text: 'I seek the Lady Isabella, and understand she has taken refuge among these rocks. Impede me not, or thou wilt repent it.' },
      { name: 'Theodore', text: 'Thy purpose is as odious as thy resentment is contemptible. Return whence thou camest!' },
    ]), 700);

    // approach to begin the duel
    let started = false;
    world.addTrigger({
      x: 4, z: shoreZ - 11, r: 5, onEnter: async () => {
        if (started) return; started = true;
        await runDuel(world, ctx, knight);
      }
    });
    // if resuming, auto-start shortly
    if (resumed) setTimeout(() => { if (!started) { started = true; runDuel(world, ctx, knight); } }, 2500);
  }

  async function runDuel(world, ctx, knight) {
    ctx.freeze(true);
    OTR.ui.letterbox(true);
    knight.facePlayer();
    await ctx.say([{ name: '', text: '<span class="dim">He discharges a blow with his sabre. Your valour, so long smothered, breaks forth at once.</span>' }]);

    // The knight telegraphs each stroke: a high cut wants a high guard (W),
    // a low sweep a low one (S), a lunge a sidestep (A/D); openings want a
    // strike (SPACE). The wrong guard is as bad as none. Three wounds and
    // you fall among the rocks.
    const rounds = [
      { label: 'He cuts HIGH &mdash; guard high!', key: 'W', ms: 1150 },
      { label: 'An opening &mdash; STRIKE!', key: 'SPACE', ms: 1000 },
      { label: 'He sweeps LOW &mdash; guard low!', key: 'S', ms: 1050 },
      { label: 'He lunges &mdash; step LEFT!', key: 'A', ms: 950 },
      { label: 'STRIKE!', key: 'SPACE', ms: 900 },
      { label: 'HIGH again!', key: 'W', ms: 900 },
      { label: 'He lunges &mdash; step RIGHT!', key: 'D', ms: 850 },
      { label: 'DISARM him!', key: 'SPACE', ms: 850 },
    ];
    let i = 0, wounds = 0;
    const armSwing = (k) => { if (knight.userData.rarm) knight.userData.rarm.rotation.z = k === 'W' ? -1.2 : k === 'S' ? 0.4 : -0.5; };
    while (i < rounds.length) {
      const r = rounds[i];
      armSwing(r.key);
      OTR.audio.sword();
      const success = await ctx.qte(r.label.replace(/&mdash;/g, '\u2014'), r.key, r.ms);
      if (success) {
        OTR.audio.sword();
        i++;
        await new Promise(res => setTimeout(res, 320));
      } else {
        wounds++;
        OTR.ui.damage();
        OTR.audio.stinger('hit');
        if (wounds >= 3) {
          OTR.ui.letterbox(false);
          ctx.fail('duel', 'The sabre finds you a third time. You fall among the rocks, and the knight passes on to Isabella.');
          return;
        }
        await ctx.say([{ name: '', text: `<span class="dim">His blow lands. You reel &mdash; ${wounds === 1 ? 'a first wound' : 'a second wound; one more will finish you'}.</span>` }]);
      }
    }
    OTR.ui.letterbox(false);
    // knight falls
    knight.rotation.x = 0;
    const fall = knight.position.clone();
    const start = performance.now();
    (function anim() {
      const t = Math.min(1, (performance.now() - start) / 800);
      knight.rotation.x = -t * 1.4; knight.position.y = world.groundHeight(fall.x, fall.z) + t * 0.2;
      if (t < 1) requestAnimationFrame(anim);
    })();
    knight.removeCollider();

    // Isabella comes; the reveal
    if (world._isabella) { world._isabella.visible = true; world._isabella.walkTo(knight.position.x - 1.5, knight.position.z - 1.5, 1.4); }
    await ctx.say([
      { name: 'The Knight', text: 'Generous foe&hellip; we have both been in an error. I took thee for an instrument of the tyrant. If Isabella is at hand&mdash;call her&mdash;I have important secrets to&mdash;' },
      { name: 'Isabella', text: 'Oh, amazement! Horror! What do I see! My father!' },
      { name: 'Frederic', text: '&rsquo;Tis most true. I am Frederic, thy father. I came to deliver thee. Give me a parting&mdash; no; this brave knight will protect thy innocence.' },
      { name: 'Theodore', text: 'Do not exhaust yourself, sir. Suffer us to convey you to the castle.' },
    ]);
    ctx.objective(null);
    OTR.audio.stinger('rise');
    await OTR.ui.fadeOut(1700);
    ctx.win();
  }

})(window.OTR);
