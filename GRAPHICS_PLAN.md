# Graphics Improvement Plan — The Castle of Otranto

*A concrete, phased plan for taking the game's visuals from "programmer art"
to something genuinely atmospheric — including an honest assessment of the
Gaussian-splat look (SuperSplat / PlayCanvas) that prompted this plan, and
whether a re-code is the right move.*

---

## 1. What the reference video actually is (and why it looks so good)

The clip that motivated this plan is a **3D Gaussian Splat** shown in
**SuperSplat**, PlayCanvas's splat editor/viewer. That is not a style of
game rendering that can simply be "turned on." It works like this:

1. Someone walks around a **real place** (that house) taking hundreds of
   photos or a video.
2. Photogrammetry + splat training software (Polycam, Luma AI, Scaniverse,
   Postshot, nerfstudio…) reconstructs the scene as millions of tiny
   translucent colored blobs ("Gaussians").
3. A viewer (SuperSplat, PlayCanvas engine, or a Three.js splat library)
   renders those blobs. It looks photoreal because **it is literally made of
   photographs** — every lighting effect, shadow, and material response was
   captured by the camera, not simulated.

The consequences for us:

| Property of splats | Impact on this game |
| --- | --- |
| Needs source imagery of a real (or AI-generated) place | There is no real Castle of Otranto interior to photograph; we'd need location captures of stand-in castles, or generative tools (e.g. World Labs Marble) |
| Lighting is **baked** — frozen at capture time | Our chapters live on dynamic light: the guttering lamp, torch flicker, moonlight, the storm in Ch. V. A splat can't respond to any of that |
| No geometry — no shadows cast *onto* it by game objects, no collision | Figures, the giant helmet, the sword duel would visibly float on top of it; all collision would be hand-authored invisible geometry |
| Large downloads (typically 30–300 MB per scene) | ×5 chapters, on plain shared hosting, vs. the current ~6 MB total |
| Best-in-class photorealism for *static environments* | Genuinely unbeatable for vistas and backdrops |

**Bottom line:** splats are a real option (Section 5, Option C uses them),
but "make the whole game a splat" would mean rebuilding the game as a
walk-through of five static photographs — losing the dynamic lamp, the
torch-lit chase, the apparition, the duel. The photoreal look in that video
comes from the *capture*, not from PlayCanvas — switching engines alone
buys none of it.

---

## 2. Honest assessment of the current graphics

The stack (Three.js r160, vendored, no build step):

- **Geometry** — everything is procedural primitives: walls are
  `BoxGeometry`, arches are rings of voussoir boxes, crenellations are box
  rows, trees are billboard leaf-clusters, figures are lathe-turned robes
  (`props.js`, `figures.js`).
- **Materials** — ambientCG PBR sets (color/normal/roughness only — no AO,
  no height), plus canvas-composited stone-block textures (`materials.js`).
- **Lighting** — one shadow-casting directional sun (2048 px PCF-soft),
  a hemisphere fill, flickering point-light torches, per-chapter fog.
- **Environment** — a 256×128 **canvas gradient** as the environment map,
  and a vertex-colored gradient sphere as the sky (`materials.makeSky/makeEnv`).
- **Post** — ACES tone mapping + a hand-rolled bloom (`postfx.js`), CSS
  film grain and vignette.

Why it reads as "terrible" despite all that being *correct*:

1. **No ambient occlusion of any kind.** Nothing darkens where surfaces
   meet, so every wall, merlon, and prop looks pasted on / floating. This is
   the single biggest realism killer in the current image.
2. **Gradient sky + 256px gradient env map.** The sky is visibly a
   synthetic ramp; reflections/ambient light have no real-world structure,
   which flattens every material.
3. **Obvious texture tiling.** `repeat: 22` courtyard paving and
   `repeat: 24` grass tile visibly to the horizon with no variation,
   detail-mapping, or decals to break them up.
4. **Box-massing architecture.** Real castles have string courses, batter
   at the wall base, window reveals, buttresses, rubble variation. Ours are
   flat cuboids with a block texture painted on, so silhouettes and grazing
   light give the game away instantly.
5. **Primitive vegetation.** Cypress "trees" are cones/billboards; grass is
   a flat textured plane.
6. **No screen-space or baked contact effects** — no SSAO, no god rays, no
   contact shadows, no color grading beyond raw ACES.

None of this is architectural debt — the code is clean and modular, with a
material library, a props kit, and per-chapter builders that are easy to
upgrade piecemeal. **A full re-code is not required to fix any of items
1–6.** That's good news: it means visual improvement can be incremental and
low-risk.

---

## 3. Constraints this plan respects

- **Static hosting, no build step** stays (README promise: drop folder on
  cPanel and it runs). Everything below works from plain files; where ES
  modules are needed we use a `<script type="importmap">` pointing at
  vendored files — still zero tooling.
- **Licensing**: stick to CC0 / MIT / CC-BY assets and libraries (Poly
  Haven, ambientCG, Quaternius, Kenney) compatible with GPLv3.
- **Performance budget**: must stay playable on integrated GPUs; each phase
  lists its cost.

---

## 4. Recommended plan (upgrade in place) — four phases

### Phase 1 — Lighting & image fixes (highest impact per hour)

*Goal: the same geometry suddenly looks grounded and photographic.*

1. **Real HDRI skies + environment lighting.** Vendor 5 small Poly Haven
   HDRIs (1–2k, CC0): late-afternoon Mediterranean for Ch. I, dark
   interior/night ones for II/III/V, moonlit for IV. Load with
   `RGBELoader` + `PMREMGenerator`, set as `scene.environment` (and
   `scene.background` where the sky is visible, with
   `backgroundBlurriness`/`backgroundIntensity` tuned per chapter).
   Replaces `makeEnv`'s 256px gradient; `makeSky` stays as a fallback for
   `file://` play. *Files: `materials.js`, chapter files. ~2–4 MB assets.*
2. **Ambient occlusion.**
   - *Baked (cheap, works everywhere):* bake per-vertex AO for the static
     architecture at build time — cast a few dozen hemisphere rays per
     vertex against the chapter's collider set (we already have the
     colliders), write `color` attributes, enable `vertexColors`. Runs once
     per chapter load in a worker; zero per-frame cost.
   - *Screen-space (better, GPU-dependent):* integrate **N8AO** (MIT,
     single-file, works with vanilla Three) into `postfx.js` behind a
     quality toggle.
   Do both: vertex AO as the floor, N8AO on capable machines.
3. **Shadow quality.** Tighten the sun shadow frustum per chapter (fit to
   the playable area rather than a fixed ±60), bump to 4096 on desktop,
   keep `radius` softening. Give the 2–3 nearest torches shadow-casting
   point lights (already supported via `opts.shadow`) with a distance-based
   handoff so only the closest cast.
4. **Color grading + camera polish.** Add a per-chapter 3D LUT (or a cheap
   lift/gamma/gain in the composite shader we already own) — cold
   blue-green vaults, amber courtyard, silver moonlight. Move vignette and
   grain into the shader (screen-space CSS grain currently sits *on top of*
   bloom, which is backwards). Add subtle chromatic aberration at screen
   edges.

*Effort: ~3–5 days. Risk: low — all additive, fallbacks everywhere.*

### Phase 2 — Materials & anti-tiling

*Goal: surfaces survive being looked at.*

1. **Complete the PBR sets** — ambientCG provides AO + displacement maps
   for every set we already ship; add `aoMap` (with a `uv2` copy) and
   parallax-free `displacementMap` only where geometry is tessellated
   (terrain). ~2 MB.
2. **Kill visible tiling** on the big surfaces (courtyard paving, grass,
   forest floor) with a **stochastic tiling / hex-blend shader chunk**
   injected via `onBeforeCompile` — a well-known ~30-line technique that
   makes any tiling texture aperiodic. Add a macro-variation tint (low-freq
   noise darkening) on top.
3. **Detail normals** — a shared 512px detail normal map, world-scaled, on
   stone/rock/paving so close-ups don't dissolve into blur.
4. **Decal pass** — a small decal kit (soot above torches, damp streaks
   under crenellations, moss at wall bases, blood in Ch. V) using
   `DecalGeometry`. This is what makes procedural buildings stop looking
   sterile.

*Effort: ~3–4 days. Risk: low; shader chunk needs testing on ANGLE/mobile.*

### Phase 3 — Geometry & asset upgrades

*Goal: silhouettes stop being boxes.*

1. **Castle kit upgrades in `props.js`** (still procedural, still no model
   files): batter (slope) at wall bases, a string-course molding at
   mid-height, chamfered merlon caps, window/door reveals with lintels,
   corbels under overhangs, buttresses on long walls. Merge each wall run
   into one `BufferGeometry` (`BufferGeometryUtils.mergeGeometries`) —
   fewer draw calls than today, more detail.
2. **glTF hero props for the set-pieces that carry the story**: the giant
   helmet, Alfonso's tomb/effigy, the portrait frame, the armory pieces,
   church furniture. Source CC0 (Poly Haven models, Sketchfab CC0/CC-BY,
   Quaternius) or sculpt once in Blender and export. Load with the
   (vendored) `GLTFLoader` + `DRACOLoader`; keep the current procedural
   versions as `file://` fallbacks. Budget ~1–2 MB each, Draco-compressed.
3. **Real trees & grass.** Replace cone-cypresses with 2–3 low-poly glTF
   trees (Quaternius, CC0) instanced via `InstancedMesh`; add camera-facing
   grass-card instancing (a few thousand instances, one draw call) around
   the courtyard and the Ch. IV wood, with a simple wind vertex shader.
4. **Figures**: keep the stylised hooded design (it's a deliberate,
   defensible choice — see README) but add cloth-fold normal maps to the
   robes, a rim-light material tweak, and simple bone-less vertex "breathe"
   animation so idle figures don't read as statues.

*Effort: ~1–2 weeks depending on how many hero assets. Risk: medium —
asset sourcing/licensing review takes real time.*

### Phase 4 — Atmosphere & post (the "wow" layer)

1. **Volumetric light**: cheap radial god-ray pass from the sun/moon
   (screen-space, in our existing composite), plus soft additive "light
   shaft" cards in doorways and the vault light-wells — huge mood win for
   Ch. II/III/V.
2. **Better fog**: height-fog + noise (a `fog_fragment` override) so the
   vaults get crawling ground mist, the shore gets sea haze.
3. **Particles upgrade**: soft-particle dust motes (fade near geometry),
   embers above torches, drifting leaves in the wood, rain streaks +
   lightning flash rig for the Ch. V storm.
4. **Upgrade AA**: the MSAA render target already exists; add optional TAA
   or SMAA pass for shader-aliasing (the block joints currently shimmer).

*Effort: ~4–6 days. Risk: low-medium (perf tuning).*

**Expected outcome after Phases 1–4:** the game moves from "colored boxes
with textures" to the look of a respectable indie *Dear Esther*-era title:
grounded contact shadows, photographic skies, aperiodic surfaces, real
silhouettes, light shafts and mist. It will not look like the splat video —
nothing rendered in real time from synthetic assets will — but it will look
*designed* instead of *generated*.

---

## 5. The alternatives you asked about

### Option B — Re-code on PlayCanvas

What PlayCanvas would actually buy us: a visual editor, clustered
lighting, a runtime lightmapper, and **first-class Gaussian-splat support**
(the engine behind SuperSplat). What it would cost: rewriting ~4,100 lines
across 16 modules (chapters, props, figures, player, UI glue), re-testing
five scripted chapters, and giving up nothing-to-install simplicity only if
we adopt their editor pipeline (engine-only PlayCanvas can still be a
static script).

**Verdict: not recommended as a graphics fix.** The engine is not the
bottleneck — the *content* is. Every improvement in Section 4 has a direct
PlayCanvas equivalent that would need the same asset and lighting work
after a costly port. Re-code only if we go all-in on splats (below) and
want SuperSplat's tooling natively.

### Option C — Gaussian-splat environments (the video's look), hybrid

If the splat look is the goal, the viable version for *this* game is a
**hybrid**: splat backdrops + real-time gameplay layer.

1. **Acquire splats per chapter.** Options, in order of quality:
   - Capture real locations (an actual Italian castello courtyard, crypt,
     chapel, coastal wood) with a phone + Polycam/Luma/Scaniverse, clean up
     in SuperSplat (free, browser-based). This is exactly the house-video
     workflow.
   - Generative: World Labs **Marble** and similar text/image→splat tools
     can produce fictional gothic spaces; quality is improving fast
     (mid-2026) but expect cleanup.
2. **Render them in Three.js — no engine change needed.** Two solid MIT
   libraries: **Spark** (`sparkjs.dev`, World Labs) and
   **`@mkkellogg/GaussianSplats3D`**. Both composite with normal Three.js
   meshes and our existing depth buffer, so figures and props occlude
   correctly.
3. **Keep gameplay geometry invisible**: current colliders stay; current
   procedural architecture becomes a depth-only "shadow proxy" so dynamic
   objects still receive believable shadows.
4. **Design around baked light**: capture each location in the chapter's
   time-of-day; fake the lamp's influence with a screen-space warm
   radial grade rather than true relighting.

**Costs to accept**: 30–150 MB per chapter download; the lamp/torch systems
lose real influence on the world; every chapter needs a capture trip or a
generation+cleanup cycle; dynamic set-pieces (walls thrown down in Ch. V)
need traditional geometry anyway.

**Verdict: worth a spike, not a bet.** Recommended experiment: produce
*one* splat (the Ch. I courtyard exterior seen through the north gate, or
the Ch. IV shoreline) and mount it as a **backdrop/vista** beyond the
playable space, keeping gameplay areas mesh-based. If that spike sings,
expand chapter by chapter.

---

## 6. Suggested order of work

| # | Item | Phase | Impact | Effort |
| --- | --- | --- | --- | --- |
| 1 | HDRI environment + sky per chapter | 1 | ★★★★★ | S |
| 2 | Vertex-baked AO + optional N8AO | 1 | ★★★★★ | M |
| 3 | Anti-tiling shader + macro variation | 2 | ★★★★ | S |
| 4 | Shadow frustum fit + torch shadows | 1 | ★★★★ | S |
| 5 | Color grading / LUT + shader grain | 1 | ★★★ | S |
| 6 | AO/height maps for existing textures | 2 | ★★★ | S |
| 7 | Castle kit detail (batter, moldings, reveals) | 3 | ★★★★ | M |
| 8 | Instanced glTF trees + grass cards | 3 | ★★★★ | M |
| 9 | Hero glTF props (helmet, tomb, effigy) | 3 | ★★★★ | L |
| 10 | God rays + height fog + particles | 4 | ★★★★ | M |
| 11 | Decals (soot, moss, damp, blood) | 2 | ★★★ | M |
| 12 | Splat backdrop spike (one vista) | C | ★★★★? | M |

(S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1 week+.)

Phases 1–2 alone (~a week) deliver most of the perceived quality jump and
touch only `materials.js`, `postfx.js`, `world.js`, and chapter lighting
setup — no gameplay code. That is where to start.
