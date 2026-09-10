// 六种果实是棋盘的基础元素，特殊果实由消除形状决定，颜色和图形只给渲染层用。
export const KINDS = ['berry', 'lemon', 'plum', 'kiwi', 'melon', 'grape'];

export const KIND_COLORS = {
  berry: '#ff5d7a',
  lemon: '#ffd447',
  plum: '#a679ff',
  kiwi: '#5ce88a',
  melon: '#4de1ff',
  grape: '#ff9f43',
};

export const KIND_LABELS = {
  berry: '莓果',
  lemon: '柠檬',
  plum: '布林',
  kiwi: '奇异果',
  melon: '蜜瓜',
  grape: '橙果',
};

export const SPECIAL_LABELS = {
  row: '横向爆果',
  col: '纵向爆果',
  bomb: '爆破果',
  rainbow: '彩虹果',
};

export const tile = (kind, special = null) => ({ kind, special });

export const sameKind = (a, b) => Boolean(a && b && a.kind === b.kind);

export const isSpecial = (t) => Boolean(t && t.special);

// 形状决定奖励：L/T 形出爆破果，5 连出彩虹果，4 连出与消除方向一致的直线爆果。
export function specialFor(group) {
  if (!group) return null;
  if (group.shape === 'L') return 'bomb';
  if (group.runLength >= 5) return 'rainbow';
  if (group.runLength === 4) return group.orientation === 'h' ? 'row' : 'col';
  return null;
}
