# SteelRoyale

A browser battle royale: you against 99 bots, looting chests for the best weapons to be the last one standing. Built with plain HTML, CSS and JavaScript, using Three.js for 3D.

Current state: **step 2, first real match.**
- **Match:** you and up to 99 bots spawn unarmed across a generated island with named towns, industrial yards, farms and roads. Loot chests and buildings, fight, stay ahead of the shrinking storm, and be the last one standing.
- **Training range:** practice with every weapon against dummies.
- **Coming in step 3:** the aircraft drop, building and vehicles.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer. There's nothing to install.

**Windows:** double-click `play.bat`. It starts the game's small local server and opens your browser. Keep its window open while you play; closing it stops the server.

**Any system:**

```bash
node server.js --open
```

Or run `node server.js` and open http://localhost:8080 yourself, then click **Click to play**.

> Opening `index.html` directly (as a `file://` page) does not work. Browsers block the game's JavaScript modules there, and the start screen will tell you so.

If the browser can't capture the mouse (some embedded browsers, like the Claude app's browser pane, don't allow it), the game starts in free-look mode instead: move the mouse to look around and press Esc to pause.

The server only accepts connections from your own computer. To play from another device on your network, start it with the environment variable `HOST=0.0.0.0` (in PowerShell: `$env:HOST="0.0.0.0"; node server.js`). Dot-files such as `.git` are never served either way.

## Controls

| Action | Key |
|---|---|
| Move | W A S D |
| Sprint | Shift |
| Jump / climb a ledge | Space |
| Crouch, hold (while sprinting: slide) | Ctrl |
| Look | Mouse |
| Shoot / use the selected item | Left mouse |
| Aim (scope on the sniper) | Right mouse |
| Pick up / open a chest | E |
| Inventory slots | 1–5 or mouse wheel |
| Inventory (drag to move, drag off to drop; you can keep moving) | Tab |
| Reload | R |
| Drop the selected item | G |
| Map | M |

Tab and M: a quick tap keeps it open until you press again; holding longer than 0.75 s keeps it open only while held.
| Pause | Esc |

Browsers don't let a page block **Ctrl+W** (close tab). So while you're in a game, the page asks "Leave site?" before closing, in case you hit it while crouch-walking.

## Tests

```bash
npm test
```

## Project layout

- `js/sim/`: game logic (no Three.js, no DOM), unit-tested with `node --test`
- `js/render/`: Three.js drawing
- `js/ui/`: HTML heads-up display
- `js/config.js`: every tunable number (speeds, weapons, rarities…)
- `docs/DESIGN.md`: the full game design
- `lib/three.module.min.js`: Three.js r170 (MIT, see `lib/three.LICENSE`)
