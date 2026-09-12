import test from 'node:test';
import assert from 'node:assert/strict';
import { AI, HUMAN, SIZE, createBoard } from '../src/game.js';
import {
  SITUATION_CUES,
  SOUNDS,
  SOUND_NAMES,
  THROTTLE,
  createAudio,
  cueForMove,
  cueForTurn,
  stoneCue,
  vibrationFor,
} from '../src/audio.js';

/** 假的 AudioContext：只记账不出声，currentTime 可以手动往前拨来验限流。 */
function fakeContext() {
  const log = { tones: 0, noises: 0, resumed: 0 };
  let now = 0;
  class Fake {
    constructor() {
      this.state = 'running';
      this.sampleRate = 48000;
      this.destination = { connect() {} };
    }

    get currentTime() { return now; }

    createGain() {
      return {
        gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect(next) { return next; },
      };
    }

    createOscillator() {
      log.tones += 1;
      return {
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect(next) { return next; },
        start() {}, stop() {},
      };
    }

    createBufferSource() {
      log.noises += 1;
      return { buffer: null, connect(next) { return next; }, start() {}, stop() {} };
    }

    createBiquadFilter() {
      return { type: '', frequency: { value: 0 }, connect(next) { return next; } };
    }

    createBuffer() { return { getChannelData: () => new Float32Array(8) }; }

    resume() { log.resumed += 1; this.state = 'running'; return Promise.resolve(); }

    suspend() { this.state = 'suspended'; return Promise.resolve(); }

    close() { return Promise.resolve(); }
  }
  return { Ctor: Fake, log, advance: (seconds) => { now += seconds; } };
}

/** 在第 7 行从第 col 列起摆 count 个 player 的子。 */
const row7 = (count, player, col = 3) => {
  const board = createBoard();
  for (let i = 0; i < count; i += 1) board[7][col + i] = player;
  return board;
};

test('每条音色都至少有一个振荡器或一层噪声，没有空条目', () => {
  assert.ok(SOUND_NAMES.length >= 12);
  for (const name of SOUND_NAMES) {
    const spec = SOUNDS[name];
    assert.ok((spec.tones?.length ?? 0) > 0 || spec.noise, `${name} 是个空音色`);
  }
});

test('战术表里每一档的音色都真的存在，两边都不许写错名字', () => {
  for (const [situation, pair] of Object.entries(SITUATION_CUES)) {
    assert.equal(pair.length, 2, `${situation} 得给我方和 AI 方两个`);
    for (const name of pair) {
      if (name === null) continue;
      assert.ok(SOUNDS[name], `${situation} 指向了不存在的音色 ${name}`);
    }
  }
});

test('落子声按谁下的分两种：AI 想完 300ms 才落，听不出来就会漏看', () => {
  assert.notEqual(stoneCue(HUMAN), stoneCue(AI));
  const board = createBoard();
  assert.equal(cueForMove(board, { row: 7, col: 7 }, HUMAN), 'stone');
  assert.equal(cueForMove(board, { row: 7, col: 7 }, AI), 'stoneAi');
});

test('同一个战术事实，我下和 AI 下必须是相反的情绪', () => {
  // 这是这个音效层的核心：analyzeMoveSituation 只说「这是一手成四」，
  // 但「我成四」是喜、「AI 成四」是危。只看 situation 会把两种局面混成一声。
  const mine = row7(3, HUMAN);
  const theirs = row7(3, AI);
  const four = { row: 7, col: 6 };
  assert.equal(cueForMove(mine, four, HUMAN), 'four');
  assert.equal(cueForMove(theirs, four, AI), 'threat');
  assert.notEqual(cueForMove(mine, four, HUMAN), cueForMove(theirs, four, AI));

  const myThree = row7(2, HUMAN);
  const theirThree = row7(2, AI);
  assert.equal(cueForMove(myThree, { row: 7, col: 5 }, HUMAN), 'three');
  assert.equal(cueForMove(theirThree, { row: 7, col: 5 }, AI), 'warn');
});

test('挡住对方的四是「接住了」，自己的胜点被抢是「泄气」', () => {
  // 注意 analyzeMoveSituation 把「挡掉成五点」归成 block-win 而不是 block-four。
  // 第一版我在表里给 block-win 两边都写了 block，这条测试当场炸出来 ——
  // 「AI 抢走我的胜点」是全局最难受的一手，做成安心声就是骗人。
  const aiFour = row7(4, AI);
  assert.equal(cueForMove(aiFour, { row: 7, col: 7 }, HUMAN), 'block');
  const myFour = row7(4, HUMAN);
  assert.equal(cueForMove(myFour, { row: 7, col: 7 }, AI), 'blocked');
  // 挡活三变四那一档也一样不对称。
  assert.deepEqual(SITUATION_CUES['block-four'], SITUATION_CUES['block-win']);
});


test('连成五就是终局那一声，不必再单独放一次', () => {
  const mine = row7(4, HUMAN);
  assert.equal(cueForMove(mine, { row: 7, col: 7 }, HUMAN), 'win');
  const theirs = row7(4, AI);
  assert.equal(cueForMove(theirs, { row: 7, col: 7 }, AI), 'lose', '同一手，从 AI 那边听是我输了');
});

test('平局盖掉落子声：棋盘满了不是「这一手怎么样」的问题', () => {
  const board = createBoard();
  assert.equal(cueForTurn(board, { row: 7, col: 7 }, HUMAN, 'playing'), 'stone');
  assert.equal(cueForTurn(board, { row: 7, col: 7 }, HUMAN, 'draw'), 'draw');
  // 赢的那一手仍然走战术表，所以不会出现「落子声 + 终局声」双响。
  assert.equal(cueForTurn(row7(4, HUMAN), { row: 7, col: 7 }, HUMAN, 'won'), 'win');
});

test('棋盘要传落子之前的那一份，传错会退化成一律「哒」', () => {
  // 这是最容易踩的一脚：App 里 copy 是落子之后的棋盘。
  const before = row7(3, HUMAN);
  const after = before.map((line) => [...line]);
  after[7][6] = HUMAN;
  assert.equal(cueForMove(before, { row: 7, col: 6 }, HUMAN), 'four');
  assert.equal(cueForMove(after, { row: 7, col: 6 }, HUMAN), 'stone', '那一格已经不空了');
});

test('不成威胁的普通一手就是普通落子声，别把「活三挡一下」也做成事件', () => {
  const board = row7(2, AI);
  // block-three 在表里是 null，落回落子声：这一档一局能出十几次，做成事件就是噪音。
  assert.equal(SITUATION_CUES['block-three'][0], null);
  assert.equal(cueForMove(board, { row: 7, col: 5 }, HUMAN), 'stone');
});

test('落在棋盘外或已有子的地方不该崩，返回落子声由调用方去挡', () => {
  const board = createBoard();
  board[7][7] = HUMAN;
  assert.equal(cueForMove(board, { row: 7, col: 7 }, HUMAN), 'stone');
  assert.equal(cueForMove(board, { row: -1, col: 0 }, HUMAN), 'stone');
  assert.equal(cueForMove(board, { row: SIZE, col: 0 }, HUMAN), 'stone');
  assert.equal(cueForMove(board, null, HUMAN), 'stone');
});

test('震动只给三个关口，每手都震会麻', () => {
  assert.equal(vibrationFor('stone'), null);
  assert.equal(vibrationFor('three'), null, '活三还不到该震的时候');
  assert.ok(vibrationFor('threat'), 'AI 成四必须让人停下来');
  assert.ok(vibrationFor('win'));
  assert.ok(vibrationFor('deny'));
});

test('静音时一个音频节点都不建', () => {
  const { Ctor, log } = fakeContext();
  const audio = createAudio({ muted: true, Ctor });
  assert.equal(audio.play('win'), false);
  assert.equal(audio.move(createBoard(), { row: 7, col: 7 }, HUMAN), false);
  assert.equal(log.tones, 0);
  assert.equal(log.noises, 0);
  audio.setMuted(false);
  assert.equal(audio.play('win'), true);
  assert.equal(log.tones, 4);
});

test('限流只压连点出来的那几条，战术声一手一次不许被吞', () => {
  const { Ctor, advance } = fakeContext();
  const audio = createAudio({ Ctor });
  assert.equal(audio.play('deny'), true);
  assert.equal(audio.play('deny'), false, `连点不该每次都响，间隔 ${THROTTLE.deny}s`);
  advance(THROTTLE.deny);
  assert.equal(audio.play('deny'), true);
  // 成四这种一手一次的声音没有限流条目：连着两手都成四得响两次。
  assert.equal(THROTTLE.four, undefined);
  assert.equal(audio.play('four'), true);
  assert.equal(audio.play('four'), true);
  audio.dispose();
});

test('不认识的音色名不该崩，也不该悄悄出声', () => {
  const { Ctor, log } = fakeContext();
  const audio = createAudio({ Ctor });
  assert.equal(audio.play('nope'), false);
  assert.equal(log.tones, 0);
});
