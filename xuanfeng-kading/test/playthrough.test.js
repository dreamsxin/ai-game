// 机器人通关测试：关卡难度与玩法经济的守门人。
//
// 它回答三个问题，而这三个问题只能靠真的把八关跑一遍来回答：
// 1. 每一关都过得去吗——有没有哪一关被改成了「会玩也过不去」的样子。
// 2. 档位真的是难度吗——低档该是**忘了漂、乱喷气、抢跑**的那种笨，而不是开得慢的那种笨。
// 3. **这游戏的经济关系还成立吗**——「漂移攒气 → 直道喷掉」这条链，走完必须比不走快，
//    而只走一半（漂了不喷）必须是最慢的。这一条是这个游戏之所以是这个游戏的原因，
//    靠的是把玩家的某一路操作掐掉跑对照组（见 arena.js 的 allow 参数）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/tracks.js';
import { play, sample } from './arena.js';

test('八关都过得去：满档大脑接管玩家，每关至少能达标一次', () => {
  for (let index = 0; index < LEVELS.length; index += 1) {
    const { runs, cleared } = sample(index, 6, { skill: 1 });
    const log = runs.map((run) => `${run.status}@第${run.rank}名`).join(' ');
    assert.ok(cleared > 0, `第 ${index + 1} 关（${LEVELS[index].name}）六个 seed 一次都没达标：${log}`);
  }
});

test('过关靠的是跑完全程，不是熬时间', () => {
  for (let index = 0; index < LEVELS.length; index += 1) {
    for (const run of sample(index, 3, { skill: 1 }).runs) {
      if (run.status !== 'clear' && run.status !== 'won') continue;
      const goal = run.state.level.course.length * run.state.level.laps;
      assert.ok(run.me.progress >= goal, `第 ${index + 1} 关判过关时里程还差 ${(goal - run.me.progress).toFixed(0)} 米`);
      assert.equal(run.me.lapTimes.length, run.state.level.laps, '每一圈都该留下成绩');
    }
  }
});

test('档位真的是难度：同一关同一批 seed，只换档位就明显好打', () => {
  const easy = sample(3, 6, { skill: 1, rivalSkill: 0.3 });
  const hard = sample(3, 6, { skill: 1, rivalSkill: 0.78 });
  assert.ok(
    easy.cleared > hard.cleared,
    `低档对手时过关 ${easy.cleared} 次，高档对手时 ${hard.cleared} 次——档位没起作用`,
  );
});

test('满档比低档快，而且快在氮气上', () => {
  let fast = 0;
  let slow = 0;
  let fastBoosts = 0;
  let slowBoosts = 0;
  for (let index = 0; index < LEVELS.length; index += 1) {
    const good = play({ levelIndex: index, attempt: 1, skill: 1 });
    const poor = play({ levelIndex: index, attempt: 1, skill: 0.3 });
    fast += good.seconds;
    slow += poor.seconds;
    fastBoosts += good.tally.boosts;
    slowBoosts += poor.tally.boosts;
  }
  assert.ok(fast < slow, `满档合计 ${fast.toFixed(0)}s，低档 ${slow.toFixed(0)}s`);
  assert.ok(fastBoosts > slowBoosts, `满档喷了 ${fastBoosts} 次，低档 ${slowBoosts} 次——差距不在氮气上`);
});

test('低档会抢跑，满档不会', () => {
  let careless = 0;
  let careful = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (play({ levelIndex: 2, attempt, skill: 0.3 }).me.launch === 'early') careless += 1;
    if (play({ levelIndex: 2, attempt, skill: 1 }).me.launch === 'early') careful += 1;
  }
  assert.ok(careless > careful, `低档抢跑 ${careless} 次，满档 ${careful} 次——低档的笨没体现在起步上`);
  assert.equal(careful, 0, '满档不该抢跑');
});

test('经济关系：漂移攒气再喷掉最快，漂了不喷最慢', () => {
  for (let index = 0; index < LEVELS.length; index += 1) {
    let full = 0;
    let noDrift = 0;
    let noBoost = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      full += play({ levelIndex: index, attempt, skill: 1 }).seconds;
      noDrift += play({ levelIndex: index, attempt, skill: 1, allow: { drift: false } }).seconds;
      noBoost += play({ levelIndex: index, attempt, skill: 1, allow: { boost: false } }).seconds;
    }
    const name = `第 ${index + 1} 关（${LEVELS[index].name}）`;
    assert.ok(full < noDrift, `${name} 不漂移反而更快：${(noDrift / 3).toFixed(1)}s vs ${(full / 3).toFixed(1)}s`);
    assert.ok(
      noBoost > noDrift,
      `${name} 漂了不喷 ${(noBoost / 3).toFixed(1)}s 竟然不比一路抓地 ${(noDrift / 3).toFixed(1)}s 慢`,
    );
  }
});

test('满档会把气攒成档、也会真的喷出去', () => {
  const run = play({ levelIndex: 4, attempt: 0, skill: 1 });
  assert.ok(run.tally.ready >= 6, `一局只攒成 ${run.tally.ready} 档`);
  assert.ok(run.tally.boosts >= 5, `一局只喷了 ${run.tally.boosts} 次`);
  assert.ok(run.tally.chain >= 3, `一局只接上 ${run.tally.chain} 次连喷——连喷窗口形同虚设`);
  assert.ok(run.tally.ready >= run.tally.fizzle, '白漂的次数不该多过攒成的次数');
});
