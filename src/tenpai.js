import { judge } from './yakuman.js';
import { countsOf } from './tiles.js';

// 手牌(13-3m 枚)の待ち牌を返す: [{tile, kind: 'yakuman'|'normal'}]
export function waitsOf(tiles, melds, dora, extra = {}) {
  const have = countsOf(tiles);
  for (const m of melds) for (const t of m.tiles) have[t]++;
  const out = [];
  for (let t = 0; t < 34; t++) {
    if (have[t] >= 4) continue;
    const counts = countsOf(tiles.concat([t]));
    // ロン・ツモの両方を判定し、役満になる方を優先 (シャンポン待ちの四暗刻はツモのみ役満)
    const ron = judge({ counts, melds, winTile: t, tsumo: false, dora, ...extra });
    const tsu = judge({ counts, melds, winTile: t, tsumo: true, dora, ...extra });
    const r = ron.length && !(tsu.kind === 'yakuman' && tsu.length && ron.kind !== 'yakuman') ? ron : tsu;
    if (r.length) out.push({ tile: t, kind: r.kind });
  }
  return out;
}

// 手牌+ツモ牌 (14-3m 枚) から、切るとテンパイになる牌: [{discard, waits}]
export function discardsToTenpai(tiles, melds, dora, extra = {}) {
  const out = [];
  for (const u of new Set(tiles)) {
    const rest = tiles.slice();
    rest.splice(rest.indexOf(u), 1);
    const waits = waitsOf(rest, melds, dora, extra);
    if (waits.length) out.push({ discard: u, waits });
  }
  return out;
}
