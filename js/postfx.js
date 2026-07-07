/* postfx.js — self-contained post pipeline built on core three.js only
   (the vendored build is the global r160 script, so the ES-module
   EffectComposer passes are not available).

   r160 applies tone mapping only when drawing to the canvas — renders into a
   WebGLRenderTarget come out as raw linear, NOT tone-mapped. So rtScene holds
   raw linear values and the composite reproduces the renderer's ACESFilmic
   curve (at the renderer's current exposure) before its single sRGB encode.

     scene ──▶ rtScene (MSAA, raw linear)
     scene ──depth prepass (override material, layer 0 only)──▶ rtDepth (half)
     rtDepth ──SSAO──▶ rtAOa ──blur H──▶ rtAOb ──blur V──▶ rtAOa
     rtScene ──bright-pass──▶ rtHalfA ──blur ×2──▶ rtHalfA
     composite: sRGB( grade( screen(ACES(rtScene·AO), bloom·strength) ) )

   Sprites, flames, glows and particles live on layer 1 so the depth prepass
   (camera masked to layer 0) never writes them — otherwise every torch flame
   would carve an occlusion halo into the wall behind it.

   If anything throws during init the game falls back to direct rendering. */
'use strict';
(function (OTR) {

  const VERT = `
    in vec3 position; in vec2 uv; out vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  const BRIGHT = `
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform sampler2D tScene; uniform float threshold; uniform float knee;
    void main() {
      vec3 c = texture(tScene, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float f = smoothstep(threshold, threshold + knee, l);
      outColor = vec4(c * f, 1.0);
    }`;

  const BLUR = `
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform sampler2D tSrc; uniform vec2 dir;
    void main() {
      vec4 s = texture(tSrc, vUv) * 0.227027;
      s += texture(tSrc, vUv + dir * 1.3846) * 0.316216;
      s += texture(tSrc, vUv - dir * 1.3846) * 0.316216;
      s += texture(tSrc, vUv + dir * 3.2308) * 0.070270;
      s += texture(tSrc, vUv - dir * 3.2308) * 0.070270;
      outColor = s;
    }`;

  // Alchemy-style SSAO from an RGBA-packed depth prepass. View-space position
  // is reconstructed from depth; the normal comes from screen derivatives.
  const SSAO = `
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform sampler2D tDepth;
    uniform mat4 proj; uniform mat4 projInv;
    uniform float near; uniform float far;
    uniform float radius; uniform float intensity; uniform float aoBias;

    float unpackRGBAToDepth(vec4 v) {
      const float UnpackDownscale = 255.0 / 256.0;
      const vec4 UnpackFactors = UnpackDownscale / vec4(1.0, 255.0, 65025.0, 16581375.0);
      return dot(v, UnpackFactors);
    }
    float viewZFromDepth(float d) {
      return (near * far) / ((far - near) * d - far); // negative in front of camera
    }
    vec3 viewPos(vec2 uv, float d, float vz) {
      float clipW = proj[2][3] * vz + proj[3][3];
      vec4 clip = vec4((vec3(uv, d) - 0.5) * 2.0, 1.0) * clipW;
      return (projInv * clip).xyz;
    }
    float ign(vec2 p) { // interleaved gradient noise
      return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    }
    void main() {
      float d = unpackRGBAToDepth(texture(tDepth, vUv));
      if (d >= 0.999) { outColor = vec4(1.0); return; } // sky / unwritten
      float vz = viewZFromDepth(d);
      vec3 pos = viewPos(vUv, d, vz);
      vec3 nrm = normalize(cross(dFdx(pos), dFdy(pos)));

      // world-space radius projected to uv units at this depth
      float uvR = min(0.5 * radius * proj[1][1] / -vz, 0.12);

      const int N = 11;
      float ang = ign(gl_FragCoord.xy) * 6.2831853;
      float occ = 0.0;
      for (int i = 0; i < N; i++) {
        float t = (float(i) + 0.5) / float(N);
        float a = ang + t * 19.0;
        vec2 suv = vUv + vec2(cos(a), sin(a)) * (t * uvR);
        float sd = unpackRGBAToDepth(texture(tDepth, suv));
        if (sd >= 0.999) continue;
        float svz = viewZFromDepth(sd);
        vec3 spos = viewPos(suv, sd, svz);
        vec3 diff = spos - pos;
        float l = length(diff);
        float nDotV = dot(nrm, diff / max(l, 1e-4));
        float rangeCheck = 1.0 - smoothstep(0.0, radius, l);
        occ += max(0.0, nDotV - aoBias) * rangeCheck;
      }
      float ao = clamp(1.0 - intensity * occ / float(N) * 2.4, 0.0, 1.0);
      outColor = vec4(vec3(ao), 1.0);
    }`;

  // radial blur of the bright pass toward the light's screen position —
  // cheap screen-space god rays for the sun/moon
  const GODRAY = `
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform sampler2D tSrc; uniform vec2 lightPos; uniform float density;
    void main() {
      vec2 delta = (lightPos - vUv) * (1.0 / 26.0) * density;
      vec2 uv = vUv;
      vec3 acc = vec3(0.0);
      float decay = 1.0, w = 0.0;
      for (int i = 0; i < 26; i++) {
        uv += delta;
        acc += texture(tSrc, uv).rgb * decay;
        w += decay;
        decay *= 0.94;
      }
      outColor = vec4(acc / w, 1.0);
    }`;

  const COMPOSITE = `
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAO;
    uniform sampler2D tGod; uniform vec3 godColor; uniform float godStrength;
    uniform float strength; uniform float exposure;
    uniform float aoStrength; uniform float aoPower;
    uniform vec3 gTint; uniform float gSat; uniform float gLift;
    // three.js ACESFilmicToneMapping, reproduced here because r160 skips tone
    // mapping in render-target passes — without it the base image ships raw
    // linear, which lifts near-black blues/greens into visible teal patches.
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 color) {
      const mat3 inM = mat3(
        vec3(0.59719, 0.07600, 0.02840),
        vec3(0.35458, 0.90834, 0.13383),
        vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(
        vec3(1.60475, -0.10208, -0.00327),
        vec3(-0.53108, 1.10813, -0.07276),
        vec3(-0.07367, -0.00605, 1.07602));
      color *= exposure / 0.6;
      color = outM * RRTAndODTFit(inM * color);
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
    }
    void main() {
      float ao = pow(clamp(texture(tAO, vUv).r, 0.0, 1.0), aoPower);
      float aoF = mix(1.0, ao, aoStrength);
      vec3 base = aces(texture(tScene, vUv).rgb * aoF); // occlude in linear, then tone-map
      vec3 bloom = texture(tBloom, vUv).rgb;            // linear highlights
      // screen-blend the bloom so highlights glow without washing mid-tones
      vec3 b = bloom * strength;
      vec3 c = 1.0 - (1.0 - base) * (1.0 - b);
      c += texture(tGod, vUv).rgb * godColor * godStrength; // light shafts
      // grade: saturation, tint, black lift — cheap per-chapter look control
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, gSat) * gTint;
      c = c + gLift * (1.0 - c);
      outColor = vec4(toSRGB(c), 1.0); // single sRGB encode for the canvas
    }`;

  class PostFX {
    constructor(renderer, opts = {}) {
      this.renderer = renderer;
      this.enabled = true;
      this.strength = opts.strength != null ? opts.strength : 0.7;
      // threshold/knee are on LINEAR luminance: lit stone sits ~0.2–0.4, torch
      // and moonlight cores approach 1, so this isolates the highlights.
      this.threshold = opts.threshold != null ? opts.threshold : 0.55;
      this.knee = opts.knee != null ? opts.knee : 0.28;
      this.ao = {
        enabled: opts.ao !== false,
        radius: 0.75, intensity: 1.0, bias: 0.02,
        strength: 0.85, power: 1.1
      };
      this.grade = { tint: new THREE.Color(1, 1, 1), saturation: 1, lift: 0 };
      // chapters aim this at their sun/moon (world-space position far away);
      // strength fades automatically as the light leaves the view
      this.godrays = { enabled: false, worldPos: new THREE.Vector3(), strength: 0.35, color: new THREE.Color(1, 1, 1) };

      const linear = THREE.LinearSRGBColorSpace;
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const w = Math.max(2, size.x | 0), h = Math.max(2, size.y | 0);
      const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);

      // Full-res target the scene renders into (linear, no colour encoding). MSAA
      // so the base image keeps the antialiasing it had when drawn to the canvas.
      this.rtScene = new THREE.WebGLRenderTarget(w, h, {
        samples: 4, colorSpace: linear,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true
      });
      const halfOpts = { colorSpace: linear, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      this.rtA = new THREE.WebGLRenderTarget(hw, hh, halfOpts);
      this.rtB = new THREE.WebGLRenderTarget(hw, hh, halfOpts);
      // depth prepass + AO at half res
      this.rtDepth = new THREE.WebGLRenderTarget(hw, hh, {
        colorSpace: linear, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true
      });
      this.rtAOa = new THREE.WebGLRenderTarget(hw, hh, halfOpts);
      this.rtAOb = new THREE.WebGLRenderTarget(hw, hh, halfOpts);
      this.rtGod = new THREE.WebGLRenderTarget(hw, hh, halfOpts);
      this._half = new THREE.Vector2(hw, hh);

      this.depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      this.depthMat.side = THREE.DoubleSide; // vault interiors are backfaces
      this.whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      this.whiteTex.needsUpdate = true;

      const mk = (frag, uniforms) => new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag,
        uniforms, depthTest: false, depthWrite: false
      });
      this.mBright = mk(BRIGHT, { tScene: { value: null }, threshold: { value: this.threshold }, knee: { value: this.knee } });
      this.mBlur = mk(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
      this.mSSAO = mk(SSAO, {
        tDepth: { value: null },
        proj: { value: new THREE.Matrix4() }, projInv: { value: new THREE.Matrix4() },
        near: { value: 0.05 }, far: { value: 1200 },
        radius: { value: this.ao.radius }, intensity: { value: this.ao.intensity }, aoBias: { value: this.ao.bias }
      });
      this.mGodray = mk(GODRAY, { tSrc: { value: null }, lightPos: { value: new THREE.Vector2(0.5, 0.5) }, density: { value: 1 } });
      this.blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      this.blackTex.needsUpdate = true;
      this.mComposite = mk(COMPOSITE, {
        tScene: { value: null }, tBloom: { value: null }, tAO: { value: this.whiteTex },
        tGod: { value: this.blackTex }, godColor: { value: new THREE.Color(1, 1, 1) }, godStrength: { value: 0 },
        strength: { value: this.strength }, exposure: { value: 1 },
        aoStrength: { value: this.ao.strength }, aoPower: { value: this.ao.power },
        gTint: { value: new THREE.Color(1, 1, 1) }, gSat: { value: 1 }, gLift: { value: 0 }
      });

      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mBright);
      this.quadScene = new THREE.Scene();
      this.quadScene.add(this.quad);
      this.quadCam = new THREE.Camera();
      this._cc = new THREE.Color();
    }

    // per-chapter look control -------------------------------------------
    setGrade(o = {}) {
      if (o.tint != null) this.grade.tint.set(o.tint);
      if (o.saturation != null) this.grade.saturation = o.saturation;
      if (o.lift != null) this.grade.lift = o.lift;
    }
    resetGrade() {
      this.grade.tint.set(0xffffff); this.grade.saturation = 1; this.grade.lift = 0;
      this.godrays.enabled = false;
    }
    // aim the god rays: dir is the (normalized-ish) direction TO the light
    setGodrays(dir, opts = {}) {
      this.godrays.enabled = true;
      this.godrays.worldPos.copy(dir).multiplyScalar(800);
      if (opts.strength != null) this.godrays.strength = opts.strength;
      if (opts.color != null) this.godrays.color.set(opts.color);
    }

    setSize(w, h) {
      w = Math.max(2, w | 0); h = Math.max(2, h | 0);
      const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
      this.rtScene.setSize(w, h);
      this.rtA.setSize(hw, hh);
      this.rtB.setSize(hw, hh);
      this.rtDepth.setSize(hw, hh);
      this.rtAOa.setSize(hw, hh);
      this.rtAOb.setSize(hw, hh);
      this.rtGod.setSize(hw, hh);
      this._half.set(hw, hh);
    }

    _blit(mat, target) {
      this.quad.material = mat;
      this.renderer.setRenderTarget(target || null);
      this.renderer.render(this.quadScene, this.quadCam);
    }

    // depth prepass: meshes only (layer 0), no background, packed depth
    _renderDepth(scene, camera) {
      const r = this.renderer;
      const oldOverride = scene.overrideMaterial;
      const oldBackground = scene.background;
      const oldMask = camera.layers.mask;
      r.getClearColor(this._cc); const oldAlpha = r.getClearAlpha();
      scene.overrideMaterial = this.depthMat;
      scene.background = null;
      camera.layers.set(0);
      r.setClearColor(0xffffff, 1); // clears to far-plane depth
      r.setRenderTarget(this.rtDepth);
      r.clear();
      r.render(scene, camera);
      scene.overrideMaterial = oldOverride;
      scene.background = oldBackground;
      camera.layers.mask = oldMask;
      r.setClearColor(this._cc, oldAlpha);
    }

    render(scene, camera) {
      const r = this.renderer;
      if (!this.enabled) {
        r.setRenderTarget(null);
        r.render(scene, camera);
        return;
      }
      // 1) scene → rtScene (raw linear, MSAA)
      r.setRenderTarget(this.rtScene);
      r.clear();
      r.render(scene, camera);

      // 2) SSAO from a half-res depth prepass
      if (this.ao.enabled) {
        this._renderDepth(scene, camera);
        const u = this.mSSAO.uniforms;
        u.tDepth.value = this.rtDepth.texture;
        u.proj.value.copy(camera.projectionMatrix);
        u.projInv.value.copy(camera.projectionMatrixInverse);
        u.near.value = camera.near; u.far.value = camera.far;
        u.radius.value = this.ao.radius; u.intensity.value = this.ao.intensity; u.aoBias.value = this.ao.bias;
        this._blit(this.mSSAO, this.rtAOa);
        const dx = 1 / this._half.x, dy = 1 / this._half.y;
        this.mBlur.uniforms.tSrc.value = this.rtAOa.texture;
        this.mBlur.uniforms.dir.value.set(dx, 0);
        this._blit(this.mBlur, this.rtAOb);
        this.mBlur.uniforms.tSrc.value = this.rtAOb.texture;
        this.mBlur.uniforms.dir.value.set(0, dy);
        this._blit(this.mBlur, this.rtAOa);
      }

      // 3) bloom bright-pass at half res
      this.mBright.uniforms.tScene.value = this.rtScene.texture;
      this.mBright.uniforms.threshold.value = this.threshold;
      this.mBright.uniforms.knee.value = this.knee;
      this._blit(this.mBright, this.rtA);

      // 3b) god rays: radial blur of the bright pass toward the light,
      // faded out as the light leaves the frame or goes behind the camera
      let godAmount = 0;
      if (this.godrays.enabled) {
        const p = this._v3 || (this._v3 = new THREE.Vector3());
        p.copy(this.godrays.worldPos).add(camera.position).project(camera);
        if (p.z < 1) {
          const lx = p.x * 0.5 + 0.5, ly = p.y * 0.5 + 0.5;
          const edge = Math.max(Math.abs(p.x), Math.abs(p.y));
          godAmount = OTR.clamp(1.6 - edge, 0, 1) * this.godrays.strength;
          if (godAmount > 0.003) {
            this.mGodray.uniforms.tSrc.value = this.rtA.texture;
            this.mGodray.uniforms.lightPos.value.set(lx, ly);
            this._blit(this.mGodray, this.rtGod);
          }
        }
      }

      // 4) separable gaussian blur, two iterations
      const dx = 1 / this._half.x, dy = 1 / this._half.y;
      for (let i = 0; i < 2; i++) {
        this.mBlur.uniforms.tSrc.value = this.rtA.texture;
        this.mBlur.uniforms.dir.value.set(dx, 0);
        this._blit(this.mBlur, this.rtB);
        this.mBlur.uniforms.tSrc.value = this.rtB.texture;
        this.mBlur.uniforms.dir.value.set(0, dy);
        this._blit(this.mBlur, this.rtA);
      }

      // 5) composite to the canvas
      const cu = this.mComposite.uniforms;
      cu.tScene.value = this.rtScene.texture;
      cu.tBloom.value = this.rtA.texture;
      cu.tAO.value = this.ao.enabled ? this.rtAOa.texture : this.whiteTex;
      cu.tGod.value = godAmount > 0.003 ? this.rtGod.texture : this.blackTex;
      cu.godStrength.value = godAmount;
      cu.godColor.value.copy(this.godrays.color);
      cu.strength.value = this.strength;
      cu.exposure.value = r.toneMappingExposure; // chapters retune this
      cu.aoStrength.value = this.ao.enabled ? this.ao.strength : 0;
      cu.aoPower.value = this.ao.power;
      cu.gTint.value.copy(this.grade.tint);
      cu.gSat.value = this.grade.saturation;
      cu.gLift.value = this.grade.lift;
      this._blit(this.mComposite, null);
    }
  }

  OTR.PostFX = PostFX;

})(window.OTR);
