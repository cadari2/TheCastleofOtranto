/* sky.js — procedural GPU sky dome.

   Replaces the painted 2048x1024 canvas sky. The dome is a BackSide sphere
   that follows the camera and shades every sky pixel in a fragment shader:

     - atmosphere gradient (zenith / high / horizon / ground) + horizon haze
     - sun or moon disc with a scattering halo
     - two cloud layers: fluffy cumulus (fBm on a plane projected onto the
       view direction — proper perspective, flat-ish grey bases, lit tops and
       a silver lining toward the sun) plus a thin high cirrus veil; both
       drift with the wind and slowly boil
     - stars (night) with a slow twinkle, occluded by the clouds

   The same fragment code is also rendered once into a 1024x512 equirect
   render target, which becomes scene.environment (r160 PMREM-filters equirect
   environment textures itself), so lighting and reflections agree with what
   the player sees overhead.

   Cost: fragment work only on pixels where sky is visible; ~12 noise samples
   per pixel. The dome lives on layer 1 so the post-pipeline depth prepass
   (SSAO) treats it as far-plane sky. */
'use strict';
(function (OTR) {

  const S = OTR.sky = {};

  const NOISE = `
    float hash21(vec2 p) {
      p = fract(p * vec2(233.34, 851.73));
      p += dot(p, p + 23.45);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    // fbm whose octaves drift at different rates: clouds boil, not slide
    float fbm(vec2 p, float t) {
      float v = 0.0, a = 0.5;
      mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 6; i++) {
        v += a * vnoise(p + t * (0.15 + float(i) * 0.05));
        p = rot * p * 2.03 + vec2(1.7, 9.2);
        a *= 0.5;
      }
      return v;
    }
    float fbm3(vec2 p, float t) {
      float v = 0.0, a = 0.5;
      mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 3; i++) {
        v += a * vnoise(p + t * 0.1);
        p = rot * p * 2.1 + vec2(3.1, 5.4);
        a *= 0.5;
      }
      return v;
    }`;

  // Shared fragment body. `dir` is a unit world direction; outputs linear RGB.
  const SKY_BODY = `
    uniform float uTime;
    uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uDisc; uniform float uMoon;
    uniform vec3 uZenith; uniform vec3 uHigh; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uGroundDeep;
    uniform float uHaze; uniform vec3 uHazeColor;
    uniform float uCover; uniform float uCloudScale; uniform vec2 uWind; uniform float uCloudAlpha;
    uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uCirrus;
    uniform float uStars; uniform float uSunGlow;
    ${NOISE}

    // cloud density on the plane, 0..1 — cumulus: coverage-thresholded fbm,
    // squared so the bodies read solid with soft crinkled edges
    float cloudDensity(vec2 p, float t) {
      float base = fbm(p, t);                       // broad cumulus bodies
      float det = fbm3(p * 4.0 + 11.0, t * 1.5);    // erodes the edges into puffs
      float n = base + (det - 0.5) * 0.22;
      float d = smoothstep(1.0 - uCover, 1.0 - uCover + 0.30, n);
      return d * d * (3.0 - 2.0 * d);
    }

    vec3 skyColor(vec3 dir) {
      float h = dir.y;
      float t = uTime;
      // ---- atmosphere ----
      vec3 col = mix(uHorizon, uHigh, smoothstep(0.0, 0.32, h));
      col = mix(col, uZenith, smoothstep(0.28, 0.95, h));
      vec3 groundCol = mix(uGround, uGroundDeep, smoothstep(0.0, -0.55, h));
      col = mix(groundCol, col, smoothstep(-0.03, 0.01, h));
      // horizon haze band
      col = mix(col, uHazeColor, uHaze * 0.7 * exp(-abs(h) * 7.0));

      // ---- sun / moon ----
      float sd = dot(dir, uSunDir);
      float sdp = max(sd, 0.0);
      // forward scattering halo (wide) + tighter glow
      col += uSunColor * (pow(sdp, 6.0) * 0.10 + pow(sdp, 48.0) * 0.30) * uSunGlow;
      float disc = smoothstep(uDisc, uDisc + 0.0015, sd);
      vec3 discCol = uSunColor * (uMoon > 0.5 ? 2.2 : 9.0);
      if (uMoon > 0.5) {
        // mare blotches so it reads as a moon, not a lamp
        vec3 up = abs(uSunDir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 ax = normalize(cross(uSunDir, up)), ay = cross(uSunDir, ax);
        vec2 mp = vec2(dot(dir, ax), dot(dir, ay)) / (1.0 - uDisc + 1e-4) * 3.0;
        float mare = fbm3(mp * 2.0 + 7.0, 0.0);
        discCol *= 0.72 + 0.28 * smoothstep(0.35, 0.65, mare);
      }

      // ---- stars (night) ----
      float star = 0.0;
      if (uStars > 0.0 && h > 0.0) {
        vec2 sp = vec2(atan(dir.z, dir.x) * 32.0, asin(clamp(dir.y, -1.0, 1.0)) * 64.0);
        vec2 id = floor(sp), f = fract(sp) - 0.5;
        float r = hash21(id);
        if (r > 1.0 - 0.09 * uStars) {
          vec2 off = vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5;
          float dd = length(f - off * 0.8);
          float mag = hash21(id + 11.3);
          float tw = 0.75 + 0.25 * sin(t * (1.5 + mag * 3.0) + mag * 40.0);
          star = smoothstep(0.08 + mag * 0.05, 0.0, dd) * (0.35 + mag * 0.9) * tw;
        }
        star *= smoothstep(0.0, 0.15, h);
      }

      // ---- clouds ----
      float cloudA = 0.0; vec3 cloudCol = vec3(0.0);
      if (h > 0.0 && uCloudAlpha > 0.0) {
        float hh = max(h, 0.035);
        vec2 p = dir.xz / hh;                      // plane projection
        float dist = length(p);
        vec2 cp = p * uCloudScale + uWind * t;
        float dens = cloudDensity(cp, t);
        // shading: sample toward the sun on the plane; thicker along the
        // sun path = shaded. Silver lining where the cloud is thin and the
        // view is close to the sun.
        vec2 toSun = normalize(uSunDir.xz + vec2(1e-4)) * uCloudScale * 0.045;
        float densSun = cloudDensity(cp - toSun * (uSunDir.y > 0.05 ? 1.0 : 0.4), t);
        float thick = smoothstep(0.05, 0.85, dens);
        float shadow = clamp(densSun * 1.3 - dens * 0.4, 0.0, 1.0);
        float lit = 1.0 - 0.75 * shadow;
        lit *= 1.0 - 0.45 * thick;                 // dense bases go grey
        vec3 c = mix(uCloudShade, uCloudLit, lit);
        float rim = (1.0 - thick) * pow(sdp, 10.0) * 1.4;
        c += uSunColor * rim * (uMoon > 0.5 ? 0.35 : 1.0);
        // edge detail crinkle
        float detail = fbm3(cp * 5.0 + 3.3, t) - 0.5;
        float a = smoothstep(0.0, 0.32, dens + detail * 0.10 * (1.0 - thick));
        // aerial perspective toward the horizon
        float far = smoothstep(0.0, 0.16, h);
        a *= far * uCloudAlpha;
        c = mix(uHorizon, c, smoothstep(0.02, 0.22, h));
        cloudA = a; cloudCol = c;

        // thin high cirrus veil, streaked with the wind
        if (uCirrus > 0.0) {
          vec2 cq = p * uCloudScale * 0.35 * vec2(1.0, 3.2) + uWind * t * 0.6 + 40.0;
          float ci = fbm3(cq, t * 0.3);
          float ca = smoothstep(0.55, 0.85, ci) * uCirrus * far * 0.55;
          vec3 cc = mix(uCloudShade, uCloudLit, 0.85);
          cloudCol = mix(cloudCol, cc, ca * (1.0 - cloudA));
          cloudA = cloudA + ca * (1.0 - cloudA);
        }
      }

      col += vec3(star) * (1.0 - cloudA);
      col = mix(col, discCol, disc * (1.0 - cloudA * 0.85));
      col = mix(col, cloudCol, cloudA);
      // glow bleeding through / around cloud edges near the sun
      col += uSunColor * pow(sdp, 24.0) * 0.12 * uSunGlow * (1.0 - cloudA);
      return col;
    }`;

  const DOME_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_Position.z = gl_Position.w * 0.99999; // pin to the far plane
    }`;
  const DOME_FRAG = `
    varying vec3 vDir;
    ${SKY_BODY}
    void main() {
      vec3 c = skyColor(normalize(vDir));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  const BAKE_VERT = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const BAKE_FRAG = `
    varying vec2 vUv;
    ${SKY_BODY}
    void main() {
      // three.js equirect convention: u = atan(z, x)/2pi + 0.5, v = asin(y)/pi + 0.5
      float phi = (vUv.x - 0.5) * 6.2831853;
      float theta = (vUv.y - 0.5) * 3.14159265;
      vec3 d = vec3(cos(theta) * cos(phi), sin(theta), cos(theta) * sin(phi));
      gl_FragColor = vec4(skyColor(d), 1.0);
    }`;

  function makeUniforms(o) {
    const C = (v, d) => ({ value: new THREE.Color(v != null ? v : d) });
    const sunDir = (o.sunDir || new THREE.Vector3(0.4, 0.7, 0.5)).clone().normalize();
    const discDeg = o.discDeg != null ? o.discDeg : (o.moon ? 2.4 : 2.0);
    return {
      uTime: { value: 0 },
      uSunDir: { value: sunDir },
      uSunColor: C(o.sunColor, 0xfff2cc),
      uDisc: { value: Math.cos(discDeg * Math.PI / 180) },
      uMoon: { value: o.moon ? 1 : 0 },
      uZenith: C(o.top, 0x2f5d96), uHigh: C(o.high, 0x6f95c4), uHorizon: C(o.horizon, 0xd8c9a4),
      uGround: C(o.ground, 0x4a4436), uGroundDeep: C(o.groundDeep != null ? o.groundDeep : o.ground, 0x2c2820),
      uHaze: { value: o.haze != null ? o.haze : 0.5 }, uHazeColor: C(o.hazeColor != null ? o.hazeColor : o.horizon, 0xd8c9a4),
      uCover: { value: o.cover != null ? o.cover : (o.clouds != null ? OTR.clamp(o.clouds * 0.5, 0, 0.95) : 0.45) },
      uCloudScale: { value: o.cloudScale != null ? o.cloudScale : 3.0 },
      uWind: { value: new THREE.Vector2(o.windX != null ? o.windX : 0.012, o.windZ != null ? o.windZ : 0.004) },
      uCloudAlpha: { value: o.clouds ? (o.cloudAlpha != null ? o.cloudAlpha : 1) : 0 },
      uCloudLit: C(o.cloudLit, 0xfff0d8), uCloudShade: C(o.cloudShade, 0xb8c4d8),
      uCirrus: { value: o.cirrus != null ? o.cirrus : 0.5 },
      uStars: { value: o.stars || 0 },
      uSunGlow: { value: o.sunGlow != null ? o.sunGlow : 1 },
    };
  }

  // Build the dome and bake the environment. Returns the dome mesh.
  S.create = function (world, opts = {}) {
    const renderer = world.renderer;
    const uniforms = makeUniforms(opts);

    // --- visible dome ---
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 24), mat);
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    dome.layers.set(1); // skipped by the SSAO depth prepass (reads as far-plane)
    dome.castShadow = dome.receiveShadow = false;
    world.scene.add(dome);
    world.scene.background = null;

    // --- environment bake (once) ---
    let envTex = null;
    try {
      const rt = new THREE.WebGLRenderTarget(1024, 512, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: false
      });
      const bakeMat = new THREE.ShaderMaterial({ uniforms, vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat);
      const qs = new THREE.Scene(); qs.add(quad);
      const qc = new THREE.Camera();
      const prevRT = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(qs, qc);
      renderer.setRenderTarget(prevRT);
      quad.geometry.dispose(); bakeMat.dispose();
      envTex = rt.texture;
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      OTR.materials.applyEnvironment(world, envTex, opts.envIntensity);
      world.disposables.push(() => rt.dispose());
    } catch (e) {
      console.warn('sky env bake failed, falling back to painted env:', e);
      const tex = OTR.materials.makeSkyTexture(opts);
      OTR.materials.applyEnvironment(world, tex, opts.envIntensity);
      world.disposables.push(() => tex.dispose());
    }

    world.disposables.push(() => { mat.dispose(); dome.geometry.dispose(); });
    world.addUpdater((dt, e) => {
      uniforms.uTime.value = e;
      const cam = OTR.player.camera;
      if (cam) dome.position.copy(cam.position);
    });
    world.skyDome = dome;
    world.skyUniforms = uniforms;
    return dome;
  };

})(window.OTR);
