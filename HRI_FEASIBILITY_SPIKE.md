# HRI Feasibility Spike

> **Scope:** a technical feasibility spike on finalists A–E from [HRI_HACKATHON_RESEARCH.md](HRI_HACKATHON_RESEARCH.md). It scores technical feasibility only, not novelty or preference.
> **Date:** 2026-10-04 · **Repo:** HumanoidTH @ `bef80bd` · **Test machine:** Apple A18 Pro laptop, Chromium 149 (Playwright headless shell, Metal GPU)
> **Isolation:** all prototype code is in [spike/hri/](spike/hri/). **No tracked file was modified** (`git diff` is empty). Remove the spike with `rm -rf spike/`.
>
> **Evidence labels**
> - **TESTED**: run or rendered in this spike, with output or images in `spike/hri/evidence/`.
> - **LOGIC-TESTED**: algorithm verified on constructed inputs with known ground truth (unit tests). It says nothing about camera accuracy on real people.
> - **UNKNOWN**: could not be tested here. Above all, **no camera test with a real human was possible in this environment.**

---

## 0. Headline findings

1. **The production robot's eye tracking and welcome wave never run.**
   - Three.js's `GLTFLoader` sanitises node names: `"Arm.R_069"` becomes `"ArmR_069"` and `"Eye Control.L_010"` becomes `"Eye_ControlL_010"`.
   - [RobotViewer.tsx:22-23, 151-167](app/components/RobotViewer.tsx#L22-L23) compares against the *raw* GLB names.
   - Loading the model with the same loader and running the same lookups: `Head_06` → found; both eye controls and all three arm bones → **not found** (TESTED).
   - So today only head-follow, breathing and idle sway actually work, and the README's "interactive welcoming wave" is dead code. This is a free, verifiable "fix" item.
2. **The rig is fully controllable.**
   - It is one skinned mesh with 112 joints.
   - The head, spine, both arms (shoulder, elbow, wrist with twist) and fingers deform cleanly.
   - The LED-screen face has bone-driven eyes and mouth: blink, gaze shift, smile/frown and droopy eyes all work.
   - Approach and retreat (root translation) read very clearly on screen.
   - A world-space "aim" solver made arm posing axis-agnostic, so the team does not need to reverse-engineer bone axes (TESTED, renders in `evidence/`).
3. **The model's rest pose is hands-on-hips**, which is impolite or confrontational in Thai etiquette. Any Thai-facing concept should replace it with a relaxed pose (done in the spike).
4. **The embedded animation clip includes the arm-cannon "firing" sequence** and is unsuitable for a wellness demo. The cannon and shield parts stay hidden as long as `Arm Cannon.*.004` and `Gun Shield.*` bones are not touched.
5. **Browser sensing runs offline and fast enough.**
   - Pose plus face landmarkers together run at about **22 ms per frame (about 20 fps)** with the GPU delegate.
   - Models load from local files with **zero external requests**.
   - There are no false person detections on a non-human feed (TESTED).
   - **Accuracy on real people at a venue is UNKNOWN.** A go/no-go test protocol is in §3.4.
6. **The breathing estimator only reaches a trustworthy number after about 15–20 s, and it lags guided changes by about 15–20 s** (LOGIC-TESTED). The first version also reported confident rates from pure noise; it was fixed and now reports **0 false confident rates in 50 noise traces**.
7. **Atlas evidence confidence is narrow.**
   - Every robot record in the seed JSON has confidence 0.72–0.95, and no source record is below 0.6.
   - The only genuinely weak record reachable in the database is NAO at 0.45, hard-coded in [lib/seed-importer.ts](lib/seed-importer.ts).
   - Concept A therefore needs the "no record in the atlas" tier to show real contrast.

---

## 1. Robot Model Capabilities

### 1.1 How the model is structured (TESTED: GLB parsed in Node, rendered in Chromium)

- **Source:** `public/teal_v.2.glb` (7.3 MB, Sketchfab export). The `Armature.006` node carries scale ×100 and a −90° X rotation.
- **Meshes:** 5 skinned primitives on **one skin with 112 joints**:
  - `Teal_Metal` (10,000 vertices)
  - `Teal_Plastic_A` (5,476)
  - `Teal_Plastic_B` (3,350)
  - `Glow` (288)
  - `Screen` (60)
- **Cameras:** none in the file; the app defines its own.
- **Materials:** `Screen` (textured LED face), `Glow` (emissive yellow, `KHR_materials_emissive_strength` = 10), `Teal_Metal`, `Teal_Plastic_A`, `Teal_Plastic_B`.
- **Animation:** 1 clip, 9.54 s, 317 channels on 110 joints, titled *"I dont know, nothing works…"*. Frames show a T-pose, a peace sign, then the **arm cannon deploying and firing**, a crouch, a relaxed stance and a point ([evidence/embedded-clip.png](spike/hri/evidence/embedded-clip.png)).
- **Names at runtime differ from the GLB**: dots are removed and spaces become underscores. Look bones up with `PropertyBinding.sanitizeNodeName()`, as `spike/hri/stage.js` does.
- **Hierarchy notes that matter:**
  - Legs are children of `Spine_02` (pelvis), so leaning must use `Spine.001` or higher, or the legs swing.
  - `Arm.X.001` has **0 vertex weights**. It is the shoulder ball pivot, not an elbow (the production code calls it "elbow").
  - The real elbow is `Arm Cannon.X_046/072`. The wrist is `Arm Hand.X_048/074`.
  - Each hand has 3 fingers × 3 joints plus a 5-bone thumb, and every phalanx is weighted.
  - Eyes are rings of 8 bones under `Eye Control.X`.
  - The mouth is a 12-bone curve under `Mouth Control` (which itself has 0 weight).

### 1.2 Capability table

"Production today" describes what `RobotViewer.tsx` actually achieves. "Direct control" means the spike controlled it and verified the result visually.

| Capability | Available? | Production today | Can control directly? | Difficulty | Evidence |
|---|---|---|---|---|---|
| **HEAD** pitch/yaw/roll (`Head_06`) | Yes | Works (pointer follow, idle) | Yes: +x nods down, ±y turns, ±z tilts | 1 | [sweep-head.png](spike/hri/evidence/sweep-head.png) |
| **EYES**: gaze shift on screen (`Eye Control.L/R` position x/y) | Yes | **Broken** (name mismatch: rotation code never runs) | Yes | 1 | [face-controls.png](spike/hri/evidence/face-controls.png) |
| EYES: blink / close (scale z) | Yes | No | Yes: becomes a horizontal line | 1 | same |
| EYES: shape (flip arc via rotate-y π) | Yes | No | Yes: "droopy/concerned" eyes | 1 | same |
| **MOUTH**: smile ↔ frown (rotate `Mouth Control` y π) | Yes | No | Yes | 1 | same |
| MOUTH: width (scale x) / height (scale z) | Yes | No | Yes: neutral small mouth, tall "W" | 1 | same |
| MOUTH: lip-sync visemes | Partial | No | Approximation only (open/close via scale); no phoneme shapes | 3 | INFERENCE |
| **SPINE**: lean forward/back/side (`Spine.001`), chest (`Spine.003`) | Yes | Root sway only | Yes | 1 | [sweep-spine.png](spike/hri/evidence/sweep-spine.png) |
| SPINE: bow | Yes | No | Yes (lean + chest) | 1 | [engine-poses.png](spike/hri/evidence/engine-poses.png) |
| **SHOULDERS**: clavicle lift / shrug (`Arm.X_043/069`) | Yes | **Broken** (wave targets this) | Yes | 2 | [sweep-shoulder-R.png](spike/hri/evidence/sweep-shoulder-R.png) |
| **UPPER ARMS** (pivot `Arm.X.001`, aimed to elbow) | Yes | Broken | Yes, via aim solver | 2 | [engine-api.png](spike/hri/evidence/engine-api.png) |
| **FOREARMS / elbow** (`Arm Cannon.X_046/072`) | Yes | Not used | Yes, via aim solver | 2 | same |
| **HANDS / wrist** aim (`Arm Hand.X_048/074`) | Yes | Not used | Yes | 2 | [wrist-twist-fingers.png](spike/hri/evidence/wrist-twist-fingers.png) |
| HANDS: palm twist | Yes | No | Yes: R wrist +1.57 rad = palm to viewer; twist 0 in the wai pose = palms facing each other | 2 | same, [wai-palm-search.png](spike/hri/evidence/wai-palm-search.png) |
| **FINGERS** curl (3 fingers × 3 joints, thumb 5) | Yes | No | Yes (curl about local X); individual fingers possible | 2 | wrist-twist-fingers.png |
| **LEFT ARM** | Yes | Not used | Yes | 2 | engine-poses.png |
| **RIGHT ARM** | Yes | Broken (wave) | Yes | 2 | engine-api.png |
| **BODY LEAN** | Yes | Idle sway only | Yes | 1 | engine-api.png |
| **GAZE** (head + on-screen eyes combined) | Yes | Head only | Yes; can follow a face from the camera | 1 | engine-poses.png |
| **GLOW: Screen tint** (`Screen` colour) | Yes | No | Yes: **highly visible** whole-face tint (teal, amber, blue, grey) | 1 | engine-api.png ("amber") |
| GLOW: `Glow` material | Yes | No | Yes, but it is **only two small LEDs** (screen bezel and chest). Weak signal on its own | 1 | face-controls.png |
| Approach / retreat (root z translation) | Yes | No | Yes: very legible size change | 1 | engine-api.png |
| Head pistons ("antennae" `Head Piston.*`) | Yes (98–110 vertices) | No | Not tested | 2 | UNKNOWN |
| Legs / feet / walking | Bones exist | No | Not attempted. Approach is a glide, not a walk | 4 | UNKNOWN |
| Embedded clip | Yes | No | Playable via `AnimationMixer`, but contains a weapon sequence | n/a | embedded-clip.png |
| Arm cannon / gun shield | Hidden geometry | n/a | **Avoid**: only becomes visible if `Arm Cannon.*.004` or `Gun Shield.*` bones move | n/a | embedded-clip.png |

---

## 2. Behavior Engine Findings

**Implementation:** [spike/hri/behavior-engine.js](spike/hri/behavior-engine.js) is about 300 lines, framework-agnostic, and needs only `three`.

**Design:**
- Every frame, all bones reset to rest, then layers are applied in order: root distance → spine (lean, bow, breathing) → head (gaze, nod, shake) → face (eyes, mouth) → arms → fingers → materials.
- **Arms are posed by direction, not by Euler angles.** A pose is three body-frame vectors (shoulder→elbow, elbow→wrist, wrist→knuckles) plus a palm twist. A swing-only aim solver converts each vector into a local quaternion. Transitions interpolate in direction space, including to and from the model's own rest pose, which is measured at start-up.
- This one decision is what makes D (live retargeting) and E (an authored wai) feasible without hand-tuning bone axes.

**Requested API, as implemented (TESTED via renders in [engine-api.png](spike/hri/evidence/engine-api.png) and [engine-poses.png](spike/hri/evidence/engine-poses.png)):**

| Method | Supported | Notes |
|---|---|---|
| `idle()` | Yes | Rest pose, upright, happy face |
| `lookAt(x, y)` | Yes | Head yaw/pitch plus on-screen eye shift |
| `nod()` / `shakeHead()` | Yes | Transient gestures; easy to read on the face camera, subtle in a full-body view |
| `wave(side)` | Yes | Raised arm plus forearm oscillation. Both sides work (production wave is broken) |
| `breathe(rate, depth, glow)` | Yes | Continuous phase, so the rate can change without a jump. Depth 2.2 plus screen pulse needed for visibility (default amplitude too subtle in full-body view) |
| `raiseHand(side)` | Yes | |
| `moveArm(side, pose)` | Yes | Poses: `rest`, `relaxed`, `raise`, `waveBase`, `wai`, `offer`, `stopPalm`, `shrug`, `handOnChest`, `point` |
| `setArmDirections(side, upper, fore)` | Yes | For live mirroring |
| `curlFingers(side, amount)` | Yes | |
| `lean(direction)` | Yes | upright, forward, back, left, right, slump |
| `setGlow(level, hue)` | Yes | Drives the Screen tint (main signal) and the LEDs |
| `expression(name)` | Yes | happy, neutral, concerned, calm (eyes closed), sorry |
| `bow()`, `setDistance()`, `setSpeed()`, `pause()` | Yes | Speed scales all smoothing, used for B's "too fast" |
| `reset()` | Yes | |
| Lip-sync | **Not implemented** | Mouth only scales; not tested as speech |
| Walking | **Not implemented** | Approach is root translation |

**Event output:** every call emits an event, e.g. `{t, type, side, pose…}`, so robot actions can be logged next to human inputs. The concept page shows this log and exports it as JSON.

**Performance (TESTED):** `update()` costs **0.09 ms per frame**, which is negligible.

**Gaps found while building:**
- **Gaze direction convention.** The robot should look at the user's face. Image x of the unflipped webcam maps to robot gaze as −(x − 0.5)·2. This is implemented, but the *subjective* feel with a real person is UNKNOWN.
- **Poses need cultural tuning.** Hands-on-hips rest is inappropriate for a Thai audience. The A "strong" tier and E's post-wai posture were changed to relaxed or open-palm postures ([concept-A-E-posture-fix.png](spike/hri/evidence/concept-A-E-posture-fix.png)).
- **"Offer" toward the viewer is foreshortened from the front camera.** It reads as a reach, but less dramatically than a side gesture.
- **Porting to the app:** the engine is plain ES modules on the same three.js version (0.185.1). It ports to `lib/hri/*.ts` and is driven from `RobotViewer.tsx`; nothing in the app's architecture blocks it.

---

## 3. Human Sensing Findings

### 3.1 What was actually tested here

| Test | Result | Label |
|---|---|---|
| MediaPipe Tasks Vision 1.0.1 with Pose (lite) + Face loaded from local files | Loads in about 11–13 s cold; **0 external network requests** | TESTED |
| Inference speed, pose + face, GPU delegate (Metal) | **22.6 ms per frame, about 20 fps** (15 fps when feed-capped) | TESTED |
| Inference speed, software GL (no GPU) | 312 ms per frame, about 3 fps | TESTED: shows a laptop with no WebGL GPU fails |
| Non-human input (Chromium synthetic camera pattern) | No person and no face detected, i.e. no false positives | TESTED |
| Rendered video of the robot itself as the camera feed | Detected as "person" only intermittently, arms mostly "not visible". **The TV-headed robot is not a valid human proxy**; this test only confirms plumbing | TESTED (plumbing only) |
| Breathing estimator, wai classifier, proximity, mirror mapping | 14/14 unit tests pass (details below) | LOGIC-TESTED |
| Any signal on a real person, in real lighting | Not possible in this environment | **UNKNOWN** |
| Microphone breathing | Code exists; not run | **UNKNOWN** |
| Hand landmarker (finger-level) | Model vendored; not evaluated | **UNKNOWN** |
| Thai TTS | macOS has the system voice `Kanya (th_TH)`; headless Chromium exposed no voices | UNKNOWN in-browser |

### 3.2 Breathing estimator (LOGIC-TESTED, [spike/hri/signals.js](spike/hri/signals.js))

**Method:** resample the signal to 10 Hz, detrend over 12 s, smooth over 0.7 s, detect upward zero-crossings with hysteresis, take the median interval, then run an **autocorrelation check at the detected period**. The estimator refuses to report a rate when the rhythm does not repeat.

| True rate | Noise 0 | Noise 0.25 | Noise 0.5 | Noise 1.0 (SNR 1) |
|---|---|---|---|---|
| 6 bpm | 6.4 (q 0.56, low) | 6.2 (low) | 6.3 (low) | 6.5 (low) |
| 10 bpm | 10.0 | 10.0 | 10.2 | **abstains** |
| 15 bpm | 15.0 | 15.2 | 14.6 | 15.2 |
| 20 bpm | 20.0 | 20.3 | 19.7 | 19.4 |

- **No false confidence:** 0 of 50 pure-noise traces gave a confident rate. *The first version of the estimator reported 18.5 bpm from noise; this was caught by the test and fixed.*
- **Guided slow-down 16 → 8 bpm:** the estimate lags by about **15–20 s** and converges about 15 s after the true rate settles.
- **Posture step:** the estimator abstains for up to about 12 s instead of reporting a false rate.
- **Implication for C:**
  - The first trustworthy rate appears after **about 8–15 s**.
  - At the resonance-breathing target (about 6 bpm), a 30 s window holds only 3 cycles, so quality stays "low".
  - The demo's "after" rate needs about 60–90 s of slow breathing to become credible.

### 3.3 Sensing capability table

The accuracy column is an expectation from the method, plus LOGIC-TESTED behaviour where applicable. **None of it is measured on humans here.**

| Signal | Method | Accuracy expectation | Lighting sensitivity | Browser feasibility | Demo reliability |
|---|---|---|---|---|---|
| Person present | Pose landmarker | High when upper body is in frame | Medium (dim or backlit degrades) | **TESTED**: 20 fps GPU, offline | High |
| Face position (for robot gaze) | Face landmarker, nose tip | High at 0.4–1.5 m, frontal | Medium | **TESTED** (runs) | High |
| Relative distance / approach | Shoulder width or inter-ocular distance vs calibration | Relative only (±10–15% expected), no metres | Low–medium | Runs; LOGIC-TESTED | Medium–high |
| Lean-back event | >12% drop in apparent shoulder width within 1.5 s | Plausible; false triggers when the person turns sideways (INFERENCE) | Low–medium | LOGIC-TESTED | **Medium**: needs calibration per person |
| Wai (hands together, chest to forehead, centred, wrists above elbows, held 500 ms) | Pose landmarks 0, 11–16 | Expected good for a frontal wai; risk if hands cover the face or wrists self-occlude | Medium | LOGIC-TESTED (5 positive and negative cases) | **Medium–high**: button backup exists |
| Arm elevation and elbow angle (mirror) | Pose world landmarks 11–16 | Shoulder elevation expected ±10–15°; elbow worse when the forearm points at the camera (depth ambiguity, INFERENCE) | Medium | Runs; mapping LOGIC-TESTED | **Medium**: needs the arm fully in frame (seated framing often cuts the elbow or wrist) |
| Wrist rotation / hand open-close | Hand landmarker | UNKNOWN | High (hands are small) | Not tested | **Low until tested** |
| Breathing rate, camera | Shoulder-height signal, estimator above | Works only if the person sits still; signal amplitude on real shoulders is UNKNOWN | Medium | Runs; LOGIC-TESTED | **Low–medium** |
| Breathing rate, microphone | RMS envelope | Breath sounds are quiet; venue noise likely dominates (INFERENCE) | n/a (noise-sensitive) | Code only | **Low** |
| Breathing, manual (press on each inhale) | Interval between presses | Exact to the user's input | None | **TESTED** end to end | **High**, but it is self-report, not perception |
| Lighting check | Mean luma of a 64×48 frame sample | n/a | n/a | TESTED | Useful as a venue pre-check |

### 3.4 Go/no-go protocol for real humans (to run before choosing)

About 45 minutes, using [spike/hri/sensing-lab.html](spike/hri/sensing-lab.html). Run it with 5 people, at 2 distances (0.6 m and 1.2 m), under 2 lighting conditions (normal, and backlit or dim), on the actual demo laptop.

| Signal | Pass threshold |
|---|---|
| Wai detector | Fires in ≥ 9 of 10 deliberate wais; ≤ 1 false fire in 2 min of normal talking and gesturing |
| Lean-back | ≥ 8 of 10 deliberate lean-backs; ≤ 1 false fire in 2 min |
| Arm elevation | Readout visibly tracks a slow 0→150° side raise for both arms at seated framing |
| Breathing (camera) | Confident rate within 30 s for ≥ 4 of 5 seated people, and roughly matching the person's own count |
| fps | ≥ 15 with pose + face on the demo laptop |

---

## 4. Concept A — Honest Body

**Prototype:** [concepts.html](spike/hri/concepts.html) tab A, built on real atlas data loaded at runtime from the seed JSON and parsed from `lib/seed-importer.ts`.

| Tier | Claim | Confidence and source | Robot behaviour |
|---|---|---|---|
| Strong | Pinto deployed in hospitals across Thailand | 0.93 (triplet) | Open palm to the listener, steady gaze, nod, bright teal face, happy |
| Moderate | Ninja sends patient info to doctors; Mr SAM deployed | 0.78 | Hand on chest, glance away then back, blue mid-glow, neutral mouth |
| Weak | NAO used for education/HRI in Thailand | 0.45 (`lib/seed-importer.ts`) | Shrug, droopy eyes plus frown, amber face, lean back, small head shake, gaze down/aside |
| None | "Bumi works in Thai hospitals" | no record | Arms relaxed, grey dim face, neutral: "I don't know. The atlas has no record." |

The user then rates trust (1–7), the system computes a calibration gap, and "Show evidence" makes the robot point at a card with the real excerpt and source URL. Everything is logged.

**Result:** TESTED, [concept-A.png](spike/hri/evidence/concept-A.png).
- All four tiers are visually distinct. Face tint and face expression carry most of the signal; posture reinforces it.
- **Gimmick risk is real but bounded.** The shrug is slightly comic. Strong vs moderate is mostly carried by colour and arms, so a viewer without the speech bubble might not separate 0.93 from 0.78.
- Whether people can rank tiers *without* the text is **UNKNOWN**. Test it: show 8 presentations with captions hidden and ask 5 people to sort them by "how sure is the robot".

**Data constraint:** the real spread is 0.72–0.95 plus one 0.45 record, so the "weak" and "none" tiers depend on NAO and on absent records. That is honest, but the demo script must use them deliberately.

**Hack Day simulation:**

| | |
|---|---|
| **Before** | Port the engine to `lib/hri/`; fix the bone-name bug in `RobotViewer`; pick 6 claims across tiers from the database; author the 4 tier presets |
| **During** | "Ask the robot" panel on `/robots`, server action reading `RobotModel` / `Triplet` / `SourceRecord`, trust capture, calibration display, interaction log persisted via Prisma |
| **Demo** | Two or three claims, a trust slider, the evidence card. Needs no camera and no internet if the database is local |
| **Backup** | If the database is down, read the same records from the seed JSON (already done in the spike). Camera and LLM are not needed |

---

## 5. Concept B — Pre-Exposure Clinic

**Prototype:** tab B. A 6-step ladder (look → wave → step closer → closer → raise hand → reach toward you). Each step is **announced first** ("…in 3"), then executed at the current speed.

| Control | Robot response |
|---|---|
| **Too close** | Steps back, hand on chest, "sorry" face, brief lean back. **Records a distance cap that later steps respect** |
| **Too fast** | Global speed halves (0.35× minimum) and the robot nods: "I'll move more slowly" |
| **Too much** | Cancels the pending action, arms down, retreats far, eyes closed (calm), dim blue face: "Nothing else will happen until you choose Continue" |
| **Continue** | Next step |

A discomfort slider (0–10) is logged per step. The optional camera path triggers "too close" automatically on lean-back.

**Result:** TESTED, [concept-B.png](spike/hri/evidence/concept-B.png).
- Far vs close is unmistakable.
- The "too close" response is visibly apologetic.
- "Too much" produces a clearly withdrawn, calm robot.
- The distance cap works: later approach steps stop at the user's boundary.

**Does it feel like HRI rather than a normal UI?**
- *Partly.* The robot's body changes immediately and appropriately, its memory of the boundary changes later behaviour, and announcements make it legible.
- With buttons alone, though, the input side is a form. The lean-back trigger is what would make it feel like perception, and that is UNKNOWN on real people (see §3.4).
- "Too fast" is only perceptible in motion; a judge must see two steps to notice the slowdown.

**Hack Day simulation:**

| | |
|---|---|
| **Before** | Engine port, ladder script and Thai copy, lean-back calibration UX |
| **During** | Ladder page linked from a hospital robot's card, Prisma session log, discomfort chart, readiness summary |
| **Demo** | Buttons always work; lean-back is a bonus |
| **Backup** | Turn the camera off; every response is still available by button or keyboard |

---

## 6. Concept C — Breath Co-Regulation

**Prototype:** tab C. Three input modes: manual (hold a button or Space on each inhale), camera (shoulder signal), microphone.

| Phase | What happens |
|---|---|
| **Measure** | Waits until the estimator is confident |
| **Mirror** | The robot breathes at the user's rate for 20 s, with deeper chest and shoulder motion and the face pulsing brighter on inhale |
| **Lead** | Every 3 robot cycles, drops 1 bpm, *only if the user is following within 2 bpm*, never below 6 bpm |
| **Finish** | Reports *estimated* rate before / during / after, labelled "interaction signal only" |

**Result:**
- **Manual mode:** TESTED end to end with scripted presses. Measured 14.9 bpm, mirrored, led 13.9 → 12.9 → 11.9, and the session ended at "after" ≈ 10 bpm. The log captured each step. The presses were scripted by the test harness, so this proves the loop, not that people follow.
- **Camera mode:** the pipeline runs, but whether shoulder motion from real seated breathing is strong enough is **UNKNOWN**.
- **Visual legibility:** breathing could not be judged from stills. The default amplitude was invisible at full-body scale, so depth was raised to 2.2 with a screen pulse. Whether a judge perceives the robot "breathing with them" in a 2-minute slot is UNKNOWN.

**Timing constraints (LOGIC-TESTED):**
- At least 8–15 s before the first rate.
- About 15–20 s lag on changes.
- The meaningful slow-down takes 60–120 s.

**Hack Day simulation:**

| | |
|---|---|
| **Before** | Run §3.4's breathing test. If it fails, commit to manual mode and accept that perception is lost |
| **During** | Session page, chart, log |
| **Demo** | Needs about 2 calm minutes and a still participant |
| **Backup** | Manual press mode; robot-led breathing with no measurement |

---

## 7. Concept D — Mirror Therapy

Framing: a *prototype inspired by mirror-based rehabilitation interaction*. It makes no efficacy claim and is not a medical device.

**Prototype:** tab D.
- The user picks their moving arm.
- In camera mode, pose world landmarks become body-frame directions, reflected across the sagittal plane and applied to the robot's *other* arm via `setArmDirections`.
- In manual mode, sliders for shoulder raise and elbow bend drive the same path.
- A rep counter (elevation > 60° then < 30°) logs peak elevation per rep, and a "Robot demonstrates" button plays the movement.

**Joint-control findings (TESTED, [concept-D-E-C.png](spike/hri/evidence/concept-D-E-C.png)):**

| Joint | Robot can show it? | Can we drive it from the camera? |
|---|---|---|
| Shoulder raise / abduction (0–170°) | **Yes**, clean at 90° and 150° | Pose landmarks; accuracy on humans UNKNOWN |
| Shoulder flexion (forward) | Yes (direction-based) | Same; depth (z) noisier (INFERENCE) |
| Elbow flexion | **Yes** | Same; ambiguous when the forearm points at the camera |
| Forearm pronation/supination | Yes (wrist twist) | **No signal** from pose landmarks; needs the hand landmarker (UNKNOWN) |
| Wrist flexion | Yes (wrist aim) | Hand landmarker needed (UNKNOWN) |
| Hand open/close | Yes (finger curl) | Hand landmarker needed (UNKNOWN) |

**Mapping semantics** (LOGIC-TESTED): the user raises their left arm sideways, and the robot's right arm rises outward and up. A reach toward the camera stays toward the viewer.

**Result:**
- The model has **sufficient** joint control for shoulder, elbow and hand.
- The limiting factor is **sensing**, not the robot:
  - wrist and hand data are not available from pose landmarks;
  - seated framing often cuts off the elbow or wrist;
  - real-person tracking quality is UNKNOWN.
- Latency: engine smoothing on direct control is about 70 ms time-constant plus about 25 ms inference. Expected to feel live; not measured with a human.

**Hack Day simulation:**

| | |
|---|---|
| **Before** | **Mandatory** §3.4 arm test with real people at the demo framing; decide shoulder+elbow only |
| **During** | Exercise protocol, rep and ROM chart, link from the Chula rehab robot card, session logging |
| **Demo** | Participant standing, arm fully in frame, good front light |
| **Backup** | Slider mode (keeps the robot behaviour but loses the "it's copying me" moment); robot demonstration mode |

---

## 8. Concept E — Wai-First Proxemics

**Prototype:** tab E. The flow:
1. The robot **waits**: relaxed arms, eyes lowered, no waving or staring.
2. A wai is detected (pose classifier plus 500 ms hold) or confirmed by the "I performed a wai" button.
3. The robot returns a wai (palms together at chest, calm eyes), then bows, then says "สวัสดีครับ".
4. It approaches to a default or *remembered* distance.

The user then answers **Too far / Comfortable / Too close**:
- **Too far:** steps closer with an open-palm gesture.
- **Comfortable:** double nod, bright teal, and the distance is saved.
- **Too close:** steps back with hand on chest, sorry face, lean back.

Lean-back via camera also triggers "too close".

**Result:** TESTED, [concept-D-E-C.png](spike/hri/evidence/concept-D-E-C.png) and [concept-A-E-posture-fix.png](spike/hri/evidence/concept-A-E-posture-fix.png).
- The **wai is the most legible pose in the spike**: hands meet centred under the face screen, palms facing (wrist twist verified).
- The bow and the three proximity states read clearly through size change plus body language.
- The model's hands-on-hips rest pose had to be replaced (see §0.3).

**Detection:**
- **LOGIC-TESTED:** the classic chest wai and the high wai are accepted; hands at the waist, a one-hand wave and crossed arms are rejected; hold and cooldown behave correctly.
- **On real people:** UNKNOWN. The key risks are hands occluding the face (face landmarker loses the face, but the wai uses pose, not face) and wrists drifting apart for a loose wai.

**Hack Day simulation:**

| | |
|---|---|
| **Before** | Engine port with the bone-name fix (this *replaces* the broken production wave with a working wai greeting), §3.4 wai test, Thai copy check by a native speaker |
| **During** | Greeting flow on the Overview robot, proximity buttons plus lean-back, comfort profile persisted (Prisma or per-user), aggregate in Analytics |
| **Demo** | Frontal participant at 0.8–1.5 m; buttons for the comfort states |
| **Backup** | "I performed a wai" button; proximity by buttons; everything else identical |

---

## 9. Technical Feasibility Matrix

1 = very difficult, 5 = highly feasible. For dependency risk, a higher score means *lower* risk. Scores are technical only.

| Criterion | A Honest Body | B Pre-Exposure | C Breath | D Mirror | E Wai-First |
|---|---|---|---|---|---|
| Existing code reuse | **5** (registry, confidences, triplets, robots page) | 3 | 3 (breathing loop idea; rate was constant) | 2 | 4 (Overview robot stage; replaces broken wave) |
| 3D model capability | 5 | 5 | 4 (needed amplification) | 4 (wrist/hand need data) | 5 |
| Browser capability | 5 (no sensing needed) | 5 (sensing optional) | **2** (camera breathing unproven; lag) | 3 (arm tracking unproven) | 4 (wai is a coarse pose; button backup) |
| Dependency risk | 5 (none; no LLM needed) | 5 | 3 (MediaPipe) | 3 (MediaPipe) | 3 (MediaPipe, optional) |
| Implementation time | 4 | 4 | 3 | 3 | 4 |
| Demo reliability | 5 | 5 | 2 (camera) / 4 (manual) | 3 | 4 |
| Offline / venue reliability | 5 | 5 | 3 (still sitter, quiet) | 3 (framing, light) | 4 (light) |
| Recovery from failure | 5 | 5 | 3 (manual mode loses perception) | 3 (sliders lose the moment) | 5 (button keeps the full flow) |
| **Total / 40** | **39** | **37** | **23–25** | **24** | **33** |

---

## 10. 10-Second WOW Moments

| Concept | The 10-second moment | Verdict |
|---|---|---|
| **A** | The judge asks "Do Bumi robots work in Thai hospitals?" The robot, which a moment ago stood tall and offered the Pinto fact, drops its arms, its face goes grey, and it says "I don't know. The atlas has no record." It refuses to bluff, and the log records the judge's trust rating. | **Convincing but intellectual**: a surprise about honesty, not a physical reaction to the judge |
| **B** | The robot announces "I'll step closer… 3", approaches, and the judge presses *Too close* (or leans back). The robot instantly steps back, puts a hand on its chest, says sorry, and never crosses that line again. | **Convincing**; strongest if lean-back works on real people. With buttons only, it risks looking like UI |
| **C** | None within 10 s. The first credible rate appears after about 8–15 s, and entrainment takes 60–120 s. | **No convincing 10-second moment.** The payoff is a 2-minute arc |
| **D** | The judge lifts their left arm and the robot's opposite arm rises at the same instant. | **Strongest visceral moment**, *if* tracking holds on that judge in that light (UNKNOWN) |
| **E** | The judge waves and the robot politely waits. The judge does a wai, and the robot returns it, bows and says "สวัสดีครับ". The judge leans back and it steps back. | **Strong and culturally resonant**; the button backup preserves the moment's shape even if detection fails |

---

## 11. Hack Day Risk Analysis

Assumptions: 5 students, one day, physical robot UNKNOWN, unreliable internet, live demo.

**Shared before-Hack-Day work (all concepts):**
1. Port `behavior-engine.js` to TypeScript in `lib/hri/`.
2. Fix the sanitised-name bug in `RobotViewer.tsx`.
3. Replace the hands-on-hips idle with a relaxed pose for Thai contexts.
4. Vendor MediaPipe WASM and models into `public/` (only if camera is used).
5. Set up a local database.
6. Run the §3.4 human test on the demo laptop.

| Risk | A | B | C | D | E | Mitigation |
|---|---|---|---|---|---|---|
| Camera fails or bad light | – | Low | **High** | **High** | Medium | Button paths exist in B and E; C and D degrade to manual |
| Internet down | Low | Low | Low | Low | Low | Models and data are local; no LLM needed |
| No WebGL GPU on demo laptop | Medium | Medium | High | High | High | The 3D robot itself needs WebGL; sensing at 3 fps without a GPU (TESTED) |
| Sensing false triggers in a crowd | – | Medium (lean-back) | Medium | Medium | Medium (wai hold + cooldown) | One participant in frame; operator can disable the camera |
| Gesture/pose authoring overrun | Low | Low | Low | Medium | Low | Poses already authored and verified in the spike |
| Judges perceive "it's just buttons" | Medium | **High** | Low | Low | Medium | Add one perception channel (face-follow gaze is cheap and TESTED to run) |
| Timing (demo slot about 3 min) | Low | Low | **High** (needs 2 calm minutes) | Low | Low | — |
| Overclaiming health effects | Low | Medium | **High** | **High** | Low | Copy reviewed; "interaction signal only" labels |

---

## 12. Recommended Technical Direction

Based only on what the spike measured or rendered:

1. **E (Wai-First Proxemics) is the strongest balance of a real perception moment and demo safety.**
   - All robot behaviours are verified (wai, bow, approach/retreat, apology).
   - Detection logic is tested.
   - The button backup preserves the full interaction flow.
   - It integrates by *fixing* a real production bug: the broken welcome wave becomes a working wai greeting on the Overview page.
   - Its single unknown is wai detection on real people, which §3.4 can settle in under an hour.
2. **B shares about 80% of E's mechanics** (distance, apology, boundary memory, lean-back). It can be built as E's *interaction core* at almost no extra cost, which gives E a wellness narrative: comfort boundaries respected and remembered.
3. **A is the most technically feasible (39/40) and the deepest platform integration**, with zero sensing risk. Its demo moment is intellectual rather than physical. It is a strong *second module* or a safe primary choice if the §3.4 camera test fails.
4. **D has the most visceral moment but the most unknowns concentrated in sensing.**
   - The model is sufficient for shoulder, elbow and hand; human arm tracking at demo framing is unproven, and wrist/hand data needs an untested model.
   - Choose D only if the §3.4 arm test passes clearly on the demo laptop.
5. **C is the least feasible as a live demo.**
   - It has no 10-second moment.
   - The estimator needs 8–15 s before its first rate and lags guided changes by 15–20 s.
   - Real camera breathing is unproven, and the honest fallback (manual presses) removes the perception that makes it HRI.

**Evidence-based decision rule:**
- Run §3.4 first.
  - Wai passes → **E + B core, with A as an optional evidence mode on `/robots`.**
  - Wai fails but arms pass → reconsider D.
  - Camera broadly unreliable → **A + B** (both fully button-driven, both verified here).

---

### Appendix: spike artifacts

| Path | What |
|---|---|
| [spike/hri/behavior-engine.js](spike/hri/behavior-engine.js) | Behaviour engine (aim-solver arms, face, glow, gestures, events) |
| [spike/hri/signals.js](spike/hri/signals.js) + [tests/](spike/hri/tests/) | Signal processing and 14 unit tests |
| [spike/hri/sensing.js](spike/hri/sensing.js), [sensing-lab.html](spike/hri/sensing-lab.html) | MediaPipe wrapper and venue check page |
| [spike/hri/concepts.html](spike/hri/concepts.html) | The five interactive prototypes plus interaction log |
| [spike/hri/bone-explorer.html](spike/hri/bone-explorer.html), [engine-sheet.html](spike/hri/engine-sheet.html) | Render harnesses |
| [spike/hri/evidence/](spike/hri/evidence/) | 13 contact sheets cited above |

Not committed:
- `spike/hri/node_modules/` and `spike/hri/models/` are gitignored and are recreated by `npm install` and `npm run models`.
- Headless Chromium and Playwright scripts were used from a scratch directory outside the repo.
