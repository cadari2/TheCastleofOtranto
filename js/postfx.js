/* postfx.js — self-contained post pipeline built on core three.js only
   (the vendored build is the global r160 script, so the ES-module
   EffectComposer passes are not available).

   r160 applies tone mapping only when drawing to the canvas — renders into a
   WebGLRenderTarget come out as raw linear, NOT tone-mapped. So rtScene holds
   raw linear values and the composite reproduces the renderer's ACESFilmic
   curve (at the renderer's current exposure) before its single sRGB encode.

     scene ──▶ rtScene (MSAA, raw linear)
     scene ──depth prepass (override material, layer 0 only)──▶ rtDepth (half)
     rtDepth ──SSAO──▶ rtAOb ──depth-aware 4×4 box──▶ rtAOa
     rtScene ──bright-pass──▶ rtHalfA ──blur ×2──▶ rtHalfA
     rtHalfA ──resample──▶ rtQuarter ──blur ×2──▶ rtQuarter (wide veil)
     composite: sRGB( grade( screen(ACES(aberrate(rtScene)·AO), bloom·strength) ) )

   Quality knobs (setQuality): AO resolution scale and sample count, the
   wide bloom tier, and the aberration amount; OTR.quality drives them.

   Precision: rtScene and the bloom tiers are half-float where the GPU
   allows (EXT_color_buffer_float). An 8-bit *linear* scene buffer only has
   a handful of levels below 0.02, and the vaults live there — ACES + sRGB
   then stretched those steps into posterised contours over every dark
   wall. The composite also adds a ±½ LSB triangular dither before the 8-bit
   canvas so slow fog gradients cannot band.

   AO noise: the sample rotation comes from a 4×4 repeating tile and the AO
   blur is a depth-aware 4×4 box over exactly that tile, so the noise
   cancels completely. The previous interleaved-gradient noise is built for
   temporal AA; without it, its ~15 px × ~170 px gradient stripes survived
   the small gaussian and read as near-horizontal CRT-style banding across
   the whole frame.

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
      vec3 c = min(texture(tScene, vUv).rgb, vec3(2.5)); // half-float scene: cap the HDR peaks
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
    // 4×4 repeating rotation tile: 16 fixed angles laid out so that a 4×4
    // box blur over the AO texels averages every angle exactly once
    float tileAngle(vec2 p) {
      vec2 t = floor(mod(p, 4.0));
      float k = t.x + t.y * 4.0;
      return fract(k * 0.618034 + t.y * 0.25) * 6.2831853;
    }
    uniform vec2 texel;
    vec3 posAt(vec2 uv) {
      float d = unpackRGBAToDepth(texture(tDepth, uv));
      float vz = viewZFromDepth(d);
      return viewPos(uv, d, vz);
    }
    void main() {
      float d = unpackRGBAToDepth(texture(tDepth, vUv));
      if (d >= 0.999) { outColor = vec4(1.0); return; } // sky / unwritten
      float vz = viewZFromDepth(d);
      vec3 pos = viewPos(vUv, d, vz);
      // normal from the closer of each derivative pair, so silhouettes and
      // creases don't get a one-texel dark rim from a straddling derivative
      vec3 pl = posAt(vUv - vec2(texel.x, 0.0)), pr = posAt(vUv + vec2(texel.x, 0.0));
      vec3 pd = posAt(vUv - vec2(0.0, texel.y)), pu = posAt(vUv + vec2(0.0, texel.y));
      vec3 dx = (abs(pr.z - pos.z) < abs(pos.z - pl.z)) ? (pr - pos) : (pos - pl);
      vec3 dy = (abs(pu.z - pos.z) < abs(pos.z - pd.z)) ? (pu - pos) : (pos - pd);
      vec3 nrm = normalize(cross(dx, dy));
      if (dot(nrm, -pos) < 0.0) nrm = -nrm; // always face the camera

      // world-space radius projected to uv units at this depth
      float uvR = min(0.5 * radius * proj[1][1] / -vz, 0.12);

      #ifndef AO_SAMPLES
        #define AO_SAMPLES 11
      #endif
      const int N = AO_SAMPLES;
      float ang = tileAngle(gl_FragCoord.xy);
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
        // bias in angle plus a distance floor: a flat surface's own texels
        // (depth quantisation, half-res reprojection) must not self-occlude
        occ += max(0.0, nDotV - aoBias) * rangeCheck * smoothstep(0.0, 0.03 * radius, l);
      }
      float ao = clamp(1.0 - intensity * occ / float(N) * 2.4, 0.0, 1.0);
      outColor = vec4(vec3(ao), 1.0);
    }`;

  // depth-aware 4×4 box blur for the AO buffer. The box spans exactly one
  // period of the 4×4 rotation tile, so the per-texel sample noise averages
  // out fully; the depth weight stops occlusion bleeding across silhouettes.
  const AOBLUR = `
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 texel;
    uniform float near; uniform float far;
    float unpackRGBAToDepth(vec4 v) {
      const float UnpackDownscale = 255.0 / 256.0;
      const vec4 UnpackFactors = UnpackDownscale / vec4(1.0, 255.0, 65025.0, 16581375.0);
      return dot(v, UnpackFactors);
    }
    float viewZ(vec2 uv) {
      float d = unpackRGBAToDepth(texture(tDepth, uv));
      return (near * far) / ((far - near) * d - far);
    }
    void main() {
      float z0 = viewZ(vUv);
      float tol = max(0.05, abs(z0) * 0.04);
      float acc = 0.0, wsum = 0.0;
      for (int y = -2; y < 2; y++) {
        for (int x = -2; x < 2; x++) {
          vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5) * texel;
          float w = 1.0 - smoothstep(0.0, tol, abs(viewZ(uv) - z0));
          w = max(w, 0.02);
          acc += texture(tSrc, uv).r * w; wsum += w;
        }
      }
      outColor = vec4(vec3(acc / wsum), 1.0);
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
    uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tBloomWide; uniform sampler2D tAO;
    uniform sampler2D tGod; uniform vec3 godColor; uniform float godStrength;
    uniform float strength; uniform float wideStrength; uniform float exposure; uniform float aberration;
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
      // lens: faint radial chromatic aberration — the red and blue channels
      // are fetched a hair outward/inward, growing toward the frame edge
      vec2 rad = vUv - 0.5;
      vec2 off = rad * dot(rad, rad) * 4.0 * aberration;
      vec3 sc = vec3(texture(tScene, vUv + off).r, texture(tScene, vUv).g, texture(tScene, vUv - off).b);
      vec3 base = aces(sc * aoF);                       // occlude in linear, then tone-map
      // two bloom tiers: a tight half-res glow plus a broad quarter-res veil
      vec3 bloom = texture(tBloom, vUv).rgb + texture(tBloomWide, vUv).rgb * wideStrength;
      // screen-blend the bloom so highlights glow without washing mid-tones
      vec3 b = bloom * strength;
      vec3 c = 1.0 - (1.0 - base) * (1.0 - b);
      c += texture(tGod, vUv).rgb * godColor * godStrength; // light shafts
      // grade: saturation, tint, black lift — cheap per-chapter look control
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, gSat) * gTint;
      c = c + gLift * (1.0 - c);
      // ±½ LSB triangular dither on the encoded value: breaks 8-bit contours
      // in the slow dark gradients without being visible as noise
      vec3 o = toSRGB(c);
      float n1 = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      float n2 = fract(sin(dot(gl_FragCoord.xy + 17.0, vec2(26.651, 61.837))) * 24634.6345);
      o += (n1 + n2 - 1.0) / 255.0;
      outColor = vec4(o, 1.0); // single sRGB encode for the canvas
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
      // lens and quality knobs (see setQuality / OTR.quality)
      this.lens = { aberration: opts.aberration != null ? opts.aberration : 0.0025 };
      this.quality = { aoScale: 0.5, aoSamples: 11, wideBloom: true, wideStrength: 0.55 };
      // chapters aim this at their sun/moon (world-space position far away);
      // strength fades automatically as the light leaves the view
      this.godrays = { enabled: false, worldPos: new THREE.Vector3(), strength: 0.35, color: new THREE.Color(1, 1, 1) };

      const linear = THREE.LinearSRGBColorSpace;
      // half-float where the GPU can render to it (every WebGL2 desktop
      // browser; iOS Safari 15+). Falls back to 8-bit otherwise.
      let hdr = false;
      try { hdr = !!(renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float')); } catch (e) { hdr = false; }
      this.hdr = hdr;
      const ttype = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const w = Math.max(2, size.x | 0), h = Math.max(2, size.y | 0);
      const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);

      // Full-res target the scene renders into (linear, no colour encoding). MSAA
      // so the base image keeps the antialiasing it had when drawn to the canvas.
      this.rtScene = new THREE.WebGLRenderTarget(w, h, {
        samples: 4, colorSpace: linear, type: ttype,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true
      });
      const halfOpts = { colorSpace: linear, type: ttype, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      // AO / depth buffers stay 8-bit: the depth is RGBA-packed, AO is 0..1
      const aoOpts = { colorSpace: linear, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      this.rtA = new THREE.WebGLRenderTarget(hw, hh, halfOpts);
      this.rtB = new THREE.WebGLRenderTarget(hw, hh, halfOpts);
      // depth prepass + AO at half res
      this.rtDepth = new THREE.WebGLRenderTarget(hw, hh, {
        colorSpace: linear, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true
      });
      this.rtAOa = new THREE.WebGLRenderTarget(hw, hh, aoOpts);
      this.rtAOb = new THREE.WebGLRenderTarget(hw, hh, aoOpts);
      this.rtGod = new THREE.WebGLRenderTarget(hw, hh, halfOpts);
      this._half = new THREE.Vector2(hw, hh);
      // quarter-res tier for the wide bloom veil
      const qw = Math.max(1, hw >> 1), qh = Math.max(1, hh >> 1);
      this.rtQa = new THREE.WebGLRenderTarget(qw, qh, halfOpts);
      this.rtQb = new THREE.WebGLRenderTarget(qw, qh, halfOpts);
      this._quarter = new THREE.Vector2(qw, qh);
      this._ao = new THREE.Vector2(hw, hh);
      this._size = new THREE.Vector2(w, h);

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
      this.mAOBlur = mk(AOBLUR, { tSrc: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2() }, near: { value: 0.05 }, far: { value: 1200 } });
      this._mk = mk;
      this._buildSSAO();
      this.mGodray = mk(GODRAY, { tSrc: { value: null }, lightPos: { value: new THREE.Vector2(0.5, 0.5) }, density: { value: 1 } });
      this.blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      this.blackTex.needsUpdate = true;
      this.mComposite = mk(COMPOSITE, {
        tScene: { value: null }, tBloom: { value: null }, tBloomWide: { value: this.blackTex }, tAO: { value: this.whiteTex },
        tGod: { value: this.blackTex }, godColor: { value: new THREE.Color(1, 1, 1) }, godStrength: { value: 0 },
        strength: { value: this.strength }, wideStrength: { value: 0 }, exposure: { value: 1 }, aberration: { value: 0 },
        aoStrength: { value: this.ao.strength }, aoPower: { value: this.ao.power },
        gTint: { value: new THREE.Color(1, 1, 1) }, gSat: { value: 1 }, gLift: { value: 0 }
      });

      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mBright);
      this.quadScene = new THREE.Scene();
      this.quadScene.add(this.quad);
      this.quadCam = new THREE.Camera();
      this._cc = new THREE.Color();
    }

    _buildSSAO() {
      if (this.mSSAO) this.mSSAO.dispose();
      this.mSSAO = this._mk(SSAO, {
        tDepth: { value: null },
        proj: { value: new THREE.Matrix4() }, projInv: { value: new THREE.Matrix4() },
        near: { value: 0.05 }, far: { value: 1200 }, texel: { value: new THREE.Vector2() },
        radius: { value: this.ao.radius }, intensity: { value: this.ao.intensity }, aoBias: { value: this.ao.bias }
      });
      this.mSSAO.defines = { AO_SAMPLES: this.quality.aoSamples | 0 };
    }

    // quality: { aoScale (0.5 half-res, 1 full), aoSamples, wideBloom }
    setQuality(q = {}) {
      const cur = this.quality;
      const samples = q.aoSamples != null ? q.aoSamples : cur.aoSamples;
      if (samples !== cur.aoSamples) { cur.aoSamples = samples; this._buildSSAO(); }
      if (q.aoScale != null) cur.aoScale = q.aoScale;
      if (q.wideBloom != null) cur.wideBloom = q.wideBloom;
      if (q.aberration != null) this.lens.aberration = q.aberration;
      this.setSize(this._size.x, this._size.y);
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
      // capped: stronger rays re-inflate every bright spot (torch fire,
      // glare) into wandering shafts
      if (opts.strength != null) this.godrays.strength = Math.min(opts.strength, 0.32);
      if (opts.color != null) this.godrays.color.set(opts.color);
    }

    setSize(w, h) {
      w = Math.max(2, w | 0); h = Math.max(2, h | 0);
      const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
      this.rtScene.setSize(w, h);
      this.rtA.setSize(hw, hh);
      this.rtB.setSize(hw, hh);
      const aw = Math.max(1, Math.round(w * this.quality.aoScale)), ah = Math.max(1, Math.round(h * this.quality.aoScale));
      this.rtDepth.setSize(aw, ah);
      this.rtAOa.setSize(aw, ah);
      this.rtAOb.setSize(aw, ah);
      this.rtGod.setSize(hw, hh);
      const qw = Math.max(1, hw >> 1), qh = Math.max(1, hh >> 1);
      this.rtQa.setSize(qw, qh);
      this.rtQb.setSize(qw, qh);
      this._half.set(hw, hh);
      this._quarter.set(qw, qh);
      this._ao.set(aw, ah);
      this._size.set(w, h);
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
        u.texel.value.set(1 / this._ao.x, 1 / this._ao.y);
        this._blit(this.mSSAO, this.rtAOb);
        // one depth-aware 4×4 box: exactly one period of the rotation tile
        const bu = this.mAOBlur.uniforms;
        bu.tSrc.value = this.rtAOb.texture; bu.tDepth.value = this.rtDepth.texture;
        bu.texel.value.set(1 / this._ao.x, 1 / this._ao.y);
        bu.near.value = camera.near; bu.far.value = camera.far;
        this._blit(this.mAOBlur, this.rtAOa);
      }

      // 3) bloom bright-pass at half res
      this.mBright.uniforms.tScene.value = this.rtScene.texture;
      // floor at 0.5: below that, mirror-glare on failed-texture materials
      // enters the bloom chain and the post pipeline re-inflates the fire
      this.mBright.uniforms.threshold.value = Math.max(this.threshold, 0.5);
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

      // 3c) wide tier: the bright pass downsampled to quarter res and blurred
      // there, so torches and the sun bleed into a broad soft veil
      let wide = false;
      if (this.quality.wideBloom) {
        wide = true;
        this.mBlur.uniforms.tSrc.value = this.rtA.texture;
        this.mBlur.uniforms.dir.value.set(0, 0); // weights sum to 1: plain resample
        this._blit(this.mBlur, this.rtQa);
        const qx = 1 / this._quarter.x, qy = 1 / this._quarter.y;
        for (let i = 0; i < 2; i++) {
          this.mBlur.uniforms.tSrc.value = this.rtQa.texture;
          this.mBlur.uniforms.dir.value.set(qx * 1.5, 0);
          this._blit(this.mBlur, this.rtQb);
          this.mBlur.uniforms.tSrc.value = this.rtQb.texture;
          this.mBlur.uniforms.dir.value.set(0, qy * 1.5);
          this._blit(this.mBlur, this.rtQa);
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
      cu.tBloomWide.value = wide ? this.rtQa.texture : this.blackTex;
      cu.wideStrength.value = wide ? this.strength * this.quality.wideStrength : 0;
      cu.aberration.value = this.lens.aberration;
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
