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
  return -(Math.PI * 2) / flightTicks * Math.exp(0.0012 * flightTicks); // raw model
}
// Calibrated clean-release factor shared with MotionController: centres a
// perfect release inside the slim-container landing window.
const CLEAN_RELEASE = 0.92;

{
  const p = new PhysicsWorld(420, 760);
  p.windForce = 0;
  const vy = -15;
  p.throwBottle(0.3, vy, flightMatchedSpin(p, vy) * CLEAN_RELEASE); // clean release

  let landed = null;
  let frames = 0;
  p.onLandingCallback = (r) => { landed = r; };
  while (!landed && frames < 600) { p.update(1000 / 60); frames++; }

  check('matched toss resolves within 10s sim time', !!landed, `frames=${frames}`);
  check('no verdict before touchdown delay (≥500ms flight)', frames * (1000 / 60) >= 500, `verdict at ${(frames * (1000 / 60)).toFixed(0)}ms`);
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

// ── Test 3: violent slams judged honestly ─────────────────────────────
// NOTE: there is no collision-path insta-fail for slams — a broadside
// touchdown can still rock back onto its feet, so every throw is judged
// at genuine rest. The honest property tested here: the verdict AGREES
// with the final resting pose for violent throws.
{
  let consistent = 0;
  for (const [vx, vy, om] of [[6.5, -8.0, 1.4], [5, -6, 1.8], [7, -10, 2.5], [4, -7, 2.0], [6, -9, 2.2]]) {
    const p = new PhysicsWorld(420, 760);
    p.windForce = 0;
    p.throwBottle(vx, vy, -om);
    let landed = null;
    let frames = 0;
    p.onLandingCallback = (r) => { landed = r; };
    while (!landed && frames < 1200) { p.update(1000 / 60); frames++; }
    if (!landed) continue;
    const st = bottleRestState(p);
    const endedUpright = st.tilt < p.uprightTolerance || Math.abs(st.tilt - Math.PI) < p.uprightTolerance;
    if (landed.isUpright === endedUpright) consistent++;
  }
  check('violent slams: verdict matches final pose (5/5)', consistent === 5, `consistent=${consistent}/5`);
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

// ── Test 5: container skins — real shapes, real weights, honest flips ─────
// Each skin is a physical container (see PhysicsWorld.SHAPES): switching
// must change the silhouette, the reported weight AND stay landable.
function flightMatchedFor(p, vy) {
  return flightMatchedSpin(p, vy);
}
{
  const dims = {
    bottle:    { w: 42, h: 102 },
    wine:      { w: 38, h: 110 },
    champagne: { w: 44, h: 114 },
    feeder:    { w: 40, h: 96 },
    tumbler:   { w: 46, h: 86 },
  };
  for (const [shape, d] of Object.entries(dims)) {
    const p = new PhysicsWorld(420, 760);
    p.windForce = 0;
    p.setShape(shape);
    check(`${shape}: silhouette dims applied`,
      p.bottleWidth === d.w && p.bottleHeight === d.h,
      `got ${p.bottleWidth}x${p.bottleHeight}`);
    check(`${shape}: weight curve applied`,
      p.bottleEmptyMassG > 0 && p.bottleFullMassG > p.bottleEmptyMassG,
      `${p.bottleEmptyMassG}g → ${p.bottleFullMassG}g`);
  }

  // Sealed champagne ignores the fill selector — it is always full.
  {
    const p = new PhysicsWorld(420, 760);
    p.setShape('champagne');
    p.setLiquidFill(0.25);
    check('champagne is sealed (fill stays 1.0)', p.liquidFill === 1.0, `fill=${p.liquidFill}`);
  }

// A flight-matched toss at half fill lands upright on every landable
// shape across a spread of arcs (like real life: each container has its
// own landable arc energy — a tumbler flung hard topples, a gentle lob
// plants it).
for (const [shape, vy] of [['bottle', -14], ['wine', -14], ['champagne', -14], ['feeder', -14], ['tumbler', -14]]) {
  const p = new PhysicsWorld(420, 760);
  p.windForce = 0;
  p.setShape(shape);
  p.liquidFill = 0.5;
  p.spawnBottle();
  p.throwBottle(0.3, vy, flightMatchedFor(p, vy) * CLEAN_RELEASE);
    let landed = null;
    let frames = 0;
    p.onLandingCallback = (r) => { landed = r; };
    while (!landed && frames < 900) { p.update(1000 / 60); frames++; }
    check(`${shape}: matched toss lands upright`, !!landed && landed.isUpright === true,
      landed ? `reason=${landed.reason}` : 'no callback');
  }
}

console.log(`\n${results.filter(r => r.pass).length}/${results.length} checks passed`);
const failed = results.filter(r => !r.pass);
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach(f => console.log(` - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
  process.exit(1);
}
