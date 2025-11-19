import type { Sketch, SketchSettings } from "ssam";
import * as THREE from "three/webgpu";
import { ssam } from "ssam";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import {
  Fn,
  normalLocal,
  pass,
  vec4,
  texture,
  uv,
  uniform,
  vec2,
} from "three/tsl";
import {
  BoxGeometry,
  Color,
  Mesh,
  NodeMaterial,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
} from "three/webgpu";
import { PostProcessing } from "three/webgpu";
import GUI from "lil-gui";

const sketch: Sketch<"webgpu"> = async ({
  wrap,
  canvas,
  width,
  height,
  pixelRatio,
}) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const renderer = new WebGPURenderer({ canvas, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(new Color(0x333333), 1);
  await renderer.init();

  const camera = new PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.set(1, 2, 3);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);

  const stats = new Stats();
  document.body.appendChild(stats.dom);

  const scene = new Scene();

  const geometry = new BoxGeometry(1, 1, 1);
  const material = new NodeMaterial();
  material.colorNode = Fn(() => {
    return vec4(normalLocal, 1);
  })();
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);

  // Загружаем текстуру для displacement эффекта
  const displacementTexture = new THREE.TextureLoader().load(
    "https://raw.githubusercontent.com/miroleon/displacement_texture_freebie/main/assets/1K/jpeg/normal/ml-dpt-21-1K_normal.jpeg",
    function (texture) {
      texture.minFilter = THREE.NearestFilter;
    },
  );

  // Создаем uniform'ы для параметров displacement
  const displacementScale = uniform(0.025);
  const tileFactor = uniform(2.0);

  const setupGuiSettings = () => {
    const settings = {
      displacementScale: 0.025,
      tileFactor: 2.0,
    };

    const gui = new GUI();

    // Папка для displacement эффекта
    const displacementFolder = gui.addFolder("Displacement Effect");

    displacementFolder
      .add(settings, "displacementScale", 0, 0.2, 0.001)
      .name("Displacement Scale")
      .onChange((val: number) => {
        displacementScale.value = val;
      });

    displacementFolder
      .add(settings, "tileFactor", 0.1, 10, 0.1)
      .name("Tile Factor")
      .onChange((val: number) => {
        tileFactor.value = val;
      });

    displacementFolder.open();
  };

  setupGuiSettings();

  // Настраиваем post-processing
  const postProcessing = new PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const sceneTexture = scenePass.getTextureNode();

  // Применяем displacement эффект к сцене
  const finalOutput = Fn(() => {
    const currentUV = uv();

    // Применяем tiling к UV
    const tiledUV = currentUV.mul(tileFactor).fract();

    // Сэмплируем displacement текстуру
    const disp = texture(displacementTexture, tiledUV).rg.mul(
      displacementScale,
    );

    // Искажаем UV координаты
    const distortedUV = currentUV.add(disp);

    // Сэмплируем текстуру сцены с искаженными UV
    return texture(sceneTexture, distortedUV);
  })();

  postProcessing.outputNode = finalOutput;

  wrap.render = ({ playhead }) => {
    mesh.rotation.x = playhead * Math.PI * 2;
    mesh.rotation.y = playhead * Math.PI * 2;

    controls.update();
    stats.update();
    postProcessing.render();
  };

  wrap.resize = ({ width, height }) => {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  wrap.unload = () => {
    renderer.dispose();
  };
};

const settings: SketchSettings = {
  mode: "webgpu",
  // dimensions: [800, 800],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ["webm"],
};

ssam(sketch, settings);
