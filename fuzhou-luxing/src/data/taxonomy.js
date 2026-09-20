// 类别、区县、季节，以及整张图的配色。
//
// 配色照《千里江山图》来：绢底是发黄的暖褐，山体主色只有「石绿」「石青」两种矿物色，
// 山脚压赭石，轮廓用淡墨，点缀用金。传统青绿山水的规矩是「远山用青、近山用绿」，
// 所以 TIERS 里越远的山越偏蓝 —— 这是这张图看上去像画而不像地图的主要原因。

export const PALETTE = {
  silk: '#e6d6b0',
  silkWarm: '#ddc79a',
  silkEdge: '#cbb383',
  ink: '#2f2a24',
  inkSoft: 'rgba(47, 42, 36, 0.55)',
  inkFaint: 'rgba(47, 42, 36, 0.28)',
  green: '#5f8f5b',
  greenDeep: '#3c6a48',
  greenPale: '#86ad74',
  blue: '#3f7f9e',
  blueDeep: '#245e7f',
  bluePale: '#74a7bb',
  ochre: '#a9663a',
  ochreDeep: '#7f4726',
  gold: '#c8981f',
  goldPale: '#e3c469',
  water: '#7fb0c2',
  waterDeep: '#4d8ca4',
  cloud: 'rgba(252, 248, 238, 0.86)',
  cinnabar: '#b3392c',
};

/** 山的远近分层：0 是最远的一层（偏石青），2 是最近的一层（偏石绿加赭石） */
export const TIERS = [
  { fill: '#6d9cb4', edge: '#3d7492', base: '#5b8298' },
  { fill: '#5f9070', edge: '#3a6b4e', base: '#7d8d5c' },
  { fill: '#6f9f5f', edge: '#3c6a40', base: '#a9663a' },
];

export const CATEGORIES = [
  { id: 'ancient', name: '古镇古村', color: '#a9663a', mark: '村' },
  { id: 'mountain', name: '名山胜迹', color: '#3c6a48', mark: '山' },
  { id: 'water', name: '水泽温泉', color: '#245e7f', mark: '水' },
  { id: 'relic', name: '人文古迹', color: '#8a6a2f', mark: '迹' },
  { id: 'nature', name: '田园生态', color: '#6f9a4f', mark: '野' },
  { id: 'folk', name: '非遗民俗', color: '#b3392c', mark: '傩' },
  { id: 'park', name: '城中园林', color: '#4f7d52', mark: '园' },
];

/** 抚州 2 区 9 县。seat 是县城驻地，地图上按这个位置写地名 */
export const COUNTIES = [
  { id: 'linchuan', name: '临川区', seat: [116.36, 27.95], blurb: '抚州城区，一河两岸，汤显祖与临川才子的主场' },
  { id: 'dongxiang', name: '东乡区', seat: [116.61, 28.25], blurb: '赣东门户，王安石故里上池村在此' },
  { id: 'nancheng', name: '南城县', seat: [116.64, 27.56], blurb: '盱江穿城，麻姑山与万年桥一带' },
  { id: 'lichuan', name: '黎川县', seat: [116.96, 27.28], blurb: '明清骑楼老街与油画之乡，武夷山西麓' },
  { id: 'nanfeng', name: '南丰县', seat: [116.53, 27.21], blurb: '曾巩故里、蜜橘之乡、跳傩发源地' },
  { id: 'chongren', name: '崇仁县', seat: [116.06, 27.76], blurb: '相山道场与汤溪温泉' },
  { id: 'lean', name: '乐安县', seat: [115.83, 27.43], blurb: '流坑古村与大华山，抚州最西一角' },
  { id: 'yihuang', name: '宜黄县', seat: [116.22, 27.55], blurb: '曹洞宗祖庭曹山，宜黄戏与棠阴夏布' },
  { id: 'jinxi', name: '金溪县', seat: [116.76, 27.91], blurb: '心学陆象山故里，古村与雕版书坊' },
  { id: 'zixi', name: '资溪县', seat: [117.06, 27.71], blurb: '大觉山与原始森林，面包之乡' },
  { id: 'guangchang', name: '广昌县', seat: [116.34, 26.84], blurb: '白莲之乡与抚河源头，驿前明清老屋' },
];

export const SEASONS = [
  { id: 'all', name: '不限季节', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { id: 'spring', name: '春 3-5 月', months: [3, 4, 5] },
  { id: 'summer', name: '夏 6-8 月', months: [6, 7, 8] },
  { id: 'autumn', name: '秋 9-11 月', months: [9, 10, 11] },
  { id: 'winter', name: '冬 12-2 月', months: [12, 1, 2] },
];

export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id);
export const countyOf = (id) => COUNTIES.find((c) => c.id === id);
