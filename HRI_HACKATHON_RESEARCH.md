# HRI Hackathon 2026 — Repository & Feature Research

> **Base platform:** HumanoidTH — Thailand Humanoid Atlas (`github.com/taechasith/HumanoidTH`, commit `bef80bd`, 54 commits, single author, 2026-07-03 → 07-05)
> **Theme:** HRI Wellness Living Lab · **Prepared:** 2026-10-03 · **Status:** research only. No application code has been modified.
>
> **Evidence labels used throughout**
> - **FACT**: verified by reading the cited file or running a read-only command against the repo.
> - **INFERENCE**: a reasoned conclusion from facts that has not been verified by running the app.
> - **PROPOSAL**: something we would build.
> - **UNKNOWN**: could not be determined from the repository.

---

## 1. Executive Summary

**What HumanoidTH actually is (FACT).** HumanoidTH is **not a robot-control stack**. It has no ROS, no simulator, no hardware drivers, no sensors, no WebSocket/MQTT and no physical robot I/O. It is a **Next.js 15 + Prisma/PostgreSQL research-atlas web app** that catalogues Thailand's humanoid and social-robotics ecosystem in four layers: public perspectives, contributions, a robot model registry and owned inventory. A legacy Python/FastAPI MVP sits alongside it.

**The single embodied element (FACT)** is a **Three.js 3D humanoid** on the Overview page ([app/components/RobotViewer.tsx](app/components/RobotViewer.tsx)). It follows the mouse with head and eyes, breathes, idles and waves its right arm on a timer. Its rig ([public/teal_v.2.glb](public/teal_v.2.glb)) is **far richer than the code uses**:

| Rig part | Bones in the model | Used by the code today |
|---|---|---|
| Spine | 4 | none |
| Mouth | 7 | none |
| Eyes | 8 per eye | eye-control bones only |
| Arms and hands | both arms, about 18 finger bones each | right arm only |
| Legs | yes | none |
| Materials | `Glow` and `Screen` | not driven |
| Embedded animation clip | 1 | not used |

This avatar is **the HRI extension point**.

**The data is a wellness gold mine (FACT).** The seed corpus ([thailand_humanoid_atlas_seed_records.json](thailand_humanoid_atlas_seed_records.json), 6,749 records) includes **16 real Thai robots, many of them wellness robots**:
- Chula Rehabilitation Robots for Stroke Patients
- CORGI Physical-Therapy Assistant
- Dinsaw eldercare robots
- the Pinto and Ninja hospital and telepresence robots
- Mr SAM outpatient robot
- Exoskeleton Wheelchair

It also has 6,714 source records and a taxonomy built for **public trust, safety, privacy and job-displacement perspectives**.

**The platform has real defects we can fix as our "improve/fix" credit (FACT):**
1. Anyone can make themselves ADMIN: the role picker and the "Login as Administrator" button on `/profile`.
2. Server actions that mutate data have no auth checks.
3. An admin password fallback is hard-coded in the public repo.
4. Gemini calls target the retired `gemini-1.5-flash` model (INFERENCE: retired upstream). The AI path therefore falls back to keyword rules, and the **map silently shows hard-coded clusters**, which violates the project's own no-mock policy.
5. `/inventory` can never be populated by the TypeScript seeder.
6. The overview always shows "empty DB" legacy Python instructions.
7. The 3D robot ignores `prefers-reduced-motion`.

**Strategic recommendation (PROPOSAL).** Turn the atlas from a *catalogue of robots* into a **living lab where people actually meet a robot and the encounter becomes data**. Every finalist below:
1. Upgrades `RobotViewer` into a **controllable behaviour engine** driven by browser sensing (webcam pose or hands via MediaPipe, microphone envelope, explicit controls).
2. Logs each encounter as an **HRI session** in Prisma.
3. Feeds results back into the existing **Analytics, Robots and Perspectives** layers.

The five finalists trade off differently:

| Finalist | Strongest on |
|---|---|
| A. Honest Body | technical depth and atlas integration |
| B. Robot Pre-Exposure Clinic | wellness story |
| C. Breath Co-Regulation | demo reliability |
| D. Mirror-Therapy Avatar | clinical "wow" |
| E. Wai-First Proxemics | Thai cultural novelty |

The team should choose based on the trade-offs in §16.

---

## 2. Repository Overview

### 2.1 Phase 0: skills inventory (what was applied and what was missing)

| Need | Available Claude Code skill? | How it was covered |
|---|---|---|
| Codebase / architecture exploration | No dedicated skill | Manual: file-by-file reads, grep sweeps, GLB parsing, dataset statistics |
| Frontend (Next.js / React / Three.js) | No dedicated skill | Repo source and established Next.js App Router practice |
| Backend / API / Prisma | No dedicated skill | `prisma/schema.prisma`, server actions and route handlers read directly |
| Robotics / ROS / HRI | **Missing** | No robotics or ROS code exists in the repo, so ROS knowledge is moot. HRI concepts below rely on established HRI literature: proxemics (Hall), legibility (Dragan), trust calibration (Lee & See), NARS / Godspeed questionnaires, entrainment, mirror therapy (Ramachandran) and Wizard-of-Oz methodology |
| AI / ML | No dedicated skill | Read `lib/classifiers.ts` and `app/map/actions.ts` (Gemini REST) |
| Testing | `code-review` / `security-review` skills exist | Not run yet: they review *diffs* and there is no diff. Recommended after implementation |
| Running the app | `run` skill exists | **Not used.** No `pnpm`, no Postgres and no Docker on this machine, and the brief said not to install dependencies. All runtime behaviour is therefore **INFERENCE / UNVERIFIED** |
| UX / accessibility | `design:accessibility-review` exists | Deferred until there is a UI to audit |

### 2.2 Stack (FACT)

| Layer | Technology | Evidence |
|---|---|---|
| Web app | Next.js 15 App Router, React 19, TypeScript | [package.json](package.json) |
| DB | PostgreSQL via Prisma 6 (client output `generated/prisma`), Prisma Postgres (Accelerate) by default | [prisma/schema.prisma](prisma/schema.prisma), [.env.example](.env.example) |
| 3D | three 0.185 + GLTFLoader | [app/components/RobotViewer.tsx](app/components/RobotViewer.tsx) |
| Charts / graph | recharts, cytoscape, bpmn-js | [app/analytics/](app/analytics/), [app/network/](app/network/) |
| AI | Gemini REST (`gemini-1.5-flash`) with keyword-rule fallback | [lib/classifiers.ts:138](lib/classifiers.ts#L138), [app/map/actions.ts:174](app/map/actions.ts#L174) |
| Ingestion | OpenAlex, GitHub, GDELT, YouTube adapters | [lib/ingest/adapters.ts](lib/ingest/adapters.ts) |
| Auth | Cookie flags (`user_role`, `admin_session=true`) and Basic auth on `/api/ingest`, `/api/export` | [middleware.ts](middleware.ts), [app/actions.ts](app/actions.ts) |
| i18n | EN/TH dictionary, `lang` cookie | [lib/translations.ts](lib/translations.ts) |
| Tests | 3 node:test unit tests (classifiers), 2 Playwright specs, Python pytest for the legacy app | [test/](test/), [tests-node/](tests-node/), [tests/](tests/) |
| Deploy | Vercel (`sin1`) | [vercel.json](vercel.json) |
| Legacy | Python FastAPI + Jinja + SQLite pipeline | [src/humanoid_atlas/](src/humanoid_atlas/) |

### 2.3 Directory map (abridged, FACT)

```text
app/                 Next.js routes (overview, dashboard, robots, inventory, perspectives,
                     contributions, map, network, analytics, database, submit-data,
                     admin, admin-login, data-pulls, profile) + api/{export,ingest,network}
app/components/      RobotViewer (3D), SidebarNav, MobileTabNav, DataPullFab, FirstTimeLoader…
lib/                 prisma client, classifiers, ingest/, network-graph (1,238 LOC), geo,
                     seed-importer, translations, taxonomy, seo
prisma/              schema.prisma (12 models), seed.ts, 1 migration
data/                taxonomy.yml, seeds/*.yml, imports/<seed json>
scripts/             dev (next + seed watcher), ingest, seo-optimizer, assert-no-mock-data
public/teal_v.2.glb  7.3 MB rigged humanoid (Sketchfab-exported); duplicate copy in repo root
src/humanoid_atlas/  legacy Python pipeline + FastAPI viewer
```

### 2.4 Data reality (FACT, from the seed JSON)

| Category | Count | Notes |
|---|---|---|
| `source_record` | 6,714 | OpenAlex 3,548 · GitHub 2,659 · YouTube 327 · news long tail. Peak years 2020-2023 |
| `robot_model` | 16 | All Thai-relevant. About 9 have a direct wellness or health use case (listed in §4) |
| `perspective_annotation` | **4** | The Perspectives layer is almost empty |
| `triplet_relation` | 10 | |
| `contribution` | 3 | |
| Sources matching wellness keywords | about 125 | regex for wellbeing, rehab, stress, loneliness, ผู้สูงอายุ, therapy |

---

## 3. Architecture

### 3.1 As-is (FACT)

```text
                 ┌──────────────────────────── Human (browser) ───────────────────────────┐
                 │  reads dashboards · submits URLs · (admin) edits CMS · drags/hovers 3D robot │
                 └───────────────┬───────────────────────────────────────┬──────────────────┘
                                 │ HTTP (RSC pages, server actions)       │ pointer events only
                                 ▼                                        ▼
┌──────────────────────── Next.js App Router (Vercel / local) ───────────────────────────────┐
│ Pages: / /dashboard /robots /inventory /perspectives /contributions /map /network          │
│        /analytics /database /submit-data /admin /profile /data-pulls                        │
│ Server actions: app/actions.ts (submissions, CMS upserts, runDataPull, login)               │
│ Route handlers: /api/network/{graph,node,edge}  /api/export  /api/ingest/[adapter]          │
│ Client islands: RobotViewer(three.js)  NetworkGraphClient(cytoscape)  AnalyticsPlayground   │
│                 GoogleMapClient  DataPullFab                                                │
└───────────────┬──────────────────────────────┬────────────────────────────┬────────────────┘
                │ Prisma                        │ fetch                      │ fetch
                ▼                               ▼                            ▼
   ┌────────── PostgreSQL ──────────┐   External APIs:              "AI layer":
   │ SourceRecord · RobotModel      │   OpenAlex · GitHub ·          classifyWithGemini()
   │ PerspectiveAnnotation · Triplet│   GDELT · YouTube ·            (gemini-1.5-flash → likely
   │ Contribution · OwnedInventory  │   ip-api.com (geo)             failing) → keyword rules
   │ SubmittedData · User           │
   │ SourcePullJob · PipelineRun    │   Seed JSON ──watch-seed──► Prisma (local dev)
   │ StatsCache · Entity            │   Seed JSON ──file mode──► /network (works without DB)
   └────────────────────────────────┘

   Robot / simulation layer: NONE beyond RobotViewer's local animation loop.
   Feedback to human: visual only (dashboards + avatar idle/gaze/wave).
```

### 3.2 Proposed target (PROPOSAL)

```text
Human
 │  camera (pose / hands / face)   mic (amplitude envelope)   explicit controls (slider, "pause" button, keyboard)
 ▼
Sensing layer (browser-only, on-device; no video leaves the machine)
 │  MediaPipe Tasks Vision (WASM, vendored model files) · WebAudio RMS · consent gate
 ▼
Interaction state machine (new: lib/hri/*)
 │  user state estimate → policy (rules first, LLM optional) → robot intent
 ▼
Robot behaviour engine (refactored RobotViewer)
 │  gaze target · head/spine posture · L/R arm poses · mouth · glow colour/intensity · breath rate · camera distance
 ▼
Feedback to human: embodied motion + glow + optional TTS (speechSynthesis th-TH/en) + on-screen explanation
 │
 ▼
Living-lab persistence (new Prisma models: HriSession, HriEvent, HriConsent)
 │
 ▼
Existing atlas layers: /analytics (new scope) · /robots (link session results to RobotModel) · /perspectives (first-party trust data)
```

---

## 4. Existing Capabilities

| Capability | Status | Evidence | Demo-able? |
|---|---|---|---|
| Overview metrics (counts, platforms, year range) | Works if DB is up | [app/page.tsx:70-116](app/page.tsx#L70-L116) | Yes |
| Robot registry cards with thumbnails from source meta | Works | [app/robots/page.tsx](app/robots/page.tsx) | Yes |
| Perspectives table (theme, stance, sentiment, confidence, excerpt) | Works but nearly empty (4 seeded annotations) | [app/perspectives/page.tsx](app/perspectives/page.tsx) | Weak |
| Dashboard distribution bars and confidence buckets | Works | [app/dashboard/page.tsx](app/dashboard/page.tsx) | Yes |
| Analytics playground (recharts) and BPMN pipeline view | Works | [app/analytics/](app/analytics/) | Yes |
| Network graph (cytoscape) with **file-mode fallback when there is no DB** | Works | [lib/network-graph.ts:597-665](lib/network-graph.ts#L597-L665), [app/api/network/graph/route.ts](app/api/network/graph/route.ts) | Yes, the most resilient page |
| Map: source pins by **IP geolocation of the hosting server** and Gemini "contribution clusters" | Works, but semantically misleading (see gaps) | [lib/geo.ts](lib/geo.ts), [app/map/actions.ts](app/map/actions.ts) | Caution |
| Ingestion (OpenAlex/GitHub/GDELT/YouTube) with relevance and perspective classification | Works; Gemini path INFERRED broken → rules | [lib/ingest/](lib/ingest/), [lib/classifiers.ts](lib/classifiers.ts) | Yes, needs network |
| Community submission → admin review queue | Works | [app/submit-data/page.tsx](app/submit-data/page.tsx), [app/admin/AdminConsolePage.tsx](app/admin/AdminConsolePage.tsx) | Yes |
| Inventory with operator/public-safe masking | UI exists; **no TypeScript code path ever creates `OwnedInventory` rows** | grep: only reads in `app/` and `lib/network-graph.ts` | Empty |
| CSV export | Works (Basic auth) | [app/api/export/route.ts](app/api/export/route.ts) | Yes |
| EN/TH localisation | Works (partial: many pages have hard-coded EN strings) | [lib/translations.ts](lib/translations.ts) | Yes |

**Wellness-relevant robots already in the registry (FACT, seed JSON `robot_model`):**

| Robot | Robot type | Wellness relevance |
|---|---|---|
| Dinsaw Robot | social_service_robot | eldercare |
| Dinsaw Mini Home AI Assistance | elderly_care_robot | eldercare |
| Pinto Robot | medical_delivery_robot | hospital |
| Mirror Telepresence System | telepresence_robot_system | care at a distance |
| Ninja Robot | medical_telepresence_robot | hospital |
| Kaitomm Robot | companion_personal_assistant_robot | companionship |
| Radioactive Iodine Therapy Medical Assistant Robot | medical_assistant_robot | treatment |
| CORGI Healthcare and Physical Therapy Assistant Robot | healthcare_physical_therapy_robot | physical therapy |
| Mr SAM outpatient service robot | hospital_administrative_service_robot | hospital |
| Chula Rehabilitation Robots for Stroke Patients | rehabilitation_robot | stroke rehabilitation |
| Exoskeleton Wheelchair Robot | assistive_wearable_robot | mobility |

The remaining five seeded robots are Robo-Buddy, Khun Sean, SR1 Security, AI Police Cyborg 1.0 and Bumi humanoid.

---

## 5. Existing HRI Capabilities

All FACTs from [app/components/RobotViewer.tsx](app/components/RobotViewer.tsx):

| Behaviour | Implementation | Lines |
|---|---|---|
| Gaze-following: head and eye bones track the pointer anywhere in the window | `updatePointerTarget` → `targetHead`, applied to `Head_06` and `Eye Control.L/R` | [174-188](app/components/RobotViewer.tsx#L174-L188), [307-324](app/components/RobotViewer.tsx#L307-L324) |
| Drag to rotate the robot's yaw | `onPointerDown/Move` → `targetRootYaw` | [190-207](app/components/RobotViewer.tsx#L190-L207) |
| "Interaction energy" that rises on engagement and decays when idle, blending idle and attentive behaviour | `interactionEnergy` lerp | [237-258](app/components/RobotViewer.tsx#L237-L258) |
| Breathing (root bob and scale at about 15 breaths per minute: `sin(t·1.55)`) | `breath`, `breathScale` | [247](app/components/RobotViewer.tsx#L247), [256-258](app/components/RobotViewer.tsx#L256-L258) |
| Idle scanning gaze and eye micro-saccades | `idleScan`, `microSaccadeX/Y` | [239-242](app/components/RobotViewer.tsx#L239-L242), [319-320](app/components/RobotViewer.tsx#L319-L320) |
| Timed welcome wave (3.2 s, then every 15-30 s), right arm only | shoulder/elbow/forearm state machine | [260-305](app/components/RobotViewer.tsx#L260-L305) |

**What the HRI is missing (FACT):**
- **No sensing** of the human beyond the mouse pointer.
- **No speech, no text**, and no state shared with the rest of the app.
- **No props or API**: `RobotViewer()` takes no props and exposes nothing.
- The behaviour is **open-loop and decorative**. The human cannot change what the robot does except its yaw, and the robot never "knows" anything about the user or the atlas data.

**Rig affordances available but unused (FACT, parsed from the GLB):**
- `Spine_02` … `Spine.003_05` (posture, slump and bow)
- `Mouth Control_028` + 6 mouth bones (speech visemes and expression)
- `Head Piston.L/R` (mechanical "ears")
- `Arm.L_043/044/045` (left arm)
- `Arm Hand.L/R.000-017` (fingers: wai, open palm, pointing)
- `Leg.*`, `Foot.*`
- Materials `Glow` and `Screen` (emissive state signalling)
- One embedded animation clip

Also visible in the rig: `Arm Cannon.*` and `Arm Gun Shield.*` bones. These are **weapon-themed parts** of the source model. See Gap P5.

---

## 6. Gap Analysis

Difficulty and feasibility use a 1-5 scale. Feasibility 5 means it is easy within one Hack Day.

| # | Area | Current state | Evidence | Why it matters | Potential improvement | Difficulty | HD feasibility |
|---|---|---|---|---|---|---|---|
| A1 | Human interaction | Mouse hover/drag only; no feedback loop | RobotViewer.tsx | No two-way HRI exists; judges will ask "where is the interaction?" | Camera, mic and explicit-control inputs driving robot behaviour | 3 | 4 |
| B1 | Robot perception | None | grep: no `getUserMedia`, MediaPipe or audio code | Robot cannot react to people | On-device MediaPipe pose/hands/face plus WebAudio | 3 | 4 |
| C1 | Robot feedback | Fixed idle loop; one arm; no glow, no mouth | RobotViewer.tsx:260-324 | No communicative behaviour | Behaviour engine: gestures, glow states, breath rate, mouth, TTS | 2 | 5 |
| D1 | Context awareness | Robot has no knowledge of the page, the user or atlas data | RobotViewer has no props | Disconnected from the platform's actual value | Pass atlas context (robot model, confidence, perspectives) into behaviour | 2 | 5 |
| E1 | Personalisation | Only `lang` cookie; `User` has no preferences | schema.prisma `User` | Wellness interventions need personal baselines | Per-user HRI profile (comfort distance, gaze tolerance, pace) | 2 | 4 |
| F1 | Wellness | Wellness exists only as **catalogued data** (robots and themes) | seed JSON, data/taxonomy.yml | The theme needs a *wellness outcome for a human* | Measurable pre/post outcome (self-report and behavioural) | 3 | 4 |
| G1 | Accessibility | CSS honours reduced motion, but **the WebGL loop does not**; canvas is not keyboard-operable; many hard-coded EN strings | globals.css:802; RobotViewer.tsx (no matchMedia); e.g. `/profile`, `/data-pulls` copy | Wellness users include elderly and neurodivergent people | Reduced-motion mode for the robot, keyboard controls, full TH strings, larger targets | 1 | 5 |
| H1 | Safety / security | **Self-service ADMIN**: role `<select>` with ADMIN and a public "Login as Administrator" button; `admin_session` is a forgeable `"true"` cookie | [app/profile/page.tsx:76-99](app/profile/page.tsx#L76-L99), [app/actions.ts:135-193](app/actions.ts#L135-L193), [middleware.ts:22-24](middleware.ts#L22-L24) | Any visitor can edit or approve data; a living lab with human-subject data cannot run on this | Remove the self-assign path, sign session cookies, check role inside each server action | 2 | 5 |
| H2 | Safety / security | Mutating server actions have **no server-side auth** (`updateSubmissionStatus`, `upsert*Action`, `runDataPull`); `DataPullFab` is mounted for everyone | [app/actions.ts:90-133, 237-379](app/actions.ts), [app/layout.tsx:153](app/layout.tsx#L153) | Server actions are callable endpoints, so UI hiding is not protection | `requireAdmin()` guard in every action; hide the FAB for non-admins | 1 | 5 |
| H3 | Safety / security | **Hard-coded admin password fallback** committed to a public repo | [middleware.ts:30](middleware.ts#L30), [app/actions.ts:210](app/actions.ts#L210) | Anyone deploying without env vars is exposed. **The real credential should be considered leaked and rotated** | Fail closed when env vars are missing | 1 | 5 |
| I1 | Human trust | Trust is studied only as media *perspectives*, and that layer has 4 records | seed JSON stats | The platform is about public trust in robots but never measures it first-hand | Collect first-party trust data from real encounters | 3 | 4 |
| J1 | Explainability | Confidence scores exist on every record (`statusConfidence`, `relevanceConfidence`, `confidence`) but are shown only as numbers or badges | schema.prisma; perspectives page | The atlas has a unique asset: **calibrated uncertainty** | Make the robot *embody* uncertainty (Finalist A) | 3 | 4 |
| K1 | Multimodal | Visual only | n/a | HRI judges expect at least 2 modalities | Gesture + voice/TTS + glow + posture | 3 | 4 |
| L1 | Real-world deployment | Atlas tracks robots deployed in Thai hospitals but nothing connects to a real robot | inventory seeds list NAO and Unitree G1 as `planned` | Continuation path needed | Behaviour engine emits abstract intents that could later map to NAO (NAOqi) or G1 SDK. UNKNOWN whether the team has hardware | 4 | 2 |
| M1 | Data visualisation | Map plots **the IP location of the server hosting each source URL** (CDN or GitHub data-centres), not where research happened | [lib/geo.ts:86-93](lib/geo.ts#L86-L93), [lib/map-points.ts](lib/map-points.ts) | Misleading viz | Relabel as "hosting location", or derive geography from org/affiliation | 2 | 4 |
| M2 | Data integrity | When Gemini fails, the map shows **hard-coded "mock seeds"** and writes them into `StatsCache`, against the README's no-mock rule. `pnpm check:no-mock-data` **already fails on main** | [app/map/actions.ts:19, 249-292](app/map/actions.ts#L249-L292); grep results | Credibility, and an easy, visible fix | Show an honest unavailable state; fix the model ID | 1 | 5 |
| M3 | AI | Gemini model `gemini-1.5-flash` is hard-coded (2 places). INFERENCE: retired upstream, so every call errors and falls back | [lib/classifiers.ts:138](lib/classifiers.ts#L138), [app/map/actions.ts:174](app/map/actions.ts#L174) | AI features are silently dead | Env-configurable model ID with a current model; surface the error | 1 | 5 |
| M4 | Perspectives | 6,714 sources but 4 annotations; there is no batch annotate | seed stats | The Perspectives and Analytics layers look empty in a demo | Batch rule-based annotation job over existing sources | 2 | 5 |
| N1 | Robot autonomy | Timer-driven wave only | RobotViewer.tsx:267-286 | No decision-making | Small state machine, with LLM optional | 3 | 4 |
| O1 | Human control | User cannot pause, slow, mute or stop the robot | n/a | Wellness requires the human to stay in control | Always-visible "pause / too much" control that the robot obeys and acknowledges | 1 | 5 |
| P1 | Platform UX | Overview **always** shows the "empty DB" legacy Python CLI instructions, even with a full DB | [app/page.tsx:912-936](app/page.tsx) (unconditional `terminal-panel`) | Confusing; wrong stack instructions | Render only when counts are 0, using `pnpm db:seed` | 1 | 5 |
| P2 | Platform UX | `/inventory` defaults to **operator mode (serials visible)** for anyone; `accessories` parsing calls `JSON.parse` on an already-parsed `Json` array, which throws, so it always shows "none" | [app/inventory/page.tsx:39, 153-160](app/inventory/page.tsx#L153-L160) | Privacy, plus a bug | Default to public-safe and gate operator mode by role; drop `JSON.parse` | 1 | 5 |
| P3 | Platform UX | Dashboard calls `el.embodimentLevel.replace()` on a nullable column, so it **crashes** after an admin creates a robot without an embodiment level (CMS sends `null`) | [app/dashboard/page.tsx:211](app/dashboard/page.tsx#L211), [app/actions.ts:292](app/actions.ts#L292) | Latent crash | Null-coalesce | 1 | 5 |
| P4 | Platform tooling | `pnpm network:check` points to a non-existent `scratch/` file; root and `public/` both hold the same 7.3 MB GLB and the seed JSON is duplicated | [package.json](package.json), `cmp` results | Hygiene | Remove dupes, fix the script | 1 | 5 |
| P5 | Asset provenance | GLB is a Sketchfab export (`Sketchfab_model` root, `.fbx` id) with weapon bones; licence not recorded | GLB node names | Licence risk; weapon parts are tonally off for wellness | Record licence; hide cannon/shield meshes if they render. UNKNOWN whether they are visible | 2 | 4 |

---

## 7. HRI Wellness Opportunity Areas

**Interpreting "HRI Wellness Living Lab" for *this* repo (INFERENCE).** The atlas already answers *which robots exist in Thai wellness settings* and *what the public says about them*. What it cannot answer is **what happens to a person when they meet one**. A *living lab* is a real-context, iterative, data-producing environment. The natural extension therefore turns encounters with the platform's robot avatar into instrumented, consented, wellness-relevant HRI sessions whose results flow back into the atlas.

Opportunity areas that fit both the theme and our assets:

| Area | Why it fits HumanoidTH | Generic trap to avoid |
|---|---|---|
| **Trust calibration** (healthy reliance on robots) | Every record has a confidence score; the perspectives taxonomy has `healthcare_and_eldercare_trust` and `safety_and_reliability` | "Robot answers questions" chatbot |
| **Robot anxiety / acceptance** before hospital robot deployment | Registry lists robots `deployed_in_thailand` in hospitals; perspectives cover job and safety fears | "Elder companion" |
| **Physiological co-regulation** (breathing, calm) | Avatar already has a breathing loop | Breathing app with a mascot |
| **Rehabilitation** (stroke, physical therapy) | Chula stroke rehab and CORGI PT robots are in the registry; the rig has both arms and fingers | "Exercise reminder robot" |
| **Cultural and social comfort** (Thai *wai*, proxemics, gaze) | Bilingual Thai platform; rig has fingers and spine for a wai | Generic face or emotion recognition |
| **Consent, legibility and human control** | Platform already has a strong privacy and governance ethic ([docs/data-governance.md](docs/data-governance.md)) | (cross-cutting; strengthens every idea) |
| **Workplace micro-recovery** | Desk researchers are the atlas's own users | Posture-nag app |

---

## 8. 16 Candidate Features

Scoring scales:
- **Cx** (technical complexity, 1-5): higher means harder.
- **HD** (Hack Day feasibility, 1-5): higher means easier.
- **Impact** (demo impact, 1-5): higher is better.
- **Risk** (dependency risk, 1-5): higher is riskier.

Shared new building blocks referenced below:
- **BE**: the Behaviour Engine, a refactored `RobotViewer` with a command API.
- **SENSE**: browser MediaPipe and WebAudio sensing.
- **LAB**: the `HriSession` / `HriEvent` Prisma models plus the `/lab` route.

### C1. Honest Body: embodied uncertainty from atlas evidence
- **One-line concept:** The robot presents real atlas facts about Thai wellness robots, and its body shows how sure it is: confident posture and steady gaze at high evidence confidence, hedging gestures, gaze aversion and dimmed glow at low confidence.
- **Human problem:** People over-trust or under-trust health robots and health claims. Calibrated trust is a known safety factor in eldercare and hospital HRI.
- **HRI interaction:** User asks or picks a question ("Can Pinto deliver meds in Thai hospitals?"). The robot answers with body language matched to evidence strength. The user rates their trust and can tap "show evidence" to see sources.
- **Robot behaviour:**
  - Posture, spine, gaze stability, hand openness, glow intensity and speech hedges are parametrised by confidence.
  - The robot points (arm) to an evidence card.
- **AI component:** Retrieval over Prisma (RobotModel, SourceRecord, Triplet). Optional LLM to phrase answers, constrained to the retrieved evidence. A deterministic confidence → behaviour mapping.
- **Data required:** Existing `statusConfidence`, `relevanceConfidence`, `evidence_excerpt`, triplets.
- **Existing components reused:** RobotViewer, Prisma models, robots page, classifiers, translations.
- **New components:** BE; question picker or answer composer; trust-rating capture; LAB logging; Brier-style calibration score.
- **Integration point:** New "Ask the robot" panel on `/robots/[id]` and the Overview robot stage.
- **Demo scenario:** Two questions, one high-confidence and one low-confidence. Show the visibly different body language, the user's trust ratings, and a live calibration chart.
- **Why it is different:** Robots are usually designed to look *confident*. This one is designed to look *honest*. Nonverbal uncertainty display is an active HRI research topic, and the atlas's confidence scores make it data-grounded rather than scripted.
- **Cx** 3 · **HD** 4 · **Impact** 4 · **Risk** 2

### C2. Robot Pre-Exposure Clinic: graded exposure before meeting a hospital robot
- **One-line concept:** A patient or elder rehearses meeting a specific Thai hospital robot through a graded exposure ladder with the avatar. They control the pace, and the session yields a "readiness and preferences" card for the real deployment.
- **Human problem:** Robot anxiety (measurable with NARS) reduces acceptance of deployed care robots. Thai hospitals are deploying robots now (Pinto, Mr SAM, Ninja in the registry).
- **HRI interaction:** Ladder steps:
  1. robot idle at a distance
  2. robot looks at you
  3. robot approaches
  4. robot gestures
  5. robot speaks
  6. robot reaches toward you

  At each step the user reports SUDS 0-10 (slider or keyboard) and can press **"too much"**. The robot then *visibly backs off, apologises and slows down*.
- **Robot behaviour:** Camera-distance dolly (approach), gaze contact, arm reach, speech; legible pre-announcement ("I'm going to raise my hand"); retreat on stop.
- **AI component:** An adaptive staircase policy (rules) that moves up or down the ladder from SUDS and dwell time. Optional MediaPipe face-distance or lean-back detection as an implicit stop signal.
- **Data required:** SUDS ratings, step timings, stop events; pre/post 4-item short NARS.
- **Existing components reused:** RobotViewer, robot registry (select target robot and its use case), Perspectives themes (safety, job fears) shown as "common worries".
- **New components:** BE; ladder state machine; SUDS UI; LAB; readiness card (printable).
- **Integration point:** `/robots/[id]` → "Prepare to meet this robot" → `/lab/exposure?robot=pinto`.
- **Demo scenario:** Volunteer judge does the ladder, hits "too much" at step 4, and the robot backs off and re-approaches more slowly. The judge finishes, and the before/after anxiety score and the card appear.
- **Why it is different:** It reframes the companion robot as **the robot as its own desensitisation tool**: graded exposure applied to human-robot acceptance and tied to real deployments.
- **Cx** 3 · **HD** 4 · **Impact** 4 · **Risk** 2

### C3. Breath Co-Regulation: the robot mirrors, then leads your breathing
- **One-line concept:** The avatar's existing breathing loop becomes a co-regulation partner. It first matches the user's breathing rate, then slowly entrains them toward about 6 breaths per minute.
- **Human problem:** Acute stress, for example in hospital waiting rooms or workplaces. Slow-paced (resonance) breathing has strong evidence for downregulating arousal.
- **HRI interaction:** User sits in front of the laptop. The robot detects their breathing rhythm, synchronises its chest, shoulders and glow to it, and then gradually lengthens its own cycle. The user follows the robot's body, not a UI circle.
- **Robot behaviour:** Variable breath rate driving spine bones, shoulder rise, root scale and glow pulse. Eye closing and head drop for "exhale".
- **AI component:** Breathing-rate estimation from either (a) MediaPipe Pose shoulder-y oscillation with band-pass filtering and peak detection, or (b) the mic amplitude envelope. Includes a mirroring-to-leading controller.
- **Data required:** Breath-rate time series (derived numbers only, no raw video).
- **Existing components reused:** `breath` and `breathScale` in RobotViewer ([247-258](app/components/RobotViewer.tsx#L247-L258)), analytics charts.
- **New components:** BE (breath-rate input), SENSE, signal processing, LAB, session chart.
- **Integration point:** `/lab/breathe`, plus an optional "calm mode" toggle on the Overview robot.
- **Demo scenario:** Judge sits down and the live chart shows their rate (for example 16/min). The robot syncs, then leads. Within about 90 seconds the chart trends toward 8-10/min, and the summary shows the reduction.
- **Why it is different:** Breathing apps exist, but **embodied mirroring followed by leading** is the HRI contribution. It is social entrainment, not a timer.
- **Cx** 3 · **HD** 4 · **Impact** 5 · **Risk** 3 (sensing noise)

### C4. Mirror-Therapy Avatar for upper-limb stroke rehab
- **One-line concept:** Webcam tracks the user's *unaffected* arm. The avatar mirrors it on the *affected* side in real time, a digital version of clinically used mirror therapy, with guided task prompts and a repetition count.
- **Human problem:** Stroke survivors need high-repetition upper-limb practice. Mirror therapy is an established adjunct. Thailand's Chula stroke rehab robot is already in the registry.
- **HRI interaction:** The robot demonstrates a movement (raise arm, reach, open hand). The user performs it with the good arm, and the avatar's opposite arm moves as if it were the user's affected limb. The robot counts reps and encourages.
- **Robot behaviour:** Real-time arm retargeting (shoulder and elbow angles from pose landmarks to arm bones), demonstrations, praise gestures.
- **AI component:** MediaPipe Pose landmarks → joint angles → bone rotations; repetition detection; range-of-motion tracking.
- **Data required:** Joint-angle time series and rep counts.
- **Existing components reused:** RobotViewer arm bones (`Arm.L_043/044/045`, `Arm.R_069/070/071`), robot registry (link to Chula rehab robot and CORGI), analytics.
- **New components:** BE with IK-lite retargeting, SENSE, rep counter, LAB, ROM chart.
- **Integration point:** `/lab/mirror` linked from the rehab robots' cards.
- **Demo scenario:** Judge raises their right arm and the avatar raises its *left* in sync. The robot asks for 5 reaches, counts them, and shows the range-of-motion curve.
- **Why it is different:** It turns an avatar from a mascot into a **therapeutic embodiment** (the robot body *becomes* the user's limb), which is rare at hackathons and grounded in clinical practice.
- **Cx** 4 · **HD** 3 · **Impact** 5 · **Risk** 3 (bone axis calibration)

### C5. Wai-First Proxemics: culturally grounded greeting and personal-space learning
- **One-line concept:** The robot waits for the user's *wai* (detected via hand landmarks) before engaging, returns a wai of appropriate depth, and then learns the user's comfortable interaction distance and gaze tolerance.
- **Human problem:** Western-designed robots violate Thai social norms (direct gaze, unsolicited approach, waving instead of a wai), which causes discomfort, especially for elders.
- **HRI interaction:** User performs a wai and the robot reciprocates (both arms, palms together, spine and head bow). The robot then approaches in small steps. The user's lean-back or face-size change marks the comfort boundary, which is stored as a proxemics profile.
- **Robot behaviour:** Wai gesture (both arms plus finger bones plus spine bow), respectful downcast gaze option, approach and stop, distance memory.
- **AI component:** MediaPipe Hands for the wai (both palms close together in front of the chest or face for more than 0.5 s); face-landmark scale for distance; lean-back detection; per-user threshold estimation.
- **Data required:** Wai detection events, comfort distance, gaze-aversion preference.
- **Existing components reused:** RobotViewer (replace the Western wave with a wai), translations (Thai greetings), User model (profile).
- **New components:** BE (two-arm poses), SENSE, LAB, profile fields.
- **Integration point:** Overview robot stage (wai greeting replaces the timed wave) and `/lab/greet`.
- **Demo scenario:** Judge waves and the robot politely waits. Judge performs a wai, and the robot returns the wai and says "สวัสดีครับ". It approaches, the judge leans back, and the robot stops and remembers. On the next visit it greets at the learned distance.
- **Why it is different:** **Culturally specific HRI** that a Thai jury will immediately recognise; almost nobody builds it.
- **Cx** 3 · **HD** 4 · **Impact** 5 · **Risk** 2

### C6. Legible and Consent-First Robot Mode
- **One-line concept:** The robot announces every motion before doing it ("I'm going to look at you now… 3, 2, 1") and obeys user-set boundaries: no eye contact, no approach, voice off, slow motion.
- **Human problem:** Unpredictable robot motion causes stress, especially for autistic or anxious users and older adults.
- **HRI interaction:** Boundary panel plus a pause control. The robot narrates its intentions and asks permission for "intrusive" behaviours.
- **Robot behaviour:** Intent announcements, motion slowdown, gaze aversion modes.
- **AI component:** Rule-based policy.
- **Data required:** User boundary settings.
- **Existing components reused:** RobotViewer, User model, `prefers-reduced-motion`.
- **New components:** BE, boundary UI, LAB.
- **Integration point:** Global robot settings.
- **Demo scenario:** Toggle "no eye contact" and the robot's gaze shifts to your shoulder. Press pause and the robot freezes and says it has paused.
- **Why it is different:** Legibility and consent as first-class features.
- **Cx** 2 · **HD** 5 · **Impact** 3 · **Risk** 1

### C7. Living Lab Study Kit (session, consent, questionnaire, Wizard-of-Oz console)
- **One-line concept:** Turn the atlas into an HRI research instrument: protocol → consent → session with the avatar → questionnaires (Godspeed, NARS, SUDS) → anonymised results in analytics, plus a Wizard-of-Oz panel for researcher-triggered robot behaviours.
- **Human problem:** Thai HRI researchers (the atlas's user base) lack shared infrastructure for running and comparing wellness HRI studies.
- **HRI interaction:** Participant interacts with the robot while a researcher, in a second window, triggers behaviours or observes in real time.
- **Robot behaviour:** Any BE behaviour triggered remotely.
- **AI component:** Minimal; statistics in analytics.
- **Data required:** Sessions, events, questionnaire answers.
- **Existing components reused:** Prisma, AnalyticsPlayground, admin console, governance docs, profile.
- **New components:** LAB models, `/lab` routes, WoZ channel (BroadcastChannel on one machine, or polling an API route), questionnaire forms.
- **Integration point:** New sidebar section, Analytics scope "HRI sessions".
- **Demo scenario:** Researcher clicks "wave" in the WoZ window and the robot in the participant window waves. The questionnaire is submitted and the analytics chart updates.
- **Why it is different:** It is literally a "living lab" built into a national atlas. **Weak HRI on its own**; strong as a backbone.
- **Cx** 3 · **HD** 4 · **Impact** 3 · **Risk** 1

### C8. Reciprocal Micro-Break: the robot needs a stretch too
- **One-line concept:** During long sessions on the atlas, the robot visibly gets "tired" (slumping spine, dimming glow) and asks the user to stretch *with* it. It mirrors the user's movement and perks up as they move.
- **Human problem:** Sedentary knowledge workers; break reminders are ignored.
- **HRI interaction:** Robot-initiated, reciprocal care (the protégé effect: people do for others what they skip for themselves).
- **Robot behaviour:** Fatigue posture, invitation, synchronous stretch, recovery.
- **AI component:** Pose-based stretch completion detection.
- **Data required:** Session time, stretch completion.
- **Existing components reused:** RobotViewer (global in layout), Overview.
- **New components:** BE, SENSE, timer, LAB.
- **Integration point:** App-wide robot dock.
- **Demo scenario:** Fast-forward a timer; the robot slumps and asks, the user stretches, and the robot recovers.
- **Why it is different:** It reverses the care direction, but the core use case (posture/break apps) is crowded.
- **Cx** 3 · **HD** 4 · **Impact** 3 · **Risk** 2

### C9. Public Sentiment Embodiment (the robot feels what Thailand thinks)
- **One-line concept:** The robot's posture and glow express aggregated stance and sentiment from Perspectives for a chosen robot or theme.
- **Human problem:** Hard to grasp public opinion data.
- **HRI interaction:** Minimal; mostly viewing.
- **Robot behaviour:** Mood posture.
- **AI component:** Aggregation.
- **Data required:** Perspective annotations (only 4 exist).
- **Existing components reused:** Perspectives, RobotViewer.
- **New components:** Mapping.
- **Integration point:** `/perspectives`.
- **Demo scenario:** Pick "job displacement" and the robot slumps.
- **Why it is different:** Data physicalisation; but little human-robot *interaction*.
- **Cx** 2 · **HD** 5 · **Impact** 2 · **Risk** 3 (data sparse)

### C10. Caregiver Robot Matchmaker
- **One-line concept:** A needs questionnaire recommends a Thai wellness robot from the registry, and the avatar explains it.
- **Human problem:** Families do not know which assistive robots exist.
- **HRI interaction:** Form plus talking avatar.
- **Robot behaviour:** Talks, points.
- **AI component:** LLM recommender.
- **Data required:** Registry.
- **Existing components reused:** Robots, LLM.
- **New components:** Questionnaire, LLM prompt.
- **Integration point:** `/robots`.
- **Demo scenario:** "Mother had a stroke" → recommends Chula rehab robot.
- **Why it is different:** Not very; this is a chatbot recommender.
- **Cx** 2 · **HD** 5 · **Impact** 2 · **Risk** 3

### C11. Silent Distress Signal recogniser
- **One-line concept:** The robot recognises the "Signal for Help" hand gesture and calmly acknowledges and escalates.
- **Human problem:** Safety of vulnerable people.
- **HRI interaction:** Gesture → robot acknowledgment.
- **Robot behaviour:** Calm, discreet acknowledgment.
- **AI component:** Hand-gesture sequence detection.
- **Data required:** None stored.
- **Existing components reused:** RobotViewer.
- **New components:** SENSE, gesture sequence, notification.
- **Integration point:** Robot dock.
- **Demo scenario:** Judge makes the sign; the robot acknowledges and a "caregiver alert" appears.
- **Why it is different:** Novel gesture. **Ethically fraught**: false negatives in a real emergency; overclaim risk.
- **Cx** 3 · **HD** 3 · **Impact** 4 · **Risk** 4

### C12. Turn-Taking Pace Adapter for older speakers
- **One-line concept:** The robot measures the user's speech rate and response latency and adapts its own speaking speed and waiting time.
- **Human problem:** Elders are interrupted by voice systems.
- **HRI interaction:** Spoken dialogue.
- **Robot behaviour:** Slower TTS, longer pauses, mouth sync.
- **AI component:** Speech-to-text and timing.
- **Data required:** Speech timing.
- **Existing components reused:** RobotViewer mouth bones.
- **New components:** Web Speech API STT (Thai quality and availability vary by browser), TTS.
- **Integration point:** Robot dock.
- **Demo scenario:** Fast speaker vs. slow speaker.
- **Why it is different:** Good HRI idea, but it reads as a "voice assistant" and Thai STT in a noisy venue is unreliable.
- **Cx** 4 · **HD** 2 · **Impact** 3 · **Risk** 5

### C13. Telepresence Puppeteer for distant family
- **One-line concept:** A family member puppets the avatar's head and arms via their webcam to "be present" with an elder (inspired by Mirror Telepresence and Ninja in the registry).
- **Human problem:** Loneliness of elders with distant families.
- **HRI interaction:** Mediated human-robot-human interaction.
- **Robot behaviour:** Real-time retargeting from a remote user.
- **AI component:** Pose retargeting.
- **Data required:** Realtime stream.
- **Existing components reused:** RobotViewer.
- **New components:** Realtime transport (WebRTC or WebSocket; Vercel has no native WebSockets), retargeting.
- **Integration point:** `/lab/telepresence`.
- **Demo scenario:** Two laptops.
- **Why it is different:** Interesting, but two-device networking at a venue is risky and it overlaps with the C4 retargeting work.
- **Cx** 5 · **HD** 2 · **Impact** 4 · **Risk** 5

### C14. Deployment Readiness Simulator for hospitals
- **One-line concept:** An admin selects a robot and a ward and gets a predicted acceptance score from perspectives and registry data.
- **Human problem:** Hospital procurement.
- **HRI interaction:** None with a robot.
- **Robot behaviour:** n/a.
- **AI component:** Heuristic score.
- **Data required:** Perspectives (sparse).
- **Existing components reused:** Dashboards.
- **New components:** Form, score.
- **Integration point:** `/dashboard`.
- **Demo scenario:** Pick robot and ward, see the score.
- **Why it is different:** It is not HRI; it is a dashboard.
- **Cx** 2 · **HD** 5 · **Impact** 1 · **Risk** 3

### C15. Gaze-Load Regulator for cognitive load
- **One-line concept:** The robot reduces eye contact and gesture amplitude when it detects user cognitive load (blink rate, head stillness) while the user reads dense atlas pages.
- **Human problem:** Social robots add cognitive load.
- **HRI interaction:** Implicit.
- **Robot behaviour:** Calmer, less gaze.
- **AI component:** Face-landmark blink and attention estimation.
- **Data required:** Blink rate.
- **Existing components reused:** RobotViewer gaze.
- **New components:** SENSE.
- **Integration point:** Overview.
- **Demo scenario:** Hard to make visible.
- **Why it is different:** The idea is good, but the scientific validity of blink rate as a load signal over a few minutes is weak, and the effect is invisible on stage.
- **Cx** 3 · **HD** 3 · **Impact** 2 · **Risk** 3

### C16. Robot-to-Real Bridge (NAO / Unitree G1 behaviour export)
- **One-line concept:** The Behaviour Engine emits abstract intents (`gaze(x, y)`, `wai()`, `approach(d)`) that a bridge maps to a real NAO or G1 listed in the inventory.
- **Human problem:** The living lab needs real robots eventually.
- **HRI interaction:** Same as the chosen feature, on hardware.
- **Robot behaviour:** Physical.
- **AI component:** None.
- **Data required:** n/a.
- **Existing components reused:** OwnedInventory (NAO and G1 are listed as *planned*).
- **New components:** Python bridge (NAOqi / Unitree SDK).
- **Integration point:** Inventory.
- **Demo scenario:** Same gesture on screen and on the robot.
- **Why it is different:** Strong continuation story, but hardware availability is UNKNOWN (seed says `planned`).
- **Cx** 5 · **HD** 1 · **Impact** 5 · **Risk** 5

---

## 9. Rejected Concepts

| Candidate | Verdict | Reason |
|---|---|---|
| C9 Public Sentiment Embodiment | **Reject** | Mostly data visualisation; the human does not *interact*; perspectives layer has 4 rows. Could be a 30-minute easter egg later. |
| C10 Caregiver Matchmaker | **Reject** | Generic LLM chatbot recommender; HRI is decorative; depends on an LLM key. |
| C11 Silent Distress Signal | **Reject** | Safety-critical claim we cannot validate; a false negative in a demo is ethically and optically bad; implies an escalation infrastructure we do not have. |
| C12 Turn-Taking Pace Adapter | **Reject** | Thai STT via Web Speech API is browser- and OS-dependent and fragile in a noisy venue; reads as a "voice assistant". |
| C13 Telepresence Puppeteer | **Reject** | Two-device realtime networking (WebRTC or WebSocket; Vercel lacks native WS) is the top cause of failed hackathon demos; its best part (retargeting) survives in D. |
| C14 Deployment Readiness Simulator | **Reject** | Not HRI; a dashboard with a heuristic. |
| C15 Gaze-Load Regulator | **Reject** | Signal validity is weak and the effect is invisible on stage. |
| C16 Robot-to-Real Bridge | **Defer** | Hardware UNKNOWN. Keep as the "future work" slide; design the Behaviour Engine's intent API so it is possible. |
| C6 Legible and Consent-First Mode | **Merge** into every finalist | Too thin alone, but it is the ethical backbone (pause control, intent announcements). |
| C7 Living Lab Study Kit | **Merge** as the shared backbone | Weak HRI alone; it is what makes any finalist a *living lab* and *integrated* (sessions → analytics). |
| C8 Reciprocal Micro-Break | **Hold** | Viable runner-up, but crowded use case and the weakest wellness evidence of the survivors. |

---

## 10. Top 5 Concepts

All five share the same pre-Hack-Day foundation (§15):
- **BE**: Behaviour Engine.
- **LAB-lite**: session and event logging.
- **Consent/pause UI**.
- **Platform fixes.**

### A. Honest Body: trust-calibrated embodied evidence (C1)
- **Concept:** The robot speaks for the atlas, and its body shows how strong the evidence is. Users rate trust; the system measures calibration.
- **Why it fits HumanoidTH:**
  - It is the only finalist that uses the atlas's *core asset*: provenance and confidence on every record ([prisma/schema.prisma](prisma/schema.prisma) `statusConfidence`, `relevanceConfidence`, `confidence`; evidence excerpts).
  - It turns README principles ("Do not treat inferred … as exact", confidence buckets 0.85 / 0.60) into robot behaviour.
- **Exact integration points:**
  - [app/components/RobotViewer.tsx](app/components/RobotViewer.tsx) → BE `setConfidenceStyle(c)`.
  - [app/robots/page.tsx](app/robots/page.tsx) → per-robot "Ask" panel (new `app/robots/[id]/page.tsx`).
  - [lib/network-graph.ts](lib/network-graph.ts) `getNetworkNode()` for triplet evidence.
  - [lib/classifiers.ts](lib/classifiers.ts): fix the model ID, add an optional answer composer.
  - New `lib/hri/confidence-behaviour.ts`.
  - LAB models.
  - [app/analytics/page.tsx](app/analytics/page.tsx) new scope.
- **Build:**
  - Question templates per robot (status, use case, developer, deployment) answered from DB fields.
  - Confidence → behaviour mapping: posture, gaze steadiness, hand openness, glow, hedge words.
  - Trust slider and calibration metric (mean |trust − confidence|).
  - "Show evidence" card with source links.
- **Reuse:** Registry data, evidence excerpts, triplets, translations, recharts.
- **Demo flow:** §13-A.
- **Risks:**
  - Differences in body language must be *obvious*, so exaggerate them.
  - The LLM answer may hallucinate, so use template answers by default.
- **Backup plan:** Pure template answers (no LLM) plus pre-picked robots with high and low confidence. Without a camera, the feature still works fully.
- **Effort:** About 10-14 dev-hours after the foundation.
- **Before Hack Day:** BE; confidence-style parameters tuned; pick demo robots and verify their seed confidences; fix Gemini model ID.
- **During Hack Day:** Ask panel, templates, trust capture, calibration chart, polish.

### B. Robot Pre-Exposure Clinic (C2 + C6)
- **Concept:** Graded exposure to a specific deployed Thai hospital robot's behaviours, with user-controlled pace and stop. It produces an anxiety-reduction outcome and a personalised preferences card.
- **Why it fits HumanoidTH:**
  - Registry already marks hospital robots `deployed_in_thailand`.
  - The Perspectives taxonomy has `safety_and_reliability` and `healthcare_and_eldercare_trust`.
  - The atlas becomes the bridge between *knowing about* a robot and *being ready to meet* it.
- **Exact integration points:**
  - RobotViewer → BE (`approach(d)`, `gazeAt(user)`, `reach()`, `say()`, `retreat()`).
  - New `app/lab/exposure/page.tsx`.
  - `app/robots/page.tsx` link per robot.
  - LAB models.
  - `app/actions.ts` (new `saveExposureSession` with auth).
  - [lib/translations.ts](lib/translations.ts) (Thai SUDS wording).
- **Build:**
  - 6-step ladder state machine with adaptive staircase.
  - SUDS slider (0-10, large touch targets, keyboard 0-9).
  - "Too much" button: retreat, apology, slow-down.
  - Short pre/post questionnaire.
  - Readiness card.
- **Reuse:** Registry, perspectives (show 1-2 real "common worries"), translations.
- **Demo flow:** §13-B.
- **Risks:**
  - Ethically framed as *preparation*, not therapy.
  - The pre/post change in a 2-minute demo is self-report and suggestive only.
  - Camera distance alone must make "approach" feel real, so tune the FOV.
- **Backup plan:** No sensing is required at all; optional MediaPipe lean-back detection is a stretch goal.
- **Effort:** About 10-12 dev-hours after the foundation.
- **Before Hack Day:** BE approach and retreat; ladder spec; Thai copy; questionnaire item selection.
- **During Hack Day:** Ladder UI, logging, readiness card, polish.

### C. Breath Co-Regulation (C3)
- **Concept:** The robot breathes *with* you, then leads you down to a slower rate.
- **Why it fits HumanoidTH:** It reuses the avatar's existing breathing loop ([RobotViewer.tsx:247-258](app/components/RobotViewer.tsx#L247-L258)), the smallest conceptual leap from today's code. The wellness outcome is a *physiological number*, not just self-report.
- **Exact integration points:**
  - RobotViewer → BE `setBreathRate(bpm, phase)` (replace the constant `1.55` rad/s, which is about 14.8 breaths per minute).
  - New `lib/hri/breath-estimator.ts`.
  - New `app/lab/breathe/page.tsx`.
  - LAB.
  - Analytics.
- **Build:**
  - Breath estimator: MediaPipe Pose shoulder/torso landmark y-signal → detrend → band-pass 0.1-0.5 Hz → peak interval → bpm. Alternative: mic RMS envelope.
  - Mirror → lead controller that reduces the target by about 1 bpm every 3 cycles if the user follows.
  - Glow pulse.
  - Live chart.
- **Reuse:** Breathing animation, recharts, translations.
- **Demo flow:** §13-C.
- **Risks:**
  - Shoulder breathing signal is weak with loose clothing or a moving subject.
  - Stage lighting.
  - The mic picks up crowd noise.
- **Backup plan:**
  - "Tap/hold space while inhaling" input mode.
  - A chest-held phone is overkill; skip it.
  - Robot-led mode without sensing still works.
- **Effort:** About 12-16 dev-hours after the foundation, mostly signal tuning.
- **Before Hack Day:** Estimator prototype tested on 5+ people in 2+ lighting conditions; vendor MediaPipe model files.
- **During Hack Day:** Integrate, controller tuning, session summary, polish.

### D. Mirror-Therapy Avatar for stroke rehab (C4)
- **Concept:** The avatar's arm becomes the user's affected arm, mirroring the healthy arm in real time, with a guided rep protocol and range-of-motion tracking.
- **Why it fits HumanoidTH:**
  - Directly connected to registry robots *Chula Rehabilitation Robots for Stroke Patients* and *CORGI PT Assistant*.
  - Uses the rig's unused left arm and finger bones.
  - Most "clinical" wow factor.
- **Exact integration points:**
  - RobotViewer → BE `setArmAngles(side, {shoulderPitch, shoulderRoll, elbow})` for `Arm.L_043/044/045` and `Arm.R_069/070/071`.
  - New `lib/hri/pose-retarget.ts`, `app/lab/mirror/page.tsx`.
  - Link from those robot cards.
  - LAB.
- **Build:**
  - Landmark → joint angle (2D or 3D world landmarks).
  - Per-bone axis calibration table (the rig's local axes are unknown until tested; the existing wave code shows shoulder uses z/x and elbow uses y).
  - Smoothing (One-Euro filter).
  - Rep detector, ROM chart.
  - Demo-by-robot.
- **Reuse:** Arm bone names already discovered in code; analytics.
- **Demo flow:** §13-D.
- **Risks:**
  - Retargeting looks broken if axes are wrong (highest technical risk of the five).
  - Medical-claim boundary: present it as a "rehab engagement prototype".
  - A side-on camera angle degrades pose.
- **Backup plan:** Discrete-pose mode: detect 3 target poses (arm down, side-raise, forward-reach) and snap the avatar to authored poses. It still mirrors and still counts reps.
- **Effort:** About 14-18 dev-hours after the foundation.
- **Before Hack Day:** **Mandatory** retargeting spike: get one arm mirroring smoothly before committing.
- **During Hack Day:** Protocol, rep counter, ROM chart, encouragement, polish.

### E. Wai-First Proxemics (C5 + C6)
- **Concept:** The robot follows Thai social norms. It waits for and returns a wai, avoids staring, approaches respectfully, and learns each user's comfort distance.
- **Why it fits HumanoidTH:**
  - A Thai national atlas with a Thai jury; replaces the current Western wave ([RobotViewer.tsx:260-305](app/components/RobotViewer.tsx#L260-L305)) on the *home page* of the platform.
  - Proxemics and gaze profiles become first-party data on what makes Thai users comfortable with humanoids, which the Perspectives layer currently only infers from media.
- **Exact integration points:**
  - RobotViewer → BE `wai(depth)`, `approach(d)`, `gazeMode('respectful' | 'direct')`.
  - New `lib/hri/wai-detector.ts`.
  - [app/page.tsx](app/page.tsx) robot stage.
  - New `app/lab/greet/page.tsx`.
  - `User` profile fields (or `HriProfile`).
  - [lib/translations.ts](lib/translations.ts).
- **Build:**
  - Wai detector: MediaPipe Hands, both palms, wrist distance < threshold, fingertips up, hands in upper torso, held ≥ 500 ms.
  - Authored two-arm wai pose plus spine and head bow.
  - Approach steps and stop on lean-back (face bounding-box shrink) or button.
  - Profile persistence.
- **Reuse:** Wave state machine structure, gaze code, translations, User model.
- **Demo flow:** §13-E.
- **Risks:**
  - Authoring a convincing wai with this sci-fi rig (fingers have 18 bones per hand) takes time.
  - The approach is a camera dolly, which is subtle; make it big.
  - Cultural accuracy: consult Thai teammates on wai levels (age/status hierarchy); **do not infer age from the face**, let the user choose.
- **Backup plan:**
  - Button "ไหว้" (wai) if hand detection fails.
  - Proxemics via slider.
- **Effort:** About 10-14 dev-hours after the foundation.
- **Before Hack Day:** Wai pose authored; detector prototype.
- **During Hack Day:** Proxemics learning, persistence, greeting flow, polish.

---

## 11. Detailed Integration Analysis

### 11.1 The key extension point: `RobotViewer` → Behaviour Engine (all finalists)

| Aspect | Today (FACT) | Proposed (PROPOSAL) |
|---|---|---|
| Module | [app/components/RobotViewer.tsx](app/components/RobotViewer.tsx): one `useEffect` with closure state, no props | `app/components/robot/RobotStage.tsx` (renderer) + `lib/hri/behaviour-engine.ts` (pure state, testable) + `useRobot()` hook |
| Inputs | Pointer events only | `RobotCommand` union: `gazeAt`, `setBreath`, `pose(name, weight)`, `setArmAngles`, `approach`, `retreat`, `glow(color, intensity)`, `say(text, lang)`, `pause()` |
| Bone access | Hard-coded names for head, eyes and right arm | Bone map module covering spine, both arms, fingers, mouth, head pistons |
| Materials | Untouched | `Glow` / `Screen` emissive control for state (calm blue, attentive teal, uncertain amber, paused grey) |
| Accessibility | Ignores reduced motion | `matchMedia('(prefers-reduced-motion)')` → damped motion; keyboard controls; live-region text describing robot actions (doubles as legibility) |
| Lifecycle | Re-created per mount, home only | Same, plus an optional global dock for C8 later |
| Backwards compatibility | n/a | With no commands, the default policy reproduces today's idle, gaze and greeting, so the Overview keeps working |

Required changes:
- `app/components/RobotViewer.tsx`: refactor, keeping it as a thin wrapper.
- New `lib/hri/{behaviour-engine,bones,poses}.ts`.
- `app/page.tsx` → unchanged import, optional props.

### 11.2 Living-lab persistence (all finalists)

New Prisma models in [prisma/schema.prisma](prisma/schema.prisma) (PROPOSAL):

```prisma
model HriSession {
  id           String     @id @default(cuid())
  protocol     String     // "honest_body" | "exposure" | "breathe" | "mirror" | "greet"
  robotModelId String?    // links to existing RobotModel → integrates with /robots
  robotModel   RobotModel? @relation(fields: [robotModelId], references: [id], onDelete: SetNull)
  userId       String?    // optional; anonymous allowed
  consent      Json       // what was consented (camera on-device only, data retention)
  preJson      Json       @default("{}")
  postJson     Json       @default("{}")
  summaryJson  Json       @default("{}") // e.g. bpmStart, bpmEnd, sudsPeak, calibrationError, comfortDistance
  startedAt    DateTime   @default(now())
  endedAt      DateTime?
  events       HriEvent[]
  @@index([protocol])
}

model HriEvent {
  id        String     @id @default(cuid())
  sessionId String
  session   HriSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  t         Float      // seconds since start
  kind      String     // "robot_action" | "user_signal" | "rating" | "stop"
  payload   Json       @default("{}")
  @@index([sessionId])
}
```

- **Write path:** a new server action in `app/actions.ts` (with input validation via the already-installed `zod`), or a route handler `app/api/lab/sessions/route.ts`. Batch events client-side and post once at session end; this is the simplest and most reliable path.
- **Read path:**
  - [app/analytics/page.tsx](app/analytics/page.tsx) adds an `hri` scope to the `events` array (the existing shape already supports arbitrary `eventType`).
  - `/robots` shows "N lab sessions" per robot.
- **Governance:** Camera frames never leave the browser; store derived numbers only. Consistent with [docs/data-governance.md](docs/data-governance.md).
- **Guard:** Avoid the words "mock / sample / simulated / fallback / fake / dummy" in `app/**` (enforced by [scripts/assert-no-mock-data.ts](scripts/assert-no-mock-data.ts)). Call the avatar "virtual robot" or "digital twin", not "simulated".

### 11.3 Sensing layer

- **Dependency:** `@mediapipe/tasks-vision` (one new npm dependency; WASM runs on-device). **Vendor the `.task` model files and WASM into `public/mediapipe/`** before Hack Day so the venue Wi-Fi is irrelevant.
- **Module:** `lib/hri/sense/{pose,hands,face,audio}.ts` exposing typed observables (for example `onBreathRate`, `onWai`, `onLeanBack`, `onArmAngles`).
- **Consent gate component:** camera is off by default, with a visible indicator and one-click off.

### 11.4 Platform fixes that count as "improve/fix/complete"

These are low-risk and high-credibility, about 3-5 hours total:

| Fix | Files | Gap ref |
|---|---|---|
| Remove self-assign ADMIN role and the "Login as Administrator" button; role from DB only; `requireAdmin()` in every mutating server action; sign or verify the session cookie (HMAC with an env secret) | `app/profile/page.tsx`, `app/actions.ts`, `middleware.ts` | H1, H2 |
| Fail closed when `ADMIN_BASIC_*` are unset; remove hard-coded password (and tell the maintainer to rotate it) | `middleware.ts`, `app/actions.ts` | H3 |
| Env-configurable Gemini model; honest unavailable state on the map instead of hard-coded clusters → `check:no-mock-data` passes again | `lib/classifiers.ts`, `app/map/actions.ts`, `app/network/NetworkGraphClient.tsx` (wording) | M2, M3 |
| Batch-annotate existing sources with the rules classifier so Perspectives and Analytics are not empty | new `scripts/annotate-sources.ts` reusing `extractPerspective` | M4 |
| Inventory: default public-safe, gate operator mode, fix `JSON.parse` on `Json` columns, import `owned_inventory.seed.yml` | `app/inventory/page.tsx`, `lib/seed-importer.ts` | P2 |
| Conditional empty-state with correct `pnpm` commands | `app/page.tsx` | P1 |
| Null-safe dashboard labels | `app/dashboard/page.tsx` | P3 |
| Reduced-motion support in the 3D robot | `RobotViewer.tsx` | G1 |

---

## 12. MVP Design

### A. Honest Body
```text
EXISTING: HumanoidTH registry + evidence confidence scores + 3D avatar
    ↓
NEW: "Ask the robot" with confidence-embodied answers
    ↓
HRI: Human asks → robot answers with body language matched to evidence → human rates trust → robot shows evidence
    ↓
OUTPUT: Trust calibration score (how well the person's trust tracked real evidence), with sessions logged per robot
```
- **MVP must have:** 3 robots × 3 template questions; confidence → posture, gaze and glow mapping (3 levels); trust slider; evidence card; session logged; calibration number plus a small chart.
- **Nice to have:** LLM phrasing constrained to evidence; Thai TTS; aggregated "how trustworthy does the public find X" view in Analytics.
- **Do not build:** Free-form chat; RAG over all 6.7k sources; voice input.

### B. Robot Pre-Exposure Clinic
```text
EXISTING: Registry of robots deployed in Thai hospitals + perspective themes + avatar
    ↓
NEW: Graded exposure ladder bound to a specific robot
    ↓
HRI: Robot escalates behaviour step by step → human reports SUDS or says stop → robot retreats, apologises, slows
    ↓
OUTPUT: Pre/post anxiety change, peak SUDS step, personal preference card (speed, distance, voice)
```
- **MVP must have:** 6-step ladder; approach and retreat; pre-announcements; SUDS keyboard and slider; stop button; pre/post 4 items; readiness card; session saved.
- **Nice to have:** Lean-back auto-stop via MediaPipe; TH TTS; printable card QR.
- **Do not build:** Clinical scoring claims; user accounts beyond the existing profile; multi-robot 3D models.

### C. Breath Co-Regulation
```text
EXISTING: Avatar breathing loop
    ↓
NEW: Breath estimator + mirror→lead controller
    ↓
HRI: Robot senses the user's breathing → synchronises → slowly leads → user follows the robot's body
    ↓
OUTPUT: Breathing rate start → end, time-to-entrain, session chart
```
- **MVP must have:** Pose-based bpm estimate with a confidence indicator; robot breath rate API; mirror (30 s) → lead (60-90 s); live chart; manual space-bar input mode; summary saved.
- **Nice to have:** Mic mode; eyes-closed exhale; 1-minute "calm check" on the Overview.
- **Do not build:** HRV / rPPG heart-rate estimation; wearables; medical claims.

### D. Mirror-Therapy Avatar
```text
EXISTING: Rehab robots in registry + avatar arm bones
    ↓
NEW: Pose retargeting + guided rep protocol
    ↓
HRI: Robot demonstrates → user moves healthy arm → avatar's opposite arm mirrors live → robot counts and encourages
    ↓
OUTPUT: Reps completed, range of motion per rep, session trend
```
- **MVP must have:** Mirror shoulder elevation and elbow flexion for one side; smoothing; 1 exercise × 5 reps; rep counter; ROM chart; session saved; discrete-pose backup.
- **Nice to have:** Hand open/close on the finger bones; 3 exercises; Thai voice encouragement.
- **Do not build:** Full-body IK; clinical assessment scores (e.g. Fugl-Meyer); a second camera.

### E. Wai-First Proxemics
```text
EXISTING: Overview avatar with Western wave + Thai localisation
    ↓
NEW: Wai detection + reciprocal wai + proxemics learning
    ↓
HRI: Human performs wai → robot returns wai → robot approaches → human leans back or stops → robot stops and remembers
    ↓
OUTPUT: Personal comfort distance and gaze preference profile; aggregated Thai comfort data in Analytics
```
- **MVP must have:** Wai detector (≥90% on the team); authored wai pose; approach steps; stop via lean-back or button; profile saved and re-applied on the next visit; respectful-gaze mode.
- **Nice to have:** Wai depth choice (peer or elder); Thai TTS greeting; aggregate comfort-distance histogram.
- **Do not build:** Face-based age, gender or identity estimation; emotion recognition.

---

## 13. Demo Scenarios (2-3 minutes each)

The common opening (20 s) for all demos:
1. "This is HumanoidTH, Thailand's humanoid atlas: 16 Thai robots and 6.7k sources."
2. Show `/robots`.
3. "Before: the atlas *describes* robots, and the robot on the home page is decoration. We also fixed X (for example: anyone could make themselves admin, and the map showed hard-coded data)."

### A. Honest Body
1. Open the **Pinto Robot** card (high-confidence evidence) → "Ask the robot: *Is Pinto used in Thai hospitals?*"
   - The robot stands tall, holds steady eye contact and glows bright teal: "Yes, strong evidence (0.9)."
   - The judge rates trust at 8/10.
2. Open a weakly-sourced robot (for example **UBTECH Walker**, `rumored_unverified` in the YAML seed, or a low-confidence JSON entry) → same question.
   - The robot's gaze drifts, its hands turn palm-up, it tilts its head, the glow turns amber and it says: "I'm not sure. Evidence is weak (0.25)."
3. The judge rates trust at 7/10. The system shows: "Your trust exceeded the evidence by 4.5 points." The robot points to the evidence card with 1 source.
4. **Wellness outcome:** calibrated trust in care robots. Over-trust in hospitals is a safety risk.
5. **Why it matters:** "The atlas's confidence scores now reach people through the robot's body, not a badge."

### B. Robot Pre-Exposure Clinic
1. On the **Mr SAM outpatient robot** card, click "Prepare to meet this robot". The pre-questionnaire takes 15 s.
2. Ladder: the robot looks at you, approaches ("I'm going to come a little closer"), then raises its arm.
3. The judge presses **"Too much"** at the reach step. The robot pauses, steps back, lowers its arm and says: "Sorry, I'll go slower." It retries at half speed and the judge continues.
4. Finish → post-questionnaire → readiness card: "Comfortable with approach; prefers slow arm motions; voice OK." Pre/post anxiety drops from 6 to 3.
5. **Wellness outcome:** reduced anticipatory anxiety, and staff get a preference card.
6. **Why it matters:** robots are entering Thai hospitals now, and patients get no preparation.

### C. Breath Co-Regulation
1. The judge sits; the camera turns on with a consent click. The live chart shows **17 bpm**.
2. The robot's chest, shoulders and glow lock to the judge's rhythm (visible on screen as "synced").
3. Over 90 s the robot slows its breathing and closes its eyes on each exhale. The judge follows the robot.
4. The chart drops to **9 bpm**. Summary: "−8 bpm in 1:40; entrained after 3 cycles."
5. **Wellness outcome:** physiological down-regulation, measured.
6. **Why it matters:** "The robot doesn't tell you to calm down. It *calms down with you* first."

### D. Mirror-Therapy Avatar
1. Open the **Chula Rehabilitation Robots for Stroke Patients** card → "Try mirror therapy".
2. The robot demonstrates a side arm raise. The judge raises their **right** arm, and the robot's **left** arm rises in sync, live.
3. "Five reps." The counter ticks; the robot nods and says "เก่งมาก" (well done) on each rep. The ROM chart shows 5 arcs.
4. Summary saved and linked to the Chula rehab robot entry in the registry.
5. **Wellness outcome:** engaging, measurable rehab repetitions.
6. **Why it matters:** "The robot body becomes the patient's limb."

### E. Wai-First Proxemics
1. Home page. The judge waves; the robot politely waits with its gaze lowered. The judge performs a **wai**.
2. The robot returns a wai (both hands, bow) and says "สวัสดีครับ" (hello).
3. The robot steps closer. The judge leans back, and the robot stops instantly and steps back once: "I'll stay here."
4. Reload. The robot greets at the remembered distance with respectful gaze.
5. Analytics shows the comfort-distance distribution across today's lab participants.
6. **Wellness outcome:** social comfort and dignity.
7. **Why it matters:** "Robots imported into Thailand bring Western social norms. This one learns ours."

---

## 14. Technical Risks

| Risk | Affects | Likelihood | Mitigation |
|---|---|---|---|
| **No DB at the venue.** App needs `DATABASE_URL` (Prisma Postgres / Accelerate); local machine has no Postgres or Docker | All | High | Before Hack Day: provision a Prisma Postgres DB **and** a local Postgres; seed both; rehearse. Lab pages must still run if the session save fails (show "not saved", never fake data) |
| Dependency install / build untested (no `pnpm` locally; typecheck and build not run during this research) | All | Medium | First prep task: `corepack enable && pnpm i && pnpm typecheck && pnpm build`; record failures |
| MediaPipe model download at venue | C, D, E (B optional) | Medium | Vendor WASM and `.task` files in `public/` |
| Lighting and camera angle | C, D, E | Medium | Bring a ring light; fixed laptop position; on-screen tracking-confidence indicator; manual backup input |
| Rig bone axes unknown for left arm, fingers, spine | D, E (B, A partly) | High for D | Bone-axis spike before Hack Day; authored poses as backup |
| Browser TTS Thai voice availability | All (optional) | Medium | Text captions are primary; TTS is a bonus; test on the demo laptop |
| Gemini model / key | A (optional) | High (currently broken) | Template answers by default; LLM optional |
| Over-claiming health benefit | B, C, D | Medium (reputational) | Frame as "living-lab prototype"; measure, don't diagnose; consent screen |
| No-mock guard words in `app/**` | All | Low | Naming conventions (§11.2) |
| Scope creep into C7 kit | All | Medium | LAB-lite only: two models, one write action, one analytics scope |
| Asset licence (Sketchfab GLB) | All (public demo) | Unknown | Ask maintainer; credit the author on the page |

---

## 15. Hack Day Execution Strategy

**Assumption (UNKNOWN):** pre-Hack-Day preparation work is allowed by the rules. If not, move items into the day and shrink the MVP.

### Before Hack Day (common foundation, about 1.5-2 person-days)
1. Fork; `pnpm i`, typecheck, build, `check:no-mock-data` (record the baseline failures); provision DBs; seed.
2. **Platform fixes** (§11.4): auth, Gemini model ID and honest map state, inventory, overview empty-state, dashboard null, reduced motion. Separate small PRs.
3. **Behaviour Engine** refactor with no behaviour change on the Overview, plus a debug panel to trigger each command.
4. **Bone-axis spike:** both arms, spine, head, glow material; document in `lib/hri/bones.ts`.
5. **LAB-lite:** Prisma models, save action, Analytics scope.
6. Vendor MediaPipe; build the consent gate.
7. Feature-specific spike for the chosen finalist (the D retargeting spike or the C breath estimator are **go/no-go gates**).

### Hack Day timeline (assumed about 10 working hours, team of 4)

| Time | Dev 1 (robot/3D) | Dev 2 (sensing/logic) | Dev 3 (UI/data) | Lead / designer |
|---|---|---|---|---|
| 0:00-0:30 | Sync, branch plan, freeze scope | ← | ← | Demo script v1 |
| 0:30-3:30 | Feature poses and behaviours | Feature detector / state machine | Lab page, consent, questionnaire, TH copy | User tests every hour |
| 3:30-4:00 | **Integration checkpoint #1**: end-to-end ugly path works | ← | ← | ← |
| 4:00-7:00 | Behaviour polish, legibility cues | Robustness and backup input | Session save, Analytics chart, robot-card link | Pitch deck: before/after |
| 7:00 | **Feature freeze** | ← | ← | ← |
| 7:00-9:00 | Bug fixes only | Lighting test on stage | Seed demo data (real sessions from team runs) | 3 full rehearsals, timed |
| 9:00-10:00 | Backup video recorded; deploy; tag release | ← | ← | ← |

**Rules:**
- Keep the backup input path working at all times.
- Record a fallback screen capture of a successful run.
- Do not merge to the demo branch after freeze without a rehearsal.

---

## 16. Recommendation & Trade-offs

### 16.1 Comparison table (1-5, higher is better except Risk)

| | A. Honest Body | B. Pre-Exposure Clinic | C. Breath Co-Regulation | D. Mirror Therapy | E. Wai-First Proxemics |
|---|---|---|---|---|---|
| Fit with HumanoidTH architecture | **5** (uses confidence and evidence data) | 4 (registry plus perspectives) | 3 (avatar-centric) | 4 (rehab robots in registry) | 4 (home page plus Thai i18n) |
| HRI depth | 4 (nonverbal uncertainty, trust) | 4 (adaptive, user-paced) | 4 (entrainment) | 4 (embodiment transfer) | **5** (proxemics, culture, gaze, gesture) |
| Wellness relevance | 3 (indirect: safe trust) | **5** (anxiety) | **5** (physiological) | **5** (rehab) | 3 (social comfort) |
| Novelty | 4 | 4 | 3 | 4 | **5** (in Thailand) |
| Technical feasibility | **5** | **5** | 3 | 2 | 4 |
| Hack Day feasibility | 4 | **5** | 3 | 3 | 4 |
| Demo reliability | **5** (no sensing needed) | **5** (no sensing needed) | 3 | 3 | 4 |
| Real-world continuation | 4 (any atlas page, any robot) | **5** (hospital onboarding) | 3 | 4 (clinical partners) | 4 (design guideline for imported robots) |
| Before/after clarity | 4 | **5** (pre/post) | **5** (bpm drop) | 4 | 4 |
| Working-system proof | 4 | 4 | **5** (live signal) | **5** (live mirroring) | **5** (live gesture) |
| Dependency risk (lower is better) | 1 | 1 | 3 | 3 | 2 |

### 16.2 Directions

- **C. Strongest technical direction: D (Mirror Therapy).** Real-time pose retargeting onto a rigged humanoid with smoothing, rep segmentation and range-of-motion analytics has the most engineering substance. A is the strongest *data-integration* direction.
- **D. Strongest novelty direction: E (Wai-First Proxemics).** Culturally situated HRI that a Thai jury will immediately recognise, with a clear research hook: Western social defaults in imported robots.
- **E. Strongest demo direction: C (Breath) or D (Mirror).** Both give judges a live, physical, felt experience with a number that changes on screen. C's moment ("my breathing slowed") is more emotional; D's ("the robot's arm is mine") is more visual.
- **F. Lowest-risk direction: B (Pre-Exposure Clinic), closely followed by A.** Neither needs camera sensing to work, so both survive any venue. B has the clearest wellness before/after.
- **G. Most scalable direction: A (Honest Body).** It works for every robot and every record in the atlas, improves as the atlas grows, and turns the platform's provenance philosophy into a reusable interaction pattern. B scales well into real hospital onboarding.

### 16.3 Key trade-offs to discuss as a team

1. **Sensing vs. reliability.**
   - C, D and E are more impressive because the robot *perceives* you, but each depends on the camera, lighting and calibration.
   - A and B are demo-proof but rely on explicit input, so judges may see them as "UI-driven".
   - *Hybrid:* B or A plus *one* optional sensing cue (lean-back auto-stop in B, or wai greeting from E as the opening) gives perception without making the demo depend on it.
2. **Wellness strength vs. platform fit.**
   - A is the deepest *platform* integration but the most indirect *wellness* story.
   - C is the most direct wellness story but the shallowest atlas integration (it barely needs the atlas).
   - B and D sit in the middle: wellness-direct *and* linked to specific registry robots.
3. **Novelty vs. execution risk.**
   - D and E have the highest wow factor but the highest 3D-authoring risk on an unfamiliar sci-fi rig.
   - The pre-Hack-Day bone spike decides whether they are viable.
4. **Composable combinations.** The Behaviour Engine is shared, so combinations are cheap:
   - E + B: the wai greeting opens the exposure ladder. Cultural plus anxiety, low risk.
   - A + B: the robot is honest about the real robot you are about to meet. Trust plus anxiety, very low risk.
   - E + C: the wai opening, then breathing together. Culture plus physiology.
5. **Ethics framing.** B, C and D must be pitched as *living-lab prototypes producing data*, not treatments. That framing is also exactly what "Living Lab" asks for.

---

## 17. Questions / Unknowns

1. **Hardware:** Will we have any physical robot (NAO, Unitree G1, Dinsaw) at Hack Day? Seeds list NAO and G1 as `planned`. This determines whether C16 becomes viable.
2. **Rules:** Is pre-Hack-Day coding allowed? Must the work be a PR to the upstream repo, or a fork is enough? Are new npm dependencies (MediaPipe) allowed?
3. **Judging criteria weights:** novelty vs. wellness impact vs. technical depth vs. platform improvement.
4. **Team:** size, skills (Three.js/3D? signal processing? Thai-native UX writer?), laptop OS (affects Thai TTS voices).
5. **DB:** Will organisers provide a database or the upstream Prisma Postgres credentials? (UNKNOWN; plan for our own.)
6. **Runtime state:** Does the current `main` build and pass typecheck? (UNVERIFIED: no `pnpm` and no Postgres were available, and installing was out of scope for research.)
7. **Gemini:** Confirm `gemini-1.5-flash` is retired and which model and key we may use (INFERENCE).
8. **GLB:** Licence of `teal_v.2.glb`; are the `Arm Cannon` / `Gun Shield` parts visible in the render?
9. **Security disclosure:** The hard-coded admin password in `middleware.ts` and `app/actions.ts` should be reported privately to the maintainer before we publicise the fix.
10. **Participants:** Will judges or volunteers consent to the camera on stage? (Plan a consent screen and an "operator does it" fallback.)
11. **Venue:** Lighting, projector, Wi-Fi, noise level (affects C mic mode and TTS).
