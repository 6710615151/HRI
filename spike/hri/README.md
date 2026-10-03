# HRI feasibility spike (isolated)

Throwaway prototypes for choosing the hackathon concept. **Not part of the Next.js app.** Nothing under `app/`, `lib/`, `prisma/` or `public/` was changed. Delete this folder to remove it.

The report is `../../HRI_FEASIBILITY_SPIKE.md`.

## Run

```bash
cd spike/hri
npm install          # three 0.185.1 (same as the app) + @mediapipe/tasks-vision 1.0.1, local to this folder
npm run models       # downloads 3 MediaPipe models (~17 MB) into ./models for offline use
npm test             # signal-processing unit tests (node:test)
npm run serve        # serves the repo root on http://localhost:8787
```

Then open:

| Page | What it is |
|---|---|
| `http://localhost:8787/spike/hri/concepts.html` | The five concept prototypes (A–E) with manual controls, optional camera, interaction log |
| `http://localhost:8787/spike/hri/sensing-lab.html` | Venue check: lighting, fps, pose/face presence, proximity, lean-back, wai detector, breathing estimate, arm angles |
| `http://localhost:8787/spike/hri/engine-sheet.html` | Headless render harness for the behaviour engine (used for the screenshots in `evidence/`) |
| `http://localhost:8787/spike/hri/bone-explorer.html` | Per-bone axis sweeps of `public/teal_v.2.glb` |

The camera needs `localhost` or HTTPS. All sensing runs on-device; frames are never uploaded or stored.

## Files

| File | Purpose |
|---|---|
| `stage.js` | Loads the GLB with the same camera, lights and fit as `app/components/RobotViewer.tsx`; sanitised bone lookup |
| `behavior-engine.js` | `RobotBehavior`: idle, lookAt, nod, shakeHead, wave, bow, breathe, raiseHand, moveArm, setArmDirections, curlFingers, lean, setDistance, setSpeed, setGlow, expression, pause, reset |
| `signals.js` | Pure functions: breathing-rate estimator, wai classifier and detector, proximity and lean-back, mirror arm mapping, arm angles, luma |
| `sensing.js` | MediaPipe Pose/Face/Hand wrapper and mic envelope |
| `tests/signals.test.mjs` | Algorithm tests on constructed inputs with known ground truth (not camera accuracy) |
| `evidence/` | Rendered contact sheets referenced by the report |
