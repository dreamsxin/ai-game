// 题签与印章：都是画在 canvas 上再当 sprite 贴出去的。

import * as THREE from 'three';

const cache = new Map();
const FONT = '"Songti SC","STSong","SimSun","Noto Serif SC",serif';

function drawSilk(text, { size = 34, ink = '#2b2922', paper = 'rgba(236,225,196,0.94)', edge = 'rgba(156,107,69,0.85)' }) {
  const canvas = document.createElement('canvas');
  const probe = canvas.getContext('2d');
  probe.font = `500 ${size}px ${FONT}`;
  const w = Math.ceil(probe.measureText(text).width) + size * 0.9;
  const h = Math.ceil(size * 1.55);
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  c.font = `500 ${size}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = paper;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = edge;
  c.lineWidth = Math.max(1.5, size * 0.055);
  c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth);
  c.fillStyle = ink;
  c.fillText(text, w / 2, h / 2 + size * 0.04);
  return { canvas, w, h };
}

function drawSeal(text, { size = 40, cinnabar = '#b5402f', ink = '#f4ead2' }) {
  const pad = size * 0.28;
  const side = Math.ceil(size + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const c = canvas.getContext('2d');
  c.fillStyle = cinnabar;
  c.fillRect(0, 0, side, side);
  c.strokeStyle = 'rgba(244,234,210,0.9)';
  c.lineWidth = Math.max(2, size * 0.07);
  c.strokeRect(c.lineWidth * 1.4, c.lineWidth * 1.4, side - c.lineWidth * 2.8, side - c.lineWidth * 2.8);
  c.fillStyle = ink;
  c.font = `600 ${size * 0.72}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, side / 2, side / 2 + size * 0.03);
  return { canvas, w: side, h: side };
}

function labelTexture(text, { variant = 'silk', ...style }) {
  const key = `${variant}|${text}|${JSON.stringify(style)}`;
  let entry = cache.get(key);
  if (!entry) {
    const drawn = variant === 'seal' ? drawSeal(text, style) : drawSilk(text, style);
    const texture = new THREE.CanvasTexture(drawn.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    entry = { texture, ratio: drawn.w / drawn.h };
    cache.set(key, entry);
  }
  return entry;
}

export function makeLabel(text, { height = 0.026, variant = 'silk', ...style } = {}) {
  const entry = labelTexture(text, { variant, ...style });
  const material = new THREE.SpriteMaterial({
    map: entry.texture, transparent: true, depthTest: false, sizeAttenuation: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(height * entry.ratio, height, 1);
  sprite.renderOrder = 20;
  sprite.userData.labelHeight = height;
  return sprite;
}

/**
 * 换字。印章与题签的内容会随筛选变（"长安 · 43 首" → "长安 · 6 首"），
 * 而贴图是按内容缓存的，所以换字只是换一个 map 引用，不重画 canvas。
 * 注意宽高比会跟着字数变，scale 必须一起重设 —— 忘了这一步字就会被拉长。
 */
export function retitle(sprite, text, { height, variant = 'silk', ...style } = {}) {
  const h = height ?? sprite.userData.labelHeight ?? 0.026;
  const entry = labelTexture(text, { variant, ...style });
  sprite.material.map = entry.texture;
  sprite.material.needsUpdate = true;
  sprite.scale.set(h * entry.ratio, h, 1);
  sprite.userData.labelHeight = h;
  return sprite;
}


export function makeRippleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const c = canvas.getContext('2d');
  c.fillStyle = '#c9dcd2';
  c.fillRect(0, 0, 512, 512);
  c.strokeStyle = 'rgba(45,86,104,0.30)';
  c.lineWidth = 1.2;
  for (let i = 0; i < 46; i++) {
    const y = (512 / 46) * i + 2;
    const amp = 2.4 + ((i * 37) % 7) * 0.7;
    c.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const yy = y + Math.sin((x / 512) * Math.PI * 4 + i * 0.7) * amp;
      if (x === 0) c.moveTo(x, yy);
      else c.lineTo(x, yy);
    }
    c.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function disposeLabelCache() {
  for (const { texture } of cache.values()) texture.dispose();
  cache.clear();
}
