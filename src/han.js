import { isHonor, isTerminal } from './tiles.js';

// 数え役満用の翻数計算 (役満成立時は使わない)。自分は東家・東場固定。
// リーチ・一発・裏ドラ・赤ドラ・槍槓は対象外 (表ドラのみ)。

function setsOf(d, melds) {
  const sets = d.sets.map((s) => ({ ...s, open: false, kan: false }));
  for (const m of melds) {
    sets.push({
      t: m.type === 'chi' ? 's' : 'k',
      tile: m.tiles[0],
      open: m.type !== 'ankan',
      kan: m.tiles.length === 4,
      ankan: m.type === 'ankan',
    });
  }
  return sets;
}

function chiitoiItems(all, ctx) {
  const items = [['七対子', 2]];
  items.push(...commonItems(all, ctx, true));
  return items;
}

// 手牌の構成に依らず牌種だけで決まる役
function commonItems(all, { open }, noSets = false) {
  const items = [];
  const present = [];
  for (let t = 0; t < 34; t++) if (all[t] > 0) present.push(t);
  if (present.every((t) => !isHonor(t) && !isTerminal(t))) items.push(['断幺九', 1]);
  const suits = new Set(present.filter((t) => t < 27).map((t) => Math.floor(t / 9)));
  const hasHonor = present.some(isHonor);
  if (suits.size === 1) {
    if (!hasHonor) items.push(['清一色', open ? 5 : 6]);
    else items.push(['混一色', open ? 2 : 3]);
  }
  if (noSets && present.every((t) => isHonor(t) || isTerminal(t))) items.push(['混老頭', 2]);
  return items;
}

function ryanmenPossible(sets, winTile) {
  return sets.some((s) => {
    if (s.t !== 's') return false;
    const b = s.tile;
    if (winTile === b) return b % 9 !== 6;
    if (winTile === b + 2) return b % 9 !== 0;
    return false;
  });
}

function decompItems(d, melds, all, ctx) {
  const { open, winTile, tsumo } = ctx;
  const sets = setsOf(d, melds);
  const items = [...commonItems(all, ctx)];
  const ks = sets.filter((s) => s.t === 'k');
  const ss = sets.filter((s) => s.t === 's');

  // 役牌
  for (const k of ks) {
    if (k.tile >= 31) items.push([['白', '發', '中'][k.tile - 31], 1]);
    else if (k.tile === 27) items.push(['場風・自風 東', 2]);
  }
  // 平和
  if (!open && ks.length === 0 && ![27, 31, 32, 33].includes(d.pair) && ryanmenPossible(ss, winTile)) {
    items.push(['平和', 1]);
  }
  // 一盃口 / 二盃口
  if (!open) {
    const cnt = {};
    for (const s of ss) cnt[s.tile] = (cnt[s.tile] || 0) + 1;
    const pairs = Object.values(cnt).reduce((a, n) => a + Math.floor(n / 2), 0);
    if (pairs >= 2) items.push(['二盃口', 3]);
    else if (pairs === 1) items.push(['一盃口', 1]);
  }
  // 三色同順 / 一気通貫
  const seqSet = new Set(ss.map((s) => s.tile));
  for (let b = 0; b < 7; b++) {
    if (seqSet.has(b) && seqSet.has(9 + b) && seqSet.has(18 + b)) {
      items.push(['三色同順', open ? 1 : 2]);
      break;
    }
  }
  for (let s = 0; s < 3; s++) {
    if (seqSet.has(s * 9) && seqSet.has(s * 9 + 3) && seqSet.has(s * 9 + 6)) {
      items.push(['一気通貫', open ? 1 : 2]);
      break;
    }
  }
  // 三色同刻
  const kSet = new Set(ks.map((s) => s.tile));
  for (let n = 0; n < 9; n++) {
    if (kSet.has(n) && kSet.has(9 + n) && kSet.has(18 + n)) {
      items.push(['三色同刻', 2]);
      break;
    }
  }
  // 混全帯幺九 / 純全帯幺九 / 混老頭
  const sideOk = (t) => isHonor(t) || isTerminal(t);
  const seqEdge = (s) => s.tile % 9 === 0 || s.tile % 9 === 6;
  if (sideOk(d.pair) && ks.every((s) => sideOk(s.tile)) && ss.every(seqEdge)) {
    if (ss.length === 0) {
      items.push(['混老頭', 2]);
    } else {
      const hasHonor = [...Array(34).keys()].some((t) => all[t] > 0 && isHonor(t));
      items.push(hasHonor ? ['混全帯幺九', open ? 1 : 2] : ['純全帯幺九', open ? 2 : 3]);
    }
  }
  // 対々和 / 三暗刻 / 三槓子 / 小三元
  if (ks.length === 4) items.push(['対々和', 2]);
  const concealed = ks.filter((s) => s.ankan || (!s.open && (tsumo || s.tile !== winTile))).length;
  if (concealed >= 3) items.push(['三暗刻', 2]);
  if (sets.filter((s) => s.kan).length === 3) items.push(['三槓子', 2]);
  const dragonK = ks.filter((s) => s.tile >= 31).length;
  if (dragonK === 2 && d.pair >= 31) items.push(['小三元', 2]);
  return items;
}

export function calcHan({ counts, melds = [], winTile, tsumo, dora, rinshan = false, haitei = false, riichi = 0, ippatsu = false, ura }, decomps) {
  const all = counts.slice();
  for (const me of melds) for (const t of me.tiles) all[t]++;
  const open = melds.some((m) => m.type !== 'ankan');
  const ctx = { open, winTile, tsumo };

  const candidates = decomps.map((d) => decompItems(d, melds, all, ctx));
  if (melds.length === 0 && counts.filter((n) => n === 2).length === 7 && counts.every((n) => n === 0 || n === 2)) {
    candidates.push(chiitoiItems(all, ctx));
  }

  const extra = [];
  if (riichi) extra.push([riichi >= 2 ? 'ダブルリーチ' : 'リーチ', riichi]);
  if (riichi && ippatsu) extra.push(['一発', 1]);
  if (tsumo && !open) extra.push(['門前清自摸和', 1]);
  if (tsumo && rinshan) extra.push(['嶺上開花', 1]);
  else if (tsumo && haitei) extra.push(['海底摸月', 1]);
  else if (!tsumo && haitei) extra.push(['河底撈魚', 1]);

  let best = null;
  for (const c of candidates) {
    const items = [...c, ...extra];
    if (items.length === 0) continue; // 役なし
    const sumOf = (list) => [].concat(list).reduce((s, t) => s + (all[t] || 0), 0);
    const doraN = sumOf(dora);
    const uraN = riichi && ura !== undefined ? sumOf(ura) : 0;
    const han = items.reduce((s, [, h]) => s + h, 0) + doraN + uraN;
    if (!best || han > best.han) best = { han, items, doraN, uraN };
  }
  return best;
}

export function describe(r) {
  const parts = r.items.map(([n, h]) => `${n}${h}`);
  if (r.doraN) parts.push(`ドラ${r.doraN}`);
  if (r.uraN) parts.push(`裏ドラ${r.uraN}`);
  return `${r.han}翻: ${parts.join(' ')}`;
}
