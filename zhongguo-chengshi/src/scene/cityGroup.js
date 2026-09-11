// 把城市数据装配成一个 THREE.Group。所有同类体块共用一个 InstancedMesh，
// 路面/桥面/水巷这类带状物合并成整块网格，整座城市控制在十几个 draw call 内。
import * as THREE from 'three';
import { Instances, ribbonGeometry, terrainMesh, waterMesh, backdropMesh } from './primitives.js';

import { addBuilding, addRoof } from './buildingShapes.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PYRAMID = new THREE.ConeGeometry(0.5, 1, 4);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const BLOB = new THREE.IcosahedronGeometry(0.5, 0);

function makeMaterials(palette) {
  return {
    solid: new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.05 }),
    glass: new THREE.MeshStandardMaterial({
      roughness: 0.16, metalness: 0.62, emissive: new THREE.Color(palette.glass), emissiveIntensity: 0,
    }),
    roof: new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.02, flatShading: true }),
    pillar: new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.08 }),
    sign: new THREE.MeshBasicMaterial({ toneMapped: false }),
    ribbon: new THREE.MeshLambertMaterial({ vertexColors: true }),
    trunk: new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0x5a4632 }),
    leaf: new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
    cable: new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }),
  };
}

/** 缆索、斜拉索这类细线单独合成一条 LineSegments */
function lineGeometry(segments) {
  const positions = [];
  const colors = [];
  const c = new THREE.Color();
  for (const seg of segments) {
    c.set(seg.color);
    for (let i = 0; i < seg.pts.length - 1; i += 1) {
      positions.push(...seg.pts[i], ...seg.pts[i + 1]);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

/** 沿折线铺一串踏步方块，山城步道就是这么来的 */
function addStairs(ctx, flights, palette) {
  for (const flight of flights) {
    for (let i = 0; i < flight.pts.length - 1; i += 1) {
      const [ax, ay, az] = flight.pts[i];
      const [bx, by, bz] = flight.pts[i + 1];
      const rot = Math.atan2(bz - az, bx - ax);
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(2, Math.round(len / 3.2));
      for (let s = 0; s < steps; s += 1) {
        const t = s / steps;
        const y = ay + (by - ay) * t;
        const nextY = ay + (by - ay) * ((s + 1) / steps);
        ctx.solid.add(
          ax + (bx - ax) * t, Math.min(y, nextY) - 0.6, az + (bz - az) * t,
          len / steps + 0.6, Math.abs(y - nextY) + 1.2, flight.width, rot, palette.rock,
        );
      }
    }
  }
}

/** 城墙：墙体 + 垛口 + 城门楼 + 角楼，西安的轮廓靠这一套 */
function addCityWall(ctx, wall, terrain, palette, ribbons) {
  for (const seg of wall.segments) {
    const [ax, az] = seg.a;
    const [bx, bz] = seg.b;
    const rot = Math.atan2(bz - az, bx - ax);
    const len = Math.hypot(bx - ax, bz - az);
    const pieces = Math.max(6, Math.round(len / 26));
    for (let i = 0; i < pieces; i += 1) {
      const t = (i + 0.5) / pieces;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const base = terrain.heightAt(x, z) - 1;
      ctx.solid.add(x, base, z, len / pieces + 1, seg.height, seg.thickness, rot, palette.buildings[2]);
      // 垛口：一段墙上排几个小方块，远看就是锯齿状的城墙顶
      const merlons = 3;
      for (let m = 0; m < merlons; m += 1) {
        const mt = (i + (m + 0.5) / merlons) / pieces;
        ctx.solid.add(
          ax + (bx - ax) * mt, base + seg.height, az + (bz - az) * mt,
          (len / pieces) / merlons * 0.62, 2.2, seg.thickness * 0.34, rot, palette.buildings[2],
        );
      }
    }
    ribbons.push({
      pts: [[ax, terrain.heightAt(ax, az) - 1 + seg.height, az], [bx, terrain.heightAt(bx, bz) - 1 + seg.height, bz]],
      width: seg.thickness * 0.8,
      color: palette.rock,
      lift: 0.1,
    });
  }
  for (const gate of wall.gates) {
    ctx.solid.add(gate.x, gate.base - 1, gate.z, gate.width, wall.height + 2, gate.depth, gate.rot, palette.buildings[2]);
    let y = gate.base - 1 + wall.height + 2;
    for (let tier = 0; tier < 2; tier += 1) {
      const scale = 1 - tier * 0.22;
      ctx.solid.add(gate.x, y, gate.z, gate.width * 0.78 * scale, 7, gate.depth * 0.8 * scale, gate.rot, palette.accent);
      addRoof(ctx, gate.x, y + 7, gate.z, gate.width * 0.95 * scale, 5, gate.depth * 1.1 * scale, gate.rot, palette.roof);
      y += 10.5;
    }
  }
  for (const tower of wall.towers) {
    ctx.solid.add(tower.x, tower.base - 1, tower.z, tower.width, tower.height, tower.width, 0, palette.buildings[2]);
    addRoof(ctx, tower.x, tower.base - 1 + tower.height, tower.z, tower.width * 1.2, 6, tower.width * 1.2, 0, palette.roof);
  }
}

/** 高架、匝道、桥面下方补柱子，不然桥会像浮在空中 */
function addSupports(ctx, pts, terrain, radius, color, every = 3) {
  for (let i = 1; i < pts.length - 1; i += every) {
    const [x, y, z] = pts[i];
    const ground = terrain.heightAt(x, z);
    if (y - ground < 4) continue;
    ctx.pillars.add(x, ground - 1, z, radius * 2, y - ground - 0.6, radius * 2, 0, color);
  }
}

export function buildCityGroup(city, params) {
  const palette = city.style.palette;
  const { terrain } = city;
  const mats = makeMaterials(palette);
  const group = new THREE.Group();
  const ctx = {
    solid: new Instances(BOX, mats.solid),
    glass: new Instances(BOX, mats.glass),
    roofs: new Instances(PYRAMID, mats.roof),
    pillars: new Instances(CYL, mats.pillar),
    signs: new Instances(BOX, mats.sign),
    trunks: new Instances(CYL, mats.trunk),
    leaves: new Instances(BLOB, mats.leaf),
    palette,
    style: city.style,
    // 招牌按风格固定生成，霓虹强度滑块只改材质亮度，这样拖滑块不用重建几何
    neon: 1,
  };

  const ribbons = [];
  const cables = [];
  const animated = { trains: [], cabins: [] };
  const lift3d = (pts) => pts.map(([x, z]) => [x, terrain.heightAt(x, z), z]);
  const onGround = (x, z) => terrain.heightAt(x, z);

  // 高架的路面比地面路稍亮，下面再垫一条更暗更宽的梁。
  // 少了这条梁，桥面从侧面看就是一张纸片，整座城会像贴了几根白条。
  const deckColor = new THREE.Color(palette.roadElevated).lerp(new THREE.Color(palette.road), 0.5).getHex();
  const girderColor = new THREE.Color(palette.rock).multiplyScalar(0.62).getHex();
  const addDeck = (pts, width, color = deckColor) => {
    ribbons.push({ pts, width, color });
    ribbons.push({ pts, width: width * 1.16, color: girderColor, lift: -1.6 });
  };


  group.add(terrainMesh(city, palette));
  group.add(backdropMesh(city, palette));
  group.add(waterMesh(city, palette));


  if (params.showRoads) {
    for (const line of city.roadLines) {
      ribbons.push({
        pts: lift3d(line.pts), width: city.widths[line.level], color: palette.road,
        follow: onGround, lift: 0.55,
      });
    }
  }


  for (const b of city.buildings) addBuilding(ctx, b);

  // 水巷：河道已经刻进地形，这里只铺水面和两侧石岸
  for (const canal of city.canals) {
    const water = canal.pts.map(([x, z], i) => [x, canal.surface[i], z]);
    ribbons.push({ pts: water, width: canal.width, color: palette.water });

    for (const side of [1, -1]) {
      const bank = [];
      for (let i = 0; i < canal.pts.length; i += 1) {
        const [x, z] = canal.pts[i];
        const prev = canal.pts[Math.max(0, i - 1)];
        const next = canal.pts[Math.min(canal.pts.length - 1, i + 1)];
        const tx = next[0] - prev[0];
        const tz = next[1] - prev[1];
        const len = Math.hypot(tx, tz) || 1;
        const ox = (-tz / len) * (canal.width / 2 + 2.4) * side;
        const oz = (tx / len) * (canal.width / 2 + 2.4) * side;
        bank.push([x + ox, terrain.heightAt(x + ox, z + oz), z + oz]);
      }
      ribbons.push({ pts: bank, width: 5, color: palette.rock, follow: onGround, lift: 0.7 });
    }
  }


  // 层叠立交：每层桥面一条带子，匝道螺旋上升，底下全是柱子
  for (const ic of city.interchanges) {
    for (const ramp of ic.ramps) {
      addDeck(ramp.pts, ramp.width);
      addSupports(ctx, ramp.pts, terrain, ramp.width * 0.14, palette.rock, ramp.kind === 'deck' ? 4 : 5);
    }
  }

  for (const via of city.viaducts) {
    addDeck(via.pts, via.width);
    addSupports(ctx, via.pts, terrain, 2.2, palette.rock, 3);
  }

  // 桥：斜拉桥出塔出索，拱桥只有起拱的桥面
  for (const bridge of city.bridges) {
    addDeck(bridge.pts, bridge.width);

    for (const tower of bridge.towers) {
      ctx.solid.add(tower.x, tower.base - 4, tower.z, 6, tower.height, 6, 0, palette.buildings[2]);
      const topY = tower.base - 4 + tower.height;
      for (let i = 0; i < bridge.pts.length; i += 3) {
        const p = bridge.pts[i];
        if (Math.hypot(p[0] - tower.x, p[2] - tower.z) > bridge.length * 0.42) continue;
        cables.push({ pts: [[tower.x, topY, tower.z], [p[0], p[1] + 1, p[2]]], color: palette.accent2 });
      }
    }
    for (const pil of bridge.pillars) {
      ctx.pillars.add(pil.x, -6, pil.z, pil.r * 2, pil.top + 6, pil.r * 2, 0, palette.rock);
    }
  }

  // 轻轨：梁 + T 形墩 + 穿楼站台 + 一列在跑的车
  for (const mono of city.monorails) {
    ribbons.push({ pts: mono.pts, width: 6.4, color: palette.accent2 });
    ribbons.push({ pts: mono.pts, width: 8.6, color: girderColor, lift: -1.8 });

    for (const pil of mono.pillars) {
      ctx.pillars.add(pil.x, pil.ground - 1, pil.z, pil.r * 2, pil.top - pil.ground, pil.r * 2, 0, palette.rock);
      ctx.solid.add(pil.x, pil.top - 1.4, pil.z, 9, 1.4, 3, 0, palette.rock);
    }
    if (mono.station) {
      const st = mono.station;
      ctx.glass.add(st.x, st.y, st.z, st.w, st.height * 0.86, st.d, st.rot, palette.glass);
      ctx.solid.add(st.x, st.y + st.height * 0.86, st.z, st.w * 1.04, 1.2, st.d * 1.04, st.rot, palette.accent);
      ctx.signs.add(st.x, st.y - 1.6, st.z, st.w * 0.9, 1.2, st.d * 1.02, st.rot, palette.accent);
    }
    const train = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const car = new THREE.Mesh(
        new THREE.BoxGeometry(15, 4.4, 3.4),
        new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.4, metalness: 0.3 }),
      );
      car.position.x = (i - 1.5) * 16;
      car.castShadow = true;
      train.add(car);
    }
    group.add(train);
    animated.trains.push({ group: train, pts: mono.pts, offset: animated.trains.length * 0.37 });
  }

  // 过江索道：两岸塔 + 带下垂的缆绳 + 来回跑的轿厢
  for (const car of city.cableCars) {
    const aTop = car.a.base + car.a.height;
    const bTop = car.b.base + car.b.height;
    ctx.solid.add(car.a.x, car.a.base - 2, car.a.z, 9, car.a.height, 9, 0, palette.buildings[2]);
    ctx.solid.add(car.b.x, car.b.base - 2, car.b.z, 9, car.b.height, 9, 0, palette.buildings[2]);
    const rope = [];
    const steps = 26;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      rope.push([
        car.a.x + (car.b.x - car.a.x) * t,
        car.a.base + car.a.height + (bTop - aTop) * t - Math.sin(t * Math.PI) * car.sag,
        car.a.z + (car.b.z - car.a.z) * t,
      ]);
    }
    cables.push({ pts: rope, color: palette.accent2 });
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(6, 5, 6),
      new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.5 }),
    );
    cabin.castShadow = true;
    group.add(cabin);
    animated.cabins.push({ mesh: cabin, pts: rope, offset: animated.cabins.length * 0.5 });
  }

  if (city.wall) addCityWall(ctx, city.wall, terrain, palette, ribbons);
  addStairs(ctx, city.stairs, palette);

  if (params.showProps) {
    for (const tree of city.props.trees) {
      const h = 4 + tree.s * 5;
      ctx.trunks.add(tree.x, tree.y, tree.z, 0.9 * tree.s, h * 0.45, 0.9 * tree.s, 0, 0x5a4632);
      ctx.leaves.add(tree.x, tree.y + h * 0.35, tree.z, h * 0.95, h * 0.95, h * 0.95, 0, palette.vegetation);
    }
    for (const lamp of city.props.lamps) {
      ctx.pillars.add(lamp.x, lamp.y, lamp.z, 0.5, 8, 0.5, 0, palette.rock);
      ctx.signs.add(lamp.x, lamp.y + 8, lamp.z, 2.6, 0.6, 0.8, lamp.rot, palette.accent2);
    }
  }

  const solid = ctx.solid.build('solid');
  const glass = ctx.glass.build('glass');
  const signs = ctx.signs.build('signs');
  signs.castShadow = false;
  const ribbonMesh = new THREE.Mesh(ribbonGeometry(ribbons), mats.ribbon);
  ribbonMesh.name = 'ribbons';
  ribbonMesh.receiveShadow = true;
  const cableMesh = new THREE.LineSegments(lineGeometry(cables), mats.cable);

  group.add(solid, glass, ctx.roofs.build('roofs'), ctx.pillars.build('pillars'), signs,
    ctx.trunks.build('trunks'), ctx.leaves.build('leaves'), ribbonMesh, cableMesh);

  return { group, materials: mats, animated };
}

