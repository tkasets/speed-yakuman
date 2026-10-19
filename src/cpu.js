// CPUは和了しない。手牌の「使いにくい牌」から切る簡易AI。
// 孤立した字牌 → 孤立した19 → 孤立した端寄りの数牌 … の順に切り、対子・塔子・順子の材料は残す。
function usefulness(t, counts) {
  const n = counts[t];
  let s = 0;
  if (t >= 27) {
    s = n >= 3 ? 8 : n === 2 ? 3 : 0; // 字牌: 対子以上でなければ最優先で切る
  } else {
    const r = t % 9;
    s = [0.5, 1, 1.6, 2.2, 2.5, 2.2, 1.6, 1, 0.5][r]; // 端ほど価値が低い
    if (n >= 3) s += 6;
    else if (n === 2) s += 3;
    for (const d of [-2, -1, 1, 2]) {
      const rr = r + d;
      if (rr < 0 || rr > 8 || !counts[t + d]) continue;
      s += Math.abs(d) === 1 ? 2 : 1;
    }
  }
  return s + Math.random() * 1.2; // 多少のブレ
}

// 手牌(配列)から切る牌の index を返す
export function cpuDiscard(hand) {
  const counts = new Array(34).fill(0);
  for (const t of hand) counts[t]++;
  let best = 0;
  let bestScore = Infinity;
  hand.forEach((t, i) => {
    const s = usefulness(t, counts);
    if (s < bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}
