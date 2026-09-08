import { ABILITIES, createAbilityState, dashActive, phaseActive, updateAbilities } from './abilities.js';
import { createEncounterState, updateEncounter } from './encounters.js';
import { creatureMotion } from './creatures.js';
import { LEVEL } from './level.js';
import { PLAYER_STAGES } from './progression.js';
import { createUniverseProgress, POLARITY_FLIP_DURATION, universeForIndex } from './universes.js';
import {
  ASCENSION_MASS, applyStabilityPenalty, canConsume, consumePower, IMPACT_SPEED_THRESHOLD,
  IMPACT_STABILITY_COST, INITIAL_RADIUS, isOverloadConsume, MAX_NAVIGATION_RADIUS,
  OVERLOAD_STABILITY_COST, radiusForMass, recoverStability, RING_COMPLETION_MASS, resultStars,
  STABILITY_MAX, stellarIgnitionReady, STELLAR_FUEL_TARGET, STELLAR_STABILITY_TARGET,
} from './rules.js';

export const STEP = 1 / 60;
const ASCENSION_DURATION = 4;
const MAX_SPEED = 11;
const ACCELERATION = 28;
const DAMPING = 0.86;
const COMBO_WINDOW = 2.7;

const cloneLevelObjects = (universeDefinition) => LEVEL.objects.map((object) => {
  const polarity = universeDefinition.id === 'antimatter' && object.fuel
    ? universeDefinition.darkFuelIds?.includes(object.id) ? 'dark' : 'light'
    : 'neutral';
  return {
    ...object,
    mass: Number((object.mass * universeDefinition.massScale).toFixed(2)),
    polarity,
    polarityCharge: 0,
    vx: 0,
    vz: 0,
    active: true,
  };
});
const cloneStructures = () => LEVEL.structures.map((structure) => ({ ...structure, active: true }));
const cloneAnchors = () => LEVEL.anchors.map((anchor) => ({ ...anchor, integrity: 2, active: true }));
const navigationRadius = (player) => Math.min(player.radius, MAX_NAVIGATION_RADIUS);

export { radiusForMass };

export function createGame(seed = LEVEL.seed, universeProgress = {}) {
  const universe = createUniverseProgress(universeProgress);
  const universeDefinition = universeForIndex(universe.index);
  const objects = cloneLevelObjects(universeDefinition);
  return {
    seed,
    universe,
    status: 'playing',
    elapsed: 0,
    ascensionElapsed: 0,
    ascensionLevel: 1,
    player: {
      x: LEVEL.start.x, z: LEVEL.start.z, vx: 0, vz: -0.8, mass: 0, radius: INITIAL_RADIUS,
      integrity: 100, fuel: 0, stability: STABILITY_MAX, ignited: false, ignitionAttempts: 0,
      stabilityPenaltyCooldown: 0, stabilityRecoveryDelay: 0,
      abilities: createAbilityState(), combo: 0, comboRemaining: 0, highestCombo: 0,
    },
    objects,
    structures: cloneStructures(),
    anchors: cloneAnchors(),
    encounter: createEncounterState(),
    collected: 0,
    totalMass: objects.reduce((sum, object) => sum + object.mass, 0),
    collectionEvents: [],
    stageUpEvents: [],
    actionEvents: [],
    eventCursor: 0,
    message: `糖域 ${universe.index} · ${universe.name} · ${universe.rule}`,
    result: null,
  };
}

export function resetGame(seed = LEVEL.seed, universeProgress) {
  return createGame(seed, universeProgress);
}

export function restartCurrentUniverse(state) {
  return createGame(state.seed, state.universe);
}

export function enterNextUniverse(state) {
  if (state.status !== 'won' || !state.result) return state;
  const stars = state.result.stars ?? 0;
  const nextIndex = state.universe.index + 1;
  const nextDefinition = universeForIndex(nextIndex);
  return createGame(state.seed + nextIndex, {
    ...state.universe,
    index: nextIndex,
    cumulativeStars: state.universe.cumulativeStars + stars,
    bestCombo: Math.max(state.universe.bestCombo, state.result.highestCombo ?? 0),
    completedRuns: state.universe.completedRuns + 1,
    discoveredRules: [...state.universe.discoveredRules, nextDefinition.rule],
  });
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

function pushObjectOutOfRect(object, rect) {
  const radius = object.size * 0.5;
  const halfWidth = rect.width / 2 + radius;
  const halfDepth = rect.depth / 2 + radius;
  const dx = object.x - rect.x;
  const dz = object.z - rect.z;
  if (Math.abs(dx) >= halfWidth || Math.abs(dz) >= halfDepth) return false;
  const pushX = halfWidth - Math.abs(dx);
  const pushZ = halfDepth - Math.abs(dz);
  if (pushX < pushZ) {
    object.x += Math.sign(dx || 1) * pushX;
    object.vx = 0;
  } else {
    object.z += Math.sign(dz || 1) * pushZ;
    object.vz = 0;
  }
  return true;
}

function confineObject(state, object) {
  for (const obstacle of LEVEL.obstacles) pushObjectOutOfRect(object, obstacle);
  for (const structure of state.structures) {
    if (structure.active) pushObjectOutOfRect(object, structure);
  }
  const radius = object.size * 0.5;
  object.x = Math.max(LEVEL.bounds.minX + radius, Math.min(LEVEL.bounds.maxX - radius, object.x));
  object.z = Math.max(LEVEL.bounds.minZ + radius, Math.min(LEVEL.bounds.maxZ - radius, object.z));
}

function stageIndexForMass(mass, ignited = false) {
  let index = 0;
  for (let i = 1; i < PLAYER_STAGES.length; i += 1) {
    const stage = PLAYER_STAGES[i];
    if (mass >= stage.minMass && (!stage.requiresIgnition || ignited)) index = i;
  }
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
  const gravityActive = state.player.abilities.gravity.active;
  for (const object of state.objects) {
    if (!object.active) continue;
    const dx = state.player.x - object.x;
    const dz = state.player.z - object.z;
    const distance = Math.hypot(dx, dz);
    const blocked = lineBlocked(object, state.player);
    if (object.polarity === 'dark') {
      const consumeReady = object.type === 'core'
        ? state.encounter.coreUnlocked
        : object.mass <= consumePower(state.player);
      const repelDistance = navigationRadius(state.player) + object.size * 0.72;
      if (consumeReady && distance < repelDistance && distance > 0.01) {
        const overlap = repelDistance - distance;
        state.player.x += (dx / distance) * overlap;
        state.player.z += (dz / distance) * overlap;
        state.player.vx *= 0.35;
        state.player.vz *= 0.35;
        state.message = gravityActive ? '正在融化酸极性夹心' : '酸极性排斥 · 使用糖引力反转';
      }
      if (gravityActive && distance <= ABILITIES.gravity.radius && !blocked) {
        object.polarityCharge = Math.min(POLARITY_FLIP_DURATION, object.polarityCharge + dt);
        if (object.polarityCharge >= POLARITY_FLIP_DURATION) {
          object.polarity = 'light';
          object.polarityCharge = POLARITY_FLIP_DURATION;
          pushEvent(state, 'actionEvents', {
            type: 'polarityFlip', objectId: object.id,
            x: object.x, z: object.z, color: 0xffca70,
          });
          state.message = `甜酸反转 · ${object.id}`;
        }
      } else {
        object.polarityCharge = Math.max(0, object.polarityCharge - dt * 0.5);
      }
      continue;
    }
    if (!gravityActive || !object.gravity || distance > ABILITIES.gravity.radius || distance < 0.01 || blocked) continue;
    const force = ABILITIES.gravity.strength * (1 - distance / ABILITIES.gravity.radius);
    object.vx += (dx / distance) * force * dt;
    object.vz += (dz / distance) * force * dt;
    object.vx *= 0.94;
    object.vz *= 0.94;
    object.x += object.vx * dt;
    object.z += object.vz * dt;
    confineObject(state, object);
  }
}

function updateStructures(state) {
  let blocked = false;
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
        state.message = '冲刺碎糖壳 · 连击窗口延长';
        state.player.comboRemaining = COMBO_WINDOW;
        continue;
      }
    }
    if (resolveRect(state.player, structure)) blocked = true;
  }
  return blocked;
}

function updateAnchors(state, dt) {
  for (const anchor of state.anchors) {
    if (!anchor.active) continue;
    const distance = Math.hypot(state.player.x - anchor.x, state.player.z - anchor.z);
    const correctAbility = anchor.ability === 'dash'
      ? dashActive(state.player)
      : anchor.ability === 'gravity'
        ? state.player.abilities.gravity.active
        : phaseActive(state.player);
    const abilityRange = anchor.ability === 'gravity' ? 3 : 0;
    if (!correctAbility || distance > anchor.radius + navigationRadius(state.player) + abilityRange) continue;
    anchor.integrity -= anchor.ability === 'gravity' ? dt * 1.8 : 2;
    if (anchor.integrity > 0) continue;
    anchor.active = false;
    if (anchor.ability === 'phase') state.encounter.phaseIgnited = true;
    pushEvent(state, 'actionEvents', { type: 'anchorBreak', anchorId: anchor.id, x: anchor.x, z: anchor.z, color: anchor.color });
    state.message = `糖核锚点解除 · ${state.anchors.filter((item) => item.active).length} 个剩余`;
  }
}

function updateCreatures(state, dt) {
  for (const object of state.objects) {
    const motion = creatureMotion(object, state.player, state.encounter, dt);
    if (motion.x === 0 && motion.z === 0) continue;
    object.x += motion.x;
    object.z += motion.z;
    object.vx *= 0.88;
    object.vz *= 0.88;
    confineObject(state, object);
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
    const overload = isOverloadConsume(player, object);
    object.active = false;
    player.mass += object.mass;
    player.fuel = Math.min(STELLAR_FUEL_TARGET, player.fuel + (object.fuel ?? 0));
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
    if (!overload) continue;
    const lost = applyStabilityPenalty(player, OVERLOAD_STABILITY_COST);
    if (lost > 0) {
      pushEvent(state, 'actionEvents', {
        type: 'stabilityLoss', cause: 'overload', objectId: object.id,
        amount: lost, x: object.x, z: object.z, color: 0xff62c7,
      });
    }
  }
  if (collectedThisStep === 0) return;
  const newStage = stageIndexForMass(player.mass);
  if (newStage > previousStage) {
    pushEvent(state, 'stageUpEvents', {
      type: 'stageUp', fromStage: previousStage, toStage: newStage,
      stageName: PLAYER_STAGES[newStage].name, x: player.x, z: player.z, radius: player.radius,
    });
    state.message = `糖怪解锁 · ${PLAYER_STAGES[newStage].name}`;
  } else {
    state.message = `${player.combo > 1 ? `糖果连击 ×${player.combo}` : '吞噬完成'} · 质量 ${player.mass.toFixed(1)}`;
  }
}

export function isAscensionUnlocked(state) {
  return state.player.ignited && stellarIgnitionReady(state);
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
      next.message = `糖洞跃迁完成 · ${next.result.stars} 星评价`;
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

  const impactSpeed = Math.hypot(player.vx, player.vz);
  player.x += player.vx * dt;
  player.z += player.vz * dt;
  let blocked = false;
  for (const obstacle of LEVEL.obstacles) {
    if (resolveRect(player, obstacle)) blocked = true;
  }
  if (updateStructures(next)) blocked = true;
  const recklessImpact = blocked
    && impactSpeed > IMPACT_SPEED_THRESHOLD
    && !dashActive(player)
    && !phaseActive(player);
  if (recklessImpact) {
    const lost = applyStabilityPenalty(player, IMPACT_STABILITY_COST);
    if (lost > 0) {
      pushEvent(next, 'actionEvents', {
        type: 'stabilityLoss', cause: 'impact', amount: lost,
        x: player.x, z: player.z, color: 0x7df3ff,
      });
    }
  }
  recoverStability(player, dt);
  const collisionRadius = navigationRadius(player);
  player.x = Math.max(LEVEL.bounds.minX + collisionRadius, Math.min(LEVEL.bounds.maxX - collisionRadius, player.x));
  player.z = Math.max(LEVEL.bounds.minZ + collisionRadius, Math.min(LEVEL.bounds.maxZ - collisionRadius, player.z));
  updateGravityObjects(next, dt);
  updateAnchors(next, dt);
  updateCreatures(next, dt);
  collectObjects(next);
  next.elapsed += dt;
  const objective = updateEncounter(next);
  if (!next.player.ignited && stellarIgnitionReady(next)) {
    next.player.ignited = true;
    next.player.ignitionAttempts += 1;
    const stellarStage = PLAYER_STAGES.length - 1;
    pushEvent(next, 'stageUpEvents', {
      type: 'stageUp', fromStage: stellarStage - 1, toStage: stellarStage,
      stageName: PLAYER_STAGES[stellarStage].name,
      x: next.player.x, z: next.player.z, radius: next.player.radius,
    });
    pushEvent(next, 'actionEvents', {
      type: 'stellarIgnition', x: next.player.x, z: next.player.z, color: 0xffffff,
    });
    next.message = '糖化爆发完成 · 彩虹糖洞已开放';
  }

  if (canEnterExit(next)) {
    next.status = 'ascending';
    next.ascensionElapsed = 0;
    next.message = '彩虹糖洞启动 · 正在压缩糖心核心';
  } else if (isAscensionUnlocked(next)) {
    next.message = '糖星已诞生 · 前往彩虹糖洞';
  } else if (next.player.mass >= ASCENSION_MASS) {
    const missing = [];
    if (next.player.fuel < STELLAR_FUEL_TARGET) missing.push(`夹心燃料 ${Math.floor(next.player.fuel)}%`);
    if (next.player.stability < STELLAR_STABILITY_TARGET) missing.push(`糖心稳定度 ${Math.floor(next.player.stability)}%`);
    if (!next.encounter.phaseIgnited) missing.push('酸雾节点');
    if (next.anchors.some((anchor) => anchor.active)) missing.push('糖核锚点');
    if (next.objects.find((object) => object.id === 'core')?.active) missing.push('糖心熔炉');
    next.message = `熔糖巨怪待爆发 · ${missing.join(' / ') || '糖心校准中'}`;
  } else if (next.player.mass >= RING_COMPLETION_MASS) {
    next.message = '三环糖釉已完整 · 收集夹心并解除糖核锚点';
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
  if (state.status === 'playing') return { ...state, status: 'paused', message: '糖果世界暂停，糖心仍在你手中' };
  if (state.status === 'paused') return { ...state, status: 'playing', message: '继续滚动' };
  return state;
}

export function ascensionProgress(state) {
  return Math.max(0, Math.min(1, state.ascensionElapsed / ASCENSION_DURATION));
}
