/* atmo.js — atmosphere: volumetric-style fog for every material.

   three.js fog is a flat per-fragment blend toward one colour by distance.
   That is the wrong shape for a misty wood or a hazy courtyard: real haze
   lies low and thins with height, glows where you look toward the sun or
   moon, and drifts in banks rather than sitting as a uniform veil.

   This module rewrites the shared fog shader chunks ONCE at load, so every
   built-in material (stone, ground, figures, sprites, mist sheets) picks up:

     - height fog: exponential density profile, integrated analytically
       along the camera→fragment ray (dense on the ground, thin overhead)
     - inscatter: the fog colour brightens toward the light direction with a
       tunable lobe, so the far haze glows around the sun/moon and shafts of
       fogged distance read as lit air
     - drifting density: a slow 2-octave value noise over world XZ so the
       far fog breathes in banks instead of one flat gradient

   Uniforms are shared objects injected through Material.prototype.onBuild
   (called by the renderer for every program it compiles), so one set of
   values drives every material. Chapters call OTR.atmo.set({...}); the
   game resets it between chapters. Nothing here changes the fog API the
   chapters already use — world.setFog still sets colour and range. */
'use strict';
(function (OTR) {

  const A = OTR.atmo = {};

  A.uniforms = {
    otrFogSunDir:    { value: new THREE.Vector3(0, 1, 0) },
    otrFogSunColor:  { value: new THREE.Color(0, 0, 0) },
    otrFogSunParams: { value: new THREE.Vector2(0, 8) },      // amount, lobe power
    otrFogHeight:    { value: new THREE.Vector3(0, 0.2, 0) }, // base y, falloff, strength
    otrFogNoise:     { value: new THREE.Vector3(0, 0.05, 0) },// amount, scale, time
  };

  const defaults = {
    sunDir: null, sunColor: 0x000000, sunAmount: 0, sunPower: 8,
    heightBase: 0, heightFalloff: 0.2, heightMix: 0,
    noise: 0, noiseScale: 0.05
  };

  // Chapter-facing setter: any subset of the keys above.
  A.set = function (o = {}) {
    const u = A.uniforms;
    if (o.sunDir) u.otrFogSunDir.value.copy(o.sunDir).normalize();
    if (o.sunColor != null) u.otrFogSunColor.value.set(o.sunColor);
    if (o.sunAmount != null) u.otrFogSunParams.value.x = o.sunAmount;
    if (o.sunPower != null) u.otrFogSunParams.value.y = o.sunPower;
    if (o.heightBase != null) u.otrFogHeight.value.x = o.heightBase;
    if (o.heightFalloff != null) u.otrFogHeight.value.y = Math.max(0.001, o.heightFalloff);
    if (o.heightMix != null) u.otrFogHeight.value.z = OTR.clamp(o.heightMix, 0, 1);
    if (o.noise != null) u.otrFogNoise.value.x = o.noise;
    if (o.noiseScale != null) u.otrFogNoise.value.y = o.noiseScale;
  };
  A.reset = function () {
    A.set(Object.assign({}, defaults, { sunDir: new THREE.Vector3(0, 1, 0) }));
  };
  A.tick = function (dt) { A.uniforms.otrFogNoise.value.z += dt * 0.35; };

  // ---- shader patch ---------------------------------------------------
  const SC = THREE.ShaderChunk;

  SC.fog_pars_vertex = `
    #ifdef USE_FOG
      varying float vFogDepth;
      varying vec3 vOtrFogView;
    #endif`;
  SC.fog_vertex = `
    #ifdef USE_FOG
      vFogDepth = - mvPosition.z;
      vOtrFogView = mvPosition.xyz;
    #endif`;
  SC.fog_pars_fragment = `
    #ifdef USE_FOG
      uniform vec3 fogColor;
      varying float vFogDepth;
      varying vec3 vOtrFogView;
      #ifdef FOG_EXP2
        uniform float fogDensity;
      #else
        uniform float fogNear;
        uniform float fogFar;
      #endif
      uniform vec3 otrFogSunDir;
      uniform vec3 otrFogSunColor;
      uniform vec2 otrFogSunParams;
      uniform vec3 otrFogHeight;
      uniform vec3 otrFogNoise;
      float otrFogHash(vec2 p) {
        p = fract(p * vec2(233.34, 851.73));
        p += dot(p, p + 23.45);
        return fract(p.x * p.y);
      }
      float otrFogVNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(otrFogHash(i), otrFogHash(i + vec2(1.0, 0.0)), f.x),
                   mix(otrFogHash(i + vec2(0.0, 1.0)), otrFogHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
    #endif`;
  SC.fog_fragment = `
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #else
        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
      #endif
      // camera→fragment ray back in world space (viewMatrix is rigid: R^T)
      vec3 otrRay = vec3(dot(viewMatrix[0].xyz, vOtrFogView), dot(viewMatrix[1].xyz, vOtrFogView), dot(viewMatrix[2].xyz, vOtrFogView));
      float otrLen = max(length(otrRay), 1e-3);
      vec3 otrDir = otrRay / otrLen;
      vec3 otrWP = cameraPosition + otrRay;
      // height profile: mean density along the ray for exp(-k*(y-base))
      if (otrFogHeight.z > 0.0) {
        float k = otrFogHeight.y;
        float hc = cameraPosition.y - otrFogHeight.x, hp = otrWP.y - otrFogHeight.x;
        float dh = hp - hc;
        float dens = abs(dh) > 1e-3 ? (exp(-k * hc) - exp(-k * hp)) / (k * dh) : exp(-k * hc);
        dens = clamp(dens, 0.0, 1.0);
        fogFactor *= mix(1.0, dens, otrFogHeight.z);
      }
      // drifting banks
      if (otrFogNoise.x > 0.0) {
        vec2 np = otrWP.xz * otrFogNoise.y + vec2(otrFogNoise.z * 0.08, otrFogNoise.z * 0.05);
        float n = otrFogVNoise(np) * 0.65 + otrFogVNoise(np * 2.7 + 5.1) * 0.35;
        fogFactor *= 1.0 + (n - 0.5) * otrFogNoise.x;
      }
      fogFactor = clamp(fogFactor, 0.0, 1.0);
      // inscatter toward the light
      float otrSun = pow(max(dot(otrDir, otrFogSunDir), 0.0), otrFogSunParams.y) * otrFogSunParams.x;
      vec3 otrFogCol = fogColor + otrFogSunColor * otrSun;
      gl_FragColor.rgb = mix( gl_FragColor.rgb, otrFogCol, fogFactor );
    #endif`;

  // Every program the renderer builds gets the shared uniform objects.
  // onBuild runs before onBeforeCompile with the cloned uniform set, so
  // materials with their own onBeforeCompile (stochastic tiling, mist,
  // grass) are covered too.
  const prevOnBuild = THREE.Material.prototype.onBuild;
  THREE.Material.prototype.onBuild = function (object, parameters, renderer) {
    if (parameters && parameters.uniforms) {
      for (const k in A.uniforms) if (!parameters.uniforms[k]) parameters.uniforms[k] = A.uniforms[k];
    }
    if (prevOnBuild) prevOnBuild.call(this, object, parameters, renderer);
  };

  A.reset();

})(window.OTR);
