// 云端成绩榜：唯一允许碰网络的一层。
//
// publicConfig 来自云服务开通时返回的公开配置，随前端一起发布是安全的：
// publishableKey 本身不带权限，服务端按发布域名的 Origin 精确校验。
// endpoint 必须照抄 publicConfig，不能从 location / 环境变量猜——换域名会失效。
//
// 这一层不判断「现在是不是离线」：失败一律抛出去，交给 App 退回本地榜。
// 分层理由和 game/leaderboard.js 一样——判定、数据、表现各管各的。

import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import { CLOUD_TOP, normalizeEntry, toCloudRow } from './game/leaderboard.js';

export const publicConfig = {
  resourceId: 'wbcs_yMnoqQA5h9Mtdcf292x6HE',
  endpoint: 'https://wing-swap-s.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_ePQU0BYNoXFngjvMGmIicI_xRtRRZqnW0kZGuv9YtzHsq8htKRsVCVV',
};

let client = null;

/** 全应用只初始化一次；三个模块共用同一个 client。 */
export const cloudClient = () => {
  if (!client) {
    client = createWorkBuddyCloud({
      endpoint: publicConfig.endpoint,
      oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
      publishableKey: publicConfig.publishableKey,
    });
  }
  return client;
};

/** 榜单只读前 N 条；高分在前，同分早打上的在前。 */
export async function fetchCloudBoard(limit = CLOUD_TOP) {
  const { data, error } = await cloudClient().database
    .from('scores')
    .select('*')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message || '榜单读取失败');
  return (data ?? []).map(normalizeEntry).filter(Boolean);
}

/** 本机已经上传过哪些分数：补传前先查一次，避免 Top20 之外的旧成绩被重复写。 */
export async function fetchMyScores(clientId) {
  const { data, error } = await cloudClient().database
    .from('scores')
    .select('client_id, score')
    .eq('client_id', clientId);
  if (error) throw new Error(error.message || '读取本机成绩失败');
  return data ?? [];
}

/** 只增不改：表上没有 UPDATE/DELETE 策略，客户端也拿不到这两个权限。 */
export async function submitCloudScore(entry) {
  const clean = normalizeEntry(entry);
  if (!clean) throw new Error('成绩无效');
  const { data, error } = await cloudClient().database
    .from('scores')
    .insert(toCloudRow(clean))
    .select();
  if (error) throw new Error(error.message || '成绩提交失败');
  // 空数组说明写入被 RLS 拦了，绝不能当成功上报。
  if (!data || data.length === 0) throw new Error('成绩未被接受');
  return normalizeEntry(data[0]);
}
