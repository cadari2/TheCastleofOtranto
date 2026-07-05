/* player.js — first-person controller: pointer-lock look, WASD move,
   AABB/circle collision against the active world, ground-height following,
   head-bob and footstep audio. */
'use strict';
(function (OTR) {

  const P = OTR.player = {
    pos: new THREE.Vector3(0, 1.7, 0),
    yaw: 0, pitch: 0,
    radius: 0.42, eyeHeight: 1.68, height: 1.7,
    speed: 3.1, runMul: 1.85,
    bob: 0, stepAccum: 0,
    frozen: false, canRun: true,
    world: null, camera: null,
  };

  P.reset = function (x, z, yaw) {
    P.pos.set(x, 0, z);
    P.yaw = yaw || 0; P.pitch = 0;
    P.bob = 0; P.stepAccum = 0; P.frozen = false;
    if (P.world) P.pos.y = P.world.groundHeight(x, z) + P.eyeHeight;
  };

  P.setWorld = function (w) { P.world = w; };

  P.forwardVec = function () {
    return new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  };

  // Move with sliding collision. Tries full move, then axis-separated.
  function tryMove(nx, nz) {
    const w = P.world;
    const feetY = P.pos.y - P.eyeHeight;
    let px = nx, pz = nz;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const colliders = w.collidersNear(px, pz, 2);
      for (const c of colliders) {
        const r = OTR.resolveCollider(c, px, pz, P.radius, feetY, P.height);
        if (r) { px = r[0]; pz = r[1]; moved = true; }
      }
      if (!moved) break;
    }
    return [px, pz];
  }

  P.update = function (dt) {
    const cam = P.camera;
    const inp = OTR.input;

    // ---- look ----
    if (!P.frozen && inp.locked) {
      const c = { dx: inp.mouseDX, dy: inp.mouseDY };
      inp.mouseDX = 0; inp.mouseDY = 0;
      P.yaw -= c.dx * inp.sensitivity;
      P.pitch -= c.dy * inp.sensitivity * (inp.invertY ? -1 : 1);
      P.pitch = OTR.clamp(P.pitch, -1.35, 1.35);
    }

    // ---- move ----
    let vx = 0, vz = 0, movingSpeed = 0;
    if (!P.frozen) {
      const mv = OTR.input.moveVector();
      if (mv.f || mv.s) {
        const fwd = P.forwardVec();
        const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
        let dir = new THREE.Vector3()
          .addScaledVector(fwd, mv.f)
          .addScaledVector(right, mv.s);
        if (dir.lengthSq() > 0) dir.normalize();
        let sp = P.speed * (mv.run && P.canRun ? P.runMul : 1);
        vx = dir.x * sp; vz = dir.z * sp;
        movingSpeed = sp;
      }
    }

    if (vx !== 0 || vz !== 0) {
      const nx = P.pos.x + vx * dt;
      const nz = P.pos.z + vz * dt;
      const [rx, rz] = tryMove(nx, nz);
      P.pos.x = rx; P.pos.z = rz;

      // footsteps
      P.stepAccum += Math.hypot(vx, vz) * dt;
      const stride = movingSpeed > P.speed * 1.2 ? 1.7 : 2.1;
      if (P.stepAccum > stride) {
        P.stepAccum = 0;
        OTR.audio.footstep && OTR.audio.footstep(P.world && P.world.hardFloor);
      }
      // head bob
      P.bob += Math.hypot(vx, vz) * dt * 2.4;
    } else {
      P.bob += dt * 0.6;
    }

    // ---- ground follow ----
    const gh = P.world ? P.world.groundHeight(P.pos.x, P.pos.z) : 0;
    const targetY = gh + P.eyeHeight;
    P.pos.y += (targetY - P.pos.y) * Math.min(1, dt * 12);

    // ---- apply to camera ----
    const bobY = Math.sin(P.bob * 3.1) * 0.045 * (movingSpeed ? 1 : 0.3);
    const bobX = Math.cos(P.bob * 1.55) * 0.03 * (movingSpeed ? 1 : 0.15);
    cam.position.set(P.pos.x, P.pos.y + bobY, P.pos.z);
    const fwd = P.forwardVec();
    const look = new THREE.Vector3(
      P.pos.x + fwd.x,
      P.pos.y + bobY + Math.tan(P.pitch),
      P.pos.z + fwd.z
    );
    cam.up.set(Math.sin(bobX * 0.5), 1, 0);
    cam.lookAt(look);
  };

  // Distance to a world point (2D)
  P.distTo = function (x, z) { return OTR.dist2D(P.pos.x, P.pos.z, x, z); };

})(window.OTR);
