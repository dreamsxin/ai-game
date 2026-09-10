import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacent,
  clearCells,
  collapse,
  createBoard,
  detonate,
  findMatches,
  findMoves,
  groupOrigin,
  hasMatch,
  legalSwap,
  refill,
  shuffleBoard,
  swapCells,
} from '../src/game/board.js';
import { KINDS, specialFor, tile } from '../src/game/tiles.js';

const KIND_BY_CHAR = { a: KINDS[0], b: KINDS[1], c: KINDS[2], d: KINDS[3], e: KINDS[4], f: KINDS[5] };
const SPECIAL_BY_CHAR = { R: 'row', C: 'col', B: 'bomb', W: 'rainbow' };

// 用字符串画棋盘：a~f 是六种果实，大写字母是莓果做的特殊果实，. 是空位。
const parse = (rows) =>
  rows.map((row) =>
    [...row].map((ch) => {
      if (ch === '.') return null;
      if (SPECIAL_BY_CHAR[ch]) return tile(KINDS[0], SPECIAL_BY_CHAR[ch]);
      return tile(KIND_BY_CHAR[ch]);
    }),
  );

const LATIN = ['abcd', 'bcda', 'cdab', 'dabc'];
const withTile = (rows, x, y, t) => {
  const board = parse(rows);
  board[y][x] = t;
  return board;
};

test('横向三连被识别成一组直线消除', () => {
  const groups = findMatches(parse(['aaa', 'bcb', 'cbc']));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cells.length, 3);
  assert.equal(groups[0].shape, 'line');
  assert.equal(groups[0].orientation, 'h');
  assert.equal(specialFor(groups[0]), null, '三连不奖励特殊果实');
});

test('L 形的横竖两段合并成一组并奖励爆破果', () => {
  const groups = findMatches(parse(['aaa', 'abb', 'abc']));
  assert.equal(groups.length, 1, '共用拐角的两段应合并');
  assert.equal(groups[0].cells.length, 5);
  assert.equal(groups[0].shape, 'L');
  assert.equal(specialFor(groups[0]), 'bomb');
  assert.deepEqual(groupOrigin(groups[0]), { x: 0, y: 0 }, '特殊果实落在拐角上');
});

test('四连的中点是直线爆果的落点', () => {
  const groups = findMatches(parse(['aaaa', 'bcbc', 'cbcb', 'bcbc']));
  assert.equal(groups[0].runLength, 4);
  assert.equal(specialFor(groups[0]), 'row');
  assert.deepEqual(groupOrigin(groups[0]), { x: 2, y: 0 });
});

test('没有三连的棋盘不算消除', () => {
  assert.equal(hasMatch(parse(['aba', 'bab', 'aba'])), false);
});

test('只有换出三连的交换才合法', () => {
  const board = parse(['aba', 'bab', 'aba']);
  assert.ok(legalSwap(board, { x: 0, y: 1 }, { x: 1, y: 1 }), '换完第一列凑成三连');
  assert.equal(legalSwap(board, { x: 0, y: 0 }, { x: 1, y: 0 }), false, '换完什么都没有的交换不合法');
  assert.equal(legalSwap(board, { x: 0, y: 0 }, { x: 2, y: 2 }), false, '不相邻不能换');
});

test('特殊果实换到哪都合法', () => {
  const board = withTile(['aba', 'bab', 'aba'], 1, 1, tile(KINDS[0], 'row'));
  assert.ok(legalSwap(board, { x: 1, y: 1 }, { x: 1, y: 0 }), '带特殊果实的交换不要求三连');
});

test('交换是纯函数，原棋盘不变', () => {
  const board = parse(['ab', 'cd']);
  const next = swapCells(board, { x: 0, y: 0 }, { x: 1, y: 0 });
  assert.equal(board[0][0].kind, KINDS[0], '原棋盘不应被改写');
  assert.equal(next[0][0].kind, KINDS[1]);
  assert.equal(next[0][1].kind, KINDS[0]);
});

test('找出的每一步都是合法交换，死局返回空数组', () => {
  const board = parse(['aba', 'bab', 'aba']);
  const moves = findMoves(board);
  assert.ok(moves.length > 0);
  for (const move of moves) assert.ok(legalSwap(board, move.a, move.b));
  assert.equal(findMoves(parse(['abc', 'bca', 'cab'])).length, 0, '循环排列的小盘无处可走');
});

test('相邻判定只认四邻', () => {
  assert.ok(adjacent({ x: 1, y: 1 }, { x: 1, y: 2 }));
  assert.equal(adjacent({ x: 1, y: 1 }, { x: 2, y: 2 }), false);
});

test('消除后每列压到底部，空位留在列顶', () => {
  const board = clearCells(parse(['abc', 'abc', 'abc']), [[0, 1]]);
  const { board: next, drops } = collapse(board);
  assert.equal(next[0][0], null, '列顶应空出来');
  assert.equal(next[1][0].kind, KINDS[0]);
  assert.equal(next[2][0].kind, KINDS[0]);
  assert.deepEqual(drops, [{ x: 0, from: 0, to: 1 }]);
  assert.equal(next[0][1].kind, KINDS[1], '没被消的列不动');
});

test('补充果实填满空位且同一随机状态结果一致', () => {
  const board = clearCells(parse(LATIN), [[0, 0], [1, 0], [2, 0]]);
  const first = refill(board, 42, KINDS.slice(0, 4));
  const second = refill(board, 42, KINDS.slice(0, 4));
  assert.equal(first.spawned.length, 3);
  assert.deepEqual(first.board, second.board, '同一随机状态应补出同样的果实');
  assert.ok(first.board.every((row) => row.every(Boolean)), '不应留下空位');
  assert.notEqual(first.randomState, 42, '随机状态要往前推进');
});

test('直线爆果带走整行', () => {
  const board = withTile(LATIN, 1, 1, tile(KINDS[0], 'row'));
  const { cells, specials } = detonate(board, [{ x: 1, y: 1 }]);
  assert.equal(cells.length, 4);
  assert.ok(cells.every(([, y]) => y === 1));
  assert.deepEqual(specials, ['row']);
});

test('爆破果炸掉周围九格', () => {
  const board = withTile(LATIN, 1, 1, tile(KINDS[0], 'bomb'));
  const { cells } = detonate(board, [{ x: 1, y: 1 }]);
  assert.equal(cells.length, 9);
  assert.ok(cells.every(([x, y]) => x <= 2 && y <= 2));
});

test('彩虹果带走全场同色', () => {
  const board = withTile(LATIN, 1, 1, tile(KINDS[0], 'rainbow'));
  const { cells } = detonate(board, [{ x: 1, y: 1 }], { rainbowKind: KINDS[0] });
  assert.equal(cells.length, 5, '四颗莓果加彩虹果本身');
});

test('相邻的特殊果实会被连带引爆', () => {
  const board = parse(LATIN);
  board[1][3] = tile(KINDS[0], 'row');
  board[3][3] = tile(KINDS[0], 'col');
  const { cells, specials } = detonate(board, [{ x: 3, y: 3 }]);
  assert.deepEqual(specials.sort(), ['col', 'row'], '纵向爆果扫到横向爆果后继续引爆');
  assert.equal(cells.length, 7, '一列四格加一行四格，交点只算一次');
});

test('开局棋盘没有现成三连且至少有一步可走', () => {
  for (const seed of [1, 7, 99, 2024]) {
    const { board } = createBoard(seed, KINDS.slice(0, 5));
    assert.equal(hasMatch(board), false, `seed ${seed} 不应开局就有三连`);
    assert.ok(findMoves(board).length > 0, `seed ${seed} 不应开局就是死局`);
  }
});

test('同 seed 生成同一盘棋', () => {
  const first = createBoard(2024, KINDS.slice(0, 5));
  const second = createBoard(2024, KINDS.slice(0, 5));
  assert.deepEqual(first.board, second.board);
  assert.equal(first.randomState, second.randomState);
});

test('洗盘保留原有果实且洗出可走的局面', () => {
  const { board } = createBoard(5, KINDS.slice(0, 5));
  const shuffled = shuffleBoard(board, 11, KINDS.slice(0, 5));
  const count = (rows) => rows.flat().reduce((map, t) => map.set(t.kind, (map.get(t.kind) ?? 0) + 1), new Map());
  assert.deepEqual([...count(shuffled.board)].sort(), [...count(board)].sort(), '果实数量不应变化');
  assert.equal(hasMatch(shuffled.board), false);
  assert.ok(findMoves(shuffled.board).length > 0);
});
