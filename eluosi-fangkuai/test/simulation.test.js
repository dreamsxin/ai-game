import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, ROWS, createBoard } from '../src/game/board.js';
import { LOCK_DELAY } from '../src/game/rules.js';
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

const stage = (board, active, extra = {}) => ({
  ...startGame(1),
  board,
  active: { rotation: 0, ...active },
  ...extra,
});

const filledRow = (skip) => Array.from({ length: COLUMNS }, (_, x) => (skip.includes(x) ? null : 'I'));

test('开局有当前方块、预览队列和幽灵落点', () => {
  const game = createGame(42);
  assert.equal(game.status, 'ready');
  assert.ok(game.active);
  assert.ok(game.queue.length >= 5);
  assert.equal(game.hold, null);
  assert.equal(game.ghostY, ROWS - 2, 'O 之外的方块也应落到底部附近');
  assert.equal(step(game, input({ hardDrop: true })), game, 'ready 状态不推进');
});

test('重力按等级间隔把方块往下推一格', () => {
  const game = stage(createBoard(), { type: 'O', x: 0, y: 0 });
  assert.equal(advance(game, 40).active.y, 0, '不到一个间隔不该下落');
  assert.equal(advance(game, 50).active.y, 1);
});

test('按住软降会加速下落并按格计分', () => {
  const game = stage(createBoard(), { type: 'O', x: 0, y: 0 });
  const soft = step(game, input({ held: { softDrop: true } }), 0.1);
  assert.equal(soft.active.y, 2);
  assert.equal(soft.score, 2, '软降每格 1 分');
});

test('硬降立刻锁定、计分并换下一个方块', () => {
  const game = startGame(7);
  const upcoming = game.queue[0];
  const dropped = step(game, input({ hardDrop: true }));
  assert.equal(dropped.pieces, 1);
  assert.equal(dropped.active.type, upcoming);
  assert.ok(dropped.score > 0, '硬降每格 2 分');
  assert.ok(dropped.board.some((row) => row.some((cell) => cell)), '方块应留在棋盘上');
});

test('填满的两行一起消掉并结算双消', () => {
  const board = createBoard();
  board[ROWS - 1] = filledRow([0, 1]);
  board[ROWS - 2] = filledRow([0, 1]);
  const cleared = step(stage(board, { type: 'O', x: 0, y: 0 }), input({ hardDrop: true }));
  assert.equal(cleared.lines, 2);
  assert.equal(cleared.combo, 1);
  assert.equal(cleared.score, 336, '双消 300 分加 18 格硬降 36 分');
  assert.ok(cleared.board.every((row) => row.every((cell) => !cell)), '棋盘应被清空');
  assert.equal(cleared.backToBack, false, '双消不算困难消行');
});

test('贴地后延时锁定，给最后调整的时间', () => {
  const game = stage(createBoard(), { type: 'O', x: 0, y: ROWS - 2 });
  const waiting = advance(game, 4, input(), 0.1);
  assert.equal(waiting.pieces, 0, `不到 ${LOCK_DELAY}s 不该锁定`);
  assert.ok(waiting.grounded);
  assert.equal(advance(game, 5, input(), 0.1).pieces, 1);
});

test('贴地时横移会重置锁定延时', () => {
  const game = stage(createBoard(), { type: 'O', x: 0, y: ROWS - 2 });
  let next = advance(game, 4, input(), 0.1);
  next = step(next, input({ right: true }), 0.1);
  assert.equal(next.pieces, 0, '移动后重新开始计时');
  assert.equal(next.active.x, 1);
  assert.equal(next.lockResets, 1);
});

test('墙壁挡住横移，SRS 踢墙让贴墙旋转成功', () => {
  const blocked = step(stage(createBoard(), { type: 'O', x: 0, y: 5 }), input({ left: true }));
  assert.equal(blocked.active.x, 0);

  const kicked = step(stage(createBoard(), { type: 'I', x: -2, y: 5, rotation: 1 }), input({ rotateCCW: true }));
  assert.equal(kicked.active.rotation, 0);
  assert.equal(kicked.active.x, 0, '竖直 I 贴左墙转平应被踢回场内');
});

test('暂存每个方块只能用一次', () => {
  const game = startGame(11);
  const current = game.active.type;
  const upcoming = game.queue[0];
  const held = step(game, input({ hold: true }));
  assert.equal(held.hold, current);
  assert.equal(held.active.type, upcoming);

  const again = step(held, input({ hold: true }));
  assert.equal(again.hold, held.hold, '同一个方块不能再换');
  assert.equal(again.active.type, held.active.type);

  const locked = step(held, input({ hardDrop: true }));
  const afterLock = step(locked, input({ hold: true }));
  assert.equal(afterLock.active.type, current, '锁定后可以再换手，取回最早存起来的方块');
  assert.equal(afterLock.hold, locked.active.type);
});


test('T-spin 单消按 T-spin 计分并延续 back-to-back', () => {
  const board = createBoard();
  board[ROWS - 1] = filledRow([4]);
  board[ROWS - 2] = filledRow([3, 4, 5, 8]);
  board[ROWS - 3][5] = 'I';
  const staged = stage(board, { type: 'T', x: 3, y: ROWS - 3, rotation: 2 }, { lastAction: 'rotate' });
  const spun = step(staged, input({ hardDrop: true }));
  assert.equal(spun.lines, 1);
  assert.equal(spun.lastClear.tspin, true);
  assert.equal(spun.score, 800, 'T-spin 单消 800 分，硬降 0 格');

  assert.equal(spun.backToBack, true);
});

test('出生位置被占住就结束本局', () => {
  const board = createBoard();
  board[0] = filledRow([9]);
  board[1] = filledRow([9]);
  const over = step(stage(board, { type: 'O', x: 0, y: -1 }), input({ hardDrop: true }));
  assert.equal(over.status, 'over');
  assert.ok(over.effects.some((effect) => effect.type === 'topout'));
});

test('暂停时状态不再推进，恢复后继续', () => {
  const game = startGame(3);
  const paused = togglePause(game);
  assert.equal(paused.status, 'paused');
  assert.equal(advance(paused, 120), paused);
  assert.equal(togglePause(paused).status, 'playing');
});

test('同 seed 加同一串输入得到逐字段一致的结果', () => {
  const plan = [
    input({ left: true }),
    input({ rotateCW: true }),
    input({ hardDrop: true }),
    input({ right: true, held: { softDrop: true } }),
    input({ hardDrop: true }),
  ];
  const play = () => plan.reduce((state, frameInput) => step(state, frameInput), startGame(2026));
  const first = play();
  const second = play();
  assert.deepEqual(first.board, second.board);
  assert.equal(first.score, second.score);
  assert.equal(first.lines, second.lines);
  assert.deepEqual(first.queue, second.queue);
});
