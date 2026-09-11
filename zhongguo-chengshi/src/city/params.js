// 参数面板的单一数据源：控件定义、默认值、以及「换风格时哪些参数跟着变」的规则。
import { STYLES, DEFAULT_STYLE, styleOf, TERRAIN_STYLES, STREET_PATTERNS, LIGHT_PRESETS } from './styles.js';

/** 结构类参数一改就要重建几何；外观类参数只更新材质和灯光，所以分开标记。 */
export const STRUCTURAL = new Set([
  'style', 'seed', 'citySize', 'density', 'blockSize', 'streetPattern',
  'districtPreset', 'commercial', 'residential', 'industrial',
  'avgHeight', 'heightVariance', 'landmarkBoost',
  'riverStrength', 'parksPercent', 'terrainRoughness', 'terrainStyle', 'terrainRelief',
  'interchange', 'monorail', 'cableCar', 'cityWall', 'canal', 'bridges',
  'showRoads', 'showProps',
]);


export const CONTROL_GROUPS = [
  {
    id: 'layout',
    name: '布局',
    controls: [
      { key: 'citySize', type: 'slider', label: '城市规模', min: 900, max: 2600, step: 50, unit: 'm' },
      { key: 'density', type: 'slider', label: '建筑密度', min: 0.2, max: 1, step: 0.01, percent: true },
      { key: 'blockSize', type: 'slider', label: '街区尺度', min: 0.2, max: 1.2, step: 0.02 },
      { key: 'streetPattern', type: 'select', label: '路网形态', options: STREET_PATTERNS },
    ],
  },
  {
    id: 'district',
    name: '功能分区',
    controls: [
      { key: 'districtPreset', type: 'select', label: '分区预设', options: [
        { id: 'balanced', name: '综合均衡' },
        { id: 'cbd', name: 'CBD 核心' },
        { id: 'oldtown', name: '老城生活区' },
        { id: 'industrial', name: '产业带' },
        { id: 'residential', name: '居住新区' },
      ] },
      { key: 'commercial', type: 'slider', label: '商业', min: 0, max: 1, step: 0.01, percent: true },
      { key: 'residential', type: 'slider', label: '住宅', min: 0, max: 1, step: 0.01, percent: true },
      { key: 'industrial', type: 'slider', label: '产业', min: 0, max: 1, step: 0.01, percent: true },
    ],
  },
  {
    id: 'skyline',
    name: '天际线',
    controls: [
      { key: 'avgHeight', type: 'slider', label: '平均高度', min: 8, max: 200, step: 1, unit: 'm' },
      { key: 'heightVariance', type: 'slider', label: '高度差异', min: 0, max: 1, step: 0.01, percent: true },
      { key: 'landmarkBoost', type: 'slider', label: '地标高度', min: 0, max: 2, step: 0.05, multiplier: true },
    ],
  },
  {
    id: 'world',
    name: '世界',
    controls: [
      { key: 'terrainStyle', type: 'select', label: '地形样式', options: TERRAIN_STYLES },
      { key: 'terrainRelief', type: 'slider', label: '地形高差', min: 0, max: 200, step: 2, unit: 'm' },
      { key: 'terrainRoughness', type: 'slider', label: '地形粗糙度', min: 0, max: 1, step: 0.01, percent: true },
      { key: 'riverStrength', type: 'slider', label: '江河强度', min: 0, max: 1, step: 0.01, percent: true },
      { key: 'parksPercent', type: 'slider', label: '绿地率', min: 0, max: 0.5, step: 0.01, percent: true },
    ],
  },
  {
    id: 'signature',
    name: '城市特色',
    controls: [
      { key: 'interchange', type: 'slider', label: '层叠立交', min: 0, max: 4, step: 1, count: true },
      { key: 'monorail', type: 'slider', label: '轻轨穿楼', min: 0, max: 3, step: 1, count: true },
      { key: 'cableCar', type: 'slider', label: '过江索道', min: 0, max: 3, step: 1, count: true },
      { key: 'bridges', type: 'slider', label: '桥梁', min: 0, max: 6, step: 1, count: true },
      { key: 'cityWall', type: 'toggle', label: '古城墙' },
      { key: 'canal', type: 'toggle', label: '水巷河网' },
    ],
  },
  {
    id: 'render',
    name: '光照与画面',
    controls: [
      { key: 'lightPreset', type: 'select', label: '光照时段', options: LIGHT_PRESETS },
      { key: 'brightness', type: 'slider', label: '亮度', min: 0.5, max: 2, step: 0.02, multiplier: true },
      { key: 'haze', type: 'slider', label: '雾霾浓度', min: 0, max: 2.5, step: 0.05, multiplier: true },
      { key: 'neon', type: 'slider', label: '霓虹强度', min: 0, max: 1.5, step: 0.02, multiplier: true },
      { key: 'showRoads', type: 'toggle', label: '显示路网' },
      { key: 'showProps', type: 'toggle', label: '显示植被与街具' },
    ],
  },
];

export const DISTRICT_PRESETS = {
  balanced: null, // 用风格自带的比例
  cbd: { commercial: 0.7, residential: 0.24, industrial: 0.06 },
  oldtown: { commercial: 0.3, residential: 0.62, industrial: 0.08 },
  industrial: { commercial: 0.2, residential: 0.3, industrial: 0.5 },
  residential: { commercial: 0.18, residential: 0.76, industrial: 0.06 },
};

export const VIEW_PRESETS = [
  { id: 'orbit', name: '环绕', hint: '默认俯瞰环绕' },
  { id: 'overhead', name: '俯视', hint: '正俯视看路网' },
  { id: 'skyline', name: '天际线', hint: '压低视角看轮廓' },
  { id: 'street', name: '街景', hint: '贴地视角' },
  { id: 'cinematic', name: '电影', hint: '自动巡游' },
];

/** 由风格预设推出一整套默认参数。切换风格时调用它，用户没动过的参数全部跟着走。 */
export function paramsForStyle(styleId, seed = 'chongqing-8d') {
  const style = styleOf(styleId);
  return {
    style: style.id,
    seed,
    citySize: style.id === 'hangzhou' ? 1400 : style.id === 'xian' ? 1800 : 1700,
    density: style.layout.density,
    blockSize: style.layout.blockSize,
    streetPattern: style.layout.pattern,
    districtPreset: 'balanced',
    commercial: style.zones.commercial,
    residential: style.zones.residential,
    industrial: style.zones.industrial,
    avgHeight: style.skyline.avgHeight,
    heightVariance: style.skyline.variance,
    landmarkBoost: 1,
    terrainStyle: style.terrain.style,
    terrainRelief: style.terrain.relief,
    terrainRoughness: style.terrain.roughness,
    riverStrength: style.terrain.riverWidth > 0 ? 0.85 : 0.2,
    parksPercent: style.zones.parks,
    interchange: style.features.interchange,
    monorail: style.features.monorail,
    cableCar: style.features.cableCar,
    bridges: style.features.bridge,
    cityWall: style.features.cityWall > 0,
    canal: style.features.canal > 0,
    lightPreset: style.lighting.preset,
    brightness: 1,
    haze: 1,
    neon: 1,
    showRoads: true,
    showProps: true,
  };
}

export const DEFAULT_PARAMS = paramsForStyle(DEFAULT_STYLE);
export const STYLE_OPTIONS = STYLES.map((s) => ({ id: s.id, name: s.name }));
