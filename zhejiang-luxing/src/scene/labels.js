// 中文标注：three 没有文字，所以把字画到 canvas 上再贴成 sprite。
// 字号给得比显示尺寸大一圈（devicePixelRatio × 2），否则拉近看会糊。

import * as THREE from 'three';

const cache = new Map();

function drawLabel(text, { size = 34, color = '#ffffff', halo = 'rgba(4,12,20,0.82)', pad = 14, weight = 600 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${weight} ${size}px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = Math.ceil(size * 1.6);
  canvas.width = w;
  canvas.height = h;

  const c = canvas.getContext('2d');
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  // 底板：让名字在雪山和海面上都读得清
  const r = h / 2;
  c.fillStyle = halo;
  c.beginPath();
  c.moveTo(r, 0);
  c.lineTo(w - r, 0);
  c.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
  c.lineTo(r, h);
  c.arc(r, r, r, Math.PI / 2, -Math.PI / 2);
  c.closePath();
  c.fill();

  c.fillStyle = color;
  c.fillText(text, w / 2, h / 2 + 1);
  return { canvas, w, h };
}

/**
 * 生成一个文字 sprite。
 * 默认是「屏幕固定大小」（sizeAttenuation=false）：拉远拉近字号不变，
 * 这是地图标注该有的行为 —— 按世界尺寸给的话，全省视角下字会小到看不见。
 * height 是它占视口高度的比例量级（0.026 ≈ 25px @900px 高）。
 * 同样的文字+样式只画一次，之后共用贴图。
 */
export function makeLabel(text, { height = 0.026, ...style } = {}) {
  const key = `${text}|${JSON.stringify(style)}`;
  let entry = cache.get(key);
  if (!entry) {
    const { canvas, w, h } = drawLabel(text, style);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    entry = { texture, ratio: w / h };
    cache.set(key, entry);
  }
  const material = new THREE.SpriteMaterial({
    map: entry.texture, transparent: true, depthTest: false, sizeAttenuation: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(height * entry.ratio, height, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export function disposeLabelCache() {
  for (const { texture } of cache.values()) texture.dispose();
  cache.clear();
}
