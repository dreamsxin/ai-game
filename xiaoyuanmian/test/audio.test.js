import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectHotspot, projectState, visitLocation, createInitialState } from '../server/caseEngine.js';
import {
  EVENT_CUES,
  SCALE,
  SOUNDS,
  SOUND_NAMES,
  THROTTLE,
  createAudio,
  cueForEvent,
  progressShift,
  remainingShift,
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

test('每条音色都至少有一个振荡器或一层噪声，没有空条目', () => {
  assert.ok(SOUND_NAMES.length >= 10);
  for (const name of SOUND_NAMES) {
    const spec = SOUNDS[name];
    assert.ok((spec.tones?.length ?? 0) > 0 || spec.noise, `${name} 是个空音色`);
  }
});

test('服务端每一种 event.type 在音效表里都有交代 —— 加了新事件必须在这里炸', () => {
  // 直接从 caseEngine 源码里把 type 抠出来。服务端加一种事件而音效表没跟上，
  // 表现是「那个动作没声音」，肉眼很难发现，所以让这条测试替我盯着。
  const source = readFileSync(new URL('../server/caseEngine.js', import.meta.url), 'utf8');
  const types = new Set([...source.matchAll(/type: '([a-z_]+)'/g)].map((match) => match[1]));
  assert.ok(types.size >= 12, `只抠到 ${types.size} 种，正则可能失效了`);
  for (const type of types) {
    assert.ok(type in EVENT_CUES, `服务端有 ${type}，音效表里没有`);
  }
  for (const type of Object.keys(EVENT_CUES)) {
    assert.ok(types.has(type), `音效表里的 ${type} 服务端已经不发了`);
  }
});

test('表里指向的音色都真的存在', () => {
  for (const [type, name] of Object.entries(EVENT_CUES)) {
    if (name === null) continue;
    assert.ok(SOUNDS[name], `${type} 指向了不存在的音色 ${name}`);
  }
});

test('「推进了案子」和「什么都没发生」必须是两种声音', () => {
  // 服务端把这四种动作标成不加 version 的空动作。侦探游戏里玩家会把热点点一遍、
  // 把问题问一遍，这个区别是最缺的反馈 —— 服务端算好了，扔掉太可惜。
  const advance = ['hotspot_inspected', 'confrontation_succeeded', 'location_visited'];
  const noop = ['hotspot_revisited', 'location_unchanged', 'confrontation_repeated'];
  for (const type of noop) assert.equal(EVENT_CUES[type], 'nothing');
  for (const type of advance) assert.notEqual(EVENT_CUES[type], 'nothing');
  // 出示错证据是「判断错了」，不是「重复操作」，两者不该同一声。
  assert.notEqual(EVENT_CUES.confrontation_failed, EVENT_CUES.confrontation_repeated);
});

test('收集音的音高随进度爬，用音阶而不是等分半音', () => {
  const state = (found, total) => ({ progress: { found, total } });
  const first = cueForEvent({ type: 'hotspot_inspected', evidenceId: 'x' }, state(1, 10));
  const last = cueForEvent({ type: 'hotspot_inspected', evidenceId: 'y' }, state(10, 10));
  assert.equal(first.name, 'evidence');
  assert.ok(last.shift > first.shift, '越接近凑齐越亮');
  assert.equal(progressShift(0, 10), 0);
  assert.equal(progressShift(10, 10), SCALE.at(-1));
  // 每一级都落在大调音阶上，不会出现听着像仪器读数的等分半音。
  for (let found = 0; found <= 10; found += 1) {
    assert.ok(SCALE.includes(progressShift(found, 10)));
  }
  // 缺字段、除零、超界都不该崩。
  assert.equal(progressShift(undefined, undefined), 0);
  assert.equal(progressShift(5, 0), SCALE.at(-1));
  assert.equal(progressShift(99, 10), SCALE.at(-1));
  assert.equal(cueForEvent({ type: 'hotspot_inspected' }, {}).shift, 0, '没有 progress 也得出声');
});

test('指控机会越少，驳回声越低 —— 这是服务端唯一给出的分档', () => {
  assert.equal(remainingShift(2), 0);
  assert.ok(remainingShift(1) < remainingShift(2));
  assert.ok(remainingShift(0) < remainingShift(1));
  assert.equal(remainingShift(undefined), 0, '字段缺了按最宽松算，别无端制造紧张');
  const second = cueForEvent({ type: 'accusation_rejected', remaining: 1 }, {});
  assert.equal(second.name, 'rejected');
  assert.ok(second.shift < 0);
});

test('问出新证据跟普通回答分开：整个案子只有一处，不该混在一起', () => {
  const plain = cueForEvent({ type: 'dialogue_completed', evidenceId: null }, {});
  const lead = cueForEvent({ type: 'dialogue_completed', evidenceId: 'su-sketch' }, {});
  assert.equal(plain.name, 'reply');
  assert.equal(lead.name, 'lead');
});

test('问住人又顺带拿到证据，升一点：服务端这里的字段名跟别处不一样', () => {
  // hotspot / dialogue 用 evidenceId，confrontation 用 evidenceIdGranted。
  const plain = cueForEvent({ type: 'confrontation_succeeded', evidenceIdGranted: null }, {});
  const rich = cueForEvent({ type: 'confrontation_succeeded', evidenceIdGranted: 'proof' }, {});
  assert.equal(plain.shift, 0);
  assert.ok(rich.shift > 0);
  assert.equal(rich.name, plain.name, '还是同一声，只是更值');
});

test('开局和读档不出声：它们的响应根本没有顶层 event', () => {
  // 这是最容易踩的一脚：state.lastEvent 一直留着，读它会让刷新页面重播上一次动作。
  assert.equal(EVENT_CUES.case_started, null);
  assert.equal(cueForEvent({ type: 'case_started', message: '开场' }, {}), null);
  assert.equal(cueForEvent(null, {}), null);
  assert.equal(cueForEvent(undefined, undefined), null);
  assert.equal(cueForEvent({ message: '没有 type' }, {}), null);
  assert.equal(cueForEvent({ type: 'something_new_on_the_server' }, {}), null, '认不出的宁可静默');
});

test('notify 只认顶层 event，不许去读 state.lastEvent', () => {
  const { Ctor, log } = fakeContext();
  const audio = createAudio({ Ctor });
  // 读档的形状：有 state.lastEvent，没有顶层 event。
  assert.equal(audio.notify({
    gameId: 'g1',
    state: { lastEvent: { type: 'hotspot_inspected', evidenceId: 'x' }, progress: { found: 3, total: 10 } },
  }), false, '刷新页面不该把上一次的动作重播一遍');
  assert.equal(log.tones, 0);
  assert.equal(audio.notify({
    gameId: 'g1',
    event: { type: 'hotspot_inspected', evidenceId: 'x' },
    state: { progress: { found: 3, total: 10 } },
  }), true);
  assert.ok(log.tones > 0);
});

test('跑一遍真的 caseEngine：它吐出来的 event 都能配上声音', () => {
  // 手写 fixture 会跟着我的记忆跑偏，直接驱动引擎更可靠。
  // 两脚都是这条测试替我踩的：热点有 requiresEvidenceIds（乱挑会抛 evidence_required），
  // 而且不是每个场景一进去就有能查的东西 —— 所以从投影里挑 available 的那个。
  let state = createInitialState();
  const view = () => projectState(state);
  const seen = [];
  const feed = (next) => {
    const cue = cueForEvent(next.event, projectState(next.state));
    assert.ok(cue, `${next.event.type} 配不上声音`);
    assert.ok(SOUNDS[cue.name], `${next.event.type} 指向了不存在的音色 ${cue.name}`);
    seen.push(next.event.type);
    return next;
  };

  // 原地再访：服务端归成不加 version 的空动作。
  const here = view().currentLocationId;
  const again = feed(visitLocation(state, here));
  assert.equal(again.event.type, 'location_unchanged');
  assert.equal(cueForEvent(again.event, view()).name, 'nothing');

  const hotspot = view().locations
    .find((item) => item.id === here)
    .hotspots.find((item) => item.available && !item.inspected);
  assert.ok(hotspot, '开局这个场景就该有能查的热点');

  const found = feed(inspectHotspot(state, hotspot.id));
  state = found.state;
  assert.equal(found.event.type, 'hotspot_inspected');
  const cue = cueForEvent(found.event, view());
  assert.equal(cue.name, 'evidence');
  assert.ok(SCALE.includes(cue.shift));

  const revisit = feed(inspectHotspot(state, hotspot.id));
  assert.equal(revisit.event.type, 'hotspot_revisited');
  assert.equal(cueForEvent(revisit.event, view()).name, 'nothing');

  const moved = feed(visitLocation(state, 'print-room'));
  state = moved.state;
  assert.equal(moved.event.type, 'location_visited');
  assert.equal(cueForEvent(moved.event, view()).name, 'move');

  assert.deepEqual(seen, [
    'location_unchanged', 'hotspot_inspected', 'hotspot_revisited', 'location_visited',
  ]);
});



test('震动只给四个关口，翻证据不震', () => {
  assert.equal(vibrationFor('evidence'), null);
  assert.equal(vibrationFor('nothing'), null);
  assert.ok(vibrationFor('breakthrough'));
  assert.ok(vibrationFor('solved'));
  assert.ok(vibrationFor('rejected'));
});

test('静音时一个音频节点都不建', () => {
  const { Ctor, log } = fakeContext();
  const audio = createAudio({ muted: true, Ctor });
  assert.equal(audio.play('solved'), false);
  assert.equal(audio.notify({ event: { type: 'case_solved' }, state: {} }), false);
  assert.equal(log.tones, 0);
  audio.setMuted(false);
  assert.equal(audio.notify({ event: { type: 'case_solved' }, state: {} }), true);
  assert.equal(log.tones, 4);
  audio.dispose();
});

test('限流只压连点出来的那几条，结案和破案不许被吞', () => {
  const { Ctor, advance } = fakeContext();
  const audio = createAudio({ Ctor });
  assert.equal(audio.play('nothing'), true);
  assert.equal(audio.play('nothing'), false, `连点不该每次都响，间隔 ${THROTTLE.nothing}s`);
  advance(THROTTLE.nothing);
  assert.equal(audio.play('nothing'), true);
  assert.equal(THROTTLE.solved, undefined);
  assert.equal(THROTTLE.breakthrough, undefined);
  assert.equal(THROTTLE.evidence, undefined, '每件证据都该听见');
  audio.dispose();
});
