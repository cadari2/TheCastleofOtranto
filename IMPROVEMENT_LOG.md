# Improvement Log

A running record of autonomous improvement passes. Each session records what
changed and why, what was tried and rejected, and what is open for next time.
Read this before re-deciding anything already settled here. Earlier planning
documents (`GRAPHICS_PLAN.md`, `VISUAL_ARTIFACTS_PLAN.md`) predate this log
and describe work that is already merged.

The target player, for every decision below: loves gothic horror and
psychological thrillers, and is drawn to *contrast* — oppressive, creepy
labyrinths and dark misty forests set against bright blue skies with fluffy
white cumulus. Mood, dread and atmosphere over mechanical complexity.

---

## Session 1 — 2026-09-05 — sky, forest, transitions (v0.2)

### Starting point

Headless review (Playwright + Chromium/SwiftShader, 1280×720) of all five
chapters on `main` at v0.1.1. What was holding the game back, in order:

1. **The daytime sky was a gradient.** The painted 2048×1024 canvas sky drew
   "clouds" as ~140 soft radial-gradient ellipses at 5–12 % alpha; in the
   courtyard they read as faint streaks. With a muted, hazy, late-afternoon
   palette the exterior was the *same* tonal register as the interiors. The
   bright half of the contrast the audience wants did not exist.
2. **The forest was dark but not misty.** Linear fog 14→120 left every tree
   crisp to the horizon; the one mist bed was at 10 % opacity; no light
   penetrated the canopy.
3. **The shore was unreachable and invisible** (a real bug): the sea plane
   sat at y −1.2 while the beach terrain dipped to ≈ −4 in front of it, so
   the water surface covered the whole approach at eye level, and the ridge
   of boulders had no gap — the "shore" chapter never showed the sea.
4. **Hard-edged light cones.** The vault light-wells, the visor shaft under
   the casque and the moonbeam over Alfonso's tomb were open cones with a
   flat additive material: plastic funnels, not light.
5. Zone changes were a plain fade to black; nothing about the *eye*
   registered leaving daylight for the dark.

### What changed

**Procedural GPU sky dome — `js/sky.js`** (new). A BackSide sphere that
follows the camera, shaded per pixel: atmosphere gradient with horizon
haze; sun/moon disc with scattering halo (moon gets fBm mare); *cumulus*
from a 6-octave fBm projected onto a cloud plane (so perspective
foreshortening toward the horizon is real), coverage-thresholded and
edge-eroded by a detail octave, shaded by re-sampling density toward the
sun (grey bases, lit tops, silver lining where thin and near the sun); a
thin wind-streaked cirrus veil; twinkling hashed stars occluded by cloud.
Octaves drift at different rates so clouds boil rather than slide. The same
fragment body is baked once per chapter into a 1024×512 equirect render
target used as `scene.environment` (r160 PMREM-filters it internally), so
IBL agrees with the visible sky. `materials.sky()` keeps its signature and
delegates; the painted path remains as the fallback if the shader fails.
Dome is on layer 1 so the SSAO depth prepass reads it as far-plane sky;
`fog: false`; hidden inside the casque.

**Chapter I retuned** to a high clear afternoon: deep blue zenith
(`0x1e56b0`), white cumulus at ~50 % cover, sun higher and harder, haze
lighter, fog pushed out to 55→230. The screen-space god rays now stream
from the actual sun disc through cloud gaps.

**Chapter IV — the wood and the shore.** Fog 6→78 (the wood swallows itself
a few trees deep). Three mist beds: crawling floor bank (17 %, three
sheets), head-height drift, sea mist on the beach. Sixteen thin moon shafts
scattered off the path along the moon direction. Moon 1.0→1.25, hemisphere
fill 0.34→0.42, exposure 1.12, forest-floor tint moon-blued. Terrain
profile rebuilt as one continuous fall to a beach that meets the sea at the
water line (sea at −3.6); the ridge has a cleft at the path so the beach
and sea show through; cave mouth opens off the cleft; wet boulders on the
sand. Path kept clear of trees through the cleft.

**`props.lightShaft`** (new): tapered open cylinder with a small shader —
alpha fades at the silhouette (|N·V|), along the length from the source,
and breathes with scrolling noise. Replaces all three hard cones and
provides the forest shafts.

**Eye adaptation.** Chapters declare `adapt: { from, seconds }`; the
renderer starts at `target × from` and eases to target once the title card
has passed. Vaults 0.28×/9 s, tower 0.5×/5 s, wood 0.45×/6 s, tomb
0.4×/7 s; the courtyard starts at 1.9× (blooms white, settles in 4 s). A
beat can override via `world.adaptOverride` (the casque, on resume).
`OTR.game.adaptExposure(from, seconds)` for mid-chapter use.

**Ambient cues.** `audio.scatter(name, minMs, maxMs)` runs sparse one-shots
declared in the chapter's `ambience.scatter`; new procedural `owl` (wood)
and `drip` (vaults, church) voices. Also: mist sheets feather their
rectangular edges; `props.rock` displaces coherently (boulders were spiky
shards); the fallen lamp in the vaults glows brighter so it can be found;
courtyard pollen no longer floats inside the casque.

Version 0.2: `OTR.VERSION`, README first line, `?v=0.2` on every script tag.

### Verified

Headless captures before/after for every chapter (the harness lives outside
the repo; it serves the folder, jumps chapters via `OTRDEBUG`, teleports the
player and screenshots). Observed: Ch. I sky is deep blue with distinct
white cumulus with grey undersides and god rays from the disc; Ch. IV shows
moonlit clouds, stars, moon with mare, shafts between trees, mist banks
that vanish into blue-black fog, and from the beach the sea horizon,
boulders and the wood behind; the visor shaft, vault wells and tomb beam
read as soft light; the lamp pickup and searcher corridor in Ch. II still
play; zero page errors across all chapters.

Whole-frame draw calls and triangles (all post passes summed, 1280×720):

| view | calls | triangles |
|---|---|---|
| Ch. I courtyard | 1542 | 247 k |
| Ch. IV wood | 2362 | 468 k |
| Ch. IV beach | 3222 | 564 k |
| Ch. V nave | 498 | 14 k |

The sky dome is one draw call. Its cost is per *sky pixel*: roughly 24
noise evaluations (≈ 100 hashes). On an integrated GPU at 1080p with the
whole frame sky that is on the order of 2–3 ms; in the courtyard the walls
cover most of it. SwiftShader frame times here are not representative of
real hardware and were used only for relative sanity (no regression
between before and after captures at matched views).

### Tried and rejected

- **Static painted cumulus** (improving the canvas painter): would look
  fine once, but cannot drift or boil, and the plane-projection perspective
  is what makes the cloud field read as overhead rather than wallpaper.
- **Re-baking the environment every frame** for animated reflections:
  PMREM regeneration is far too expensive; reflections of a static sky are
  indistinguishable in play.
- **Denser trees / higher-poly crowns**: 150 trees × 6 lobes at
  icosahedron detail 3 is > 1 M triangles; the fog now hides most crowns
  anyway. Not worth it yet.

### Open for next time

- ~~Tree crowns are still faceted icosahedra in silhouette against the
  moon.~~ Done in session 2 (crown fringe, below).
- The sea is a flat plane with vertex waves; it needs a moon glitter
  (normal-mapped ripples) and a foam line at the beach.
- Ch. III (the tower) was left untouched this pass beyond the sky; its
  gallery is flat blue and the checker floor is loud. Candidates: torch
  pools along the gallery, dust in the moon-window shafts, a colder grade.
- Ch. V nave is very dark between candles; consider a faint clerestory
  moon-wash on the columns so the space reads before the finale.
- Quality knob for the sky on very high-DPR mobile screens (fewer octaves
  when the drawing buffer exceeds ~3 Mpx).
- No build step was introduced; none is needed. Upload is still "copy the
  folder" (see README).

---

## Session 2 — 2026-09-05 — crown fringe (follow-up to PR #8)

**Tree silhouettes.** `props.tree` takes `opts.fringe`: each foliage lobe
gets 9 + 3·r alpha-tested leaf-cluster cards seated on its outer shell,
facing outward with a random roll, merged into one geometry per tree
(one extra draw call). A new `leafCardTex` (110 pointed leaves radiating
from a loose centre) replaces the old unused ellipse cluster for this. The
cards are on layer 1 so the SSAO depth prepass — which ignores alphaTest —
cannot draw square halos around them; they receive shadows but do not cast
(the lobes already do). Applied to wood trees within 34 m of the path and
courtyard trees within 110 m; far trees keep the cheap lobes and dissolve
in fog anyway.

Verified: Ch. IV crowns against the moon read as leafy, ragged edges rather
than facet outlines; the courtyard tree by the gate tower shows the fringe
in daylight. Ch. IV wood view: 2418 → 2532 draw calls, 471 k → 498 k
triangles. No page errors.

Open: the fringe does not sway with the grass wind; the unfringed far
trees are still domes when the fog is thin (the beach looking back).

---

## Session 3 — 2026-09-05 — making it a game (v0.3)

The brief: more game, less walk. The constraint from the audience profile
still holds — tension and dread over mechanical complexity — so the new
systems are all about *being hunted in the dark*, not inventories or
combat depth.

### What changed

**Stealth — `js/stealth.js`** (new). A searcher is a torch-bearing figure
on a waypoint loop with pauses to look about. Each frame: vision cone
(≈95–100°), range scaled by the player's visibility, and a 2D line-of-sight
test against the world's colliders *at the player's current eye height*, so
crouching behind a chest hides you and standing does not. Seen time fills a
detection meter (faster when close, lit, running); unseen time drains it.
Above 0.3 the searcher goes suspicious — turns to the last-seen point,
creeps closer, calls out (a toast in the figure's voice, a stinger). At 1.0
the chapter's `onCaught` fires (fail to checkpoint). Running within earshot
is *heard*, cone or no cone. Visibility multipliers: crouched ×0.55, running
×1.35, lamp lit ×1.5, lamp hooded ×0.5, crouched in a registered hide-spot
×0.3. HUD: an eye that fills (gold → red past 0.6, gold rim while a
searcher is suspicious) and a heartbeat that quickens with the meter.

**Player.** Crouch on C/Ctrl (eye height ×0.62, speed ×0.62, no running;
eased over a few frames). Lamp hood on F in the vaults: light ×0.12,
near-invisible, near-blind; HUD meter dims.

**Chapter II (vaults)** now has two searchers: the cross-corridor domestic
and Manfred's captain on the north passage and inside the trap chamber
itself, so the final search is under pressure. Three pairs of buttresses
along the cross corridor and two pillars in the north passage give cover;
each buttress niche is a hide-spot. The old "within 2.6 m = caught" check
is gone.

**Chapter III (tower)** was a walk; it is now a stealth run. Two domestics
returned early: one paces the gallery, one keeps the armoury and postern.
Four chests along the gallery walls are crouch-height cover (block sight
only when the eye is below 0.95 m). Caught = back to the top of the
gallery ("thrown back into the tower").

**Chapter IV duel** is directional: the knight telegraphs (arm pose +
label) and the prompt wants the matching key — W high guard, S low guard,
A/D sidestep, Space strike/disarm; eight rounds. A wrong key is a miss
like a late one. Three wounds and you fall (fail to the duel checkpoint,
with a message). `ui.qte` accepts a key name and treats the other QTE keys
as misses; `input` records the last key edge.

**Relics — `js/relics.js`** (new). Five gilt reliquaries, one per chapter,
in places off the objective path (courtyard wall, dead end of the cross
corridor, chamber of the giant limb, cave floor beyond the cleft, north
aisle bench). Each opens a short note in the tale's voice (original text,
GPL, not Walpole). Persisted in localStorage; tally on the title and pause
screens.

**Bug fixed along the way:** the checkpoint-fail message was never seen —
`startChapter` wipes the toast while rebuilding. It is now deferred until
the checkpoint has faded back in.

### Verified

A headless functional test (Playwright; the harness drives the world by
stepping `player.update`/`world.update` directly because SwiftShader
frames take 1–2 s): 16 checks pass — line of sight blocked by a buttress
and open down the corridor; C and F toggle crouch and hood; detection
rises in a searcher's cone, the searcher turns suspicious and calls out,
the eye shows and fills, capture fails to checkpoint with the message
shown after reload; crouched behind a buttress the meter stays at 0; both
tower guards present and the gallery guard sees the player; the relic
prompt, note and persistence; the duel won on the right keys advancing to
Chapter V, and three wrong parries falling with the message. No page
errors.

### Tried and rejected

- Per-searcher alert propagation (one guard calling the others) — more
  systems than the audience wants; the two-searcher layouts already
  create crossing patrols.
- A health bar for the duel — replaced by the wounds line in prose, which
  keeps the HUD clean and reads as the book.

### Open for next time

- Searchers do not react to the hooded lamp's *absence* of light (a
  torch-bearer walking into a dark corridor could pause) — flavour only.
- Isabella follows during the vault search and is never seen by the
  searchers; making her hide with you (kneel when you crouch) would sell it.
- The duel could vary the round order per attempt.
- Tune on real hardware: detection rates were set against simulated time.

---

## Session 4 — 2026-09-05 — the air, the water, and a 4K mode (v0.4)

Request: "AAA 4K graphics". Everything here is still plain static files;
no build step, no new assets. The pass went after the three things that
separate a lit scene from a *cinematic* one — the air between the camera
and the walls, the quality of the highlights, and pixel density — plus the
one surface that was still flat-shaded: the sea.

### What changed

**Atmosphere (`js/atmo.js`, new).** three.js fog is a flat blend toward one
colour by distance. The shared fog shader chunks are now rewritten once at
load, so *every* built-in material (stone, ground, figures, sprites, mist
sheets, grass) gets:

- height fog — an exponential density profile integrated analytically along
  the camera→fragment ray. The forest mist lies in the low ground and thins
  toward the canopy (base 0.5 m, falloff 0.18, 70 %); the courtyard haze
  thins up the walls so the battlements read crisper than the paving;
- inscatter — the fog colour brightens toward the sun/moon with a tunable
  lobe (courtyard: warm, power 7; wood: moon-blue, power 5; tower: power 9),
  so the far haze glows where the light stands behind it;
- drifting density — a 2-octave value noise over world XZ, scrolled slowly,
  so the far fog breathes in banks (strongest in the wood and the vaults).

Uniforms are shared objects injected through `Material.prototype.onBuild`,
which the renderer calls for every program it compiles, so one set of values
drives every material including the ones with their own `onBeforeCompile`.
Chapters call `OTR.atmo.set({...})`; `startChapter` resets it. Nothing in
the chapters' existing `setFog` calls changed.

**Post pipeline (`js/postfx.js`).** A second, quarter-res bloom tier (the
bright pass resampled down and blurred there) adds the broad soft veil
around torches and the sun that the tight half-res glow could not give; a
faint radial chromatic aberration in the composite (0.0025, growing toward
the frame edge) takes the "computer-clean" edge off highlights. New
`setQuality()` exposes the AO resolution scale and sample count (compiled
in as `AO_SAMPLES`), the wide tier, and the aberration amount.

**Graphics presets (`js/quality.js`, new).** Low / Medium / High / Ultra
4K, and Auto (default). Ultra renders at ≥2× the display's pixels — a
3840×2160 internal image on a 1080p screen, native on a 4K/Retina display —
with full-resolution AO ×16 samples, 4096 shadow maps, 16× anisotropy and
the wide bloom. Low is 1×, 1024 shadows, half-res AO ×7, no wide tier, no
aberration. Auto starts at High and watches real in-world frame times in 3 s
windows: over 26 ms steps down, under 9 ms steps up, with a cooldown and a
lock after any down-step that follows an up-step, so it cannot seesaw.
Everything applies live — pixel ratio, post targets, directional shadow
maps (disposed and rebuilt at the new size), texture anisotropy — and the
choice persists. A **Graphics** button on the title and pause screens cycles
it; the version tag and README list it.

**Water (`materials.water`).** The sea was a flat dark plane with a CPU
swell. It now carries a tileable normal map (sum of nine directional sines,
integer wave counts so it wraps) sampled three times at different scales
and drift speeds so the surface rolls rather than slides; the moon and the
baked sky break into a field of glitter across it. A foam line breathes
along the shore (a slow noise inside a band from the water's edge), whiter
and rougher where it breaks.

Anisotropic filtering went from 8× to the preset's value (16× on High and
Ultra) for every surface texture, including the drawn ashlar walls.

### Verified

Headless SwiftShader captures of every chapter (scratchpad `v4/`): the
wood shows the mist lying low with the canopy clear above it and the far
fog in banks; the courtyard and tower are unchanged in tone with the sky
and battlements intact; the tower gallery, vaults and tomb resume without
daylight inscatter leaking in. A new functional suite (`gfxtest.js`, 13
checks) passes: Auto/High default at 1× on a 1× display; Ultra doubles the
drawing buffer (1280×720 from a 640×360 window) with full-res AO ×16 and
persists; Low drops to half-res AO ×7, 1024 shadows and no wide tier;
cycling order; the chapter-1 shadow map follows the preset and is resized
and rebuilt live mid-chapter; the fog chunk is compiled into 13 of 23
programs and the inscatter amount is read back from every fogged GPU
program; the water program links with its ripple map, the fog drift time
advances, and Chapter II resumes with inscatter and height fog reset. The
v0.3 gameplay suite (16 checks) still passes once its duel step stretches
the parry windows for the harness — the windows are wall-clock and the
evidence screenshot now outlasts them under SwiftShader; a direct trace of
the duel shows all eight parries land and the chapter advances. An Ultra
run on a 1920×1080 window at 2× DPR produced a 3840×2160 scene buffer with
3840×2160 AO ×16 and 16× anisotropy, no GL error (`v4/ch1-ultra4k.png`).

Cost, SwiftShader ms/frame at 1280×720, High preset, same machine, run
sequentially against the previous commit: courtyard 2344 → 2824 (+20 %),
wood 4278 → 5450 (+27 %). Most of that is the 16× anisotropy and the extra
bloom tier, both of which are near-free on a real GPU; Auto steps down if
they are not.

### Tried and rejected

- Screen-space depth fog in the post pass (would double-fog against the
  material fog and miss the sprites) — patching the shared fog chunk gives
  every material the same air for one code path.
- 8192 shadow maps for Ultra — 256 MB of depth for a barely visible gain
  at this geometry scale.
- Vignette and film grain inside the composite — the CSS overlays already
  do this at zero GPU cost; moving them would only add uniforms.

### Open for next time

- Real-hardware tuning of the Auto thresholds (26 ms / 9 ms) and of the
  inscatter strengths; SwiftShader cannot say what a laptop GPU will do.
- The water still has no refraction or depth tint at the shore; foam is a
  band, not wave-driven.
- Temporal anti-aliasing would let Ultra drop MSAA at 4K.
- A sharpening pass for Medium/Low, where the image is below native.

---

## Session 5 — 2026-09-10 — banding, torches, figures (v0.5)

### Starting point

Player screenshots from a Retina MacBook (Brave, High preset), Chapter II:

1. **Near-horizontal stripes across every frame**, "like dithering on a
   CRT": faint bands a few degrees off horizontal, ~15 px wide, repeating
   every ~170 px, visible over the ceiling, floors and walls, strongest in
   the dark.
2. A **flat black 16-gon** hanging under each vault light-well when the
   player looked up: the "hole" disc that stood in for the opening.
3. **Wall-torch fire floating** a hand's width below and beside the bare
   bracket rod instead of burning on a torch.
4. **Figures still read as chess pawns** — a lathe-turned bulb, a ring, a
   ball.

### Diagnosis

The stripes are the SSAO's sample-rotation noise. The pass used
interleaved gradient noise, which is a *gradient* along a nearly
horizontal direction (`dot(p, (0.0671, 0.0058))`): its wrap lines are
stripes 1/0.0671 ≈ 15 px apart along x and 1/0.0058 ≈ 170 px along y,
tilted ~5°. Adjacent pixels along a stripe get near-identical rotation and
therefore near-identical occlusion estimates; across a wrap the estimate
jumps. That structure is far larger than the 5-tap gaussian that followed
it, so it survived unblurred and the ACES + sRGB curve in the dark vaults
amplified it. IGN is meant to be dissolved by temporal AA, which this
pipeline does not have.

A second, subtler contributor: the scene render target was 8-bit *linear*.
Below 0.02 linear an 8-bit channel has ~5 levels, and the vault lives
there; the composite's tone-map then stretched those steps into contours.

### What changed

**`js/postfx.js`.** The rotation now comes from a 4×4 repeating tile (16
angles) and the AO blur is a single depth-aware 4×4 box over exactly one
tile period, so the noise cancels rather than being smeared. Normals are
reconstructed from the closer of each screen-derivative pair (no one-texel
dark rim at silhouettes), a small distance floor stops a flat surface's own
texels self-occluding, and normals are forced to face the camera. The
scene, bloom and god-ray targets are half-float where
`EXT_color_buffer_float` exists (falls back to 8-bit); the bright pass caps
HDR peaks at 2.5 so the 9× sun disc cannot detonate the bloom. The
composite adds a ±½ LSB triangular dither before the 8-bit canvas so slow
dark gradients cannot band.

**`props.lightWell`** (new). A ceiling is one slab, so an opening cannot be
cut from it; the well punches through instead: the shaft (a stone tube
with reversed winding so the shared tiling material draws its interior, a
moonlit cap bright enough to bloom, a dim fill light, an iron grate and
ring at the mouth) renders first at a negative render order, then a
depth-only mask disc flush under the slab makes the slab fail the depth
test over the opening. Motes, figures and the beam draw over it normally.
Chapter II's two `moonShaft`s use it; the black disc is gone. Note the
mouth is the slab's *underside* (`P.ceiling` centres a 0.4 m box on its
y), which was the first bug in this session.

**`props.wallTorch`** rebuilt: wall plate and rivet, angled iron arm, and
a torch proper in an iron ring at the arm's tip — wooden haft, charred
pitch head with a faint ember emissive — with the fire group seated so the
flame's base rises from the head (the fire origin sits ~0.1×size above the
flame base in `world.torch`). The soot stain moved up to match.

**`js/figures.js`** rewritten as articulated humanoids: hips and jointed
legs (thigh, knee, shin, boot), an elliptical torso with real shoulders,
neck, an ovoid head with jaw, brow, nose and eyes, jointed arms with
hands; over that a floor-length gathered robe or a knee-length tunic,
belt, a half-tube cloak from the shoulders, and a cowl opened toward the
front with a rolled brim (the face darkened to sit in its shadow). Armour:
cuirass with a keel, fauld and tassets, pauldrons, gorget, plate legs with
poleyns, sabatons, and a bascinet with comb, brow band, visor slit and
bevor. Nothing is rotationally symmetric any more. A per-figure updater
measures displacement each frame and drives a stride: legs swing from the
hip with a knee bend, arms counter-swing, the torso bobs and twists; at
rest the limbs ease to idle sway. This covers `walkTo`, the stealth
searchers and Isabella's follow without changing their code. The guard's
torch is a haft in the raised right hand with the fire following the hand
in world space, so the flame stays upright. `userData.rarm/larm` remain
the elbow groups for ch4's sword swing.

### Verified

Headless SwiftShader captures of Chapter II at the `trapdoor` checkpoint
(scratchpad `before/`, `after2/`): looking up under the cloister well shows
the shaft, grate and moonlit cap instead of a black disc; the corridor
torch burns on its head at the arm's tip; Isabella follows hooded and
cloaked mid-stride; the captain patrols with knee bend and raised torch.
Chapters I, III, IV and V load with zero console errors. The stripe
structure cannot be reproduced at 720p under SwiftShader (too dark, too
small), so that fix is verified by construction: a 4×4 box over a 4×4 tile
has no residual by definition, and the half-float buffer removes the
quantisation the curve was amplifying.

### Tried and rejected

- Cloning the vault-stone material for the well's tube — `Material.clone`
  drops the stochastic-tiling `onBeforeCompile`; reversing the tube's
  winding keeps the shared material.
- Keeping IGN and widening the gaussian — a ~170 px stripe period would
  need a blur far wider than any occlusion detail.

### Open for next time

- Real-hardware check of the AO on a Retina display at High (half-res AO
  at 2× DPR is full CSS-pixel resolution; the tile is then 4 CSS px).
- Figure hands are mitten spheres; a thumb and a held-object socket would
  let Manfred draw his sword.
- The well's cap is a flat disc; a sky-dome sample through it would tie it
  to the chapter's moon.
