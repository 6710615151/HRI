// Downloads MediaPipe model files into ./models so the spike runs without venue internet.
import { mkdir, writeFile, stat } from "node:fs/promises";

const base = "https://storage.googleapis.com/mediapipe-models";
const models = {
  "pose_landmarker_lite.task": `${base}/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`,
  "hand_landmarker.task": `${base}/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task`,
  "face_landmarker.task": `${base}/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`
};

await mkdir(new URL("./models/", import.meta.url), { recursive: true });
for (const [name, url] of Object.entries(models)) {
  const target = new URL(`./models/${name}`, import.meta.url);
  try {
    await stat(target);
    console.log(`have ${name}`);
    continue;
  } catch {}
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  console.log(`saved ${name}`);
}
