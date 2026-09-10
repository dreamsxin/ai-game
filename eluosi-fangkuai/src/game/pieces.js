// 七种方块的形状、旋转与 SRS 踢墙表。坐标一律 x 向右、y 向下。
export const PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

// 每种方块给出初始朝向的格子和旋转box边长，其余朝向由 box 内旋转推导。
const SHAPES = {
  I: { box: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  J: { box: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { box: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  O: { box: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  S: { box: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  T: { box: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  Z: { box: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
};

export const PIECE_COLORS = {
  I: '#4de1ff',
  J: '#5b7cff',
  L: '#ff9f43',
  O: '#ffd447',
  S: '#63e26a',
  T: '#c86bff',
  Z: '#ff6b81',
};

const sortCells = (cells) => [...cells].sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
const rotateCW = (cells, box) => cells.map(([x, y]) => [box - 1 - y, x]);

// 四个朝向预先算好：旋转是查表而不是每帧做矩阵运算。
const ROTATIONS = Object.fromEntries(PIECE_TYPES.map((type) => {
  const { box, cells } = SHAPES[type];
  const states = [sortCells(cells)];
  for (let i = 1; i < 4; i += 1) states.push(sortCells(rotateCW(states[i - 1], box)));
  return [type, states];
}));

export const rotationCount = (type) => (type === 'O' ? 1 : 4);

export const normalizeRotation = (type, rotation) => {
  const count = rotationCount(type);
  return ((rotation % count) + count) % count;
};

export const pieceCells = (type, rotation = 0) => ROTATIONS[type][normalizeRotation(type, rotation)];

export const pieceBox = (type) => SHAPES[type].box;

// 出生位置：横向居中，纵向让方块贴着可见区顶端。
export const spawnPosition = (type, columns) => ({
  x: Math.floor((columns - pieceBox(type)) / 2),
  y: type === 'I' ? -2 : -1,
});

// SRS 踢墙偏移，dy 已经换算成 y 向下的符号。
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '0>3': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
};

// O 只有一个朝向，旋转请求直接原地成功。
export function kickOffsets(type, from, to) {
  if (type === 'O') return [[0, 0]];
  const key = `${normalizeRotation(type, from)}>${normalizeRotation(type, to)}`;
  return (type === 'I' ? KICKS_I : KICKS_JLSTZ)[key] ?? [[0, 0]];
}
