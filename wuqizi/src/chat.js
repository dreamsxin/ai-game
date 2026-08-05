export const QUICK_CHAT_MESSAGES = [
  '这步你看懂了吗？',
  '敢不敢进攻一点？',
  '猜猜我下一步下哪？',
  '你觉得现在谁占优？',
];

export function normalizeChatText(value) {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[\s，。！？、,.!?：:；;“”"'‘’（）()…-]/g, '')
    : '';
}

export function recentAutoComments(messages, limit = 4) {
  return messages
    .filter(item => item.kind === 'move-comment' && typeof item.content === 'string')
    .slice(-limit)
    .map(item => item.content);
}

export function shouldAppendAutoComment(messages, comment) {
  const normalized = normalizeChatText(comment);
  if (!normalized) return false;
  return !recentAutoComments(messages).some(item => normalizeChatText(item) === normalized);
}
