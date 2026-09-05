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
