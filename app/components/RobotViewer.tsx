"use client";

import { useCallback, useEffect, useRef } from "react";
import RobotStage from "./robot/RobotStage";
import type { RobotBehavior } from "@/lib/hri/behavior-engine";

// Overview robot: follows the visitor's pointer, greets with a wai and bow, then waves now and then.
// Previously the wave and eye movement never ran because GLTFLoader renames bones on load
// ("Arm.R_069" -> "ArmR_069"); the behaviour engine looks bones up through the same sanitizer.
export default function RobotViewer() {
  const timers = useRef<number[]>([]);

  const onReady = useCallback((robot: RobotBehavior) => {
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    // Hands-on-hips (the model's rest pose) reads as impolite in Thai settings, so stand relaxed.
    robot.bothArms("relaxed");
    robot.setGlow(0.6, "teal");
    robot.snap();

    later(3200, () => {
      robot.bothArms("wai");
      robot.expression("calm");
      later(500, () => robot.bow(0.32, 1.6));
      later(2600, () => { robot.bothArms("relaxed"); robot.expression("happy"); });
    });

    const scheduleWave = () => {
      later(20000 + Math.random() * 15000, () => {
        robot.wave("R", 2.6);
        robot.blink();
        scheduleWave();
      });
    };
    scheduleWave();

    const scheduleBlink = () => later(2500 + Math.random() * 4000, () => { robot.blink(); scheduleBlink(); });
    scheduleBlink();
  }, []);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  return <RobotStage framing="portrait" pointerGaze draggable onReady={onReady} ariaLabel="Interactive humanoid robot model" />;
}
