import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyWai, LeanBackDetector, POSE, WaiDetector, type Landmark } from "../lib/hri/signals";
import { describeDistance, newPassportCode, normalizePassportCode, passportSchema } from "../lib/hri/passport";

// Hand-built 2D pose landmarks (normalised image coordinates, y down).
function body(parts: { lw: [number, number]; rw: [number, number]; le: [number, number]; re: [number, number] }): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
  const set = (i: number, [x, y]: [number, number]) => (lm[i] = { x, y, visibility: 0.95 });
  set(POSE.nose, [0.5, 0.25]);
  set(POSE.lShoulder, [0.62, 0.42]);
  set(POSE.rShoulder, [0.38, 0.42]);
  set(POSE.lElbow, parts.le);
  set(POSE.rElbow, parts.re);
  set(POSE.lWrist, parts.lw);
  set(POSE.rWrist, parts.rw);
  return lm;
}

test("wai: chest-height and forehead-height wai are detected", () => {
  assert.equal(classifyWai(body({ lw: [0.52, 0.36], rw: [0.48, 0.36], le: [0.6, 0.55], re: [0.4, 0.55] })).isWai, true);
  assert.equal(classifyWai(body({ lw: [0.52, 0.2], rw: [0.48, 0.2], le: [0.6, 0.4], re: [0.4, 0.4] })).isWai, true);
});

test("wai: hands at the waist, a one-hand wave, and crossed arms are not a wai", () => {
  assert.equal(classifyWai(body({ lw: [0.52, 0.7], rw: [0.48, 0.7], le: [0.62, 0.58], re: [0.38, 0.58] })).isWai, false);
  assert.equal(classifyWai(body({ lw: [0.8, 0.2], rw: [0.36, 0.75], le: [0.72, 0.35], re: [0.37, 0.6] })).isWai, false);
  assert.equal(classifyWai(body({ lw: [0.4, 0.5], rw: [0.6, 0.5], le: [0.64, 0.55], re: [0.36, 0.55] })).isWai, false);
  assert.equal(classifyWai(undefined).isWai, false);
});

test("wai detector: must be held 500 ms, then cools down", () => {
  const d = new WaiDetector(500, 3000);
  const yes = { isWai: true, score: 1 };
  assert.equal(d.update(0, yes).state, "rising");
  assert.equal(d.update(520, yes).state, "fired");
  assert.equal(d.update(600, yes).state, "held");
  d.update(700, { isWai: false, score: 0 });
  d.update(800, yes);
  assert.notEqual(d.update(1400, yes).state, "fired");
});

test("lean-back: a quick drop in apparent shoulder width fires once", () => {
  const l = new LeanBackDetector(0.12, 1500, 2500);
  assert.equal(l.update(0, 0.24), false);
  assert.equal(l.update(500, 0.235), false);
  assert.equal(l.update(900, 0.2), true);
  assert.equal(l.update(1000, 0.17), false, "cooldown");
  assert.equal(l.update(1100, Number.NaN), false);
});

test("passport: schema validates ranges and enums", () => {
  const ok = passportSchema.parse({ comfortDistance: -0.4, speed: 0.5, gaze: "soft", voice: false, language: "th" });
  assert.equal(ok.greeting, "wai");
  assert.throws(() => passportSchema.parse({ comfortDistance: 9, speed: 1, gaze: "soft", voice: true, language: "th" }));
  assert.throws(() => passportSchema.parse({ comfortDistance: 0, speed: 1, gaze: "stare", voice: true, language: "th" }));
});

test("passport: codes are 6 unambiguous characters and normalise from user input", () => {
  for (let i = 0; i < 200; i++) assert.match(newPassportCode(), /^[2-9A-HJKMNP-Z]{6}$/);
  assert.equal(normalizePassportCode(" 7kq-4mz "), "7KQ4MZ");
  assert.equal(describeDistance(1.3).en, "close");
  assert.equal(describeDistance(-0.4).en, "medium");
  assert.equal(describeDistance(-2).th, "ห่าง");
});
