import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSeed, switchesBetween, validateTrack } from '../src/game/validator.js';

test('generated seeds are always survivable end to end', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const report = auditSeed(seed, 40);
    assert.ok(report.ok, `seed ${seed} 在第 ${report.failedRow} 排出现死局：${report.reason}`);
    assert.ok(report.rows > 40, `seed ${seed} 只生成了 ${report.rows} 排，密度过低`);
    assert.ok(report.coins > 0, `seed ${seed} 一枚金币都没有`);
  }
});

test('障碍密度落在可玩区间内', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const report = auditSeed(seed, 40);
    assert.ok(
      report.obstaclesPerHundredMeters > 8 && report.obstaclesPerHundredMeters < 40,
      `seed ${seed} 每百米 ${report.obstaclesPerHundredMeters.toFixed(1)} 个障碍`,
    );
  }
});

test('a fully blocked row is reported as a dead end', () => {
  const rows = [{ z: 40, freeLanes: [], obstacles: [] }];
  const verdict = validateTrack(rows);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'row-fully-blocked');
  assert.equal(verdict.failedRow, 0);
});

test('an open lane that is too far away counts as unreachable', () => {
  // 两排只隔 0.3 米，来不及从中间道挪到最外道。
  const rows = [
    { z: 30, freeLanes: [1], obstacles: [] },
    { z: 30.3, freeLanes: [0], obstacles: [] },
  ];
  const verdict = validateTrack(rows);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'row-unreachable');
  assert.equal(verdict.failedRow, 1);
});

test('switch budget grows with the gap and shrinks as speed rises', () => {
  assert.equal(switchesBetween(0, 0.1), 0);
  assert.ok(switchesBetween(0, 8) >= 2, `低速 8 米应至少够两次变道，实际 ${switchesBetween(0, 8)}`);
  assert.ok(
    switchesBetween(20_000, 8) < switchesBetween(0, 8),
    '同样的间距在高速下应更难变道',
  );
});
