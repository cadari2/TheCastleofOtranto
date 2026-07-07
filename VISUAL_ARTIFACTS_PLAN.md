# Visual Artifacts — Diagnosis & Implementation Plan

## Status

- [x] 1. Texture failure registry (`materials.js`) — registry + partial-failure
      stripping + 5 s safety sweep. Bonus fix found during verification:
      `stoneBlockMaterial`'s base `Image` now loads `crossOrigin='anonymous'`
      with a taint probe, because a `file://` image could otherwise *taint*
      the block canvas and make the wall texture permanently un-uploadable.
      Verified headless with `assets/textures/**` aborted: stone walls render,
      no blue mirrors, no wandering smears, zero page errors.
- [x] 2. Burning torches — `M.flameSheetTex()` 8-frame procedural spritesheet;
      `world.torch()` rebuilt with 2–3 crossed flame planes at offset phases,
      ≤ 14-ember rising stream per torch, two-sine flicker + positional
      jitter; glow shrunk to a clamped core halo; god-ray strength capped and
      bloom threshold floored in `postfx.js`. Verified in timed headless
      captures: flame silhouette changes frame to frame, embers rise, no
      static orbs.
- [x] 3. Arch rebuild — `P.archway` now sweeps one extruded half-annulus band
      (36 curve segments) with carved joint lines (merged to a single mesh)
      and a proud keystone; same signature, same jamb colliders. Verified at
      the Ch. I gate: continuous crown, no ragged voussoir ring.
- [x] 4. Crenellation + junction pass — merlon + seated cap merged into one
      BufferGeometry per wall run (and the tower ring into one mesh);
      plinth/wash/string-course extended past wall ends so corners close.
- [x] 5. Plume rebuild — each quill is a tapered blade ribbon + thin crossed
      spine, merged into 3 cluster meshes; sway retuned to
      `rot.x = sin(e·1.1+φ)·0.04, rot.z = sin(e·0.7+φ′)·0.015` (a nod, not an
      orbit). Deterministic layout (seeded rng).
- [x] 6. Motif fullness — giant sword blade is one extruded outline with
      bevelled cross-section, fuller strip and true tapered tip; tomb effigy
      is a lathe-turned recumbent form under a half-shell drape (head on a
      stone pillow, arms crossed).
- [x] 7. Figures with presence — robe lathe gains hem-fading cloth folds;
      loose sleeves with cuffs held away from the body (fitted steel arms on
      armoured presets); hood gets a raised cowl rim, double-sided interior
      and deeper face recess; belt with hanging strap on robed figures.
      `F.make` signature, presets and `walkTo`/`faceTo` untouched — Ch. I
      crowd verified rendering and animating.
- [ ] 8. v0.1 version bump
- [ ] 9. Mechanical tail

Approved scope: **A (loader hardening) + B (solid architecture kit) + C (great
motifs) + D (figures with presence)**, at a **performance-neutral** budget.
Confirmed launch method: opening `index.html` directly from disk (`file://`).
Additional direction from review: torches should read as genuinely **burning,
flickering fire** (not merely tamed glow sprites), and on completion the game
version bumps to **v0.1**, displayed somewhere in the game itself.

## Overview

The reported artifacts — saturated blue walls, glare/smears that wander around the
scene as game time passes, and chunky "incomplete" geometry — have one root cause
and two construction weaknesses:

1. **Root cause (reproduced):** when the game is opened via `file://`, Chrome blocks
   the texture image loads. `stoneBlockMaterial` (and any `pbr()` material whose
   color map loads but whose secondary maps fail) keeps a *dead* roughness/normal
   texture attached. A dead texture samples as black → `roughness = 0` → walls become
   glossy mirrors of the blue sky. Flickering torch light, bloom, and god-rays then
   smear across the mirror surfaces, producing the moving artifacts. Blocking
   `assets/textures/*` in a headless browser reproduces the user's screenshots
   pixel-for-pixel; stripping the dead maps restores correct stone rendering with
   no textures at all.
2. **Arches** are rings of ~26 independently rotated boxes that overlap raggedly —
   the "broken crown" look at the gate.
3. **The casque's plume** is 46 bare tubes (reads as an urchin), and its sway updater
   makes every quill precess in a perfect circle forever (`rot.x = sin, rot.z = cos`),
   another "moves around and around" contributor.

## Approach Chosen

- **A — Texture pipeline hardening.** Every texture slot must be safe on load
  failure. No material may ever keep an attached texture whose image never arrived.
- **B — Solid architecture kit.** Replace block-cloud assemblies with continuous
  swept geometry (validated in-engine: extruded half-annulus arch band + joint
  lines + keystone), and seat/merge the crenellation work. Net draw-call count goes
  down, not up.
- **C — Great motifs.** Feather-blade plume (validated in-engine), plus fullness
  passes on the giant sword, tomb effigy. Sway animation retuned to a nod, not an
  orbit.
- **D — Figures with presence.** Fuller silhouettes for the cast in `figures.js`:
  sleeved arms held away from the robe, hood volume, belts and trim, subtle
  cloth-fold geometry in the lathe profile — still stylized and faceless.
- **Burning torches.** Replace the single flame sprite + oversized glow sprite
  with layered fire: stacked animated flame planes driven by a procedurally
  drawn multi-frame flame spritesheet (offset phases, additive blending), a
  small rising-ember particle stream, and the existing PointLight with a richer
  flicker curve (two combined sine frequencies plus slight positional jitter).
  The big glow sprite shrinks to a faint core halo — the fire itself carries
  the light.
- **v0.1 version bump.** README goes from `v 0.0.5` to `v 0.1`, and the version
  string is rendered inside the game (title screen corner), sourced from a
  single shared constant.

Prototype screenshots for all of the above are in the session artifact
("Otranto — Visual Artifacts: Diagnosis & Options").

## High-Risk Areas

- **Shared materials across chapters.** The failure-recovery registry mutates
  library materials that persist across chapter loads; recovery must be idempotent
  and must not fight `applyEnvironment`'s per-chapter `envMapIntensity` sweep.
- **ExtrudeGeometry UVs.** The arch band's extrude UVs are position-derived; the
  stone texture scale must visually match adjacent walls (fallback: box-project UVs
  in the builder).
- **Collider parity.** `P.archway` / crenellation rebuilds must keep identical
  collider layout — gameplay (gate passage, wall blocking) depends on it.
- **Perf neutrality.** Feather blades ≈ +4k triangles on the casque but merged into
  few draw calls; merlons merge from ~2 meshes each into 1 per wall. Verify with
  `renderer.info` before/after on Ch. I and Ch. III.
- **Torch count × fire layers.** Chapters place many torches; each rebuilt torch
  adds 2–3 flame planes plus an ember stream. Ember pools must be tiny (≤ 20
  points, one Points mesh per torch) and flame planes share one spritesheet
  texture and material so the draw-call increase stays a handful per chapter.
- **Figure API stability.** `F.make` presets, `walkTo`/`faceTo`, and chapter
  scripts (crowd blocking, dialogue marks) must keep working unchanged; the
  rebuild alters geometry inside the group, not the group's transforms or
  animation contract. Crowd figures stay cheap (shared geometries, no
  per-figure canvas work).

## Step-by-Step Implementation Plan

Ordered riskiest-first; each step is independently shippable and verified by
headless screenshot runs (with and without texture loads blocked).

1. **Texture failure registry (`materials.js`).**
   - `loadMap()` records `{texture, material, slot}`; on its error callback, null
     the slot on every registered material, restore authored `roughness`, set
     `needsUpdate`.
   - `stoneBlockMaterial`: give its normal/roughness loads the same treatment
     (color map is already a safe canvas texture).
   - `pbr()`: extend the existing fallback so a *partial* failure (color OK,
     secondary maps dead) strips only the dead slots.
   - Safety net: 5 s after `M.init`, sweep `lib` for any texture with no image
     dimensions and strip it (covers loaders whose error event never fires).
   - Acceptance: with `assets/textures/**` aborted, Ch. I renders stone walls
     (matches `fixed_gate` prototype), no blue mirrors, no wandering smears.
2. **Burning torches (`world.js torch()`, `materials.js`, `props.js P.wallTorch`).**
   - New `M.flameSheetTex()`: a procedurally drawn N-frame flame spritesheet
     (canvas, teardrop flame with animated noise lobes per frame) shared by all
     torches.
   - `world.torch()` rebuild: 2–3 crossed flame planes cycling through the
     spritesheet at offset phases + per-plane scale wobble; a rising ember
     stream (small Points pool, ≤ 20, respawning with upward drift and fade);
     PointLight flicker upgraded to two combined sine frequencies plus slight
     positional jitter so shadows breathe like firelight.
   - The oversized glow sprite (3× scale, bloom-amplified into wandering orbs)
     shrinks to a faint core halo with clamped opacity.
   - `postfx.js`: cap `setGodrays` strength and keep the bright-pass threshold
     above mirror-glare level so post never re-inflates the fire.
   - Acceptance: headless timed captures show flame shape changing frame to
     frame, embers rising, no static orbs; draw calls within budget.
3. **Arch rebuild (`props.js P.archway`).** Swept extruded half-annulus band,
   carved joint lines, keystone, imposts; same signature, same colliders, fewer
   meshes than the voussoir ring. All five chapters pick it up automatically.
4. **Crenellation + junction pass (`props.js`).** Merlon + cap merged into a single
   BufferGeometry per wall run; caps seated (no floating gap); plinth/wash/course
   ends closed at wall corners; consistent texture repeat per world-unit.
5. **Plume rebuild (`props.js P.giantHelmet`).** Tapered blade ribbon + thin spine
   per quill (validated prototype), merged into one geometry per helmet; sway
   retuned to `rot.x = sin(e·1.1+φ)·0.04, rot.z = sin(e·0.7+φ′)·0.015` so quills nod
   instead of orbiting.
6. **Motif fullness (`props.js`).** Giant sword: bevelled blade cross-section with
   fuller groove and true tapered tip (Extrude, replaces box+cone). Tomb effigy:
   lathe-turned recumbent form under a drape instead of stacked boxes.
7. **Figures with presence (`figures.js`).** Richer `robeGeometry` lathe profile
   with subtle cloth-fold undulation; sleeved arms (tapered lathe/tube sleeves
   with visible cuffs) held slightly away from the robe; hood gains interior
   depth and a raised cowl rim; belt with hanging trim; preset accents (armor
   plates, sashes) seated on the new silhouette. `F.make` signature, presets,
   and `walkTo`/`faceTo` untouched; verify a dialogue scene and the Ch. I crowd
   render and animate identically apart from the fuller shapes.
8. **v0.1 version bump, shown in-game.** Single `OTR.VERSION = '0.1'` constant;
   README first line updated to `v 0.1`; version rendered unobtrusively in the
   game UI (title-screen corner) and used as the cache-busting query
   (`?v=0.1`) on `index.html` script tags.
9. **Mechanical tail.** README note that `file://` is now supported (HTTP still
   recommended); dispose-path audit for the new merged geometries, flame
   spritesheet, and ember pools; before/after `renderer.info` numbers recorded
   in the PR description.

## Open Questions

None blocking — the three former open questions were resolved by review:
torches get a full burning-fire rebuild (step 2), figures (Option D) are in
scope this round (step 7), and the version becomes v0.1 with in-game display
and cache-busting (step 8).
