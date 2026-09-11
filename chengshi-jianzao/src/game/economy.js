// 经济与市政结算：把一张城市网格换算成「有多少岗位、多少床位、电够不够、环境几分」，
// 再由这些数推出人口和月度收支。全是纯函数，测试里可以直接摆一座城算账。
import {
  APPEAL_FLOOR,
  BASE_APPEAL,
  DECLINE_RATE,
  FOREST_APPEAL,
  FOREST_APPEAL_CAP,
  GROWTH_RATE,
  NATURE_RADIUS,
  TAX_PER_CITIZEN,
  TERRAIN_FOREST,
  TERRAIN_WATER,
  WATER_APPEAL,
  WATER_APPEAL_CAP,
  WORKERS_PER_JOB,
  buildingOf,
  clamp,
} from './rules.js';
import { builtCells, indexOf, isServiced, roadReach } from './city.js';

// 环境分半径内的加减：正分要求那栋楼真的在运转，负分只要盖了就算——
// 停摆的工厂照样难看，这条不对称正是「先规划分区」的动力。
const appealAt = (city, active, col, row) => {
  let score = BASE_APPEAL;
  let forest = 0;
  let water = 0;
  for (let dr = -NATURE_RADIUS; dr <= NATURE_RADIUS; dr += 1) {
    for (let dc = -NATURE_RADIUS; dc <= NATURE_RADIUS; dc += 1) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= city.cols || nr < 0 || nr >= city.rows) continue;
      const terrain = city.terrain[indexOf(city, nc, nr)];
      if (terrain === TERRAIN_FOREST) forest += FOREST_APPEAL;
      else if (terrain === TERRAIN_WATER) water += WATER_APPEAL;
    }
  }
  score += Math.min(forest, FOREST_APPEAL_CAP) + Math.min(water, WATER_APPEAL_CAP);
  for (const cell of builtCells(city)) {
    const building = buildingOf(cell.id);
    if (building.appeal === 0) continue;
    const radius = building.radius;
    if (Math.abs(cell.col - col) > radius || Math.abs(cell.row - row) > radius) continue;
    if (building.appeal > 0 && !active[cell.index]) continue;
    score += building.appeal;
  }
  return clamp(Math.round(score), 0, 100);
};

/**
 * 一次遍历算清全市状态。供电按全市总量结算：缺电时所有耗电建筑一起停摆，
 * 玩家看到的就是「整城跳闸」，比逐栋断电更好读也更好补救。
 */
export function survey(city) {
  const reach = roadReach(city);
  const serviced = new Uint8Array(city.build.length);
  let supply = 0;
  let demand = 0;
  for (const cell of builtCells(city)) {
    if (!isServiced(city, reach, cell.col, cell.row)) continue;
    serviced[cell.index] = 1;
    const building = buildingOf(cell.id);
    supply += building.supply;
    demand += building.power;
  }
  const powered = demand <= supply;
  const active = new Uint8Array(city.build.length);
  const counts = {};
  let capacity = 0;
  let jobs = 0;
  let upkeep = 0;
  for (const cell of builtCells(city)) {
    const building = buildingOf(cell.id);
    counts[cell.id] = (counts[cell.id] ?? 0) + 1;
    upkeep += building.upkeep;
    if (!serviced[cell.index]) continue;
    if (building.power > 0 && !powered) continue;
    active[cell.index] = 1;
    capacity += building.homes;
    jobs += building.jobs;
  }

  let appealSum = 0;
  let houses = 0;
  for (const cell of builtCells(city)) {
    if (buildingOf(cell.id).homes === 0 || !active[cell.index]) continue;
    appealSum += appealAt(city, active, cell.col, cell.row);
    houses += 1;
  }
  // 还没有住人的时候报底子分，HUD 不该显示 0 分环境。
  const appeal = houses === 0 ? BASE_APPEAL : Math.round(appealSum / houses);

  return {
    reach, serviced, active, counts, supply, demand, powered, capacity, jobs, upkeep, appeal, houses,
  };
}

/** 环境分低于底线时按比例折损容量：脏乱差的城市留不住人。 */
export const appealFactor = (appeal) =>
  (appeal >= APPEAL_FLOOR ? 1 : Math.max(0, appeal / APPEAL_FLOOR));

/** 岗位和床位取小者，再乘环境系数，就是这座城当下能承载的人口。 */
export const targetPopulation = (report) =>
  Math.floor(Math.min(report.capacity, report.jobs * WORKERS_PER_JOB) * appealFactor(report.appeal));

/** 卡住人口的短板，一次只报最要紧的一条，直接当教练提示用。 */
export function limiterOf(report) {
  if (!report.powered) return 'power';
  if (report.appeal < APPEAL_FLOOR) return 'appeal';
  if (report.capacity === 0) return 'homes';
  if (report.jobs === 0) return 'jobs';
  return report.capacity <= report.jobs * WORKERS_PER_JOB ? 'homes' : 'jobs';
}

/** 一个月的账：人口先按短板收敛，税收再按人口和环境分算。 */
export function monthlyReport(city, population, computed = null) {
  const report = computed ?? survey(city);
  const target = targetPopulation(report);
  const gap = target - population;
  let growth = 0;
  if (gap > 0) growth = Math.max(1, Math.round(gap * GROWTH_RATE));
  else if (gap < 0) growth = Math.min(-1, Math.round(gap * DECLINE_RATE));
  const nextPopulation = Math.max(0, population + growth);
  // 税基随环境分浮动：环境 100 分约 1.4 倍，0 分只剩六折。
  const taxIncome = Math.round(population * TAX_PER_CITIZEN * (0.6 + report.appeal / 125));
  return {
    ...report,
    target,
    growth,
    population: nextPopulation,
    taxIncome,
    net: taxIncome - report.upkeep,
    limiter: limiterOf(report),
  };
}

