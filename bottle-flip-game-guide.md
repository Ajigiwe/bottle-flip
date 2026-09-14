# Bottle Flip Game — Build Guide (Motion/Gyro Version)

## 1. Concept Overview

A mobile web game where the player physically flicks their phone to throw a
virtual bottle, which spins through the air under simulated gravity and must
land upright to score. Combines:

- **Device motion sensing** (real-world flick input)
- **2D physics simulation** (gravity, rotation, collision, landing detection)
- **Canvas rendering** (bottle + liquid animation)

---

## 2. Recommended Stack

| Layer | Choice | Why |
|---|---|---|
| Rendering | **HTML5 Canvas** (2D context) | Lightweight, full control over bottle/liquid drawing, no GPU overhead needed for this scope |
| Physics | **Matter.js** | Handles gravity, rotation, restitution, and collision out of the box; avoids hand-rolling rigid body math |
| Motion input | **DeviceMotionEvent** (accelerometer) | Detects the flick gesture via acceleration spike; simplest reliable signal |
| Orientation (optional) | **DeviceOrientationEvent** (gyro) | Optional — can add tilt-based fine control, but not required for core flip mechanic |
| App shell | **Vanilla JS + Vite**, or plain single HTML file | No framework needed for a game this size; Vite just gives you fast local dev + easy deploy |
| Hosting | **Vercel** or **GitHub Pages** | Both give free HTTPS, which is *mandatory* for sensor APIs to work |
| Audio | **Howler.js** (optional) | Simple sound effect handling for flip/land/fail sounds |

**Why not a game engine (Phaser/Unity/etc.)?** Overkill. This is a single
physics object with one interaction. A full engine adds build complexity
without adding capability you need.

---

## 3. Architecture

```
index.html
main.js          → game loop, state management
physics.js        → Matter.js world setup, bottle body, landing detection
motion.js         → sensor permission + flick detection logic
render.js         → canvas drawing (bottle shape, liquid sloshing, UI)
audio.js           → sound effect triggers (optional)
```

### Core loop
1. Player taps a "Ready" button (this tap is what triggers the iOS permission prompt)
2. Game listens for `devicemotion` events, watching for acceleration magnitude crossing a threshold
3. On flick detected → convert acceleration vector into throw force + spin, apply to Matter.js body
4. Matter.js simulates the arc, rotation, and eventual "landing" (collision with ground plane)
5. On landing: check bottle's rotation angle — within tolerance of upright (e.g. ±10°) = success
6. Update score/streak, reset bottle, repeat

---

## 4. Key Implementation Details

### 4.1 Requesting sensor permission (iOS)
iOS Safari requires explicit permission, and it **must** be requested inside
a user gesture handler (a button tap) — it will silently fail otherwise.

```js
async function requestMotionPermission() {
  if (typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function") {
    const result = await DeviceMotionEvent.requestPermission();
    return result === "granted";
  }
  return true; // Android / non-iOS doesn't need this
}
```

### 4.2 Detecting the flick
Watch `acceleration` (not `accelerationIncludingGravity`) for a spike above
a tuned threshold, then capture the peak vector as your throw force.

```js
window.addEventListener("devicemotion", (event) => {
  const { x, y, z } = event.acceleration;
  const magnitude = Math.sqrt(x*x + y*y + z*z);
  if (magnitude > FLICK_THRESHOLD) {
    triggerThrow(magnitude, x, y, z);
  }
});
```

### 4.3 Landing detection
After the Matter.js body's vertical velocity crosses near-zero and it's
resting on the ground body, check its `angle` property (radians) against
upright (0 or 2π):

```js
const normalized = ((body.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const isUpright = normalized < UPRIGHT_TOLERANCE ||
                   normalized > (2 * Math.PI - UPRIGHT_TOLERANCE);
```

### 4.4 Liquid sloshing (visual polish)
Fake it — don't actually simulate fluid. Draw a wave-offset polygon inside
the bottle shape that lags behind the bottle's rotation with some damping,
giving a convincing "sloshing" look for near-zero extra physics cost.

---

## 5. Constraints & Gotchas

- **HTTPS is mandatory.** Sensor APIs are blocked on plain HTTP entirely (except `localhost` during dev).
- **Artifact/iframe previews won't work for testing.** Sensor permissions generally aren't grantable inside embedded iframes — deploy to Vercel/GitHub Pages and test on an actual phone.
- **Desktop has no motion sensors.** Build a mouse-drag fallback (drag-and-release velocity → same throw function) so the game is testable without a phone.
- **Android vs iOS threshold tuning differs.** Android accelerometers tend to report differently-scaled values; expect to tune `FLICK_THRESHOLD` separately per platform, or auto-calibrate on first use.
- **Physics tuning takes longer than the code.** Force curve, spin rate, restitution (bounciness on partial fails), and landing tolerance all need real hands-on-phone playtesting to feel right.

---

## 6. Suggested Build Order

1. **Day 1:** Core Matter.js physics + mouse-drag throw (desktop-testable, no sensors yet)
2. **Day 1–2:** Bottle rendering + landing detection + scoring
3. **Day 2:** Add `devicemotion` layer, iOS permission flow, deploy to Vercel
4. **Day 2–3:** On-phone testing and threshold/physics tuning
5. **Day 3+ (polish):** Liquid sloshing animation, sound effects, streaks/leaderboard, difficulty variants (different bottle fill levels change center of mass)

---

## 7. Nice-to-Have Extensions

- Fill-level selector (less water = harder to land, more realistic difficulty curve)
- Local leaderboard via `localStorage`
- Haptic feedback on landing (`navigator.vibrate()`) for supported Android devices
- Slow-motion replay of the flip on a successful land
