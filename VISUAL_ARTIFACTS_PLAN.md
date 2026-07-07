# Visual Artifacts — Diagnosis & Implementation Plan

Approved scope: **A (loader hardening) + B (solid architecture kit) + C (great motifs)**,
at a **performance-neutral** budget. Confirmed launch method: opening `index.html`
directly from disk (`file://`).

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
2. **Amplifier tuning (`world.js`, `postfx.js`).**
   - Scale torch glow sprite by light distance *and* clamp opacity so bloom can't
     inflate it into orbs around figures.
   - Cap god-ray strength contribution from surfaces with roughness < 0.2 is not
     feasible cheaply — instead cap `setGodrays` strength and keep the bright-pass
     threshold above mirror-glare level.
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
7. **Mechanical tail.** README note that `file://` is now supported (HTTP still
   recommended); dispose-path audit for the new merged geometries; before/after
   `renderer.info` numbers recorded in the PR description.

## Open Questions

- The torch **glow halos**: keep them (dimmer, smaller) or remove entirely and let
  bloom alone carry the light? Plan assumes keep-but-tame.
- **Figures (Option D)** were deferred — worth scheduling as a follow-up once A–C
  land?
- For hosted deployments, add a cache-busting query (`?v=0.0.6`) to script tags so
  players never see stale JS after upgrades — cheap, but touches `index.html`;
  included unless objected to.
