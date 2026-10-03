"use client";

import { useEffect, useRef } from "react";
import {
  AmbientLight,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RobotBehavior, type RobotEvent } from "@/lib/hri/behavior-engine";

export type CameraFraming = "portrait" | "fullBody";

type RobotStageProps = {
  framing?: CameraFraming;
  // Head and eyes follow the visitor's pointer (Overview page behaviour).
  pointerGaze?: boolean;
  // Drag horizontally to turn the robot.
  draggable?: boolean;
  onReady?: (robot: RobotBehavior) => void;
  onEvent?: (event: RobotEvent) => void;
  className?: string;
  ariaLabel?: string;
};

const FRAMINGS: Record<CameraFraming, { position: [number, number, number]; target: [number, number, number] }> = {
  portrait: { position: [0, 0.45, 4.75], target: [0, 0.32, 0] },
  fullBody: { position: [0, 0.35, 6.6], target: [0, 0.2, 0] }
};

const BASE_ROOT_Y = -0.52;

export default function RobotStage({
  framing = "portrait",
  pointerGaze = false,
  draggable = false,
  onReady,
  onEvent,
  className = "robot-viewer-frame",
  ariaLabel = "Interactive humanoid robot"
}: RobotStageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  const onEventRef = useRef(onEvent);
  onReadyRef.current = onReady;
  onEventRef.current = onEvent;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const scene = new Scene();
    const camera = new PerspectiveCamera(26, 1, 0.01, 100);
    const { position, target } = FRAMINGS[framing];
    camera.position.set(...position);
    camera.lookAt(...target);

    const renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(new Color(0xffffff), 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block", cursor: draggable ? "grab" : "default" });
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", ariaLabel);
    frame.appendChild(renderer.domElement);

    scene.add(new AmbientLight(0xffffff, 1.4));
    const keyLight = new DirectionalLight(0xffffff, 2.7);
    keyLight.position.set(2.8, 4, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new DirectionalLight(0x7fffd0, 1.5);
    fillLight.position.set(-3, 2, 2.5);
    scene.add(fillLight);
    const rimLight = new DirectionalLight(0xd9fff0, 2.1);
    rimLight.position.set(0, 3.2, -3);
    scene.add(rimLight);

    const robotRoot = new Group();
    robotRoot.position.y = BASE_ROOT_Y;
    scene.add(robotRoot);

    const resize = () => {
      const width = frame.clientWidth || 1;
      const height = frame.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(frame);
    resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let robot: RobotBehavior | null = null;
    let disposed = false;
    let animationFrame = 0;
    let targetYaw = 0;
    let currentYaw = 0;
    let dragging = false;
    let lastClientX = 0;

    new GLTFLoader().load("/teal_v.2.glb", (gltf) => {
      if (disposed) return;
      const model = gltf.scene;
      const materials: Record<string, MeshStandardMaterial> = {};
      model.traverse((child) => {
        child.frustumCulled = false;
        const mesh = child as unknown as { isMesh?: boolean; castShadow: boolean; receiveShadow: boolean; material: MeshStandardMaterial | MeshStandardMaterial[] };
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials[m.name] = m;
        }
      });
      const box = new Box3().setFromObject(model);
      const size = new Vector3();
      const center = new Vector3();
      box.getSize(size);
      box.getCenter(center);
      const scale = size.y > 0 ? 3.35 / size.y : 1;
      model.scale.setScalar(scale);
      model.position.copy(center.multiplyScalar(-scale));
      robotRoot.add(model);

      robot = new RobotBehavior({ model, robotRoot, materials, baseRootY: BASE_ROOT_Y }, (e) => onEventRef.current?.(e));
      // Calmer motion for visitors who ask for reduced motion.
      if (reducedMotion) robot.setSpeed(0.5);
      onReadyRef.current?.(robot);
    });

    const onPointerMove = (event: PointerEvent) => {
      if (pointerGaze && robot) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = MathUtils.clamp((event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2), -1, 1);
        const y = MathUtils.clamp((event.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2), -1, 1);
        robot.lookAt(x * 0.9, y * 0.9);
      }
      if (dragging) {
        targetYaw += (event.clientX - lastClientX) * 0.008;
        lastClientX = event.clientX;
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!draggable) return;
      dragging = true;
      lastClientX = event.clientX;
      renderer.domElement.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (draggable) renderer.domElement.style.cursor = "grab";
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onPointerLeave = () => { if (pointerGaze) robot?.lookAt(0, 0); };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("pointerleave", onPointerLeave);

    const clock = new Clock();
    const animate = () => {
      const dt = Math.min(0.05, clock.getDelta());
      currentYaw += (targetYaw - currentYaw) * 0.12;
      robotRoot.rotation.y = currentYaw;
      robot?.update(dt);
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("pointerleave", onPointerLeave);
      renderer.dispose();
      frame.removeChild(renderer.domElement);
    };
  }, [framing, pointerGaze, draggable, ariaLabel]);

  return <div ref={frameRef} className={className} />;
}
