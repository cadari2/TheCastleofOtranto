/* audio.js — fully procedural sound via WebAudio. No audio files.
   Ambience beds (wind, birds, drones, sea), plus one-shots (footsteps,
   bells, stingers, thunder, sword clashes). Everything is synthesized. */
'use strict';
(function (OTR) {

  const A = OTR.audio = {};
  let ctx = null, master = null, ambientGain = null, started = false;
  const beds = {}; // name -> {gain, nodes, stop}

  A.init = function () {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    ambientGain = ctx.createGain(); ambientGain.gain.value = 1; ambientGain.connect(master);
    A.ctx = ctx;
  };
  A.resume = function () { if (ctx && ctx.state === 'suspended') ctx.resume(); started = true; };
  A.setMaster = function (v) { if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.2); };

  function noiseBuffer(seconds = 2) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- ambience beds ----------
  function bed(name) { return beds[name]; }

  function makeWind(strength) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(3); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(ambientGain);
    src.start();
    // slow gusting
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG); lfoG.connect(bp.frequency); lfo.start();
    g.gain.setTargetAtTime(strength, ctx.currentTime, 3);
    return { g, stop: () => { try { src.stop(); lfo.stop(); } catch (e) {} } };
  }

  function makeDrone(freqs, gainv) {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(ambientGain);
    const oscs = freqs.map(f => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 1 / freqs.length;
      const det = ctx.createOscillator(); det.frequency.value = 0.05 + Math.random() * 0.1;
      const detg = ctx.createGain(); detg.gain.value = f * 0.006;
      det.connect(detg); detg.connect(o.frequency); det.start();
      o.connect(og); og.connect(g); o.start();
      return o;
    });
    g.gain.setTargetAtTime(gainv, ctx.currentTime, 4);
    return { g, stop: () => oscs.forEach(o => { try { o.stop(); } catch (e) {} }) };
  }

  function makeSea() {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(4); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(ambientGain);
    src.connect(lp); lp.connect(g); src.start();
    // wave swell
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.10;
    const base = ctx.createConstantSource(); base.offset.value = 0.14; base.start();
    lfo.connect(lfoG); lfoG.connect(g.gain); base.connect(g.gain); lfo.start();
    return { g, stop: () => { try { src.stop(); lfo.stop(); base.stop(); } catch (e) {} } };
  }

  let birdTimer = null;
  function startBirds() {
    function chirp() {
      if (!bed('birds')) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const f0 = 1800 + Math.random() * 2400;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.5), t + 0.08);
      g.gain.linearRampToValueAtTime(0.05 * beds.birds.level, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12 + Math.random() * 0.1);
      o.connect(g);
      if (pan) { pan.pan.value = Math.random() * 2 - 1; g.connect(pan); pan.connect(ambientGain); }
      else g.connect(ambientGain);
      o.start(t); o.stop(t + 0.3);
      // occasional trill
      if (Math.random() < 0.4) setTimeout(chirp, 90 + Math.random() * 90);
      birdTimer = setTimeout(chirp, 500 + Math.random() * 2600);
    }
    chirp();
  }

  // Public: choose an ambience profile per chapter
  A.setAmbience = function (profile) {
    A.stopAmbience();
    if (!ctx) return;
    if (profile.wind) beds.wind = makeWind(profile.wind);
    if (profile.birds) { beds.birds = { level: profile.birds, stop: () => {} }; startBirds(); }
    if (profile.drone) beds.drone = makeDrone(profile.drone.freqs, profile.drone.gain);
    if (profile.sea) beds.sea = makeSea();
  };
  A.stopAmbience = function () {
    if (birdTimer) { clearTimeout(birdTimer); birdTimer = null; }
    Object.keys(beds).forEach(k => { try { beds[k].stop && beds[k].stop(); } catch (e) {} delete beds[k]; });
  };

  // ---------- one-shots ----------
  A.footstep = function (hard) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = hard ? 1300 : 520; bp.Q.value = hard ? 1.2 : 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(hard ? 0.12 : 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + (hard ? 0.09 : 0.14));
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.2);
  };

  A.bell = function (n = 1, base = 220) {
    if (!ctx) return;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 1.6;
      [1, 2.01, 2.99, 4.2, 5.4].forEach((h, k) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * h;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16 / (k + 1), t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0002, t + 3.4 / (k * 0.5 + 1));
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 4);
      });
    }
  };

  A.thunder = function () {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0002, t + 2.6);
    lp.frequency.linearRampToValueAtTime(60, t + 2.5);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 3);
  };

  // low dread stinger for supernatural beats
  A.stinger = function (kind) {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'rise') {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const g = ctx.createGain(); g.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      o.frequency.setValueAtTime(40, t); o.frequency.exponentialRampToValueAtTime(160, t + 3.5);
      g.gain.linearRampToValueAtTime(0.22, t + 2.5); g.gain.exponentialRampToValueAtTime(0.0002, t + 4.5);
      o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + 4.6);
    } else { // 'hit'
      const o = ctx.createOscillator(); o.type = 'triangle';
      const g = ctx.createGain(); g.gain.value = 0;
      o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
      g.gain.linearRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0002, t + 1.2);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.3);
      A.thunder();
    }
  };

  A.sword = function () {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.3);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0004, t + 0.25);
    bp.frequency.exponentialRampToValueAtTime(1400, t + 0.2);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.3);
    // metallic ring
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2600;
    const og = ctx.createGain(); og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.0002, t + 0.4);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.4);
  };

  A.heartbeat = function () {
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.28].forEach((d, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.28 - i * 0.1, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0002, t + d + 0.22);
      o.connect(g); g.connect(master); o.start(t + d); o.stop(t + d + 0.3);
    });
  };

  A.whisper = function () {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(1.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.05, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0002, t + 1.4);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6; const lg = ctx.createGain(); lg.gain.value = 800;
    lfo.connect(lg); lg.connect(bp.frequency); lfo.start(t);
    src.connect(bp); bp.connect(g); g.connect(master); src.start(t); src.stop(t + 1.5); lfo.stop(t + 1.5);
  };

  A.chord = function (freqs, dur = 3, vol = 0.14) {
    if (!ctx) return;
    const t = ctx.currentTime;
    freqs.forEach(f => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(vol / freqs.length, t + 0.6);
      g.gain.linearRampToValueAtTime(vol / freqs.length, t + dur - 1);
      g.gain.exponentialRampToValueAtTime(0.0002, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.1);
    });
  };

  A.click = function () {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 660;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0002, t + 0.1);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.1);
  };

})(window.OTR);
