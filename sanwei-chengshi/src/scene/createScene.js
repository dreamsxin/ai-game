import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildingInstances, colToX, groundTexture, rowToZ } from './cityMesh.js';
import { cameraFrame } from './readout.js';

const SKY = 0x0a1020;
const SELECT_COLOR = 0xffd479;

export function createScene(host) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);

  const camera = new THREE.PerspectiveCamera(48, 1, 1, 20000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // 不许翻到地平线以下：城市地图一旦看到地板背面就完全失去方位感。
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.minPolarAngle = 0.05;

  scene.add(new THREE.HemisphereLight(0xa8c4ff, 0x0e1526, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const disposables = [];
  const track = (resource) => {
    disposables.push(resource);
    return resource;
  };

  const cityGroup = new THREE.Group();
  scene.add(cityGroup);

  // 选中框是一圈线框盒子加一根光柱：搜索定位时在密集楼群里也能一眼找到。
  const outline = new THREE.LineSegments(
    track(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0))),
    track(new THREE.LineBasicMaterial({ color: SELECT_COLOR })),
  );
  outline.visible = false;
  scene.add(outline);
  const beacon = new THREE.Mesh(
    track(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true)),
    track(new THREE.MeshBasicMaterial({
      color: SELECT_COLOR, transparent: true, opacity: 0.28, depthWrite: false,
    })),
  );
  beacon.visible = false;
  scene.add(beacon);
  const resize = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let city = null;
  let buildings = null;
  let ground = null;
  let groundMap = null;

  const clearCity = () => {
    for (const child of [...cityGroup.children]) cityGroup.remove(child);
    if (buildings) {
      buildings.geometry.dispose();
      buildings.material.dispose();
      buildings.dispose();
      buildings = null;
    }
    if (ground) {
      ground.geometry.dispose();
      ground.material.dispose();
      ground = null;
    }
    if (groundMap) {
      groundMap.dispose();
      groundMap = null;
    }
  };

  const load = (next) => {
    clearCity();
    city = next;
    const span = { x: city.cols * city.cellMeters, z: city.rows * city.cellMeters };
    groundMap = groundTexture(city);
    ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span.x, span.z),
      new THREE.MeshLambertMaterial({ map: groundMap }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    cityGroup.add(ground);

    buildings = buildingInstances(city);
    cityGroup.add(buildings);
    const frame = cameraFrame(city.cols, city.rows, city.cellMeters);
    controls.minDistance = frame.minDistance;
    controls.maxDistance = frame.maxDistance;
    controls.target.set(0, 0, 0);
    camera.position.set(frame.distance * 0.55, frame.height, frame.distance * 0.75);
    controls.update();

    // 阳光用正交投影覆盖全城：范围跟着尺度走，换成都会级也不会丢阴影。
    const reach = Math.max(span.x, span.z);
    sun.position.set(reach * 0.45, reach * 0.7, reach * 0.35);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
    sun.shadow.camera.left = -reach * 0.62;
    sun.shadow.camera.right = reach * 0.62;
    sun.shadow.camera.top = reach * 0.62;
    sun.shadow.camera.bottom = -reach * 0.62;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = reach * 2.4;
    sun.shadow.bias = -0.0006;
    sun.shadow.camera.updateProjectionMatrix();
    // 雾只负责把地平线收掉：起点必须比整城尺度还远，否则远处街区会被洗成背景色。
    scene.fog = new THREE.Fog(SKY, reach * 1.1, reach * 3);
    select(null);
  };

  let selected = null;
  const select = (building) => {
    selected = building;
    const visible = Boolean(building && city);
    outline.visible = visible;
    beacon.visible = visible;
    if (!visible) return;
    const x = colToX(city, building.col + building.cols / 2);
    const z = rowToZ(city, building.row + building.rows / 2);
    const width = building.cols * city.cellMeters;
    const depth = building.rows * city.cellMeters;
    // 线框比楼体大一点，否则会和楼面重合闪烁。
    outline.position.set(x, 0.5, z);
    outline.scale.set(width * 1.06, building.height * 1.02, depth * 1.06);
    const radius = Math.max(width, depth) * 0.62;
    beacon.position.set(x, building.height + city.cellMeters * 12, z);
    beacon.scale.set(radius, city.cellMeters * 24, radius);
  };

  const pick = (clientX, clientY) => {
    if (!city || !buildings) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(buildings, false);
    if (hits.length === 0) return null;
    // instanceId 就是 city.buildings 的下标，这是渲染层和数据层唯一的约定。
    return city.buildings[hits[0].instanceId] ?? null;
  };
  return {
    load,
    pick,
    select,

    /** 搜索结果定位：镜头平移到楼前并压低到街道视角，不做动画以免和拖拽抢控制权。 */
    focus(building) {
      if (!city || !building) return;
      select(building);
      const x = colToX(city, building.col + building.cols / 2);
      const z = rowToZ(city, building.row + building.rows / 2);
      const distance = Math.max(building.height * 2.2, city.cellMeters * 22);
      controls.target.set(x, building.height * 0.4, z);
      camera.position.set(x + distance * 0.7, building.height + distance * 0.6, z + distance * 0.7);
      controls.update();
    },

    setLayers({ buildings: showBuildings = true, ground: showGround = true }) {
      if (buildings) buildings.visible = showBuildings;
      if (ground) ground.visible = showGround;
    },

    render(time) {
      controls.update();
      if (beacon.visible) {
        // 光柱做呼吸：静态的柱子在密楼里反而不容易被注意到。
        beacon.material.opacity = 0.18 + Math.abs(Math.sin(time * 1.6)) * 0.22;
      }
      renderer.render(scene, camera);
    },

    get selected() {
      return selected;
    },

    dispose() {
      observer.disconnect();
      controls.dispose();
      clearCity();
      for (const resource of disposables) resource.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}



