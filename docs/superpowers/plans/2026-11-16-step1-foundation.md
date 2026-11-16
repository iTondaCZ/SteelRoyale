# Step 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable test range: third-person character that walks, sprints, and jumps on hilly 3D terrain with enterable buildings, trees, and rocks, shooting an Assault Rifle at respawning target dummies, with health/shield bars, ammo, crosshair, hit markers, and damage numbers.

**Architecture:** `js/sim/` is pure game logic (no Three.js, no DOM) stepped at a fixed 60 Hz from per-tick command objects; it is unit-tested with `node --test`. `js/render/` reads sim state each frame (with interpolation) and draws it with Three.js. `js/ui/` is an HTML/CSS overlay. `js/main.js` wires input → sim → render.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Three.js 0.170.0 vendored at `lib/three.module.min.js`, Node 22 (static server + `node:test`), no npm dependencies.

**Spec:** `docs/DESIGN.md`

## Global Constraints

- 1 world unit = 1 metre, Y is up. Feet position is the character origin.
- Yaw 0 looks toward −Z. Forward = (−sin yaw, 0, −cos yaw); right = (cos yaw, 0, −sin yaw); look dir = (−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch).
- `js/sim/**` must not import `three` or touch `window`/`document`.
- 100 HP, shield max 150, shield absorbs damage first; zone damage (later) bypasses shield.
- Rarity colours: Common #9ea3a8, Uncommon #3fbf4a, Rare #3a8dde, Epic #a24de0, Legendary #f0a21a.
- Assault Rifle (Common): 32 dmg, 5.5 shots/s, mag 30, Medium ammo, headshot ×1.5.
- No commits unless the user asks.

## Review Focus

1. **Pointer lock lost (Esc / alt-tab)** — game pauses, held keys and fire are released, no runaway movement on resume. *(browser check, Task 6)*
2. **Tab hidden for a long time / frame hitch** — sim must not fast-forward minutes of ticks on return; at most 5 ticks per frame. → `stepsForFrame` test in Task 5.
3. **Shooting while hugging a wall** — the shoulder-offset shot origin can end up behind the wall; shots must never pass through it. → `shotOrigin` obstruction test in Task 3.
4. **Backing the camera into a wall** — camera pulls in along the aim line instead of clipping through. *(browser check, Task 6)*
5. **Window resize / high-DPI screens** — canvas tracks window size, pixel ratio capped at 2. *(browser check, Task 6)*

---

### Task 1: Project scaffolding + dev server

**Files:** Create `package.json` (`"type":"module"`, scripts `start: node server.js`, `test: node --test tests/`), `server.js`, `.gitignore`, `.claude/launch.json`, `index.html`, `css/style.css`, `lib/three.module.min.js`, `lib/three.LICENSE`.

- [ ] `server.js`: zero-dependency static server on `PORT` (default 8080), correct MIME types (`.js` → `text/javascript`), `Cache-Control: no-store`, path traversal blocked (resolved path must stay inside the project root), 404 otherwise.
- [ ] `index.html`: import map `{"three":"./lib/three.module.min.js"}`, `#game` container, `#hud` overlay, `<script type="module" src="js/main.js">`.
- [ ] Verify: `node server.js` then `curl -I http://localhost:8080/lib/three.module.min.js` → `200` with `text/javascript`; `curl -I http://localhost:8080/../package.json` → `404`.

### Task 2: Math, RNG, noise, terrain heightfield

**Files:** Create `js/sim/vec.js`, `js/sim/rng.js`, `js/sim/noise.js`, `js/sim/terrain.js`; Test `tests/terrain.test.js`.

**Produces:**
- `createRng(seed:number) → () => number` in [0,1) (mulberry32).
- `createNoise2D(seed) → (x,z) => number` in ≈[−1,1].
- `createTerrain({size, cellSize, seed, baseHeight, flatZones}) → Terrain` where `Terrain = {size, cellSize, cols, heights:Float32Array, heightAt(x,z), flatten(x,z,w,d,h,blend)}`; the map spans [−size/2, size/2]. `heightAt` interpolates on the same two triangles per cell the render mesh uses (split from (i,j) to (i+1,j+1)).
- [ ] Tests: `heightAt` at a vertex equals `heights[index]`; midpoint of a cell lies between neighbours; after `flatten(...)` every point inside the zone returns `h`; outside the map clamps to the edge.

### Task 3: Collision, raycasts, damage

**Files:** Create `js/sim/spatial-grid.js`, `js/sim/collision.js`, `js/sim/damage.js`; Test `tests/collision.test.js`, `tests/damage.test.js`.

**Produces:**
- `createGrid(cellSize) → {insert(box), query(minX,minZ,maxX,maxZ) → box[], alongRay(ox,oz,dx,dz,maxDist,cb)}`; `box = {minX,minY,minZ,maxX,maxY,maxZ, tag}`.
- `circleBoxPush(cx,cz,r,box) → {x,z}|null` (push-out vector in XZ).
- `rayBox(o,d,box,maxDist) → t|null`, `raySphere(o,d,center,r) → t|null`, `rayCapsule(o,d,a,b,r) → t|null`.
- `applyDamage(target, amount, {bypassShield=false}) → {shieldDamage, healthDamage, killed}`.
- [ ] Tests: circle overlapping a wall is pushed out to exactly `r` from the face; circle with centre inside a box exits on the shallowest axis; ray hits nearest face at the right `t`, misses parallel/behind; capsule hit vs miss; damage 40 on shield 25 → shieldDamage 25, healthDamage 15; bypassShield ignores shield; health never negative, `killed` true only on the hit that reaches 0.

### Task 4: World, characters, weapons, dummies

**Files:** Create `js/config.js`, `js/sim/world.js`, `js/sim/buildings.js`, `js/sim/character.js`, `js/sim/weapons.js`, `js/sim/test-map.js`, `js/sim/game.js`; Test `tests/character.test.js`, `tests/weapons.test.js`, `tests/game.test.js`.

**Produces:**
- Command: `{moveX, moveZ, yaw, pitch, jump, sprint, fire, aim, reload}` (moveZ +1 = forward, moveX +1 = right).
- Character: `{id, name, kind, pos, prevPos, vel, yaw, pitch, onGround, health, shield, alive, weapon, ammo:{light,medium,heavy,shells,rockets}, aiming, sprinting, speed, stats:{kills,damageDealt}}`.
- `createWorld(terrain) → {terrain, grid, characters:Map, addBox(box), raycast(o,d,maxDist,{ignoreId}) → {t, point, kind:'terrain'|'box'|'character', characterId?, zone?:'head'|'body'}|null}`.
- `buildingPieces({originX,originZ,baseY,cellsX,cellsZ,doorSide,seed}) → piece[]`, `pieceBoxes(piece) → box[]` — pieces are `floor | wall | doorway | window` on a 4 m grid, 4 m storey height.
- `stepCharacter(char, cmd, world, dt)` — walk 4.5, sprint 6.5, aim 3.0 m/s, gravity 22, jump 7.5 m/s, step-up 0.5 m, radius 0.4, height 1.8, map edge clamp.
- `createWeapon(type, rarity) → {type, rarity, mag, cooldown, reloadLeft, bloom}`; `tickWeapon(char, cmd, world, dt, rng, events)`; `shotOrigin(char, world) → {x,y,z}` (shoulder point = eye + right·0.55, falls back to eye when the eye→shoulder segment is blocked); `damageAtRange(def, rarity, dist)`.
- `createGame({seed}) → {world, player, events:[], tick(cmd)}` at 60 Hz; events `shot {from,to}`, `hit {targetId, point, shieldDamage, healthDamage, headshot, killed}`, `kill {killerId, victimId, weapon}`; dummies strafe/stand and respawn 3 s after death with random shield (0/50/100/150).
- [ ] Tests: walking into a wall stops at the wall; falling lands on the terrain; standing on a box top; stepping up a 0.4 m box but not a 1 m box; holding fire for 1 s fires 6 shots; mag empties then auto-reloads from reserve; no shot while reloading; reserve 0 → no reload; damage falloff ≥75% at 300 m; shooting a dummy straight ahead emits `hit`, reduces its shield before health; `shotOrigin` falls back to eye when a wall sits between eye and shoulder.

### Task 5: Rendering, input, camera, HUD, loop

**Files:** Create `js/input.js`, `js/loop.js`, `js/audio.js`, `js/render/renderer.js`, `js/render/terrain-mesh.js`, `js/render/world-meshes.js`, `js/render/character-mesh.js`, `js/render/camera-rig.js`, `js/render/effects.js`, `js/ui/hud.js`, `js/main.js`; Test `tests/loop.test.js`.

**Produces:**
- `stepsForFrame(accumulator, frameDt, tickDt, maxSteps=5) → {steps, accumulator}` (drops excess time).
- Third-person camera on the shot line: position = shotOrigin − lookDir·dist (3.2 hip, 1.6 aiming; FOV 75 → 55), pulled in along the same line when a raycast hits geometry, so the crosshair always matches the shot ray.
- Low-poly look: flat-shaded vertex-coloured terrain, sky dome, fog, hemisphere + sun light with shadows following the player, instanced trees/rocks, blocky humanoids with procedural walk animation.
- HUD: shield bar (3×50 segments) over health bar with numbers, weapon name in rarity colour + `mag / reserve` + reload bar, crosshair sized by spread, hit marker (white body / yellow head / red kill), floating damage numbers (blue shield, white health, yellow head), kill feed, FPS, start/pause overlay.
- [ ] Tests: 1/60 s frame → 1 step; 0.5 s hitch → 5 steps and leftover < one tick; accumulator carries fractions.

### Task 6: Browser verification

- [ ] Start via `.claude/launch.json`, no console errors.
- [ ] Move/jump/sprint, enter a building, back camera into a wall, shoot dummies (shield then health), headshots, reload, kill + respawn, Esc pause/resume, resize window.
- [ ] Check FPS counter.

## As built (deviations from the plan above)

- The map module is `js/sim/training-map.js` (`createTrainingMap`). A `test-` prefix made Node's runner pick it up as a test file, so `npm test` now globs `tests/**/*.test.js`.
- `buildingPieces` takes an `rng` function instead of a `seed`.
- `dealDamage(attacker, target, amount, info, events)` lives in `js/sim/damage.js`, next to `applyDamage`.
- The camera probes with 5 rays (centre plus ±0.3 m), not 1, so it can't slip through windows or graze wall edges. Windows are now 1.0–2.0 m high.
- Shoulder offset is 0.7 m right and 0.25 m up. Camera distance is 3.6 m (1.9 m aiming), FOV 75° (50° aiming).
- `window.steel.update(t)` runs one frame by hand, for testing while the tab isn't animating.
