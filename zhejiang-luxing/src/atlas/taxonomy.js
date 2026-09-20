// 分区与类别：地图配色、筛选器和图例都从这里取，改一处全局生效。
// 颜色用十六进制数字（three 侧直接用），CSS 侧用 hexOf() 转字符串。

export const REGIONS = [
  { id: 'north', name: '浙北水乡', cities: '杭州 · 嘉兴 · 湖州', color: 0x6fd3c7, blurb: '杭嘉湖平原，河网密布，古镇与西湖都在这里' },
  { id: 'east', name: '浙东名城', cities: '绍兴 · 宁波', cityList: ['绍兴', '宁波'], color: 0x8fb8ff, blurb: '宁绍平原靠海，会稽山与四明山夹着两座老城' },
  { id: 'west', name: '浙西山水', cities: '金华 · 衢州 · 杭州西部', color: 0xa9d86e, blurb: '钱塘江上游，千岛湖、丹霞与古村落' },
  { id: 'south', name: '浙南秘境', cities: '台州 · 温州 · 丽水', color: 0xffc46b, blurb: '括苍山到雁荡山，火山流纹岩与梯田古村' },
  { id: 'isles', name: '东海列岛', cities: '舟山 · 温州外海', color: 0xff8fb1, blurb: '舟山群岛与南麂，海岛渔港和佛门道场' },
];

export const CATEGORIES = [
  { id: 'lake', name: '湖光水色', color: 0x4fc3f7, icon: '湖' },
  { id: 'town', name: '古镇水乡', color: 0xf5d76e, icon: '镇' },
  { id: 'mountain', name: '名山奇峰', color: 0x9ccc65, icon: '山' },
  { id: 'isle', name: '海岛渔港', color: 0x64ffda, icon: '岛' },
  { id: 'relic', name: '古迹人文', color: 0xffab91, icon: '迹' },
  { id: 'field', name: '田园秘境', color: 0xc5e1a5, icon: '野' },
  { id: 'urban', name: '都市体验', color: 0xce93d8, icon: '城' },
];

export const SEASONS = [
  { id: 'all', name: '不限季节', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { id: 'spring', name: '春 3-5 月', months: [3, 4, 5] },
  { id: 'summer', name: '夏 6-8 月', months: [6, 7, 8] },
  { id: 'autumn', name: '秋 9-11 月', months: [9, 10, 11] },
  { id: 'winter', name: '冬 12-2 月', months: [12, 1, 2] },
];

export const regionOf = (id) => REGIONS.find((r) => r.id === id);
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id);
export const hexOf = (color) => `#${color.toString(16).padStart(6, '0')}`;
