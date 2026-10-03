// Thin browser wrapper around MediaPipe Tasks Vision for the spike.
// Everything runs on-device; frames never leave the browser. Models are served from ./models (offline).
import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs";

const WASM = new URL("./node_modules/@mediapipe/tasks-vision/wasm", import.meta.url).href;
const MODEL = (f) => new URL(`./models/${f}`, import.meta.url).href;

export async function createSensing({ pose = true, face = false, hands = false, delegate = "GPU" } = {}) {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const make = async (Task, file, extra) => {
    try {
      return await Task.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL(file), delegate }, runningMode: "VIDEO", ...extra });
    } catch (err) {
      if (delegate === "CPU") throw err;
      console.warn(`${file}: GPU delegate unavailable, using CPU`, err);
      return Task.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL(file), delegate: "CPU" }, runningMode: "VIDEO", ...extra });
    }
  };
  const tasks = {
    pose: pose ? await make(PoseLandmarker, "pose_landmarker_lite.task", { numPoses: 1 }) : null,
    face: face ? await make(FaceLandmarker, "face_landmarker.task", { numFaces: 1 }) : null,
    hands: hands ? await make(HandLandmarker, "hand_landmarker.task", { numHands: 2 }) : null
  };

  let video = null, stream = null, running = false, listeners = [];
  const stats = { fps: 0, inferMs: 0, frames: 0 };
  let lastT = performance.now();

  async function start(videoEl, constraints = { width: 640, height: 480, facingMode: "user" }) {
    video = videoEl;
    stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    video.srcObject = stream;
    await video.play();
    running = true;
    const loop = () => {
      if (!running) return;
      const now = performance.now();
      const t0 = performance.now();
      const out = { t: now };
      if (tasks.pose) out.pose = tasks.pose.detectForVideo(video, now);
      if (tasks.face) out.face = tasks.face.detectForVideo(video, now);
      if (tasks.hands) out.hands = tasks.hands.detectForVideo(video, now);
      stats.inferMs = stats.inferMs * 0.9 + (performance.now() - t0) * 0.1;
      stats.fps = stats.fps * 0.9 + (1000 / Math.max(1, now - lastT)) * 0.1;
      stats.frames++;
      lastT = now;
      for (const cb of listeners) cb(out, stats);
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(loop); else requestAnimationFrame(loop);
    };
    loop();
  }

  function stop() {
    running = false;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  return { start, stop, onFrame: (cb) => listeners.push(cb), stats, tasks };
}

// Microphone loudness envelope (RMS, 0..1) for the optional audio breathing mode.
export async function createMicEnvelope() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  return {
    read() { analyser.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); },
    stop() { stream.getTracks().forEach((t) => t.stop()); ctx.close(); }
  };
}
