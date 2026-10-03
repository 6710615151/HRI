"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, CircleDashed, Hand, MoveDown, Play } from "lucide-react";
import RobotStage from "@/app/components/robot/RobotStage";
import type { Hue, RobotBehavior, RobotEvent } from "@/lib/hri/behavior-engine";
import { describeDistance } from "@/lib/hri/passport";
import { recordMeetingAction } from "../../actions";

type Passport = { code: string; greeting: string; comfortDistance: number; speed: number; gaze: string; voice: boolean; language: string };
type Robot = { id: string; name: string; type: string; org: string | null; useCase: string | null };
type LogEvent = { t: number; src: "robot" | "human"; type: string; [key: string]: unknown };
type Mode = "passport" | "default";

const START_DISTANCE = -2.6;
// What a robot does without a passport: waves, walks up close at full speed, holds eye contact.
const DEFAULT_BEHAVIOUR = { distance: 1.3, speed: 1.4, gaze: "direct", greeting: "wave", voice: true } as const;

function hueFor(type: string): Hue {
  if (/hospital|medical|therapy/i.test(type)) return "blue";
  if (/elder|care|companion/i.test(type)) return "amber";
  if (/rehab|assist/i.test(type)) return "green";
  return "teal";
}

const ui = {
  en: {
    eyebrow: "HRI Passport meeting",
    meeting: (name: string) => `Meeting ${name}`,
    from: "From the atlas robot registry",
    switchRobot: "Meet a different robot",
    start: "Start meeting",
    replay: "Replay",
    withPassport: "With your passport",
    withoutPassport: "Without passport (default robot)",
    appliedTitle: "Applied from passport",
    defaultTitle: "Default behaviour (no passport)",
    greeting: "Greeting", distance: "Stops at", speed: "Movement", gaze: "Eye contact", voice: "Voice",
    wai: "wai + bow", wave: "wave", slow: "slower", normal: "normal", fast: "fast", soft: "soft", direct: "direct", on: "spoken", off: "text only",
    tooClose: "Too close", tooFar: "Too far",
    finish: "Finish & save meeting",
    saved: "Meeting saved to the Living Lab.",
    back: "Back to Living Lab",
    ready: "Press Start. The robot will read your passport first."
  },
  th: {
    eyebrow: "พบหุ่นยนต์ด้วย HRI Passport",
    meeting: (name: string) => `กำลังพบ ${name}`,
    from: "จาก robot registry ของ Atlas",
    switchRobot: "เลือกหุ่นยนต์ตัวอื่น",
    start: "เริ่มพบหุ่นยนต์",
    replay: "เล่นอีกครั้ง",
    withPassport: "ใช้พาสปอร์ตของคุณ",
    withoutPassport: "ไม่ใช้พาสปอร์ต (หุ่นแบบปกติ)",
    appliedTitle: "สิ่งที่หุ่นอ่านจากพาสปอร์ต",
    defaultTitle: "พฤติกรรมปกติ (ไม่มีพาสปอร์ต)",
    greeting: "การทักทาย", distance: "หยุดที่ระยะ", speed: "ความเร็ว", gaze: "การสบตา", voice: "เสียง",
    wai: "ไหว้ + ก้มตัว", wave: "โบกมือ", slow: "ช้าลง", normal: "ปกติ", fast: "เร็ว", soft: "หลบสายตาเล็กน้อย", direct: "มองตรง", on: "พูดออกเสียง", off: "ข้อความอย่างเดียว",
    tooClose: "ใกล้ไป", tooFar: "ไกลไป",
    finish: "จบและบันทึกการพบ",
    saved: "บันทึกการพบลง Living Lab แล้ว",
    back: "กลับไป Living Lab",
    ready: "กด เริ่ม หุ่นจะอ่านพาสปอร์ตของคุณก่อน"
  }
};

const speech = {
  th: {
    reading: "กำลังอ่าน HRI Passport ของคุณ…",
    greetWai: (name: string) => `สวัสดีครับ ผมชื่อ ${name} ยินดีที่ได้พบครับ`,
    greetWave: (name: string) => `สวัสดี! ผมชื่อ ${name}!`,
    approach: "ผมจะเข้าไปในระยะที่คุณสบายใจ แล้วหยุดตรงนั้นนะครับ",
    approachDefault: "ผมเดินเข้าไปหาเลยนะ!",
    stop: "ผมจะอยู่ตรงนี้ครับ บอกได้ถ้าอยากให้ปรับ",
    back: "ขอโทษครับ ผมถอยออกมาแล้ว",
    closer: "ได้ครับ ผมจะเข้าไปใกล้อีกนิด"
  },
  en: {
    reading: "Reading your HRI Passport…",
    greetWai: (name: string) => `สวัสดีครับ. I am ${name}. Nice to meet you.`,
    greetWave: (name: string) => `Hi! I'm ${name}!`,
    approach: "I will come to the distance you are comfortable with, and stop there.",
    approachDefault: "Coming over to you now!",
    stop: "I will stay here. Tell me if you would like me to adjust.",
    back: "Sorry, I have stepped back.",
    closer: "Okay, I will come a little closer."
  }
};

export default function MeetClient({ lang, passport, robots, selectedId }: { lang: "en" | "th"; passport: Passport; robots: Robot[]; selectedId: string | null }) {
  const t = ui[lang];
  const voiceLang = (passport.language === "th" ? "th" : "en") as "th" | "en";
  const s = speech[voiceLang];
  const router = useRouter();
  const robot = robots.find((r) => r.id === selectedId) ?? null;
  const robotName = robot?.name ?? "Atlas robot";

  const robotRef = useRef<RobotBehavior | null>(null);
  const timers = useRef<number[]>([]);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("passport");
  const [applied, setApplied] = useState<string[]>([]);
  const [bubble, setBubble] = useState<string>(t.ready);
  const [log, setLog] = useState<LogEvent[]>([]);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const adjustments = useRef({ tooClose: 0, tooFar: 0 });

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  const clearTimers = () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; };
  useEffect(() => () => { clearTimers(); window.speechSynthesis?.cancel(); }, []);

  const record = useCallback((e: LogEvent) => setLog((prev) => [...prev.slice(-299), e]), []);
  const onRobotEvent = useCallback((e: RobotEvent) => record({ ...e, src: "robot" }), [record]);
  const human = (type: string, detail: Record<string, unknown> = {}) => record({ t: +(robotRef.current?.time ?? 0).toFixed(3), src: "human", type, ...detail });

  const behaviour = mode === "passport"
    ? { distance: passport.comfortDistance, speed: passport.speed, gaze: passport.gaze, greeting: passport.greeting, voice: passport.voice }
    : DEFAULT_BEHAVIOUR;

  const say = (text: string, voiceOn: boolean) => {
    setBubble(text);
    if (voiceOn && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voiceLang === "th" ? "th-TH" : "en-US";
      u.rate = behaviour.speed < 1 ? 0.85 : 1;
      window.speechSynthesis.speak(u);
    }
  };

  const onReady = useCallback((r: RobotBehavior) => {
    robotRef.current = r;
    r.bothArms("relaxed");
    r.setDistance(START_DISTANCE);
    r.setGlow(0.6, hueFor(robot?.type ?? ""));
    r.expression("neutral");
    r.snap();
    setReady(true);
  }, [robot?.type]);

  function run(nextMode: Mode = mode) {
    const r = robotRef.current;
    if (!r) return;
    clearTimers();
    setMode(nextMode);
    setApplied([]);
    setSaved(false);
    setRunning(true);
    adjustments.current = { tooClose: 0, tooFar: 0 };
    const b = nextMode === "passport"
      ? { distance: passport.comfortDistance, speed: passport.speed, gaze: passport.gaze, greeting: passport.greeting, voice: passport.voice }
      : DEFAULT_BEHAVIOUR;
    human("meeting_start", { mode: nextMode, robot: robotName });

    // Reset to a neutral start, far away.
    r.clearGestures();
    r.setSpeed(1);
    r.bothArms("relaxed");
    r.lean("upright");
    r.setDistance(START_DISTANCE);
    r.lookAt(0, 0.2);
    r.expression("neutral");
    r.setGlow(0.6, hueFor(robot?.type ?? ""));

    const mark = (key: string) => setApplied((prev) => [...prev, key]);
    let at = 600;
    if (nextMode === "passport") { say(s.reading, b.voice); at = 1500; }

    later(at, () => {
      r.setSpeed(b.speed); mark("speed");
      if (b.greeting === "wai") {
        r.bothArms("wai"); r.expression("calm");
        later(500, () => r.bow(0.36, 1.7));
        later(2600, () => { r.bothArms("relaxed"); r.expression("happy"); });
        say(s.greetWai(robotName), b.voice);
      } else {
        r.wave("R", 2.4); r.expression("happy");
        say(s.greetWave(robotName), b.voice);
      }
      mark("greeting"); mark("voice");
    });
    later(at + 3200, () => {
      say(nextMode === "passport" ? s.approach : s.approachDefault, b.voice);
      r.setDistance(b.distance);
      if (b.gaze === "soft") r.lookAt(0.25, 0.35); else r.lookAt(0, 0);
      mark("distance"); mark("gaze");
    });
    later(at + 3200 + 3500 / b.speed, () => {
      r.nod(1);
      if (nextMode === "default") r.moveArm("R", "offer");
      say(s.stop, b.voice);
      setRunning(false);
    });
  }

  function adjust(kind: "too_close" | "too_far") {
    const r = robotRef.current;
    if (!r) return;
    human(kind, { distance: +r.state.distanceTarget.toFixed(2), mode });
    if (kind === "too_close") {
      adjustments.current.tooClose++;
      r.setDistance(r.state.distanceTarget - 0.7); r.moveArm("R", "handOnChest"); r.expression("sorry"); r.lean("back");
      later(1600, () => { r.lean("upright"); r.moveArm("R", "relaxed"); r.expression("neutral"); });
      say(s.back, behaviour.voice);
    } else {
      adjustments.current.tooFar++;
      r.setDistance(r.state.distanceTarget + 0.6); r.expression("happy");
      say(s.closer, behaviour.voice);
    }
  }

  async function finish() {
    const r = robotRef.current;
    await recordMeetingAction(passport.code, {
      protocol: "passport_meeting",
      inputMode: "buttons",
      robotModelId: robot?.id ?? null,
      events: log.slice(-250),
      summary: {
        mode,
        robot: robotName,
        tooClose: adjustments.current.tooClose,
        tooFar: adjustments.current.tooFar,
        finalDistance: r ? +r.state.distanceTarget.toFixed(2) : null
      }
    });
    setSaved(true);
    human("meeting_saved");
  }

  const rows: { key: string; label: string; value: string }[] = [
    { key: "greeting", label: t.greeting, value: behaviour.greeting === "wai" ? t.wai : t.wave },
    { key: "distance", label: t.distance, value: describeDistance(behaviour.distance)[lang] },
    { key: "speed", label: t.speed, value: behaviour.speed < 1 ? t.slow : behaviour.speed > 1 ? t.fast : t.normal },
    { key: "gaze", label: t.gaze, value: behaviour.gaze === "soft" ? t.soft : t.direct },
    { key: "voice", label: t.voice, value: behaviour.voice ? t.on : t.off }
  ];

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <header className="mt-head">
        <div>
          <p className="mt-eyebrow">{t.eyebrow} · {passport.code}</p>
          <h1>{t.meeting(robotName)}</h1>
          <p className="muted">{robot ? `${robot.type.replace(/_/g, " ")}${robot.org ? ` · ${robot.org}` : ""} · ${t.from}` : t.from}</p>
        </div>
        {robots.length > 1 && (
          <label className="mt-switch">
            {t.switchRobot}
            <select value={selectedId ?? ""} onChange={(e) => router.push(`/living-lab/meet/${passport.code}?robot=${e.target.value}`)}>
              {robots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}
      </header>

      <section className="mt-grid">
        <div className="mt-stage">
          <div className="mt-bubble" aria-live="polite">{bubble}</div>
          <RobotStage key={selectedId ?? "robot"} framing="fullBody" onReady={onReady} onEvent={onRobotEvent} className="mt-canvas" ariaLabel={robotName} />
          <div className="mt-chip">{mode === "passport" ? t.withPassport : t.withoutPassport}</div>
        </div>

        <div className="mt-panel">
          <div className="mt-row">
            <button className="mt-btn primary" disabled={!ready || running} onClick={() => run("passport")}><Play size={18} aria-hidden="true" /> {applied.length ? t.replay : t.start}</button>
            <button className="mt-btn" disabled={!ready || running} onClick={() => run(mode === "passport" ? "default" : "passport")}>
              {mode === "passport" ? t.withoutPassport : t.withPassport}
            </button>
          </div>

          <div className="mt-card">
            <h2>{mode === "passport" ? t.appliedTitle : t.defaultTitle}</h2>
            <ul>
              {rows.map((row) => (
                <li key={row.key} className={applied.includes(row.key) ? "on" : ""}>
                  {applied.includes(row.key) ? <BadgeCheck size={18} aria-hidden="true" /> : <CircleDashed size={18} aria-hidden="true" />}
                  <span>{row.label}</span><strong>{row.value}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-row">
            <button className="mt-btn" disabled={!ready} onClick={() => adjust("too_close")}><Hand size={18} aria-hidden="true" /> {t.tooClose}</button>
            <button className="mt-btn" disabled={!ready} onClick={() => adjust("too_far")}><MoveDown size={18} aria-hidden="true" /> {t.tooFar}</button>
          </div>
          <div className="mt-row">
            <button className="mt-btn primary" disabled={!ready || saved || applied.length === 0} onClick={finish}>{t.finish}</button>
            <Link className="mt-btn" href="/living-lab">{t.back}</Link>
          </div>
          {saved && <p className="mt-ok">{t.saved}</p>}
        </div>
      </section>
    </main>
  );
}

const css = `
.mt-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-end; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
.mt-head h1 { margin: 4px 0; font-size: clamp(24px, 2.2vw, 34px); font-weight: 900; color: #07150f; }
.mt-eyebrow { margin: 0; font-size: 12px; font-weight: 750; letter-spacing: 1.2px; text-transform: uppercase; color: var(--warning); }
.mt-switch { display: grid; gap: 4px; font-size: 13px; font-weight: 650; }
.mt-switch select { min-height: 42px; border-radius: 9px; border: 1px solid var(--border); padding: 0 10px; font: inherit; }
.mt-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(300px, 1fr); gap: 16px; align-items: start; }
@media (max-width: 960px) { .mt-grid { grid-template-columns: 1fr; } }
.mt-stage { position: relative; height: 600px; border-radius: 14px; overflow: hidden; border: 1px solid var(--border); background: linear-gradient(180deg, #ffffff, #e9eef2); }
@media (max-width: 960px) { .mt-stage { height: 480px; } }
.mt-canvas { position: absolute; inset: 0; }
.mt-bubble { position: absolute; z-index: 2; left: 14px; right: 14px; top: 14px; background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; font-size: 17px; min-height: 50px; box-shadow: 0 8px 20px rgba(0,0,0,.06); }
.mt-chip { position: absolute; z-index: 2; left: 14px; bottom: 14px; background: rgba(7,21,15,.85); color: #fff; padding: 7px 13px; border-radius: 999px; font-size: 13px; font-weight: 650; }
.mt-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px; display: grid; gap: 14px; }
.mt-row { display: flex; gap: 10px; flex-wrap: wrap; }
.mt-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 10px 16px; border-radius: 10px; border: 1px solid var(--border); background: #fff; color: #07150f; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; flex: 1 1 180px; }
.mt-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.mt-btn:disabled { opacity: .55; cursor: not-allowed; }
.mt-btn:focus-visible { outline: 3px solid #19c37d; outline-offset: 2px; }
.mt-card { border: 1px dashed var(--accent); border-radius: 12px; padding: 14px; background: #fcfbf8; }
.mt-card h2 { margin: 0 0 10px; font-size: 17px; }
.mt-card ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.mt-card li { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; color: var(--text-secondary); transition: color .3s; }
.mt-card li.on { color: #07150f; }
.mt-card li.on svg { color: var(--accent); }
.mt-ok { color: var(--accent); font-weight: 700; margin: 0; }
`;
