import { tileLabel, tileImage, doraOf } from './tiles.js';
import { formatTime, now } from './timer.js';
import { waitsOf } from './tenpai.js';

const $ = (id) => document.getElementById(id);
const PLAYERS = ['あなた (東)', 'CPU 南', 'CPU 西', 'CPU 北'];

function tileHTML(t, { small = false, tag = "div", attrs = "", extra = "", dora = false } = {}) {
  return `<${tag} class="tile ${small ? "small" : ""} ${dora ? "dora" : ""} ${extra}" ${attrs}><img src="${tileImage(t)}" alt="${tileLabel(t).top}${tileLabel(t).bottom}" draggable="false"></${tag}>`;
}

function meldHTML(m, doras) {
  return `<div class="meld">${m.tiles.map((t) => tileHTML(t, { small: true, dora: doras.includes(t) })).join('')}</div>`;
}

function actionsHTML(game) {
  const p = game.pending;
  if (!p) return '';
  const out = [];
  if (p.kind === 'self') {
    if (p.tsumo) out.push(`<button class="btn ${p.tsumo.kind === 'normal' ? 'primary' : 'win'}" data-act="tsumo">ツモ！ ${p.tsumo.kind === 'normal' ? '(' + p.tsumo[0] + ') ' : ''} <span class="kbd">(T)</span></button>`);
    if (game.riichiPrompt !== null && game.riichiPrompt !== undefined) {
      const pt = game.riichiPrompt === 'd' ? game.drawn : game.hand[game.riichiPrompt];
      out.push(`<span class="riichi-ask">この牌でリーチ？ ${tileHTML(pt, { small: true, extra: 'inline' })}</span>`);
      out.push('<button class="btn win" data-act="riichi-yes">リーチ <span class="kbd">(L)</span></button>');
      out.push('<button class="btn primary" data-act="riichi-no">そのまま捨てる <span class="kbd">(Enter)</span></button>');
      out.push('<button class="btn ghost" data-act="riichi-cancel">キャンセル <span class="kbd">(Esc)</span></button>');
    }
    for (const t of p.ankan) out.push(`<button class="btn" data-act="ankan" data-t="${t}">暗槓 ${tileLabel(t).top}${tileLabel(t).bottom}</button>`);
    for (const t of p.kakan) out.push(`<button class="btn" data-act="kakan" data-t="${t}">加槓 ${tileLabel(t).top}${tileLabel(t).bottom}</button>`);
  } else {
    const names = { ron: 'ロン！ <span class="kbd">(T)</span>', pon: 'ポン <span class="kbd">(P)</span>', minkan: 'カン <span class="kbd">(K)</span>', chi: 'チー <span class="kbd">(C)</span>' };
    p.options.forEach((o, i) => {
      if (o.disabled) {
        out.push(`<button class="btn" disabled title="${o.reason}">ロン不可 (フリテン)</button>`);
        return;
      }
      let label = names[o.type];
      if (o.type === 'chi') label += ' ' + [o.base, o.base + 1, o.base + 2].map((t) => tileLabel(t).top).join('');
      out.push(`<button class="btn ${o.type === 'ron' && o.yaku.kind !== 'normal' ? 'win' : 'primary'}" data-act="call" data-i="${i}" data-type="${o.type}">${label}</button>`);
    });
    out.push(`<button class="btn ghost" data-act="skip">スキップ <span class="kbd">(Space)</span></button>`);
  }
  return out.join('');
}

function tenpaiHTML(game, waits, discards) {
  const rii = game.riichi ? `<b class="rii-label">${game.doubleRiichi ? 'ダブルリーチ' : 'リーチ'}中</b>` : '';
  if (waits.length) {
    const fr = game.furitenReason(waitsShape(game));
    const fu = fr ? `<b class="fu-label">フリテン</b><span class="tp-title">(${fr}) ロン不可・ツモのみ</span>` : '';
    return `${rii}${fu}`;
  }
  return rii;
}

// 形だけで見た待ち (リーチ済み扱い=役の有無を問わない)。フリテン判定用
function waitsShape(game) {
  return waitsOf(game.hand, game.melds, game._doraTiles(), { riichi: 1 });
}

// ---- 盤面 (単位: 1牌幅 w。盤面一辺 = 17.67w、中心 C = 8.835w) ----
const H = 4 / 3; // 牌の縦横比
const C = 8.835;
const calc = (n) => `calc(var(--w) * ${n.toFixed(3)})`;
const rotCCW = (x, y, k) => { for (let i = 0; i < k; i++) [x, y] = [y, -x]; return [x, y]; };
const rotCW = (x, y, k) => { for (let i = 0; i < k; i++) [x, y] = [-y, x]; return [x, y]; };
// 中心(cx,cy)・幅w高さh・回転deg の絶対配置スタイル
const place = (cx, cy, w, h, deg = 0) =>
  `left:${calc(C + cx - w / 2)};top:${calc(C + cy - h / 2)};width:${calc(w)};height:${calc(h)};transform:rotate(${deg}deg)`;

const WALL_SLOTS = 14; // 1辺あたりの山の枚数(スタック数)
const WALL_LIVE0 = 35; // 配牌直後の生きている山のスタック数
const NAMES = ['あなた (東)', 'CPU 南', 'CPU 西', 'CPU 北'];

function boardHTML(game, tenpai, furiten) {
  const parts = [];
  // 山: 下辺の右端から反時計回りに並べ、引くたび手前から減る。王牌(7スタック)は生きている山の続き。
  const remaining = Math.ceil(game.wall.length / 2);
  const wallStack = (q, faceTile) => {
    const side = Math.floor(q / WALL_SLOTS);
    const j = q % WALL_SLOTS;
    const [x, y] = rotCW(6.5 - j, 7.67, side);
    const st = place(x, y, 1, H, side * 90);
    return faceTile !== undefined
      ? tileHTML(faceTile, { small: true, attrs: `style="${st}"` })
      : `<span class="wall-tile" style="${st}"></span>`;
  };
  // 生きている山は王牌の手前で止め、1スタック分あけて王牌と分ける (リングは周回するので負の位置は反対側へ)
  for (let q = WALL_LIVE0 - 1 - remaining; q < WALL_LIVE0 - 1; q++) parts.push(wallStack(((q % 56) + 56) % 56));
  for (let i = 0; i < 7; i++) {
    const k = 4 - i; // 表示牌は 左から5組目 → 左隣へ順に増える
    parts.push(wallStack(WALL_LIVE0 + i, k >= 0 && k < game.doraCount ? game.doraIndicators[k] : undefined));
  }

  // 河: 各家 6枚×3段。自分(下)基準で並べて、家ごとに反時計回りに 90° ずつ回す。
  const lastFrom = game.pending && game.pending.kind === 'call' ? game.pending.from : -1;
  for (let p = 0; p < 4; p++) {
    game.rivers[p].forEach((t, k) => {
      const row = Math.min(Math.floor(k / 6), 2);
      const col = k - row * 6;
      const [x, y] = rotCCW(-3 + col + 0.5, 2.6 + (row + 0.5) * H, p);
      const isLast = p === lastFrom && k === game.rivers[p].length - 1;
      const isRii = p === 0 && game.riichi && k === game.riichiAt;
      parts.push(tileHTML(t, { small: true, extra: (isLast ? 'last ' : '') + (isRii ? 'riichi-tile' : ''), attrs: `style="${place(x, y, 1, H, -p * 90)}"` }));
    });
    const [nx, ny] = rotCCW(0, 2.25, p);
    parts.push(`<span class="pname" style="left:${calc(C + nx)};top:${calc(C + ny)};transform:translate(-50%,-50%) rotate(${-p * 90}deg)">${NAMES[p]}</span>`);
  }

  if (game.riichi) parts.push(`<div class="stick" style="${place(-2.0, 2.25, 1.8, 0.16)}"><i></i></div>`);

  // 流局の告知
  if (game.notice) {
    parts.push(`<div class="ryuukyoku"><div class="rk-main">流局</div><div class="rk-sub">山が尽きました — 配り直します</div></div>`);
  }

  // 中央
  const cp = game.pending && game.pending.kind === 'call' ? game.pending : null;
  const centerBody = cp
    ? `<div class="called-label">${NAMES[cp.from]} の打牌</div>${tileHTML(cp.tile, { extra: 'inline called' })}`
    : game.toast
      ? `<div class="toast">${game.toast}</div>`
      : `<div>山 残り</div><div class="cnt">${game.wall.length}</div>`;
  const pills = [
    game.riichi ? `<span class="pill rii">${game.doubleRiichi ? 'ダブルリーチ' : 'リーチ'}</span>` : '',
    tenpai ? '<span class="pill tp">テンパイ</span>' : '',
    furiten ? `<span class="pill fu" title="${furiten}">フリテン</span>` : '',
  ].join('');
  parts.push(`<div class="center" style="${place(0, 0, 5.2, 4.2)}"><div class="cbody">${centerBody}</div><div class="pills">${pills}</div></div>`);
  return `<div class="board">${parts.join('')}</div>`;
}

export function render(game) {
  const app = $('app');
  document.querySelector('header').hidden = game.phase === 'idle'; // ホーム画面では戻るボタンとタイマーを出さない

  if (game.phase === 'idle') {
    app.innerHTML = `<div class="start"><h1>スピード役満</h1>
      <button class="btn primary" data-act="start">スタート <span class="kbd">(Space)</span></button></div>`;
    return;
  }
  const dora = game._doraTiles();
  const fl = { riichi: game.riichi ? (game.doubleRiichi ? 2 : 1) : 0, ippatsu: game.ippatsu };
  // 聴牌情報
  const allTiles = game.hand.concat(game.drawn !== null ? [game.drawn] : []);
  let waits = [];
  const tenpaiDiscards = [];
  if (allTiles.length % 3 === 1) waits = waitsOf(allTiles, game.melds, dora, fl);
  // 鳴き待ちのとき、鳴きに使う手牌を強調
  const callSet = new Set();
  if (game.pending && game.pending.kind === 'call') {
    const d = game.pending.tile;
    for (const o of game.pending.options) {
      if (o.type === 'pon' || o.type === 'minkan') callSet.add(d);
      if (o.type === 'chi') [o.base, o.base + 1, o.base + 2].forEach((t) => t !== d && callSet.add(t));
    }
  }
  const hl = (t, isDrawn) =>
    (callSet.has(t) ? 'callable' : '') + (game.riichi && !isDrawn ? ' locked' : '');
  let queuedMarked = false;
  const qCls = (t) => {
    if (game.queued === t && !queuedMarked) {
      queuedMarked = true;
      return 'queued';
    }
    return '';
  };
  const mine = game.hand
    .map((t, i) => tileHTML(t, { tag: 'button', dora: dora.includes(t), extra: qCls(t) + ' ' + hl(t) + (game.riichiPrompt === i ? ' queued' : ''), attrs: `data-act="discard" data-i="${i}"` }))
    .join('');
  const drawn = game.drawn !== null
    ? `<div class="drawn">${tileHTML(game.drawn, { tag: 'button', dora: dora.includes(game.drawn), extra: qCls(game.drawn) + ' ' + hl(game.drawn, true) + (game.riichiPrompt === 'd' ? ' queued' : ''), attrs: 'data-act="discard" data-i="d"' })}</div>`
    : '';
  const furiten = waits.length ? game.furitenReason(waitsShape(game)) : '';
  const board = boardHTML(game, waits.length > 0, furiten);
  app.innerHTML = `
    ${board}
    <div class="hand-area">
      <div class="hand">${mine}</div>${drawn}
      <div class="melds">${game.melds.map((m) => meldHTML(m, dora)).join('')}</div>
    </div>
    <div class="actions"><button class="btn ghost reset-btn" data-act="reset">配り直し <span class="kbd">(R)</span></button><div class="act-main">${actionsHTML(game)}</div></div>`;
}

export function showResult(game, { isBest }) {
  const r = game.result;
  const doras = r.doraInds.map(doraOf);
  const small = (t) => tileHTML(t, { small: true, extra: 'inline', dora: doras.includes(t) });
  const el = document.createElement('div');
  el.className = 'overlay';
  el.id = 'overlay';
  el.innerHTML = `<div class="card">
    <h2>${r.how}和了！</h2>
    <div class="big">${formatTime(r.ms)}</div>
    <div class="yaku">${r.yaku.join('・')}</div>
    ${r.detail ? `<div class="meta">${r.detail}</div>` : ''}
    <div class="inds"><span>ドラ表示牌</span>${r.doraInds.map((t) => tileHTML(t, { small: true, extra: 'inline' })).join('')}${r.uraInds ? `<span class="sep">裏ドラ表示牌</span>${r.uraInds.map((t) => tileHTML(t, { small: true, extra: 'inline' })).join('')}` : ''}</div>
    <div class="winhand">
      ${r.melds.length ? `<div class="wh-melds">${r.melds.map((m) => `<div class="meld">${m.tiles.map(small).join('')}</div>`).join('')}</div>` : ''}
      <div class="wh-tiles">${r.hand.map(small).join('')}</div>
      <div class="wh-win">${small(r.win.tile)}</div>
    </div>
    ${isBest ? '<div class="best">★ ベスト更新！ ★</div>' : ''}
    <button class="btn primary" data-act="next">ホームに戻る <span class="kbd">(Space)</span></button></div>`;
  document.body.appendChild(el);
}

export function hideResult() {
  const el = $('overlay');
  if (el) el.remove();
}

export function startClock(game) {
  const tick = () => {
    if (game.phase === 'playing') {
      $('total').textContent = formatTime(now() - game.runStartAt);
    } else if (game.phase === 'won') {
      $('total').textContent = formatTime(game.result.ms);
    }
    requestAnimationFrame(tick);
  };
  tick();
}

export function showConfirm(message, onYes) {
  hideConfirm();
  const el = document.createElement("div");
  el.className = "overlay";
  el.id = "confirm";
  el.innerHTML = `<div class="card"><h2>${message}</h2>
    <div class="meta">進行中の局と今回のタイムは破棄されます。</div>
    <div class="row"><button class="btn" data-confirm="no">キャンセル</button>
    <button class="btn primary" data-confirm="yes">ホームに戻る</button></div></div>`;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-confirm]");
    if (!b && e.target !== el) return;
    hideConfirm();
    if (b && b.dataset.confirm === "yes") onYes();
  });
  document.body.appendChild(el);
}

export function hideConfirm() {
  const el = $("confirm");
  if (el) el.remove();
}
