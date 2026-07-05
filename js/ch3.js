/* ch3.js — Chapter III: The Black Tower.
   Night. Theodore is imprisoned at the top of the black tower. Matilda,
   moved by charity, unbolts the door and frees him. He descends through the
   moonlit castle — the great gallery with Alfonso's portrait, the chamber
   where the giant armoured limb was glimpsed, the armoury — and slips out the
   postern gate, whither Matilda points him toward the forest and the sea. */
'use strict';
(function (OTR) {
  OTR.chapters = OTR.chapters || {};
  const P = () => OTR.props;
  const F = () => OTR.figures;
  const L = () => OTR.materials.lib;

  // Two sub-areas, spatially separated and bridged by a fade:
  const CELL = { x: 0, z: 0 };
  const HALL = { x: 200, z: 0 };

  OTR.chapters[3] = {
    name: 'The Black Tower',
    quote: '&ldquo;Fly; the doors of thy prison are open&hellip; may the angels of heaven direct thy course!&rdquo;',
    ambience: { wind: 0.14, drone: { freqs: [40, 60], gain: 0.04 } },

    build(world, ctx) {
      const scene = world.scene;
      // ---- night sky & light ----
      scene.add(OTR.materials.makeSky(0x0a1226, 0x1a2740, 0x20263a));
      scene.environment = OTR.materials.makeEnv(0x24304e, 0x141a2c, 0x0a0c14);
      world.setFog(0x0c1020, 20, 150);
      const moon = world.sun(0x9fb0d8, 0.9, new THREE.Vector3(-40, 46, -30), 0x2a3860, 0.32);
      moon.shadow.camera.far = 260;
      OTR.game.renderer.toneMappingExposure = 1.06;
      document.getElementById('vignette').style.opacity = 0.78;
      // the moon itself
      addMoon(world, -120, 90, -110);

      world.hardFloor = true;
      OTR.player.eyeHeight = 1.68;

      buildCell(world, ctx);
      buildInterior(world, ctx);

      if (ctx.startBeat === 'interior') { enterInterior(world, ctx, true); return; }

      // start in the cell, looking out the window
      OTR.player.reset(CELL.x, CELL.z + 1, Math.PI); // face the window (north wall)
      ctx.freeze(true);
      OTR.ui.setObjective(null);
      setTimeout(() => runCellIntro(world, ctx), 600);
    }
  };

  function addMoon(world, x, y, z) {
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: OTR.materials.lib.glowTex, color: 0xdfe6ff, transparent: true, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    moon.position.set(x, y, z); moon.scale.set(40, 40, 1); world.add(moon);
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: OTR.materials.lib.glowTex, color: 0xffffff, fog: false, depthWrite: false }));
    disc.position.set(x, y, z); disc.scale.set(12, 12, 1); world.add(disc);
  }

  // ---------------- the tower cell ----------------
  function buildCell(world, ctx) {
    const { x, z } = CELL, H = 3.4, w = 6, d = 6;
    P().floor(world, x, z, w, d, 0, L().vaultStone);
    P().ceiling(world, x, z, w + 1, d + 1, H, L().vaultStone);
    // walls: north wall has a barred window (gap)
    P().wall(world, x - w / 2, z - d / 2, x - w / 2, z + d / 2, H, 0.5, L().vaultStone); // west
    P().wall(world, x + w / 2, z - d / 2, x + w / 2, z + d / 2, H, 0.5, L().vaultStone); // east
    P().wall(world, x - w / 2, z + d / 2, x + w / 2, z + d / 2, H, 0.5, L().vaultStone); // south (door side)
    // north wall in two pieces around a window
    P().wall(world, x - w / 2, z - d / 2, x - 1.1, z - d / 2, H, 0.5, L().vaultStone);
    P().wall(world, x + 1.1, z - d / 2, x + w / 2, z - d / 2, H, 0.5, L().vaultStone);
    P().wall(world, x - 1.1, z - d / 2, x + 1.1, z - d / 2, 1.0, 0.5, L().vaultStone); // sill
    P().wall(world, x - 1.1, z - d / 2, x + 1.1, z - d / 2, 0.8, 0.5, L().vaultStone, { baseY: H - 0.8 }); // lintel
    // window bars
    for (let i = -1; i <= 1; i++) {
      const bar = P().mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), L().darkIron, x + i * 0.5, 1.9, z - d / 2);
      world.add(bar);
    }
    // pallet bed
    world.add(P().mesh(new THREE.BoxGeometry(1.1, 0.3, 2.2), L().wood, x + 1.6, 0.25, z + 1.4));
    world.add(P().mesh(new THREE.BoxGeometry(1.0, 0.18, 2.0), L().dirt, x + 1.6, 0.45, z + 1.4));
    // a night vista beyond the window: distant moonlit rooftops & hills, set low
    buildVista(world, x, z - d / 2 - 4);
    // faint moonlight through the window
    const win = new THREE.PointLight(0x9fb0d8, 1.2, 10, 2); win.position.set(x, 2.2, z - d / 2 + 0.6); world.add(win);
    // the door (south), bolted
    world._cellDoor = P().door(world, x, z + d / 2 - 0.1, 0, 2, 2.6, L().planks);
  }

  function buildVista(world, x, z) {
    // rooftops below the window line
    for (let i = 0; i < 24; i++) {
      const rx = x + (Math.random() - 0.5) * 60, rz = z - Math.random() * 50;
      const hgt = 2 + Math.random() * 4;
      const roof = P().mesh(new THREE.ConeGeometry(2 + Math.random() * 2, hgt, 4), L().roof, rx, -6 + hgt / 2 - Math.random() * 3, rz, { cast: false });
      roof.rotation.y = Math.random() * Math.PI; world.add(roof);
    }
    // hills further out
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x161e30, roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const hill = P().mesh(new THREE.SphereGeometry(30 + Math.random() * 20, 16, 8), hillMat, x + (Math.random() - 0.5) * 200, -34, z - 60 - Math.random() * 80, { cast: false });
      world.add(hill);
    }
  }

  async function runCellIntro(world, ctx) {
    await ctx.say([
      { name: '', text: '<span class="dim">The top of the black tower. Below, the castle sleeps under the moon. The gates are locked; you are guarded &mdash; or were.</span>' },
      { name: '', text: '<span class="dim">A bolt draws back. The door opens.</span>' },
    ]);
    // Matilda enters
    const matilda = F().matilda(world, CELL.x, CELL.z + 2.6);
    matilda.walkTo(CELL.x, CELL.z + 0.6, 1.2).then(() => matilda.facePlayer());
    await new Promise(r => setTimeout(r, 900));
    world._cellDoor.open();
    await ctx.say([
      { name: 'Matilda', text: 'Young man&mdash;though filial duty and womanly modesty condemn the step I take, holy charity justifies it.' },
      { name: 'Matilda', text: 'Fly; the doors of thy prison are open. My father and his domestics are absent; but they may soon return.' },
      { name: 'Theodore', text: 'Thou art surely one of those angels! None but a blessed saint could look like thee.' },
      { name: 'Matilda', text: 'Avoid the western side; the search is there. Descend, and go with heaven. Sometimes in thy prayers&mdash;remember Matilda.' },
    ]);
    OTR.audio.stinger('rise');
    await OTR.ui.fadeOut(1500);
    enterInterior(world, ctx, false);
  }

  // ---------------- the castle interior ----------------
  function buildInterior(world, ctx) {
    const { x, z } = HALL, H = 5;
    // long gallery running along +Z
    // gallery hall
    P().floor(world, x, z + 10, 8, 40, 0, L().checker);
    P().ceiling(world, x, z + 10, 9, 41, H, L().plaster);
    P().wall(world, x - 4, z - 10, x - 4, z + 30, H, 0.6, L().plaster);
    P().wall(world, x + 4, z - 10, x + 4, z + 30, H, 0.6, L().plaster);
    // columns / arcade rhythm
    for (let i = 0; i < 5; i++) {
      P().column(world, x - 3.2, z - 6 + i * 8, H, 0.4, L().plaster);
      P().column(world, x + 3.2, z - 6 + i * 8, H, 0.4, L().plaster);
    }
    // wall torches
    for (let i = 0; i < 4; i++) {
      P().wallTorch(world, x - 3.7, 2.6, z - 4 + i * 8, 0, { intensity: 2.0, distance: 10 });
      P().wallTorch(world, x + 3.7, 2.6, z - 2 + i * 8, Math.PI, { intensity: 2.0, distance: 10 });
    }
    // banners
    P().banner(world, x - 3.6, 4.4, z + 2, Math.PI / 2, 0x6a1220);
    P().banner(world, x + 3.6, 4.4, z + 14, -Math.PI / 2, 0x1a3a5a);

    // Alfonso's portrait, at the far end, softly lit (the resemblance!)
    world._alfonso = P().portrait(world, x, 2.4, z + 29.6, Math.PI, 'alfonso', 2.4, 3.6);
    const portraitLight = new THREE.SpotLight(0xffe0b0, 2.2, 14, 0.6, 0.6); portraitLight.position.set(x, 4.6, z + 26); portraitLight.target.position.set(x, 2.4, z + 30); world.scene.add(portraitLight); world.scene.add(portraitLight.target);
    // grandsire portrait on a side wall
    P().portrait(world, x - 3.8, 2.6, z + 6, Math.PI / 2, 'grandsire', 1.8, 2.8);

    // the gallery-chamber to the side: a glimpse of the giant armoured leg
    P().wall(world, x + 4, z - 10, x + 12, z - 10, H, 0.6, L().plaster);
    P().wall(world, x + 12, z - 10, x + 12, z - 2, H, 0.6, L().plaster);
    P().wall(world, x + 4, z - 2, x + 12, z - 2, H, 0.6, L().plaster);
    P().floor(world, x + 8, z - 6, 8, 8, 0, L().vaultStone);
    P().archway(world, x + 4, z - 6, Math.PI / 2, 2.6, 3.6, 0.6, L().plaster); // doorway into it
    world._giantFoot = P().giantFoot(world, x + 8.5, 0, z - 6, -0.5);
    world._giantFoot.visible = true;
    const footGlow = new THREE.PointLight(0x6f8fd0, 1.6, 12, 2); footGlow.position.set(x + 8, 3, z - 6); world.add(footGlow);

    // armoury alcove near the start
    P().floor(world, x, z - 8, 8, 6, 0, L().vaultStone);
    P().wall(world, x - 4, z - 11, x + 4, z - 11, H, 0.6, L().plaster);
    // racks of arms
    for (let i = -2; i <= 2; i++) {
      const spear = P().mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), L().wood, x + i * 0.6, 1.5, z - 10.6);
      world.add(spear);
    }
    // the sword & suit of armour to take
    const armourStand = P().mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 10), L().metal, x - 2.5, 0.8, z - 9.6);
    world.add(armourStand);
    world._armour = F().make(world, x - 2.5, z - 9.6, { color: 0x2a2c33, armor: true, armorColor: 0x6a7280, height: 1.75, hood: false });
    world._armour.userData.taken = false;

    // postern gate at the near end (south, -Z)
    P().archway(world, x, z - 10.5, 0, 3, 4, 0.8, L().stoneWall, { collide: false });
    world._postern = P().door(world, x, z - 10.9, 0, 2.6, 3.2, L().planks);
  }

  function enterInterior(world, ctx, resumed) {
    ctx.checkpoint('interior');
    const { x, z } = HALL;
    // hide the cell area lights bleed by moving player far away
    OTR.player.reset(x, z + 26, Math.PI); // start at the far (Alfonso) end, facing back down the gallery
    OTR.player.pos.set(x, OTR.player.eyeHeight, z + 26);
    OTR.player.yaw = Math.PI; // face -Z, toward the postern
    OTR.audio.setAmbience({ wind: 0.05, drone: { freqs: [44, 66], gain: 0.04 } });

    let sawPortrait = false;
    world.addInteractable({
      x: x, z: z + 28, r: 4, prompt: 'Look upon the portrait of Alfonso the Good',
      onUse: async () => {
        sawPortrait = true;
        await ctx.say([
          { name: '', text: '<span class="dim">The good prince Alfonso, in painted armour. His face&mdash;you have seen it before. You have seen it in a glass.</span>' },
          { name: 'Theodore', text: 'Why does my blood stir so, to look on a coloured panel?' },
        ]);
        OTR.audio.whisper();
      }
    });

    ctx.freeze(false);
    setTimeout(() => {
      ctx.objective('Descend through the gallery &mdash; find arms, and the postern gate');
      OTR.ui.toast('A hollow groan sounds somewhere above&hellip;', 4200);
      OTR.audio.whisper();
    }, resumed ? 200 : 300);

    // take the arms
    world.addInteractable({
      x: HALL.x - 2.5, z: HALL.z - 9.6, r: 2.4, once: true, prompt: 'Take up sword and armour',
      onUse: async () => {
        world._armour.visible = false;
        await ctx.say([
          { name: '', text: '<span class="dim">You equip yourself with a complete suit from the castle armoury, and take a sword.</span>' },
          { name: 'Theodore', text: 'Sanctuaries are for helpless damsels, or for criminals. Give me a sword, and let the tyrant learn Theodore scorns an ignominious flight.' },
        ]);
        world._hasArms = true;
        ctx.objective('Slip out by the postern gate to the east');
        OTR.ui.toast('The postern gate lies at the near end of the gallery.', 4000);
      }
    });

    // the giant limb glimpse trigger
    world.addTrigger({
      x: HALL.x + 5, z: HALL.z - 6, r: 4, onEnter: () => {
        OTR.audio.stinger('hit');
        OTR.ui.toast('&mdash; a foot and part of a leg, all clad in armour, large as the helmet in the court.');
      }
    });

    // postern gate exit
    world.addInteractable({
      x: HALL.x, z: HALL.z - 10.5, r: 2.6, once: true, prompt: 'Go out by the postern gate',
      onUse: async () => {
        if (!world._hasArms) {
          OTR.ui.toast('Not yet&mdash;take arms from the armoury first. You will have need of them.');
          world.interactables.find(o => o.prompt && o.prompt.indexOf('postern') >= 0).used = false;
          return;
        }
        ctx.freeze(true);
        world._postern.open();
        await new Promise(r => setTimeout(r, 500));
        await ctx.say([
          { name: 'Matilda (from the wall)', text: 'Avoid the town, and all the western side. Yonder behind the forest to the east is a chain of rocks, hollowed into a labyrinth of caverns that reach to the sea coast.' },
          { name: 'Matilda', text: 'There thou mayst lie concealed, till thou canst make signs to some vessel. Go! Heaven be thy guide.' },
          { name: 'Theodore', text: 'I will get myself knighted, and swear myself eternally her knight. Farewell, Matilda.' },
        ]);
        OTR.audio.thunder();
        await OTR.ui.fadeOut(1600);
        ctx.win();
      }
    });
  }

})(window.OTR);
