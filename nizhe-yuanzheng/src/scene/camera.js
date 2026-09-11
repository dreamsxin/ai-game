// 跟随相机。纯数学，不引用 Three.js，所以镜头行为可以被测试钉住。
// 相机只跟车的航向，不跟俯仰和横滚——车翻了镜头还是端着的，否则根本看不清怎么回事。
import { add, clamp, lerp, vec, wrapAngle, yawOf } from '../game/vec.js';

export const CAMERA_MODES = ['chase', 'high', 'cockpit'];

const RIGS = {
  chase: { distance: 8.2, height: 3.4, look: 1.2, fov: 58, follow: 3.4 },
  high: { distance: 16, height: 10, look: 2, fov: 52, follow: 2.2 },
  cockpit: { distance: -0.4, height: 1.55, look: 1.3, fov: 72, follow: 9 },
};

export const rigOf = (mode) => RIGS[mode] ?? RIGS.chase;

export const createCameraState = (yaw = 0) => ({ yaw, position: vec(), target: vec(), distance: RIGS.chase.distance });

/**
 * 推进一帧相机。倒车时镜头稍微拉近拉低，视野里能多留一点车尾。
 * 距离按车速拉远：跑得快时看得更远，慢下来贴得更紧。
 */
export function advanceCamera(camera, vehicle, mode, dt, terrainY = -Infinity) {
  const rig = rigOf(mode);
  const targetYaw = yawOf(vehicle.quaternion);
  // 航向插值走最短弧，绕过 ±π 不会甩一圈。
  const blend = clamp(rig.follow * dt, 0, 1);
  camera.yaw += wrapAngle(targetYaw - camera.yaw) * blend;

  const speedPull = clamp(Math.abs(vehicle.forwardSpeed) / 16, 0, 1);
  const wanted = rig.distance * (1 + speedPull * 0.28);
  camera.distance = lerp(camera.distance, wanted, clamp(2.5 * dt, 0, 1));

  const back = { x: -Math.sin(camera.yaw), z: Math.cos(camera.yaw) };
  const focus = add(vehicle.position, vec(0, rig.look, 0));
  const desired = {
    x: focus.x + back.x * camera.distance,
    y: vehicle.position.y + rig.height + speedPull * 0.8,
    z: focus.z + back.z * camera.distance,
  };
  // 镜头位置本身也插值，压掉悬挂抖动带来的高频晃动。
  const smooth = clamp(9 * dt, 0, 1);
  camera.position = {
    x: lerp(camera.position.x, desired.x, smooth),
    y: lerp(camera.position.y, desired.y, smooth),
    z: lerp(camera.position.z, desired.z, smooth),
  };
  // 别钻到地里去。地形高度由调用方采样后传进来。
  camera.position.y = Math.max(camera.position.y, terrainY + 1.2);
  camera.target = {
    x: lerp(camera.target.x, focus.x, smooth),
    y: lerp(camera.target.y, focus.y, smooth),
    z: lerp(camera.target.z, focus.z, smooth),
  };
  camera.fov = rig.fov;
  return camera;
}

/** 小地图上的一个点：世界坐标压成 0..1 的图面坐标。 */
export const mapPoint = (x, z, size) => ({ u: clamp((x + size / 2) / size, 0, 1), v: clamp((z + size / 2) / size, 0, 1) });

/** 罗盘指针角度（度）。HUD 用它转箭头指向目标。 */
export function bearingTo(vehicle, target) {
  const want = Math.atan2(target.x - vehicle.position.x, -(target.z - vehicle.position.z));
  return (wrapAngle(want - yawOf(vehicle.quaternion)) * 180) / Math.PI;
}
