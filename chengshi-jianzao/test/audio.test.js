import test from 'node:test';
import assert from 'node:assert/strict';
import { ROAD, TOOL_BULLDOZE } from '../src/game/rules.js';
import {
  SOUNDS,
  SOUND_NAMES,
  VIBRATION,
  createAudio,
  monthSound,
  placeSound,
  soundsFor,
  vibrationFor,
  winSound,
} from '../src/scene/audio.js';

// 这一关没有 effects 数组，音效由「前后两个状态」派生，所以测试也拿两个状态说事。
const base = (over = {}) => ({
  levelIndex: 0,
  status: 'playing',
  stars: 0,
  month: 0,
  revision: 0,
  tool: ROAD,
  notice: null,
  report: { powered: true, demand: 0, supply: 0, growth: 0, net: 0 },
  ...over,
});


test('每个音色都排得出可播的音，且时长和音量都是正数', () => {
  for (const name of SOUND_NAMES) {
    const spec = SOUNDS[name];
    const parts = [...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])];
    assert.ok(parts.length > 0, `${name} 一条音都没有`);
    for (const part of parts) {
      assert.ok(part.dur > 0, `${name} 的时长不是正数`);
      assert.ok(part.gain > 0 && part.gain <= 0.4, `${name} 的音量 ${part.gain} 超出安全区间`);
    }
  }
});

test('落子声按工具分：铺路、盖房、拆迁三种', () => {
  assert.equal(placeSound(ROAD), 'road');
  assert.equal(placeSound('house'), 'build');
  assert.equal(placeSound('power'), 'build');
  assert.equal(placeSound(TOOL_BULLDOZE), 'bulldoze');
  for (const tool of [ROAD, 'house', TOOL_BULLDOZE]) assert.ok(SOUNDS[placeSound(tool)]);
});

test('铺路声比盖房轻：拖着画路一秒能响十几次', () => {
  const peak = (spec) => Math.max(...[...(spec.tones ?? []), ...(spec.noise ? [spec.noise] : [])].map((p) => p.gain));
  assert.ok(peak(SOUNDS.road) < peak(SOUNDS.build));
  // 月历那一点更是全表最轻的。
  assert.ok(peak(SOUNDS.month) < peak(SOUNDS.road));
});

test('盖上东西出落子声，被拒出提示声，两者分得开', () => {
  const prev = base({ tool: 'house' });
  assert.deepEqual(soundsFor(prev, base({ tool: 'house', revision: 1 })), ['build']);
  assert.deepEqual(soundsFor(prev, base({ tool: 'house', notice: '钱不够，还差 20' })), ['reject']);
});

test('拆迁用的是当时手上的工具，而不是拆完之后的', () => {
  const prev = base({ tool: TOOL_BULLDOZE });
  assert.deepEqual(soundsFor(prev, base({ tool: TOOL_BULLDOZE, revision: 1 })), ['bulldoze']);
});

test('同一句提示重复撞上不再出声，拖着画路不该一直响「钱不够」', () => {
  const prev = base({ notice: '钱不够，还差 20' });
  assert.deepEqual(soundsFor(prev, base({ notice: '钱不够，还差 20' })), []);
});

test('清掉提示不出声：那只是把字擦掉，不是一件新事', () => {
  const prev = base({ notice: '本月赤字 12' });
  assert.deepEqual(soundsFor(prev, base({ notice: null })), []);
});

test('月报按严重程度选一条，和 monthLine 念的是同一条优先级', () => {
  assert.equal(monthSound({ powered: false, demand: 4, growth: 3, net: 5 }), 'blackout');
  assert.equal(monthSound({ powered: true, growth: -2, net: 5 }), 'exodus');
  assert.equal(monthSound({ powered: true, growth: 0, net: -3 }), 'deficit');
  assert.equal(monthSound({ powered: true, growth: 5, net: 5 }), 'growth');
  assert.equal(monthSound({ powered: true, growth: 0, net: 0 }), null);
  // 一格电都不用的时候不算跳闸。
  assert.equal(monthSound({ powered: false, demand: 0, growth: 0, net: 0 }), null);
});

test('走过一个月先响月历，再补一条月报；平淡的一个月只有月历', () => {
  const prev = base();
  const quiet = base({ month: 1, revision: 1 });
  assert.deepEqual(soundsFor(prev, quiet), ['month']);
  const bad = base({ month: 1, revision: 1, report: { powered: false, demand: 6, supply: 0, growth: 0, net: -2 } });
  assert.deepEqual(soundsFor(prev, bad), ['month', 'blackout']);
});

test('结算独占这一批：达标按星数给和弦，破产给下坠', () => {
  const prev = base();
  assert.deepEqual(soundsFor(prev, base({ status: 'won', stars: 3, month: 1, revision: 1 })), ['win3']);
  assert.deepEqual(soundsFor(prev, base({ status: 'lost', month: 1, revision: 1 })), ['lost']);
});

test('通关和弦按星数选，越界的星数也落在三条之内', () => {
  assert.equal(winSound(1), 'win1');
  assert.equal(winSound(3), 'win3');
  assert.equal(winSound(0), 'win1', '星数缺失时按一星给，不该静默');
  assert.equal(winSound(9), 'win3');
  for (const stars of [0, 1, 2, 3, 9]) assert.ok(SOUNDS[winSound(stars)]);
});

test('换关或重开不会把上一关的结算音再放一遍', () => {
  const won = base({ status: 'won', stars: 3, month: 20, revision: 40 });
  // 换关：关号变了。
  assert.deepEqual(soundsFor(won, base({ levelIndex: 1 })), []);
  // 重开同一关：关号没变，但月份和 revision 都归零了。
  assert.deepEqual(soundsFor(won, base()), []);
  const lost = base({ status: 'lost', month: 30, revision: 60 });
  assert.deepEqual(soundsFor(lost, base()), []);
});


test('同一个对象或缺参数时一声不出', () => {
  const state = base();
  assert.deepEqual(soundsFor(state, state), []);
  assert.deepEqual(soundsFor(null, state), []);
  assert.deepEqual(soundsFor(state, null), []);
});

test('触感只在被拒、跳闸、结算给，每盖一格都震会变成噪音', () => {
  const prev = base({ tool: 'house' });
  assert.equal(vibrationFor(prev, base({ tool: 'house', revision: 1 })), null);
  assert.equal(vibrationFor(prev, base({ tool: 'house', notice: '钱不够' })), VIBRATION.reject);
  const blackout = base({ month: 1, revision: 1, report: { powered: false, demand: 6, supply: 0, growth: 0, net: 0 } });
  assert.equal(vibrationFor(base(), blackout), VIBRATION.blackout);
  assert.equal(vibrationFor(base(), base({ status: 'won', stars: 2, month: 1 })), VIBRATION.win);
  assert.equal(vibrationFor(base(), base({ status: 'lost', month: 1 })), VIBRATION.lost);
});

// 用一个假的 AudioContext 验证引擎接线：真浏览器不在 node --test 里，
// 但「静音时一个节点都不建」这条正是最容易写错的地方。
const fakeAudioContext = () => {
  const log = { starts: [], sources: [], resumed: 0, suspended: 0, closed: 0, instances: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (target) => target });
  class Fake {
    constructor() {
      this.sampleRate = 48000;
      this.currentTime = 10;
      this.state = 'suspended';
      this.destination = node();
      log.instances += 1;
    }

    createGain() {
      return { ...node(), gain: { value: 1, ...param() } };
    }

    createOscillator() {
      return {
        ...node(),
        type: 'sine',
        frequency: param(),
        start(at) {
          log.starts.push(at);
        },
        stop() {},
      };
    }

    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }

    createBufferSource() {
      const source = {
        ...node(),
        buffer: null,
        start(at) {
          log.starts.push(at);
        },
        stop() {},
      };
      log.sources.push(source);
      return source;
    }

    createBiquadFilter() {
      return { ...node(), type: 'lowpass', frequency: { value: 0 } };
    }

    resume() {
      log.resumed += 1;
      this.state = 'running';
      return Promise.resolve();
    }

    suspend() {
      log.suspended += 1;
      return Promise.resolve();
    }

    close() {
      log.closed += 1;
      return Promise.resolve();
    }
  }
  return { Fake, log };
};

test('静音开局一个音频节点都不建，取消静音后才起 AudioContext', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ muted: true, Ctor: Fake });
  assert.equal(audio.muted, true);
  assert.equal(audio.play('build'), false);
  assert.equal(log.instances, 0, '静音时不该建出 AudioContext');
  audio.setMuted(false);
  assert.equal(audio.play('build'), true);
  assert.equal(log.instances, 1);
});

test('月历那一点和后面的月报错开排，两声挤在一起会听成一声', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  const bad = base({ month: 1, revision: 1, report: { powered: false, demand: 6, supply: 0, growth: 0, net: 0 } });
  assert.equal(audio.notify(base(), bad), 2);
  const sorted = [...log.starts].sort((a, b) => a - b);
  assert.deepEqual(log.starts, sorted);
  assert.ok(log.starts.at(-1) > log.starts[0], '第二声必须排在第一声之后');
});

test('只有噪声的音色也能播，不会因为没有 tones 就哑掉', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('road'), true);
  assert.equal(log.sources.length, 1);
});

test('挂起的 context 每次出声前都 resume，否则切后台回来就一路静默', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('build');
  assert.equal(log.resumed, 1);
});

test('表里没有的音名被安静地忽略，不抛错打断这一局', () => {
  const { Fake } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  assert.equal(audio.play('不存在的音'), false);
});

test('没有 AudioContext 的环境里照样能玩，只是不出声', () => {
  const audio = createAudio({ Ctor: null });
  assert.equal(audio.play('build'), false);
  assert.doesNotThrow(() => audio.notify(base(), base({ revision: 1 })));
  assert.doesNotThrow(() => audio.dispose());
});

test('静音会挂起已建好的 context，dispose 会关掉它', () => {
  const { Fake, log } = fakeAudioContext();
  const audio = createAudio({ Ctor: Fake });
  audio.play('build');
  audio.setMuted(true);
  assert.equal(log.suspended, 1);
  audio.dispose();
  assert.equal(log.closed, 1);
  audio.dispose();
  assert.equal(log.closed, 1, 'dispose 幂等，重复调用不该再关一次');
});

