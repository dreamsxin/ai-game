import { ABILITIES } from './abilities.js';
import { LEVEL } from './level.js';
import { createNavGrid, isBlocked, reachableFrom, targetReachable } from './navigation.js';
import {
  canConsume, massToCross, MAX_NAVIGATION_RADIUS, radiusForMass, STELLAR_FUEL_TARGET,
  STELLAR_IGNITION_MASS,
} from './rules.js';

// 阶段化死锁验证器。高度跨越与窄门让"吞噬顺序"能真的把玩家关进死路，
// 因此需要一个不依赖单条回放路线的自动检查。
// 输入是 LEVEL 基础数据（宇宙质量倍率为 1），这是最保守的情形。

const navRadius = (mass) => Math.min(radiusForMass(mass), MAX_NAVIGATION_RADIUS);
const gridFor = (mass) => createNavGrid(navRadius(mass), mass);
const MAX_SAMPLE_MASS = STELLAR_IGNITION_MASS + 40;

// 网格只在这些质量点发生变化：矮墙变为可跨越、窄门变为关闭。
export function barrierThresholds() {
  const points = new Set([0]);
  for (const obstacle of LEVEL.obstacles) {
    const mass = massToCross(obstacle.height);
    if (mass > 0 && mass <= MAX_SAMPLE_MASS) points.add(Number(mass.toFixed(4)));
  }
  for (const gate of LEVEL.gates ?? []) {
    // 两侧门槛都会改变网格：下限决定何时推得开，上限决定何时挤不过去
    for (const bound of [gate.minMass, gate.maxMass]) {
      if (typeof bound === 'number' && bound >= 0 && bound <= MAX_SAMPLE_MASS) points.add(bound);
    }
  }
  return [...points].sort((left, right) => left - right);
}

// 每个阈值刚跨过的那一侧才是新状态，取阈值 + 0.5 作为采样点。
export function barrierSamples() {
  const samples = barrierThresholds().map((threshold) => (threshold === 0 ? 0 : threshold + 0.5));
  samples.push(MAX_SAMPLE_MASS);
  return [...new Set(samples)].sort((left, right) => left - right);
}

function checkMandatoryReachable(issues) {
  const mass = STELLAR_IGNITION_MASS;
  const grid = gridFor(mass);
  const reach = reachableFrom(grid, LEVEL.start);
  const mandatory = [
    ...LEVEL.anchors.map((anchor) => ({ id: anchor.id, kind: '锚点', x: anchor.x, z: anchor.z })),
    { id: 'core', kind: '核心', x: LEVEL.objects.find((object) => object.id === 'core').x, z: LEVEL.objects.find((object) => object.id === 'core').z },
    { id: 'exit', kind: '裂隙出口', x: LEVEL.exit.x, z: LEVEL.exit.z },
  ];
  for (const target of mandatory) {
    if (!targetReachable(grid, reach, target)) {
      issues.push(`点火质量下 ${target.kind} ${target.id} 从出生点不可达`);
    }
  }
}

// 核心检查：玩家在某个体型下能走到的每一格，长大之后必须仍能回到出口。
// 否则"穿过窄门再长大"就会把自己永久关在里面。
function checkNoGrowthTrap(issues) {
  const samples = barrierSamples();
  for (let index = 0; index < samples.length - 1; index += 1) {
    const before = samples[index];
    const after = samples[index + 1];
    const gridBefore = gridFor(before);
    const gridAfter = gridFor(after);
    const roaming = reachableFrom(gridBefore, LEVEL.start);
    const exitSide = reachableFrom(gridAfter, LEVEL.exit);
    let trapped = 0;
    let sample = null;
    for (let cell = 0; cell < roaming.length; cell += 1) {
      if (!roaming[cell]) continue;
      const col = cell % gridAfter.cols;
      const row = (cell - col) / gridAfter.cols;
      // 长大后变成障碍的格由模拟层推出，不算陷阱
      if (isBlocked(gridAfter, col, row)) continue;
      if (exitSide[cell]) continue;
      trapped += 1;
      if (!sample) {
        sample = {
          x: (gridAfter.minX + (col + 0.5) * gridAfter.cellSize).toFixed(1),
          z: (gridAfter.minZ + (row + 0.5) * gridAfter.cellSize).toFixed(1),
        };
      }
    }
    if (trapped > 0) {
      issues.push(
        `质量从 ${before.toFixed(1)} 长到 ${after.toFixed(1)} 后，`
        + `${trapped} 格区域与出口断开（例如 ${sample.x}, ${sample.z}）`,
      );
    }
  }
}

// 贪心见证：每步吃掉可达且吃得下的最轻目标，证明至少存在一条能完成点火的顺序。
export function greedyWitness() {
  let mass = 0;
  let fuel = 0;
  const consumed = new Set();
  const cleared = new Set();
  const order = [];
  for (let guard = 0; guard < LEVEL.objects.length + LEVEL.anchors.length + 4; guard += 1) {
    const grid = gridFor(mass);
    const reach = reachableFrom(grid, LEVEL.start);
    for (const anchor of LEVEL.anchors) {
      if (cleared.has(anchor.id)) continue;
      if (mass < ABILITIES[anchor.ability].unlockMass) continue;
      if (!targetReachable(grid, reach, anchor)) continue;
      cleared.add(anchor.id);
      order.push(`解除锚点 ${anchor.id}`);
    }
    const coreUnlocked = cleared.has('north') && cleared.has('south');
    const candidates = LEVEL.objects
      .filter((object) => !consumed.has(object.id))
      .filter((object) => canConsume({ mass }, { ...object, active: true }, { coreUnlocked }))
      .filter((object) => targetReachable(grid, reach, object))
      .sort((left, right) => (left.mass - right.mass) || (left.id < right.id ? -1 : 1));
    if (!candidates.length) break;
    const target = candidates[0];
    consumed.add(target.id);
    mass += target.mass;
    fuel = Math.min(STELLAR_FUEL_TARGET, fuel + (target.fuel ?? 0));
    order.push(`吞噬 ${target.id}`);
  }
  const finalGrid = gridFor(mass);
  const finalReach = reachableFrom(finalGrid, LEVEL.start);
  return {
    mass,
    fuel,
    order,
    anchorsCleared: cleared.size === LEVEL.anchors.length,
    coreConsumed: consumed.has('core'),
    exitReachable: targetReachable(finalGrid, finalReach, LEVEL.exit),
    ignitable: mass >= STELLAR_IGNITION_MASS
      && fuel >= STELLAR_FUEL_TARGET
      && cleared.size === LEVEL.anchors.length
      && consumed.has('core'),
  };
}

function checkGreedyWitness(issues) {
  const witness = greedyWitness();
  if (!witness.ignitable) {
    issues.push(
      `贪心顺序无法完成点火：质量 ${witness.mass.toFixed(1)}/${STELLAR_IGNITION_MASS}、`
      + `燃料 ${witness.fuel}/${STELLAR_FUEL_TARGET}、`
      + `锚点${witness.anchorsCleared ? '已' : '未'}全解、核心${witness.coreConsumed ? '已' : '未'}吞噬`,
    );
  }
  if (!witness.exitReachable) issues.push('贪心顺序结束时裂隙出口不可达');
  return witness;
}

export function validateLevel() {
  const issues = [];
  checkMandatoryReachable(issues);
  checkNoGrowthTrap(issues);
  const witness = checkGreedyWitness(issues);
  return { ok: issues.length === 0, issues, witness, samples: barrierSamples() };
}
