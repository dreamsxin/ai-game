import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AXIS_COL,
  AXIS_PILLAR,
  AXIS_ROW,
  DOOR_E,
  DOOR_N,
  DOOR_S,
  DOOR_U,
  DOOR_W,
  doorCount,
} from '../src/game/rules.js';
import {
  canReach,
  cloneCube,
  connectedNeighbours,
  createCube,
  cubeSignature,
  floodFrom,
  lineCells,
  onLine,
  openDoor,
  pathBetween,
  setTile,
  shiftCell,
  shiftLine,
  tileAt,
} from '../src/game/cube.js';

const CELL = (layer, col, row) => ({ layer, col, row });

test('新塔是 order 层、每层 order×order，全是实心砖', () => {
  const cube = createCube(4);
  assert.equal(cube.tiles.length, 4);
  assert.equal(cube.tiles[0].length, 16);
  assert.ok(cube.tiles.every((layer) => layer.every((tile) => tile === 0)));
  assert.equal(tileAt(cube, 0, 0, 0), 0);
  // 越界读返回 0，当实心处理，不抛。
  assert.equal(tileAt(cube, 9, 9, 9), 0);
});

test('开一扇门就开两扇：这一格朝外，对面朝回来', () => {
  const cube = createCube(3);
  assert.equal(openDoor(cube, 0, 0, 1, 1), true, '朝东开门');
  assert.equal(tileAt(cube, 0, 0, 1) & DOOR_E, DOOR_E);
  assert.equal(tileAt(cube, 0, 1, 1) & DOOR_W, DOOR_W, '东边那格必须同时开西门');
  // 越界的方向开不了，也不该改动任何砖。
  const before = cube.tiles.map((layer) => layer.slice());
  assert.equal(openDoor(cube, 0, 0, 0, 0), false, '第 0 行往北是塔外');
  assert.deepEqual(cube.tiles, before);
});

test('上下门让楼层直接连通，不需要额外的垫子概念', () => {
  const cube = createCube(3);
  openDoor(cube, 0, 1, 1, 4);
  assert.equal(tileAt(cube, 0, 1, 1) & DOOR_U, DOOR_U);
  assert.equal(doorCount(tileAt(cube, 1, 1, 1)), 1, '上面那格只多了一扇朝下的门');
  assert.deepEqual(connectedNeighbours(cube, CELL(0, 1, 1)), [CELL(1, 1, 1)]);
  assert.equal(canReach(cube, CELL(0, 1, 1), CELL(1, 1, 1)), true);
});

test('只开一半的门不算通', () => {
  const cube = createCube(3);
  setTile(cube, 0, 0, 0, DOOR_E);
  assert.deepEqual(connectedNeighbours(cube, CELL(0, 0, 0)), [], '对面没开西门');
  assert.equal(canReach(cube, CELL(0, 0, 0), CELL(0, 1, 0)), false);
});

test('连通不绕回：最边上那格的外侧门是墙，走不到对面去', () => {
  const cube = createCube(3);
  // 第 0 行最左最右都朝外开门 —— 如果连通绕回，这两格就该通。
  setTile(cube, 0, 0, 0, DOOR_W);
  setTile(cube, 0, 2, 0, DOOR_E);
  assert.equal(canReach(cube, CELL(0, 0, 0), CELL(0, 2, 0)), false);
});

test('三条线族各是哪一维，长度都等于阶数', () => {
  const cube = createCube(4);
  assert.deepEqual(
    lineCells(cube, AXIS_ROW, CELL(1, 2, 3)).map((c) => `${c.layer}/${c.col}/${c.row}`),
    ['1/0/3', '1/1/3', '1/2/3', '1/3/3'],
    '推一整行：变的是 col',
  );
  assert.deepEqual(
    lineCells(cube, AXIS_COL, CELL(1, 2, 3)).map((c) => `${c.layer}/${c.col}/${c.row}`),
    ['1/2/0', '1/2/1', '1/2/2', '1/2/3'],
    '推一整列：变的是 row',
  );
  assert.deepEqual(
    lineCells(cube, AXIS_PILLAR, CELL(1, 2, 3)).map((c) => `${c.layer}/${c.col}/${c.row}`),
    ['0/2/3', '1/2/3', '2/2/3', '3/2/3'],
    '推一整柱：变的是 layer，这就是多出来的那一维',
  );
});

test('onLine 只认共享另外两维的格子', () => {
  const anchor = CELL(1, 2, 3);
  assert.equal(onLine(AXIS_ROW, anchor, CELL(1, 0, 3)), true);
  assert.equal(onLine(AXIS_ROW, anchor, CELL(1, 0, 2)), false, '行号不同');
  assert.equal(onLine(AXIS_ROW, anchor, CELL(0, 0, 3)), false, '层号不同');
  assert.equal(onLine(AXIS_PILLAR, anchor, CELL(0, 2, 3)), true, '柱跨层，层号不同也在线上');
  assert.equal(onLine(AXIS_PILLAR, anchor, CELL(0, 1, 3)), false);
});

test('推一整行：砖平移、绕回、门朝向原样带走', () => {
  const cube = createCube(3);
  setTile(cube, 0, 0, 1, DOOR_N);
  setTile(cube, 0, 1, 1, DOOR_E);
  setTile(cube, 0, 2, 1, DOOR_S);
  const moved = shiftLine(cube, AXIS_ROW, CELL(0, 0, 1), 1);
  assert.equal(tileAt(moved, 0, 1, 1), DOOR_N, '原来第 0 列的砖挪到了第 1 列');
  assert.equal(tileAt(moved, 0, 2, 1), DOOR_E);
  assert.equal(tileAt(moved, 0, 0, 1), DOOR_S, '掉出右边的砖从左边绕回来');
  assert.equal(tileAt(cube, 0, 0, 1), DOOR_N, '原塔不该被改动');
});

test('推一整柱：砖在楼层之间上下走，掉出顶层的从底层绕回来', () => {
  const cube = createCube(3);
  setTile(cube, 0, 1, 1, DOOR_N);
  setTile(cube, 1, 1, 1, DOOR_E);
  setTile(cube, 2, 1, 1, DOOR_S);
  const up = shiftLine(cube, AXIS_PILLAR, CELL(0, 1, 1), 1);
  assert.equal(tileAt(up, 1, 1, 1), DOOR_N);
  assert.equal(tileAt(up, 2, 1, 1), DOOR_E);
  assert.equal(tileAt(up, 0, 1, 1), DOOR_S, '顶层那块绕到底层');
  // 别的柱一动不动。
  assert.equal(tileAt(up, 0, 0, 0), tileAt(cube, 0, 0, 0));
});

test('推移可逆：推回来就是原样', () => {
  const cube = createCube(4);
  setTile(cube, 2, 1, 3, DOOR_W | DOOR_U);
  for (const axis of [AXIS_ROW, AXIS_COL, AXIS_PILLAR]) {
    const there = shiftLine(cube, axis, CELL(2, 1, 3), 1);
    const back = shiftLine(there, axis, CELL(2, 1, 3), -1);
    assert.deepEqual(back.tiles, cube.tiles, `${axis} 推一步再推回来必须复原`);
  }
});

test('shiftCell 只带走线上的格子，三条轴各改一维', () => {
  const cube = createCube(4);
  const anchor = CELL(1, 2, 3);
  assert.deepEqual(shiftCell(cube, CELL(1, 2, 3), AXIS_ROW, anchor, 1), CELL(1, 3, 3));
  assert.deepEqual(shiftCell(cube, CELL(1, 3, 3), AXIS_ROW, anchor, 1), CELL(1, 0, 3), '绕回');
  assert.deepEqual(shiftCell(cube, CELL(1, 2, 3), AXIS_COL, anchor, -1), CELL(1, 2, 2));
  assert.deepEqual(shiftCell(cube, CELL(0, 2, 3), AXIS_PILLAR, anchor, 1), CELL(1, 2, 3));
  assert.deepEqual(shiftCell(cube, CELL(3, 2, 3), AXIS_PILLAR, anchor, 1), CELL(0, 2, 3), '绕回');
  // 不在线上的原样返回，连对象都不换。
  const aside = CELL(1, 0, 0);
  assert.equal(shiftCell(cube, aside, AXIS_ROW, anchor, 1), aside);
  assert.equal(shiftCell(cube, null, AXIS_ROW, anchor, 1), null);
});

test('洪泛和最短路径走得通六个方向，包括上下', () => {
  const cube = createCube(3);
  // 一条 L 形：(0,0,0) 东到 (0,1,0)，再往上到 (1,1,0)
  openDoor(cube, 0, 0, 0, 1);
  openDoor(cube, 0, 1, 0, 4);
  const { distance } = floodFrom(cube, CELL(0, 0, 0));
  assert.equal(distance.get('0,0,0'), 0);
  assert.equal(distance.get('0,1,0'), 1);
  assert.equal(distance.get('1,1,0'), 2);
  assert.equal(distance.has('0,2,0'), false);
  const path = pathBetween(cube, CELL(0, 0, 0), CELL(1, 1, 0));
  assert.deepEqual(path, [CELL(0, 0, 0), CELL(0, 1, 0), CELL(1, 1, 0)]);
  assert.equal(pathBetween(cube, CELL(0, 0, 0), CELL(0, 2, 0)), null);
});

test('指纹带上玩家和出口：出口在别处就是另一个局面', () => {
  const cube = createCube(3);
  const player = CELL(0, 0, 0);
  assert.notEqual(
    cubeSignature(cube, player, CELL(2, 2, 2)),
    cubeSignature(cube, player, CELL(2, 1, 2)),
  );
  assert.equal(
    cubeSignature(cube, player, CELL(2, 2, 2)),
    cubeSignature(cloneCube(cube), player, CELL(2, 2, 2)),
  );
});


