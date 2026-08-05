import assert from 'node:assert/strict';
import test from 'node:test';
import { QUICK_CHAT_MESSAGES, normalizeChatText, recentAutoComments, shouldAppendAutoComment } from '../src/chat.js';

const messages = [
  { role: 'assistant', kind: 'opening', content: '开局吧。' },
  { role: 'assistant', kind: 'move-comment', content: '你这条活三不能放着，我先压住。' },
  { role: 'user', kind: 'chat', content: '有点意思。' },
];

test('quick chat messages provide four one-click phrases', () => {
  assert.equal(QUICK_CHAT_MESSAGES.length, 4);
  assert.equal(new Set(QUICK_CHAT_MESSAGES).size, 4);
});

test('normalizeChatText ignores punctuation and whitespace', () => {
  assert.equal(normalizeChatText('你这条活三，不能放着！'), normalizeChatText('你这条活三不能放着'));
});

test('recentAutoComments excludes opening and direct chat messages', () => {
  assert.deepEqual(recentAutoComments(messages), ['你这条活三不能放着，我先压住。']);
});

test('shouldAppendAutoComment suppresses normalized duplicates', () => {
  assert.equal(shouldAppendAutoComment(messages, '你这条活三不能放着，我先压住！'), false);
  assert.equal(shouldAppendAutoComment(messages, '这一步形成四连，你要小心了。'), true);
});
