import * as THREE from 'three';
import {
  AXIS_ROW,
  LAYER_HEIGHT,
  SHIFT_SECONDS,
  TILE_GAP,
  TILE_SPAN,
  WALK_SECONDS_PER_CELL,
} from '../game/rules.js';
import { boardView, shiftAnchor } from '../game/simulation.js';
import { buildVoxelMesh, linearRgb } from './voxel.js';
import {
  EXIT_ORIGIN,
  EXIT_VOXEL,
  EXIT_VOXELS,
  PLAYER_ORIGIN,
  PLAYER_VOXEL,
  PLAYER_VOXELS,
  TILE_ORIGIN,
  VOXEL_SIZE,
  columnToX,
  rowToZ,
  tileVoxels,
  xToColumn,
  zToRow,
} from './models.js';
import { cameraDistance } from './readout.js';
import { easeOutCubic, mix, slidePositions, walkDuration, walkPoint } from './motion.js';

// 砖面高度：地板占 1 格体素，角色和高亮都贴在它上面。
const FLOOR_TOP = VOXEL_SIZE;
const PLATE_INSET = 0.2;
// 高亮要在暗色地板上一眼分得清：能走的偏青、选中的偏琥珀、出口偏绿。
const HIGHLIGHT_REACHABLE = 0x3fa8dd;
const HIGHLIGHT_SELECTED = 0xffc061;
const HIGHLIGHT_EXIT = 0x7ae055;
const HIGHLIGHT_FOCUS = 0xffe9a8;
// 光带压在地板上，砖缝处底下是黑背景，所以低透明度会直接看不见——这两个值是实测出来的下限。
const BAND_COLOR = 0xffc061;
const BAND_IDLE_OPACITY = 0.26;
const BAND_ACTIVE_OPACITY = 0.5;
// 真正说清「推的是这一条」靠棋盘外的箭头：它们贴着黑背景，怎么都看得见。
const MARKER_IDLE_OPACITY = 0.72;
const MARKER_ACTIVE_OPACITY = 1;
const MARKER_OFFSET = 0.72;

const geometryFromVoxels = (voxels, options) => {
  const mesh = buildVoxelMesh(voxels, options);
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
  scene.background = new THREE.Color(0x070b18);
  // 雾只用来压住远角，起点要比相机距离远，否则整张棋盘都会被洗成背景色。
  scene.fog = new THREE.Fog(0x070b18, 12, 30);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x141a30, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(4, 9, 5);
  scene.add(sun);

  const disposables = [];
  const track = (resource) => {
    disposables.push(resource);
    return resource;
  };
  // 砖面按整数编码缓存几何：同一种门位组合全场共用一份，5×5×3 也只有十几份。
  const geometryCache = new Map();
  const geometryFor = (tile) => {
    let geometry = geometryCache.get(tile);
    if (!geometry) {
      geometry = track(geometryFromVoxels(tileVoxels(tile), { size: VOXEL_SIZE, origin: TILE_ORIGIN }));
      geometryCache.set(tile, geometry);
    }
    return geometry;
  };

  const tileMaterial = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
  // 非激活层压暗压透，否则上层的地板会把玩家所在的那层全挡住。
  const dimMaterial = track(new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  }));

  const tileGroup = new THREE.Group();
  scene.add(tileGroup);
  const tilePool = [];
  const takeTile = (slot) => {
    while (tilePool.length <= slot) {
      const mesh = new THREE.Mesh(geometryFor(0), tileMaterial);
      mesh.visible = false;
      tileGroup.add(mesh);
      tilePool.push(mesh);
    }
    return tilePool[slot];
  };

  const playerMesh = new THREE.Mesh(
    track(geometryFromVoxels(PLAYER_VOXELS, { size: PLAYER_VOXEL, origin: PLAYER_ORIGIN })),
    tileMaterial,
  );
  scene.add(playerMesh);

  const exitMesh = new THREE.Mesh(
    track(geometryFromVoxels(EXIT_VOXELS, { size: EXIT_VOXEL, origin: EXIT_ORIGIN })),
    tileMaterial,
  );
  scene.add(exitMesh);
  // 高亮是贴在地板上的一层薄片：可达、选中、出口各一个颜色，用实例色区分。
  const plateGeometry = track(new THREE.PlaneGeometry(
    TILE_SPAN - TILE_GAP - PLATE_INSET,
    TILE_SPAN - TILE_GAP - PLATE_INSET,
  ));
  plateGeometry.rotateX(-Math.PI / 2);
  const plateMaterial = track(new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  }));
  const PLATE_CAPACITY = 128;
  const plates = new THREE.InstancedMesh(plateGeometry, plateMaterial, PLATE_CAPACITY);
  plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  plates.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PLATE_CAPACITY * 3), 3);
  plates.count = 0;
  scene.add(plates);

  // 整条行/列的光带：这是「我现在要推的是哪一条」唯一说得清的表达方式。
  // 用一整片拉伸的平面而不是逐格贴片，格子之间才不会断开。
  const bandGeometry = track(new THREE.PlaneGeometry(1, 1));
  bandGeometry.rotateX(-Math.PI / 2);
  const makeBand = () => {
    const material = track(new THREE.MeshBasicMaterial({
      color: BAND_COLOR,
      transparent: true,
      opacity: BAND_IDLE_OPACITY,
      depthWrite: false,
    }));
    const mesh = new THREE.Mesh(bandGeometry, material);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  };
  const rowBand = makeBand();
  const colBand = makeBand();

  // 棋盘四边外的箭头，指出当前那一行一列会往哪推。锥体默认尖朝 +y，转到水平再用。
  const markerGeometry = track(new THREE.ConeGeometry(0.15, 0.3, 4));
  const markerMaterial = track(new THREE.MeshBasicMaterial({
    color: BAND_COLOR,
    transparent: true,
    opacity: MARKER_IDLE_OPACITY,
  }));
  const makeMarker = (rotation) => {
    const mesh = new THREE.Mesh(markerGeometry, markerMaterial);
    mesh.rotation.set(rotation[0], 0, rotation[2]);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  };
  const markers = {
    left: makeMarker([0, 0, Math.PI / 2]),
    right: makeMarker([0, 0, -Math.PI / 2]),
    up: makeMarker([-Math.PI / 2, 0, 0]),
    down: makeMarker([Math.PI / 2, 0, 0]),
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

  const dummy = new THREE.Object3D();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  // 动画状态只活在渲染层，模拟层完全不知道有插值这回事。
  let animation = null;
  let lastTick = -1;
  let focusY = 0;
  let layout = { cols: 0, rows: 0, layers: 1, activeLayer: 0 };
  let lastLevel = null;
  let cachedView = null;
  let cachedViewTick = -1;

  // 派生视图每步只算一次：可达集合是 BFS，没必要每帧重跑。
  const viewFor = (state) => {
    if (cachedView === null || cachedViewTick !== state.tick) {
      cachedView = boardView(state);
      cachedViewTick = state.tick;
    }
    return cachedView;
  };

  // 靠 tick 判断这批特效是不是新的：state 在两次动作之间是同一个对象，不能每帧重放。
  const consume = (state, time) => {
    if (state.level !== lastLevel) {
      lastLevel = state.level;
      lastTick = state.tick;
      cachedViewTick = -1;
      animation = null;
      focusY = state.activeLayer * LAYER_HEIGHT;
      return;
    }
    if (state.tick === lastTick) return;
    lastTick = state.tick;
    const walk = state.effects.find((effect) => effect.type === 'walk');
    const shifted = state.effects.find((effect) => effect.type === 'shift');
    if (walk) {
      animation = {
        kind: 'walk',
        path: walk.path,
        startedAt: time,
        duration: walkDuration(walk.path, WALK_SECONDS_PER_CELL),
      };
    } else if (shifted) {
      animation = { kind: 'shift', ...shifted, startedAt: time, duration: SHIFT_SECONDS };
    } else {
      animation = null;
    }
  };

  const progressOf = (time) => {
    if (!animation) return 1;
    const raw = (time - animation.startedAt) / animation.duration;
    if (raw >= 1) {
      animation = null;
      return 1;
    }
    return Math.max(0, raw);
  };
  const writeTiles = (state, progress) => {
    const { cols, rows, layers } = state.board;
    const eased = easeOutCubic(progress);
    const shifting = animation && animation.kind === 'shift' ? animation : null;
    const along = shifting
      ? slidePositions(shifting.axis === AXIS_ROW ? cols : rows, shifting.dir, eased)
      : null;
    let slot = 0;
    for (let layer = 0; layer < layers; layer += 1) {
      const material = layer === state.activeLayer ? tileMaterial : dimMaterial;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const tile = state.board.tiles[layer][row * cols + col];
          const onLine = Boolean(shifting) && shifting.layer === layer
            && (shifting.axis === AXIS_ROW ? row === shifting.index : col === shifting.index);
          const lineIndex = shifting && shifting.axis === AXIS_ROW ? col : row;
          let colPos = col;
          let rowPos = row;
          if (onLine) {
            if (shifting.axis === AXIS_ROW) colPos = along.positions[col];
            else rowPos = along.positions[row];
          }
          const mesh = takeTile(slot);
          slot += 1;
          mesh.visible = true;
          mesh.geometry = geometryFor(tile);
          mesh.material = material;
          mesh.position.set(columnToX(cols, colPos), layer * LAYER_HEIGHT, rowToZ(rows, rowPos));
          // 绕回的那块要再画一次影子从对边滑出去，不然推移时边上会空一格。
          if (onLine && along.ghost && along.ghost.index === lineIndex) {
            const ghost = takeTile(slot);
            slot += 1;
            ghost.visible = true;
            ghost.geometry = mesh.geometry;
            ghost.material = material;
            ghost.position.set(
              columnToX(cols, shifting.axis === AXIS_ROW ? along.ghost.position : col),
              layer * LAYER_HEIGHT,
              rowToZ(rows, shifting.axis === AXIS_ROW ? row : along.ghost.position),
            );
          }
        }
      }
    }
    for (let index = slot; index < tilePool.length; index += 1) tilePool[index].visible = false;
  };
  const writePlayer = (state, progress, time) => {
    const { cols, rows } = state.board;
    let col = state.player.col;
    let row = state.player.row;
    let height = state.player.layer * LAYER_HEIGHT;
    let hop = 0;
    if (animation && animation.kind === 'walk') {
      const point = walkPoint(animation.path, progress);
      col = mix(point.from.col, point.to.col, point.t);
      row = mix(point.from.row, point.to.row, point.t);
      height = mix(point.from.layer, point.to.layer, point.t) * LAYER_HEIGHT;
      // 跨层那一步会把跳跃拉高，跃迁看着才像跃迁。
      hop = point.hop * (point.from.layer === point.to.layer ? 0.14 : 0.3);
    } else if (animation && animation.kind === 'shift' && animation.layer === state.player.layer) {
      const onLine = animation.axis === AXIS_ROW ? row === animation.index : col === animation.index;
      if (onLine) {
        const along = slidePositions(
          animation.axis === AXIS_ROW ? cols : rows,
          animation.dir,
          easeOutCubic(progress),
        );
        if (animation.axis === AXIS_ROW) col = along.positions[state.player.col];
        else row = along.positions[state.player.row];
      }
    }
    playerMesh.position.set(columnToX(cols, col), height + FLOOR_TOP + hop, rowToZ(rows, row));
    playerMesh.rotation.y = Math.sin(time * 1.8) * 0.14;
  };

  const writeExit = (state, time) => {
    const { cols, rows } = state.board;
    exitMesh.position.set(
      columnToX(cols, state.exit.col),
      state.exit.layer * LAYER_HEIGHT + FLOOR_TOP,
      rowToZ(rows, state.exit.row),
    );
    exitMesh.rotation.y = time * 0.7;
    // 通关后把门拱抬起来一点，作为「成了」的收尾反馈。
    exitMesh.position.y += state.status === 'won' ? Math.abs(Math.sin(time * 2)) * 0.12 : 0;
  };
  // 光带 + 棋盘外的箭头：推移动画期间只留正在动的那条并提亮，
  // 平时标出「方向键会推的那一行一列」。
  const writeBands = (state, focus) => {
    const { cols, rows } = state.board;
    const shifting = animation && animation.kind === 'shift' ? animation : null;
    if (state.status !== 'playing') {
      rowBand.visible = false;
      colBand.visible = false;
      for (const marker of Object.values(markers)) marker.visible = false;
      return;
    }
    const anchor = shiftAnchor(state, focus);
    const layer = shifting ? shifting.layer : state.activeLayer;
    const base = layer * LAYER_HEIGHT + FLOOR_TOP;
    const opacity = shifting ? BAND_ACTIVE_OPACITY : BAND_IDLE_OPACITY;
    const rowIndex = shifting ? (shifting.axis === AXIS_ROW ? shifting.index : null) : anchor.row;
    const colIndex = shifting ? (shifting.axis === AXIS_ROW ? null : shifting.index) : anchor.col;
    markerMaterial.opacity = shifting ? MARKER_ACTIVE_OPACITY : MARKER_IDLE_OPACITY;

    rowBand.visible = rowIndex !== null;
    if (rowBand.visible) {
      rowBand.material.opacity = opacity;
      rowBand.position.set(0, base + 0.003, rowToZ(rows, rowIndex));
      rowBand.scale.set(cols * TILE_SPAN, 1, TILE_SPAN);
    }
    colBand.visible = colIndex !== null;
    if (colBand.visible) {
      colBand.material.opacity = opacity;
      colBand.position.set(columnToX(cols, colIndex), base + 0.003, 0);
      colBand.scale.set(TILE_SPAN, 1, rows * TILE_SPAN);
    }

    const tip = base + 0.16;
    markers.left.visible = rowIndex !== null;
    markers.right.visible = rowIndex !== null;
    if (rowIndex !== null) {
      const z = rowToZ(rows, rowIndex);
      markers.left.position.set(columnToX(cols, -MARKER_OFFSET), tip, z);
      markers.right.position.set(columnToX(cols, cols - 1 + MARKER_OFFSET), tip, z);
    }
    markers.up.visible = colIndex !== null;
    markers.down.visible = colIndex !== null;
    if (colIndex !== null) {
      const x = columnToX(cols, colIndex);
      markers.up.position.set(x, tip, rowToZ(rows, -MARKER_OFFSET));
      markers.down.position.set(x, tip, rowToZ(rows, rows - 1 + MARKER_OFFSET));
    }
  };

  const writePlates = (state, focus) => {
    const { cols, rows } = state.board;
    const anchor = state.status === 'playing' ? shiftAnchor(state, focus) : null;
    let slot = 0;
    for (const cell of viewFor(state)) {
      if (cell.layer !== state.activeLayer && !cell.isExit) continue;
      const isAnchor = Boolean(anchor)
        && cell.layer === state.activeLayer && cell.col === anchor.col && cell.row === anchor.row;
      let color = null;
      if (isAnchor && focus) color = HIGHLIGHT_FOCUS;
      else if (cell.isSelected) color = HIGHLIGHT_SELECTED;
      else if (cell.isExit) color = HIGHLIGHT_EXIT;
      else if (cell.reachable && !cell.isPlayer) color = HIGHLIGHT_REACHABLE;
      if (color === null || slot >= PLATE_CAPACITY) continue;
      dummy.position.set(
        columnToX(cols, cell.col),
        cell.layer * LAYER_HEIGHT + FLOOR_TOP + 0.006,
        rowToZ(rows, cell.row),
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      plates.setMatrixAt(slot, dummy.matrix);
      const linear = linearRgb(color);
      plates.instanceColor.setXYZ(slot, linear[0], linear[1], linear[2]);
      slot += 1;
    }
    plates.count = slot;
    plates.instanceMatrix.needsUpdate = true;
    plates.instanceColor.needsUpdate = true;
  };

  const updateCamera = (state) => {
    const { cols, rows, layers } = state.board;
    const view = cameraDistance(cols, rows, layers);
    // 切层时镜头缓推过去，硬切会让人分不清现在动的是哪一层。
    focusY = mix(focusY, state.activeLayer * LAYER_HEIGHT, 0.12);
    camera.position.set(0, view.height + focusY, view.back);
    camera.lookAt(0, focusY, 0);
    sun.position.set(3.5, view.height + focusY + 4, view.back + 2.5);
  };
  return {
    render(state, time, focus = null) {
      consume(state, time);
      layout = {
        cols: state.board.cols,
        rows: state.board.rows,
        layers: state.board.layers,
        activeLayer: state.activeLayer,
      };
      const progress = progressOf(time);
      writeTiles(state, progress);
      writePlayer(state, progress, time);
      writeExit(state, time);
      writeBands(state, focus);
      writePlates(state, focus);
      updateCamera(state);
      renderer.render(scene, camera);
    },

    /** 屏幕坐标打到激活层的地板平面上，是唯一知道相机矩阵的地方，所以换算放在这里。 */
    pick(clientX, clientY) {
      if (layout.cols === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      pickPlane.constant = -(layout.activeLayer * LAYER_HEIGHT + FLOOR_TOP);
      if (!raycaster.ray.intersectPlane(pickPlane, hit)) return null;
      const col = xToColumn(layout.cols, hit.x);
      const row = zToRow(layout.rows, hit.z);
      if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return null;
      return { layer: layout.activeLayer, col, row };
    },

    dispose() {
      observer.disconnect();
      plates.dispose();
      for (const resource of disposables) resource.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

