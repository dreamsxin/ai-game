// 机器人通关测试：关卡难度的守门人。
//
// 它回答两个问题，而这两个问题只能靠真的把八关打一遍来回答：
// 1. 每一关都过得去吗——有没有哪一关被改成了「会玩也过不去」的样子。
// 2. 档位真的是难度吗——低档对手该是**会把自己裹成水泡**的那种笨，
//    而不是走得慢的那种笨。这条守住了，八关的递进才是真的递进。

import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/maps.js';
import { play, sample } from './arena.js';

test('八关都过得去：满档大脑接管玩家，每关至少能清一次场', () => {
  for (let index = 0; index < LEVELS.length; index += 1) {
    const { runs, cleared } = sample(index, 6);
    const log = runs.map((run) => `${run.status}@${run.seconds.toFixed(0)}s`).join(' ');
    assert.ok(cleared > 0, `第 ${index + 1} 关（${LEVELS[index].name}）六个 seed 一次都没清场：${log}`);
  }
});

test('清场靠的是补刀，不是熬时间', () => {
  // 清场的那几局必须有真的击破数：如果对手全是自己炸死的，
  // 说明「困住 → 补刀」这条主线其实没跑起来。
  let cleared = 0;
  let withKill = 0;
  for (let index = 0; index < LEVELS.length; index += 1) {
    for (const run of sample(index, 3).runs) {
      if (run.status !== 'clear') continue;
      cleared += 1;
      if (run.kills > 0) withKill += 1;
    }
  }
  assert.ok(cleared >= 6, `八关一共只清了 ${cleared} 次，样本太少说明难度已经失控`);
  assert.ok(withKill / cleared >= 0.4, `清场里只有 ${withKill}/${cleared} 是自己补掉的`);
});

test('档位真的是难度：同一张图，换低档对手就明显好打', () => {
  // 同一关、同一批 seed，只改对手档位。地图完全一样，所以差别只能来自对手。
  const easy = sample(7, 6, { foeSkill: 0.3 });
  const hard = sample(7, 6, { foeSkill: 1 });
  assert.ok(
    easy.cleared > hard.cleared,
    `低档对手清 ${easy.cleared} 次，满档对手清 ${hard.cleared} 次——档位没起作用`,
  );
});

test('低档对手会把自己裹成水泡，满档不会', () => {
  let careless = 0;
  let careful = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    // 让低档／满档的大脑接管玩家自己，直接数它有多少次是被自己的弹裹住的。
    careless += play({ levelIndex: 4, attempt, skill: 0.3 }).tally.selfBubble;
    careful += play({ levelIndex: 4, attempt, skill: 1 }).tally.selfBubble;
  }
  assert.ok(
    careless > careful,
    `低档自炸 ${careless} 次，满档自炸 ${careful} 次——低档的笨没有体现在决策上`,
  );
});

test('过关的星星跟着剩余时间走', () => {
  for (let index = 0; index < LEVELS.length; index += 1) {
    for (const run of sample(index, 3).runs) {
      if (run.status !== 'clear') continue;
      const ratio = run.state.time / LEVELS[index].time;
      const want = ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
      assert.equal(run.stars, want, `第 ${index + 1} 关剩 ${(ratio * 100).toFixed(0)}% 时间给了 ${run.stars} 星`);
    }
  }
});
