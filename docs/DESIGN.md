# SteelRoyale: Game Design

**Status (2026-11-18):** steps 1 and 2 are built and playable, plus the storm, the main menu, settings and skins from step 3.
- **Built:** a full offline match against up to 99 bots on a generated island, a training range, and a main menu with a locker (skins) and settings.
- **Still planned:** the dropship and glider, spectating, building, vehicles, and the polish pass.

Each section is marked **Built** or **Planned**. Exact numbers live in `js/config.js`, which wins if it disagrees with this doc. The user has handed design calls to Claude ("you're smart, you can figure it out"), so decide, then state your choices.

## 1. Intent

A browser battle royale. You and 99 bots start on an island, loot chests for the best weapons you can find, and fight to be the last one alive (#1). Version 1 is offline (you against bots). Online play comes later, so the code is structured for it from day one.

**Goals**
- Fun, readable 3D third-person shooting that runs smoothly in a desktop browser (target: an Intel Iris Xe laptop).
- Looting matters: chests and rarities decide how strong you are.
- Bots that feel like players: they loot, fight each other, heal, and stay ahead of the storm.
- Every match is different (new island, new storm path).

**Non-goals (v1):** online play, teams, accounts, shops/progression (skins are cosmetic and all unlocked), mobile or gamepad, voice.

**Anti-goals** (failure even if it "works")
- Feeling like a renamed copy of an existing game. Our own name, look, item names and place names; never Fortnite terms like "Victory Royale".
- Bots that aimbot you from across the map, or bots so dumb the match is trivial.
- Stuttering or low frame rate with 100 players.

## 2. Tech (Built)

- Plain **HTML + CSS + JavaScript** (ES modules). No build step and no npm dependencies.
- **Three.js r170** is vendored as `lib/three.module.min.js` and loaded through an import map.
- The HUD, menus and screens are HTML/CSS over the WebGL canvas.
- `server.js` is a zero-dependency static server on `127.0.0.1:8080`. It never serves dot-files, rejects null bytes, accepts `--open`, and reads the `HOST`/`PORT` environment variables.
  - `play.bat` (Windows) runs `node server.js --open`.
  - Opening `index.html` as a `file://` page can't work, and `js/boot.js` explains that on screen.
- Settings (player count, difficulty, skin, graphics, controls, item slots) are remembered in `localStorage` under `steelroyale.settings`. `js/settings.js` validates them, so an old or broken save falls back to defaults.

**Online-ready architecture:**
- `js/sim/` never touches Three.js or the DOM.
- The player's input and the bot AI both produce the same per-tick **command** objects.
- The simulation steps at a fixed **60 Hz** and emits **events** (shot, hit, kill, chestOpened, explosion…). Rendering and UI only read state and events.
- Even inventory drag and drop goes through commands (`cmd.invOps`). Later the same `sim/` code can run on a server.

## 3. Match flow

**Built:**
1. **Main menu** (section 15): lobby size 25 / 50 / **100**, enemy skill Low / **Medium** / High (easy / normal / hard in code), PLAY!, Training mode, the Locker and the settings gear, with your character on a turntable beside it.
2. Everyone spawns **unarmed on the ground**, at least 45 m apart, 30% of them near named places.
3. **Loot, fight, survive** while the storm shrinks.
4. **Eliminated:** a screen with your placement (#N), eliminations, damage dealt, time survived and who got you ("by the storm", "by a long fall"). Buttons: **Play again** and **Main menu**. The match keeps simulating behind it.
5. **Win:** a "#1 Steel Champion" screen.
6. **Esc** pauses: Resume, Settings (all of them, applied live) and Main menu. While you're in a game, leaving the page asks "Leave site?", because Ctrl is crouch and Ctrl+W can't be blocked.

**Planned (step 3):**
- **Dropship:** it flies a straight line across the map. Press Space to jump; you're auto-ejected at the end. Bots jump at random points, favouring named places.
- **Freefall into a glider,** steered with WASD.
- **Spectating your killer.**

## 4. Controls (Built)

| Action | Key |
|---|---|
| Move / sprint | WASD / Shift |
| Jump; press again in mid-air to climb a ledge in front (mantle) | Space |
| Crouch (**hold**); crouching while sprinting slides | Ctrl |
| Look | Mouse (pointer lock; free-look if the browser refuses) |
| Shoot / use the selected item | Left mouse |
| Aim (sniper: scope) | Right mouse |
| Pick up the focused item / open the focused chest (one press) | E |
| Select slot | 1–5, mouse wheel |
| Reload / drop the selected item | R / G |
| Inventory: **tap** to keep it open, or **hold** (over 0.75 s) to keep it open only while held | Tab |
| Full map: same tap-or-hold rule | M |
| Pause | Esc |

**Planned:** F for the wrench (melee and harvesting), Q for build mode, E to enter and exit vehicles.

## 5. Health, shield, healing (Built)

- **100 HP**, plus up to **150 shield**. You start with 0 shield.
- Damage takes shield first, then health.
- **Storm and fall damage skip the shield.**
- **Fall damage:** landing faster than 14 m/s costs (speed − 14) × 8 HP.

| Item | Effect | Use time | Stack |
|---|---|---|---|
| Bandage | +15 HP, only up to 75 | 3 s | 15 |
| Medkit | health to 100 | 8 s | 3 |
| Small Shield | +25 shield, only up to 75 | 2 s | 6 |
| Big Shield | +75 shield, up to 150 | 5 s | 3 |

- Select the item and hold left mouse. You move at half speed meanwhile, and switching slots cancels it.
- Using an item that can't help is refused with a message, such as "Shield is above 75".

## 6. Weapons (Built)

Five rarities: Common (gray), Uncommon (green), Rare (blue), Epic (purple), Legendary (gold). Each step up adds +7% damage and makes reloads 5% faster.

| Weapon | Ammo | Damage | Rate | Mag | Reload | Notes |
|---|---|---|---|---|---|---|
| Pistol | Light | 24 | 6.5/s | 12 | 1.4 s | semi-auto, head ×1.75 |
| SMG | Light | 15 | 12/s | 30 | 2.0 s | auto |
| Assault Rifle | Medium | 32 | 5.5/s | 30 | 2.2 s | auto |
| Shotgun | Shells | 9 × 18 | 1.1/s | 5 | 4.0 s | pellets on one target add up to a single hit; spread 4.5° hip, 2.8° aimed; two body blasts kill a full-shield player up close; falloff from 15 m down to half at 60 m |
| Sniper Rifle | Heavy | 105 | 0.4/s | 4 | 3.2 s | projectile at 450 m/s with drop, head ×2, scope FOV 22°, Rare or better |
| Rocket Launcher | Rockets | 110 blast | 0.6/s | 1 | 2.8 s | projectile at 70 m/s, 4.5 m blast, walls block it, Epic or Legendary |

- Headshots do ×1.5 unless noted. Spread grows while firing ("bloom"), shrinks when aiming or crouched, and grows while moving or in the air.
- Switching weapons takes 0.35 s before you can fire. You can't fire while sprinting, mantling or using an item.
- Shots start from a point beside the head (0.7 m right, 0.25 m up), and the camera sits on that same line, so the crosshair is exact. If a wall is between the head and that point, shots start from the head instead.
- Ammo is carried separately, up to Light 300, Medium 300, Heavy 60, Shells 60, Rockets 12.

## 7. Inventory and loot (Built)

**Inventory**
- 5 slots shared by weapons and consumables, plus separate ammo.
- **The hotbar is the inventory.** Normally it's a compact row at the bottom right.
- With **Tab**, it grows in place into a **horizontal row of large cards** (name, rarity, mag/ammo or effect), with draggable ammo chips below. You can keep moving meanwhile, but mouse look and shooting pause.
- **Drag onto another slot** to move or swap. Matching consumables merge up to the stack limit.
- **Drag off the inventory** to drop, which works for ammo too. **Click a card** to equip it.
- Items you drop yourself are never auto-picked back up by you. E still picks them up.

**Picking up**
- Look at an item and press E.
- **Preferred slots** (a setting, on by default): each item type can have its own slot, and a pickup goes there if that slot is empty, otherwise to a free slot as usual. Defaults: AR 1, Shotgun 2, SMG / Sniper / Rocket 3, Medkit / Bandage 4, shields 5, Pistol any. The player's character carries them as `slotPrefs`; bots have none. Matching stacks are topped up first.
- With full slots, the item swaps with the selected slot, and the old item lands where the new one was.
- Ammo you walk over is picked up automatically.

**Chests**
- About 4 per player (~400 at 100 players). Most are inside buildings, some upstairs, some outside. **One press of E** opens one.
- The loot spills out the front: 1 weapon and its ammo, a consumable 75% of the time, and a second one 30% of the time.
- Weapon rarity odds: Common 30, Uncommon 30, Rare 22, Epic 13, Legendary 5. A weapon only comes in the rarities it allows.
- **Steel Vaults** are gold chests at the centres of the first 3–5 places. They always hold an Epic or Legendary weapon plus 2 Big Shields.

**Other loot**
- **Floor loot** appears at about half of the building cells: weapons (worse odds), consumables or ammo.
- **An eliminated character drops everything** in a ring: every slot plus all ammo.

## 8. Movement (Built)

- **Speeds:** walk 4.5 m/s, sprint 6.5, aim 3.0, crouch 2.3.
- **Jumping:** jump speed 7.5 m/s and gravity 22, so you rise about 1.3 m.
- **Step-up:** small ledges up to 0.5 m are climbed automatically.
- **Crouch** (height 1.15 m, smaller hitbox, spread ×0.6). You can't stand up under a ceiling.
- **Slide:** crouch while sprinting. It starts at 8.5 m/s and slows to crouch speed over 0.9 s.
- **Mantle:** Space on the ground always jumps. Press it again in mid-air, facing a ledge that has room on top, to climb on. Holding Space never mantles: it takes a fresh press. In the air the ledge's top must be 0.15–2.45 m above your feet. Crouched on the ground (where you can't jump), one press mantles ledges 0.6–2.45 m high. It climbs on in 0.25–0.5 s, and crouches you if there's only crouch room. A one-storey wall (4 m) stays out of reach, even from the top of a jump. Stuck bots do the same: jump, then press again 0.1 s later.
- **Jump forgiveness:** 0.1 s coyote time (you can still jump just after walking off an edge) and a 0.12 s jump buffer (a jump pressed just before landing still counts).
- **Water** deeper than 0.5 m: ×0.6 speed and no sprinting. The sea inside the map is at most 1.4 m deep.
- **Hitboxes:** the body capsule ends at the neck (~1.4 m) and the head is a sphere, so headshots register.

## 9. Map (Built)

**The island**
- Generated per match from a random seed (the same seed always rebuilds the same map).
- Size by player count: **1200 m** (100 players), **960 m** (50), **720 m** (25). Terrain cells are 3 m, and sea level is 0.
- Coastline, rolling hills, one mountain (rock and snow), one lake, forests (about 3,000 trees at 1200 m) and rocks.

**Named places**
- About size ÷ 130 of them (9 at 1200 m), at least 19% of the map width apart.
- Names come from a list: Rivet Ridge, Foundry, Gearwick, Piston Park…
- Types:
  - **town:** 8–14 houses on a 23 m grid around a plaza
  - **industrial:** up to 4 warehouses, plus 10–16 shipping containers (sometimes stacked, 2.4 m high so you can climb them)
  - **farm:** a barn plus houses and sheds
  - **outpost:** a two-floor house plus sheds and containers
- Countryside houses and sheds are scattered between places, and dirt roads connect the places.

**Buildings**
- Built from 4 m grid pieces: floor, roof, wall, doorway (1.6 × 2.6 m), window (1.0–2.0 m high), and step.
- Houses are 1–2 floors. Two-floor houses have 10-step stairs (0.4 m steps) in a corner stairwell. Big houses have an interior wall with a doorway.
- **Building origins sit on half-metres** (x.5), so doorways stay open on the bots' 1 m navigation grid.
- Lots are kept more than 7 m apart, so flattening the ground under one building can't shift its neighbour's floor.

## 10. The storm (Built)

A safe circle that shrinks in phases. Each next circle lies inside the current one (mostly over land), and the last closes completely. Outside it you lose health every second, and **shield doesn't help**. Radii are for the 1200 m map and scale with smaller maps.

| Phase | Wait | Shrink | End radius | Damage/s |
|---|---|---|---|---|
| 1 | 90 s | 60 s | 500 m | 1 |
| 2 | 60 s | 45 s | 300 m | 2 |
| 3 | 60 s | 40 s | 170 m | 3 |
| 4 | 45 s | 35 s | 90 m | 5 |
| 5 | 30 s | 30 s | 45 m | 8 |
| 6 | 20 s | 25 s | 15 m | 10 |
| 7 | 15 s | 20 s | 0 m | 15 |

**What you see:**
- A glowing purple wall in the world.
- While you're in the storm: a purple screen tint and "In the storm · −N HP/s".
- A countdown under the minimap.
- On the minimap and full map: the storm shaded, its edge, the next circle dashed, and a guide line to safety when you're outside it.

## 11. Bots (Built)

- They follow **exactly the same rules** as the player and only produce commands.
- They think 6 times a second (perceive, then decide) and steer and aim every tick.
- States: loot, fight, chase, heal, flee, hold, investigate, roam, and **rotate** (the storm).

**Perception**
- A view cone of about 150° plus a line-of-sight raycast, up to the difficulty's view range.
- They hear gunshots within 90 m.
- **Noticing takes time:** 0.35 s + distance/30 m. It's 1.6× faster if you move, 0.6× if you crouch, 2.5× if you fire. An attacker who just shot them is noticed instantly.

**Picking fights**
- **Engage range** depends on the best gun: 35 m for close-range weapons, 55 m for the AR, 50 m for rockets, 130 m for the sniper (×1.2 on Hard).
- Each bot has an **aggression** of 0.25–1.
- In the opening, willingness drops to ×0.35 for the first 90 s and ×0.55 until 180 s.
- When 12 or fewer remain (or after 7 minutes), they fight at full range.
- They only **chase** someone they fought, or who shot them.
- An unarmed bot only flees an armed enemy within 40 m. Otherwise it keeps looting.

**Combat**
- Reaction delay, then aim wobble in metres at the target. The wobble grows with distance (×(1 + d/30)) and with target and own movement. Tracking a target steadies the aim, but never below 60% of the wobble.
- Weapon choice by range. Bursts, with short bursts and long pauses beyond 50 m.
- Aims down sights at range; strafes and crouches at times; retreats to heal when losing.

**Looting**
- They pick the best chest or item nearby. Items count only if they beat what the bot has.
- The tie-break avoids several bots heading for the same item. They ignore loot upstairs and loot in the storm.
- They **tap** E once the target is in focus, the same rule as the player.

**The storm**
- A bot outside the storm always heads inside.
- A bot outside the next circle starts moving when the closing edge gets within about 45 m, or early if it's very far away.
- Bots don't loot, roam or hold outside the safe area, and only keep fighting outside it if the enemy is very close.

**Hold:** cautious bots that have their gear settle in for 15–50 s, scanning around.

**Navigation**
- A 1 m grid over the ground floor: walls block, doorways are open, low steps and overhead slabs don't block.
- A* capped at 12,000 nodes, at most 2 searches per tick, legs of up to 150 m.
- Stuck recovery: jump/mantle, then replan, then sidestep, then give up on the target.

**Difficulty**

| | Reaction (s) | Aim wobble | Turn rate | View range |
|---|---|---|---|---|
| Easy | 0.7–1.1 | 1.6 m | 3.2 rad/s | 75 m |
| Normal | 0.4–0.65 | 1.15 m | 4.8 rad/s | 95 m |
| Hard | 0.22–0.38 | 0.75 m | 7 rad/s | 120 m |

**Measured pace** (100 players, Normal, headless): about 55 alive at 1 min, about 27 at 2 min, about 11 at 4 min, ending at 8–8.5 min.
- The opening minute is too deadly, because everyone starts on the ground close together. The dropship should fix that.
- Measure with a script that loops `game.tick(emptyCommand())`.

## 12. Look, sound, HUD

**Built**
- **Look:** low-poly with flat colours and a steel palette (gunmetal, rust, safety orange).
  - **Characters:** blocky humanoids in random outfits with procedural poses (walk, crouch, slide, mantle, item use, death). Each weapon has its own gun model.
  - **Effects:** tracers, muzzle flash, sparks, rocket smoke, explosions.
  - **Ground loot:** spinning models, with a rarity beam for Rare and better.
  - **Chests:** a lid that opens, and a gold trim that dims once opened.
- **Sound:** generated in code with Web Audio, quieter with distance: gunshots, hits, eliminations, reloads, explosions, pickups, chest chimes.
- **HUD:**
  - Shield and health bars; weapon panel with ammo; hotbar and inventory; ammo strip.
  - Crosshair that shows spread; hit markers (white body, yellow head, red elimination); floating damage numbers (blue shield, white health, yellow headshot).
  - Kill feed; interaction prompt; item-use bar; pickup and refusal messages; red arcs showing where damage came from.
  - Sniper scope; low-health vignette.
  - Minimap with players-alive and eliminations counters, storm timer, full map.
- **Free-look mode:** when the browser refuses mouse capture (as the Claude app's browser pane does), a hint explains it.

**Planned:** footsteps, a storm hum and engine sounds.

## 13. Performance (Built)

- **Characters:** all of them are drawn by **one InstancedMesh of unit cubes**. The rig is posed per character and each part becomes one instance, so 100 players cost 1 draw call. Characters beyond 360 m are skipped, and bodies disappear after 8 s.
- **Terrain** is drawn in 50-cell chunks. **Buildings, crates and containers** are merged per 200 m chunk. **Trees and rocks** are instanced per 200 m chunk, so the camera and the shadow frustum can cull them.
- **Draw distance:** the camera's far plane is just past the fog (fog ends at 440 m). This was the big win. Render resolution is capped at 1.5× on high-DPI screens.
- **Ground loot** is drawn only within 75 m, instanced per model.
- **Measured at 1024×768** (100 players): about 7 ms of CPU per frame, of which rendering is about 4 ms and the simulation about 1–2 ms, with about 85–140 draw calls.

## 14. Build order

1. ✅ **Foundation:** server, scene, movement, camera, shooting, dummies.
2. ✅ **First real match:** movement (crouch, slide, mantle), all weapons, inventory and loot, island map, bots, match flow, HUD, minimap and full map. ✅ **Storm** (pulled forward from step 3).
3. ⏳ **Dropship and glider,** spectating. ✅ Main menu, settings and skins.
4. ⏳ **Building:** wrench harvesting and Steel; wall/floor/ramp pieces on the existing 4 m grid; destructible map buildings (the pieces already have HP fields); bots using cover; updating the nav grid with `markBox()`.
5. ⏳ **Vehicles:** Rover (fast buggy, 300 HP) and Hauler (truck, 700 HP), about 25 on roads. Enter and exit, damage, explosions, run-overs. Bots don't drive in v1.
6. ⏳ **Polish:** sound, effects, balance (especially the opening-minute pace), and a performance pass.

**Building, as planned:**
- Steel is the material (max 500), from the wrench and from loot.
- Pieces cost 10 Steel each, spawn with partial HP and reach 150 over about 3 s.
- Rockets do heavy damage to pieces.
- Map buildings use the same pieces, so they can be damaged and harvested too.
- No piece editing in v1.

## 15. Implementation plans

- `docs/superpowers/plans/2026-11-16-step1-foundation.md`: the step 1 plan, with notes on where the code differs at the bottom.
- `docs/superpowers/plans/2026-11-16-step2-first-match.md`: the step 2 decisions and file list.

## 15. Main menu, settings and skins (Built)

**Main menu** (`js/ui/menu.js`, markup in `index.html`), laid out from the user's sketch to feel like a game rather than a website:
- The **logo** is large at the top left (brushed steel and orange, leaning forward). A **gear button** at the top right opens Settings as a window over the menu.
- A riveted steel panel at the bottom left holds **Lobby size**, **Enemy skill**, a huge **PLAY!** button (with a slow glow) and a small **Training mode** button.
- On the right your character stands on a steel turntable inside a **glowing gold ring** (`js/render/lobby.js`, drawn by the game's own renderer). Drag it to turn it; it drifts back after a few seconds. Under it, the **Locker** button shows the equipped skin's name.
- **Locker:** the skin grid replaces the left panel, and the name, rarity and description of the skin replace the Locker button. Back or Esc returns.
- Buttons are chunky and raised on a darker lip that sinks when pressed; panels are steel plates bolted at the corners.
- In a match the overlay becomes the pause screen (Resume, Settings, Main menu). With `?auto=1` it's the "Ready to drop" / "Training mode" screen.
- Below 900 px wide the stage moves behind the panel and the Locker button moves under the gear.

**Skins** (`js/skins.js`): 10 cosmetic outfits, all unlocked: Recruit (default), Foreman, Scrapper, Mossback, Cobalt Guard, Night Shift, Ember, Frostbite, Chromium, Gold Rivet. Each is a palette (torso, arms, legs, boots, skin, visor, accent, gear) plus gear pieces (hard hat, helmet, lamp, cap, mohawk, antenna, faceplate, goggles, scarf, stripes, chest plate, backpack, pouches, pads, knee pads). Gear is extra boxes on the same rig, so it costs a few instances and no draw calls. The locker cards show flat front views drawn from the same boxes (`js/ui/skin-portrait.js`). Bots keep their random outfits.

**Settings** (`js/settings.js` holds the defaults and limits):
- **Video:** graphics quality Low / Medium / **High** (a preset for shadows and render scale; changing either by hand shows Custom), shadows Off / Low (1024, hard) / **High** (2048, soft), render scale 50–**100**%, frame rate limit **None** / 30 / 60 / 120 / 144, field of view 60–100 (**75**; aiming zooms by the same ratio), FPS counter (**on**).
- **Controls:** mouse sensitivity 0.1–3× (**1×**), aiming sensitivity 20–150% (**100%**, while holding right mouse), invert mouse Y, and the key list.
- **Audio:** volume (**100%**).
- **Item slots:** the preferred-slot switch, a preview of the hotbar, and a slot (Any or 1–5) per item type.
- Each tab has **Restore defaults**. Every change applies at once, also mid-match.

