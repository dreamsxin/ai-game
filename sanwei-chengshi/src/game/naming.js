// 命名：街道和楼宇的名字全部由 seed 决定，同一张图刷新后名字不能变，
// 否则收藏的地址和搜索结果就对不上了。
import {
  ROAD_LANE, ROAD_STREET, ROAD_TRUNK,
  ZONE_CORE, ZONE_HOUSING, ZONE_INDUSTRY, ZONE_OFFICE, ZONE_PARK, ZONE_SHOP,
} from './rules.js';

const STREET_WORDS = [
  '中山', '人民', '建设', '解放', '复兴', '迎宾', '长江', '黄河', '科技', '金融',
  '文化', '学府', '望江', '滨河', '朝阳', '青云', '和平', '工业', '锦华', '光明',
  '南湖', '北辰', '东盛', '西苑', '春晖', '兴业', '广济', '同泰', '玉泉', '天河',
];
const SUFFIX_BY_LEVEL = {
  [ROAD_TRUNK]: '大道',
  [ROAD_STREET]: '路',
  [ROAD_LANE]: '街',
};
const SECTIONS = ['', '二段', '三段', '四段', '五段', '六段'];

const BRANDS = {
  [ZONE_CORE]: ['环球', '金茂', '恒信', '紫金', '云顶', '中环', '鼎盛', '远洋', '天成', '嘉汇'],
  [ZONE_OFFICE]: ['华宇', '万隆', '博远', '联诚', '智谷', '正大', '瑞丰', '新天', '弘泰', '开元'],
  [ZONE_SHOP]: ['悦荟', '百盛', '万象', '春天', '汇金', '乐都', '金鹰', '新光', '欢乐', '缤纷'],
  [ZONE_HOUSING]: ['阳光', '翠湖', '锦绣', '文华', '康桥', '水岸', '枫林', '龙湖', '碧云', '安和'],
  [ZONE_INDUSTRY]: ['长风', '重工', '恒达', '通汇', '启明', '联运', '兴安', '宏图', '华成', '普泰'],
  [ZONE_PARK]: ['映月', '柳堤', '望山', '清波', '梧桐', '芳草', '白鹭', '听涛', '半山', '流云'],
};
const KINDS = {
  [ZONE_CORE]: ['大厦', '中心', '国际中心', '金融中心', '广场'],
  [ZONE_OFFICE]: ['大厦', '办公楼', '科技大厦', '商务中心', '写字楼'],
  [ZONE_SHOP]: ['购物中心', '商业广场', '百货', '商厦', '生活广场'],
  [ZONE_HOUSING]: ['小区', '家园', '花园', '公寓', '苑'],
  [ZONE_INDUSTRY]: ['产业园', '厂区', '物流中心', '科技园', '基地'],
  [ZONE_PARK]: ['公园', '绿地', '体育公园', '滨水绿地', '广场'],
};

/** 给每条道路起名，重名的往后挂「二段、三段」，避免搜索时两条路名字一样。 */
export function nameStreets(random, segments) {
  const used = new Map();
  return segments.map((segment, index) => {
    const suffix = SUFFIX_BY_LEVEL[segment.level] ?? '路';
    const base = `${random.pick(STREET_WORDS)}${suffix}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    // 段号用完就退回数字：宁可名字朴素，也不能出现两条同名路。
    const section = seen < SECTIONS.length ? SECTIONS[seen] : `${seen + 1}段`;
    const name = seen === 0 ? base : `${base}${section}`;
    return { id: index, name, ...segment };
  });
}

/** 楼宇名。同名楼在一座城里很常见，但同一街区里不许重名，所以带上门牌区分。 */
export function buildingName(random, zone) {
  const brands = BRANDS[zone] ?? BRANDS[ZONE_OFFICE];
  const kinds = KINDS[zone] ?? KINDS[ZONE_OFFICE];
  return `${random.pick(brands)}${random.pick(kinds)}`;
}

/**
 * 找出离建筑最近的一条路，用它的名字和沿路位置拼门牌。
 * 门牌按 4 米一号取整到奇偶——单双号分街两侧，跟现实一样。
 */
export function addressOf(streets, col, row) {
  let best = null;
  let bestDistance = Infinity;
  for (const street of streets) {
    const centre = street.offset + (street.width - 1) / 2;
    const distance = Math.abs((street.vertical ? col : row) - centre);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = street;
    }
  }
  if (!best) return { street: null, text: '未命名地块' };
  const along = best.vertical ? row : col;
  const side = (best.vertical ? col : row) < best.offset ? 1 : 0;
  const number = Math.max(1, along * 4 - side);
  return { street: best.name, text: `${best.name}${number}号` };
}
