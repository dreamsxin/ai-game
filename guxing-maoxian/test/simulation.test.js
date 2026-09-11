import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/game/tiles.js';
import { spawnEnemy } from '../src/game/entities.js';
import { RUN_MAX, START_LIVES, WALK_MAX } from '../src/game/rules.js';
import { EMPTY_INPUT, STEP, createGame, startGame, step, togglePause } from '../src/game/simulation.js';

const input = (overrides = {}) => ({
  ...EMPTY_INPUT,
  ...overrides,
  held: { ...EMPTY_INPUT.held, ...(overrides.held ?? {}) },
});

const advance = (state, frames, frameInput = input(), dt = STEP) => {
  let next = state;
  for (let i = 0; i < frames; i += 1) next = step(next, frameInput, dt);
  return next;
};

// 用一小张字符画替换关卡，只测行为，不依赖正式关卡的坐标。
const stage = (rows, player = {}, extra = {}) => {
  const parsed = parseLevel(rows);
  const base = startGame(0);
  return {
    ...base,
    grid: parsed.grid,
    width: parsed.width,
    height: parsed.height,
    spawn: parsed.spawn,
    player: { ...base.player, x: 1, y: 3 - base.player.h, vx: 0, vy: 0, grounded: true, ...player },
    enemies: parsed.enemies.map((spot, i) => ({ ...spawnEnemy(spot, 100 + i), awake: true })),
    items: [],
    effects: [],
    ...extra,
  };
};

const FLOOR = [
  '          ',
  '          ',
  '          ',
  '##########',
];

test('开局是 ready，没有输入就不推进', () => {
  const game = createGame(0);
  assert.equal(game.status, 'ready');
  assert.equal(game.lives, START_LIVES);
  assert.equal(game.levelIndex, 0);
  assert.equal(game.player.power, 'small');
  assert.equal(step(game, input({ jump: true })), game);
});

test('按住方向键加速到走路上限，加上奔跑键上限更高', () => {
  const walk = advance(stage(FLOOR), 90, input({ held: { right: true } }));
  assert.ok(walk.player.vx > WALK_MAX - 0.2 && walk.player.vx <= WALK_MAX + 1e-9, `走路速度 ${walk.player.vx}`);
  const run = advance(stage(FLOOR), 90, input({ held: { right: true, run: true } }));
  assert.ok(run.player.vx > WALK_MAX + 1, '奔跑更快');
  assert.ok(run.player.vx <= RUN_MAX + 1e-9);
});

test('松开方向键后摩擦力把速度收回到 0', () => {
  const moving = advance(stage(FLOOR), 60, input({ held: { right: true } }));
  const stopped = advance(moving, 40);
  assert.equal(stopped.player.vx, 0);
});

test('一直按住跳跃键比点一下跳得高', () => {
  const start = stage(FLOOR);
  const tap = advance(step(start, input({ jump: true, held: { jump: true } })), 40);
  const hold = advance(step(start, input({ jump: true, held: { jump: true } })), 40, input({ held: { jump: true } }));
  assert.ok(hold.player.y < tap.player.y - 0.5, `按住 ${hold.player.y} 应明显高于点一下 ${tap.player.y}`);
  assert.ok(start.player.y - hold.player.y > 3, '按住至少跳过三格');
});

test('离地后仍有土狼时间，落地前的跳跃请求会被缓冲', () => {
  const walked = advance(stage(FLOOR), 10, input({ held: { right: true } }));
  const airborne = { ...walked, player: { ...walked.player, grounded: false, coyote: 0.05, y: walked.player.y - 0.2 } };
  const jumped = step(airborne, input({ jump: true, held: { jump: true } }));
  assert.ok(jumped.player.vy < 0, '土狼时间内还能起跳');

  const falling = { ...walked, player: { ...walked.player, grounded: false, coyote: 0, y: walked.player.y - 0.05, vy: 2 } };
  const buffered = step(falling, input({ jump: true, held: { jump: true } }));
  assert.ok(buffered.player.buffer > 0, '空中按跳会被记下来');
  const landed = advance(buffered, 3, input({ held: { jump: true } }));
  assert.ok(landed.player.vy < 0, '落地后立刻起跳');
});

test('走过金币格就吃掉，分数和金币一起涨', () => {
  const game = stage([
    '          ',
    '          ',
    ' o        ',
    '##########',
  ]);
  const next = step(game, input());
  assert.equal(next.coins, 1);
  assert.equal(next.score, 100);
  assert.equal(next.grid[2][1], ' ');
  assert.ok(next.effects.some((effect) => effect.type === 'coin'));
});

test('从下面顶砖块会把它顶碎并加分', () => {
  const game = stage([
    '          ',
    ' B        ',
    '          ',
    '##########',
  ], { x: 1.1, y: 2, vy: -6, grounded: false });
  const next = step(game, input({ held: { jump: true } }));
  assert.equal(next.grid[1][1], ' ', '砖块被顶碎');
  assert.equal(next.score, 50);
  assert.ok(next.effects.some((effect) => effect.type === 'brick'));
});

test('顶问号块会变成用过的块并冒出蘑菇，吃到就变大', () => {
  const game = stage([
    '          ',
    ' ?        ',
    '          ',
    '##########',
  ], { x: 1.1, y: 2, vy: -6, grounded: false });
  const bumped = step(game, input({ held: { jump: true } }));
  assert.equal(bumped.grid[1][1], 'U');
  assert.equal(bumped.items.length, 1);
  assert.equal(bumped.items[0].kind, 'mushroom');

  // 蘑菇冒出来后落到地面往右走，玩家先等它落地再追上去。
  const grown = advance(advance(bumped, 40), 70, input({ held: { right: true } }));
  assert.equal(grown.player.power, 'big', '吃到蘑菇变大');
  assert.ok(grown.player.h > 1.2);
  assert.ok(grown.score >= 1000);
});

test('踩敌人得分并弹起，一次滞空里连踩分数翻倍', () => {
  const game = stage([
    '          ',
    '          ',
    '   g      ',
    '##########',
  ], { x: 3.04, y: 1.29, vy: 6, grounded: false });
  const stomped = step(game, input());
  assert.equal(stomped.enemies[0].state, 'dead');
  assert.equal(stomped.score, 100);
  assert.ok(stomped.player.vy < 0, '踩完会弹起来');
  assert.equal(stomped.player.stompChain, 1);

  const second = { ...stomped, enemies: [{ ...spawnEnemy({ kind: 'walker', x: 3, y: 2 }, 7), awake: true }] };
  const again = step({ ...second, player: { ...second.player, x: 3.04, y: 1.29, vy: 6 } }, input());
  assert.equal(again.player.stompChain, 2);
  assert.equal(again.score - stomped.score, 200, '第二只值 200');
});

test('小身体侧面撞到敌人直接死，大身体只会缩小并短暂无敌', () => {
  const rows = [
    '          ',
    '          ',
    '   g      ',
    '##########',
  ];
  const small = step(stage(rows, { x: 2.6 }), input({ held: { right: true } }));
  assert.equal(small.status, 'dying');

  const bigStage = stage(rows, { x: 2.6, y: 3 - 1.5, w: 0.78, h: 1.5, power: 'big' });
  const big = step(bigStage, input({ held: { right: true } }));
  assert.equal(big.status, 'playing');
  assert.equal(big.player.power, 'small');
  assert.ok(big.player.invuln > 0);
  assert.equal(step(big, input({ held: { right: true } })).status, 'playing', '无敌期内再撞不掉命');
});

test('乌龟踩一下变壳，再碰一下踢出去，滑行的壳撞飞其他敌人', () => {
  const game = stage([
    '          ',
    '          ',
    '   t   g  ',
    '##########',
  ], { x: 3.04, y: 1.29, vy: 6, grounded: false });
  const stomped = step(game, input());
  const shell = stomped.enemies.find((enemy) => enemy.kind === 'turtle');
  assert.equal(shell.state, 'shell', '第一脚只把它踩成壳');

  const beside = {
    ...stomped,
    player: { ...stomped.player, x: shell.x - 0.7, y: shell.y + shell.h - stomped.player.h, vy: 0, grounded: true },
  };
  const kicked = step(beside, input({ held: { right: true } }));
  const sliding = kicked.enemies.find((enemy) => enemy.kind === 'turtle');
  assert.equal(sliding.state, 'sliding');
  assert.ok(sliding.vx > 0, '朝玩家反方向滑出去');

  const hit = advance(kicked, 40, input());
  const walker = hit.enemies.find((enemy) => enemy.kind === 'walker');
  assert.ok(!walker || walker.state === 'flip', '路上的菇菇怪被撞飞');
});

test('星星无敌期内碰到敌人直接撞飞', () => {
  const game = stage([
    '          ',
    '          ',
    '   g      ',
    '##########',
  ], { x: 2.6, star: 5 });
  const next = step(game, input({ held: { right: true } }));
  assert.equal(next.status, 'playing');
  assert.equal(next.enemies[0].state, 'flip');
  assert.ok(next.score > 0);
});

test('掉出关卡底部会死，还有命就回到出生点重开本关', () => {
  const game = stage([
    '          ',
    '          ',
    '          ',
    '###  #####',
  ], { x: 3.6, y: 2, grounded: false });
  const falling = advance(game, 60);
  assert.equal(falling.status, 'dying');

  const respawned = advance(falling, 120);
  assert.equal(respawned.status, 'playing');
  assert.equal(respawned.lives, START_LIVES - 1);
  assert.equal(respawned.levelIndex, 0);
  assert.equal(respawned.player.power, 'small');
});

test('命用光就是 game over，并结算星级', () => {
  const game = stage(FLOOR, {}, { lives: 1, score: 12000 });
  const dying = { ...game, status: 'dying', timer: 0.01 };
  const over = step(dying, input(), 0.02);
  assert.equal(over.status, 'over');
  assert.equal(over.lives, 0);
  assert.equal(over.stars, 1);
});

test('时间耗尽也会死', () => {
  const game = stage(FLOOR, {}, { timeLeft: 0.01 });
  const next = step(game, input());
  assert.equal(next.status, 'dying');
  assert.ok(next.effects.some((effect) => effect.type === 'die' && effect.reason === 'time'));
});

test('碰到旗杆过关，剩余时间折成奖励，演出结束后进下一关', () => {
  const game = stage([
    '          ',
    '          ',
    '  G       ',
    '##########',
  ], { x: 2 }, { timeLeft: 100, score: 0 });
  const cleared = step(game, input());
  assert.equal(cleared.status, 'clear');
  assert.ok(cleared.score >= 100 * 50 - 100, `剩余时间应折算成分数，实际 ${cleared.score}`);

  const nextLevel = advance(cleared, 130);
  assert.equal(nextLevel.status, 'playing');
  assert.equal(nextLevel.levelIndex, 1);
  assert.equal(nextLevel.score, cleared.score, '分数带到下一关');
});

test('最后一关过关就是全线通关', () => {
  const game = stage([
    '          ',
    '          ',
    '  G       ',
    '##########',
  ], { x: 2 }, { levelIndex: 2 });
  const won = advance(step(game, input()), 130);
  assert.equal(won.status, 'won');
  assert.ok(won.stars >= 0);
});

test('暂停时状态不再推进，恢复后继续', () => {
  const game = stage(FLOOR);
  const paused = togglePause(game);
  assert.equal(paused.status, 'paused');
  assert.equal(advance(paused, 120, input({ held: { right: true } })), paused);
  assert.equal(togglePause(paused).status, 'playing');
});

test('同一串输入跑两遍得到逐字段一致的结果', () => {
  const plan = [
    input({ jump: true, held: { jump: true, right: true } }),
    input({ held: { jump: true, right: true } }),
    input({ held: { right: true, run: true } }),
    input({ jump: true, held: { jump: true, right: true, run: true } }),
    input({ held: { left: true } }),
  ];
  const play = () => plan.reduce((state, frameInput) => step(state, frameInput), startGame(0));
  const first = play();
  const second = play();
  assert.deepEqual(first.player, second.player);
  assert.deepEqual(first.enemies, second.enemies);
  assert.equal(first.score, second.score);
  assert.equal(first.timeLeft, second.timeLeft);
});
