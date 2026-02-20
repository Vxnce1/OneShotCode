Flux Runner — p5.js game

How to run

- Open `index.html` in a browser (Chrome/Edge recommended). For correct audio permissions and to avoid CORS when loading from disk, run a simple local server such as:

```bash
# Python 3
python -m http.server 8000
# then open http://localhost:8000
```

Controls

- Single player: `W` or `Space` to jump
- Multiplayer: Player 1: `W`/`Space`; Player 2: `Arrow Up`
- `P` to pause, `M` for menu, `T` for tutorial from menu
- `S` opens Settings from the menu; `D` runs a deterministic seed-safety test (dev)

Developer notes

- Deterministic RNG: `SeededRandom` seeded at run start. All gameplay randomness uses `rng.next()`.
- Run-time deterministic seed sweep: from browser console, you can run:

```js
// quick sweep of 200 seeds
const bad = MapGenerator.testSeeds(1, 200, 'medium');
console.log('bad seeds', bad.length, bad.slice(0,8));
```

- Optional auto-run sweep: set `window.AUTO_SEED_TEST = true` in the console and reload; results will appear in `globalManager.debugTestResults` and console.

Persistence

- Progress and settings are saved to `localStorage` using keys prefixed with `fluxrunner_`.

Files of interest

- `index.html` — basic scaffold and script includes
- `style.css` — UI styling
- `sketch.js` — main game implementation (engine, map gen, audio, UI)

Notes & next steps

- Testing, resizing and polish are pending; please run the seed sweep and playtest in-browser. I can continue with focused fixes for any seeds that report issues or do additional visual polish and performance tuning on request.

Testing Checklist

- Open the game in a browser via a local server (see above).
- Verify audio by starting a run (user gesture required) and ensure beat-synced pulse appears.
- From the Menu, press `D` to run the deterministic seed-safety test (200 seeds). Inspect console output and `globalManager.debugTestResults` for any seeds reporting issues.
- Resize the window and verify the player remains within bounds and platforms reflow correctly.
- Play a full run and test portals (gravity and speed), jump pads, rings, moving platforms, and coin collection. Verify purchases persist across reloads.

Packaging / Deliver

- To package for distribution, zip the folder contents (ensure `index.html`, `style.css`, `sketch.js` and `p5.js`/`p5.sound` are present). Example (PowerShell):

```powershell
Compress-Archive -Path .\* -DestinationPath FluxRunner.zip
```

Contact / Next steps

- Tell me which seeds (if any) report issues from the seed-sweep and I'll iterate fixes.
- I can also run additional polish: parallax background, shader glow, or level-balanced difficulty tuning.
 
Final delivery checklist

- All core systems implemented: deterministic RNG, physics, map gen, pooling, audio, particles, UI, multiplayer.
- Autosave and settings persisted to `localStorage` with prefix `fluxrunner_`.
- High-DPI and window-resize handling implemented.
- Developer seed-safety test and auto-repair are included: `MapGenerator.selfTestAndRepair` and `window.AUTO_SEED_TEST`.

Packaging script

I added `package.ps1` to produce a ZIP of the project for Windows packaging. Run it from the project root in PowerShell:

```powershell
.
\package.ps1
```

If you want, I can produce additional artifacts (minified JS, standalone electron wrapper, or hosted demo instructions).
