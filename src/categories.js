// ランキングの種類(タブ)。id は記録の役名の先頭と一致させる (APIと同じ定義)。
export const CATEGORIES = [
  { id: '満貫', label: '満貫' },
  { id: '跳満', label: '跳満' },
  { id: '倍満', label: '倍満' },
  { id: '三倍満', label: '三倍満' },
  { id: '数え役満', label: '数え役満' },
  { id: '天和', label: '天和' },
  { id: '国士無双', label: '国士無双' },
  { id: '四暗刻', label: '四暗刻' },
  { id: '大三元', label: '大三元' },
  { id: '小四喜', label: '小四喜' },
  { id: '大四喜', label: '大四喜' },
  { id: '字一色', label: '字一色' },
  { id: '緑一色', label: '緑一色' },
  { id: '清老頭', label: '清老頭' },
  { id: '九蓮宝燈', label: '九蓮宝燈' },
  { id: '四槓子', label: '四槓子' },
  { id: '大七星', label: '大七星' },
];

export const DEFAULT_CAT = CATEGORIES[0].id;

// 役名の配列から、いちばん最初に当てはまるランキングの種類を返す
export function categoryOf(yaku) {
  for (const name of yaku) {
    const c = CATEGORIES.find((x) => name.startsWith(x.id));
    if (c) return c.id;
  }
  return DEFAULT_CAT;
}

// 登録できる記録か: 役満・数え役満、または満貫以上の通常和了
export function registrable(result) {
  return result.kind !== 'normal' || /^(満貫|跳満|倍満|三倍満)/.test(result.yaku[0] || '');
}
