# SteelRoyale: notes for Claude sessions

A browser battle royale: you against up to 99 bots on a generated island. Plain HTML/CSS/JS with Three.js r170 (vendored), no build step, no npm dependencies. The full spec is in `docs/DESIGN.md`; it marks what's built and what's planned. Every tunable number is in `js/config.js`.

## Run & test
- `node server.js` serves on http://127.0.0.1:8080. Add `--open` to open the browser; `HOST=0.0.0.0` exposes it on the LAN. `play.bat` does the same on Windows.
- `.claude/launch.json` has the preview config `steelroyale`: `preview_start({ name: 'steelroyale' })`. It's pinned to port 8080 (`autoPort: false`), so if 8080 is busy (e.g. `play.bat` is running) it fails instead of moving.
- `npm test` runs `node --test "tests/**/*.test.js"`: about 152 tests, mostly the simulation, in about 11 s.
- Opening `index.html` as a `file://` page never works (module scripts are blocked), and `js/boot.js` says so on screen.

## Architecture
- `js/sim/` is pure game logic, with no `three` imports and no `window`/`document`. It steps at 60 Hz, `game.tick(cmd)`, from command objects.
- Command fields: `{moveX, moveZ, yaw, pitch, jump, sprint, crouch, fire, aim, reload, interact, drop, slot, slotDelta, invOps}`.
- The player's input (`js/input.js`) and the bots (`js/sim/bots.js`) produce the same commands; bots never take shortcuts.
- The simulation pushes `game.events` (shot, hit, kill, chestOpened, explosion, pickup…). `main.js` reads them every frame and clears them with `splice(0)`, and `tick()` handles each one once (`e.handled`).
- `js/render/` is Three.js only and reads simulation state. `js/ui/` is the HTML HUD; build text with `textContent`, never `innerHTML`.
- `createGame({ mode: 'match' | 'training', players, difficulty, seed })` in `js/sim/game.js`. `match` uses `mapgen.js`, `navgrid.js`, the bots and `zone.js`; `training` is the step 1 range with dummies.
- Where things live:
  - `character.js`: movement, crouch, slide, mantle, fall damage
  - `weapons.js`: hitscan and pellets
  - `projectiles.js`: sniper bullets and rockets
  - `inventory.js`: slots and inventory actions
  - `loot.js`: chests, ground loot, focus, interact
  - `zone.js`: the storm
  - `render/crowd.js`: all characters in one InstancedMesh
  - `render/storm.js`: the storm wall shader plus in-storm weather (rain, clouds), which drives `view.setWeather` in `renderer.js`
  - `render/lightning.js`: bolts drawn as glowing ribbons, with shapes from `render/bolt-paths.js` (pure code, tested). Force a strike from the console with `steel.session.storm.lightning.spawn(top, ground, 'field')`
  - `ui/inventory.js`: the hotbar, which doubles as the Tab inventory
  - `hold-toggle.js`: the tap-or-hold logic for Tab and M

## Conventions and gotchas
- Yaw 0 looks toward −Z, and positive yaw turns left. forward = (−sin y, 0, −cos y), right = (cos y, 0, −sin y). The camera uses rotation order `YXZ`.
- Building origins must sit on half-metres (`Math.round(..) + 0.5` in mapgen). Otherwise 1.6 m doorways get blocked on the 1 m nav grid.
- Building lots stay more than 7 m apart, because `terrain.flatten` also changes one 3 m cell around each footprint.
- A chest's `yaw` is the yaw of a player standing in front of it, and its loot spills along `forwardXZ(yaw + π)`.
- The body hitbox capsule must end at the neck (`HITBOX.body.top + radius ≈ 1.4`), or it swallows headshots.
- Write simulation changes test-first: add a test in `tests/<module>.test.js` and see it fail, then implement.
- Test harnesses that call `tickWeapon` or `tickInteract` directly don't run movement, so set `c.yaw` and `c.pitch` on the character yourself.
- Never name non-test files `test-*.js` (the runner used to pick them up).
- Camera far plane = fog far + 40 (`renderer.js`). Don't widen it: drawing past the fog cost about 8 ms per frame.
- Ctrl is crouch, but Ctrl+W can't be blocked. While a game runs, `beforeunload` asks "Leave site?"; navigate with `leavePage()` in `main.js` to skip that question.

## Checking it in the Claude browser pane
- The pane refuses pointer lock (`WrongDocumentError`), so the game runs in "free-look" mode there. Real mouse capture can only be tested in a normal browser.
- A hidden pane pauses `requestAnimationFrame`. Step frames by hand with `let T = performance.now(); steel.update(T += 16.7)` in a loop.
- `window.steel` exposes `game`, `session`, `input`, `view`, `update` and `startPlaying('match' | 'training')`.
- Skip the menu with `?mode=match&players=100&difficulty=normal&auto=1` (or `mode=training`).
- Wait for `window.steel` (and `steel.session`) before using them; loading takes a second or two.
- Simulate keys with `window.dispatchEvent(new KeyboardEvent('keydown', { code }))`. Adding to `input.keys` doesn't trigger presses like slots, drop or Tab.
- Tools time out after 45 s. For long runs, call `steel.game.tick(cmd)` without rendering instead of `steel.update`.
- Screenshots of a hidden pane can come back cropped or zoomed. Check DOM geometry or state numbers instead, and use the `computer` drag only when the screenshot is reliable.
- "Blocked attempt to show a 'beforeunload' confirmation" in the console after scripted navigation is expected.

## Working with the user
- **Commits:**
  - The user writes the commit messages. Never commit with your own message; offer the commit action.
  - Main game work goes on `main`; only odd prototypes get a branch.
  - Never add `Co-Authored-By: Claude` or mention Claude in commits or PRs.
  - Don't touch the staging area (no `git rm --cached`, `git restore --staged`). Delete files with plain `rm`.
- Design calls are yours: decide and state your choices briefly, and ask only when something is truly ambiguous. Reply in English.
- Verify in the browser after UI or gameplay changes, and say plainly what couldn't be verified (real pointer lock, real FPS).

## Status (2026-11-16)
- Only the initial commit exists. Step 1 is staged (as the user left it), and steps 2 and up are unstaged on top. Check `git status` before doing anything with git.
- Built: steps 1–2 and the storm. Next is step 3: the dropship and glider, then building, vehicles, polish, and settings (graphics, sensitivity).
- Known issues:
  - The opening minute is too deadly (about 45% eliminated), because everyone spawns on the ground.
  - Re-capturing the mouse after closing the Tab inventory is only unit-tested.
  - No footstep or storm sounds yet.
