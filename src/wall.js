function buildWall() {
  const w = [];
  for (let t = 0; t < 34; t++) for (let i = 0; i < 4; i++) w.push(t);
  for (let i = w.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [w[i], w[j]] = [w[j], w[i]];
  }
  return w;
}

// forced: デバッグ用に自分の手牌(13枚+ツモ牌)を指定できる
export function deal(forced = null) {
  const wall = buildWall();
  if (forced) {
    for (const t of forced) {
      const idx = wall.lastIndexOf(t);
      if (idx >= 0) wall.splice(idx, 1);
    }
  }
  const take = (n) => wall.splice(wall.length - n, n);
  const dead = take(14);
  const mine = forced ? forced.slice(0, 13) : take(13);
  return {
    wall,
    rinshan: dead.slice(0, 4),
    doraIndicators: [4, 6, 8, 10, 12].map((i) => dead[i]),
    uraIndicators: [5, 7, 9, 11, 13].map((i) => dead[i]),
    hands: [mine, take(13), take(13), take(13)],
    firstDraw: forced && forced.length >= 14 ? forced[13] : null,
  };
}
