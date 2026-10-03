// Browser-only pose sensing for the Living Lab. Runs on-device: frames are never uploaded or stored.
// Model and WASM files are served from /public/mediapipe so the camera works without internet.
import type { Landmark } from "@/lib/hri/signals";

export type PoseFrame = { tMs: number; landmarks: Landmark[] | null; fps: number };

export async function startPoseCamera(video: HTMLVideoElement, onFrame: (frame: PoseFrame) => void) {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const create = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate },
      runningMode: "VIDEO",
      numPoses: 1
    });
  let landmarker;
  try {
    landmarker = await create("GPU");
  } catch {
    landmarker = await create("CPU");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
  video.srcObject = stream;
  await video.play();

  let running = true;
  let fps = 0;
  let last = performance.now();
  const loop = () => {
    if (!running) return;
    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);
    fps = fps * 0.9 + (1000 / Math.max(1, now - last)) * 0.1;
    last = now;
    onFrame({ tMs: now, landmarks: (result.landmarks?.[0] as Landmark[] | undefined) ?? null, fps });
    if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(loop);
    else requestAnimationFrame(loop);
  };
  loop();

  return () => {
    running = false;
    stream.getTracks().forEach((track) => track.stop());
    landmarker.close();
  };
}
