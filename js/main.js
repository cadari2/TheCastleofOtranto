/* main.js — renderer, game loop, chapter manager, saves, menus, debug hooks. */
'use strict';
(function (OTR) {

  const G = OTR.game = {
    running: false, paused: false,
    chapter: 0, beat: null,
    world: null, scene: null, camera: null, renderer: null,
    ctx: null, transitioning: false, postfx: null
  };

  const SAVE_KEY = 'otranto.save.v1';
  const CHAPTER_META = [
    null,
    { name: 'The Helmet', total: 5 },
    { name: 'The Vaults', total: 5 },
    { name: 'The Black Tower', total: 5 },
    { name: 'The Wood and the Shore', total: 5 },
    { name: 'The Tomb of Alfonso', total: 5 },
  ];

  // ---------------- renderer ----------------
  function initRenderer() {
    const canvas = document.getElementById('view');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    G.renderer = renderer;

    const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 1200);
    G.camera = camera;
    OTR.player.camera = camera;

    // Optional bloom post-processing. If it fails to initialise for any reason
    // we simply render straight to the canvas (G.postfx stays null).
    try {
      if (OTR.PostFX) G.postfx = new OTR.PostFX(renderer);
    } catch (e) { console.warn('post-processing disabled:', e); G.postfx = null; }

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (G.postfx) {
        const s = renderer.getDrawingBufferSize(new THREE.Vector2());
        G.postfx.setSize(s.x, s.y);
      }
    });
  }

  function renderScene() {
    if (G.postfx) G.postfx.render(G.scene, G.camera);
    else G.renderer.render(G.scene, G.camera);
  }

  function initGrain() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL();
    const el = document.getElementById('grain');
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundRepeat = 'repeat';
    let x = 0;
    setInterval(() => { x = (x + 7) % 128; el.style.backgroundPosition = `${x}px ${(x * 2) % 128}px`; }, 60);
  }

  // ---------------- chapter lifecycle ----------------
  function makeCtx() {
    return {
      chapter: G.chapter,
      startBeat: G.beat,
      // scripted-dialogue helpers
      say: (lines) => OTR.ui.say(lines),
      objective: (t) => OTR.ui.setObjective(t),
      toast: (t, ms) => OTR.ui.toast(t, ms),
      qte: (label, key, ms) => OTR.ui.qte(label, key, ms),
      // flow
      checkpoint: (beatId) => { G.beat = beatId; persist(); },
      win: () => nextChapter(),
      fail: (beatId, message) => failToCheckpoint(beatId, message),
      goChapter: (n, beat) => startChapter(n, beat),
      freeze: (v) => { OTR.player.frozen = v; },
      ending: () => showEnding(),
    };
  }

  async function startChapter(n, beat = null) {
    if (G.transitioning) return;
    G.transitioning = true;
    G.chapter = n; G.beat = beat;
    persist();

    // teardown old (geometry disposal is deferred until the screen is black —
    // see below — so the render loop cannot re-upload buffers we are freeing).
    OTR.audio.stopAmbience();
    OTR.events.clear();
    OTR.ui.resetDialogue();
    OTR.ui.init();
    OTR.player.frozen = false;
    OTR.ui.hideAllHud();
    OTR.ui.toast('', 0);
    document.getElementById('toast').style.opacity = 0;
    OTR.ui.letterbox(false);
    document.getElementById('damage').style.opacity = 0;
    OTR.game.renderer.toneMappingExposure = 1.05;

    await OTR.ui.fadeOut(600);

    // Dispose the previous world now, while the screen is faded to black. The
    // scene reference is dropped *first* and no `await` runs before the new
    // scene is assigned, so the animation loop cannot render (and thus
    // re-upload to the GPU) the geometries we are about to free. Disposing
    // before the fade — as this used to — left `transitioning` true while the
    // loop kept rendering the old scene, re-registering every freed geometry as
    // an orphan and leaking GPU memory until the WebGL context was lost.
    if (G.world) {
      const old = G.world;
      G.world = null; G.scene = null;
      old.dispose();
    }

    // new scene/world
    const scene = new THREE.Scene();
    G.scene = scene;
    const world = new OTR.World(scene, G.renderer);
    G.world = world;
    OTR.player.setWorld(world);

    const ctx = makeCtx();
    G.ctx = ctx;

    const chapter = OTR.chapters[n];
    if (!chapter) { console.error('No chapter', n); G.transitioning = false; return; }

    // build geometry & script
    chapter.build(world, ctx);

    // set ambience
    if (chapter.ambience) OTR.audio.setAmbience(chapter.ambience);

    G.running = true; G.paused = false;
    G.transitioning = false;

    // chapter title card (skip if resuming mid-chapter via debug)
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');

    if (!beat && chapter.card !== false) {
      await OTR.ui.fadeIn(200);
      await OTR.ui.chapterCard(
        'Chapter ' + toRoman(n),
        chapter.name,
        chapter.quote || ''
      );
    }
    await OTR.ui.fadeIn(1200);

    // request pointer lock
    if (!OTR.input.locked) OTR.input.requestLock();

    // kick off scripted intro if present
    if (chapter.onEnter) chapter.onEnter(world, ctx);
  }

  function nextChapter() {
    const n = G.chapter + 1;
    if (n > 5) { showEnding(); return; }
    startChapter(n, null);
  }

  async function failToCheckpoint(beatId, message) {
    if (G.transitioning) return;
    OTR.ui.damage();
    await OTR.ui.fadeOut(900);
    if (message) OTR.ui.toast(message, 2600);
    startChapter(G.chapter, beatId !== undefined ? beatId : G.beat);
  }

  // ---------------- ending ----------------
  async function showEnding() {
    G.running = false;
    OTR.audio.stopAmbience();
    OTR.ui.hideAllHud();
    OTR.input.exitLock();
    await OTR.ui.fadeOut(2000);
    OTR.audio.chord && OTR.audio.chord([196, 261.6, 329.6, 392], 8, 0.12);

    let scr = document.getElementById('ending-screen');
    if (!scr) {
      scr = document.createElement('div'); scr.id = 'ending-screen';
      scr.innerHTML = `<div class="inner"></div>`;
      document.getElementById('app').appendChild(scr);
    }
    const inner = scr.querySelector('.inner');
    inner.innerHTML = `
      <h2>&#10087;</h2>
      <p>Manfred signed his abdication of the principality, and each took on
      them the habit of religion in the neighbouring convents.</p>
      <p>Frederic offered his daughter to the new Prince; but Theodore's grief
      was too fresh to admit the thought of another love. It was not until
      after frequent discourses with Isabella of his dear Matilda, that he was
      persuaded he could know no happiness but in the society of one with whom
      he could for ever indulge the melancholy that had taken possession of
      his soul.</p>
      <p style="margin-top:34px;color:#8f8468;font-size:15px">In Theodore we view the true Prince of Otranto.</p>
      <p style="margin-top:26px;color:#7a7058;font-size:14px;font-style:normal;letter-spacing:.2em">THE END</p>
      <button id="btn-ending" class="menu-btn" style="margin-top:30px">Return to the Title</button>
    `;
    document.getElementById('fade').style.opacity = 0;
    scr.style.opacity = 1;
    document.getElementById('btn-ending').onclick = () => {
      scr.style.opacity = 0;
      setTimeout(() => { scr.classList.add('hidden'); toTitle(); }, 1500);
    };
    // mark completion
    try { localStorage.setItem('otranto.completed', '1'); } catch (e) {}
  }

  // ---------------- pause ----------------
  function pauseGame() {
    if (!G.running || G.paused) return;
    G.paused = true;
    OTR.input.exitLock();
    document.getElementById('pause-screen').classList.remove('hidden');
    OTR.audio.setMaster(0.35);
  }
  function resumeGame() {
    if (!G.running) return;
    G.paused = false;
    document.getElementById('pause-screen').classList.add('hidden');
    OTR.audio.setMaster(0.9);
    OTR.input.requestLock();
  }
  function toTitle() {
    G.running = false; G.paused = false;
    if (G.world) { G.world.dispose(); G.world = null; }
    OTR.audio.stopAmbience();
    OTR.input.exitLock();
    OTR.ui.hideAllHud();
    document.getElementById('fade').style.opacity = 1;
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
    refreshMenu();
  }

  // ---------------- persistence ----------------
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ chapter: G.chapter, beat: G.beat })); } catch (e) {}
  }
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
  }

  // ---------------- loop ----------------
  let last = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);

    if (G.running && !G.paused && !G.transitioning) {
      // interaction / dialogue advance
      const inp = OTR.input;
      if (OTR.ui.isDialogue()) {
        if (inp.interactPressed || inp.spacePressed) { inp.interactPressed = false; inp.spacePressed = false; OTR.ui.advanceDialogue(); }
      } else {
        if (inp.interactPressed) { inp.interactPressed = false; G.world.tryInteract(); }
      }
      if (inp.escPressed) { inp.escPressed = false; pauseGame(); }

      OTR.player.update(dt);
      G.world.update(dt);
      renderScene();
    } else if (G.scene && G.camera) {
      renderScene();
    }
  }

  // advance dialogue on canvas click too
  document.getElementById('view').addEventListener('mousedown', () => {
    if (G.running && !G.paused && OTR.ui.isDialogue()) OTR.ui.advanceDialogue();
  });

  function toRoman(n) { return ['', 'I', 'II', 'III', 'IV', 'V'][n] || ('' + n); }

  // ---------------- menu wiring ----------------
  function refreshMenu() {
    const save = loadSave();
    const cont = document.getElementById('btn-continue');
    const chapBtn = document.getElementById('btn-chapters');
    if (save && save.chapter >= 1) {
      cont.classList.remove('hidden');
      cont.textContent = 'Continue — Chapter ' + toRoman(save.chapter) + ': ' + CHAPTER_META[save.chapter].name;
    } else cont.classList.add('hidden');

    const completed = (() => { try { return localStorage.getItem('otranto.completed'); } catch (e) { return null; } })();
    const maxCh = completed ? 5 : (save ? save.chapter : 1);
    chapBtn.classList.remove('hidden');
    const sel = document.getElementById('chapter-select');
    sel.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.textContent = toRoman(i) + '. ' + CHAPTER_META[i].name;
      b.disabled = i > maxCh;
      b.onclick = () => { OTR.audio.resume(); startChapter(i, null); };
      sel.appendChild(b);
    }
  }

  function boot() {
    initRenderer();
    OTR.materials.init(G.renderer);
    initGrain();
    OTR.ui.init();
    animate();

    document.getElementById('loading').classList.add('hidden');
    refreshMenu();

    const startBtn = document.getElementById('btn-start');
    startBtn.onclick = () => { OTR.audio.init(); OTR.audio.resume(); startChapter(1, null); };
    document.getElementById('btn-continue').onclick = () => {
      const s = loadSave(); OTR.audio.init(); OTR.audio.resume();
      startChapter(s.chapter, s.beat);
    };
    document.getElementById('btn-chapters').onclick = () => {
      OTR.audio.init();
      document.getElementById('chapter-select').classList.toggle('hidden');
    };
    document.getElementById('btn-resume').onclick = resumeGame;
    document.getElementById('btn-restart-beat').onclick = () => {
      document.getElementById('pause-screen').classList.add('hidden');
      G.paused = false;
      startChapter(G.chapter, G.beat);
    };
    document.getElementById('btn-quit').onclick = toTitle;

    // relock on canvas click if we lost lock mid-game (not paused)
    document.getElementById('view').addEventListener('click', () => {
      if (G.running && !G.paused && !OTR.input.locked && !G.transitioning) OTR.input.requestLock();
    });
    // Losing pointer lock mid-play (Esc, alt-tab, focus loss, or a browser that
    // auto-releases it) must pause the game rather than silently killing mouse
    // look. This is bound to the native event — not OTR.events — because
    // startChapter() calls OTR.events.clear() on every load, which previously
    // destroyed this handler after the first chapter and left the player
    // unable to look around with no way to recover but to click the canvas.
    document.addEventListener('pointerlockchange', () => {
      const locked = (document.pointerLockElement === document.getElementById('view'));
      if (!locked && G.running && !G.paused && !G.transitioning && !OTR.ui.isDialogue()) {
        pauseGame();
      }
    });
  }

  // ---------------- debug ----------------
  window.OTRDEBUG = {
    gotoChapter: (n, beat) => startChapter(n, beat || null),
    beat: () => G.beat,
    noclip: (on = true) => { OTR.player._noclip = on; if (on) { G.world.collidersNear = () => new Set(); } },
    teleport: (x, z) => { OTR.player.pos.x = x; OTR.player.pos.z = z; },
    pos: () => ({ x: +OTR.player.pos.x.toFixed(2), z: +OTR.player.pos.z.toFixed(2), yaw: +OTR.player.yaw.toFixed(2) }),
    win: () => nextChapter(),
    world: () => G.world,
    clearSave: () => { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('otranto.completed'); refreshMenu(); },
    skipCards: () => { [1,2,3,4,5].forEach(i => { if (OTR.chapters[i]) OTR.chapters[i].card = false; }); },
    ready: true
  };

  OTR.game.start = startChapter;
  OTR.game.nextChapter = nextChapter;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window.OTR);
