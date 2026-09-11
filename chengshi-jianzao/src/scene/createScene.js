import * as THREE from 'three';
import { EMPTY, TERRAIN_FOREST, TERRAIN_WATER, TOOL_BULLDOZE } from '../game/rules.js';
import { builtCells, canDemolish, canPlace, colOf, rowOf } from '../game/city.js';
import { survey } from '../game/economy.js';
import {
  BUILDING_BOXES,
  GATE_BOXES,
  GROUND_HEIGHT,
  TERRAIN_COLORS,
  TREE_BOXES,
  WATER_DROP,
  buildBoxMesh,
  columnToX,
  linearRgb,
  rowToZ,
  xToColumn,
  zToRow,
} from './models.js';
import { cameraDistance } from './readout.js';
import { mix, spawnScale } from './motion.js';

// 停摆的建筑压暗压灰：整城跳闸时一眼能看出「全都不亮了」。
const DIM_TINT = [0.42, 0.44, 0.52];
const LIVE_TINT = [1, 1, 1];
const GHOST_OK = 0x7ae055;
const GHOST_BAD = 0xff6b6b;

const geometryFromBoxes = (boxes) => {
  const mesh = buildBoxMesh(boxes);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};

export function createScene(host) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081020);
  // 雾只压远角，起点要比相机距离远，否则整座城会被洗成背景色。
  scene.fog = new THREE.Fog(0x081020, 20, 52);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 140);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x1b2338, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.05);
  scene.add(sun);
  const disposables = [];
  const track = (resource) => {
    disposables.push(resource);
    return resource;
  };
  const solid = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const ghostMaterial = track(new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  }));
  const plateMaterial = track(new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  }));

  // 每种建筑一份几何，全场共用：换关也不用重建。
  const geometryCache = new Map();
  const geometryFor = (key, boxes) => {
    let geometry = geometryCache.get(key);
    if (!geometry) {
      geometry = track(geometryFromBoxes(boxes));
      geometryCache.set(key, geometry);
    }
    return geometry;
  };
  const groundGeometry = geometryFor('ground', [{ size: [0.98, GROUND_HEIGHT, 0.98], color: 0xffffff }]);

  const gate = new THREE.Mesh(geometryFor('gate', GATE_BOXES), solid);
  scene.add(gate);

  const platePlane = track(new THREE.PlaneGeometry(0.94, 0.94));
  platePlane.rotateX(-Math.PI / 2);
  const plate = new THREE.Mesh(platePlane, plateMaterial);
  plate.visible = false;
  scene.add(plate);

  const ghost = new THREE.Mesh(groundGeometry, ghostMaterial);
  ghost.visible = false;
  scene.add(ghost);

  const dummy = new THREE.Object3D();
  const instanced = (geometry, capacity) => {
    const mesh = new THREE.InstancedMesh(geometry, solid, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  };

  // 换关时地块尺寸会变，实例池按整张地图的格数重开一次就够。
  let pools = null;
  let layout = { cols: 0, rows: 0 };
  const disposePools = () => {
    if (!pools) return;
    for (const mesh of [pools.ground, pools.trees, ...pools.buildings.values()]) {
      scene.remove(mesh);
      mesh.dispose();
    }
    pools = null;
  };

  const setInstance = (mesh, slot, x, y, z, scaleY, tint) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, scaleY, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
    mesh.instanceColor.setXYZ(slot, tint[0], tint[1], tint[2]);
  };

  // 地形和树只在地块本身变化时重写：清林地会改地形，所以按 revision 触发。
  const writeTerrain = (city) => {
    const { cols, rows } = city;
    let treeSlot = 0;
    for (let index = 0; index < city.terrain.length; index += 1) {
      const col = colOf(city, index);
      const row = rowOf(city, index);
      const terrain = city.terrain[index];
      const y = terrain === TERRAIN_WATER ? -WATER_DROP : 0;
      setInstance(pools.ground, index, columnToX(cols, col), y, rowToZ(rows, row), 1, linearRgb(TERRAIN_COLORS[terrain]));
      if (terrain === TERRAIN_FOREST) {
        setInstance(pools.trees, treeSlot, columnToX(cols, col), GROUND_HEIGHT, rowToZ(rows, row), 1, LIVE_TINT);
        treeSlot += 1;
      }
    }
    pools.ground.count = city.terrain.length;
    pools.trees.count = treeSlot;
    pools.ground.instanceMatrix.needsUpdate = true;
    pools.ground.instanceColor.needsUpdate = true;
    pools.trees.instanceMatrix.needsUpdate = true;
    pools.trees.instanceColor.needsUpdate = true;
  };

  // 建成时间只活在渲染层：模拟层不知道有生长动画这回事。
  const spawnAt = new Map();
  let lastCity = null;
  let lastRevision = -1;
  let cachedSurvey = null;

  const syncWorld = (state, time) => {
    const city = state.city;
    if (city !== lastCity && (!pools || city.cols !== layout.cols || city.rows !== layout.rows)) {
      disposePools();
      const size = city.cols * city.rows;
      pools = {
        ground: instanced(groundGeometry, size),
        trees: instanced(geometryFor('tree', TREE_BOXES), size),
        buildings: new Map(Object.keys(BUILDING_BOXES).map((id) => [id, instanced(geometryFor(id, BUILDING_BOXES[id]), size)])),
      };
      layout = { cols: city.cols, rows: city.rows };
    }
    if (city === lastCity && state.revision === lastRevision) return;
    // 换关或重开时清空生长记录，新城的第一批楼也该长一次。
    if (lastCity === null || city.cols !== lastCity.cols || city.rows !== lastCity.rows || state.revision < lastRevision) {
      spawnAt.clear();
    }
    lastCity = city;
    lastRevision = state.revision;
    cachedSurvey = survey(city);
    writeTerrain(city);
    gate.position.set(columnToX(city.cols, 0), GROUND_HEIGHT, rowToZ(city.rows, rowOf(city, city.entrance)));
    // 这一版新出现的建筑记下时间，消失的清掉，免得 Map 无限长。
    for (const cell of builtCells(city)) {
      if (!spawnAt.has(cell.index)) spawnAt.set(cell.index, time);
    }
    for (const index of [...spawnAt.keys()]) {
      if (city.build[index] === EMPTY) spawnAt.delete(index);
    }
  };

  const writeBuildings = (city, time) => {
    const slots = new Map();
    for (const cell of builtCells(city)) {
      const mesh = pools.buildings.get(cell.id);
      if (!mesh) continue;
      const slot = slots.get(cell.id) ?? 0;
      slots.set(cell.id, slot + 1);
      const live = cachedSurvey.active[cell.index] === 1;
      setInstance(
        mesh,
        slot,
        columnToX(city.cols, cell.col),
        GROUND_HEIGHT,
        rowToZ(city.rows, cell.row),
        spawnScale(time - (spawnAt.get(cell.index) ?? time)),
        live ? LIVE_TINT : DIM_TINT,
      );
    }
    for (const [id, mesh] of pools.buildings) {
      mesh.count = slots.get(id) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  };

  // 落点预览：绿框能建、红框不能，钱不够也算不能——省得点下去才被拒绝。
  const writeGhost = (state, hover) => {
    if (!hover) {
      plate.visible = false;
      ghost.visible = false;
      return;
    }
    const { city } = state;
    const check = state.tool === TOOL_BULLDOZE
      ? canDemolish(city, hover.col, hover.row)
      : canPlace(city, hover.col, hover.row, state.tool);
    const ok = check.ok && state.money >= check.cost;
    const x = columnToX(city.cols, hover.col);
    const z = rowToZ(city.rows, hover.row);
    plate.visible = true;
    plate.position.set(x, GROUND_HEIGHT + 0.01, z);
    plate.material.color.setHex(ok ? GHOST_OK : GHOST_BAD);
    ghost.visible = ok && state.tool !== TOOL_BULLDOZE;
    if (ghost.visible) {
      ghost.geometry = geometryFor(state.tool, BUILDING_BOXES[state.tool]);
      ghost.position.set(x, GROUND_HEIGHT, z);
    }
  };

  let yaw = Math.PI / 4;
  const updateCamera = (city, view) => {
    const target = cameraDistance(city.cols, city.rows, view.zoom);
    // 转视角是缓动的：硬切会让人分不清刚才看的是哪个街区。
    yaw = mix(yaw, view.yaw, 0.14);
    camera.position.set(Math.sin(yaw) * target.back, target.height, Math.cos(yaw) * target.back);
    camera.lookAt(0, 0, 0);
    sun.position.set(camera.position.x * 0.6 + 4, target.height + 8, camera.position.z * 0.6 + 4);
  };

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
  const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_HEIGHT);
  const hit = new THREE.Vector3();

  return {
    render(state, time, view = { hover: null, yaw: Math.PI / 4, zoom: 1 }) {
      syncWorld(state, time);
      writeBuildings(state.city, time);
      writeGhost(state, view.hover);
      updateCamera(state.city, view);
      renderer.render(scene, camera);
    },

    /** 屏幕坐标打到地面上。只有这里知道相机矩阵，所以换算放在渲染层。 */
    pick(clientX, clientY) {
      if (layout.cols === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(pickPlane, hit)) return null;
      const col = xToColumn(layout.cols, hit.x);
      const row = zToRow(layout.rows, hit.z);
      if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return null;
      return { col, row, index: row * layout.cols + col };
    },

    dispose() {
      observer.disconnect();
      disposePools();
      for (const resource of disposables) resource.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}





