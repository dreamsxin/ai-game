import { ABILITIES, createAbilityState, dashActive, phaseActive, updateAbilities } from './abilities.js';
import { createEncounterState, updateEncounter } from './encounters.js';
import { LEVEL } from './level.js';
import { PLAYER_STAGES } from './progression.js';
import { ASCENSION_MASS, canConsume, INITIAL_RADIUS, MAX_NAVIGATION_RADIUS, radiusForMass, resultStars } from './rules.js';

export const STEP = 1 / 60;
const ASCENSION_DURATION = 4;
const MAX_SPEED = 11;
const ACCELERATION = 28;
const DAMPING = 0.86;
const COMBO_WINDOW = 2.7;

const cloneLevelObjects = () => LEVEL.objects.map((object) => ({ ...object, vx: 0, vz: 0, active: true }));
const cloneStructures = () => LEVEL.structures.map((structure) => ({ ...structure, active: true }));
const cloneAnchors = () => LEVEL.anchors.map((anchor) => ({ ...anchor, integrity: 2, active: true }));
const navigationRadius = (player) => Math.min(player.radius, MAX_NAVIGATION_RADIUS);

export { radiusForMass };

export function createGame(seed = LEVEL.seed) {
  return {
    seed,
    status: 'playing',
    elapsed: 0,
    ascensionElapsed: 0,
    ascensionLevel: 1,
    player: {
      x: LEVEL.start.x, z: LEVEL.start.z, vx: 0, vz: -0.8, mass: 0, radius: INITIAL_RADIUS,
      integrity: 100, abilities: createAbilityState(), combo: 0, comboRemaining: 0, highestCombo: 0,
    },
    objects: cloneLevelObjects(),
    structures: cloneStructures(),
    anchors: cloneAnchors(),
    encounter: createEncounterState(),
    collected: 0,
    totalMass: LEVEL.objects.reduce((sum, object) => sum + object.mass, 0),
    collectionEvents: [],
    stageUpEvents: [],
    actionEvents: [],
    eventCursor: 0,
    message: '滚动已接管 · 冲刺穿透前方晶板',
    result: null,
  };
}

export function resetGame(seed = LEVEL.seed) {
  return createGame(seed);
}

function pushEvent(state, collection, event) {
  state.eventCursor += 1;
  state[collection].push({ ...event, id: `${event.type ?? collection}-${state.eventCursor}`, at: state.elapsed });
  if (state[collection].length > 48) state[collection].splice(0, state[collection].length - 48);
}

function normalizedInput(input = {}) {
  const x = Number(input.x) || 0;
  const z = Number(input.z) || 0;
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}

function resolveRect(player, rect) {
  const radius = navigationRadius(player);
  const halfWidth = rect.width / 2 + radius;
  const halfDepth = rect.depth / 2 + radius;
  const dx = player.x - rect.x;
  const dz = player.z - rect.z;
  if (Math.abs(dx) >= halfWidth || Math.abs(dz) >= halfDepth) return false;
  const pushX = halfWidth - Math.abs(dx);
  const pushZ = halfDepth - Math.abs(dz);
  if (pushX < pushZ) {
    player.x += Math.sign(dx || 1) * pushX;
    player.vx = 0;
  } else {
    player.z += Math.sign(dz || 1) * pushZ;
    player.vz = 0;
  }
  return true;
}

function stageIndexForMass(mass) {
  let index = 0;
  for (let i = 1; i < PLAYER_STAGES.length; i += 1) if (mass >= PLAYER_STAGES[i].minMass) index = i;
  return index;
}

function lineBlocked(from, to) {
  for (const obstacle of LEVEL.obstacles) {
    const steps = 12;
    for (let index = 1; index < steps; index += 1) {
      const amount = index / steps;
      const x = from.x + (to.x - from.x) * amount;
      const z = from.z + (to.z - from.z) * amount;
      if (Math.abs(x - obstacle.x) <= obstacle.width / 2 && Math.abs(z - obstacle.z) <= obstacle.depth / 2) return true;
    }
  }
  return false;
}

function updateGravityObjects(state, dt) {
  if (!state.player.abilities.gravity.active) return;
  for (const object of state.objects) {
    if (!object.active || !object.gravity) continue;
    const dx = state.player.x - object.x;
    const dz = state.player.z - object.z;
    const distance = Math.hypot(dx, dz);
    if (distance > ABILITIES.gravity.radius || distance < 0.01 || lineBlocked(object, state.player)) continue;
    const force = ABILITIES.gravity.strength * (1 - distance / ABILITIES.gravity.radius);
    object.vx += (dx / distance) * force * dt;
    object.vz += (dz / distance) * force * dt;
    object.vx *= 0.94;
    object.vz *= 0.94;
    object.x += object.vx * dt;
    object.z += object.vz * dt;
  }
}

function updateStructures(state) {
  for (const structure of state.structures) {
    if (!structure.active) continue;
    if (structure.kind === 'phaseable' && phaseActive(state.player)) {
      const inside = Math.abs(state.player.x - structure.x) < structure.width / 2 + navigationRadius(state.player)
        && Math.abs(state.player.z - structure.z) < structure.depth / 2 + navigationRadius(state.player);
      if (inside) state.encounter.phaseShortcut = true;
      continue;
    }
    if (structure.kind === 'breakable' && dashActive(state.player)) {
      const hit = Math.abs(state.player.x - structure.x) < structure.width / 2 + navigationRadius(state.player)
        && Math.abs(state.player.z - structure.z) < structure.depth / 2 + navigationRadius(state.player);
      if (hit) {
        structure.active = false;
        state.encounter.brokenStructures.push(structure.id);
        pushEvent(state, 'actionEvents', { type: 'structureBreak', structureId: structure.id, x: structure.x, z: structure.z, color: structure.color });
        state.message = '冲刺破壁 · 连击窗口延长';
        state.player.comboRemaining = COMBO_WINDOW;
        continue;
      }
    }
    resolveRect(state.player, structure);
  }
}

function updateAnchors(state, dt) {
  for (const anchor of state.anchors) {
    if (!anchor.active) continue;
    const distance = Math.hypot(state.player.x - anchor.x, state.player.z - anchor.z);
    const correctAbility = anchor.ability === 'dash' ? dashActive(state.player) : state.player.abilities.gravity.active;
    if (!correctAbility || distance > anchor.radius + navigationRadius(state.player) + (anchor.ability === 'gravity' ? 3 : 0)) continue;
    anchor.integrity -= anchor.ability === 'dash' ? 2 : dt * 1.8;
    if (anchor.integrity > 0) continue;
    anchor.active = false;
    state.encounter.anchors[anchor.id] = 0;
    pushEvent(state, 'actionEvents', { type: 'anchorBreak', anchorId: anchor.id, x: anchor.x, z: anchor.z, color: anchor.color });
    state.message = `核心锚点解除 · ${state.anchors.filter((item) => item.active).length} 个剩余`;
  }
}

function collectObjects(state) {
  const player = state.player;
  const previousStage = stageIndexForMass(player.mass);
  const eligible = new Set(state.objects.filter((object) => canConsume(player, object, state.encounter)).map((object) => object.id));
  let collectedThisStep = 0;
  for (const object of state.objects) {
    if (!eligible.has(object.id)) continue;
    const distance = Math.hypot(player.x - object.x, player.z - object.z);
    if (distance > player.radius + object.size * 0.72) continue;
    object.active = false;
    player.mass += object.mass;
    player.radius = radiusForMass(player.mass);
    player.abilities.resonance = Math.min(100, player.abilities.resonance + 10);
    player.combo = player.comboRemaining > 0 ? player.combo + 1 : 1;
    player.comboRemaining = COMBO_WINDOW;
    player.highestCombo = Math.max(player.highestCombo, player.combo);
    state.collected += 1;
    collectedThisStep += 1;
    pushEvent(state, 'collectionEvents', {
      type: object.type, objectId: object.id, x: object.x, z: object.z,
      size: object.size, mass: object.mass, color: object.color,
    });
  }
  if (collectedThisStep === 0) return;
  const newStage = stageIndexForMass(player.mass);
  if (newStage > previousStage) {
    pushEvent(state, 'stageUpEvents', {
      type: 'stageUp', fromStage: previousStage, toStage: newStage,
      stageName: PLAYER_STAGES[newStage].name, x: player.x, z: player.z, radius: player.radius,
    });
    state.message = `能力解锁 · ${PLAYER_STAGES[newStage].name}`;
  } else {
    state.message = `${player.combo > 1 ? `共鸣连击 ×${player.combo}` : '吞噬完成'} · 质量 ${player.mass.toFixed(1)}`;
  }
}

export function isAscensionUnlocked(state) {
  return state.player.mass >= ASCENSION_MASS && !state.objects.find((object) => object.id === 'core')?.active;
}

export function canEnterExit(state) {
  const distance = Math.hypot(state.player.x - LEVEL.exit.x, state.player.z - LEVEL.exit.z);
  return isAscensionUnlocked(state) && distance <= LEVEL.exit.radius + state.player.radius * 0.35;
}

export function step(state, input = {}, dt = STEP) {
  if (state.status === 'ascending') {
    const next = structuredClone(state);
    next.ascensionElapsed = Math.min(ASCENSION_DURATION, next.ascensionElapsed + dt);
    if (next.ascensionElapsed >= ASCENSION_DURATION) {
      next.status = 'won';
      next.result = {
        elapsed: next.elapsed,
        collected: next.collected,
        highestCombo: next.player.highestCombo,
        route: next.encounter.route ?? 'steady',
        phaseShortcut: next.encounter.phaseShortcut,
      };
      next.result.stars = resultStars(next.result);
      next.message = `维度跃迁完成 · ${next.result.stars} 星评价`;
    }
    return next;
  }
  if (state.status !== 'playing') return state;
  const next = structuredClone(state);
  const direction = normalizedInput(input);
  const player = next.player;
  player.comboRemaining = Math.max(0, player.comboRemaining - dt);
  if (player.comboRemaining === 0) player.combo = 0;
  updateAbilities(player, { ...input, ...direction }, dt);

  if (dashActive(player)) {
    player.vx = player.abilities.dash.direction.x * ABILITIES.dash.speed;
    player.vz = player.abilities.dash.direction.z * ABILITIES.dash.speed;
  } else if (phaseActive(player)) {
    const phaseDirection = Math.hypot(direction.x, direction.z) > 0.05
      ? direction
      : { x: player.abilities.dash.direction.x, z: player.abilities.dash.direction.z };
    player.vx = phaseDirection.x * ABILITIES.phase.speed;
    player.vz = phaseDirection.z * ABILITIES.phase.speed;
  } else {
    player.vx += direction.x * ACCELERATION * dt;
    player.vz += direction.z * ACCELERATION * dt;
    player.vx *= Math.pow(DAMPING, dt * 60);
    player.vz *= Math.pow(DAMPING, dt * 60);
    const speed = Math.hypot(player.vx, player.vz);
    if (speed > MAX_SPEED) {
      player.vx = (player.vx / speed) * MAX_SPEED;
      player.vz = (player.vz / speed) * MAX_SPEED;
    }
  }

  player.x += player.vx * dt;
  player.z += player.vz * dt;
  for (const obstacle of LEVEL.obstacles) resolveRect(player, obstacle);
  updateStructures(next);
  const collisionRadius = navigationRadius(player);
  player.x = Math.max(LEVEL.bounds.minX + collisionRadius, Math.min(LEVEL.bounds.maxX - collisionRadius, player.x));
  player.z = Math.max(LEVEL.bounds.minZ + collisionRadius, Math.min(LEVEL.bounds.maxZ - collisionRadius, player.z));
  updateGravityObjects(next, dt);
  updateAnchors(next, dt);
  collectObjects(next);
  next.elapsed += dt;
  const objective = updateEncounter(next);

  if (canEnterExit(next)) {
    next.status = 'ascending';
    next.ascensionElapsed = 0;
    next.message = '浑天仪环阵启动 · 正在校准下一维层坐标';
  } else if (isAscensionUnlocked(next)) {
    next.message = '三环已完整 · 前往浑天仪飞升锚点';
  } else if (!next.message.includes('·') || next.elapsed % 3 < dt) {
    next.message = objective;
  }
  return next;
}

export function startGame(state) {
  if (state.status === 'paused') return { ...state, status: 'playing', message: '继续滚动' };
  return { ...state, status: 'playing' };
}

export function togglePause(state) {
  if (state.status === 'playing') return { ...state, status: 'paused', message: '世界暂停，能量仍在你手中' };
  if (state.status === 'paused') return { ...state, status: 'playing', message: '继续滚动' };
  return state;
}

export function ascensionProgress(state) {
  return Math.max(0, Math.min(1, state.ascensionElapsed / ASCENSION_DURATION));
}
