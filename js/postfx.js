/* postfx.js — a small, self-contained bloom pass built on core three.js only
   (the vendored build is the global r160 script, so the ES-module
   EffectComposer/UnrealBloomPass are not available).

   Everything runs in LINEAR tone-mapped space (the render targets do no colour
   encoding) and the composite does the single sRGB encode itself, so the result
   matches what the renderer draws straight to the canvas — with strength 0 the
   output is identical:

     scene ──tone-map──▶ rtScene (MSAA, linear)
     rtScene ──bright-pass──▶ rtHalfA
     rtHalfA ──blur H──▶ rtHalfB ──blur V──▶ rtHalfA   (×2 iterations)
     composite: sRGB( screen(rtScene, bloom·strength) ) ──▶ canvas

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
      vec3 s = texture(tSrc, vUv).rgb * 0.227027;
      s += texture(tSrc, vUv + dir * 1.3846).rgb * 0.316216;
      s += texture(tSrc, vUv - dir * 1.3846).rgb * 0.316216;
      s += texture(tSrc, vUv + dir * 3.2308).rgb * 0.070270;
      s += texture(tSrc, vUv - dir * 3.2308).rgb * 0.070270;
      outColor = vec4(s, 1.0);
    }`;

  const COMPOSITE = `
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength;
    vec3 toSRGB(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
    }
    void main() {
      vec3 base = texture(tScene, vUv).rgb;   // linear tone-mapped
      vec3 bloom = texture(tBloom, vUv).rgb;  // linear
      // screen-blend the bloom so highlights glow without washing mid-tones
      vec3 b = bloom * strength;
      vec3 c = 1.0 - (1.0 - base) * (1.0 - b);
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
      this._half = new THREE.Vector2(hw, hh);

      const mk = (frag, uniforms) => new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag,
        uniforms, depthTest: false, depthWrite: false
      });
      this.mBright = mk(BRIGHT, { tScene: { value: null }, threshold: { value: this.threshold }, knee: { value: this.knee } });
      this.mBlur = mk(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
      this.mComposite = mk(COMPOSITE, { tScene: { value: null }, tBloom: { value: null }, strength: { value: this.strength } });

      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mBright);
      this.quadScene = new THREE.Scene();
      this.quadScene.add(this.quad);
      this.quadCam = new THREE.Camera();
    }

    setSize(w, h) {
      w = Math.max(2, w | 0); h = Math.max(2, h | 0);
      const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
      this.rtScene.setSize(w, h);
      this.rtA.setSize(hw, hh);
      this.rtB.setSize(hw, hh);
      this._half.set(hw, hh);
    }

    _blit(mat, target) {
      this.quad.material = mat;
      this.renderer.setRenderTarget(target || null);
      this.renderer.render(this.quadScene, this.quadCam);
    }

    render(scene, camera) {
      const r = this.renderer;
      if (!this.enabled || this.strength <= 0) {
        r.setRenderTarget(null);
        r.render(scene, camera);
        return;
      }
      // 1) scene → rtScene (tone-mapped + sRGB-encoded, identical to canvas draw)
      r.setRenderTarget(this.rtScene);
      r.clear();
      r.render(scene, camera);

      // 2) bright-pass at half res
      this.mBright.uniforms.tScene.value = this.rtScene.texture;
      this.mBright.uniforms.threshold.value = this.threshold;
      this.mBright.uniforms.knee.value = this.knee;
      this._blit(this.mBright, this.rtA);

      // 3) separable gaussian blur, two iterations
      const dx = 1 / this._half.x, dy = 1 / this._half.y;
      for (let i = 0; i < 2; i++) {
        this.mBlur.uniforms.tSrc.value = this.rtA.texture;
        this.mBlur.uniforms.dir.value.set(dx, 0);
        this._blit(this.mBlur, this.rtB);
        this.mBlur.uniforms.tSrc.value = this.rtB.texture;
        this.mBlur.uniforms.dir.value.set(0, dy);
        this._blit(this.mBlur, this.rtA);
      }

      // 4) composite to the canvas
      this.mComposite.uniforms.tScene.value = this.rtScene.texture;
      this.mComposite.uniforms.tBloom.value = this.rtA.texture;
      this.mComposite.uniforms.strength.value = this.strength;
      this._blit(this.mComposite, null);
    }
  }

  OTR.PostFX = PostFX;

})(window.OTR);
