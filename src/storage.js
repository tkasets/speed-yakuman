const KEY = 'speedYakuman.v1';
const empty = () => ({ best: null, count: 0, totalMs: 0, history: [] });

export function loadStats() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return empty();
  }
}

// 戻り値: { stats, isBest }
export function addRecord(rec) {
  const s = loadStats();
  const yakuman = rec.kind !== 'normal'; // 通常和了はベスト・平均に含めない
  const isBest = yakuman && (s.best === null || rec.ms < s.best.ms);
  if (isBest) s.best = rec;
  if (yakuman) {
    s.count++;
    s.totalMs += rec.ms;
  }
  s.history = [rec, ...s.history].slice(0, 30);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても続行 */
  }
  return { stats: s, isBest };
}
