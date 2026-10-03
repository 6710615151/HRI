"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Camera, CameraOff, Hand, HeartHandshake, Pause, Play, Snail, Volume2, VolumeX } from "lucide-react";
import RobotStage from "@/app/components/robot/RobotStage";
import type { RobotBehavior, RobotEvent } from "@/lib/hri/behavior-engine";
import { classifyWai, LeanBackDetector, POSE, shoulderWidth, WaiDetector } from "@/lib/hri/signals";
import { describeDistance } from "@/lib/hri/passport";
import { createPassportAction } from "./actions";
import { copy, type Lang } from "./copy";

export type LabStats = {
  passports: number;
  sessions: number;
  meetings: number;
  avgDistance: number | null;
  softGazeShare: number | null;
  voiceShare: number | null;
  slowedShare: number | null;
  tooCloseTotal: number;
  cameraShare: number | null;
  distances: number[];
};
export type LabRobot = { id: string; name: string; type: string; org: string | null };

type Phase = "intro" | "greet" | "approach" | "gaze" | "voice" | "saving" | "done";
type LogEvent = { t: number; src: "robot" | "human"; type: string; [key: string]: unknown };

// Distances the robot steps through while approaching (higher = closer to the person).
const STEPS = [-2.2, -1.3, -0.4, 0.5, 1.3];

export default function LivingLabClient({ lang, stats, robots }: { lang: Lang; stats: LabStats | null; robots: LabRobot[] }) {
  const t = copy[lang];
  const robotRef = useRef<RobotBehavior | null>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [speech, setSpeech] = useState<string>(t.introSpeech);
  const [status, setStatus] = useState<string>(t.statusIdle);
  const [inputMode, setInputMode] = useState<"buttons" | "camera">("buttons");
  const [cameraState, setCameraState] = useState<"off" | "loading" | "on" | "error">("off");
  const [cameraInfo, setCameraInfo] = useState("");
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [comfort, setComfort] = useState<number | null>(null);
  const [gaze, setGaze] = useState<"direct" | "soft">("direct");
  const [voice, setVoice] = useState(false);
  const [log, setLog] = useState<LogEvent[]>([]);
  const [passportCode, setPassportCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const stepRef = useRef(step);
  stepRef.current = step;
  const counters = useRef({ tooClose: 0, tooFast: 0, leanBack: 0 });
  const timers = useRef<number[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopCamera = useRef<(() => void) | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  const clearTimers = () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; };
  useEffect(() => () => { clearTimers(); stopCamera.current?.(); window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log]);

  const record = useCallback((e: LogEvent) => setLog((prev) => [...prev.slice(-299), e]), []);
  const human = (type: string, detail: Record<string, unknown> = {}) =>
    record({ t: +(robotRef.current?.time ?? 0).toFixed(3), src: "human", type, ...detail });
  const onRobotEvent = useCallback((e: RobotEvent) => record({ ...e, src: "robot" }), [record]);

  const say = (text: string) => {
    setSpeech(text);
    if (voiceRef.current && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "th" ? "th-TH" : "en-US";
      u.rate = speed < 1 ? 0.85 : 1;
      window.speechSynthesis.speak(u);
    }
  };

  const onReady = useCallback((robot: RobotBehavior) => {
    robotRef.current = robot;
    robot.bothArms("relaxed");
    robot.setDistance(STEPS[0]);
    robot.lookAt(0, 0.35);
    robot.expression("neutral");
    robot.setGlow(0.45, "teal");
    robot.snap();
    setReady(true);
  }, []);

  // ---------------- phases ----------------
  function begin() {
    const robot = robotRef.current;
    if (!robot) return;
    clearTimers();
    counters.current = { tooClose: 0, tooFast: 0, leanBack: 0 };
    setLog([]); setStep(0); setSpeed(1); setComfort(null); setPassportCode(null); setQr(null); setError(null);
    robot.setSpeed(1); robot.setDistance(STEPS[0]); robot.bothArms("relaxed"); robot.expression("neutral"); robot.lookAt(0, 0.35); robot.setGlow(0.45, "teal");
    human("session_start", { inputMode });
    setPhase("greet");
    // The robot waits quietly with lowered eyes: it does not wave at or stare at the visitor.
    say(t.waitSpeech);
    setStatus(inputMode === "camera" ? t.statusWaitCamera : t.statusWaitButton);
  }

  function receiveWai(source: "button" | "camera") {
    const robot = robotRef.current;
    if (!robot || phaseRef.current !== "greet") return;
    human("wai", { source });
    setPhase("approach");
    robot.lookAt(0, 0.2);
    robot.bothArms("wai");
    robot.expression("calm");
    say(t.waiSpeech);
    setStatus(t.statusWaiReturned);
    later(500, () => robot.bow(0.36, 1.7));
    later(2800, () => {
      robot.bothArms("relaxed");
      robot.expression("happy");
      robot.lookAt(0, 0);
      robot.setGlow(0.7, "teal");
      say(t.askApproach);
      setStatus(t.statusApproach(1, STEPS.length - 1));
    });
  }

  function approachNext() {
    const robot = robotRef.current;
    if (!robot || phaseRef.current !== "approach") return;
    const next = stepRef.current + 1;
    if (next >= STEPS.length) return finishDistance(STEPS[STEPS.length - 1], "closest_step");
    human("continue", { step: next });
    say(t.announceStep);
    later(1100 / robot.state.speed, () => {
      if (phaseRef.current !== "approach") return;
      robot.setDistance(STEPS[next]);
      robot.moveArm("R", next >= STEPS.length - 1 ? "offer" : "relaxed");
      setStep(next);
      setStatus(t.statusApproach(next, STEPS.length - 1));
      later(1500, () => { if (phaseRef.current === "approach") say(next >= STEPS.length - 1 ? t.closestAsk : t.askApproach); });
    });
  }

  function tooClose(source: "button" | "camera") {
    const robot = robotRef.current;
    if (!robot || phaseRef.current !== "approach") return;
    clearTimers();
    counters.current.tooClose++;
    if (source === "camera") counters.current.leanBack++;
    human("too_close", { source, distance: +robot.state.distance.toFixed(2) });
    const back = Math.max(-2.4, robot.state.distanceTarget - 0.8);
    robot.setDistance(back);
    robot.moveArm("R", "handOnChest");
    robot.moveArm("L", "relaxed");
    robot.expression("sorry");
    robot.lean("back");
    say(source === "camera" ? t.sorryLean : t.sorry);
    later(1700, () => { robot.lean("upright"); robot.moveArm("R", "relaxed"); });
    later(2600, () => finishDistance(back, "too_close"));
  }

  function tooFast() {
    const robot = robotRef.current;
    if (!robot || phaseRef.current !== "approach") return;
    counters.current.tooFast++;
    const s = Math.max(0.35, robot.state.speed * 0.5);
    robot.setSpeed(s);
    setSpeed(s);
    robot.nod(1);
    robot.expression("neutral");
    human("too_fast", { speed: s });
    say(t.slower);
  }

  function comfortable() {
    const robot = robotRef.current;
    if (!robot || phaseRef.current !== "approach") return;
    human("comfortable", { distance: +robot.state.distance.toFixed(2) });
    finishDistance(robot.state.distanceTarget, "comfortable");
  }

  function finishDistance(distance: number, reason: string) {
    const robot = robotRef.current;
    if (!robot) return;
    setComfort(distance);
    robot.moveArm("R", "relaxed");
    robot.nod(2);
    robot.expression("happy");
    robot.setGlow(0.9, "teal");
    human("distance_set", { distance: +distance.toFixed(2), reason });
    setPhase("gaze");
    later(900, () => {
      robot.lookAt(0, 0);
      say(t.askGaze);
      setStatus(t.statusGaze);
    });
  }

  function chooseGaze(choice: "direct" | "soft") {
    const robot = robotRef.current;
    if (!robot) return;
    setGaze(choice);
    human("gaze_preference", { gaze: choice });
    if (choice === "soft") { robot.lookAt(0.25, 0.35); say(t.gazeSoft); } else { robot.lookAt(0, 0); robot.nod(1); say(t.gazeDirect); }
    setPhase("voice");
    later(1800, () => { say(t.askVoice); setStatus(t.statusVoice); });
  }

  async function chooseVoice(on: boolean) {
    const robot = robotRef.current;
    if (!robot) return;
    setVoice(on);
    voiceRef.current = on;
    human("voice_preference", { voice: on });
    say(on ? t.voiceOn : t.voiceOff);
    robot.bothArms("wai");
    later(1600, () => robot.bothArms("relaxed"));
    setPhase("saving");
    setStatus(t.statusSaving);
    try {
      const robotEvents = log.slice(-250);
      const { code } = await createPassportAction(
        { greeting: "wai", comfortDistance: comfort ?? robot.state.distanceTarget, speed: robot.state.speed, gaze, voice: on, language: lang },
        {
          protocol: "wai_first_calibration",
          inputMode,
          events: robotEvents,
          summary: {
            tooClose: counters.current.tooClose,
            tooFast: counters.current.tooFast,
            leanBack: counters.current.leanBack,
            finalDistance: +(comfort ?? robot.state.distanceTarget).toFixed(2),
            finalSpeed: +robot.state.speed.toFixed(2),
            durationSeconds: +robot.time.toFixed(1)
          }
        }
      );
      const url = `${window.location.origin}/living-lab/meet/${code}`;
      setPassportCode(code);
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#07150f", light: "#ffffff" } }));
      setPhase("done");
      setStatus(t.statusDone);
      say(t.doneSpeech(code));
      human("passport_created", { code });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("voice");
    }
  }

  // ---------------- camera (optional) ----------------
  async function toggleCamera() {
    if (cameraState === "on" || cameraState === "loading") {
      stopCamera.current?.(); stopCamera.current = null; setCameraState("off"); setInputMode("buttons"); human("camera_off");
      return;
    }
    if (!videoRef.current) return;
    setCameraState("loading");
    try {
      const { startPoseCamera } = await import("@/lib/hri/camera");
      const wai = new WaiDetector();
      const lean = new LeanBackDetector();
      stopCamera.current = await startPoseCamera(videoRef.current, ({ tMs, landmarks, fps }) => {
        setCameraInfo(`${fps.toFixed(0)} fps · ${landmarks ? t.personSeen : t.noPerson}`);
        if (!landmarks) return;
        const robot = robotRef.current;
        const nose = landmarks[POSE.nose];
        // The robot looks toward the visitor (image is not mirrored: image-right is the visitor's left).
        if (robot && nose && (phaseRef.current === "approach" || phaseRef.current === "done")) robot.lookAt(-(nose.x - 0.5) * 2, (nose.y - 0.45) * 1.4);
        if (phaseRef.current === "greet") {
          const s = wai.update(tMs, classifyWai(landmarks));
          if (s.state === "rising") setStatus(`${t.waiDetecting} ${Math.round(s.progress * 100)}%`);
          if (s.state === "fired") receiveWai("camera");
        }
        if (phaseRef.current === "approach" && lean.update(tMs, shoulderWidth(landmarks))) tooClose("camera");
      });
      setCameraState("on");
      setInputMode("camera");
      human("camera_on");
    } catch (e) {
      setCameraState("error");
      setCameraInfo(e instanceof Error ? e.message : String(e));
    }
  }

  const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

  return (
    <main className="ll">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <header className="ll-head">
        <div>
          <p className="ll-eyebrow"><HeartHandshake size={14} aria-hidden="true" /> {t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="ll-sub">{t.subtitle}</p>
        </div>
        <div className="ll-head-actions">
          <Link className="button" href="/living-lab/meet">{t.haveCode}</Link>
        </div>
      </header>

      <section className="ll-grid">
        <div className="ll-stage-card">
          <div className="ll-bubble" aria-live="polite">{speech}</div>
          <div className="ll-stage">
            <RobotStage framing="fullBody" onReady={onReady} onEvent={onRobotEvent} className="ll-canvas" ariaLabel={t.robotLabel} />
          </div>
          <div className="ll-chip" role="status">{status}</div>
          <div className={`ll-cam ${cameraState === "on" ? "is-on" : ""}`}>
            <video ref={videoRef} playsInline muted aria-label={t.cameraPreview} />
            {cameraState !== "off" && <span>{cameraState === "loading" ? t.cameraLoading : cameraInfo}</span>}
          </div>
        </div>

        <div className="ll-panel">
          {phase === "intro" && (
            <div className="ll-step">
              <h2>{t.introTitle}</h2>
              <ol className="ll-list">{t.introSteps.map((s) => <li key={s}>{s}</li>)}</ol>
              <p className="ll-note">{t.privacy}</p>
              <div className="ll-row">
                <button className="ll-btn primary" onClick={begin} disabled={!ready}><Play size={18} aria-hidden="true" /> {ready ? t.start : t.loadingRobot}</button>
                <button className="ll-btn" onClick={toggleCamera} disabled={cameraState === "loading"}>
                  {cameraState === "on" ? <CameraOff size={18} aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />} {cameraState === "on" ? t.cameraOff : t.cameraOn}
                </button>
              </div>
              {cameraState === "error" && <p className="ll-error">{t.cameraError}: {cameraInfo}</p>}
            </div>
          )}

          {phase === "greet" && (
            <div className="ll-step">
              <h2>{t.greetTitle}</h2>
              <p>{t.greetHelp}</p>
              <button className="ll-btn primary big" onClick={() => receiveWai("button")}>🙏 {t.waiButton}</button>
            </div>
          )}

          {phase === "approach" && (
            <div className="ll-step">
              <h2>{t.approachTitle}</h2>
              <p>{t.approachHelp}{inputMode === "camera" ? ` ${t.leanHint}` : ""}</p>
              <div className="ll-meter" aria-label={t.distanceLabel}>
                {STEPS.slice(1).map((_, i) => <span key={i} className={i < step ? "on" : ""} />)}
              </div>
              <div className="ll-choices">
                <button className="ll-btn primary big" onClick={approachNext}><Play size={18} aria-hidden="true" /> {t.continue}</button>
                <button className="ll-btn big good" onClick={comfortable}><HeartHandshake size={18} aria-hidden="true" /> {t.comfortable}</button>
                <button className="ll-btn big warn" onClick={() => tooClose("button")}><Hand size={18} aria-hidden="true" /> {t.tooClose}</button>
                <button className="ll-btn big" onClick={tooFast}><Snail size={18} aria-hidden="true" /> {t.tooFast} {speed < 1 ? `(×${speed.toFixed(2)})` : ""}</button>
              </div>
            </div>
          )}

          {phase === "gaze" && (
            <div className="ll-step">
              <h2>{t.gazeTitle}</h2>
              <div className="ll-choices">
                <button className="ll-btn big" onClick={() => chooseGaze("direct")}>{t.gazeDirectBtn}</button>
                <button className="ll-btn big" onClick={() => chooseGaze("soft")}>{t.gazeSoftBtn}</button>
              </div>
            </div>
          )}

          {(phase === "voice" || phase === "saving") && (
            <div className="ll-step">
              <h2>{t.voiceTitle}</h2>
              <div className="ll-choices">
                <button className="ll-btn big" disabled={phase === "saving"} onClick={() => chooseVoice(true)}><Volume2 size={18} aria-hidden="true" /> {t.voiceYes}</button>
                <button className="ll-btn big" disabled={phase === "saving"} onClick={() => chooseVoice(false)}><VolumeX size={18} aria-hidden="true" /> {t.voiceNo}</button>
              </div>
              {error && <p className="ll-error">{error}</p>}
            </div>
          )}

          {phase === "done" && passportCode && (
            <div className="ll-step">
              <h2>{t.passportTitle}</h2>
              <div className="ll-passport">
                {qr && <img src={qr} alt={t.qrAlt} width={160} height={160} />}
                <div>
                  <p className="ll-code" aria-label={t.codeLabel}>{passportCode}</p>
                  <ul className="ll-facts">
                    <li>{t.factGreeting}: 🙏 {t.wai}</li>
                    <li>{t.factDistance}: {describeDistance(comfort ?? 0)[lang]}</li>
                    <li>{t.factSpeed}: {speed < 1 ? t.slow : t.normal}</li>
                    <li>{t.factGaze}: {gaze === "soft" ? t.soft : t.direct}</li>
                    <li>{t.factVoice}: {voice ? t.on : t.off}</li>
                  </ul>
                </div>
              </div>
              <p className="ll-note">{t.scanHint}</p>
              <div className="ll-row">
                <Link className="ll-btn primary" href={`/living-lab/meet/${passportCode}`}>{t.meetNow}</Link>
                <button className="ll-btn" onClick={() => { setPhase("intro"); setStatus(t.statusIdle); setSpeech(t.introSpeech); }}><Pause size={18} aria-hidden="true" /> {t.again}</button>
              </div>
            </div>
          )}

          <details className="ll-log-wrap">
            <summary>{t.logTitle} ({log.length})</summary>
            <div className="ll-log" ref={logRef} role="log">
              {log.map((e, i) => <div key={i}><b className={e.src}>{e.src}</b> {e.t.toFixed(1)}s · {e.type}</div>)}
            </div>
          </details>
        </div>
      </section>

      <section className="ll-findings">
        <h2>{t.findingsTitle}</h2>
        <p className="ll-sub">{t.findingsSub}</p>
        {stats ? (
          <div className="ll-stats">
            <div><strong>{stats.passports}</strong><span>{t.statPassports}</span></div>
            <div><strong>{stats.meetings}</strong><span>{t.statMeetings}</span></div>
            <div><strong>{stats.avgDistance === null ? "–" : describeDistance(stats.avgDistance)[lang]}</strong><span>{t.statDistance}</span></div>
            <div><strong>{pct(stats.softGazeShare)}</strong><span>{t.statSoftGaze}</span></div>
            <div><strong>{pct(stats.slowedShare)}</strong><span>{t.statSlowed}</span></div>
            <div><strong>{stats.tooCloseTotal}</strong><span>{t.statTooClose}</span></div>
          </div>
        ) : (
          <p className="ll-error">{t.dbOffline}</p>
        )}
        {robots.length > 0 && (
          <>
            <h3>{t.robotsTitle}</h3>
            <p className="ll-sub">{t.robotsSub}</p>
            <ul className="ll-robots">
              {robots.slice(0, 12).map((r) => (
                <li key={r.id}>
                  <strong>{r.name}</strong>
                  <span>{r.type.replace(/_/g, " ")}{r.org ? ` · ${r.org}` : ""}</span>
                  <Link href={`/living-lab/meet?robot=${r.id}`}>{t.meetThisRobot}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

const styles = `
.ll { display: grid; gap: 18px; }
.ll-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-bottom: 14px; }
.ll-head h1 { margin: 4px 0 0; font-size: clamp(26px, 2.4vw, 36px); font-weight: 900; color: #07150f; }
.ll-eyebrow { margin: 0; font-size: 12px; font-weight: 750; letter-spacing: 1.2px; text-transform: uppercase; color: var(--warning); display: inline-flex; gap: 6px; align-items: center; }
.ll-sub { margin: 6px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 720px; line-height: 1.5; }
.ll-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(320px, 1fr); gap: 16px; align-items: start; }
@media (max-width: 960px) { .ll-grid { grid-template-columns: 1fr; } }
.ll-stage-card { position: relative; background: linear-gradient(180deg, #ffffff, #efe9df); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; height: 600px; }
@media (max-width: 960px) { .ll-stage-card { height: 480px; } }
.ll-stage { position: absolute; inset: 0; }
.ll-canvas { width: 100%; height: 100%; }
.ll-bubble { position: absolute; z-index: 2; left: 14px; right: 14px; top: 14px; background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; font-size: 17px; line-height: 1.45; box-shadow: 0 8px 20px rgba(0,0,0,.06); min-height: 50px; }
.ll-chip { position: absolute; z-index: 2; left: 14px; bottom: 14px; background: rgba(7,21,15,.85); color: #fff; padding: 7px 13px; border-radius: 999px; font-size: 13px; font-weight: 650; }
.ll-cam { position: absolute; z-index: 2; right: 12px; bottom: 12px; width: 150px; display: none; border-radius: 10px; overflow: hidden; border: 2px solid #fff; background: #000; }
.ll-cam.is-on { display: block; }
.ll-cam video { width: 100%; display: block; transform: scaleX(-1); }
.ll-cam span { position: absolute; left: 0; right: 0; bottom: 0; font-size: 11px; color: #fff; background: rgba(0,0,0,.55); padding: 2px 6px; }
.ll-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px; display: grid; gap: 14px; }
.ll-step h2 { margin: 0 0 8px; font-size: 20px; }
.ll-step p { margin: 0 0 12px; line-height: 1.5; }
.ll-list { margin: 0 0 12px; padding-left: 20px; line-height: 1.7; }
.ll-note { font-size: 13px; color: var(--text-secondary); }
.ll-row, .ll-choices { display: flex; gap: 10px; flex-wrap: wrap; }
.ll-choices { display: grid; grid-template-columns: 1fr 1fr; }
.ll-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 10px 16px; border-radius: 10px; border: 1px solid var(--border); background: #fff; color: #07150f; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; }
.ll-btn.big { min-height: 60px; font-size: 17px; }
.ll-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.ll-btn.good { background: #e8f5ec; border-color: #9cc9aa; }
.ll-btn.warn { background: #fdf1e7; border-color: #e3b48c; }
.ll-btn:disabled { opacity: .55; cursor: not-allowed; }
.ll-btn:focus-visible { outline: 3px solid #19c37d; outline-offset: 2px; }
.ll-meter { display: flex; gap: 6px; margin-bottom: 14px; }
.ll-meter span { flex: 1; height: 10px; border-radius: 6px; background: var(--surface-muted); }
.ll-meter span.on { background: var(--accent); }
.ll-passport { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; background: #fcfbf8; border: 1px dashed var(--accent); border-radius: 12px; padding: 14px; margin-bottom: 10px; }
.ll-code { font-size: 34px; font-weight: 900; letter-spacing: 6px; margin: 0 0 6px; font-variant-numeric: tabular-nums; }
.ll-facts { margin: 0; padding-left: 18px; line-height: 1.6; font-size: 14px; }
.ll-error { color: var(--danger); font-size: 14px; }
.ll-log-wrap summary { cursor: pointer; font-weight: 700; font-size: 14px; }
.ll-log { margin-top: 8px; max-height: 160px; overflow: auto; background: #0b1511; color: #cfe; border-radius: 8px; padding: 8px; font: 12px ui-monospace, monospace; }
.ll-log b.robot { color: #7fd6ff; } .ll-log b.human { color: #ffd27f; }
.ll-findings { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.ll-findings h2 { margin: 0; font-size: 20px; } .ll-findings h3 { margin: 18px 0 0; font-size: 16px; }
.ll-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
.ll-stats div { border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: grid; gap: 4px; }
.ll-stats strong { font-size: 24px; font-weight: 900; } .ll-stats span { font-size: 12px; color: var(--text-secondary); }
.ll-robots { list-style: none; padding: 0; margin: 10px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.ll-robots li { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; display: grid; gap: 3px; }
.ll-robots span { font-size: 12px; color: var(--text-secondary); text-transform: capitalize; }
.ll-robots a { font-size: 13px; font-weight: 700; color: var(--accent); }
`;
