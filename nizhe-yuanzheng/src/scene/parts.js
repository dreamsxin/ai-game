// 卡车与场景道具的几何描述。返回的是普通数据（尺寸、位置、颜色），
// 不引用 Three.js——这样车长什么样可以被单元测试钉住，也方便换渲染实现。
// 坐标是车身坐标系：x 右、y 上、z 后（车头朝 -z），原点在重心。
export const PAINT = {
  scout: { body: 0xc4632c, cab: 0xd67a3e, frame: 0x2f3237 },
  hauler: { body: 0x3f6b4a, cab: 0x4b7d57, frame: 0x2b2e31 },
  heavy: { body: 0xb8912f, cab: 0xc9a141, frame: 0x33363a },
};

export const paintOf = (id) => PAINT[id] ?? PAINT.hauler;

const box = (name, size, position, color) => ({ name, size, position, color });

/**
 * 车身部件。比例全部从 spec.body 推出来，所以三台车共用一套建模逻辑，
 * 换车只是换尺寸——不需要为每台车手搓模型。
 */
export function truckParts(spec) {
  const { length: len, width, height } = spec.body;
  const paint = paintOf(spec.id);
  const floor = -spec.comY + 0.42;
  const cabLength = len * 0.34;
  const bedLength = len * 0.46;
  const cabZ = -len * 0.5 + cabLength * 0.5 + len * 0.12;
  const bedZ = len * 0.5 - bedLength * 0.5 - len * 0.04;

  return [
    // 大梁：从头贯到尾的一根，越野车看着「有底子」全靠它。
    box('frame', { x: width * 0.62, y: height * 0.16, z: len * 0.94 }, { x: 0, y: floor, z: 0 }, paint.frame),
    box('hood', { x: width * 0.84, y: height * 0.3, z: len * 0.2 }, { x: 0, y: floor + height * 0.24, z: -len * 0.38 }, paint.body),
    box('cab', { x: width * 0.92, y: height * 0.62, z: cabLength }, { x: 0, y: floor + height * 0.48, z: cabZ }, paint.cab),
    // 挡风玻璃只是块深色薄板，贴在驾驶室前脸上。
    box('glass', { x: width * 0.76, y: height * 0.24, z: 0.08 }, { x: 0, y: floor + height * 0.62, z: cabZ - cabLength * 0.5 }, 0x18242c),
    box('bed', { x: width * 0.94, y: height * 0.2, z: bedLength }, { x: 0, y: floor + height * 0.24, z: bedZ }, paint.frame),
    box('bedLeft', { x: width * 0.06, y: height * 0.3, z: bedLength }, { x: -width * 0.44, y: floor + height * 0.44, z: bedZ }, paint.body),
    box('bedRight', { x: width * 0.06, y: height * 0.3, z: bedLength }, { x: width * 0.44, y: floor + height * 0.44, z: bedZ }, paint.body),
    box('bedFront', { x: width * 0.94, y: height * 0.34, z: 0.1 }, { x: 0, y: floor + height * 0.46, z: bedZ - bedLength * 0.5 }, paint.body),
    box('bumper', { x: width * 0.96, y: height * 0.14, z: 0.18 }, { x: 0, y: floor + height * 0.06, z: -len * 0.49 }, paint.frame),
    // 排气管高度就是涉水极限，做出来玩家才有直观参照。
    box('snorkel', { x: 0.14, y: spec.snorkel, z: 0.14 }, { x: width * 0.42, y: floor + spec.snorkel * 0.5, z: cabZ }, 0x4a4f55),
    box('lightLeft', { x: width * 0.16, y: height * 0.1, z: 0.06 }, { x: -width * 0.3, y: floor + height * 0.22, z: -len * 0.485 }, 0xffe9b0),
    box('lightRight', { x: width * 0.16, y: height * 0.1, z: 0.06 }, { x: width * 0.3, y: floor + height * 0.22, z: -len * 0.485 }, 0xffe9b0),
  ];
}

/** 车厢里每件货的落位，由 cargo.js 的 cargoLayout 算好后直接用。 */
export const cargoBox = (item) => box('cargo', item.size, { x: item.x, y: item.y, z: item.z }, item.color);

/** 场地标记（货场 / 交付点 / 加油点）的颜色。 */
export const SITE_COLORS = {
  depot: 0x4ea3ff,
  site: 0x63d471,
  refuel: 0xffc247,
};
