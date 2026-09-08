import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../src/game/level.js';
import { STELLAR_FUEL_TARGET, STELLAR_IGNITION_MASS, massToCross } from '../src/game/rules.js';
import { barrierSamples, barrierThresholds, greedyWitness, validateLevel } from '../src/game/validator.js';

test('barrier thresholds come from crossing masses and gate caps', () => {
  const thresholds = barrierThresholds();
  assert.equal(thresholds[0], 0, '必须从质量 0 开始采样');
  for (const gate of LEVEL.gates) {
    assert.ok(thresholds.includes(gate.maxMass), `缺少窄门阈值 ${gate.id}`);
  }
  const crossable = LEVEL.obstacles.filter((obstacle) => massToCross(obstacle.height) <= STELLAR_IGNITION_MASS);
  for (const obstacle of crossable) {
    const mass = Number(massToCross(obstacle.height).toFixed(4));
    assert.ok(thresholds.includes(mass), `缺少跨越阈值 ${obstacle.id}`);
  }
  const samples = barrierSamples();
  assert.ok(samples.length >= thresholds.length, '采样点应覆盖每个阈值的上侧');
  assert.deepEqual(samples, [...samples].sort((left, right) => left - right), '采样点必须有序');
});

test('the shipped level has a legal eating order that reaches ignition', () => {
  const witness = greedyWitness();
  assert.ok(witness.ignitable, `贪心顺序应能点火，实际 ${JSON.stringify(witness)}`);
  assert.ok(witness.mass >= STELLAR_IGNITION_MASS);
  assert.equal(witness.fuel, STELLAR_FUEL_TARGET);
  assert.ok(witness.anchorsCleared);
  assert.ok(witness.coreConsumed);
  assert.ok(witness.exitReachable);
});

test('the shipped level passes every staged check', () => {
  const report = validateLevel();
  assert.equal(report.ok, true, `首关不应有死锁问题：${report.issues.join(' / ')}`);
});

test('a pocket sealed by a narrow gate is reported as a growth trap', () => {
  const obstacles = LEVEL.obstacles.slice();
  const gates = LEVEL.gates.slice();
  // 用东北角围出一个只能在小身位时进入的口袋：长大后窄门关闭就出不来了。
  // 开口必须宽于两倍导航半径，否则膨胀本身就把口袋封死，测不到"陷阱"。
  LEVEL.obstacles.push(
    { id: 'trap-west-lower', x: 13, z: 12.5, width: 1, depth: 5, height: 6 },
    { id: 'trap-west-upper', x: 13, z: 20.5, width: 1, depth: 3, height: 6 },
    { id: 'trap-south', x: 20, z: 9.5, width: 14, depth: 1, height: 6 },
  );
  LEVEL.gates.push({ id: 'trap-gate', x: 13, z: 17, width: 1, depth: 4, height: 3, maxMass: 10 });
  try {
    const report = validateLevel();
    assert.equal(report.ok, false, '验证器必须发现这个陷阱，否则它没有检出能力');
    assert.ok(
      report.issues.some((issue) => issue.includes('与出口断开')),
      `应报告区域与出口断开，实际问题：${report.issues.join(' / ')}`,
    );
  } finally {
    LEVEL.obstacles.length = 0;
    LEVEL.obstacles.push(...obstacles);
    LEVEL.gates.length = 0;
    LEVEL.gates.push(...gates);
  }
  assert.equal(validateLevel().ok, true, '恢复后首关应重新通过');
});

test('an unreachable core is reported instead of silently passing', () => {
  const obstacles = LEVEL.obstacles.slice();
  const core = LEVEL.objects.find((object) => object.id === 'core');
  const original = { x: core.x, z: core.z };
  // 把核心埋进一个四面封死的盒子
  LEVEL.obstacles.push(
    { id: 'box-n', x: 0, z: 20.5, width: 6, depth: 1, height: 6 },
    { id: 'box-s', x: 0, z: 15.5, width: 6, depth: 1, height: 6 },
    { id: 'box-w', x: -2.5, z: 18, width: 1, depth: 6, height: 6 },
    { id: 'box-e', x: 2.5, z: 18, width: 1, depth: 6, height: 6 },
  );
  core.x = 0;
  core.z = 18;
  try {
    const report = validateLevel();
    assert.equal(report.ok, false, '核心被封死时必须报错');
    assert.ok(
      report.issues.some((issue) => issue.includes('core')),
      `应点名核心不可达，实际问题：${report.issues.join(' / ')}`,
    );
  } finally {
    LEVEL.obstacles.length = 0;
    LEVEL.obstacles.push(...obstacles);
    core.x = original.x;
    core.z = original.z;
  }
  assert.equal(validateLevel().ok, true, '恢复后首关应重新通过');
});
