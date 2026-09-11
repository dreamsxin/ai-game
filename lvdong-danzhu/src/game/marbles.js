// 五种弹珠颜色，关卡按需要取前几种。
export const COLORS = ['rose', 'amber', 'mint', 'azure', 'violet'];

export const COLOR_HEX = {
  rose: '#ff5d7a',
  amber: '#ffb547',
  mint: '#5ce88a',
  azure: '#4de1ff',
  violet: '#b479ff',
};

export const COLOR_LABELS = {
  rose: '玫红',
  amber: '琥珀',
  mint: '薄荷',
  azure: '天蓝',
  violet: '紫罗兰',
};

export const marble = (color, damage = 0) => ({ color, damage });

export const colorLabel = (color) => COLOR_LABELS[color] ?? '';

export const paletteOf = (count) => COLORS.slice(0, Math.min(COLORS.length, Math.max(2, count)));
