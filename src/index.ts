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
  float,
  length,
  smoothstep,
  min,
  max,
  positionWorld,
  color,
} from "three/tsl";
import {
  BoxGeometry,
  Color,
  Mesh,
  NodeMaterial,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
  PlaneGeometry,
} from "three/webgpu";
import { PostProcessing } from "three/webgpu";
import GUI from "lil-gui";
import {
  simplexNoise,
  clouds,
  crumpledFabric,
  dysonSphere,
  protozoa,
} from "tsl-textures";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);

  const stats = new Stats();
  document.body.appendChild(stats.dom);

  const scene = new Scene();

  // Создаём группу для блоба и света
  const blobGroup = new THREE.Group();
  scene.add(blobGroup);

  const inLight = new THREE.PointLight("white", 1000, 50);
  inLight.position.set(0, 0, 0);
  blobGroup.add(inLight);

  // Helper для визуализации PointLight
  const inLightHelper = new THREE.PointLightHelper(inLight, 0.2);
  // blobGroup.add(inLightHelper);

  const outLight = new THREE.SpotLight("white", 1, 1, 1, 1);
  outLight.position.set(0, 0, 7);
  scene.add(outLight);

  const outLightHelper = new THREE.SpotLightHelper(outLight);
  // scene.add(outLightHelper);

  // Переменные для отслеживания мыши
  const mouse = new THREE.Vector2();
  const targetPosition = new THREE.Vector3();
  const defaultPosition = new THREE.Vector3(-2, 0, -3);
  const lerpFactor = 0.05; // Скорость следования (0.01 - медленно, 0.1 - быстро)
  let isMouseOnCanvas = false; // Флаг: курсор на canvas

  // Обработчик движения мыши
  const onMouseMove = (event: MouseEvent) => {
    // Нормализуем координаты мыши от -1 до 1
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Конвертируем в 3D координаты
    // Множитель определяет диапазон движения
    targetPosition.x = mouse.x * 3;
    targetPosition.y = mouse.y * 3;
    targetPosition.z = 0;
  };

  // Обработчик входа курсора на canvas
  const onMouseEnter = () => {
    isMouseOnCanvas = true;
  };

  // Обработчик выхода курсора с canvas
  const onMouseLeave = () => {
    isMouseOnCanvas = false;
    // Устанавливаем целевую позицию в дефолтную
    targetPosition.copy(defaultPosition);
  };

  canvas.addEventListener("mouseenter", onMouseEnter);
  canvas.addEventListener("mouseleave", onMouseLeave);
  window.addEventListener("mousemove", onMouseMove);

  // Устанавливаем начальную целевую позицию в дефолтную
  targetPosition.copy(defaultPosition);

  const planeGeo = new PlaneGeometry(4, 4, 1, 1);
  const planeMat = new NodeMaterial();

  // Создаём анимируемые параметры для текстуры plane
  const planeParams = {
    scale: uniform(2),
    pinch: uniform(0.5),
    color: new THREE.Color(11596031),
    subcolor: new THREE.Color(4210928),
    background: new THREE.Color(12288),
    seed: uniform(0),
  };

  // planeMat.colorNode = dysonSphere({
  //   scale: 2.8,
  //   complexity: 2,
  //   variation: 0,
  //   color: new THREE.Color(0x86a0ff),
  //   background: new THREE.Color(0),
  //   seed: 0,
  // });
  planeMat.side = THREE.DoubleSide;
  planeMat.colorNode = crumpledFabric(planeParams);

  // planeMat.colorNode = clouds({
  //   scale: 2,
  //   density: 0.5,
  //   opacity: 1,
  //   color: new THREE.Color(16777215),
  //   subcolor: new THREE.Color(10526896),
  //   seed: 0,
  // });

  // planeMat.transparent = true;
  // planeMat.opacity = 1;
  // planeMat.side = THREE.DoubleSide;
  // planeMat.opacityNode = clouds.opacity({
  //   scale: 2,
  //   density: 0.5,
  //   opacity: 1,
  //   color: new THREE.Color(16777215),
  //   subcolor: new THREE.Color(10526896),
  //   seed: 0,
  // });

  const planeMesh = new Mesh(planeGeo, planeMat);
  planeMesh.position.z = -1;
  scene.add(planeMesh);

  const boxGeo = new BoxGeometry(1, 1, 1);
  const boxMat = new NodeMaterial();

  boxMat.colorNode = simplexNoise({
    scale: 4,
    balance: 0,
    contrast: 1,
    color: new Color(0xfff000),
    background: new Color(0x333333),
    seed: 0,
  });

  const mesh = new Mesh(boxGeo, boxMat);
  scene.add(mesh);

  var blobParams = {
    //	...protozoa.defaults,
    scale: 1,
    fat: 0.3,
    amount: 0.5,
    background: new THREE.Color("azure"),
    seed: uniform(0),
  };

  var blob = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 20),
    new THREE.MeshPhysicalNodeMaterial({
      colorNode: protozoa(blobParams).mul(1),
      roughness: 0.6,
      metalness: 3,
      transmission: 1,
      thickness: 5,
    }),
  );
  blob.position.set(0, 0, 0); // Блоб в центре группы
  blobGroup.add(blob);

  // Начальная позиция группы (дефолтная позиция)
  blobGroup.position.copy(defaultPosition);

  var blobGeometry = blob.geometry;
  var blopPosition = blobGeometry.getAttribute("position");

  blobGeometry.deleteAttribute("uv");
  blobGeometry = mergeVertices(blobGeometry);
  blobGeometry.computeVertexNormals();

  // Создаём SimplexNoise для анимации
  const simplex = new SimplexNoise();
  const v = new THREE.Vector3();

  // Загружаем текстуру для displacement эффекта (старый вариант)
  // const displacementTexture = new THREE.TextureLoader().load(
  //   "https://raw.githubusercontent.com/miroleon/displacement_texture_freebie/main/assets/1K/jpeg/normal/ml-dpt-21-1K_normal.jpeg",
  //   function (texture) {
  //     texture.minFilter = THREE.NearestFilter;
  //   },
  // );

  // Создаем uniform'ы для параметров displacement
  const displacementScale = uniform(0.024);
  const tileFactor = uniform(10.0);

  // Параметры для полосного displacement
  const stripeWidth = uniform(10.0);
  const stripeAngle = uniform(45.0);

  // Настраиваем post-processing
  const postProcessing = new PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const sceneTexture = scenePass.getTextureNode();

  // Применяем displacement эффект к сцене (квадратики)
  const finalOutputBoxes = Fn(() => {
    const currentUV = uv();

    // Применяем tiling к UV
    const tiledUV = currentUV.mul(tileFactor).fract();

    // Создаём процедурную displacement текстуру (сетка с градиентами как в оригинале)
    // Получаем координаты внутри каждой ячейки (от 0 до 1)
    const cellUV = tiledUV.fract();

    // Центрируем координаты: от -0.5 до 0.5
    const centeredUV = cellUV.sub(0.5);

    // Вычисляем расстояние от центра (радиальный градиент)
    const dist = length(centeredUV);

    // Создаём основной радиальный градиент для центра
    // В центре светлый, к краям темнее
    const radialGradient = smoothstep(0, 0.95, dist);

    // Создаём эффект для границ (края квадрата)
    // Вычисляем расстояние до ближайшего края
    const edgeDistX = min(cellUV.x, float(1.0).sub(cellUV.x));
    const edgeDistY = min(cellUV.y, float(1.0).sub(cellUV.y));
    const edgeDist = min(edgeDistX, edgeDistY);

    // Создаём яркую линию на границах (инверсия)
    const borderEffect = smoothstep(0.05, 0.0, edgeDist);

    // Комбинируем: центр (радиальный градиент) + границы (borderEffect)
    const finalGradient = max(radialGradient, borderEffect);

    // Создаём вектор смещения (используем градиент для обоих каналов)
    const disp = vec2(finalGradient, finalGradient).mul(displacementScale);

    // Старый вариант с загружаемой текстурой:
    // const disp = texture(displacementTexture, tiledUV).rg.mul(
    //   displacementScale,
    // );

    // Искажаем UV координаты
    const distortedUV = currentUV.add(disp);

    // Сэмплируем текстуру сцены с искаженными UV
    return texture(sceneTexture, distortedUV);
  })();

  // Новый displacement эффект с полосами
  const finalOutputStripes = Fn(() => {
    const currentUV = uv();

    // Конвертируем угол в радианы
    const angleRad = stripeAngle.mul(3.14159265359 / 180.0);

    // Вычисляем координаты с учетом поворота
    const cosA = angleRad.cos();
    const sinA = angleRad.sin();

    // Поворачиваем UV координаты
    const rotatedX = currentUV.x.mul(cosA).sub(currentUV.y.mul(sinA));
    const rotatedY = currentUV.x.mul(sinA).add(currentUV.y.mul(cosA));

    // Создаём полосы по оси X (после поворота)
    const stripePos = rotatedX.mul(stripeWidth).fract();

    // Создаём градиент внутри каждой полосы
    // От 0 в начале полосы до 1 в конце
    const stripeGradient = smoothstep(0.0, 1.0, stripePos);

    // Создаём эффект границ полос (яркие линии на краях)
    const edgeDist1 = smoothstep(0.05, 0.0, stripePos);
    const edgeDist2 = smoothstep(0.95, 1.0, stripePos);
    const stripeEdges = max(edgeDist1, edgeDist2);

    // Комбинируем градиент и границы
    const finalStripePattern = max(stripeGradient, stripeEdges);

    // Создаём вектор смещения на основе паттерна полос
    const disp = vec2(finalStripePattern, finalStripePattern).mul(
      displacementScale,
    );

    // Искажаем UV координаты
    const distortedUV = currentUV.add(disp);

    // Сэмплируем текстуру сцены с искаженными UV
    return texture(sceneTexture, distortedUV);
  })();

  postProcessing.outputNode = finalOutputStripes;

  const setupGuiSettings = () => {
    const settings = {
      displacementScale: 0.024,
      tileFactor: 10.0,
      stripeWidth: 10.0,
      stripeAngle: 45.0,
      useStripeEffect: false,
      inLightEnabled: true,
      outLightEnabled: true,
    };

    const gui = new GUI();

    // Папка для освещения
    const lightsFolder = gui.addFolder("Lights");

    lightsFolder
      .add(settings, "inLightEnabled")
      .name("Inner Light (Point)")
      .onChange((val: boolean) => {
        inLight.visible = val;
        inLightHelper.visible = val;
      });

    lightsFolder
      .add(settings, "outLightEnabled")
      .name("Outer Light (Spot)")
      .onChange((val: boolean) => {
        outLight.visible = val;
        outLightHelper.visible = val;
      });

    lightsFolder.open();

    // Папка для displacement эффекта
    const displacementFolder = gui.addFolder("Displacement Effect");

    displacementFolder
      .add(settings, "useStripeEffect")
      .name("Use Stripe Effect")
      .onChange((val: boolean) => {
        if (val) {
          postProcessing.outputNode = finalOutputStripes;
        } else {
          postProcessing.outputNode = finalOutputBoxes;
        }
      });

    displacementFolder
      .add(settings, "displacementScale", 0, 0.2, 0.001)
      .name("Displacement Scale")
      .onChange((val: number) => {
        displacementScale.value = val;
      });

    displacementFolder
      .add(settings, "tileFactor", 0.1, 100, 0.1)
      .name("Tile Factor (Boxes)")
      .onChange((val: number) => {
        tileFactor.value = val;
      });

    displacementFolder
      .add(settings, "stripeWidth", 1, 50, 0.1)
      .name("Stripe Width")
      .onChange((val: number) => {
        stripeWidth.value = val;
      });

    displacementFolder
      .add(settings, "stripeAngle", 0, 360, 1)
      .name("Stripe Angle")
      .onChange((val: number) => {
        stripeAngle.value = val;
      });

    displacementFolder.open();
  };

  setupGuiSettings();

  let start = performance.now();

  wrap.render = ({ playhead, time }) => {
    const now = performance.now() - start;

    // Плавное следование группы за курсором (lerp)
    blobGroup.position.lerp(targetPosition, lerpFactor);

    // Анимация куба
    mesh.rotation.x = playhead * Math.PI * 2;
    mesh.rotation.y = playhead * Math.PI * 2;

    // Анимация текстуры plane (плавное непрерывное изменение)
    // Плавное изменение seed - ВАЖНО для видимости изменений!
    planeParams.seed.value = now / 5000;
    // Медленные колебания от 1.2 до 2.8
    planeParams.scale.value = 2 + Math.sin(now / 4000) * 0.8;
    // Медленные колебания pinch от 0.3 до 0.7
    planeParams.pinch.value = 0.5 + Math.cos(now / 6000) * 0.2;

    // Анимация блоба (вращение)
    blob.rotation.set(now / 6500, now / 4600, now / 5700);

    // Деформация вершин блоба с помощью Simplex Noise
    for (let i = 0; i < blopPosition.count; i++) {
      v.fromBufferAttribute(blopPosition, i);
      v.setLength(1);

      const len =
        1 +
        0.1 *
          simplex.noise(
            v.x - v.z + Math.sin(now / 1000),
            v.y + v.z + Math.cos(now / 1000),
          );

      v.setLength(len);
      blopPosition.setXYZ(i, v.x, v.y, v.z);
    }

    // Обновляем геометрию
    blopPosition.needsUpdate = true;
    blobGeometry.computeVertexNormals();

    // Анимация seed для текстуры protozoa
    blobParams.seed.value = now / 10000;

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
    canvas.removeEventListener("mouseenter", onMouseEnter);
    canvas.removeEventListener("mouseleave", onMouseLeave);
    window.removeEventListener("mousemove", onMouseMove);
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
