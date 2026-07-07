/* ch5.js — Chapter V: The Tomb of Alfonso.
   Night, in the church of St. Nicholas. Theodore prays at the tomb; Matilda
   comes to intercede. Manfred, misled in the dark, strikes down his own
   daughter. Then the earth shakes, the walls are thrown down, and the shade
   of Alfonso rises: "Behold in Theodore the true heir of Alfonso!" */
'use strict';
(function (OTR) {
  OTR.chapters = OTR.chapters || {};
  const P = () => OTR.props;
  const F = () => OTR.figures;
  const L = () => OTR.materials.lib;

  OTR.chapters[5] = {
    name: 'The Tomb of Alfonso',
    quote: '&ldquo;Behold in Theodore the true heir of Alfonso!&rdquo;',
    ambience: { drone: { freqs: [40, 60, 80], gain: 0.06 }, wind: 0.03 },

    build(world, ctx) {
      const scene = world.scene;
      scene.background = new THREE.Color(0x05060c);
      OTR.materials.interiorEnv(world, {
        top: 0x1a2038, mid: 0x10131f, bottom: 0x07070c, envIntensity: 0.8,
        glows: [
          { u: 0.30, v: 0.38, r: 0.07, color: 0xffc878, intensity: 0.45 }, // candles
          { u: 0.55, v: 0.42, r: 0.05, color: 0xffc878, intensity: 0.35 },
          { u: 0.80, v: 0.30, r: 0.156, color: 0xbfd0f0, intensity: 0.6 }, // moonlit window
        ]
      });
      world.setFog(0x08080f, 6, 60);
      world.sun(0x8090b8, 0.35, new THREE.Vector3(-20, 40, -10), 0x1a2038, 0.22);
      OTR.game.renderer.toneMappingExposure = 1.04;
      if (OTR.game.postfx) OTR.game.postfx.setGrade({ tint: 0xeaf0ff, saturation: 0.9 });
      document.getElementById('vignette').style.opacity = 0.82;
      world.hardFloor = true;
      OTR.player.eyeHeight = 1.68;

      buildChurch(world);

      // sepulchral mist along the nave floor
      OTR.props.mist(world, { x0: -8, x1: 8, z0: -20, z1: 16 }, 0.14, { color: 0x8f9cc0, opacity: 0.06, gap: 0.1, layers: 2 });

      if (ctx.startBeat === 'finale') { OTR.player.reset(0, 6, Math.PI); ctx.freeze(false); runFinale(world, ctx); return; }

      OTR.player.reset(0, -18, 0); // enter at the west door, facing the altar (+Z)
      ctx.freeze(false);
      setTimeout(() => {
        ctx.objective('Approach the tomb of Alfonso');
        OTR.ui.toast('The great church of St. Nicholas. The tomb of Alfonso the Good stands before the altar.', 4200);
      }, 400);

      // Matilda sent by Hippolita to pray; she is not here yet
      let atTomb = false;
      world.addTrigger({
        x: 0, z: 6, r: 5, onEnter: async () => {
          if (atTomb) return; atTomb = true;
          await runTombScene(world, ctx);
        }
      });
    }
  };

  // ---------------- the church ----------------
  function buildChurch(world) {
    const H = 9, w = 12, len = 44;
    P().floor(world, 0, 2, w, len, 0, L().marbleBlack);
    // side walls with arcade columns
    P().wall(world, -w / 2, -20, -w / 2, 24, H, 0.8, L().stoneWall);
    P().wall(world, w / 2, -20, w / 2, 24, H, 0.8, L().stoneWall);
    // clerestory ceiling
    P().ceiling(world, 0, 2, w + 1, len + 1, H, L().stoneWall);
    // west (entrance) and east (altar) walls
    P().wall(world, -w / 2, -20, w / 2, -20, H, 0.8, L().stoneWall);
    world._eastWall = P().wall(world, -w / 2, 24, w / 2, 24, H, 0.8, L().stoneWall);
    // columns / arcade
    for (let i = 0; i < 6; i++) {
      P().column(world, -4.4, -16 + i * 7, H, 0.55, L().stoneWall);
      P().column(world, 4.4, -16 + i * 7, H, 0.55, L().stoneWall);
    }
    // rows of candles down the nave
    for (let i = 0; i < 6; i++) {
      candle(world, -3.2, -14 + i * 6);
      candle(world, 3.2, -14 + i * 6);
    }
    // altar area with tall candles
    candle(world, -2, 14, 1.4); candle(world, 2, 14, 1.4);
    // the tomb of Alfonso, before the altar
    world._tomb = P().tomb(world, 0, 8, 0, L().marbleTomb);
    const tombLight = new THREE.PointLight(0xbfd0f0, 1.4, 16, 2); tombLight.position.set(0, 4, 8); world.add(tombLight);
    // a moonbeam through a high window onto the tomb
    const spot = new THREE.SpotLight(0xaec2ec, 3.0, 40, 0.4, 0.7, 1.0);
    spot.position.set(0, 16, 4); spot.target.position.set(0, 0, 8);
    world.scene.add(spot); world.scene.add(spot.target);
    const beam = P().mesh(new THREE.ConeGeometry(2.4, 16, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xaec2ec, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
      0, 8, 6, { cast: false });
    world.add(beam);
    // altar
    world.add(P().mesh(new THREE.BoxGeometry(4, 1.4, 1.6), L().marbleTomb, 0, 0.7, 20));
    world.add(P().mesh(new THREE.RingGeometry(0.5, 0.7, 16), L().gold, 0, 2.6, 20.7, { cast: false }));
    world.particles(40, { x0: -5, x1: 5, y0: 0.5, y1: 8, z0: -10, z1: 22 }, 0xbfd0f0, 0.04, 0.03);
  }

  function candle(world, x, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(P().mesh(new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, 0.7 * scale, 8), L().candle, 0, 0.35 * scale, 0));
    world.add(g);
    world.torch(x, 0.75 * scale, z, { intensity: 0.9, distance: 6, color: 0xffcf87 });
  }

  // ---------------- the tomb scene & Matilda's death ----------------
  async function runTombScene(world, ctx) {
    ctx.freeze(true);
    ctx.objective(null);
    await ctx.say([
      { name: 'Theodore', text: 'The tomb of Alfonso. My father bade me kneel here &mdash; and I know not why my heart is so moved.' },
      { name: '', text: '<span class="dim">A soft step on the marble. A lady approaches, veiled, to pray.</span>' },
    ]);
    const matilda = F().matilda(world, 0, 2);
    matilda.walkTo(0, 4.5, 1.1).then(() => matilda.faceTo(0, 8));
    await new Promise(r => setTimeout(r, 1100));
    await ctx.say([
      { name: 'Matilda', text: 'My mother sent me hither, to intercede for my father &mdash; and for thee. Does it, alas, depend on me? Manfred will never permit our union.' },
      { name: 'Theodore', text: 'No power shall part us but Heaven itself.' },
    ]);
    ctx.checkpoint('finale');

    // Manfred glides from the shadow behind Matilda
    const manfred = F().manfred(world, 0, -2);
    manfred.faceTo(0, 8);
    OTR.audio.heartbeat();
    await ctx.say([
      { name: 'Manfred (from the dark)', text: 'Does it depend on thee? No &mdash; this shall prevent it!' },
    ]);
    // a QTE the player is a heartbeat too late for — true to the book
    OTR.audio.heartbeat();
    const saved = await ctx.qte('LUNGE &mdash; stop the blade!', 'SPACE', 750);
    // Manfred strikes Matilda regardless (you can only wrench the dagger after)
    manfred.walkTo(0, 3.4, 3);
    OTR.audio.stinger('hit');
    OTR.ui.damage();
    await new Promise(r => setTimeout(r, 400));
    // Matilda sinks
    const start = performance.now(), my = matilda.position.y;
    (function anim() {
      const t = Math.min(1, (performance.now() - start) / 1200);
      matilda.rotation.x = -t * 1.3; matilda.position.y = my - t * 0.6;
      if (t < 1) requestAnimationFrame(anim);
    })();
    await ctx.say([
      { name: 'Matilda', text: 'Ah me, I am slain! Good heaven, receive my soul!' },
      { name: 'Theodore', text: saved ? 'Savage, inhuman monster! &mdash; I have your dagger, but too late!' : 'Savage, inhuman monster, what hast thou done!' },
      { name: 'Matilda', text: 'Stop, stop thy impious hand &mdash; it is my father!' },
    ]);
    manfred.facePlayer();
    await ctx.say([
      { name: 'Manfred', text: 'I took thee for Isabella; but heaven directed my bloody hand to the heart of my child. Oh, Matilda &mdash; canst thou forgive the blindness of my rage?' },
      { name: 'Matilda', text: 'I can, I do; and may heaven confirm it. Forgive him, dearest mother &mdash; it was an error.' },
      { name: '', text: '<span class="dim">She expires. Theodore prints a thousand kisses on her clay-cold hands.</span>' },
    ]);
    OTR.audio.stinger('rise');
    await OTR.ui.fadeOut(2200);
    // clear the dead/mourners for the finale
    matilda.visible = false;
    runFinale(world, ctx, manfred);
  }

  // ---------------- the collapse & the shade of Alfonso ----------------
  async function runFinale(world, ctx, manfred) {
    ctx.checkpoint('finale');
    ctx.freeze(true);
    OTR.player.reset(0, -6, 0); OTR.player.pos.set(0, OTR.player.eyeHeight, -6); OTR.player.yaw = 0; // face the altar/east wall
    if (!manfred) { manfred = F().manfred(world, 0, 2); }
    manfred.position.set(0, 0, 2); manfred.faceTo(0, 8);

    OTR.ui.letterbox(true);
    await OTR.ui.fadeIn(1600);
    await ctx.say([{ name: '', text: '<span class="dim">&ldquo;What! is she dead?&rdquo; A clap of thunder shakes the castle to its foundations.</span>' }]);
    OTR.audio.thunder();

    // shake the camera
    let shake = 2.2;
    const shakeUpd = world.addUpdater((dt) => {
      shake = Math.max(0, shake - dt * 0.4);
      OTR.player.pos.x = shake * (Math.random() - 0.5) * 0.4;
      OTR.player.pos.z = -6 + shake * (Math.random() - 0.5) * 0.4;
    });

    // throw down the east wall
    if (world._eastWall) {
      const wall = world._eastWall;
      const s0 = performance.now();
      (function anim() {
        const t = Math.min(1, (performance.now() - s0) / 1400);
        wall.rotation.x = t * 1.2; wall.position.y = 4.5 - t * 5; wall.position.z = 24 + t * 6;
        if (t < 1) requestAnimationFrame(anim); else wall.visible = false;
      })();
    }
    // rubble
    for (let i = 0; i < 20; i++) {
      const r = P().mesh(new THREE.BoxGeometry(1 + Math.random(), 0.6, 1 + Math.random()), L().stoneWall, (Math.random() - 0.5) * 10, 0.3, 22 + Math.random() * 6);
      r.rotation.set(Math.random(), Math.random(), Math.random()); world.add(r);
    }
    OTR.audio.stinger('hit');
    await new Promise(r => setTimeout(r, 1400));

    // the giant shade of Alfonso rises in the breach
    const alfonso = buildGiantAlfonso(world, 0, 0, 34);
    OTR.audio.stinger('rise');
    OTR.audio.chord([110, 164.8, 220, 329.6], 6, 0.14);
    // rise & brighten
    const s1 = performance.now();
    world.addUpdater((dt, e) => {
      const t = Math.min(1, (performance.now() - s1) / 3000);
      alfonso.position.y = OTR.lerp(-14, 0, OTR.smoothstep(0, 1, t));
      alfonso.traverse(o => { if (o.material && o.material.opacity !== undefined) o.material.opacity = 0.35 + 0.4 * t; });
      alfonso.rotation.y = Math.sin(e * 0.2) * 0.05;
    });
    // point the player's gaze up at the giant
    OTR.player.pitch = 0.5;
    await new Promise(r => setTimeout(r, 2600));

    await ctx.say([
      { name: 'The shade of Alfonso', text: 'Behold in Theodore the true heir of Alfonso!' },
    ]);
    OTR.audio.thunder();
    // heavenly light: bloom the scene, ascend
    const glory = new THREE.PointLight(0xffffff, 0, 120, 1.4); glory.position.set(0, 40, 34); world.add(glory);
    const s2 = performance.now();
    world.addUpdater((dt) => {
      const t = Math.min(1, (performance.now() - s2) / 4000);
      glory.intensity = t * 8;
      OTR.game.renderer.toneMappingExposure = 1.04 + t * 1.6;
      alfonso.position.y = t * 26;
      document.getElementById('vignette').style.opacity = 0.82 * (1 - t);
    });
    // St Nicholas glow above
    addGlory(world, 0, 70, 34);
    await ctx.say([
      { name: '', text: '<span class="dim">The clouds part; the form of St. Nicholas receives Alfonso&rsquo;s shade, and they are wrapt from mortal eyes in a blaze of glory.</span>' },
      { name: 'Hippolita', text: 'Behold the vanity of human greatness! Conrad is gone; Matilda is no more; in Theodore we view the true Prince of Otranto.' },
    ]);
    await OTR.ui.fadeOut(3000);
    OTR.ui.letterbox(false);
    ctx.ending();
  }

  function buildGiantAlfonso(world, x, y, z) {
    const g = new THREE.Group(); g.position.set(x, -14, z);
    const ghost = () => new THREE.MeshStandardMaterial({ color: 0xbcd0f0, emissive: 0x3a5a8a, roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0.35, depthWrite: false });
    const S = 4; // giant scale
    // torso (cuirass)
    g.add(P().mesh(new THREE.CylinderGeometry(1.6 * S, 1.9 * S, 4 * S, 20), ghost(), 0, 6 * S, 0, { cast: false }));
    // pauldrons
    g.add(P().mesh(new THREE.SphereGeometry(0.9 * S, 16, 12), ghost(), -1.7 * S, 8 * S, 0, { cast: false }));
    g.add(P().mesh(new THREE.SphereGeometry(0.9 * S, 16, 12), ghost(), 1.7 * S, 8 * S, 0, { cast: false }));
    // arms
    g.add(P().mesh(new THREE.CylinderGeometry(0.5 * S, 0.6 * S, 4 * S, 12), ghost(), -2.0 * S, 6 * S, 0, { cast: false }));
    g.add(P().mesh(new THREE.CylinderGeometry(0.5 * S, 0.6 * S, 4 * S, 12), ghost(), 2.0 * S, 6 * S, 0, { cast: false }));
    // legs
    g.add(P().mesh(new THREE.CylinderGeometry(0.7 * S, 0.8 * S, 4.5 * S, 12), ghost(), -0.9 * S, 2 * S, 0, { cast: false }));
    g.add(P().mesh(new THREE.CylinderGeometry(0.7 * S, 0.8 * S, 4.5 * S, 12), ghost(), 0.9 * S, 2 * S, 0, { cast: false }));
    // head + great helm with plumed crest (echo of chapter I)
    g.add(P().mesh(new THREE.SphereGeometry(1.1 * S, 18, 14), ghost(), 0, 9.2 * S, 0, { cast: false }));
    const crestMat = new THREE.MeshStandardMaterial({ color: 0x2a2436, emissive: 0x1a1626, roughness: 0.8, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, rr = 0.2 + Math.random() * 0.6;
      const pl = P().mesh(new THREE.ConeGeometry(0.12 * S, (2 + Math.random() * 2) * S, 5), crestMat, Math.cos(a) * rr * S, 10.6 * S, Math.sin(a) * rr * S, { cast: false });
      pl.rotation.z = -Math.cos(a) * 0.5; pl.rotation.x = Math.sin(a) * 0.5;
      g.add(pl);
    }
    // a colossal sword held point-down
    const swordMat = ghost();
    const blade = P().mesh(new THREE.BoxGeometry(0.5 * S, 8 * S, 0.2 * S), swordMat, 2.6 * S, 2 * S, 1.4 * S, { cast: false });
    g.add(blade);
    world.add(g);
    return g;
  }

  function addGlory(world, x, y, z) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: OTR.materials.lib.glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
    glow.position.set(x, y, z); glow.scale.set(80, 80, 1);
    glow.layers.set(1); // skipped by the postfx depth prepass
    world.add(glow);
    const s = performance.now();
    world.addUpdater(() => { glow.material.opacity = Math.min(1, (performance.now() - s) / 3000); });
  }

})(window.OTR);
