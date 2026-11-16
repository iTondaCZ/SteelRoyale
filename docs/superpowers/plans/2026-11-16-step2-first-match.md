# Step 2: First Real Match (implementation plan)

**Goal:** A full match on a real map. You and up to 99 bots spawn across an island, loot chests and buildings for weapons and items, and fight until one is left. Movement gets crouch, slide, mantle and fall damage.

**Architecture:** Same split as step 1. `js/sim/` is pure logic stepped at 60 Hz from commands, and both the player's input and the bot AI produce those commands. `js/render/` draws the sim state. `js/ui/` is the HTML HUD and the screens.

**Spec:** `docs/DESIGN.md`. The user handed the design calls to Claude ("you can figure it out"). The decisions below are Claude's.

**Out of scope (step 3+):** the shrinking zone, the dropship and glider, building pieces, vehicles, spectating, and settings beyond bot count and difficulty.

## Decisions

### Movement
- **Crouch:** C toggles, Ctrl holds. Height 1.15 m, eye 1.0 m, speed 2.3 m/s, spread ×0.6, smaller hitbox. You can't stand up under a ceiling.
- **Slide:** press crouch while sprinting on the ground. Starts at 8.5 m/s and slows to crouch speed over about 0.9 s. You can shoot while sliding.
- **Mantle:** press jump while facing a ledge whose top is 0.6–2.45 m above your feet and has room to stand (or crouch) on top. You climb up over 0.3–0.5 s and can't shoot meanwhile. Works in mid-air too.
- **Jump forgiveness:** 0.1 s coyote time (you can still jump just after walking off an edge) and 0.12 s jump buffer (a jump pressed just before landing still counts).
- **Fall damage:** landing faster than 14 m/s costs (speed − 14) × 8 HP. It ignores shield.
- **Water:** in water deeper than 0.5 m you move at ×0.6 speed and can't sprint. The island's sea is at most 1.4 m deep inside the map.

### Weapons (Common base values, rarity scales as in step 1)

| Weapon | Ammo | Damage | Rate | Mag | Reload | Fire mode | Notes |
|---|---|---|---|---|---|---|---|
| Pistol | Light | 24 | 6.5/s | 12 | 1.4 s | semi-auto | head ×1.75 |
| SMG | Light | 15 | 12/s | 30 | 2.0 s | auto | short range |
| Assault Rifle | Medium | 32 | 5.5/s | 30 | 2.2 s | auto | |
| Shotgun | Shells | 9 × 10 | 1.1/s | 5 | 4.0 s | semi-auto | pellet hits on one target add up to a single hit |
| Sniper Rifle | Heavy | 105 | 0.4/s | 4 | 3.2 s | semi-auto | projectile at 450 m/s with drop, head ×2, scoped FOV 22 |
| Rocket Launcher | Rockets | 110 | 0.6/s | 1 | 2.8 s | semi-auto | projectile at 70 m/s, 4.5 m blast, Epic/Legendary only |

- Switching weapons takes 0.35 s before you can fire.
- Ammo carry caps: Light 300, Medium 300, Heavy 60, Shells 60, Rockets 12.

### Items and inventory
- 5 slots shared by weapons and consumables, selected with 1–5 or the mouse wheel. Ammo is stored separately.
- Consumables: Bandage (+15 HP, up to 75, 3 s, stack 15), Medkit (to 100 HP, 8 s, stack 3), Small Shield (+25, up to 75, 2 s, stack 6), Big Shield (+50, up to 150, 5 s, stack 3).
- To use one, select it and hold left mouse. You move at ×0.5 speed, and switching slots cancels.
- **E** picks up the item you're looking at. When your slots are full it swaps with the selected slot. **G** drops the selected item. Walking over ammo picks it up automatically.

### Loot
- Chests: hold E for 1 s and the loot spills on the ground in front. Each holds 1 weapon + its ammo, 1 consumable 75% of the time, and a second consumable 30% of the time.
- Steel Vaults (gold chests) always hold an Epic or Legendary weapon plus a Big Shield.
- Ground loot appears in buildings: weapons (lower rarity odds), consumables and ammo boxes.
- An eliminated character drops all slots and ammo in a ring.

### Map
- Island generated from a seed. 1200 m for 100 players, 950 m for 50, 700 m for 25.
- Terrain cell 3 m, sea level 0, a coastline ring, hills and a mountain area.
- 8–10 named places spaced 200 m or more apart:
  - town: 8–14 houses, mixed 1 and 2 floors
  - industrial yard: warehouses plus stackable containers
  - farm: barn plus houses
- Plus about 25 scattered houses and sheds, and dirt roads linking the places along a minimum spanning tree.
- Buildings are axis-aligned and built from grid pieces. Two-floor houses have box-step stairs (0.4 m steps) and a stairwell hole.
- About 4 chests per player: mostly inside buildings, some upstairs, a few outside, plus 3–5 vaults.
- Rendering: terrain in chunks, trees and rocks instanced per 150 m chunk (so the camera and shadow frustums can cull), and a sea plane.

### Bots
- Navigation grid at 1 m covering the ground level (walls block, doorways are open, steep slopes block). A* with a node cap, path smoothing, at most 2 path searches per tick, and stuck detection (jump/mantle, then replan, then a new target).
- The bot brain thinks at 6 Hz, staggered across bots, and steers every tick.
  - States: loot → fight → chase → heal → roam.
  - Perception: 150° view cone plus a line-of-sight raycast within 120 m; it hears gunshots within 90 m.
  - Combat: reaction delay and aim error that grows with distance and target speed. It picks a weapon by range, aims down sights at range, strafes, fires in bursts, reloads when the mag is empty or the fight is calm, and retreats to heal when hurt.
  - Looting: open the nearest chest or pick up an item that's better than what it has. Bots ignore upstairs loot.
- Difficulty (Easy / Normal / Hard) sets reaction time, aim error, turn speed and how much they use crouch and strafing.
- Bots follow exactly the same rules as the player. They only send commands.

### Match
- Everyone spawns on land, unarmed, at least 30 m apart, mostly near named places.
- Match state: players alive, your kills, and your placement. Dying shows an elimination screen (placement, kills, damage, who got you). The last one alive gets the "#1 STEEL CHAMPION" screen. Both have a "Play again" button.
- The start screen adds bot count (24 / 49 / 99) and difficulty.
- Training mode (the step 1 range) stays for tests and for trying weapons.

### Rendering for 100 players
- All characters are drawn by **one InstancedMesh of unit cubes** (body parts and gun parts), with per-instance matrices and colours computed in JS. That's 1 draw call for the whole crowd. Characters beyond 350 m are skipped.
- Ground loot: pooled models within 90 m, spinning, with a rarity glow beam for Rare and above.
- Chests: instanced bodies and lids, with opened lids rotated.

### HUD
- Hotbar (5 slots with rarity colours, counts, selected highlight) with ammo above it.
- Interaction prompt with a hold-progress ring, item-use progress, players alive and kills.
- North-up minimap with your heading, and a full map on M (place names, you).
- Red direction arcs when you take damage.

## Files
- **sim:** `config.js` (extended), `character.js` (movement), `inventory.js`, `loot.js`, `weapons.js` (all weapons), `projectiles.js`, `buildings.js` (templates), `mapgen.js`, `navgrid.js`, `bots.js`, `game.js` (match + training modes)
- **render:** `crowd.js` (replaces `character-mesh.js`), `terrain-mesh.js` (chunks + water), `world-meshes.js`, `loot-view.js`, `effects.js`
- **ui:** `hud.js`, `screens.js`, `map-image.js`
- **tests:** one file per sim module.

## Review focus
1. Bots stuck on doorways, stairs or containers. Stuck detection recovers within about 3 s.
2. Pickups when slots are full: the swap drops the old item where the new one lay, and nothing is lost.
3. Mantling into ceilings or through walls: needs headroom checked at the target spot.
4. Using an item at full HP/shield is refused ("Shield full") instead of wasting it.
5. Frame time with 100 characters on Iris Xe-class graphics: one draw call for characters, chunk culling, loot drawn only within 90 m.
