/* relics.js — five hidden keepsakes, one per chapter, each with a short
   note in the voice of the tale. Finding them is optional; the tally shows
   on the title and pause screens and persists in localStorage. The notes
   below are original writing for this game (GPLv3), not Walpole's text. */
'use strict';
(function (OTR) {

  const R = OTR.relics = {};
  const KEY = 'otranto.relics';

  R.list = [
    { id: 'plume', chapter: 1, name: 'A feather from the plume',
      text: 'Black, and longer than a man&rsquo;s arm. It fell from the casque when the crowd first cried out. It is warm, as if lately worn.' },
    { id: 'veil', chapter: 2, name: 'Isabella&rsquo;s veil',
      text: 'Torn on the stones of the dead passage. She came this way in the dark, with no lamp, and did not turn back.' },
    { id: 'leaf', chapter: 3, name: 'A leaf of Alfonso&rsquo;s chronicle',
      text: '&ldquo;&hellip;that the castle and lordship of Otranto should pass from the present family, whenever the real owner should be grown too large to inhabit it.&rdquo;' },
    { id: 'beads', chapter: 4, name: 'The hermit&rsquo;s beads',
      text: 'Left on the cave floor by the holy man who buried the sabre. The knots are worn smooth by one thumb, for years.' },
    { id: 'breviary', chapter: 5, name: 'Friar Jerome&rsquo;s breviary',
      text: 'The pages fall open at the prayer for the dead. A pressed flower marks it, and a name: <em>Matilda</em>.' },
  ];

  R.found = function () {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  };
  R.has = (id) => R.found().indexOf(id) >= 0;
  R.count = () => R.found().length;
  R.clear = () => { try { localStorage.removeItem(KEY); } catch (e) {} };
  function mark(id) {
    const f = R.found();
    if (f.indexOf(id) < 0) f.push(id);
    try { localStorage.setItem(KEY, JSON.stringify(f)); } catch (e) {}
  }

  // Place a relic in the world at (x, z) resting at y above the ground.
  R.place = function (world, id, x, z, y = 0.35) {
    const rel = R.list.find(r => r.id === id);
    if (!rel) return null;
    const lib = OTR.materials.lib;
    const g = new THREE.Group();
    const gy = world.groundHeight(x, z);
    g.position.set(x, gy + y, z);
    // a small gilt reliquary: it glints, so it can be spotted from a way off
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.15), lib.gold);
    body.castShadow = false; body.receiveShadow = true;
    g.add(body);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.22, 10, 1, false, 0, Math.PI), lib.gold);
    lid.rotation.z = Math.PI / 2; lid.position.y = 0.07; lid.castShadow = false;
    g.add(lid);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: lib.glowTex, color: 0xffd98a, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.35, fog: false
    }));
    glow.scale.set(0.9, 0.9, 1); glow.layers.set(1); g.add(glow);
    const light = new THREE.PointLight(0xffc870, 0.7, 4, 2); g.add(light);
    world.add(g);
    const found = R.has(id);
    if (found) { glow.material.opacity = 0.12; light.intensity = 0.25; }
    world.addUpdater((dt, e) => {
      g.rotation.y = e * 0.6;
      g.position.y = gy + y + Math.sin(e * 1.7) * 0.03;
      if (!found) glow.material.opacity = 0.28 + 0.12 * Math.sin(e * 3);
    });
    world.addInteractable({
      x, z, r: 2.0, once: true, prompt: found ? 'Look again at ' + rel.name.toLowerCase() : 'Examine the thing that glints',
      onUse: async () => {
        OTR.audio.chord && OTR.audio.chord([392, 523.3, 659.3], 2.2, 0.06);
        const first = !R.has(id);
        mark(id);
        await OTR.ui.say([{ name: rel.name, text: rel.text }]);
        if (first) OTR.ui.toast(`Relic ${R.count()} of ${R.list.length} found`, 3000);
        glow.material.opacity = 0.12; light.intensity = 0.25;
        OTR.relics.onChange && OTR.relics.onChange();
      }
    });
    return g;
  };

})(window.OTR);
