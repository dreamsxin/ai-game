import { LEVEL } from './level.js';
import { applyPuzzleMove, commitPuzzle, createPuzzleState, scorePuzzle } from './puzzle.js';
import { PLAYER_STAGES } from './progression.js';

export const STEP = 1 / 60;
const ASCENSION_DURATION = 4;
const INITIAL_RADIUS = 1.15;
const MASS_PER_RADIUS = 7;
const MAX_SPEED = 11;
const ACCELERATION = 28;
const DAMPING = 0.86;
const MAX_NAVIGATION_RADIUS = 2.1;

const navigationRadius = (player) => Math.min(player.radius, MAX_NAVIGATION_RADIUS);

const cloneLevelObjects = () => LEVEL.objects.map((object) => ({ ...object, active: true }));

export function radiusForMass(mass) {
  return INITIAL_RADIUS + Math.sqrt(Math.max(0, mass) / MASS_PER_RADIUS);
}

export function createGame(seed = LEVEL.seed) {
  return {
    seed,
    status: 'ready',
    elapsed: 0,
    ascensionElapsed: 0,
    ascensionLevel: 1,
    puzzle: createPuzzleState(),
    plannedRoute: [],
    routeScore: null,
    player: { x: LEVEL.start.x, z: LEVEL.start.z, vx: 0, vz: 0, mass: 0, radius: INITIAL_RADIUS },
    objects: cloneLevelObjects(),
    collected: 0,
    totalMass: LEVEL.objects.reduce((sum, object) => sum + object.mass, 0),
    collectionEvents: [],
    stageUpEvents: [],
    eventCursor: 0,
    message: '向光而行，先吞噬小型几何体',
  };
}

export function resetGame(seed = LEVEL.seed) {
  return createGame(seed);
}

function normalizedInput(input = {}) {
  const x = Number(input.x) || 0;
  const z = Number(input.z) || 0;
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}

function resolveObstacle(player, obstacle) {
  const collisionRadius = navigationRadius(player);
  const halfWidth = obstacle.width / 2 + collisionRadius;
  const halfDepth = obstacle.depth / 2 + collisionRadius;
  const dx = player.x - obstacle.x;
  const dz = player.z - obstacle.z;
  if (Math.abs(dx) >= halfWidth || Math.abs(dz) >= halfDepth) return;
  const pushX = halfWidth - Math.abs(dx);
  const pushZ = halfDepth - Math.abs(dz);
  if (pushX < pushZ) {
    player.x += Math.sign(dx || 1) * pushX;
    player.vx = 0;
  } else {
    player.z += Math.sign(dz || 1) * pushZ;
    player.vz = 0;
  }
}

function stageIndexForMass(mass) {
  let index = 0;
  for (let i = 1; i < PLAYER_STAGES.length; i += 1) {
    if (mass >= PLAYER_STAGES[i].minMass) index = i;
  }
  return index;
}

function collectObjects(state) {
  const player = state.player;
  const previousStage = stageIndexForMass(player.mass);
  let collectedThisStep = 0;
  for (const object of state.objects) {
    if (!object.active) continue;
    const distance = Math.hypot(player.x - object.x, player.z - object.z);
    if (player.mass + 2 >= object.mass && distance <= player.radius + object.size * 0.72) {
      object.active = false;
      player.mass += object.mass;
      player.radius = radiusForMass(player.mass);
      state.collected += 1;
      collectedThisStep += 1;
      state.collectionEvents.push({
        id: `${object.id}-${state.eventCursor + collectedThisStep}`,
        objectId: object.id,
        type: object.type,
        x: object.x,
        z: object.z,
        size: object.size,
        mass: object.mass,
        color: object.color,
        at: state.elapsed,
      });
    }
  }
  state.eventCursor += collectedThisStep;
  if (collectedThisStep > 0) {
    const newStage = stageIndexForMass(player.mass);
    if (newStage > previousStage) {
      state.stageUpEvents.push({
        id: `stage-${state.eventCursor}-${newStage}`,
        fromStage: previousStage,
        toStage: newStage,
        stageName: PLAYER_STAGES[newStage].name,
        x: player.x,
        z: player.z,
        radius: player.radius,
        at: state.elapsed,
      });
      state.message = `阶段突破 · 进入「${PLAYER_STAGES[newStage].name}」`;
    } else {
      state.message = `${collectedThisStep > 1 ? `连锁吞噬 ×${collectedThisStep}` : '吞噬完成'} · 体积 ${player.radius.toFixed(1)}`;
    }
  }
}

export function isAscensionUnlocked(state) {
  return state.player.mass >= 90;
}

export function canEnterExit(state) {
  const distance = Math.hypot(state.player.x - LEVEL.exit.x, state.player.z - LEVEL.exit.z);
  return isAscensionUnlocked(state) && distance <= LEVEL.exit.radius + state.player.radius * 0.35;
}

export function step(state, input = {}, dt = STEP) {
  if (state.status === 'ascending') {
    const next = structuredClone(state);
    next.ascensionElapsed = Math.min(ASCENSION_DURATION, next.ascensionElapsed + dt);
    next.collectionEvents = [];
    next.stageUpEvents = [];
    if (next.ascensionElapsed >= ASCENSION_DURATION) {
      next.status = 'won';
      next.message = `维度跃迁完成 · 抵达第 ${next.ascensionLevel + 1} 层`;
    }
    return next;
  }
  if (state.status !== 'playing') return state;
  const next = structuredClone(state);
  next.collectionEvents = [];
  next.stageUpEvents = [];
  const direction = normalizedInput(input);
  const player = next.player;
  player.vx += direction.x * ACCELERATION * dt;
  player.vz += direction.z * ACCELERATION * dt;
  player.vx *= Math.pow(DAMPING, dt * 60);
  player.vz *= Math.pow(DAMPING, dt * 60);
  const speed = Math.hypot(player.vx, player.vz);
  if (speed > MAX_SPEED) {
    player.vx = (player.vx / speed) * MAX_SPEED;
    player.vz = (player.vz / speed) * MAX_SPEED;
  }
  player.x += player.vx * dt;
  player.z += player.vz * dt;
  for (const obstacle of LEVEL.obstacles) resolveObstacle(player, obstacle);
  const collisionRadius = navigationRadius(player);
  player.x = Math.max(LEVEL.bounds.minX + collisionRadius, Math.min(LEVEL.bounds.maxX - collisionRadius, player.x));
  player.z = Math.max(LEVEL.bounds.minZ + collisionRadius, Math.min(LEVEL.bounds.maxZ - collisionRadius, player.z));
  collectObjects(next);
  next.elapsed += dt;
  if (canEnterExit(next)) {
    next.status = 'ascending';
    next.ascensionElapsed = 0;
    next.message = '浑天仪环阵启动 · 正在校准下一维层坐标';
  } else if (isAscensionUnlocked(next)) {
    next.message = '三环已完整 · 前往浑天仪飞升锚点';
  }
  return next;
}

export function enterPlanning(state) {
  if (state.status !== 'ready') return state;
  return { ...state, status: 'planning', message: '滑动星环模块，连接起点与虹彩检查点' };
}

export function movePuzzle(state, move) {
  if (state.status !== 'planning') return state;
  const puzzle = applyPuzzleMove(state.puzzle, move);
  return { ...state, puzzle, message: `已移动 ${puzzle.moduleMoves} 步 · 检查接口与质量门` };
}

export function usePuzzleHint(state) {
  if (state.status !== 'planning') return state;
  const hintTier = Math.min(3, state.puzzle.hintTier + 1);
  const messages = [
    '',
    '提示：先让起点向上连接冰青光室',
    '提示：中间行向左滑动一次，再调整两条纵列',
    '完整提示：按亮起的行列控制依次移动',
  ];
  return { ...state, puzzle: { ...state.puzzle, hintTier }, message: messages[hintTier] };
}

export function submitPuzzle(state) {
  if (state.status !== 'planning') return state;
  const result = commitPuzzle(state.puzzle);
  if (!result.committed) return { ...state, message: result.analysis.reason };
  const plannedRoute = result.analysis.route
    .flatMap((routeStep) => routeStep.collections)
    .map((id) => ({ kind: 'object', id }));
  return {
    ...state,
    status: 'playing',
    puzzle: result.state,
    plannedRoute,
    routeScore: scorePuzzle(result.state),
    message: `路线已锁定 · ${result.analysis.travelSteps} 段成长路径`,
  };
}

export function startGame(state) {
  return { ...state, status: 'playing', message: '寻找最小的光球，建立你的第一圈成长' };
}

export function togglePause(state) {
  if (state.status === 'playing') return { ...state, status: 'paused', message: '世界暂停，能量仍在你手中' };
  if (state.status === 'paused') return { ...state, status: 'playing', message: '继续滚动' };
  return state;
}

export function ascensionProgress(state) {
  return Math.max(0, Math.min(1, state.ascensionElapsed / ASCENSION_DURATION));
}
