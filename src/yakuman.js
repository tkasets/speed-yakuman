import { isHonor, isTerminal } from './tiles.js';
import { calcHan, describe } from './han.js';

const GREEN = new Set([19, 20, 21, 23, 25, 32]); // 2s 3s 4s 6s 8s 發
const KOKUSHI = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
const KAN_TYPES = new Set(['minkan', 'ankan', 'kakan']);

function splitSets(c, cur, results) {
  let i = 0;
  while (i < 34 && c[i] === 0) i++;
  if (i === 34) {
    results.push(cur.slice());
    return;
  }
  if (c[i] >= 3) {
    c[i] -= 3;
    cur.push({ t: 'k', tile: i });
    splitSets(c, cur, results);
    cur.pop();
    c[i] += 3;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    cur.push({ t: 's', tile: i });
    splitSets(c, cur, results);
    cur.pop();
    c[i]++; c[i + 1]++; c[i + 2]++;
  }
}

function decompose(counts) {
  const out = [];
  const c = counts.slice();
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const res = [];
    splitSets(c, [], res);
    for (const sets of res) out.push({ pair: p, sets });
    c[p] += 2;
  }
  return out;
}

/**
 * 役満判定。
 * counts: 閉じた手牌(和了牌を含む) の枚数配列(34)
 * melds: [{type:'chi'|'pon'|'minkan'|'ankan'|'kakan', tiles:[...]}]
 * 返り値: 成立した役満名の配列 (和了形でなければ空)
 */
export function judge({ counts, melds = [], winTile, tsumo = true, tenhou = false, dora, rinshan = false, haitei = false, riichi = 0, ippatsu = false, ura }) {
  const m = melds.length;
  if (counts.reduce((a, b) => a + b, 0) !== 14 - 3 * m) return [];

  const all = counts.slice();
  for (const me of melds) for (const t of me.tiles) all[t]++;
  const present = [];
  for (let t = 0; t < 34; t++) if (all[t] > 0) present.push(t);

  const yaku = new Set();
  let agari = false;

  // 国士無双
  if (m === 0 && KOKUSHI.every((t) => counts[t] >= 1) && KOKUSHI.reduce((s, t) => s + counts[t], 0) === 14) {
    agari = true;
    yaku.add(counts[winTile] === 2 ? '国士無双十三面' : '国士無双');
  }

  // 七対子形 (役満は大七星のみ)
  if (m === 0 && counts.every((n) => n === 0 || n === 2) && counts.filter((n) => n === 2).length === 7) {
    agari = true;
    if (present.every(isHonor)) yaku.add('大七星');
  }

  // 通常形
  const decomps = m <= 4 ? decompose(counts) : [];
  if (decomps.length) agari = true;
  if (!agari) return [];

  // 牌種ベースの役満
  if (present.every(isHonor) && !yaku.has('大七星')) yaku.add('字一色');
  if (present.every((t) => GREEN.has(t))) yaku.add('緑一色');
  if (present.every(isTerminal)) yaku.add('清老頭');
  if (decomps.length && m === 0 && present.every((t) => t < 27 && Math.floor(t / 9) === Math.floor(present[0] / 9))) {
    const base = Math.floor(present[0] / 9) * 9;
    const s = counts.slice(base, base + 9);
    if (s[0] >= 3 && s[8] >= 3 && s.slice(1, 8).every((n) => n >= 1)) {
      const w = counts.slice();
      w[winTile]--;
      const sw = w.slice(base, base + 9);
      const junsei = sw[0] === 3 && sw[8] === 3 && sw.slice(1, 8).every((n) => n === 1);
      yaku.add(junsei ? '純正九蓮宝燈' : '九蓮宝燈');
    }
  }

  // 四槓子
  if (melds.filter((x) => KAN_TYPES.has(x.type)).length === 4) yaku.add('四槓子');

  // 分解ごとの役満
  const meldK = melds.filter((x) => x.type !== 'chi').map((x) => x.tiles[0]);
  const ankanN = melds.filter((x) => x.type === 'ankan').length;
  for (const d of decomps) {
    const kt = new Set([...meldK, ...d.sets.filter((s) => s.t === 'k').map((s) => s.tile)]);
    if ([31, 32, 33].every((t) => kt.has(t))) yaku.add('大三元');
    const windK = [27, 28, 29, 30].filter((t) => kt.has(t)).length;
    if (windK === 4) yaku.add('大四喜');
    else if (windK === 3 && d.pair >= 27 && d.pair <= 30) yaku.add('小四喜');
    const concealed = d.sets.filter((s) => s.t === 'k' && (tsumo || s.tile !== winTile)).length + ankanN;
    if (concealed === 4 && melds.every((x) => x.type === 'ankan')) {
      yaku.add(d.pair === winTile ? '四暗刻単騎' : '四暗刻');
    }
  }

  if (tenhou && tsumo) yaku.add('天和');
  const out = [...yaku];

  out.kind = 'yakuman';

  // 役満が無ければ翻数で判定: 13翻以上は数え役満、それ未満は通常和了 (役が1つ以上ある場合)
  if (out.length === 0 && dora !== undefined) {
    const r = calcHan({ counts, melds, winTile, tsumo, dora, rinshan, haitei, riichi, ippatsu, ura }, decomps);
    if (r) {
      out.detail = describe(r);
      if (r.han >= 13) {
        out.push(`数え役満(${r.han}翻)`);
      } else {
        out.push(limitName(r.han));
        out.kind = 'normal';
        out.han = r.han;
      }
    }
  }
  return out;
}

function limitName(han) {
  if (han >= 11) return `三倍満(${han}翻)`;
  if (han >= 8) return `倍満(${han}翻)`;
  if (han >= 6) return `跳満(${han}翻)`;
  if (han >= 5) return `満貫(${han}翻)`;
  return `${han}翻`;
}
