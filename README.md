v 0.0.3
# The Castle of Otranto — a playable 3D Gothic tale

A browser-playable, first-person 3D adaptation of Horace Walpole's *The Castle
of Otranto* (1764) — the first Gothic novel. You play as **Theodore**, whose
path crosses both halves of the story's world: the sunlit medieval exterior and
the dark, moonlit labyrinth beneath it.

It runs entirely in the browser from plain static files. **No build step, no
server-side code, no database, no npm install** — drop the folder onto ordinary
shared hosting (or open it locally) and it plays.

![first-person, WebGL, Three.js](https://img.shields.io/badge/engine-Three.js%20(WebGL)-informational)

---

## What you actually play

Five chapters retrace Theodore's arc through the novel. Readers of Walpole will
recognise specific scenes, and the dialogue is drawn from the book itself:

1. **The Helmet** — the sunlit courtyard, the giant plumed casque that has
   crushed Conrad, Manfred's accusation of sorcery, and your imprisonment
   beneath the helmet — from which you escape through the broken pavement.
2. **The Vaults** — the subterranean cloisters toward the church of St. Nicholas.
   Take up a guttering lamp, meet the fleeing Isabella, and find the trap-door
   while Manfred's torch-bearing search closes through the dark.
3. **The Black Tower** — Matilda unbolts your prison. Descend through the moonlit
   gallery past Alfonso's portrait (and a glimpse of the giant armoured limb),
   take arms from the armoury, and slip out the postern gate.
4. **The Wood and the Shore** — a moonlit forest falling to sea-caves. Follow the
   fleeing Isabella, and cross swords with a knight who proves to be Frederic,
   her own father (a short timed sword duel).
5. **The Tomb of Alfonso** — the church at night. Manfred, misled in the dark,
   strikes down Matilda; then the walls are thrown down and the shade of Alfonso
   rises: *"Behold in Theodore the true heir of Alfonso!"*

**Tone:** the exterior chapters are warm and open (courtyard, countryside,
church, the moonlit wood); the interiors are cold, oppressive, and close (the
casque, the vaults, the tower, the tomb), with a lamp that gutters in the drafts,
sound-driven dread, and the recurring giant-armour motifs. It plays like an
atmospheric first-person exploration piece (in the spirit of *Dear Esther* /
*Amnesia*), not a shooter — tension and evasion rather than combat.

Progress saves automatically per chapter (in your browser's local storage), and
a chapter-select appears on the title screen for anything you've reached.

## Controls

| Action | Key |
| --- | --- |
| Move | **W A S D** (or arrow keys) |
| Look | **Mouse** (click once to lock the pointer) |
| Run | **Shift** |
| Interact / advance dialogue | **E** (or click, or **Space**) |
| Duel / prompts | **Space** |
| Pause / release mouse | **Esc** |

Headphones are recommended — all sound (wind, sea, bells, thunder, the sword,
the score) is generated procedurally in the browser; there are no audio files.

---

## Play it locally

**Easiest:** double-click `index.html` to open it in your browser and press
**Begin**.

One caveat: for security, some browsers refuse to load local image files
(the textures) when a page is opened directly with `file://`. If the world
looks flat or untextured when opened that way, the game still runs — it falls
back to plain colours — but to see it with full textures locally, serve the
folder over `http://` with any tiny static server, for example:

```bash
# from inside the project folder, pick whichever you have:
python3 -m http.server 8000      # then open http://localhost:8000
# or
npx serve .
```

Once the folder is uploaded to a real website (served over `http(s)://`, as
below), textures load normally with no extra steps.

## Put it on your website with cPanel (File Manager)

No build, no compile, no configuration. Just upload the files:

1. Log in to **cPanel** and open **File Manager**.
2. Go to **`public_html`** (or a subfolder, e.g. `public_html/otranto`, if you
   want it at `yourdomain.com/otranto/`).
3. Click **Upload**. The simplest route is to zip this whole project folder on
   your computer first, upload the single `.zip`, then in File Manager
   right-click it and choose **Extract**. (You can also drag the individual
   files/folders in, but keep the folder structure intact — see below.)
4. Make sure the structure on the server looks like this, with `index.html` at
   the top of wherever you put it:

   ```
   index.html
   css/style.css
   js/…            (all the .js files, including js/vendor/three.min.js)
   assets/textures/…   (the .jpg texture files)
   LICENSE
   README.md
   ```

5. Visit the URL — `https://yourdomain.com/` (or `/otranto/`). Press **Begin**,
   click once to lock the mouse, and play.

That's it. There is nothing to install on the server and no server-side code.

> **Do not upload** `node_modules/` — it is not part of the game; it is only a
> local testing tool and is excluded by `.gitignore`.

---

## What's under the hood

- **[Three.js](https://threejs.org/)** (r160, MIT-licensed) is vendored as a
  plain file at `js/vendor/three.min.js` and loaded with a `<script>` tag — no
  bundler, no CDN dependency, works offline.
- Architecture (arches, vaults, towers, crenellations, the giant helmet, sword,
  tomb, and the apparition) is built procedurally in code — no external 3D model
  files — and lit with physically-based materials, real-time shadows, fog, and a
  cheap image-based environment for metal highlights.
- The stylised figures (Manfred, Isabella, Matilda, Jerome, Frederic, the
  guards) are deliberately hooded, cloaked, or helmed with shadowed faces — the
  right register for 1764 Gothic, and an honest choice given that convincing
  realistic faces can't be generated procedurally.
- Human dialogue is shown as subtitles using Walpole's own lines.

---

## Licensing & authorship

This project has **two distinct layers of authorship**, and they are licensed
differently:

> **The novel** — *The Castle of Otranto* by Horace Walpole, first published in
> 1764 — is in the **public domain**. Its text, characters, and story are free
> for anyone to use. All quoted and adapted dialogue in this game is taken from
> that public-domain work (via [Project Gutenberg](https://www.gutenberg.org/)).
>
> **This game** — all of the original work built on top of that story: the
> source code, the 3D world and level design, the procedural art and audio, and
> this documentation — is **© 2026 the authors** and licensed under the
> **GNU General Public License, version 3 (GPLv3)**. You may use, study, share,
> and modify it under those terms; see the [`LICENSE`](LICENSE) file for the full
> text. In short: the game is free/libre software, and any distributed
> derivative must remain so under the same license.

Being clear about the split: the **words of Walpole** belong to everyone and
carry no license from us; the **game we built around those words** is ours to
license, and we license it under GPLv3 so it stays open.

### Third-party assets

- **Three.js** — © the Three.js authors, used under the **MIT License**.
- **Textures** in `assets/textures/` are **CC0 1.0 (public domain dedication)**
  physically-based materials from
  [ambientCG](https://ambientcg.com/) / cc0textures.com. CC0 imposes no
  conditions; they are credited here as a courtesy, not an obligation.

None of these third-party assets are owned by this project; they are included
under their own permissive terms, which are compatible with GPLv3.

---

## Credits

- Story: **Horace Walpole**, *The Castle of Otranto* (1764), public domain.
- Game, code, world, and original assets: licensed **GPLv3**.
- Engine: **Three.js** (MIT). Textures: **ambientCG** (CC0).

### Support

This game exists because Walpole's text was freely available. If you'd like
to support that work, please direct any tips or donations to
[Project Gutenberg](https://www.gutenberg.org/donate/) rather than to us —
it's the archive that keeps this and thousands of other public-domain works
free for everyone.
