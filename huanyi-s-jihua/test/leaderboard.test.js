// 排行榜判定层的测试：不碰浏览器、不碰网络。
// storage 一律注入假的，所以「断网时本地榜还在」这件事在 node 里就能守住。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_TOP,
  CLIENT_KEY,
  DEFAULT_NICKNAME,
  LOCAL_BOARD_KEY,
  LOCAL_TOP,
  MAX_NICKNAME,
  addLocalEntry,
  boardKey,
  cleanNickname,
  makeClientId,
  makeEntry,
  mergeBoards,
  normalizeEntry,
  rankOf,
  readClientId,
  readLocalBoard,
  readNickname,
  sortEntries,
  toCloudRow,
  topEntries,
  writeLocalBoard,
  writeNickname,
} from '../src/game/leaderboard.js';
import { LEVELS } from '../src/game/levels.js';
import {
  boardEmpty,
  boardHint,
  boardPending,
  boardRank,
  boardRow,
  boardTitle,
} from '../src/scene/readout.js';

const makeStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};

const entry = (over = {}) => ({
  clientId: 'p1',
  nickname: '阿飞',
  score: 12000,
  levelNo: 4,
  wing: 'C',
  tier: 2,
  medals: 1,
  status: 'won',
  createdAt: 1000,
  ...over,
});

test('昵称净化：控制符、尖括号、空白、超长、非字符串都有确定结果', () => {
  assert.equal(cleanNickname('  张\u0000三  '), '张三');
  assert.ok(!cleanNickname('<script>翼</script>').includes('<'), '尖括号必须清掉');
  assert.ok(cleanNickname('<script>翼</script>').length <= MAX_NICKNAME);
  assert.equal(cleanNickname('   '), DEFAULT_NICKNAME);
  assert.equal(cleanNickname(null), DEFAULT_NICKNAME);
  assert.equal(cleanNickname('A'.repeat(30)).length, MAX_NICKNAME);
  assert.ok(!cleanNickname('A\r\nB').includes('\n'));
});

test('客户端标识可注入随机源，长度受控且不带特殊字符', () => {
  assert.equal(makeClientId(() => 0), 'p0000000');
  assert.match(makeClientId(() => 0.5), /^p[a-z0-9]+$/);
  assert.ok(makeClientId().length <= 64);
});

test('normalizeEntry 同时认 camelCase 本地行与 snake_case 云端行', () => {
  const local = normalizeEntry(entry());
  assert.equal(local.nickname, '阿飞');
  assert.equal(local.score, 12000);
  assert.equal(local.levelNo, 4);
  const cloud = normalizeEntry({
    id: 7,
    client_id: 'p2',
    nickname: '云玩家',
    score: 900,
    level_no: 2,
    wing: 'S',
    tier: 1,
    medals: 0,
    status: 'over',
    created_at: '2026-11-11T00:00:00.000Z',
  });
  assert.equal(cloud.clientId, 'p2');
  assert.equal(cloud.levelNo, 2);
  assert.equal(cloud.id, 7);
  assert.equal(cloud.createdAt, Date.parse('2026-11-11T00:00:00.000Z'));
});

test('normalizeEntry 拒绝脏数据，不让一条坏记录把榜单整块带崩', () => {
  for (const bad of [null, [], 'x', 42, {}, entry({ clientId: '' })]) {
    assert.equal(normalizeEntry(bad), null);
  }
  for (const score of [null, '', NaN, Infinity, -1, 'abc']) {
    assert.equal(normalizeEntry(entry({ score })), null, `score=${String(score)} 不该通过`);
  }
  assert.equal(normalizeEntry(entry({ wing: '<>' })), null);
});

test('越界字段收敛到数据库 CHECK 允许的范围', () => {
  const out = normalizeEntry(entry({
    score: 1e12, levelNo: 999, tier: 9, medals: -5, status: 'playing',
  }));
  assert.equal(out.score, 100000000);
  assert.equal(out.levelNo, LEVELS.length);
  assert.equal(out.tier, 3);
  assert.equal(out.medals, 0);
  assert.equal(out.status, 'over', '只有 won 算通关，其余一律 over');
});

test('排序：高分在前，同分先打上的在前，且不改原数组', () => {
  const list = [entry({ score: 100, createdAt: 2 }), entry({ score: 900 }), entry({ score: 100, createdAt: 1 })];
  const sorted = sortEntries(list);
  assert.deepEqual(sorted.map((item) => [item.score, item.createdAt]), [[900, 1000], [100, 1], [100, 2]]);
  assert.equal(list[0].score, 100, 'sort 不能就地改调用方的数组');
});

test('topEntries 截断到指定条数', () => {
  const many = Array.from({ length: 15 }, (_, i) => entry({ score: i * 10, clientId: `p${i}` }));
  assert.equal(topEntries(many, LOCAL_TOP).length, LOCAL_TOP);
  assert.equal(topEntries(many, 3)[0].score, 140);
});

test('makeEntry 从结算 state 造条目，字段和数据库列对得上', () => {
  const view = {
    score: 45678,
    levelIndex: 8,
    ship: { wing: 'L', tier: 3 },
    bounty: { medals: 2 },
    status: 'won',
  };
  const out = makeEntry(view, '  翼  ', 'pxyz', 1234);
  assert.equal(out.score, 45678);
  assert.equal(out.levelNo, 9);
  assert.equal(out.wing, 'L');
  assert.equal(out.tier, 3);
  assert.equal(out.medals, 2);
  assert.equal(out.nickname, '翼');
  assert.equal(out.createdAt, 1234);
});

test('toCloudRow 只交数据库要的字段，不夹带 id 与客户端时间', () => {
  const row = toCloudRow(entry());
  assert.deepEqual(Object.keys(row).sort(), [
    'client_id', 'level_no', 'medals', 'nickname', 'score', 'status', 'tier', 'wing',
  ].sort());
  assert.equal(row.created_at, undefined);
  assert.equal(row.id, undefined);
});

test('mergeBoards：云榜为主，本地未同步的补在后面并标待同步', () => {
  const cloud = [
    { client_id: 'p1', nickname: '云上', score: 12000, level_no: 4, wing: 'C', tier: 2, medals: 1, status: 'won', created_at: '2026-11-11T00:00:00Z' },
  ];
  const local = [entry(), entry({ clientId: 'p9', score: 33000, nickname: '离线' })];
  const merged = mergeBoards(cloud, local);
  assert.equal(merged[0].score, 33000, '本地那条更高，理应排到前面');
  assert.equal(merged[0].pending, true, '没上传成功的要标出来');
  assert.equal(merged.length, 2, '同一局靠 clientId|score 去重，不能出现两条');
});

test('mergeBoards 上限是云端榜单条数，不因本地堆积无限长', () => {
  const cloud = Array.from({ length: CLOUD_TOP }, (_, i) => ({
    client_id: `c${i}`, nickname: 'C', score: 1000 - i, level_no: 1,
    wing: 'C', tier: 0, medals: 0, status: 'won', created_at: 1,
  }));
  const local = Array.from({ length: 12 }, (_, i) => entry({ clientId: `l${i}`, score: 100 + i }));
  assert.equal(mergeBoards(cloud, local).length, CLOUD_TOP);
});

test('已上传但没进 Top N 的本机低分不该再挂「待同步」', () => {
  const cloud = [{
    client_id: 'other', nickname: '高手', score: 90000, level_no: 16,
    wing: 'L', tier: 3, medals: 0, status: 'won', created_at: 1,
  }];
  const local = [entry({ clientId: 'p1', score: 12000 })];
  assert.equal(mergeBoards(cloud, local, CLOUD_TOP, new Set([12000])).length, 1,
    '云端已有这条，不该以 pending 身份补位');
  assert.equal(mergeBoards(cloud, local)[1].pending, true,
    '没确认上传过的仍要显示待同步');
});

test('readLocalBoard 对坏 JSON / 非数组 / 单条脏数据一律容错', () => {
  const storage = makeStorage();
  assert.deepEqual(readLocalBoard(storage), []);
  storage.setItem(LOCAL_BOARD_KEY, '{broken');
  assert.deepEqual(readLocalBoard(storage), []);
  storage.setItem(LOCAL_BOARD_KEY, '{"not":"array"}');
  assert.deepEqual(readLocalBoard(storage), []);
  storage.setItem(LOCAL_BOARD_KEY, JSON.stringify([entry(), null, 3]));
  assert.equal(readLocalBoard(storage).length, 1);
});

test('本地榜写入读回一致，且最多留 LOCAL_TOP 条', () => {
  const storage = makeStorage();
  const many = Array.from({ length: 14 }, (_, i) => entry({ clientId: `p${i}`, score: i * 100 }));
  assert.equal(writeLocalBoard(storage, many), true);
  const back = readLocalBoard(storage);
  assert.equal(back.length, LOCAL_TOP);
  assert.equal(back[0].score, 1300);
});

test('addLocalEntry 先落盘、同局不重复、写满自动截断', () => {
  const storage = makeStorage();
  const first = addLocalEntry(storage, entry());
  assert.equal(first.length, 1);
  assert.equal(addLocalEntry(storage, entry()).length, 1, '同一局重复结算不能写两条');
  for (let i = 0; i < 15; i += 1) {
    addLocalEntry(storage, entry({ clientId: `p${i}`, score: 100 + i }));
  }
  assert.equal(readLocalBoard(storage).length, LOCAL_TOP);
});

test('storage 写不进去也不抛异常：隐身模式照样能打完一局', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(readLocalBoard(broken), []);
  assert.equal(writeLocalBoard(broken, [entry()]), false);
  assert.equal(addLocalEntry(broken, entry()).length, 1, '写不进盘也要把这一局留在内存里');
  assert.equal(writeNickname(broken, '翼'), false);
  assert.match(readClientId(broken, () => 0.25), /^p[a-z0-9]+$/);
});

test('昵称与客户端标识持久化，脏值退回默认/新建', () => {
  const storage = makeStorage();
  assert.equal(readNickname(storage), DEFAULT_NICKNAME);
  writeNickname(storage, '  长<>空  ');
  assert.equal(readNickname(storage), '长空');
  const id = readClientId(storage, () => 0.5);
  assert.equal(readClientId(storage, () => 0.9), id, '已有标识不能被换掉');
  storage.setItem(CLIENT_KEY, 'x'.repeat(200));
  assert.notEqual(readClientId(storage, () => 0.5), 'x'.repeat(200));
});

test('rankOf 能找到自己的名次，找不到返回 0', () => {
  const list = [entry({ clientId: 'a', score: 900 }), entry({ clientId: 'b', score: 500 })];
  assert.equal(rankOf(list, entry({ clientId: 'a', score: 900 })), 1);
  assert.equal(rankOf(list, entry({ clientId: 'b', score: 500 })), 2);
  assert.equal(rankOf(list, entry({ clientId: 'z', score: 1 })), 0);
  assert.equal(boardKey(entry({ clientId: 'a', score: 900 })), 'a|900');
});

test('榜单文案：在线/本机两态、空榜、名次、待同步都有一句人话', () => {
  assert.equal(boardTitle(true), '在线排行');
  assert.equal(boardTitle(false), '本机排行');
  assert.ok(boardHint(true, true).length > 0);
  assert.notEqual(boardHint(true, false), boardHint(false, false));
  assert.ok(boardEmpty().includes('打一局'));
  assert.match(boardRank(3), /3/);
  assert.equal(boardRank(0), '本次未进榜');
  const row = boardRow(entry(), 0);
  assert.match(row.main, /^1\./);
  assert.ok(row.sub.includes('第 4 关'));
  assert.ok(boardPending().length > 0);
});
