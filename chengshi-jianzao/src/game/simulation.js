// 游戏状态机：城市网格 + 钱 + 人口 + 月份。
// 时间只在 tick 里走一格月，其余操作都是即时的；状态对象不可变，UI 拿到新对象才重绘。
import {
  BANKRUPT_MONTHS,
  BUILD_ORDER,
  LEVEL_COUNT,
  ROAD,
  SPEEDS,
  TOOL_BULLDOZE,
  buildingOf,
  clamp,
  levelRecipe,
  starsFor,
} from './rules.js';
import { canDemolish, canPlace, demolish, place } from './city.js';
import { monthlyReport } from './economy.js';
import { generateCity } from './terrain.js';

export function createGame(levelIndex = 0, seed = 1) {
  const level = levelRecipe(levelIndex);
  const city = generateCity(level, seed);
  return {
    levelIndex: clamp(levelIndex, 0, LEVEL_COUNT - 1),
    level,
    seed,
    city,
    money: level.budget,
    population: 0,
    month: 0,
    tool: ROAD,
    // 开局暂停：先让玩家把第一条路画出来，再开始烧钱。
    speed: 0,
    status: 'playing',
    stars: 0,
    deficit: 0,
    report: monthlyReport(city, 0),
    notice: null,
    revision: 0,
  };
}

// 只有内容变了才换对象：拖动画路时每格都撞同一句「钱不够」，不该刷新一整屏。
const notify = (state, text) => (state.notice === text ? state : { ...state, notice: text });

const commit = (state, city, spend) => ({
  ...state,
  city,
  money: state.money - spend,
  // 账目跟着建筑立刻刷新，玩家点下去就能看到岗位、用电和目标人口怎么变。
  report: monthlyReport(city, state.population),
  notice: null,
  revision: state.revision + 1,
});

/** 在一格上执行当前工具。钱不够或位置不合法时只回一句提示，不动城市。 */
export function build(state, col, row) {
  if (state.status !== 'playing') return state;
  if (state.tool === TOOL_BULLDOZE) {
    const check = canDemolish(state.city, col, row);
    if (!check.ok) return notify(state, check.reason);
    if (state.money < check.cost) return notify(state, `拆迁费还差 ${check.cost - state.money}`);
    return commit(state, demolish(state.city, col, row), check.cost);
  }
  const check = canPlace(state.city, col, row, state.tool);
  if (!check.ok) return notify(state, check.reason);
  if (state.money < check.cost) return notify(state, `钱不够，还差 ${check.cost - state.money}`);
  return commit(state, place(state.city, col, row, state.tool), check.cost);
}

export function setTool(state, tool) {
  if (tool !== TOOL_BULLDOZE && !buildingOf(tool)) return state;
  if (state.tool === tool) return state;
  return { ...state, tool, notice: null };
}

export function setSpeed(state, speed) {
  if (!SPEEDS.includes(speed) || state.speed === speed) return state;
  if (state.status !== 'playing') return state;
  return { ...state, speed };
}

/** 空格键的手感：跑着就停，停着就恢复到 1 倍速。 */
export const togglePause = (state) => setSpeed(state, state.speed === 0 ? 1 : 0);

export const cycleTool = (state, step) => {
  const order = [...BUILD_ORDER, TOOL_BULLDOZE];
  const at = order.indexOf(state.tool);
  const next = (at + step + order.length) % order.length;
  return setTool(state, order[next]);
};

// 月报里最值得念出来的一句：跳闸和搬离比「又收了几块钱」重要。
const monthLine = (report) => {
  if (!report.powered && report.demand > 0) return `全城缺电 ${report.demand - report.supply}，用电建筑停摆`;
  if (report.growth < 0) return `环境太差，${-report.growth} 人搬走了`;
  if (report.net < 0) return `本月赤字 ${-report.net}`;
  if (report.growth > 0) return `新迁入 ${report.growth} 人`;
  return null;
};

/** 走过一个月：先结算人口和钱，再判定达标或破产。 */
export function tick(state) {
  if (state.status !== 'playing') return state;
  const report = monthlyReport(state.city, state.population);
  const money = state.money + report.net;
  const month = state.month + 1;
  const deficit = money < 0 ? state.deficit + 1 : 0;
  let status = 'playing';
  let stars = 0;
  if (report.population >= state.level.target) {
    status = 'won';
    stars = starsFor(month, state.level.par);
  } else if (deficit >= BANKRUPT_MONTHS) {
    status = 'lost';
  }
  return {
    ...state,
    money,
    month,
    population: report.population,
    report,
    deficit,
    status,
    stars,
    // 结算出结果就停表，避免面板弹出来后时间还在走。
    speed: status === 'playing' ? state.speed : 0,
    notice: status === 'lost' ? '连续赤字太久，市政破产了' : monthLine(report),
    revision: state.revision + 1,
  };
}

export const restartLevel = (state) => createGame(state.levelIndex, state.seed);
export const nextLevel = (state) => createGame(state.levelIndex + 1, state.seed + 1);

