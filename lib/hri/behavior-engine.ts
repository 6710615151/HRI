// RobotBehavior: controllable behaviour layer for the atlas humanoid (public/teal_v.2.glb).
// Bone names are the raw GLB names; lookups go through the same sanitizer GLTFLoader applies
// ("Arm.R_069" -> "ArmR_069"). See HRI_FEASIBILITY_SPIKE.md for the rig audit behind these choices.
import {
  Color,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Object3D,
  PropertyBinding,
  Quaternion,
  Vector3
} from "three";

export type Side = "L" | "R";
export type Vec = [number, number, number];
export type ArmPose = { upper: Vec; fore: Vec; hand?: Vec; twist?: number };
export type ArmPoseName =
  | "rest"
  | "relaxed"
  | "raise"
  | "waveBase"
  | "wai"
  | "offer"
  | "stopPalm"
  | "shrug"
  | "handOnChest"
  | "point";
export type Expression = "happy" | "neutral" | "concerned" | "calm" | "sorry";
export type Hue = "teal" | "amber" | "blue" | "grey" | "green";
export type RobotEvent = { t: number; type: string; [key: string]: unknown };

export const RIG = {
  head: "Head_06",
  eyes: ["Eye Control.L_010", "Eye Control.R_019"],
  mouth: "Mouth Control_028",
  spineLow: "Spine.001_03",
  chest: "Spine.003_05",
  arm: {
    L: {
      clavicle: "Arm.L_043", shoulder: "Arm.L.001_044", elbow: "Arm Cannon.L_046", wrist: "Arm Hand.L_048",
      handChild: "Arm Hand.L.005_053",
      fingers: [["Arm Hand.L.002_050", "Arm Hand.L.003_051", "Arm Hand.L.004_052"],
                ["Arm Hand.L.006_054", "Arm Hand.L.007_055", "Arm Hand.L.008_056"],
                ["Arm Hand.L.010_058", "Arm Hand.L.011_059", "Arm Hand.L.012_060"]]
    },
    R: {
      clavicle: "Arm.R_069", shoulder: "Arm.R.001_070", elbow: "Arm Cannon.R_072", wrist: "Arm Hand.R_074",
      handChild: "Arm Hand.R.005_079",
      fingers: [["Arm Hand.R.002_076", "Arm Hand.R.003_077", "Arm Hand.R.004_078"],
                ["Arm Hand.R.006_080", "Arm Hand.R.007_081", "Arm Hand.R.008_082"],
                ["Arm Hand.R.010_084", "Arm Hand.R.011_085", "Arm Hand.R.012_086"]]
    }
  }
} as const;

// Body-frame directions (x = robot's left / screen right, y = up, z = toward viewer).
// `s` is +1 for the left arm and -1 for the right arm.
const ARM_POSES: Record<Exclude<ArmPoseName, "rest">, (s: number) => ArmPose> = {
  relaxed: (s) => ({ upper: [0.18 * s, -1, 0.02], fore: [0.08 * s, -1, 0.12], hand: [0.02 * s, -1, 0.1] }),
  raise: (s) => ({ upper: [0.75 * s, 0.6, 0.12], fore: [0.12 * s, 1, 0.08], hand: [0.05 * s, 1, 0.05] }),
  waveBase: (s) => ({ upper: [0.85 * s, 0.25, 0.15], fore: [0.2 * s, 1, 0.12], hand: [0.15 * s, 1, 0.1] }),
  wai: (s) => ({ upper: [0.3 * s, -0.85, 0.42], fore: [-0.82 * s, 0.5, 0.38], hand: [-0.15 * s, 1, 0.12] }),
  offer: (s) => ({ upper: [0.18 * s, -0.35, 0.92], fore: [0.04 * s, -0.05, 1], hand: [0, -0.1, 1] }),
  stopPalm: (s) => ({ upper: [0.22 * s, -0.25, 0.95], fore: [0.06 * s, 0.85, 0.5], hand: [0, 1, -0.15], twist: -1.57 * s }),
  shrug: (s) => ({ upper: [0.32 * s, -0.92, 0.12], fore: [0.85 * s, 0.05, 0.55], hand: [0.9 * s, 0.1, 0.4] }),
  handOnChest: (s) => ({ upper: [0.28 * s, -0.82, 0.48], fore: [-0.78 * s, 0.32, 0.55], hand: [-0.7 * s, 0.4, 0.2] }),
  point: (s) => ({ upper: [0.95 * s, -0.05, 0.3], fore: [0.95 * s, 0.05, 0.3], hand: [0.95 * s, 0.05, 0.3] })
};

type Face = { eyeOpen: number; eyeFlip: number; mouthFlip: number; mouthWidth: number };
const EXPRESSIONS: Record<Expression, Face> = {
  happy: { eyeOpen: 1, eyeFlip: 0, mouthFlip: 0, mouthWidth: 1 },
  neutral: { eyeOpen: 1, eyeFlip: 0, mouthFlip: 0, mouthWidth: 0.45 },
  concerned: { eyeOpen: 0.85, eyeFlip: 1, mouthFlip: 1, mouthWidth: 0.7 },
  calm: { eyeOpen: 0.15, eyeFlip: 0, mouthFlip: 0, mouthWidth: 0.6 },
  sorry: { eyeOpen: 0.7, eyeFlip: 1, mouthFlip: 1, mouthWidth: 0.45 }
};

const HUES: Record<Hue, Vec> = {
  teal: [0, 1, 0.75], amber: [1, 0.62, 0.05], blue: [0.25, 0.55, 1], grey: [0.5, 0.5, 0.5], green: [0.2, 1, 0.3]
};

type Gesture = { kind: "nod" | "shake" | "wave" | "bow" | "blink"; t0: number; dur: number; times?: number; side?: Side; depth?: number };
type ArmState = { pose: ArmPoseName | "custom"; custom: ArmPose | null };
type RestState = { q: Quaternion; p: Vector3; s: Vector3 };

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpDir = new Vector3();
const qA = new Quaternion();
const qB = new Quaternion();
const qDelta = new Quaternion();
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export type RobotStageHandles = {
  model: Object3D;
  robotRoot: Group;
  materials: Record<string, MeshStandardMaterial>;
  baseRootY: number;
};

export class RobotBehavior {
  time = 0;
  paused = false;
  readonly bones = new Map<string, Object3D>();
  private readonly rest = new Map<Object3D, RestState>();
  private readonly restDirs: Record<Side, ArmPose>;
  private readonly armDirs: Record<Side, { upper: Vector3; fore: Vector3; hand: Vector3 }>;
  private readonly screenBase: Color;
  private readonly glowIntensityBase: number;

  state = {
    gaze: new Vector3(), gazeTarget: new Vector3(),
    lean: { pitch: 0, roll: 0 }, leanTarget: { pitch: 0, roll: 0 },
    breathBpm: 14, breathPhase: 0, breathDepth: 1,
    distance: 0, distanceTarget: 0,
    speed: 1,
    glow: 0.5, glowTarget: 0.5, hue: "teal" as Hue,
    face: { ...EXPRESSIONS.happy }, faceTarget: { ...EXPRESSIONS.happy },
    arms: { L: { pose: "rest", custom: null }, R: { pose: "rest", custom: null } } as Record<Side, ArmState>,
    gestures: [] as Gesture[]
  };

  constructor(private readonly stage: RobotStageHandles, private readonly onEvent: (e: RobotEvent) => void = () => {}) {
    stage.model.traverse((child) => {
      if ((child as { isBone?: boolean }).isBone) {
        this.bones.set(child.name, child);
        this.rest.set(child, { q: child.quaternion.clone(), p: child.position.clone(), s: child.scale.clone() });
      }
    });
    const screen = stage.materials.Screen;
    const glow = stage.materials.Glow;
    this.screenBase = screen ? screen.color.clone() : new Color(0, 0.07, 0);
    this.glowIntensityBase = glow ? glow.emissiveIntensity : 1;

    stage.robotRoot.updateMatrixWorld(true);
    const dir = (from: string, to: string): Vec => {
      const p0 = this.b(from).getWorldPosition(new Vector3());
      const p1 = this.b(to).getWorldPosition(new Vector3());
      stage.robotRoot.getWorldQuaternion(qA);
      const v = p1.sub(p0).normalize().applyQuaternion(qA.invert());
      return [v.x, v.y, v.z];
    };
    const measure = (side: Side): ArmPose => {
      const a = RIG.arm[side];
      return { upper: dir(a.shoulder, a.elbow), fore: dir(a.elbow, a.wrist), hand: dir(a.wrist, a.handChild) };
    };
    this.restDirs = { L: measure("L"), R: measure("R") };
    const asVecs = (p: ArmPose) => ({ upper: new Vector3(...p.upper), fore: new Vector3(...p.fore), hand: new Vector3(...(p.hand ?? p.fore)) });
    this.armDirs = { L: asVecs(this.restDirs.L), R: asVecs(this.restDirs.R) };
  }

  private b(glbName: string) {
    const bone = this.bones.get(PropertyBinding.sanitizeNodeName(glbName));
    if (!bone) throw new Error(`Bone not found: ${glbName}`);
    return bone;
  }

  private emit(type: string, detail: Record<string, unknown> = {}) {
    this.onEvent({ t: +this.time.toFixed(3), type, ...detail });
  }

  // ---------- behaviours ----------
  lookAt(x: number, y: number) { this.state.gazeTarget.set(MathUtils.clamp(x, -1, 1), MathUtils.clamp(y, -1, 1), 0); }
  nod(times = 1) { this.state.gestures.push({ kind: "nod", t0: this.time, dur: (0.55 * times) / this.state.speed, times }); this.emit("nod"); }
  shakeHead(times = 1) { this.state.gestures.push({ kind: "shake", t0: this.time, dur: (0.6 * times) / this.state.speed, times }); this.emit("shake"); }
  wave(side: Side = "R", seconds = 2.4) {
    this.state.arms[side] = { pose: "waveBase", custom: null };
    this.state.gestures.push({ kind: "wave", side, t0: this.time, dur: seconds });
    this.emit("wave", { side });
  }
  bow(depth = 0.35, seconds = 1.6) { this.state.gestures.push({ kind: "bow", depth, t0: this.time, dur: seconds / this.state.speed }); this.emit("bow", { depth }); }
  blink() { this.state.gestures.push({ kind: "blink", t0: this.time, dur: 0.18 }); }
  breathe(bpm: number, depth = 1) { this.state.breathBpm = MathUtils.clamp(bpm, 3, 30); this.state.breathDepth = depth; }
  moveArm(side: Side, pose: ArmPoseName) { this.state.arms[side] = { pose, custom: null }; this.emit("arm", { side, pose }); }
  bothArms(pose: ArmPoseName) { this.moveArm("L", pose); this.moveArm("R", pose); }
  setArmDirections(side: Side, upper: Vec, fore: Vec, hand: Vec = fore) { this.state.arms[side] = { pose: "custom", custom: { upper, fore, hand } }; }
  lean(direction: "upright" | "forward" | "back" | "left" | "right" | "slump") {
    const map = { upright: [0, 0], forward: [0.22, 0], back: [-0.2, 0], left: [0, 0.16], right: [0, -0.16], slump: [0.32, 0] } as const;
    const [pitch, roll] = map[direction];
    this.state.leanTarget = { pitch, roll };
    this.emit("lean", { direction });
  }
  setDistance(z: number) { this.state.distanceTarget = MathUtils.clamp(z, -3, 1.8); this.emit("distance", { z: +this.state.distanceTarget.toFixed(2) }); }
  setSpeed(mult: number) { this.state.speed = MathUtils.clamp(mult, 0.25, 2); this.emit("speed", { mult: +this.state.speed.toFixed(2) }); }
  setGlow(level: number, hue: Hue = this.state.hue) { this.state.glowTarget = MathUtils.clamp(level, 0, 1); this.state.hue = hue; this.emit("glow", { level, hue }); }
  expression(name: Expression) { this.state.faceTarget = { ...EXPRESSIONS[name] }; this.emit("expression", { name }); }
  clearGestures() { this.state.gestures = []; }

  // Jump straight to the current targets (no transition). Use once after setting the initial pose,
  // so a freshly loaded robot does not visibly slide out of the model's hands-on-hips rest pose.
  snap() {
    const s = this.state;
    s.gaze.copy(s.gazeTarget);
    s.lean = { ...s.leanTarget };
    s.distance = s.distanceTarget;
    s.glow = s.glowTarget;
    s.face = { ...s.faceTarget };
    for (const side of ["L", "R"] as Side[]) {
      const armState = s.arms[side];
      const sign = side === "L" ? 1 : -1;
      const pose: ArmPose =
        armState.pose === "custom" && armState.custom ? armState.custom
        : armState.pose === "rest" || armState.pose === "custom" ? this.restDirs[side]
        : ARM_POSES[armState.pose](sign);
      const cur = this.armDirs[side];
      cur.upper.set(...pose.upper).normalize();
      cur.fore.set(...pose.fore).normalize();
      cur.hand.set(...(pose.hand ?? pose.fore)).normalize();
    }
  }

  // ---------- frame update ----------
  update(dtRaw: number) {
    const dt = this.paused ? 0 : dtRaw;
    this.time += dt;
    const s = this.state;
    const k = s.speed;

    s.breathPhase += 2 * Math.PI * (s.breathBpm / 60) * dt;
    const breath = Math.sin(s.breathPhase) * s.breathDepth;

    s.gaze.lerp(s.gazeTarget, damp(6 * k, dt));
    s.lean.pitch += (s.leanTarget.pitch - s.lean.pitch) * damp(3 * k, dt);
    s.lean.roll += (s.leanTarget.roll - s.lean.roll) * damp(3 * k, dt);
    s.distance += (s.distanceTarget - s.distance) * damp(1.6 * k, dt);
    s.glow += (s.glowTarget - s.glow) * damp(4, dt);
    for (const key of Object.keys(s.face) as (keyof Face)[]) s.face[key] += (s.faceTarget[key] - s.face[key]) * damp(8, dt);

    let nodX = 0, shakeY = 0, bowX = 0, blink = 0;
    s.gestures = s.gestures.filter((g) => {
      const u = (this.time - g.t0) / g.dur;
      if (u >= 1) {
        if (g.kind === "wave" && g.side) s.arms[g.side] = { pose: "relaxed", custom: null };
        return false;
      }
      const env = Math.sin(Math.PI * u);
      if (g.kind === "nod") nodX += Math.sin(u * Math.PI * 2 * (g.times ?? 1)) * 0.22 * env;
      if (g.kind === "shake") shakeY += Math.sin(u * Math.PI * 2 * (g.times ?? 1)) * 0.3 * env;
      if (g.kind === "bow") bowX += (g.depth ?? 0.35) * env;
      if (g.kind === "blink") blink = Math.max(blink, env);
      return true;
    });
    const waving = s.gestures.find((g) => g.kind === "wave");

    for (const [bone, r] of this.rest) { bone.quaternion.copy(r.q); bone.position.copy(r.p); bone.scale.copy(r.s); }

    this.stage.robotRoot.position.z = s.distance;
    this.stage.robotRoot.position.y = this.stage.baseRootY + breath * 0.02;

    this.b(RIG.spineLow).rotateX(s.lean.pitch + bowX * 0.6).rotateZ(s.lean.roll);
    this.b(RIG.chest).rotateX(bowX * 0.4 - breath * 0.04);

    const head = this.b(RIG.head);
    head.rotateY(s.gaze.x * 0.5 + shakeY);
    head.rotateX(s.gaze.y * 0.3 + nodX + breath * 0.012);

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

    for (const side of ["L", "R"] as Side[]) {
      const sign = side === "L" ? 1 : -1;
      const armState = s.arms[side];
      let pose: ArmPose =
        armState.pose === "custom" && armState.custom ? armState.custom
        : armState.pose === "rest" || armState.pose === "custom" ? this.restDirs[side]
        : ARM_POSES[armState.pose](sign);
      if (waving && waving.side === side) {
        const osc = Math.sin((this.time - waving.t0) * 9) * 0.45;
        pose = { ...pose, fore: [pose.fore[0] + osc * sign, pose.fore[1], pose.fore[2]] };
      }
      this.b(RIG.arm[side].clavicle).rotateZ(-sign * breath * 0.03);
      this.stage.robotRoot.updateMatrixWorld(true);

      const cur = this.armDirs[side];
      const rate = damp(armState.pose === "custom" ? 14 : 5 * k, dt);
      for (const seg of ["upper", "fore", "hand"] as const) {
        const tgt = pose[seg] ?? pose.fore;
        cur[seg].lerp(tmpDir.set(tgt[0], tgt[1], tgt[2]).normalize(), rate).normalize();
      }
      this.applyArm(side, cur.upper, cur.fore, cur.hand, pose.twist ?? 0);
    }

    const [r, g, bl] = HUES[s.hue];
    const screen = this.stage.materials.Screen;
    const glow = this.stage.materials.Glow;
    if (screen) {
      screen.color.setRGB(
        MathUtils.lerp(this.screenBase.r, r * 0.45, s.glow),
        MathUtils.lerp(this.screenBase.g, g * 0.45, s.glow),
        MathUtils.lerp(this.screenBase.b, bl * 0.45, s.glow)
      );
    }
    if (glow) {
      glow.emissive.setRGB(r, g, bl);
      glow.emissiveIntensity = this.glowIntensityBase * (0.15 + s.glow * 0.85);
    }
  }

  private aim(boneName: string, childName: string, dirWorld: Vector3) {
    const bone = this.b(boneName);
    const child = this.b(childName);
    bone.getWorldPosition(tmpA);
    child.getWorldPosition(tmpB);
    const cur = tmpB.sub(tmpA).normalize();
    qDelta.setFromUnitVectors(cur, dirWorld);
    bone.getWorldQuaternion(qA);
    bone.parent!.getWorldQuaternion(qB);
    bone.quaternion.copy(qB.invert().multiply(qDelta.multiply(qA)));
    bone.updateMatrixWorld(true);
  }

  private bodyToWorld(v: Vector3) {
    this.stage.robotRoot.getWorldQuaternion(qA);
    return v.clone().normalize().applyQuaternion(qA);
  }

  private applyArm(side: Side, upper: Vector3, fore: Vector3, hand: Vector3, twist: number) {
    const a = RIG.arm[side];
    this.aim(a.shoulder, a.elbow, this.bodyToWorld(upper));
    this.aim(a.elbow, a.wrist, this.bodyToWorld(fore));
    this.aim(a.wrist, a.handChild, this.bodyToWorld(hand));
    if (twist) this.b(a.wrist).rotateY(twist);
  }
}
