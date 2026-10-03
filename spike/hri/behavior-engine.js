// RobotBehavior — feasibility-spike behaviour engine for public/teal_v.2.glb.
// Framework-agnostic: needs a stage from stage.js (scene, robotRoot, bone()).
// Every bone below was verified by rendering (see HRI_FEASIBILITY_SPIKE.md §1).
import { MathUtils, Quaternion, Vector3 } from "three";

export const RIG = {
  head: "Head_06",
  eyes: ["Eye Control.L_010", "Eye Control.R_019"],
  mouth: "Mouth Control_028",
  spineLow: "Spine.001_03",
  chest: "Spine.003_05",
  arm: {
    // side: L = robot's left (screen right when facing camera), R = robot's right (screen left)
    L: { clavicle: "Arm.L_043", shoulder: "Arm.L.001_044", elbow: "Arm Cannon.L_046", wrist: "Arm Hand.L_048",
         elbowChild: "Arm Cannon.L_046", wristChild: "Arm Hand.L_048", handChild: "Arm Hand.L.005_053",
         fingers: [["Arm Hand.L.002_050", "Arm Hand.L.003_051", "Arm Hand.L.004_052"],
                   ["Arm Hand.L.006_054", "Arm Hand.L.007_055", "Arm Hand.L.008_056"],
                   ["Arm Hand.L.010_058", "Arm Hand.L.011_059", "Arm Hand.L.012_060"]] },
    R: { clavicle: "Arm.R_069", shoulder: "Arm.R.001_070", elbow: "Arm Cannon.R_072", wrist: "Arm Hand.R_074",
         elbowChild: "Arm Cannon.R_072", wristChild: "Arm Hand.R_074", handChild: "Arm Hand.R.005_079",
         fingers: [["Arm Hand.R.002_076", "Arm Hand.R.003_077", "Arm Hand.R.004_078"],
                   ["Arm Hand.R.006_080", "Arm Hand.R.007_081", "Arm Hand.R.008_082"],
                   ["Arm Hand.R.010_084", "Arm Hand.R.011_085", "Arm Hand.R.012_086"]] }
  }
};

// Arm poses as body-frame directions (x = robot's left, y = up, z = toward viewer).
// `s` is +1 for the left arm, -1 for the right arm so one table serves both sides.
// upper = shoulder→elbow, fore = elbow→wrist, hand = wrist→knuckles, twist = palm roll (rad).
export const ARM_POSES = {
  rest: null, // the model's own rest pose (hands on hips)
  relaxed: (s) => ({ upper: [0.18 * s, -1, 0.02], fore: [0.08 * s, -1, 0.12], hand: [0.02 * s, -1, 0.1], twist: 0 }),
  raise: (s) => ({ upper: [0.75 * s, 0.6, 0.12], fore: [0.12 * s, 1, 0.08], hand: [0.05 * s, 1, 0.05], twist: 0 }),
  waveBase: (s) => ({ upper: [0.85 * s, 0.25, 0.15], fore: [0.2 * s, 1, 0.12], hand: [0.15 * s, 1, 0.1], twist: 0 }),
  wai: (s) => ({ upper: [0.3 * s, -0.85, 0.42], fore: [-0.82 * s, 0.5, 0.38], hand: [-0.15 * s, 1, 0.12], twist: 0 }),
  offer: (s) => ({ upper: [0.18 * s, -0.35, 0.92], fore: [0.04 * s, -0.05, 1], hand: [0.0, -0.1, 1], twist: 0 }),
  stopPalm: (s) => ({ upper: [0.22 * s, -0.25, 0.95], fore: [0.06 * s, 0.85, 0.5], hand: [0.0, 1, -0.15], twist: -1.57 * s }),
  shrug: (s) => ({ upper: [0.32 * s, -0.92, 0.12], fore: [0.85 * s, 0.05, 0.55], hand: [0.9 * s, 0.1, 0.4], twist: 0 }),
  handOnChest: (s) => ({ upper: [0.28 * s, -0.82, 0.48], fore: [-0.78 * s, 0.32, 0.55], hand: [-0.7 * s, 0.4, 0.2], twist: 0 }),
  point: (s) => ({ upper: [0.95 * s, -0.05, 0.3], fore: [0.95 * s, 0.05, 0.3], hand: [0.95 * s, 0.05, 0.3], twist: 0 })
};

const EXPRESSIONS = {
  happy:     { eyeOpen: 1, eyeFlip: 0, mouthFlip: 0, mouthWidth: 1 },
  neutral:   { eyeOpen: 1, eyeFlip: 0, mouthFlip: 0, mouthWidth: 0.45 },
  concerned: { eyeOpen: 0.85, eyeFlip: 1, mouthFlip: 1, mouthWidth: 0.7 },
  calm:      { eyeOpen: 0.15, eyeFlip: 0, mouthFlip: 0, mouthWidth: 0.6 },
  sorry:     { eyeOpen: 0.7, eyeFlip: 1, mouthFlip: 1, mouthWidth: 0.45 }
};

const tmpA = new Vector3(), tmpB = new Vector3(), tmpDir = new Vector3();
const qA = new Quaternion(), qB = new Quaternion(), qDelta = new Quaternion();
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export class RobotBehavior {
  constructor(stage, { onEvent } = {}) {
    this.stage = stage;
    this.onEvent = onEvent ?? (() => {});
    this.b = (n) => {
      const bone = stage.bone(n);
      if (!bone) throw new Error(`Bone not found: ${n}`);
      return bone;
    };
    this.rest = new Map();
    stage.model.traverse((c) => { if (c.isBone) this.rest.set(c, { q: c.quaternion.clone(), p: c.position.clone(), s: c.scale.clone() }); });

    const screen = stage.materials.Screen, glow = stage.materials.Glow;
    this.screenBase = screen.color.clone();
    this.glowBase = glow.emissive.clone();
    this.glowIntensityBase = glow.emissiveIntensity;

    this.time = 0;
    this.state = {
      gaze: new Vector3(0, 0, 0), gazeTarget: new Vector3(0, 0, 0),
      lean: { pitch: 0, roll: 0 }, leanTarget: { pitch: 0, roll: 0 },
      breathBpm: 14, breathPhase: 0, breathDepth: 1, breathGlow: false,
      distance: 0, distanceTarget: 0,           // robotRoot z (positive = closer to viewer)
      speed: 1,                                  // global motion-speed multiplier (B: "too fast")
      glow: 0.5, glowTarget: 0.5, hue: "teal",
      face: { ...EXPRESSIONS.happy }, faceTarget: { ...EXPRESSIONS.happy },
      arms: { L: { pose: "rest", custom: null }, R: { pose: "rest", custom: null } },
      fingerCurl: { L: 0, R: 0 },
      gestures: []                               // transient: nod, shake, wave, blink, bow
    };
    this.paused = false;

    // Measure the rest pose's arm directions (body frame) so "rest" can be blended like any other pose.
    stage.scene.updateMatrixWorld(true);
    this.restDirs = {};
    this.armDirs = {};
    for (const side of ["L", "R"]) {
      const a = RIG.arm[side];
      const dir = (from, to) => {
        const p0 = this.b(from).getWorldPosition(new Vector3()), p1 = this.b(to).getWorldPosition(new Vector3());
        stage.robotRoot.getWorldQuaternion(qA);
        const v = p1.sub(p0).normalize().applyQuaternion(qA.invert());
        return [v.x, v.y, v.z];
      };
      this.restDirs[side] = { upper: dir(a.shoulder, a.elbowChild), fore: dir(a.elbow, a.wristChild), hand: dir(a.wrist, a.handChild), twist: 0 };
      this.armDirs[side] = { upper: new Vector3(...this.restDirs[side].upper), fore: new Vector3(...this.restDirs[side].fore), hand: new Vector3(...this.restDirs[side].hand) };
    }
  }

  emit(type, detail = {}) { this.onEvent({ t: +this.time.toFixed(3), type, ...detail }); }

  // ---------- public API (Step 2 list) ----------
  idle() { this.state.gazeTarget.set(0, 0, 0); this.moveArm("L", "rest"); this.moveArm("R", "rest"); this.lean("upright"); this.expression("happy"); this.emit("idle"); }
  lookAt(x, y) { this.state.gazeTarget.set(MathUtils.clamp(x, -1, 1), MathUtils.clamp(y, -1, 1), 0); }
  nod(times = 2) { this.state.gestures.push({ kind: "nod", t0: this.time, dur: 0.55 * times / this.state.speed, times }); this.emit("nod"); }
  shakeHead(times = 2) { this.state.gestures.push({ kind: "shake", t0: this.time, dur: 0.6 * times / this.state.speed, times }); this.emit("shake"); }
  wave(side = "R", seconds = 2.4) {
    this.state.arms[side] = { pose: "waveBase", custom: null };
    this.state.gestures.push({ kind: "wave", side, t0: this.time, dur: seconds });
    this.emit("wave", { side });
  }
  bow(depth = 0.35, seconds = 1.6) { this.state.gestures.push({ kind: "bow", depth, t0: this.time, dur: seconds / this.state.speed }); this.emit("bow", { depth }); }
  blink() { this.state.gestures.push({ kind: "blink", t0: this.time, dur: 0.18 }); }
  breathe(bpm, depth = 1, glow = false) { this.state.breathBpm = MathUtils.clamp(bpm, 3, 30); this.state.breathDepth = depth; this.state.breathGlow = glow; this.emit("breathe", { bpm: this.state.breathBpm }); }
  raiseHand(side = "R") { this.moveArm(side, "raise"); }
  moveArm(side, pose) {
    if (!(pose in ARM_POSES)) throw new Error(`Unknown arm pose ${pose}`);
    this.state.arms[side] = { pose, custom: null };
    this.emit("arm", { side, pose });
  }
  // Direct per-frame arm control (mirror therapy). Directions in body frame.
  setArmDirections(side, upper, fore, hand = fore) {
    this.state.arms[side] = { pose: "custom", custom: { upper, fore, hand, twist: 0 } };
  }
  curlFingers(side, amount) { this.state.fingerCurl[side] = MathUtils.clamp(amount, 0, 1); }
  lean(direction) {
    const map = { upright: [0, 0], forward: [0.22, 0], back: [-0.2, 0], left: [0, 0.16], right: [0, -0.16], slump: [0.32, 0] };
    const [pitch, roll] = map[direction] ?? [0, 0];
    this.state.leanTarget = { pitch, roll };
    this.emit("lean", { direction });
  }
  setDistance(z) { this.state.distanceTarget = MathUtils.clamp(z, -3, 1.8); this.emit("distance", { z: this.state.distanceTarget }); }
  setSpeed(mult) { this.state.speed = MathUtils.clamp(mult, 0.25, 2); this.emit("speed", { mult: this.state.speed }); }
  setGlow(level, hue = this.state.hue) { this.state.glowTarget = MathUtils.clamp(level, 0, 1); this.state.hue = hue; this.emit("glow", { level, hue }); }
  expression(name) { if (EXPRESSIONS[name]) { this.state.faceTarget = { ...EXPRESSIONS[name] }; this.emit("expression", { name }); } }
  pause(on = true) { this.paused = on; this.emit(on ? "pause" : "resume"); }
  reset() {
    for (const [bone, r] of this.rest) { bone.quaternion.copy(r.q); bone.position.copy(r.p); bone.scale.copy(r.s); }
    const s = this.state;
    s.gaze.set(0, 0, 0); s.gazeTarget.set(0, 0, 0); s.lean = { pitch: 0, roll: 0 }; s.leanTarget = { pitch: 0, roll: 0 };
    s.distance = 0; s.distanceTarget = 0; s.speed = 1; s.gestures = []; s.fingerCurl = { L: 0, R: 0 };
    s.arms = { L: { pose: "rest", custom: null }, R: { pose: "rest", custom: null } };
    s.face = { ...EXPRESSIONS.happy }; s.faceTarget = { ...EXPRESSIONS.happy };
    s.glow = s.glowTarget = 0.5; s.hue = "teal"; s.breathBpm = 14; s.breathDepth = 1; s.breathGlow = false;
    this.stage.robotRoot.position.z = 0;
    this.emit("reset");
  }
  // Breath phase in [0,1): 0..0.5 inhale, 0.5..1 exhale. Exposed for UI/logging.
  get breathPhase() { return (this.state.breathPhase / (2 * Math.PI)) % 1; }

  // Advance the engine deterministically (tests and screenshots).
  settle(seconds = 2, fps = 60) { for (let i = 0; i < seconds * fps; i++) this.update(1 / fps); }

  // ---------- frame update ----------
  update(dt) {
    if (this.paused) dt = 0;
    this.time += dt;
    const s = this.state, k = s.speed;

    s.breathPhase += 2 * Math.PI * (s.breathBpm / 60) * dt;
    const breath = Math.sin(s.breathPhase) * s.breathDepth; // +1 = full inhale

    s.gaze.lerp(s.gazeTarget, damp(6 * k, dt));
    s.lean.pitch += (s.leanTarget.pitch - s.lean.pitch) * damp(3 * k, dt);
    s.lean.roll += (s.leanTarget.roll - s.lean.roll) * damp(3 * k, dt);
    s.distance += (s.distanceTarget - s.distance) * damp(1.6 * k, dt);
    s.glow += (s.glowTarget - s.glow) * damp(4, dt);
    for (const key of Object.keys(s.face)) s.face[key] += (s.faceTarget[key] - s.face[key]) * damp(8, dt);

    // Transient gestures
    let nodX = 0, shakeY = 0, bowX = 0, blink = 0;
    s.gestures = s.gestures.filter((g) => {
      const u = (this.time - g.t0) / g.dur;
      if (u >= 1) { if (g.kind === "wave") this.state.arms[g.side] = { pose: "rest", custom: null }; return false; }
      const env = Math.sin(Math.PI * u);
      if (g.kind === "nod") nodX += Math.sin(u * Math.PI * 2 * g.times) * 0.22 * env;
      if (g.kind === "shake") shakeY += Math.sin(u * Math.PI * 2 * g.times) * 0.3 * env;
      if (g.kind === "bow") bowX += g.depth * env;
      if (g.kind === "blink") blink = Math.max(blink, env);
      return true;
    });
    const waving = s.gestures.find((g) => g.kind === "wave");

    // Reset all controlled bones to rest, then layer.
    for (const [bone, r] of this.rest) { bone.quaternion.copy(r.q); bone.position.copy(r.p); bone.scale.copy(r.s); }

    // Root distance (approach / retreat)
    this.stage.robotRoot.position.z = s.distance;

    // Spine: lean + bow + breathing (chest rises on inhale)
    const spine = this.b(RIG.spineLow), chest = this.b(RIG.chest);
    spine.rotateX(s.lean.pitch + bowX * 0.6);
    spine.rotateZ(s.lean.roll);
    chest.rotateX(bowX * 0.4 - breath * 0.05);
    this.stage.robotRoot.position.y = -0.52 + breath * 0.025 * s.breathDepth;

    // Head: gaze (yaw/pitch) + nod/shake
    const head = this.b(RIG.head);
    head.rotateY(s.gaze.x * 0.5 + shakeY);
    head.rotateX(s.gaze.y * 0.3 + nodX + breath * 0.015);

    // Face: eyes follow gaze on the LED screen, open/close, arc flip; mouth flip/width
    const open = Math.max(0.08, s.face.eyeOpen * (1 - blink * 0.92));
    for (const name of RIG.eyes) {
      const e = this.b(name);
      e.position.x += s.gaze.x * 0.009;
      e.position.y += -s.gaze.y * 0.006;
      e.scale.z = open;
      if (s.face.eyeFlip > 0.5) e.rotateY(Math.PI);
    }
    const mouth = this.b(RIG.mouth);
    mouth.scale.x = s.face.mouthWidth;
    if (s.face.mouthFlip > 0.5) mouth.rotateY(Math.PI);

    // Arms
    this.stage.scene.updateMatrixWorld(true);
    for (const side of ["L", "R"]) {
      const sign = side === "L" ? 1 : -1;
      const armState = s.arms[side];
      let pose = armState.pose === "custom" ? armState.custom
        : armState.pose === "rest" ? this.restDirs[side]
        : ARM_POSES[armState.pose](sign);
      if (pose && waving && waving.side === side) {
        const osc = Math.sin((this.time - waving.t0) * 9) * 0.45;
        pose = { ...pose, fore: [pose.fore[0] + osc * sign, pose.fore[1], pose.fore[2]] };
      }
      // Breathing lifts the clavicles slightly.
      this.b(RIG.arm[side].clavicle).rotateZ(-sign * breath * 0.04);
      this.stage.scene.updateMatrixWorld(true);
      // Blend current directions toward the target (direct control uses a faster rate).
      const cur = this.armDirs[side];
      const rate = damp(armState.pose === "custom" ? 14 : 5 * k, dt);
      for (const seg of ["upper", "fore", "hand"]) {
        const tgt = pose[seg] ?? pose.fore;
        cur[seg].lerp(tmpDir.set(tgt[0], tgt[1], tgt[2]).normalize(), rate).normalize();
      }
      this.applyArm(side, { upper: cur.upper.toArray(), fore: cur.fore.toArray(), hand: cur.hand.toArray(), twist: pose.twist });
      this.applyFingers(side, s.fingerCurl[side]);
    }

    // Glow: Screen tint carries most of the signal (the Glow material is two small LEDs).
    const hues = { teal: [0, 1, 0.75], amber: [1, 0.62, 0.05], blue: [0.25, 0.55, 1], grey: [0.5, 0.5, 0.5], green: [0.2, 1, 0.3] };
    const [r, g, bl] = hues[s.hue] ?? hues.teal;
    const screen = this.stage.materials.Screen, glow = this.stage.materials.Glow;
    const lvl = s.glow;
    screen.color.setRGB(
      MathUtils.lerp(this.screenBase.r, r * 0.45, lvl), MathUtils.lerp(this.screenBase.g, g * 0.45, lvl), MathUtils.lerp(this.screenBase.b, bl * 0.45, lvl));
    glow.emissive.setRGB(r, g, bl);
    // In breathing sessions the face brightness follows the breath (brighter on inhale).
    const pulse = s.breathGlow ? 0.5 + 0.5 * breath : 1;
    screen.color.multiplyScalar(s.breathGlow ? 0.55 + 0.45 * pulse : 1);
    glow.emissiveIntensity = this.glowIntensityBase * (0.15 + lvl * 0.85) * pulse;
  }

  // Swing-aim a bone so the direction to `childName` matches a world direction.
  aim(boneName, childName, dirWorld) {
    const bone = this.b(boneName), child = this.b(childName);
    bone.getWorldPosition(tmpA);
    child.getWorldPosition(tmpB);
    const cur = tmpB.sub(tmpA).normalize();
    qDelta.setFromUnitVectors(cur, dirWorld);
    bone.getWorldQuaternion(qA);
    bone.parent.getWorldQuaternion(qB);
    bone.quaternion.copy(qB.invert().multiply(qDelta.multiply(qA)));
    bone.updateMatrixWorld(true);
  }

  bodyToWorld(v) {
    this.stage.robotRoot.getWorldQuaternion(qA);
    return tmpDir.set(v[0], v[1], v[2]).normalize().applyQuaternion(qA).clone();
  }

  applyArm(side, pose) {
    const a = RIG.arm[side];
    this.aim(a.shoulder, a.elbowChild, this.bodyToWorld(pose.upper));
    this.aim(a.elbow, a.wristChild, this.bodyToWorld(pose.fore));
    this.aim(a.wrist, a.handChild, this.bodyToWorld(pose.hand ?? pose.fore));
    if (pose.twist) this.b(a.wrist).rotateY(pose.twist);
  }

  applyFingers(side, curl) {
    if (!curl) return;
    for (const finger of RIG.arm[side].fingers) for (const n of finger) this.b(n).rotateX(curl * 0.55);
  }
}
