// 砖块、角色和出口的体素定义。纯数据加纯函数，同样不 import three。
import { DIRECTIONS, TILE_GAP, TILE_SPAN, WARP } from '../game/rules.js';
import { box } from './voxel.js';

export const TILE_VOXELS = 9;
// 砖体比格子小一圈，缝隙让「砖在滑动」这件事看得出来。
export const VOXEL_SIZE = (TILE_SPAN - TILE_GAP) / TILE_VOXELS;
// 墙要比角色高，否则从斜上方看过去人会整个浮在房间外面。
export const WALL_HEIGHT = 5;

const LAST = TILE_VOXELS - 1;
// 门洞占正中三格，比走廊宽一点，手机上一眼能看出这边通不通。
const DOOR_FROM = 3;
const DOOR_TO = 5;

export const PALETTE = {
  floor: 0x2a3157,
  floorInlay: 0x343d69,
  wall: 0x475289,
  wallTop: 0x707dc4,
  jamb: 0x5ce1ff,
  warp: 0xff5cc8,
  warpCore: 0xffd0f2,
  player: 0x5ce1ff,
  playerDark: 0x1c3f5c,
  playerFace: 0x0b1020,
  exit: 0x8dff6a,
  exitDark: 0x2f6b28,
};

const isDoorSlot = (index) => index >= DOOR_FROM && index <= DOOR_TO;

// 一条边的墙：有门就把正中三格留空，门框两侧点亮一格当门楣。
function wallStrip(direction, open) {
  const voxels = [];
  for (let index = 0; index < TILE_VOXELS; index += 1) {
    if (open && isDoorSlot(index)) continue;
    const jamb = open && (index === DOOR_FROM - 1 || index === DOOR_TO + 1);
    for (let y = 1; y <= WALL_HEIGHT; y += 1) {
      let color = y === WALL_HEIGHT ? PALETTE.wallTop : PALETTE.wall;
      if (jamb && y < WALL_HEIGHT) color = PALETTE.jamb;
      // 方向 0 北贴 z=0，1 东贴 x=LAST，2 南贴 z=LAST，3 西贴 x=0。
      if (direction === 0) voxels.push({ x: index, y, z: 0, color });
      else if (direction === 1) voxels.push({ x: LAST, y, z: index, color });
      else if (direction === 2) voxels.push({ x: index, y, z: LAST, color });
      else voxels.push({ x: 0, y, z: index, color });
    }
  }
  return voxels;
}

/** 一块砖的体素。tile 是 rules.js 里的整数编码，同一个值必然给出同一份几何。 */
export function tileVoxels(tile) {
  const voxels = [
    ...box(0, 0, 0, TILE_VOXELS, 1, TILE_VOXELS, PALETTE.floor),
    // 地面镶一圈内嵌方框，滑动时有参照物，不然一整片同色看不出位移。
    ...box(2, 0, 2, 5, 1, 1, PALETTE.floorInlay),
    ...box(2, 0, 6, 5, 1, 1, PALETTE.floorInlay),
    ...box(2, 0, 3, 1, 1, 3, PALETTE.floorInlay),
    ...box(6, 0, 3, 1, 1, 3, PALETTE.floorInlay),
  ];
  for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
    voxels.push(...wallStrip(direction, (tile & DIRECTIONS[direction].bit) !== 0));
  }
  // 四角立柱总是补上，否则开了门的砖会缺角，看着像碎掉了。
  for (const [x, z] of [[0, 0], [LAST, 0], [0, LAST], [LAST, LAST]]) {
    for (let y = 1; y <= WALL_HEIGHT; y += 1) {
      voxels.push({ x, y, z, color: y === WALL_HEIGHT ? PALETTE.wallTop : PALETTE.wall });
    }
  }
  if ((tile & WARP) !== 0) {
    voxels.push(...box(3, 1, 3, 3, 1, 3, PALETTE.warp));
    voxels.push({ x: 4, y: 1, z: 4, color: PALETTE.warpCore });
  }
  return voxels;
}

// 砖的旋转中心放在正中地面，这样 mesh.position 直接就是格子中心。
export const TILE_ORIGIN = [TILE_VOXELS / 2, 0, TILE_VOXELS / 2];

export const PLAYER_VOXEL = 0.045;

// 角色是一整块 mesh：它在格子之间是「跳」过去的，不需要摆四肢。
// 眼睛贴在 z 最大的那一面——相机在 +z 侧俯视，贴另一面就永远看不到脸。
export const PLAYER_VOXELS = [
  ...box(1, 0, 1, 3, 1, 3, PALETTE.playerDark),
  ...box(1, 1, 1, 3, 3, 3, PALETTE.player),
  ...box(0, 4, 0, 5, 4, 5, PALETTE.player),
  { x: 1, y: 6, z: 4, color: PALETTE.playerFace },
  { x: 3, y: 6, z: 4, color: PALETTE.playerFace },
  ...box(1, 8, 1, 3, 1, 3, PALETTE.playerDark),
];

export const PLAYER_ORIGIN = [2.5, 0, 2.5];

export const EXIT_VOXEL = 0.075;

// 出口是一道门拱：它钉在固定坐标上，不跟着砖走，所以要一眼看出「那儿才是终点」。
export const EXIT_VOXELS = [
  ...box(0, 0, 0, 5, 1, 5, PALETTE.exitDark),
  ...box(0, 1, 2, 1, 5, 1, PALETTE.exit),
  ...box(4, 1, 2, 1, 5, 1, PALETTE.exit),
  ...box(0, 6, 2, 5, 1, 1, PALETTE.exit),
  { x: 2, y: 3, z: 2, color: PALETTE.exit },
];

export const EXIT_ORIGIN = [2.5, 0, 2.5];

// 世界坐标换算：列朝 +x，行朝 +z，层朝 +y。屏幕上横滑推行、竖滑推列就是从这来的。
export const cellToWorld = (cols, rows, layerHeight, cell) => [
  (cell.col - (cols - 1) / 2) * TILE_SPAN,
  cell.layer * layerHeight,
  (cell.row - (rows - 1) / 2) * TILE_SPAN,
];

export const columnToX = (cols, col) => (col - (cols - 1) / 2) * TILE_SPAN;
export const rowToZ = (rows, row) => (row - (rows - 1) / 2) * TILE_SPAN;
export const xToColumn = (cols, x) => Math.round(x / TILE_SPAN + (cols - 1) / 2);
export const zToRow = (rows, z) => Math.round(z / TILE_SPAN + (rows - 1) / 2);
