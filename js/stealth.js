/* stealth.js — searchers, sight, and the detection meter.

   A searcher is a figure (usually a torch-bearing guard) that walks a
   waypoint loop, pausing to look about. Each frame it tests whether the
   player is inside its vision cone, within range, and unobstructed — a 2D
   segment test against the world's colliders, at the player's current eye
   height, so crouching behind a chest hides you but standing does not.
   Seen time fills a detection meter (faster when close, lit, or running);
   unseen time drains it. Past a threshold the searcher turns to look
   ("suspicious"); at full it seizes you and the chapter's onCaught runs.

   Player visibility multipliers: crouched ×0.55, running ×1.35, lamp lit
   ×1.5, lamp shuttered ×0.5. Running near a searcher is also *heard*, cone
   or no cone. The HUD eye and the heartbeat follow the meter. */
'use strict';
(function (OTR) {

  const S = OTR.stealth = {};

  // Does the 2D segment a→b cross a collider that is tall enough to hide an
  // eye at height `eyeY`? Circles (columns, figures) count at any height.
  function blocked(world, ax, az, bx, bz, eyeY, ignore) {
    for (const c of world.colliders) {
      if (c === ignore) continue;
      if (c.kind === 'aabb') {
        if (c.maxY < eyeY || c.minY > eyeY) continue;
        if (segAabb(ax, az, bx, bz, c.minX, c.minZ, c.maxX, c.maxZ)) return true;
      } else {
        if (c.r < 0.3) continue;            // retired / tiny colliders
        if (c.maxY < eyeY || c.minY > eyeY) continue;
        if (segCircle(ax, az, bx, bz, c.x, c.z, c.r)) return true;
      }
    }
    return false;
  }
  function segAabb(ax, az, bx, bz, x0, z0, x1, z1) {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    const p = [-dx, dx, -dz, dz], q = [ax - x0, x1 - ax, az - z0, z1 - az];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  function segCircle(ax, az, bx, bz, cx, cz, r) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((cx - ax) * dx + (cz - az) * dz) / l2 : 0;
    t = OTR.clamp(t, 0, 1);
    const px = ax + dx * t - cx, pz = az + dz * t - cz;
    return px * px + pz * pz < r * r;
  }
  S.blocked = blocked;

  // Chapter-wide detection state, created lazily per world.
  function state(world) {
    if (world._stealth) return world._stealth;
    const st = world._stealth = { level: 0, searchers: [], caught: false, beat: 0, onCaught: null };
    world.addUpdater((dt, e) => {
      // drain when no searcher is feeding the meter this frame
      if (!st.fed) st.level = Math.max(0, st.level - dt * 0.35);
      st.fed = false;
      OTR.ui.setDetect && OTR.ui.setDetect(st.level, st.searchers.some(s => s.state === 'suspicious'));
      // heartbeat quickens with the meter
      if (st.level > 0.2 && !st.caught) {
        st.beat -= dt;
        if (st.beat <= 0) { st.beat = OTR.lerp(1.5, 0.55, st.level); OTR.audio.heartbeat && OTR.audio.heartbeat(); }
      }
      if (st.level >= 1 && !st.caught) {
        st.caught = true;
        st.onCaught && st.onCaught();
      }
    });
    world.disposables.push(() => { OTR.ui.setDetect && OTR.ui.setDetect(0, false); });
    return st;
  }

  // Register a searcher. waypoints: [[x,z],...] loop. opts:
  //   speed (m/s), range (m), fov (deg), rate (meter fill per second when
  //   seen at close range), hearing (m: running here is heard), pause (s at
  //   each waypoint), onCaught (chapter fail), name (for the challenge line)
  S.addSearcher = function (world, fig, waypoints, opts = {}) {
    const st = state(world);
    if (opts.onCaught) st.onCaught = opts.onCaught;
    const rec = {
      fig, wp: waypoints, i: 0, state: 'patrol', pause: 0, scan: 0,
      speed: opts.speed || 1.3, range: opts.range || 10, cosHalf: Math.cos(((opts.fov || 95) / 2) * Math.PI / 180),
      rate: opts.rate || 0.9, hearing: opts.hearing || 5, pauseT: opts.pause != null ? opts.pause : 1.4,
      suspiciousT: 0, lastSeen: null, challenged: 0, name: opts.name || 'A voice'
    };
    st.searchers.push(rec);
    const lines = opts.lines || ['Who goes there?', 'Hold! Show yourself!', 'I heard something&hellip;'];

    world.addUpdater((dt, e) => {
      if (st.caught || world.disposed) return;
      const p = OTR.player;
      const fx = fig.position.x, fz = fig.position.z;

      // ---- movement ----
      fig.userData.alert = rec.state === 'suspicious';
      if (rec.state === 'patrol') {
        if (rec.pause > 0) {
          rec.pause -= dt;
          // look about: the body turns a little each way while the head
          // (figures.js) scans on its own; the torch swings with the body
          fig.faceTo(fx + Math.sin(rec.scan + Math.sin(e * 0.9) * 0.6), fz + Math.cos(rec.scan + Math.sin(e * 0.9) * 0.6));
          rec.v = Math.max(0, (rec.v || 0) - rec.speed * 3 * dt);
        } else {
          const wp = rec.wp[rec.i];
          const dx = wp[0] - fx, dz = wp[1] - fz, d = Math.hypot(dx, dz);
          if (d < 0.35) {
            rec.i = (rec.i + 1) % rec.wp.length;
            rec.pause = rec.pauseT * (0.6 + Math.random() * 0.8);
            rec.scan = fig.rotation.y;
            rec.v = 0;
          } else {
            // ease out of the pause and slow into the waypoint
            rec.v = Math.min(rec.speed, (rec.v || 0) + rec.speed * 1.6 * dt, Math.max(0.3, d * 1.4));
            const s = Math.min(d, rec.v * dt);
            fig.position.x += dx / d * s; fig.position.z += dz / d * s;
            fig.position.y = world.groundHeight(fig.position.x, fig.position.z);
            fig.faceTo(wp[0], wp[1]);
            fig.moveCollider && fig.moveCollider();
          }
        }
      } else if (rec.state === 'suspicious') {
        // turn toward where the player was last seen, creep a little closer
        if (rec.lastSeen) {
          fig.faceTo(rec.lastSeen[0], rec.lastSeen[1]);
          fig.lookAt(rec.lastSeen[0], rec.lastSeen[1]);
          const dx = rec.lastSeen[0] - fx, dz = rec.lastSeen[1] - fz, d = Math.hypot(dx, dz);
          if (d > 2.2) {
            const s = Math.min(d, rec.speed * 0.55 * dt);
            fig.position.x += dx / d * s; fig.position.z += dz / d * s;
            fig.moveCollider && fig.moveCollider();
          }
        }
        rec.suspiciousT -= dt;
        if (rec.suspiciousT <= 0) { rec.state = 'patrol'; rec.pause = 1.2; rec.scan = fig.rotation.y; rec.v = 0; fig.lookAt(null); }
      }

      // ---- sight ----
      const dx = p.pos.x - fig.position.x, dz = p.pos.z - fig.position.z;
      const dist = Math.hypot(dx, dz);
      const vis = S.playerVisibility(world);
      const range = rec.range * Math.min(1.6, Math.max(0.35, vis));
      let seen = false;
      if (dist < range) {
        const facing = [Math.sin(fig.rotation.y), Math.cos(fig.rotation.y)];
        const cosA = (facing[0] * dx + facing[1] * dz) / Math.max(dist, 1e-4);
        const inCone = cosA > rec.cosHalf || dist < 1.6; // arm's reach: no hiding
        if (inCone) {
          const eyeY = p.pos.y - (world.groundHeight(p.pos.x, p.pos.z));
          seen = !blocked(world, fig.position.x, fig.position.z, p.pos.x, p.pos.z, eyeY, fig.userData.col);
        }
      }
      // hearing: running close by, cone or no cone
      const mv = OTR.input.moveVector();
      const running = (mv.f || mv.s) && mv.run && p.canRun && !p.crouched && !p.frozen;
      const heard = running && dist < rec.hearing;

      if (seen || heard) {
        st.fed = true;
        let r = rec.rate * vis * (seen ? (1 - 0.55 * dist / range) : 0.45);
        if (rec.state === 'suspicious') r *= 1.5;
        st.level = Math.min(1, st.level + r * dt);
        rec.lastSeen = [p.pos.x, p.pos.z];
        if (rec.state === 'patrol' && st.level > 0.3) {
          rec.state = 'suspicious'; rec.suspiciousT = 3.2;
          if (e - rec.challenged > 6) {
            rec.challenged = e;
            OTR.ui.toast(`<em>${rec.name}:</em> ${lines[Math.floor(Math.random() * lines.length)]}`, 2600);
            OTR.audio.stinger && OTR.audio.stinger('hit');
          }
        } else if (rec.state === 'suspicious') rec.suspiciousT = Math.max(rec.suspiciousT, 1.5);
      }
    });
    return rec;
  };

  // How visible the player currently is (multiplier on sight range/rate).
  S.playerVisibility = function (world) {
    const p = OTR.player;
    let v = 1;
    if (p.crouched) v *= 0.55;
    const mv = OTR.input.moveVector();
    if ((mv.f || mv.s) && mv.run && p.canRun && !p.crouched) v *= 1.35;
    const lamp = world.lamp;
    if (lamp && lamp.on) v *= lamp.shuttered ? 0.5 : 1.5;
    if (world._hideSpots) {
      for (const h of world._hideSpots) {
        if (OTR.dist2D(p.pos.x, p.pos.z, h.x, h.z) < h.r && p.crouched) { v *= 0.3; break; }
      }
    }
    return v;
  };

  // A dark niche: crouching inside it makes the player nearly invisible.
  S.addHideSpot = function (world, x, z, r = 1.2) {
    (world._hideSpots = world._hideSpots || []).push({ x, z, r });
  };

  S.level = (world) => (world && world._stealth ? world._stealth.level : 0);

})(window.OTR);
