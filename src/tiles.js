// 牌表現: 0-8 萬子, 9-17 筒子, 18-26 索子, 27-30 東南西北, 31 白, 32 發, 33 中
const KAN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONORS = ['東', '南', '西', '北', '白', '發', '中'];

export const isHonor = (t) => t >= 27;
export const isTerminal = (t) => t < 27 && (t % 9 === 0 || t % 9 === 8);

export function tileLabel(t) {
  if (t < 9) return { top: KAN[t], bottom: '萬', cls: 'man' };
  if (t < 18) return { top: String(t - 8), bottom: '筒', cls: 'pin' };
  if (t < 27) return { top: String(t - 17), bottom: '索', cls: 'sou' };
  const cls = t === 32 ? 'honor hatsu' : t === 33 ? 'honor chun' : t === 31 ? 'honor haku' : 'honor';
  return { top: HONORS[t - 27], bottom: '', cls };
}

export const sortTiles = (arr) => arr.slice().sort((a, b) => a - b);

export function countsOf(arr) {
  const c = new Array(34).fill(0);
  for (const t of arr) c[t]++;
  return c;
}

// "123m456p789s11z" → タイル配列 (z: 1-7 = 東南西北白發中)
export function parseHand(str) {
  const out = [];
  let digits = [];
  for (const ch of str.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') {
      digits.push(Number(ch));
    } else {
      const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
      if (base === undefined) throw new Error(`bad suit: ${ch}`);
      for (const d of digits) out.push(base + d - 1);
      digits = [];
    }
  }
  return out;
}

const HONOR_FILES = ['Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun'];
export function tileImage(t) {
  if (t < 9) return `img/Man${t + 1}.svg`;
  if (t < 18) return `img/Pin${t - 8}.svg`;
  if (t < 27) return `img/Sou${t - 17}.svg`;
  return `img/${HONOR_FILES[t - 27]}.svg`;
}

// ドラ表示牌 → ドラ
export function doraOf(ind) {
  if (ind < 27) return Math.floor(ind / 9) * 9 + ((ind % 9) + 1) % 9;
  if (ind < 31) return 27 + ((ind - 27 + 1) % 4);
  return 31 + ((ind - 31 + 1) % 3);
}
