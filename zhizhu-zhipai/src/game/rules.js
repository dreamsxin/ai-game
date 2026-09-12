// 规则常量与计分的唯一真源。
import { CARD_COUNT, RANKS } from './cards.js';

export const PILE_COUNT = 10;
// 开局发 54 张：前 4 摞 6 张，后 6 摞 5 张。剩下 50 张是牌库，每次发一轮 10 张。
export const DEAL_ROWS = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5];
export const OPENING_CARDS = DEAL_ROWS.reduce((sum, n) => sum + n, 0);
export const STOCK_CARDS = CARD_COUNT - OPENING_CARDS;
export const DEAL_BATCHES = STOCK_CARDS / PILE_COUNT;
// 收走一整摞 K→A 算完成一门，八门收完就赢。
export const RUN_LENGTH = RANKS;
export const FOUNDATION_COUNT = CARD_COUNT / RUN_LENGTH;

// 三档难度共用一套牌，只是花色透镜不同（见 cards.js 的 suitOf）。
export const LEVELS = [
  { suits: 1, name: '新手', detail: '只有黑桃，先把整段搬运练熟' },
  { suits: 2, name: '进阶', detail: '黑桃加红桃，开始要挑花色' },
  { suits: 4, name: '标准', detail: '四门齐全，经典蜘蛛' },
];
export const LEVEL_COUNT = LEVELS.length;
export const clampLevel = (index) => Math.max(0, Math.min(LEVEL_COUNT - 1, Math.trunc(index) || 0));
export const levelRecipe = (index) => LEVELS[clampLevel(index)];

// 计分沿用经典蜘蛛的路子：开局 500 分，每走一步扣 1，收完一门加 100。
// 扣分是为了让「乱试」有代价，但底线是 0——赢了就不该看到负分。
export const START_SCORE = 500;
export const MOVE_COST = 1;
export const RUN_BONUS = 100;
export const scoreOf = (moves, runs) =>
  Math.max(0, START_SCORE - moves * MOVE_COST + runs * RUN_BONUS);

// 星级按最终分给。满分是 500 + 8×100 = 1300，一步不废地收完八门才拿得到。
export const starsFor = (score) => {
  if (score >= 1100) return 3;
  if (score >= 900) return 2;
  return 1;
};

export const HISTORY_LIMIT = 60;
