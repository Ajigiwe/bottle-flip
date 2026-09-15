# Flip Pure

A physics-based Bottle Flip game for mobile & desktop, built with **Matter.js**, HTML5 Canvas, `DeviceMotionEvent` accelerometer sensing, and a **Web Audio API** synthesizer. Installable as a PWA for offline play.

## Features

### Gameplay
- **Realistic physics** — Matter.js simulation with a bottle whose mass, bounce, inertia, and center of mass all shift with the water fill level (0% / 25% / 50% / 75% / 100%). Empty bottles are light and bouncy; full ones are heavy and stable.
- **Game modes:**
  - ♾️ **Endless (Classic)** — 3 lives, land as many flips as you can.
  - ⚡ **Timed Blitz** — 30 seconds, score as many flips as possible.
- **Scoring** — 50 pts per landing, 150 pts for a bullseye, 500 pts for the legendary upside-down **Cap Landing** (headstand). Streaks multiply points up to **×5**.
- **Difficulty scaling** — every 5 successful flips the difficulty level (D0–D5) rises: the table narrows, the bullseye target moves faster, and crosswind starts pushing the bottle mid-flight.
- **Bullseye target** — land inside the pulsing target spot for bonus points; at higher difficulty it oscillates across the table.
- **Wall bounces** — side walls are live, so bank shots and trick landings are possible.
- **Trajectory preview** — drag to aim and see the predicted flight arc before release.

### Progression & Meta
- **Achievements** — 9 unlockable badges (First Flip, Sharpshooter, Hat Trick, On Fire, Point Guard, High Roller, Sniper, Speed Demon, Cap Master) with toast notifications.
- **Leaderboard** — local top-5 scores, tracked per game mode.
- **Skins** — 4 bottle skins (Classic, Neon Rush, Gold Rush, Inferno) unlocked by your all-time best score (0 / 200 / 500 / 1000 pts).

### Presentation
- **Visuals** — stylized 3D-ish bottle rendering, studio lighting, wooden table with perspective legs, sloshing liquid, particle effects (pooled, 200 particles), confetti for cap landings, spin trail, power meter.
- **Audio** — latency-free procedural sound: flick whooshes, landing thuds, crash sounds, bullseye chime, crowd cheers, combo fanfares, and background music. Mutable from settings.
- **Haptics** — vibration feedback on landings and streaks (where supported).
- **PWA** — installable, with a service worker that precaches all assets for offline play.

## Controls

| Input | How to throw |
|---|---|
| 📱 **Motion flick** | Flick your phone upward. On iOS 13+ a permission prompt appears first (also grantable from Settings). Sensitivity is adjustable 1–10 in Settings; a high-pass gravity filter prevents small shakes from auto-throwing. |
| 👆 **Touch / mouse swipe** | Press on the canvas and swipe up. Swipe length controls power (vertical velocity and spin), horizontal offset steers the throw. A short swipe under the threshold cancels. |

Other controls:
- **Water fill selector** — pick 0%–100% to change bottle physics (menu screen).
- **Mode selector** — switch between Endless and Timed Blitz (menu screen).
- **Reset** — re-place the bottle on the table.
- **Settings** — sensitivity slider, audio toggle, sensor permission.
- **How to Play** — in-game guide modal.

## Getting Started

```bash
npm install
npm run dev
```

Then open the printed local URL (the dev server binds to your network with `--host`, so you can also test motion controls from a phone on the same LAN).

### Production build

```bash
npm run build     # outputs static site to dist/
npm run preview   # serve the production build locally
```

## Tech Stack

| Piece | Tech |
|---|---|
| Physics | [Matter.js](https://brm.io/matter-js/) |
| Rendering | HTML5 Canvas (2D), no framework |
| Audio | Web Audio API (fully synthesized, no assets) |
| Motion input | `DeviceMotionEvent` + pointer/touch gestures |
| Bundler / dev server | [Vite](https://vite.dev) |
| Persistence | `localStorage` (scores, achievements, skins, settings) |
| PWA | `public/manifest.json` + build-generated service worker (cache-first offline, precaches hashed assets) |

## Project Structure

```
index.html            App shell, HUD, menus, modals
src/
  main.js             Game orchestrator: modes, scoring, UI, screens
  physics.js          Matter.js world: bottle, table, target, wind, landing detection
  render.js           Canvas renderer: bottle art, table, liquid, aim preview
  motion.js           MotionController: flick & swipe input, sensitivity
  audio.js            SoundManager: procedural Web Audio synth
  effects.js          EffectsEngine: particle pool, confetti, ripples
  achievements.js     Badge definitions + persistent unlock state
  leaderboard.js      Local top-5 score storage
  skinSystem.js       Skin catalog + unlock logic
  eventBus.js         Tiny pub/sub event bus
  gameState.js        Frozen enums for game/physics states
public/
  manifest.json       PWA manifest (inline SVG icons)
scripts/
  pwa-sw-plugin.js    Vite build plugin: generates dist/sw.js with the real
                      hashed-asset precache manifest for offline play
  physics-sim.js      Headless physics smoke tests (npm test)
```
