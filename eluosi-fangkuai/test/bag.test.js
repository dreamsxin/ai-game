import test from 'node:test';
import assert from 'node:assert/strict';
import { QUEUE_SIZE, createQueue, takeNext } from '../src/game/bag.js';
import { PIECE_TYPES } from '../src/game/pieces.js';

const drain = (seed, count) => {
  let { queue, randomState } = createQueue(seed, QUEUE_SIZE);
  const drawn = [];
  for (let i = 0; i < count; i += 1) {
    const taken = takeNext(queue, randomState, QUEUE_SIZE);
    drawn.push(taken.type);
    queue = taken.queue;
    randomState = taken.randomState;
  }
  return drawn;
};

test('队列开局就填满预览长度', () => {
  const { queue } = createQueue(7, QUEUE_SIZE);
  assert.ok(queue.length >= QUEUE_SIZE);
  assert.ok(queue.every((type) => PIECE_TYPES.includes(type)));
});

test('每七个方块正好是七种各一次', () => {
  const drawn = drain(20260909, 21);
  for (let start = 0; start < 21; start += 7) {
    const bag = drawn.slice(start, start + 7);
    assert.deepEqual([...bag].sort(), [...PIECE_TYPES].sort(), `第 ${start / 7 + 1} 轮应是完整一袋`);
  }
});

test('同 seed 出块顺序完全一致，不同 seed 会分叉', () => {
  assert.deepEqual(drain(99, 14), drain(99, 14));
  assert.notDeepEqual(drain(99, 14), drain(100, 14));
});

test('取走队首后队列补齐且长度不变', () => {
  const { queue, randomState } = createQueue(5, QUEUE_SIZE);
  const taken = takeNext(queue, randomState, QUEUE_SIZE);
  assert.equal(taken.type, queue[0]);
  assert.equal(taken.queue.length >= QUEUE_SIZE, true);
  assert.deepEqual(taken.queue.slice(0, queue.length - 1), queue.slice(1));
});
