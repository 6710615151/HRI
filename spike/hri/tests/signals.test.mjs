// Algorithm tests with constructed inputs of known ground truth.
// These verify the signal-processing logic only; they say nothing about camera accuracy on real people.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BreathEstimator, classifyWai, WaiDetector, Proximity, P,
  userArmDirections, mirrorTherapyTarget, armAngles, reflectX
} from "../signals.js";

// Deterministic PRNG so results are reproducible.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

// Shoulder-height-like signal: breathing sinusoid + slow drift (posture) + white noise.
function breathingTrace({ bpm, seconds, fps = 30, amp = 1, noise = 0, drift = 0, seed = 1, bpmAt }) {
  const r = rng(seed);
  const out = [];
  let phase = 0;
  for (let i = 0; i < seconds * fps; i++) {
    const t = i / fps;
    const rate = bpmAt ? bpmAt(t) : bpm;
    phase += (2 * Math.PI * rate) / 60 / fps;
    out.push({ t, v: amp * Math.sin(phase) + drift * t + noise * gauss(r) });
  }
  return out;
}

const run = (trace, opts) => { const e = new BreathEstimator(opts); for (const s of trace) e.push(s.t, s.v); return e.estimate(); };

export const breathResults = [];
test("breath: accuracy across rates and noise (SNR = amp/noise)", () => {
  for (const bpm of [6, 10, 15, 20]) for (const noise of [0, 0.25, 0.5, 1.0]) {
    const est = run(breathingTrace({ bpm, seconds: 30, noise, drift: 0.01, seed: bpm * 100 + noise * 10 }));
    breathResults.push({ bpm, noise, est: est.bpm, quality: est.quality, acf: est.acf });
    if (est.bpm !== null && est.quality >= 0.6) assert.ok(Math.abs(est.bpm - bpm) <= 1.5, `confident but wrong: ${bpm} noise ${noise} -> ${est.bpm}`);
    if (noise <= 0.5) {
      assert.ok(est.bpm !== null, `no estimate at ${bpm} bpm noise ${noise}`);
      assert.ok(Math.abs(est.bpm - bpm) <= 1.0, `bpm ${bpm} noise ${noise} -> ${est.bpm}`);
    }
  }
  console.table(breathResults);
});

test("breath: abstains on pure noise (no rhythm)", () => {
  let falseConfident = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const r = rng(seed);
    const trace = Array.from({ length: 900 }, (_, i) => ({ t: i / 30, v: gauss(r) }));
    const est = run(trace);
    if (est.bpm !== null && est.quality >= 0.6) falseConfident++;
  }
  console.log("pure noise, 50 seeds -> confident false rates:", falseConfident);
  assert.ok(falseConfident <= 2, `${falseConfident}/50 noise traces produced a confident rate`);
});

test("breath: tracks a guided slow-down 16 -> 8 bpm (latency)", () => {
  const bpmAt = (t) => (t < 40 ? 16 : t < 70 ? 16 - ((t - 40) / 30) * 8 : 8);
  const trace = breathingTrace({ bpm: 16, seconds: 120, noise: 0.25, bpmAt, seed: 3 });
  const e = new BreathEstimator();
  const series = [];
  for (const s of trace) { e.push(s.t, s.v); if (Math.abs(s.t % 5) < 1e-6 && s.t >= 10) series.push({ t: s.t, truth: +bpmAt(s.t).toFixed(1), est: e.estimate().bpm }); }
  console.table(series);
  const end = series.at(-1);
  assert.ok(Math.abs(end.est - 8) <= 1, `final estimate ${end.est}`);
});

test("breath: a single posture shift does not create a false rate jump", () => {
  const trace = breathingTrace({ bpm: 12, seconds: 40, noise: 0.2, seed: 9 }).map((s) => ({ ...s, v: s.v + (s.t > 20 ? 4 : 0) }));
  const est = run(trace);
  console.log("posture step ->", est);
  assert.ok(est.bpm === null || Math.abs(est.bpm - 12) <= 1.5);
});

// ---- wai: hand-built 2D landmark sets (normalised image coordinates, y down)
function body({ lw, rw, le, re }) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
  const set = (i, x, y) => (lm[i] = { x, y, visibility: 0.95 });
  set(P.nose, 0.5, 0.25); set(P.lShoulder, 0.62, 0.42); set(P.rShoulder, 0.38, 0.42);
  set(P.lElbow, ...le); set(P.rElbow, ...re); set(P.lWrist, ...lw); set(P.rWrist, ...rw);
  return lm;
}
test("wai: classic chest wai is detected", () => {
  const r = classifyWai(body({ lw: [0.52, 0.36], rw: [0.48, 0.36], le: [0.6, 0.55], re: [0.4, 0.55] }));
  assert.equal(r.isWai, true, JSON.stringify(r));
});
test("wai: high (forehead) wai is detected", () => {
  assert.equal(classifyWai(body({ lw: [0.52, 0.2], rw: [0.48, 0.2], le: [0.6, 0.4], re: [0.4, 0.4] })).isWai, true);
});
test("wai: hands clasped at the waist is rejected", () => {
  assert.equal(classifyWai(body({ lw: [0.52, 0.7], rw: [0.48, 0.7], le: [0.62, 0.58], re: [0.38, 0.58] })).isWai, false);
});
test("wai: a one-hand wave is rejected", () => {
  assert.equal(classifyWai(body({ lw: [0.8, 0.2], rw: [0.36, 0.75], le: [0.72, 0.35], re: [0.37, 0.6] })).isWai, false);
});
test("wai: arms crossed on chest (wrists apart) is rejected", () => {
  assert.equal(classifyWai(body({ lw: [0.4, 0.5], rw: [0.6, 0.5], le: [0.64, 0.55], re: [0.36, 0.55] })).isWai, false);
});
test("wai detector: needs a 500 ms hold and has a cooldown", () => {
  const d = new WaiDetector({ holdMs: 500, cooldownMs: 3000 });
  const yes = { isWai: true }, no = { isWai: false };
  assert.equal(d.update(0, yes).state, "rising");
  assert.equal(d.update(300, yes).state, "rising");
  assert.equal(d.update(520, yes).state, "fired");
  assert.equal(d.update(600, yes).state, "held");
  d.update(700, no);
  d.update(800, yes);
  assert.notEqual(d.update(1400, yes).state, "fired", "cooldown should block a repeat");
});

// ---- proximity
test("proximity: ratio and lean-back", () => {
  const p = new Proximity({ leanBackDrop: 0.12, windowMs: 1500 });
  p.calibrate(0.2);
  assert.equal(p.update(0, 0.24).ratio, 1.2);
  const r = p.update(800, 0.2); // 17% drop within the window
  assert.equal(r.leanBack, true);
});

// ---- mirror mapping semantics
function world(side, upper, fore) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.1 }));
  const [s, e, w] = side === "left" ? [P.lShoulder, P.lElbow, P.lWrist] : [P.rShoulder, P.rElbow, P.rWrist];
  const sh = { x: side === "left" ? 0.18 : -0.18, y: -0.45, z: 0 };
  lm[s] = { ...sh, visibility: 0.99 };
  lm[e] = { x: sh.x + upper[0], y: sh.y + upper[1], z: sh.z + upper[2], visibility: 0.99 };
  lm[w] = { x: lm[e].x + fore[0], y: lm[e].y + fore[1], z: lm[e].z + fore[2], visibility: 0.99 };
  return lm;
}
test("mirror: user raises LEFT arm sideways -> robot raises its RIGHT arm outward (reflected)", () => {
  // MediaPipe world: user's left arm to image right (+x), raised (y negative = up).
  const lm = world("left", [0.25, -0.05, 0], [0.22, -0.1, 0]);
  const tgt = mirrorTherapyTarget(lm, "left");
  assert.equal(tgt.robotSide, "R");
  assert.ok(tgt.upper[0] < 0, "robot right arm points to robot's right (-x)");
  assert.ok(tgt.upper[1] > 0, "and upward");
});
test("mirror: reach toward camera stays toward viewer", () => {
  const lm = world("left", [0.02, 0.05, -0.25], [0, 0, -0.25]);
  const d = userArmDirections(lm, "left");
  assert.ok(d.upper[2] > 0 && d.fore[2] > 0);
});
test("arm angles: straight arm hanging = elevation ~0, elbow ~180", () => {
  const a = armAngles({ upper: [0, -1, 0], fore: [0, -1, 0] });
  assert.ok(a.shoulderElevationDeg < 1 && a.elbowDeg > 179);
  const b = armAngles({ upper: [1, 0, 0], fore: [0, 1, 0] });
  assert.ok(Math.abs(b.shoulderElevationDeg - 90) < 1 && Math.abs(b.elbowDeg - 90) < 1);
  assert.deepEqual(reflectX([1, 2, 3]), [-1, 2, 3]);
});
