// 排行榜的判定层：只回答「这一条成绩算不算数、该排第几、本地怎么存」。
//
// 为什么单独一层：分数来自 game state，展示在 App 面板，云端在 cloud.js。
// 三边都需要同一套校验与排序，各写一份迟早会漂。这里不碰浏览器、不碰网络、
// 不碰任何配平常量，storage 由调用方注入，所以 node --test 能守住全部规则。
//
// A+B 的分工：本地榜永远先落盘（断网也要留痕），云榜成功就盖上来；
// 云不可用时 UI 直接显示本地榜，游戏本身一帧都不卡。

import { LEVELS } from './levels.js';

export const LOCAL_BOARD_KEY = 'huanyi-s-jihua:leaderboard';
export const NICKNAME_KEY = 'huanyi-s-jihua:nickname';
export const CLIENT_KEY = 'huanyi-s-jihua:client';
export const DEFAULT_NICKNAME = '无名飞行员';
export const MAX_NICKNAME = 12;
export const LOCAL_TOP = 10;
export const CLOUD_TOP = 20;
export const SCORE_MAX = 100000000;

const clampInt = (value, low, high) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : low;
};

/** 昵称只留可见字符：控制符、尖括号、多余空白一律清掉，空了就给默认名。 */
export const cleanNickname = (raw) => {
  if (typeof raw !== 'string') return DEFAULT_NICKNAME;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NICKNAME)
    .trim();
  return cleaned || DEFAULT_NICKNAME;
};

/** 客户端标识只用来高亮「我」，不是身份也不是安全边界。 */
export const makeClientId = (random = Math.random) =>
  `p${Math.floor(random() * 0xffffffff).toString(36).padStart(7, '0')}`;

const toTime = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
};

/**
 * 把任意来源的一条成绩规整成统一形状；脏数据返回 null 而不是抛异常。
 * 同时认 camelCase（本地榜）与 snake_case（云端行），省得两边各转一次。
 */
export const normalizeEntry = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  // null / 空串会被 Number() 悄悄变成 0，不能让一条没分数的记录混进榜。
  if (raw.score == null || raw.score === '') return null;
  const rawScore = Number(raw.score);
  if (!Number.isFinite(rawScore) || rawScore < 0) return null;
  const score = clampInt(rawScore, 0, SCORE_MAX);
  const clientId = String(raw.clientId ?? raw.client_id ?? '').slice(0, 64);
  if (!clientId) return null;
  const wing = String(raw.wing ?? 'C').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
  if (!wing) return null;
  const status = raw.status === 'won' ? 'won' : 'over';
  return {
    id: raw.id == null ? null : clampInt(raw.id, 0, Number.MAX_SAFE_INTEGER),
    clientId,
    nickname: cleanNickname(raw.nickname),
    score,
    levelNo: clampInt(raw.levelNo ?? raw.level_no ?? 1, 1, LEVELS.length),
    wing,
    tier: clampInt(raw.tier, 0, 3),
    medals: clampInt(raw.medals ?? 0, 0, 99),
    status,
    createdAt: toTime(raw.createdAt ?? raw.created_at),
  };
};

/** 同一局的唯一键：云写成功后本地那条靠它认出「已经上传过了」。 */
export const boardKey = (entry) => `${entry.clientId}|${entry.score}`;

/** 高分在前；同分先打上的在前；再同分按客户端标识稳定兜底。 */
export const sortEntries = (entries) => [...entries].sort(
  (a, b) => b.score - a.score
    || a.createdAt - b.createdAt
    || String(a.clientId).localeCompare(String(b.clientId)),
);

export const topEntries = (entries, limit = LOCAL_TOP) => sortEntries(entries).slice(0, limit);

/** 从结算 state 造一条成绩。now 可注入，测试里不用等真实时钟。 */
export const makeEntry = (view, nickname, clientId, now = Date.now()) => normalizeEntry({
  clientId,
  nickname,
  score: view?.score ?? 0,
  levelNo: (view?.levelIndex ?? 0) + 1,
  wing: view?.ship?.wing,
  tier: view?.ship?.tier ?? 0,
  medals: view?.bounty?.medals ?? 0,
  status: view?.status === 'won' ? 'won' : 'over',
  createdAt: now,
});

/** 提交给云端时换回 snake_case；created_at 交给数据库 now()，客户端时间不参与排名。 */
export const toCloudRow = (entry) => ({
  client_id: entry.clientId,
  nickname: entry.nickname,
  score: entry.score,
  level_no: entry.levelNo,
  wing: entry.wing,
  tier: entry.tier,
  medals: entry.medals,
  status: entry.status,
});

/**
 * 云榜为主，本地没上传成功的那些补在后面。按 clientId|score 去重。
 * uploadedScores 是「云端已有但没进 Top N」的本机分数：它们不该再以
 * 「待同步」的身份补位，否则一条已经上榜的低分会永远挂着假标记。
 */
export const mergeBoards = (cloudRows, localEntries, limit = CLOUD_TOP, uploadedScores = new Set()) => {
  const cloud = cloudRows.map(normalizeEntry).filter(Boolean);
  const seen = new Set(cloud.map(boardKey));
  const pending = localEntries
    .map(normalizeEntry)
    .filter((entry) => entry && !seen.has(boardKey(entry)) && !uploadedScores.has(entry.score))
    .map((entry) => ({ ...entry, pending: true }));
  return topEntries([...cloud, ...pending], limit);
};

/** 读本地榜。任何一处坏了都退回空榜，不能因为一条脏数据把面板打不开。 */
export const readLocalBoard = (storage = globalThis.localStorage) => {
  try {
    const parsed = JSON.parse(storage?.getItem(LOCAL_BOARD_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return topEntries(parsed.map(normalizeEntry).filter(Boolean), LOCAL_TOP);
  } catch {
    return [];
  }
};

export const writeLocalBoard = (storage, entries) => {
  try {
    storage?.setItem(LOCAL_BOARD_KEY, JSON.stringify(topEntries(entries, LOCAL_TOP)));
    return true;
  } catch {
    // 隐身模式写不进 localStorage：这一局照常能玩，只是不留本机纪录。
    return false;
  }
};

/** 先落盘再谈上传；同一局重复结算（React 重渲染）不会写两条。 */
export const addLocalEntry = (storage, entry) => {
  const clean = normalizeEntry(entry);
  if (!clean) return readLocalBoard(storage);
  const current = readLocalBoard(storage);
  if (current.some((item) => boardKey(item) === boardKey(clean))) return current;
  const next = topEntries([...current, clean], LOCAL_TOP);
  writeLocalBoard(storage, next);
  return next;
};

export const readNickname = (storage = globalThis.localStorage) => {
  try {
    return cleanNickname(storage?.getItem(NICKNAME_KEY) ?? DEFAULT_NICKNAME);
  } catch {
    return DEFAULT_NICKNAME;
  }
};

export const writeNickname = (storage, nickname) => {
  try {
    storage?.setItem(NICKNAME_KEY, cleanNickname(nickname));
    return true;
  } catch {
    return false;
  }
};

export const readClientId = (storage = globalThis.localStorage, random = Math.random) => {
  try {
    const saved = storage?.getItem(CLIENT_KEY);
    if (typeof saved === 'string' && saved && saved.length <= 64) return saved;
    const fresh = makeClientId(random);
    storage?.setItem(CLIENT_KEY, fresh);
    return fresh;
  } catch {
    return makeClientId(random);
  }
};

/** 我的名次：找不到就是 0，UI 自己决定要不要显示。 */
export const rankOf = (entries, entry) => {
  if (!entry) return 0;
  const index = topEntries(entries, Number.MAX_SAFE_INTEGER).findIndex(
    (item) => boardKey(item) === boardKey(entry),
  );
  return index < 0 ? 0 : index + 1;
};
