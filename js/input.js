/* input.js — keyboard + pointer-lock mouse look. */
'use strict';
(function (OTR) {

  const I = OTR.input = {
    keys: {}, mouseDX: 0, mouseDY: 0, locked: false,
    sensitivity: 0.0022, invertY: false,
    interactPressed: false, spacePressed: false, escPressed: false,
    enabled: false
  };

  const canvas = () => document.getElementById('view');

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (I.keys[e.code]) return; // ignore auto-repeat for "pressed" edges
    I.keys[e.code] = true;
    if (e.code === 'KeyE' || e.code === 'Enter') I.interactPressed = true;
    if (e.code === 'Space') I.spacePressed = true;
    if (e.code === 'Escape') I.escPressed = true;
  });
  window.addEventListener('keyup', (e) => { I.keys[e.code] = false; });
  window.addEventListener('blur', () => { I.keys = {}; });

  document.addEventListener('pointerlockchange', () => {
    I.locked = (document.pointerLockElement === canvas());
    OTR.events.emit('pointerlock', I.locked);
  });

  document.addEventListener('mousemove', (e) => {
    if (!I.locked) return;
    I.mouseDX += e.movementX || 0;
    I.mouseDY += e.movementY || 0;
  });

  I.requestLock = function () {
    const c = canvas();
    if (c && c.requestPointerLock) c.requestPointerLock();
  };
  I.exitLock = function () {
    if (document.exitPointerLock) document.exitPointerLock();
  };

  // Consume-and-clear edge flags each frame
  I.consume = function () {
    const r = {
      interact: I.interactPressed, space: I.spacePressed, esc: I.escPressed,
      dx: I.mouseDX, dy: I.mouseDY
    };
    I.interactPressed = false; I.spacePressed = false; I.escPressed = false;
    I.mouseDX = 0; I.mouseDY = 0;
    return r;
  };

  I.moveVector = function () {
    let f = 0, s = 0;
    if (I.keys['KeyW'] || I.keys['ArrowUp']) f += 1;
    if (I.keys['KeyS'] || I.keys['ArrowDown']) f -= 1;
    if (I.keys['KeyD'] || I.keys['ArrowRight']) s += 1;
    if (I.keys['KeyA'] || I.keys['ArrowLeft']) s -= 1;
    return { f, s, run: !!(I.keys['ShiftLeft'] || I.keys['ShiftRight']) };
  };

})(window.OTR);
