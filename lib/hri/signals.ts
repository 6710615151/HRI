// Body-language signals from MediaPipe Pose landmarks (normalised image coordinates, y down).
// Pure functions; unit-tested in test/hri-signals.test.ts.
export type Landmark = { x: number; y: number; z?: number; visibility?: number };

export const POSE = { nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16 } as const;

const dist2 = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
const visible = (lm: Landmark | undefined, min = 0.5): lm is Landmark => !!lm && (lm.visibility ?? 1) >= min;

export type WaiFrame = { isWai: boolean; score: number; wristGap?: number };

// A wai: both hands together, centred, between forehead and upper chest, wrists above elbows.
export function classifyWai(lm: Landmark[] | undefined): WaiFrame {
  const ls = lm?.[POSE.lShoulder], rs = lm?.[POSE.rShoulder], lw = lm?.[POSE.lWrist], rw = lm?.[POSE.rWrist];
  const le = lm?.[POSE.lElbow], re = lm?.[POSE.rElbow], nose = lm?.[POSE.nose];
  if (!(visible(ls, 0.4) && visible(rs, 0.4) && visible(lw, 0.4) && visible(rw, 0.4) && visible(le, 0.4) && visible(re, 0.4) && visible(nose, 0.4))) {
    return { isWai: false, score: 0 };
  }
  const sw = dist2(ls, rs);
  if (sw < 1e-3) return { isWai: false, score: 0 };
  const shoulderY = (ls.y + rs.y) / 2;
  const midX = (ls.x + rs.x) / 2;
  const wristGap = dist2(lw, rw) / sw;
  const handsY = (lw.y + rw.y) / 2;
  const handsX = (lw.x + rw.x) / 2;
  const checks = [
    wristGap < 0.45,
    Math.abs(handsX - midX) / sw < 0.4,
    handsY > nose.y - 0.35 * sw && handsY < shoulderY + 0.75 * sw,
    lw.y < le.y && rw.y < re.y
  ];
  const passed = checks.filter(Boolean).length;
  return { isWai: passed === 4, score: passed / 4, wristGap: +wristGap.toFixed(2) };
}

// The wai must be held (default 500 ms) to count, then a cooldown prevents repeat triggers.
export class WaiDetector {
  private since: number | null = null;
  private lastFire = -Infinity;
  constructor(private readonly holdMs = 500, private readonly cooldownMs = 3000) {}
  update(tMs: number, frame: WaiFrame): { state: "none" | "rising" | "held" | "fired"; progress: number } {
    if (!frame.isWai) { this.since = null; return { state: "none", progress: 0 }; }
    if (this.since === null) this.since = tMs;
    const progress = Math.min(1, (tMs - this.since) / this.holdMs);
    if (progress >= 1 && tMs - this.lastFire > this.cooldownMs) { this.lastFire = tMs; return { state: "fired", progress }; }
    return { state: progress >= 1 ? "held" : "rising", progress };
  }
}

export const shoulderWidth = (lm: Landmark[] | undefined) =>
  visible(lm?.[POSE.lShoulder]) && visible(lm?.[POSE.rShoulder]) ? dist2(lm![POSE.lShoulder], lm![POSE.rShoulder]) : NaN;

// Lean-back: apparent shoulder width drops quickly (>12% within 1.5 s) relative to the recent peak.
export class LeanBackDetector {
  private hist: { t: number; w: number }[] = [];
  private lastFire = -Infinity;
  constructor(private readonly drop = 0.12, private readonly windowMs = 1500, private readonly cooldownMs = 2500) {}
  update(tMs: number, width: number) {
    if (!Number.isFinite(width) || width <= 0) return false;
    this.hist.push({ t: tMs, w: width });
    while (this.hist.length && this.hist[0].t < tMs - this.windowMs) this.hist.shift();
    const peak = Math.max(...this.hist.map((h) => h.w));
    const fired = (peak - width) / peak > this.drop && tMs - this.lastFire > this.cooldownMs;
    if (fired) { this.lastFire = tMs; this.hist = [{ t: tMs, w: width }]; }
    return fired;
  }
}
