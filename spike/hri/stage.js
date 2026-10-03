// Shared stage: loads the same GLB with the same camera/lighting/fit as app/components/RobotViewer.tsx.
import {
  AmbientLight, Box3, Color, DirectionalLight, Group, PCFSoftShadowMap,
  PerspectiveCamera, PropertyBinding, Scene, Vector3, WebGLRenderer
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const MODEL_URL = "/public/teal_v.2.glb";

export async function createStage(container, { width, height, preserveDrawingBuffer = false } = {}) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.01, 100);
  camera.position.set(0, 0.45, 4.75);
  camera.lookAt(0, 0.32, 0);

  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer });
  renderer.setClearColor(new Color(0xffffff), 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene.add(new AmbientLight(0xffffff, 1.4));
  const key = new DirectionalLight(0xffffff, 2.7); key.position.set(2.8, 4, 4); scene.add(key);
  const fill = new DirectionalLight(0x7fffd0, 1.5); fill.position.set(-3, 2, 2.5); scene.add(fill);
  const rim = new DirectionalLight(0xd9fff0, 2.1); rim.position.set(0, 3.2, -3); scene.add(rim);

  const robotRoot = new Group();
  robotRoot.position.y = -0.52;
  scene.add(robotRoot);

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const model = gltf.scene;
  const bones = {};
  const materials = {};
  model.traverse((child) => {
    child.frustumCulled = false;
    if (child.isBone) bones[child.name] = child;
    if (child.isMesh) {
      const list = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of list) materials[m.name] = m;
    }
  });

  const box = new Box3().setFromObject(model);
  const size = new Vector3(); const center = new Vector3();
  box.getSize(size); box.getCenter(center);
  const scale = size.y > 0 ? 3.35 / size.y : 1;
  model.scale.setScalar(scale);
  model.position.copy(center.multiplyScalar(-scale));
  robotRoot.add(model);

  const resize = (w, h) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
  };
  resize(width ?? container.clientWidth ?? 480, height ?? container.clientHeight ?? 640);

  // GLTFLoader sanitizes node names ("Arm.R_069" -> "ArmR_069", "Eye Control.L_010" -> "Eye_ControlL_010").
  // Look bones up through the same sanitizer so the raw GLB names keep working.
  const bone = (glbName) => bones[PropertyBinding.sanitizeNodeName(glbName)] ?? null;

  return {
    scene, camera, renderer, robotRoot, model, bones, bone, materials,
    animations: gltf.animations, resize,
    render: () => renderer.render(scene, camera)
  };
}
