/**
 * Headless physics smoke test for the realistic bottle rework.
 * Verifies, without a browser:
 *  1. The idle bottle doesn't drift (aiming proxy stable).
 *  2. An upright landing with low spin stays upright (genuine rest, not a freeze).
 *  3. A mid-air side-impact slam fails immediately.
 *  4. A tipped bottle that comes to rest on its side is judged a failure.
 *
 * Run: node scripts/physics-sim.js
 */
import Matter from 'matter-js';
import { PhysicsWorld } from '../src/physics.js';

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function bottleRestState(p) {
  const b = p.bottle;
  const angle = b.angle;
  const twoPi = Math.PI * 2;
  const norm = ((angle % twoPi) + twoPi) % twoPi;
  const tiltFromUpright = norm > Math.PI ? twoPi - norm : norm; // 0 = upright
  return {
    tilt: tiltFromUpright,
    speed: Matter.Vector.magnitude(b.velocity),
    spin: Math.abs(b.angularVelocity),
  };
}

// ── Test 1: idle stability ────────────────────────────────────────────────
{
  const p = new PhysicsWorld(420, 760);
  check('spawn creates the bottle body', p.bottle !== null);
  const inWorld = Matter.Composite.allBodies(p.engine.world).some(b =>
    b.label === 'bottle' || (b.parts || []).some(part => part.label === 'bottle'));
  check('aiming bottle stays out of the simulation', !inWorld);

  const x0 = p.bottle.position.x;
  const a0 = p.bottle.angle;
  for (let i = 0; i < 120; i++) p.update(1000 / 60);
  check('aiming pose is frozen (no drift)',
    Math.abs(p.bottle.position.x - x0) < 0.01 && Math.abs(p.bottle.angle - a0) < 0.0001);
}

// ── Test 2: well-matched toss settles upright via genuine rest ───────────
// Uses the same flight-matched spin model as MotionController: one rotation
// per flight arc (ω = 2π / flightTicks), slightly imperfect release.
function flightMatchedSpin(physics, vy) {
  const frameTime = 1000 / 60;
  const gPerTick = physics.engine.gravity.y * physics.engine.gravity.scale * frameTime * frameTime;
  const flightTicks = (2 * Math.abs(vy)) / gPerTick;
  return -(Math.PI * 2) / flightTicks * Math.exp(0.0012 * flightTicks) * 0.96; // clean release
}

{
  const p = new PhysicsWorld(420, 760);
  p.windForce = 0;
  const vy = -17.5;
  p.throwBottle(0.3, vy, flightMatchedSpin(p, vy) * 0.97); // 97% clean release

  let landed = null;
  let frames = 0;
  p.onLandingCallback = (r) => { landed = r; };
  while (!landed && frames < 600) { p.update(1000 / 60); frames++; }

  check('matched toss resolves within 10s sim time', !!landed, `frames=${frames}`);
  if (landed) {
    const st = bottleRestState(p);
    check('matched toss lands upright', landed.isUpright === true, `reason=${landed.reason || 'ok'}`);
    check('bottle at rest: |spin| < 0.01', st.spin < 0.01, `spin=${st.spin.toFixed(4)}`);
    check('bottle at rest: |v| < 0.05', st.speed < 0.05, `speed=${st.speed.toFixed(4)}`);
    check('bottle tilt < 16° (honest tolerance)', st.tilt < p.uprightTolerance, `tilt=${(st.tilt * 180 / Math.PI).toFixed(1)}°`);
  }
}

// ── Test 2b: over-rotating (old hardcoded spin) now honestly fails ────────
{
  const p = new PhysicsWorld(420, 760);
  p.windForce = 0;
  p.throwBottle(0.3, -17.5, -0.22); // legacy spin: ~2.2 flips per arc
  let landed = null;
  let frames = 0;
  p.onLandingCallback = (r) => { landed = r; };
  while (!landed && frames < 600) { p.update(1000 / 60); frames++; }
  check('over-rotated toss fails (spin now matters)', !!landed && landed.isUpright === false, landed ? `reason=${landed.reason}` : 'no callback');
}

// ── Test 3: violent sideways slams fail ─────────────────────────────
// Sweeps several spin phases so the test doesn't hinge on the (physically
// real but rare) case of a slammed bottle luckily catching upright.
{
  let failed = 0;
  for (const [vx, vy, om] of [[6.5, -8.0, 1.4], [5, -6, 1.8], [7, -10, 2.5], [4, -7, 2.0], [6, -9, 2.2]]) {
    const p = new PhysicsWorld(420, 760);
    p.windForce = 0;
    p.throwBottle(vx, vy, -om);
    let landed = null;
    let frames = 0;
    p.onLandingCallback = (r) => { landed = r; };
    while (!landed && frames < 1200) { p.update(1000 / 60); frames++; }
    if (landed && landed.isUpright === false) failed++;
  }
  check('violent slams fail (4 of 5 phases minimum)', failed >= 4, `failed=${failed}/5`);
}

// ── Test 4: tipped bottle at rest on its side = failure ───────────────────
{
  const p = new PhysicsWorld(420, 760);
  p.windForce = 0;
  p.throwBottle(0.2, -8.0, -0.05); // weak toss, almost no spin → flops over

  let landed = null;
  let frames = 0;
  p.onLandingCallback = (r) => { landed = r; };
  while (!landed && frames < 1200) { p.update(1000 / 60); frames++; }

  const onSide = p.bottle ? bottleRestState(p).tilt > 0.5 : false;
  check('under-powered flop judged as fail', !!landed && landed.isUpright === false, landed ? `reason=${landed.reason}` : 'no callback');
  check('ended on its side, not standing', onSide);
}

console.log(`\n${results.filter(r => r.pass).length}/${results.length} checks passed`);
const failed = results.filter(r => !r.pass);
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach(f => console.log(` - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
  process.exit(1);
}
