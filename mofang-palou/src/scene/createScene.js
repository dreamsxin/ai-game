// three 场景。只读状态，不写回 —— 所有判断都在 game 层，这里只负责把它画出来。
//
// 216 块砖（六阶）不能一块砖挂五个 mesh，那是一千多个 draw call。
// 做法是把「门掩码 → 几何体」缓存成 64 个变体（六位门共 64 种），
// 每块砖只是一个共享几何体的 Mesh，一共 order³ 个 mesh，六阶 216 个，three 扛得住。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  AXIS_COL,
  AXIS_PILLAR,
  AXIS_ROW,
  DOOR_D,
  DOOR_E,
  DOOR_N,
  DOOR_S,
  DOOR_U,
  DOOR_W,
  LAYER_HEIGHT,
  TILE_SPAN,
  VIEW_ORBIT,
  VIEW_SIDE,
  VIEW_TOP,
} from '../game/rules.js';
import { CAMERA_FOV, cameraFor, cellPosition } from './readout.js';
import { GHOST_SCALE, drawModeFor, materialNameFor, poolBudget } from './frame.js';
import {
  SHIFT_SECONDS,
  WALK_SECONDS_PER_CELL,
  mix,
  slideCell,
  walkDuration,
  walkPoint,
} from './motion.js';

const INNER = TILE_SPAN * 0.9;        // 砖体比格子略小，缝隙让「砖在滑动」看得出来
const WALL_HEIGHT = TILE_SPAN * 0.5;
const WALL_THICK = TILE_SPAN * 0.11;
const FLOOR_THICK = TILE_SPAN * 0.12;
const FLOOR_Y = -LAYER_HEIGHT * 0.42;
const RIM = INNER * 0.3;              // 地板留边的宽度：中间挖空就是「能往下掉」

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/**
 * 一块砖的几何体。门开着就留缺口，门关着就砌墙。
 * 上下两个面没法用「墙」表达，所以：朝下开门 → 地板中间挖空；朝上开门 → 四角立短柱。
 */
function tileGeometry(mask) {
  const parts = [];
  if (mask & DOOR_D) {
    // 地板只剩四条边，中间是洞 —— 一眼看出这格能往下走。
    const long = INNER;
    const off = (INNER - RIM) / 2;
    parts.push(box(long, FLOOR_THICK, RIM, 0, FLOOR_Y, -off));
    parts.push(box(long, FLOOR_THICK, RIM, 0, FLOOR_Y, off));
    parts.push(box(RIM, FLOOR_THICK, INNER - RIM * 2, -off, FLOOR_Y, 0));
    parts.push(box(RIM, FLOOR_THICK, INNER - RIM * 2, off, FLOOR_Y, 0));
  } else {
    parts.push(box(INNER, FLOOR_THICK, INNER, 0, FLOOR_Y, 0));
  }
  const wallY = FLOOR_Y + WALL_HEIGHT / 2;
  const edge = (INNER - WALL_THICK) / 2;
  if (!(mask & DOOR_N)) parts.push(box(INNER, WALL_HEIGHT, WALL_THICK, 0, wallY, -edge));
  if (!(mask & DOOR_S)) parts.push(box(INNER, WALL_HEIGHT, WALL_THICK, 0, wallY, edge));
  if (!(mask & DOOR_W)) parts.push(box(WALL_THICK, WALL_HEIGHT, INNER, -edge, wallY, 0));
  if (!(mask & DOOR_E)) parts.push(box(WALL_THICK, WALL_HEIGHT, INNER, edge, wallY, 0));
  if (mask & DOOR_U) {
    // 四角短柱：竖井往上开着。
    const postY = wallY + WALL_HEIGHT * 0.55;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push(box(WALL_THICK, WALL_HEIGHT * 0.7, WALL_THICK, sx * edge, postY, sz * edge));
      }
    }
  }
  return mergeGeometries(parts, false);
}

/**
 * 64 个变体一次建好，之后每块砖只是换个引用。
 * 导出是为了能在 node 里单测 —— 这一层不需要 WebGL，只是几何体拼接，
 * 而它一错就是满屏空砖，光靠肉眼看很难说清是哪一位门画错了。
 */
export function buildTileGeometries() {
  const cache = new Array(64);
  for (let mask = 0; mask < 64; mask += 1) cache[mask] = tileGeometry(mask);
  return cache;
}

// 砖的四种状态各一个材质，全体共享 —— 几何体是共享的，颜色只能落在材质上。
// 走得到的亮、走不到的暗，这是玩家判断「路通没通」的唯一视觉线索，对比必须拉开。
const MATERIALS = {
  far: { color: 0x2b3556, emissive: 0x090d18 },
  near: { color: 0x5f7ae0, emissive: 0x1a2450 },
  line: { color: 0xe0a83c, emissive: 0x4a3208 },
  picked: { color: 0xffd479, emissive: 0x5c4410 },
  // 出口那一层在俯视里画成一层暗幽灵 —— 不画的话「出口在哪」根本看不见。
  ghost: { color: 0x1b2440, emissive: 0x0c1730 },
};

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  scene.fog = new THREE.Fog(0x05060f, 12, 44);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x141a2c, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 9, 6);
  scene.add(key);

  const geometryCache = buildTileGeometries();
  const materials = Object.fromEntries(
    Object.entries(MATERIALS).map(([name, spec]) => [
      name,
      new THREE.MeshLambertMaterial({ color: spec.color, emissive: spec.emissive }),
    ]),
  );

  const board = new THREE.Group();
  scene.add(board);
  let pool = [];
  let poolOrder = 0;

  const ensurePool = (order) => {
    if (poolOrder === order) return;
    for (const mesh of pool) board.remove(mesh);
    pool = Array.from({ length: poolBudget(order) }, () => {
      const mesh = new THREE.Mesh(geometryCache[0], materials.far);
      mesh.visible = false;
      board.add(mesh);
      return mesh;
    });
    poolOrder = order;
  };

  const playerMesh = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SPAN * 0.34, TILE_SPAN * 0.44, TILE_SPAN * 0.34),
    new THREE.MeshLambertMaterial({ color: 0x7ff0ff, emissive: 0x1d5f6b }),
  );
  scene.add(playerMesh);

  const exitMesh = new THREE.Mesh(
    new THREE.TorusGeometry(TILE_SPAN * 0.26, TILE_SPAN * 0.07, 8, 18),
    new THREE.MeshLambertMaterial({ color: 0x8dff6a, emissive: 0x2f6b28 }),
  );
  exitMesh.rotation.x = Math.PI / 2;
  scene.add(exitMesh);

  /**
   * 出口光柱：从底层一直竖到出口那一格。
   * 三个视角里都画，它回答的是「出口在哪一列哪一排、在第几层」——
   * 只靠一个悬空的绿环，玩家看不出它到底在塔的什么位置。
   */
  const beaconMesh = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SPAN * 0.06, 1, TILE_SPAN * 0.06),
    new THREE.MeshBasicMaterial({ color: 0x8dff6a, transparent: true, opacity: 0.34 }),
  );
  scene.add(beaconMesh);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // 推移／走位动画。tick 变了才认为是新动作，同一帧重复 render 不会重启动画。
  let animation = null;
  let lastTick = -1;
  let spin = 0;

  const startAnimation = (state, time) => {
    if (state.tick === lastTick) return;
    lastTick = state.tick;
    const shifted = state.effects.find((effect) => effect.type === 'shift');
    const walked = state.effects.find((effect) => effect.type === 'walk');
    if (shifted) {
      animation = { kind: 'shift', ...shifted, startedAt: time, duration: SHIFT_SECONDS };
    } else if (walked) {
      animation = {
        kind: 'walk',
        path: walked.path,
        startedAt: time,
        duration: walkDuration(walked.path, WALK_SECONDS_PER_CELL),
      };
    } else {
      animation = null;
    }
  };

  const progressOf = (time) => {
    if (!animation) return 1;
    const done = (time - animation.startedAt) / animation.duration;
    if (done >= 1) {
      animation = null;
      return 1;
    }
    return Math.max(0, done);
  };

  /**
   * 这一帧的取舍全交给 frame.js —— 那一层不碰 WebGL，所以「出口画不画」这类问题
   * 不用开浏览器就能验。这里只负责把判断结果落到 mesh 上。
   */
  const place = (object, order, cell, progress) => {
    const slid = slideCell(cell, animation, order, progress) ?? cell;
    const [x, y, z] = cellPosition(order, slid);
    object.position.set(x, y, z);
  };

  const resize = () => {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return camera.aspect;
  };

  return {
    /**
     * 画一帧。cells 是 boardView(state) 的结果，由调用方按 tick 缓存 ——
     * 洪泛每帧算一次太浪费，而且一次动作里它不会变。
     * focus 是手指正按住的格子，只影响高亮那个十字。
     */
    render(state, cells, time, focus = null) {
      const order = state.cube.order;
      ensurePool(order);
      startAnimation(state, time);
      const progress = progressOf(time);
      const aspect = resize();

      // 转台自己慢慢转；其余视角不转，免得推砖时画面还在飘。
      if (state.view === VIEW_ORBIT) spin += 0.0035;
      const shot = cameraFor(state.view, order, aspect, spin);
      camera.position.set(...shot.position);
      camera.lookAt(...shot.target);

      const axes = state.view === VIEW_TOP
        ? { horizontal: AXIS_ROW, vertical: AXIS_COL }
        : state.view === VIEW_SIDE
          ? { horizontal: AXIS_ROW, vertical: AXIS_PILLAR }
          : null;
      const anchor = focus ?? state.selection ?? state.player;
      const frame = {
        clip: shot.clip,
        activeLayer: state.activeLayer,
        sliceRow: state.sliceRow,
        exitLayer: state.exit.layer,
        selection: state.selection,
        axes,
        anchor,
      };

      let slot = 0;
      for (const cell of cells) {
        const mode = drawModeFor(frame, cell);
        if (mode === 'hidden') continue;
        const mesh = pool[slot];
        slot += 1;
        mesh.visible = true;
        mesh.geometry = geometryCache[cell.tile & 63];
        mesh.material = materials[materialNameFor(frame, cell, mode)];
        mesh.scale.setScalar(mode === 'ghost' ? GHOST_SCALE : 1);
        // 幽灵层不该被点到：点它会选中一个你现在根本不在操作的面。
        mesh.userData.cell = mode === 'ghost' ? null : cell;
        place(mesh, order, cell, progress);
      }
      for (let index = slot; index < pool.length; index += 1) {
        pool[index].visible = false;
        pool[index].userData.cell = null;
      }

      // 玩家：走位动画时沿路径插值，推移动画时跟着砖滑。
      if (animation && animation.kind === 'walk') {
        const point = walkPoint(animation.path, progress);
        const from = cellPosition(order, point.from);
        const to = cellPosition(order, point.to);
        playerMesh.position.set(
          mix(from[0], to[0], point.t),
          mix(from[1], to[1], point.t) + point.hop * 0.22,
          mix(from[2], to[2], point.t),
        );
      } else {
        place(playerMesh, order, state.player, progress);
      }
      playerMesh.rotation.y = Math.sin(time * 1.8) * 0.16;

      place(exitMesh, order, state.exit, progress);
      const open = state.status === 'climbing' && state.exit && cells.some((c) => c.isExit && c.reachable);
      exitMesh.rotation.z = time * (open ? 1.9 : 0.7);
      exitMesh.position.y += open ? Math.abs(Math.sin(time * 3.2)) * 0.07 : 0;
      exitMesh.scale.setScalar(open ? 1 + Math.sin(time * 5) * 0.06 : 1);

      // 光柱从最底层竖到出口那一格，跟着出口一起横向滑动。
      const bottomY = cellPosition(order, { layer: 0, col: 0, row: 0 })[1];
      const height = Math.max(0.1, exitMesh.position.y - bottomY);
      beaconMesh.scale.set(1, height, 1);
      beaconMesh.position.set(exitMesh.position.x, bottomY + height / 2, exitMesh.position.z);

      renderer.render(scene, camera);
    },

    /** 屏幕坐标射到哪一格。命中的是当前可见的砖，所以看不见的层不会被误点。 */
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pool.filter((mesh) => mesh.visible), false);
      return hits.length > 0 ? hits[0].object.userData.cell ?? null : null;
    },

    resize,

    dispose() {
      for (const geometry of geometryCache) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      playerMesh.geometry.dispose();
      playerMesh.material.dispose();
      exitMesh.geometry.dispose();
      exitMesh.material.dispose();
      beaconMesh.geometry.dispose();
      beaconMesh.material.dispose();
      renderer.dispose();
    },
  };
}




