/* ui.js — HUD, subtitles/dialogue, objectives, prompts, QTE, fades, cards. */
'use strict';
(function (OTR) {

  const el = (id) => document.getElementById(id);
  const UI = OTR.ui = {};

  let dialogueQueue = [];
  let dialogueActive = false;
  let dialogueResolve = null;
  let advanceLocked = false;

  UI.init = function () {
    // click a subtitle to advance
    OTR.events.on('advance', () => UI.advanceDialogue());
  };

  // ---------- fades ----------
  UI.fadeTo = function (opacity, ms) {
    const f = el('fade');
    f.style.transition = `opacity ${ms}ms ease`;
    // force reflow so transition applies
    void f.offsetWidth;
    f.style.opacity = opacity;
    return new Promise(res => setTimeout(res, ms));
  };
  UI.fadeIn = (ms = 1400) => UI.fadeTo(0, ms);
  UI.fadeOut = (ms = 1200) => UI.fadeTo(1, ms);

  UI.letterbox = function (on) { el('letterbox').classList.toggle('on', on); };

  // ---------- objective ----------
  UI.setObjective = function (text) {
    const o = el('objective'), t = el('objective-text');
    if (!text) { o.style.opacity = 0; return; }
    t.innerHTML = text;
    o.style.opacity = 1;
  };
  UI.flashObjective = function () {
    const o = el('objective');
    o.style.transition = 'opacity .15s'; o.style.opacity = 0.3;
    setTimeout(() => { o.style.transition = 'opacity 1s'; o.style.opacity = 1; }, 160);
  };

  // ---------- toast (small hint) ----------
  let toastT = null;
  UI.toast = function (text, ms = 3200) {
    const e = el('toast'); e.innerHTML = text; e.style.opacity = 1;
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(() => { e.style.opacity = 0; }, ms);
  };

  // ---------- interaction prompt ----------
  UI.showPrompt = function (text, key = 'E') {
    el('prompt-text').textContent = text;
    el('prompt-key').textContent = key;
    el('prompt').style.opacity = 1;
  };
  UI.hidePrompt = function () { el('prompt').style.opacity = 0; };

  // ---------- lamp meter ----------
  UI.showLamp = function (show) { el('lamp-meter').style.opacity = show ? 1 : 0; };
  UI.setLamp = function (frac) {
    el('lamp-fill').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
    el('lamp-fill').style.opacity = frac < 0.22 ? (0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 120))) : 1;
  };

  // ---------- crosshair ----------
  UI.showCrosshair = (show) => { el('crosshair').style.opacity = show ? 1 : 0; };

  // ---------- dialogue / subtitles ----------
  // lines: [{name, text, ms}] ; returns a promise resolving when finished.
  UI.say = function (lines) {
    if (!Array.isArray(lines)) lines = [lines];
    return new Promise((resolve) => {
      dialogueQueue = lines.slice();
      dialogueActive = true;
      dialogueResolve = resolve;
      UI.showCrosshair(false);
      showNextLine();
    });
  };

  let lineTimer = null;
  function showNextLine() {
    if (lineTimer) { clearTimeout(lineTimer); lineTimer = null; }
    if (dialogueQueue.length === 0) {
      hideSubtitle();
      dialogueActive = false;
      const r = dialogueResolve; dialogueResolve = null;
      UI.showCrosshair(true);
      if (r) r();
      return;
    }
    const line = dialogueQueue.shift();
    const s = el('subtitle');
    el('subtitle-name').textContent = line.name || '';
    el('subtitle-name').style.display = line.name ? 'block' : 'none';
    el('subtitle-text').innerHTML = line.text || '';
    s.style.opacity = 1;
    if (line.sound && OTR.audio[line.sound]) OTR.audio[line.sound]();
    advanceLocked = true;
    setTimeout(() => { advanceLocked = false; }, 350);
    const ms = line.ms || Math.max(1900, (line.text || '').length * 48);
    lineTimer = setTimeout(showNextLine, ms);
  }
  function hideSubtitle() { el('subtitle').style.opacity = 0; }

  UI.advanceDialogue = function () {
    if (!dialogueActive || advanceLocked) return;
    showNextLine();
  };
  UI.isDialogue = () => dialogueActive;

  // Hard reset — used when switching chapters so no dialogue/timers bleed over.
  UI.resetDialogue = function () {
    if (lineTimer) { clearTimeout(lineTimer); lineTimer = null; }
    dialogueQueue = [];
    dialogueActive = false;
    advanceLocked = false;
    const r = dialogueResolve; dialogueResolve = null;
    hideSubtitle();
    if (r) r(); // resolve any awaiting sequence so it can unwind
  };

  // ---------- QTE ----------
  // Returns promise<boolean> success. Player must press the key within window.
  UI.qte = function (label, key = 'SPACE', windowMs = 1100) {
    return new Promise((resolve) => {
      const q = el('qte'), ring = el('qte-ring');
      el('qte-key').textContent = key;
      el('qte-label').textContent = label;
      q.style.opacity = 1;
      let start = performance.now();
      let done = false;
      ring.style.transition = 'none';
      ring.style.transform = 'scale(1.6)';
      void ring.offsetWidth;
      ring.style.transition = `transform ${windowMs}ms linear`;
      ring.style.transform = 'scale(1.0)';

      function finish(ok) {
        if (done) return; done = true;
        q.style.opacity = 0;
        resolve(ok);
      }
      const checkT = setInterval(() => {
        if (done) { clearInterval(checkT); return; }
        if (OTR.input.spacePressed || OTR.input.interactPressed) {
          OTR.input.spacePressed = false; OTR.input.interactPressed = false;
          clearInterval(checkT);
          OTR.audio.sword && OTR.audio.sword();
          finish(true);
        } else if (performance.now() - start > windowMs) {
          clearInterval(checkT);
          finish(false);
        }
      }, 16);
    });
  };

  // ---------- chapter card ----------
  UI.chapterCard = function (num, name, quote) {
    return new Promise((resolve) => {
      el('chapter-num').textContent = num;
      el('chapter-name').textContent = name;
      el('chapter-quote').innerHTML = quote || '';
      const c = el('chapter-card');
      c.style.transition = 'opacity 2s'; c.style.opacity = 1;
      setTimeout(() => {
        c.style.opacity = 0;
        setTimeout(resolve, 2000);
      }, 3600);
    });
  };

  // ---------- damage flash ----------
  UI.damage = function () {
    const d = el('damage');
    d.style.transition = 'none'; d.style.opacity = 0.9; void d.offsetWidth;
    d.style.transition = 'opacity 0.8s'; d.style.opacity = 0;
    OTR.audio.heartbeat && OTR.audio.heartbeat();
  };

  UI.hideAllHud = function () {
    UI.setObjective(null); UI.hidePrompt(); UI.showLamp(false); UI.showCrosshair(false);
    hideSubtitle();
  };

})(window.OTR);
