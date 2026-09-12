import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_STAGES } from '../src/game/progression.js';
import { ENCOUNTER_STAGES } from '../src/game/encounters.js';
import {
  CHOMP_MASS,
  MAX_PER_BATCH,
  PENTATONIC,
  SOUNDS,
  SOUND_NAMES,
  THROTTLE,
  comboShift,
  createAudio,
  createListener,
  cuesFor,
  eventsSince,
  listen,
  sequenceOf,
  stageShift,
  vibrationFor,
} from '../src/scene/audio.js';

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

/** 造一份只带音频关心的那几个字段的 state。 */
const makeState = (over = {}) => ({
  status: 'playing',
  eventCursor: 0,
  collectionEvents: [],
  stageUpEvents: [],
  actionEvents: [],
  encounter: { stage: 'awakening' },
  player: { combo: 1 },
  ...over,
});

/** 往队列里塞一条，id 按 simulation 的格式拼。 */
const push = (state, queue, event, seq) => {
  state.eventCursor = seq;
  state[queue].push({ ...event, id: `${event.type}-${seq}`, at: 0 });
  return state;
};

const names = (cues) => cues.map((cue) => cue.name);

test('每条音色都至少有一个振荡器或一层噪声，没有空条目', () => {
  assert.ok(SOUND_NAMES.length >= 10);
  for (const name of SOUND_NAMES) {
    const spec = SOUNDS[name];
    assert.ok((spec.tones?.length ?? 0) > 0 || spec.noise, `${name} 是个空音色`);
  }
});

test('队列是「至今为止的尾巴」，同一份 state 读两遍第二遍必须一声不出', () => {
  // 这是这个游戏跟其他几个最大的差别：effects 不是每帧新造的，是累积的环形队列。
  // 照直喂给播放器会把同一声重放到帧率那么多次。
  const state = makeState();
  push(state, 'collectionEvents', { type: 'orb', mass: 2 }, 1);
  const first = listen(createListener(), state);
  assert.deepEqual(names(first.cues), ['bite']);
  const second = listen(first.listener, state);
  assert.deepEqual(second.cues, [], '队列没变就不该再出声');
  assert.equal(second.listener.cursor, 1, '水位线不该倒退');
});

test('水位线只认真看见过的号：队列封顶挤掉的事件追不回来', () => {
  const state = makeState();
  for (let seq = 1; seq <= 3; seq += 1) push(state, 'collectionEvents', { type: 'orb', mass: 1 }, seq);
  const { events, cursor } = eventsSince(state, 1);
  assert.deepEqual(events.map((event) => event.seq), [2, 3], '1 号已经听过了');
  assert.equal(cursor, 3);
  // 三条队列合并之后按号排序，不按队列顺序 —— 否则同一帧里的因果会颠倒。
  const mixed = makeState();
  push(mixed, 'actionEvents', { type: 'structureBreak' }, 1);
  push(mixed, 'collectionEvents', { type: 'orb', mass: 1 }, 2);
  push(mixed, 'actionEvents', { type: 'anchorBreak' }, 3);
  assert.deepEqual(eventsSince(mixed, 0).events.map((event) => event.seq), [1, 2, 3]);
});

test('换局时 eventCursor 归零，水位线必须跟着作废', () => {
  // 不重置的话，新一局前几十个事件会被当成「听过了」，开局一片死寂。
  const fresh = makeState();
  push(fresh, 'collectionEvents', { type: 'orb', mass: 2 }, 1);
  const { events } = eventsSince(fresh, 40);
  assert.equal(events.length, 1, 'eventCursor 比水位线小就说明换局了');
  assert.equal(eventsSince(makeState(), 40).cursor, 0);
});

test('形态进阶和剧情推进撞在同一帧时只响一声，且是形态那一声', () => {
  // 七个剧情阈值里有六个跟形态阈值重合（0/12/32/60/90/130），照直 diff 会双响。
  const coinciding = ENCOUNTER_STAGES
    .filter((stage) => PLAYER_STAGES.some((form) => form.minMass === stage.minMass));
  assert.equal(coinciding.length, ENCOUNTER_STAGES.length - 1, '只有一档是剧情独有的');

  const state = makeState({ encounter: { stage: 'gravity' } });
  push(state, 'stageUpEvents', { type: 'stageUp', fromStage: 0, toStage: 1 }, 1);
  const cues = listen({ ...createListener(), stage: 'awakening' }, state).cues;
  assert.deepEqual(names(cues), ['stage']);
});

test('剧情独有的那一档（选甜味路线）必须出声：它是唯一要玩家做决定的节点', () => {
  const only = ENCOUNTER_STAGES
    .filter((stage) => !PLAYER_STAGES.some((form) => form.minMass === stage.minMass));
  assert.deepEqual(only.map((stage) => stage.id), ['crossroads']);

  const state = makeState({ encounter: { stage: 'crossroads' } });
  const cues = listen({ ...createListener(), stage: 'gravity' }, state).cues;
  assert.deepEqual(names(cues), ['story'], '没有形态进阶时剧情才出声');
});

test('第一帧不该把初始剧情阶段当成推进', () => {
  // listener 起始 stage 是 null，拿 null 去 diff 会在开局白响一声。
  const cues = listen(createListener(), makeState()).cues;
  assert.deepEqual(cues, []);

});

test('吞噬按最大那颗定音色，同帧吃五颗也只响一声', () => {
  const small = makeState();
  push(small, 'collectionEvents', { type: 'orb', mass: 2 }, 1);
  assert.deepEqual(names(cuesFor(eventsSince(small, 0).events, small, createListener())), ['bite']);

  const big = makeState();
  push(big, 'collectionEvents', { type: 'orb', mass: 1 }, 1);
  push(big, 'collectionEvents', { type: 'crystal', mass: CHOMP_MASS + 4 }, 2);
  push(big, 'collectionEvents', { type: 'orb', mass: 1 }, 3);
  const cues = cuesFor(eventsSince(big, 0).events, big, createListener());
  assert.deepEqual(names(cues), ['chomp'], '一片糖屑被吸进来时放五声只会糊成噪音');
});

test('连击的音高走五声音阶，不是半音阶：连吃二十颗不该像警笛', () => {
  assert.equal(comboShift(1), 0);
  assert.ok(comboShift(3) > comboShift(2));
  assert.equal(comboShift(99), PENTATONIC.at(-1), '封顶，否则高到听不见');
  assert.equal(comboShift(0), 0);
  for (const shift of PENTATONIC) assert.ok(shift % 12 !== 1 && shift % 12 !== 3, `${shift} 不在五声音阶上`);

  const state = makeState({ player: { combo: 4 } });
  push(state, 'collectionEvents', { type: 'orb', mass: 1 }, 1);
  const [cue] = cuesFor(eventsSince(state, 0).events, state, createListener());
  assert.equal(cue.shift, comboShift(4));
});

test('形态越高进阶声越亮，六个形态都在范围内', () => {
  assert.equal(stageShift(0), 0);
  assert.ok(stageShift(PLAYER_STAGES.length - 1) > stageShift(1));
  assert.equal(stageShift(99), stageShift(PLAYER_STAGES.length - 1), '越界不该越唱越高');
});

test('通关和跃迁独占这一批：结算那一刻不该还在咀嚼', () => {
  const won = makeState({ status: 'won' });
  push(won, 'collectionEvents', { type: 'orb', mass: 1 }, 1);
  assert.deepEqual(names(cuesFor(eventsSince(won, 0).events, won, createListener())), ['won']);

  const ascending = makeState({ status: 'ascending' });
  push(ascending, 'collectionEvents', { type: 'orb', mass: 1 }, 1);
  assert.deepEqual(names(cuesFor(eventsSince(ascending, 0).events, ascending, createListener())), ['ascend']);
  // 跃迁要好几秒，每帧都是 ascending —— 只有跳变那一帧出声。
  const held = listen({ ...createListener(), status: 'ascending' }, ascending);
  assert.deepEqual(names(held.cues), ['bite']);
});

test('一帧最多三声，优先给信息量大的', () => {
  const state = makeState();
  push(state, 'actionEvents', { type: 'stellarIgnition' }, 1);
  push(state, 'stageUpEvents', { type: 'stageUp', fromStage: 4, toStage: 5 }, 2);
  push(state, 'actionEvents', { type: 'stabilityLoss', amount: 4 }, 3);
  push(state, 'actionEvents', { type: 'anchorBreak' }, 4);
  push(state, 'actionEvents', { type: 'structureBreak' }, 5);
  push(state, 'collectionEvents', { type: 'orb', mass: 1 }, 6);
  const cues = cuesFor(eventsSince(state, 0).events, state, createListener());
  assert.equal(cues.length, MAX_PER_BATCH);
  assert.deepEqual(names(cues), ['ignite', 'stage', 'hurt']);
});

test('震动只给四个关口，吃糖不震', () => {
  assert.deepEqual(vibrationFor([{ name: 'bite' }]), null, '一局要吃上百颗');
  assert.ok(vibrationFor([{ name: 'hurt' }]));
  assert.ok(vibrationFor([{ name: 'won' }]).length > vibrationFor([{ name: 'stage' }]).length);
});

test('静音时一个音频节点都不建，但水位线照样往前走', () => {
  const { Ctor, log } = fakeContext();
  const audio = createAudio({ muted: true, Ctor });
  const state = makeState();
  push(state, 'collectionEvents', { type: 'orb', mass: 1 }, 1);
  assert.equal(audio.notify(state), 0);
  assert.equal(log.tones, 0);
  assert.equal(log.noises, 0);

  // 中途开声不该把攒下的事件一起放出来。
  audio.setMuted(false);
  assert.equal(audio.notify(state), 0, '这条已经过水位线了');
  push(state, 'collectionEvents', { type: 'orb', mass: 1 }, 2);
  assert.equal(audio.notify(state), 1);
  assert.ok(log.tones > 0);
});

test('限流跨帧才成立：连着吃糖不该每帧都出一声', () => {
  const { Ctor, log, advance } = fakeContext();
  const audio = createAudio({ Ctor });
  const state = makeState();
  let seq = 0;
  const eat = () => {
    seq += 1;
    push(state, 'collectionEvents', { type: 'orb', mass: 1 }, seq);
    return audio.notify(state);
  };
  assert.equal(eat(), 1);
  advance(0.016);
  assert.equal(eat(), 0, `隔了一帧还不到 ${THROTTLE.bite}s`);
  advance(THROTTLE.bite);
  assert.equal(eat(), 1);
  audio.dispose();
  assert.ok(log.tones >= 2);
});

test('id 里取不出号时当 0：宁可漏放一声也不要重放', () => {
  assert.equal(sequenceOf('orb-12'), 12);
  assert.equal(sequenceOf('stageUp-3'), 3);
  assert.equal(sequenceOf(undefined), 0);
  assert.equal(sequenceOf('weird'), 0);
});
