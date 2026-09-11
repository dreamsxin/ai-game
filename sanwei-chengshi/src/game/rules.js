// 城市尺度、用地性质、道路等级的常量表。这一层只描述「城市长什么样」，不做任何生成。
// 所有长度单位统一为「格」，一格 = CELL_METERS 米，渲染层再换算成三维坐标。
export const CELL_METERS = 10;
export const FLOOR_METERS = 3.3;

export const ROAD_NONE = 0;
export const ROAD_LANE = 1;
export const ROAD_STREET = 2;
export const ROAD_TRUNK = 3;

// 等级越高的路越宽越亮：主干道要在俯视图里一眼撑起城市骨架。
// 路面比地块底色亮，路网才是画面里的第一层信息。
export const ROAD_SPECS = {
  [ROAD_LANE]: { id: ROAD_LANE, name: '支路', width: 1, color: 0x3c4152, speed: 30 },
  [ROAD_STREET]: { id: ROAD_STREET, name: '次干道', width: 2, color: 0x4a5167, speed: 50 },
  [ROAD_TRUNK]: { id: ROAD_TRUNK, name: '主干道', width: 3, color: 0x5b637d, speed: 70 },
};

export const roadSpec = (level) => ROAD_SPECS[level] ?? null;

export const ZONE_CORE = 'core';
export const ZONE_OFFICE = 'office';
export const ZONE_SHOP = 'shop';
export const ZONE_HOUSING = 'housing';
export const ZONE_INDUSTRY = 'industry';
export const ZONE_PARK = 'park';
export const ZONE_WATER = 'water';

/**
 * 每种用地的「配方」：楼层区间决定天际线，lot 决定地块被切成多大一块宅基地，
 * coverage 是留空率的反面——数值越低越稀疏，绿地和工业区就是靠它拉开差别的。
 */
export const ZONE_SPECS = {
  [ZONE_CORE]: {
    id: ZONE_CORE, name: '中央商务区', color: 0x8fb8ff, floors: [18, 62],
    lot: [4, 4], coverage: 0.86, category: '写字楼',
  },
  [ZONE_OFFICE]: {
    id: ZONE_OFFICE, name: '商务办公', color: 0x6f9fe0, floors: [8, 26],
    lot: [3, 3], coverage: 0.82, category: '办公楼',
  },
  [ZONE_SHOP]: {
    id: ZONE_SHOP, name: '商业街区', color: 0xe0b269, floors: [3, 9],
    lot: [2, 3], coverage: 0.9, category: '商铺',
  },
  [ZONE_HOUSING]: {
    id: ZONE_HOUSING, name: '居住区', color: 0xc8cfe0, floors: [5, 18],
    lot: [3, 4], coverage: 0.82, category: '住宅',
  },
  [ZONE_INDUSTRY]: {
    id: ZONE_INDUSTRY, name: '产业园区', color: 0x8d8f9c, floors: [1, 4],
    lot: [5, 4], coverage: 0.7, category: '厂房',
  },
  [ZONE_PARK]: {
    id: ZONE_PARK, name: '公园绿地', color: 0x4f8a52, floors: [1, 2],
    lot: [4, 4], coverage: 0.12, category: '配套',
  },
  [ZONE_WATER]: {
    id: ZONE_WATER, name: '水域', color: 0x1d3f63, floors: [0, 0],
    lot: [4, 4], coverage: 0, category: '水域',
  },
};

export const zoneSpec = (zone) => ZONE_SPECS[zone] ?? null;
export const ZONE_ORDER = [
  ZONE_CORE, ZONE_OFFICE, ZONE_SHOP, ZONE_HOUSING, ZONE_INDUSTRY, ZONE_PARK, ZONE_WATER,
];

/**
 * 城市尺度预设。minBlock 是切分的停手线，街区大小和密度都由它决定；
 * river 是水系强度，0 就是一座旱城。
 */
export const SCALES = [
  { id: 'town', name: '小城', cols: 64, rows: 64, minBlock: 7, river: 0.7, coreRadius: 0.24 },
  { id: 'city', name: '新城', cols: 96, rows: 96, minBlock: 7, river: 0.8, coreRadius: 0.2 },
  { id: 'metro', name: '都会', cols: 128, rows: 128, minBlock: 8, river: 0.9, coreRadius: 0.17 },
];

export const DEFAULT_SCALE = SCALES[1].id;
export const scaleOf = (id) => SCALES.find((scale) => scale.id === id) ?? SCALES[1];

export const TERRAIN_LAND = 0;
export const TERRAIN_WATER = 1;
