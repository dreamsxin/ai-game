// HUD 文案与镜头参数：纯函数，方便直接用 node --test 断言，不碰 DOM 也不碰 three.js。
import { ROAD_SPECS, zoneSpec } from '../game/rules.js';

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** 相机初始距离按城市对角线给：换尺度时不用手调，整座城都能进画面。 */
export function cameraFrame(cols, rows, cellMeters) {
  const span = Math.hypot(cols, rows) * cellMeters;
  return {
    distance: round(span, 2),
    height: round(span * 0.6, 2),
    minDistance: round(span * 0.06, 2),
    maxDistance: round(span * 1.8, 2),
  };
}

export const zoneLabel = (zone) => zoneSpec(zone)?.name ?? '未定性';
export const roadLabel = (level) => ROAD_SPECS[level]?.name ?? '非道路';
export const seedLabel = (seed) => `#${String(seed).padStart(6, '0')}`;

export const areaLabel = (squareKm) => `${round(squareKm, 2)} km²`;
export const roadKmLabel = (km) => `${round(km, 1)} km`;
export const floorAreaLabel = (wanSquare) => (
  wanSquare >= 10000 ? `${round(wanSquare / 10000, 2)} 亿 m²` : `${round(wanSquare, 0)} 万 m²`
);
export const heightLabel = (metres) => `${round(metres, 1)} m`;
export const waterLabel = (ratio) => `${round(ratio * 100, 1)}%`;

/** 统计面板的四个数字，顺序就是屏幕上的顺序。 */
export function statLines(stats) {
  return [
    { label: '规划面积', value: areaLabel(stats.areaSquareKm) },
    { label: '楼宇', value: `${stats.buildings} 栋` },
    { label: '街区', value: `${stats.blocks} 个` },
    { label: '路网', value: roadKmLabel(stats.roadKm) },
    { label: '总建面', value: floorAreaLabel(stats.floorArea) },
    { label: '水域', value: waterLabel(stats.waterRatio) },
  ];
}

/** 选中楼宇的信息卡文案。 */
export function buildingCard(building) {
  if (!building) return null;
  return {
    title: building.name,
    address: building.address,
    lines: [
      { label: '用地性质', value: zoneLabel(building.zone) },
      { label: '建筑类别', value: building.category },
      { label: '层数', value: `${building.floors} 层` },
      { label: '建筑高度', value: heightLabel(building.height) },
      { label: '占地', value: `${building.cols} × ${building.rows} 格` },
    ],
    landmark: building.landmark,
  };
}

export const tallestLabel = (stats) => (
  stats.tallest ? `${stats.tallest.name} · ${heightLabel(stats.tallest.height)}` : '暂无楼宇'
);

export const HELP_STEPS = [
  { title: '换一座城 ', detail: '改 seed 或点「随机」，同一个 seed 永远长出同一张地图。' },
  { title: '看城市 ', detail: '拖拽旋转、滚轮或双指缩放、右键拖拽平移。' },
  { title: '查楼宇 ', detail: '点任意一栋楼看它的用地性质、层数和门牌号。' },
  { title: '找地方 ', detail: '搜索框支持楼名、门牌和用地性质，比如「大厦」「住宅」。' },
];
