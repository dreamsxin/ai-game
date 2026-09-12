// 文案与镜头换算：所有「给人看的字」都在这里，纯函数，可单测。
import { APPEAL_FLOOR, BUILDINGS, TOOL_BULLDOZE, WORKERS_PER_JOB, buildingOf } from '../game/rules.js';

const MONTHS_PER_YEAR = 12;

/** 月份从 0 开始计，显示成「第 N 年 M 月」，比裸月数好读。 */
export const monthLabel = (month) => {
  const year = Math.floor(month / MONTHS_PER_YEAR) + 1;
  return `第 ${year} 年 ${(month % MONTHS_PER_YEAR) + 1} 月`;
};

export const moneyLabel = (money) => (money < 0 ? `-${Math.abs(money)}` : `${money}`);
export const populationLabel = (population, target) => `${population} / ${target}`;
export const levelLabel = (index, level) => `第 ${index + 1} 关 · ${level.name}`;
export const starLabel = (stars) => '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));

export const toolLabel = (tool) =>
  (tool === TOOL_BULLDOZE ? '拆除' : buildingOf(tool)?.name ?? '');

/** 电力读数：缺口是玩家最需要一眼看到的数。 */
export const powerLabel = (report) =>
  (report.demand === 0 ? `${report.supply}` : `${report.demand} / ${report.supply}`);

export const netLabel = (net) => (net >= 0 ? `+${net}` : `${net}`);

export const speedLabel = (speed) => (speed === 0 ? '暂停' : `${speed}× 速`);

// 短板决定教练说什么：一次只推一件事，玩家才知道下一步按哪个按钮。
const COACH = {
  power: '电力不够，加一座电厂或先拆掉几栋耗电的',
  appeal: '环境分太低，多修公园、把工厂电厂挪远一点',
  homes: '床位见底了，接着修住宅',
  jobs: '没人招工，补商铺或工厂',
};

export function coachLine(state) {
  const report = state.report;
  if (state.status === 'won') return '达标了，市长';
  if (state.status === 'lost') return '资金链断了，重开这一关吧';
  if (report.counts.road === undefined || report.counts.road <= 1) {
    return '先从城门那格路往里画一条街';
  }
  if (report.capacity === 0 && report.jobs === 0) return '沿路两侧配一栋住宅和一间商铺';
  // 跳闸比「记得按播放」更急，所以先说电。
  if (!report.powered) return COACH.power;
  if (state.speed === 0 && state.month === 0) return '规划好了就按播放键让时间走起来';
  return COACH[report.limiter] ?? '按住拖动可以连着建，注意别把钱花光';
}

/** 建筑按钮上的副标题：说清这栋楼到底给城市带来什么。 */
export function buildingBrief(id) {
  const building = BUILDINGS[id];
  if (!building) return '';
  const parts = [];
  if (building.homes) parts.push(`床位 ${building.homes}`);
  if (building.jobs) parts.push(`岗位 ${building.jobs}`);
  if (building.supply) parts.push(`供电 ${building.supply}`);
  if (building.power) parts.push(`耗电 ${building.power}`);
  if (building.appeal) parts.push(`环境 ${building.appeal > 0 ? '+' : ''}${building.appeal}`);
  return parts.join(' · ');
}

export const winComment = (months, par) => {
  if (months <= par) return '工期漂亮，一分钱没白花';
  if (months <= par + Math.ceil(par / 2)) return '稳当，只是绕了点路';
  return '城建起来了，下次可以更早铺开路网';
};

export const loseComment = () => '连续几个月入不敷出：先拆掉停摆的耗电大户，再靠住宅和商铺回血';

// 只有真刷掉这一关的旧星数才报新纪录，否则重刷同一关每次都报喜就不值钱了。
export const recordLabel = (isRecord) => (isRecord ? '新纪录' : null);

export const muteLabel = (muted) => (muted ? '音效已关' : '音效已开');

// 星级点评按拿到几颗给，和上面那行「工期账」分开说。达标本身不该被挑刺。
export const rewardLabel = (stars) => {
  if (stars >= 3) return '满星达标';
  if (stars === 2) return '再快几个月就是满星';
  return '达标了，下次早点铺开路网';
};


export const TUTORIAL_STEPS = [
  { title: '路先行', detail: '所有建筑都要贴着一条能连回城门的路，断头路不算通车。' },
  { title: '住宅配岗位', detail: `住宅出人、商铺工厂出岗位，一个岗位养 ${WORKERS_PER_JOB} 个居民，两边都缺人口就卡住。` },
  { title: '电要够', detail: '全城用电超过供电就整城跳闸，所有耗电建筑一起停摆。' },
  { title: '环境要管', detail: `工厂电厂压低周边环境分，低于 ${APPEAL_FLOOR} 分居民开始搬走，用公园和林地补回来。` },
  { title: '钱会流走', detail: '每栋楼都收月度维护费，连续赤字太久会破产。' },
];

/** 镜头距离随地块尺寸走：小地图别推太远，大地图要能整屏装下。 */
export function cameraDistance(cols, rows, zoom = 1) {
  const span = Math.max(cols, rows);
  return {
    back: (span * 0.85 + 3) / zoom,
    height: (span * 0.78 + 4) / zoom,
  };
}
