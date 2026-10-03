// Pure signal-processing for the HRI spike. No browser APIs: unit-tested in tests/.
// Landmark indices follow MediaPipe Pose (33 points, labelled from the subject's perspective).
export const P = { nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16, lHip: 23, rHip: 24 };

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const visible = (lm, min = 0.5) => lm && (lm.visibility ?? 1) >= min;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ---------------------------------------------------------------- breathing
// Estimates breathing rate from a slow vertical body signal (e.g. shoulder-midpoint y,
// or a mic envelope). Reports null unless the rhythm is regular enough to trust.
export class BreathEstimator {
  constructor({ windowSec = 30, detrendSec = 12, smoothSec = 0.7, minBpm = 4, maxBpm = 30 } = {}) {
    Object.assign(this, { windowSec, detrendSec, smoothSec, minBpm, maxBpm });
    this.samples = []; // {t, v}
  }
  reset() { this.samples = []; }
  push(t, v) {
    if (!Number.isFinite(v)) return;
    this.samples.push({ t, v });
    const cutoff = t - this.windowSec;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
  }
  // Resample to a fixed rate so filters behave the same at 15 or 60 fps.
  resampled(hz = 10) {
    const s = this.samples;
    if (s.length < 2) return [];
    const out = [];
    let j = 0;
    for (let t = s[0].t; t <= s[s.length - 1].t; t += 1 / hz) {
      while (j < s.length - 2 && s[j + 1].t < t) j++;
      const a = s[j], b = s[j + 1];
      const u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      out.push({ t, v: a.v + (b.v - a.v) * Math.min(Math.max(u, 0), 1) });
    }
    return out;
  }
  estimate() {
    const hz = 10;
    const r = this.resampled(hz);
    if (r.length < hz * 8) return { bpm: null, quality: 0, reason: "need ≥8 s of signal" };
    const movingAvg = (arr, n) => arr.map((_, i) => {
      const a = Math.max(0, i - (n >> 1)), b = Math.min(arr.length, i + (n >> 1) + 1);
      let sum = 0; for (let k = a; k < b; k++) sum += arr[k];
      return sum / (b - a);
    });
    const raw = r.map((x) => x.v);
    const trend = movingAvg(raw, Math.round(this.detrendSec * hz));
    const detrended = raw.map((v, i) => v - trend[i]);
    const smooth = movingAvg(detrended, Math.max(1, Math.round(this.smoothSec * hz)));

    // Hysteresis zero-crossing (upward) detection.
    const amp = Math.sqrt(smooth.reduce((s, v) => s + v * v, 0) / smooth.length);
    if (amp === 0) return { bpm: null, quality: 0, reason: "flat signal" };
    const hyst = amp * 0.3;
    const ups = [];
    let armed = false;
    for (let i = 0; i < smooth.length; i++) {
      if (smooth[i] < -hyst) armed = true;
      if (armed && smooth[i] > hyst) { ups.push(r[i].t); armed = false; }
    }
    const minGap = 60 / this.maxBpm, maxGap = 60 / this.minBpm;
    const intervals = ups.slice(1).map((t, i) => t - ups[i]).filter((d) => d >= minGap && d <= maxGap);
    if (intervals.length < 2) return { bpm: null, quality: 0, reason: "fewer than 3 breath cycles" };
    const recent = intervals.slice(-4);
    const med = median(recent);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
    const regularity = Math.max(0, 1 - sd / mean);           // 1 = perfectly regular
    const cycles = Math.min(1, intervals.length / 4);          // confidence grows with evidence
    // Periodicity check: real breathing repeats itself one period later; smoothed noise does not.
    const lag = Math.round(med * hz);
    const tail = smooth.slice(-Math.min(smooth.length, Math.round(hz * 20)));
    let num = 0, den = 0;
    for (let i = 0; i + lag < tail.length; i++) num += tail[i] * tail[i + lag];
    for (const v of tail) den += v * v;
    const acf = den > 0 ? Math.max(0, num / den) : 0;
    const quality = +(regularity * cycles * Math.min(1, acf / 0.6)).toFixed(2);
    const bpm = +(60 / med).toFixed(1);
    if (acf < 0.35) return { bpm: null, quality, acf: +acf.toFixed(2), reason: "no stable rhythm" };
    return { bpm, quality, acf: +acf.toFixed(2), cycles: intervals.length, reason: quality < 0.6 ? "irregular rhythm" : "ok" };
  }
}

// Body signal used for camera breathing: mean shoulder height relative to shoulder width
// (normalising by width cancels distance changes). Larger = shoulders lower in image.
export function shoulderBreathSignal(lm) {
  const l = lm?.[P.lShoulder], r = lm?.[P.rShoulder];
  if (!visible(l) || !visible(r)) return NaN;
  const width = dist2(l, r);
  if (width < 1e-3) return NaN;
  return ((l.y + r.y) / 2) / width;
}

// ---------------------------------------------------------------- wai
// Single-frame classifier on 2D pose landmarks (normalised image coords, y down).
export function classifyWai(lm) {
  const ls = lm?.[P.lShoulder], rs = lm?.[P.rShoulder], lw = lm?.[P.lWrist], rw = lm?.[P.rWrist];
  const le = lm?.[P.lElbow], re = lm?.[P.rElbow], nose = lm?.[P.nose];
  if (![ls, rs, lw, rw, le, re, nose].every((p) => visible(p, 0.4))) return { isWai: false, score: 0, reason: "landmarks not visible" };
  const sw = dist2(ls, rs);
  const shoulderY = (ls.y + rs.y) / 2, midX = (ls.x + rs.x) / 2;
  const wristGap = dist2(lw, rw) / sw;                         // hands together
  const handsY = (lw.y + rw.y) / 2;
  const handsX = (lw.x + rw.x) / 2;
  const checks = {
    handsTogether: wristGap < 0.45,
    centred: Math.abs(handsX - midX) / sw < 0.4,
    heightOk: handsY > nose.y - 0.35 * sw && handsY < shoulderY + 0.75 * sw, // forehead .. upper chest
    wristsAboveElbows: lw.y < le.y && rw.y < re.y
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return { isWai: passed === 4, score: passed / 4, wristGap: +wristGap.toFixed(2), checks };
}

// Temporal gate: wai must be held for holdMs; then cooldown to avoid repeat triggers.
export class WaiDetector {
  constructor({ holdMs = 500, cooldownMs = 3000 } = {}) { Object.assign(this, { holdMs, cooldownMs }); this.since = null; this.lastFire = -Infinity; }
  update(tMs, frame) {
    if (!frame.isWai) { this.since = null; return { state: "none", progress: 0 }; }
    if (this.since === null) this.since = tMs;
    const progress = Math.min(1, (tMs - this.since) / this.holdMs);
    if (progress >= 1 && tMs - this.lastFire > this.cooldownMs) { this.lastFire = tMs; return { state: "fired", progress }; }
    return { state: progress >= 1 ? "held" : "rising", progress };
  }
}

// ---------------------------------------------------------------- proximity
// Relative proximity from apparent shoulder width (or interocular distance).
// Calibrate once at a comfortable distance; ratio > 1 means closer than baseline.
export class Proximity {
  constructor({ leanBackDrop = 0.12, windowMs = 1500 } = {}) { Object.assign(this, { leanBackDrop, windowMs }); this.baseline = null; this.hist = []; }
  calibrate(width) { this.baseline = width; }
  update(tMs, width) {
    if (!Number.isFinite(width) || width <= 0) return { ratio: null, leanBack: false };
    if (this.baseline === null) this.baseline = width;
    this.hist.push({ t: tMs, w: width });
    while (this.hist.length && this.hist[0].t < tMs - this.windowMs) this.hist.shift();
    const peak = Math.max(...this.hist.map((h) => h.w));
    // Lean-back = apparent size dropped quickly relative to the recent peak.
    const leanBack = peak > 0 && (peak - width) / peak > this.leanBackDrop;
    return { ratio: +(width / this.baseline).toFixed(3), leanBack };
  }
}
export const shoulderWidth = (lm) => (visible(lm?.[P.lShoulder]) && visible(lm?.[P.rShoulder]) ? dist2(lm[P.lShoulder], lm[P.rShoulder]) : NaN);

// ---------------------------------------------------------------- arms (mirror)
// MediaPipe world landmarks: metres, origin between hips, x = image right, y = down, z = away from camera is +.
// Robot body frame: x = robot's left (screen right), y = up, z = toward viewer.
// "Mirror" display: the robot behaves like the user's reflection, so the arm on the
// same screen side moves the same way: body = (x, -y, -z).
export function toRobotFrame(v) { return [v.x, -v.y, -v.z]; }
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export function userArmDirections(world, userSide /* "left" | "right" */) {
  const [s, e, w] = userSide === "left" ? [P.lShoulder, P.lElbow, P.lWrist] : [P.rShoulder, P.rElbow, P.rWrist];
  if (![s, e, w].every((i) => visible(world?.[i], 0.5))) return null;
  return { upper: toRobotFrame(sub(world[e], world[s])), fore: toRobotFrame(sub(world[w], world[e])) };
}

// Reflect a body-frame direction across the robot's sagittal plane (left <-> right).
export const reflectX = (d) => [-d[0], d[1], d[2]];

// Which robot arm shows a given user arm in mirror display (unflipped webcam):
// the user's left arm appears on image right = robot's left (screen right).
export const robotSideForUserArm = (userSide) => (userSide === "left" ? "L" : "R");

// Mirror-therapy mapping: the user moves `healthySide`; the robot shows the *other* arm
// performing the reflected movement, as if the affected arm were moving.
export function mirrorTherapyTarget(world, healthySide) {
  const dirs = userArmDirections(world, healthySide);
  if (!dirs) return null;
  const otherUserSide = healthySide === "left" ? "right" : "left";
  return { robotSide: robotSideForUserArm(otherUserSide), upper: reflectX(dirs.upper), fore: reflectX(dirs.fore) };
}

// Elbow flexion angle (deg) and shoulder elevation (deg from straight down) for ROM logging.
export function armAngles(dirs) {
  if (!dirs) return null;
  const n = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const u = n(dirs.upper), f = n(dirs.fore);
  const elbow = 180 - (Math.acos(Math.min(1, Math.max(-1, u[0] * f[0] + u[1] * f[1] + u[2] * f[2]))) * 180) / Math.PI;
  const elevation = (Math.acos(Math.min(1, Math.max(-1, -u[1]))) * 180) / Math.PI;
  return { elbowDeg: +elbow.toFixed(1), shoulderElevationDeg: +elevation.toFixed(1) };
}

// ---------------------------------------------------------------- lighting
// Mean luma of an RGBA frame sample (0..255): quick venue lighting check.
export function meanLuma(rgba, step = 16) {
  let sum = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4 * step) { sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]; n++; }
  return n ? sum / n : 0;
}
