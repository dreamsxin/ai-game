import test from 'node:test';
import assert from 'node:assert/strict';
import { AXIS_COL, AXIS_PILLAR, AXIS_ROW, DOOR_D, DOOR_E, DOOR_N, DOOR_S, DOOR_U, DOOR_W } from '../src/game/rules.js';
import {
  MAX_PER_BATCH,
  SOUNDS,
  SOUND_NAMES,
  THROTTLE,
  VIBRATION,
  createAudio,
  orderShift,
  soundsFor,
  vibrationFor,
} from '../src/scene/audio.js';
import { buildTileGeometries } from '../src/scene/createScene.js';

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

test('推柱和推行列出不同的声音：那条多出来的轴要听得出来', () => {
  const row = soundsFor([{ type: 'shift', axis: AXIS_ROW }]);
  const col = soundsFor([{ type: 'shift', axis: AXIS_COL }]);
  const pillar = soundsFor([{ type: 'shift', axis: AXIS_PILLAR }]);
  assert.equal(row[0].name, 'slide');
  assert.equal(col[0].name, 'slide', '行和列同属平面内推移，共用一声');
  assert.equal(pillar[0].name, 'lift', '柱必须是另一声');
});

test('登顶那一声独占这一批，音高跟着阶数升', () => {
  const picks = soundsFor([
    { type: 'shift', axis: AXIS_ROW },
    { type: 'walk', path: [] },
    { type: 'cleared', order: 6 },
  ]);
  assert.equal(picks.length, 1);
  assert.equal(picks[0].name, 'cleared');
  assert.equal(picks[0].shift, orderShift(6));
  assert.equal(orderShift(3), 0, '三阶原调');
  assert.ok(orderShift(6) > orderShift(4));
  assert.equal(orderShift(99), orderShift(6), '六阶封顶，音高也封顶');
});

test('通了路排在推移声前面，一批最多三声', () => {
  const picks = soundsFor([
    { type: 'shift', axis: AXIS_ROW },
    { type: 'open' },
    { type: 'walk', path: [] },
    { type: 'select' },
  ]);
  assert.equal(picks[0].name, 'open', '路通了最该被听见');
  assert.ok(picks.length <= MAX_PER_BATCH);
});

test('同名只出一声，空 effects 一声都不出', () => {
  assert.deepEqual(soundsFor([]), []);
  const twice = soundsFor([{ type: 'shift', axis: AXIS_ROW }, { type: 'shift', axis: AXIS_ROW }]);
  assert.equal(twice.filter((pick) => pick.name === 'slide').length, 1);
});

test('触感只给四个关口，取信息量最大的那条', () => {
  assert.equal(vibrationFor([{ type: 'cleared' }, { type: 'open' }]), VIBRATION.cleared);
  assert.equal(vibrationFor([{ type: 'open' }, { type: 'tower' }]), VIBRATION.tower);
  assert.equal(vibrationFor([{ type: 'open' }]), VIBRATION.open);
  assert.equal(vibrationFor([{ type: 'blocked' }]), VIBRATION.blocked);
  assert.equal(vibrationFor([{ type: 'shift' }]), null, '推移全程都震手会麻');
  assert.equal(vibrationFor([]), null);
});

test('静音时一个音频节点都不建', () => {
  const { Ctor, log } = fakeContext();
  const audio = createAudio({ muted: true, Ctor });
  assert.equal(audio.notify([{ type: 'open' }]), 0);
  assert.equal(log.tones, 0);
  assert.equal(log.noises, 0);
});

test('出声之后切静音会挂起，切回来能再出声', () => {
  const { Ctor, log } = fakeContext();
  const audio = createAudio({ Ctor });
  assert.equal(audio.notify([{ type: 'open' }]), 1);
  assert.ok(log.tones > 0);
  audio.setMuted(true);
  const before = log.tones;
  audio.notify([{ type: 'open' }]);
  assert.equal(log.tones, before, '静音期间不该再建节点');
  audio.setMuted(false);
  audio.notify([{ type: 'tower' }]);
  assert.ok(log.tones > before);
  audio.dispose();
});

test('限流跨帧才成立：同一声在最小间隔内不重放，拨过时间就放得出来', () => {
  const { Ctor, advance } = fakeContext();
  const audio = createAudio({ Ctor });
  assert.equal(audio.play('slide'), true);
  assert.equal(audio.play('slide'), false, `间隔不到 ${THROTTLE.slide}s`);
  advance(THROTTLE.slide + 0.01);
  assert.equal(audio.play('slide'), true);
  // 没挂限流的音色不受影响。
  assert.equal(audio.play('cleared'), true);
  assert.equal(audio.play('cleared'), true);
});

test('没有的音色名安静地返回 false，不抛', () => {
  const { Ctor } = fakeContext();
  const audio = createAudio({ Ctor });
  assert.equal(audio.play('不存在的音'), false);
});

/** 找出这份几何体里出现过的顶点色，去重后返回 "r,g,b" 的集合。 */
const paletteOf = (geometry) => {
  const color = geometry.getAttribute('color');
  const seen = new Set();
  for (let i = 0; i < color.count; i += 1) {
    seen.add([color.getX(i), color.getY(i), color.getZ(i)].map((v) => v.toFixed(2)).join(','));
  }
  return seen;
};

test('六十四个门掩码变体都能拼出几何体 —— 一错就是满屏空砖', () => {
  const cache = buildTileGeometries();
  assert.equal(cache.length, 64);
  for (let mask = 0; mask < 64; mask += 1) {
    const geometry = cache[mask];
    assert.ok(geometry, `掩码 ${mask} 没拼出几何体`);
    const position = geometry.getAttribute('position');
    assert.ok(position && position.count > 0, `掩码 ${mask} 没有顶点`);
    const color = geometry.getAttribute('color');
    assert.ok(color, `掩码 ${mask} 没有顶点色，状态染色会把路条和砖体染成一样`);
    assert.equal(color.count, position.count);
  }
});

test('一扇水平门换一面墙：门再多方块数也不变', () => {
  const cache = buildTileGeometries();
  const base = cache[0].getAttribute('position').count;
  for (const mask of [DOOR_E, DOOR_E | DOOR_W, DOOR_N | DOOR_E | DOOR_S | DOOR_W]) {
    assert.equal(
      cache[mask].getAttribute('position').count,
      base,
      `掩码 ${mask}：开一扇门就该少砌一面墙、多铺一条路条，加减相抵`,
    );
  }
});

test('竖向的门另加几何体：朝下一圈亮框、朝上四角立柱', () => {
  const cache = buildTileGeometries();
  const base = cache[0].getAttribute('position').count;
  assert.ok(cache[DOOR_D].getAttribute('position').count > base, '朝下要多一圈亮框');
  assert.ok(cache[DOOR_U].getAttribute('position').count > base, '朝上要多四根角柱');
});

test('顶点色分档：砖体暗、路条亮、竖向连接偏绿', () => {
  const cache = buildTileGeometries();
  const BODY = '0.52,0.57,0.74';
  const ROUTE = '1.00,1.00,1.00';
  const VERTICAL = '0.72,1.00,0.80';

  // 没有门的砖也有砖心节点，所以砖体色和路条色都在。
  assert.deepEqual([...paletteOf(cache[0])].sort(), [ROUTE, BODY].sort(), '砖体 + 砖心节点两档');
  // 开一扇水平门不引入新颜色，只是把墙换成路条。
  assert.deepEqual([...paletteOf(cache[DOOR_E])].sort(), [ROUTE, BODY].sort());

  // 只有竖向门时，整格**没有**白色横向路线 —— 这正是「唯一出路在上面」该有的读法，
  // 砖心节点也跟着变绿。别指望这种砖上出现路条色。
  const onlyUp = paletteOf(cache[DOOR_U]);
  assert.deepEqual([...onlyUp].sort(), [VERTICAL, BODY].sort(), '只能往上走的砖不该有白路条');
  assert.deepEqual([...paletteOf(cache[DOOR_D])].sort(), [VERTICAL, BODY].sort());

  // 水平和竖向都有时才三档齐全 —— 这时候两种连接必须能分得开。
  const both = paletteOf(cache[DOOR_U | DOOR_E]);
  assert.equal(both.size, 3);
  assert.ok(both.has(ROUTE), '水平路条是全亮的白');
  assert.ok(both.has(VERTICAL), '竖向是偏绿的');
});


