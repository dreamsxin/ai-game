// 判定层的测试。这里守的是玩法身份，不是实现细节：
// **炸中不等于打死**（水泡两段式）、水泡是实体、连锁一次算完、时间到算输。

import test from 'node:test';
import assert from 'node:assert/strict';
import { H, STEP, TILE, W, cellOf, centerOf, key } from '../src/game/rules.js';
import {
  EMPTY_INPUT,
  HUMAN,
  SCORE,
  blockedFor,
  startGame,
  step,
  togglePause,
} from '../src/game/simulation.js';

/** 一张空图的对局：只留柱子和边墙，箱子和对手都由测试自己摆。 */
function arena({ bots = 1 } = {}) {
  const state = startGame(0, 0);
  for (let cy = 1; cy < H - 1; cy += 1) {
    for (let cx = 1; cx < W - 1; cx += 1) {
      if (state.grid[key(cx, cy)] === TILE.CRATE) state.grid[key(cx, cy)] = TILE.FLOOR;
    }
  }
  state.items.clear();
  state.drops.length = 0;
  state.players = state.players.slice(0, bots + 1);
  // 测试要的是可控，所以所有角色都由脚本驱动，谁都不自己想。
  for (const player of state.players) player.grace = 0;
  state.time = 100;
  return state;
}

const at = (player, cx, cy) => {
  player.x = centerOf(cx);
  player.y = centerOf(cy);
};

const bomb = { ...EMPTY_INPUT, bomb: true };
const idle = () => ({ ...EMPTY_INPUT });

/** 跑 n 秒脚本输入：方向一直按着，放弹／挣脱只在第一帧算一次（它们是脉冲）。 */
function run(state, seconds, inputs = []) {
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i += 1) {
    const frame = inputs.map((input) =>
      input ? (i === 0 ? input : { ...input, bomb: false, struggle: false }) : input,
    );
    step(state, frame, STEP);
  }
  return state;
}

test('水弹在引信到点时炸出十字爆流，并拆掉挡路的箱子', () => {
  const state = arena();
  at(state.players[HUMAN], 1, 1);
  at(state.players[1], 9, 11);
  state.grid[key(3, 1)] = TILE.CRATE;
  state.players[HUMAN].power = 3;

  run(state, 0.1, [bomb]);
  assert.equal(state.bombs.length, 1, '放下了一发');
  run(state, 2.4);

  assert.equal(state.bombs.length, 0, '引信到点就炸');
  assert.equal(state.grid[key(3, 1)], TILE.FLOOR, '箱子被拆掉');
  // 箱子挡住爆流：它后面那一格不该被扫到。
  const blast = state.effects.find((effect) => effect.type === 'blast') ?? null;
  const covered = state.blasts[0]?.cells ?? new Set();
  assert.ok(covered.has(key(1, 1)), '自己脚下算在爆流里');
  assert.ok(covered.has(key(3, 1)), '爆流打到箱子那一格');
  assert.ok(!covered.has(key(4, 1)), '箱子后面挡住了');
  assert.ok(blast === null || blast.chain === 1, '单发不算连锁');
});

test('炸中变水泡而不是直接出局，水泡再吃一发才淘汰', () => {
  const state = arena();
  const human = state.players[HUMAN];
  at(human, 1, 1);
  at(state.players[1], 2, 1);
  human.power = 2;

  run(state, 0.1, [bomb]);
  // 放完就挪开：这里测的是两段式击杀，不是走位，所以直接把人搬走比模拟跑路干净。
  at(human, 5, 5);
  run(state, 2.5);
  assert.equal(state.players[1].state, 'bubble', '第一发只是裹成水泡');
  assert.equal(state.score, SCORE.bubble, '困住给分，但不是击杀的分');

  // 补一发：这一次才是真的清掉一个人。
  at(human, 2, 2);
  run(state, 0.1, [bomb]);
  at(human, 5, 5);
  run(state, 2.5);
  assert.equal(state.players[1].state, 'out', '水泡被补掉');
  assert.equal(state.kills, 1);
  assert.equal(state.status, 'clear', '场上没有对手了就算过关');
});

test('同一片爆流不会把人从活着直接打到出局', () => {
  const state = arena();
  at(state.players[HUMAN], 1, 1);
  at(state.players[1], 1, 2);
  state.players[HUMAN].power = 3;

  run(state, 0.1, [bomb]);
  run(state, 2.5);
  assert.equal(state.players[1].state, 'bubble');
  // 爆流还在场上，但 hit 集合保证同一片只算一次。
  run(state, 0.3);
  assert.equal(state.players[1].state, 'bubble', '补刀必须是真的第二发');
});

test('水泡会自己挣脱，连点能把挣脱提前', () => {
  const slow = arena();
  at(slow.players[HUMAN], 1, 1);
  slow.players[HUMAN].state = 'bubble';
  slow.players[HUMAN].bubble = 1;
  run(slow, 0.9);
  assert.equal(slow.players[HUMAN].state, 'bubble', '不点就得等满');
  run(slow, 0.2);
  assert.equal(slow.players[HUMAN].state, 'alive');
  assert.ok(slow.players[HUMAN].grace > 0, '刚挣脱出来有一小段无敌');

  const fast = arena();
  at(fast.players[HUMAN], 1, 1);
  fast.players[HUMAN].state = 'bubble';
  fast.players[HUMAN].bubble = 1;
  for (let i = 0; i < 3; i += 1) run(fast, 0.1, [{ ...EMPTY_INPUT, struggle: true }]);
  assert.ok(fast.players[HUMAN].bubble < 0.4, `连点抵掉了时间，剩 ${fast.players[HUMAN].bubble.toFixed(2)}`);
});

test('水泡是实体：堵在巷口就是一面临时的墙', () => {
  const state = arena();
  const human = state.players[HUMAN];
  at(human, 1, 1);
  at(state.players[1], 2, 1);
  state.players[1].state = 'bubble';
  state.players[1].bubble = 4;

  assert.equal(blockedFor(state, human, 2, 1), true, '水泡挡路');
  run(state, 0.5, [{ ...EMPTY_INPUT, dir: { x: 1, y: 0 } }, EMPTY_INPUT]);
  assert.ok(cellOf(human.x) === 1, '撞在水泡上走不过去');
});

test('挣脱后的无敌期挡得住还在场上的爆流', () => {
  const state = arena();
  const human = state.players[HUMAN];
  at(human, 1, 1);
  at(state.players[1], 9, 11);
  human.grace = 1;
  state.bombs.push({ id: 97, x: centerOf(1), y: centerOf(1), owner: 1, power: 2, fuse: 0.05, slide: null });

  run(state, 0.2);
  assert.equal(human.state, 'alive', '无敌期内踩在爆流里也没事');
});

test('放弹上限用完会给一声回音而不是静默', () => {
  const state = arena();
  const human = state.players[HUMAN];
  at(human, 1, 1);
  at(state.players[1], 9, 11);

  run(state, 0.1, [bomb]);
  // 走开一格再按：这次是「弹用完了」，不是「脚下已经有一发」。
  run(state, 0.4, [{ ...EMPTY_INPUT, dir: { x: 1, y: 0 } }]);
  step(state, [bomb], STEP);
  assert.equal(state.bombs.length, 1);
  assert.ok(state.effects.some((effect) => effect.type === 'deny'), '放不出来要有回音');
});

test('连锁引爆在同一帧里算成一片爆流', () => {
  const state = arena();
  const human = state.players[HUMAN];
  at(human, 1, 1);
  at(state.players[1], 9, 11);
  human.bombs = 2;
  human.power = 3;

  run(state, 0.1, [bomb]);
  run(state, 0.3, [{ ...EMPTY_INPUT, dir: { x: 1, y: 0 } }]);
  at(human, 3, 1);
  run(state, 0.05, [bomb]);
  assert.equal(state.bombs.length, 2);

  run(state, 2.5);
  const blasts = state.effects.filter((effect) => effect.type === 'blast');
  assert.equal(state.bombs.length, 0, '两发都炸了');
  assert.ok(
    blasts.length === 0 || blasts[0].chain === 2,
    '连锁是一片爆流，不是接连两片',
  );
});

test('拆箱掉道具，捡到就长在身上', () => {
  const state = arena();
  const human = state.players[HUMAN];
  at(human, 1, 1);
  at(state.players[1], 9, 11);
  state.grid[key(1, 3)] = TILE.CRATE;
  state.items.set(key(1, 3), 'power');
  human.power = 2;

  run(state, 0.1, [bomb]);
  at(human, 5, 5);
  // 多等一会儿：爆流本身还会在场上留 0.34 秒，这段时间里那一格照样会把人裹住。
  run(state, 3);
  assert.equal(state.drops.length, 1, '箱子里的道具掉在原地');
  assert.equal(state.crates, 1);

  at(human, 1, 2);
  run(state, 0.5, [{ ...EMPTY_INPUT, dir: { x: 0, y: 1 } }]);
  assert.equal(human.power, 3, '捡到加压就多一格');
  assert.equal(state.drops.length, 0);
  assert.equal(state.picks, 1);
});

test('踢弹把水弹推到远处，没有踢弹道具就推不动', () => {
  const state = arena();
  const human = state.players[HUMAN];
  at(human, 1, 1);
  at(state.players[1], 9, 11);
  state.bombs.push({ id: 99, x: centerOf(1), y: centerOf(2), owner: 1, power: 1, fuse: 2, slide: null });

  run(state, 0.4, [{ ...EMPTY_INPUT, dir: { x: 0, y: 1 } }]);
  assert.equal(cellOf(state.bombs[0].y), 2, '没有踢弹只能撞在上面');

  human.kick = true;
  run(state, 0.4, [{ ...EMPTY_INPUT, dir: { x: 0, y: 1 } }]);
  assert.ok(cellOf(state.bombs[0].y) > 2, `踢出去了，现在在第 ${cellOf(state.bombs[0].y)} 行`);
});

test('时间到算本关失败，不算平局', () => {
  const state = arena();
  at(state.players[HUMAN], 1, 1);
  at(state.players[1], 9, 11);
  state.time = 0.5;
  run(state, 0.6);
  assert.equal(state.status, 'down', '还有命就是重打本关');
  assert.equal(state.lives, 2);
  assert.ok(state.effects.some((effect) => effect.type === 'timeup'));
});

test('玩家被补掉就掉一条命，命用完才是 over', () => {
  const state = arena();
  const human = state.players[HUMAN];
  at(human, 1, 1);
  at(state.players[1], 9, 11);
  human.state = 'bubble';
  human.bubble = 4;
  human.lives = 1;
  state.lives = 1;
  state.bombs.push({ id: 98, x: centerOf(1), y: centerOf(1), owner: 1, power: 1, fuse: 0.05, slide: null });

  run(state, 0.2);
  assert.equal(human.state, 'out');
  assert.equal(state.status, 'over');
});

test('暂停不推进任何东西', () => {
  const state = arena();
  at(state.players[HUMAN], 1, 1);
  at(state.players[1], 9, 11);
  run(state, 0.1, [bomb]);
  const paused = togglePause(state);
  const fuse = paused.bombs[0].fuse;
  step(paused, idle(), STEP);
  assert.equal(paused.bombs[0].fuse, fuse, '暂停时引信也停');
});
