import { PIECE_TYPES } from './pieces.js';
import { createRandom } from './random.js';

export const QUEUE_SIZE = 5;

// 7-bag：每一轮把七种方块洗一遍，长时间不出 I 的手感问题就不存在。
function shuffleBag(random) {
  const bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = random.int(0, i);
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function createQueue(seed, size = QUEUE_SIZE) {
  const random = createRandom(seed);
  let queue = [];
  while (queue.length < size) queue = queue.concat(shuffleBag(random));
  return { queue: queue.slice(0, Math.max(size, queue.length)), randomState: random.save() };
}

// 取走队首并补齐，随机状态跟着一起流转，保证同 seed 同顺序。
export function takeNext(queue, randomState, size = QUEUE_SIZE) {
  const random = createRandom(1);
  random.load(randomState);
  const rest = queue.slice(1);
  let filled = rest;
  while (filled.length < size) filled = filled.concat(shuffleBag(random));
  return { type: queue[0], queue: filled, randomState: random.save() };
}
