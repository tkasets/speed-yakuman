import { tileLabel, tileImage, doraOf } from './tiles.js';
import { formatTime, now } from './timer.js';
import { waitsOf } from './tenpai.js';
import { rankingEnabled, savedNick } from './api.js';
import { CATEGORIES, registrable } from './categories.js';

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


  // 流局の告知
  if (game.notice) {
    parts.push(`<div class="ryuukyoku"><div class="rk-main">流局</div></div>`);
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
      <button class="btn primary" data-act="start">スタート <span class="kbd">(Space)</span></button>
      ${rankingEnabled() ? '<button class="btn ghost" data-act="rank-open">ランキング</button>' : ''}</div>`;
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
  // 配り直し直後は手牌を少し揺らす。再描画されてもアニメが途切れないよう経過時間を delay に渡す
  const since = now() - game.redealAt;
  const nudge = since >= 0 && since < 400 ? ` style="animation:hand-nudge .4s ease-out ${(-since).toFixed(0)}ms"` : '';
  const board = boardHTML(game, waits.length > 0, furiten);
  // 3,2,1 は半透過の膜の上に出す。スタートで膜が消え、「スタート」が薄くフェードアウトする (再描画されても途切れないよう経過時間を delay に渡す)
  const goSince = now() - (game.goAt ?? -1e9);
  const cdLayer = game.phase === 'countdown'
    ? `<div class="cd-layer"><div class="countdown">${game.countdown}</div></div>`
    : game.phase === 'playing' && goSince >= 0 && goSince < 900
      ? `<div class="cd-layer go"><div class="countdown go-text" style="animation:go-fade .9s ease-out ${(-goSince).toFixed(0)}ms both">スタート</div></div>`
      : '';
  app.innerHTML = `<div class="play">
    ${board}
    <div class="hand-area"${nudge}>
      <div class="hand">${mine}</div>${drawn}
      <div class="melds">${game.melds.map((m) => meldHTML(m, dora)).join('')}</div>
    </div>
    <div class="actions"><button class="btn ghost reset-btn" data-act="reset">配り直し <span class="kbd">(R)</span></button><div class="act-main">${actionsHTML(game)}</div></div></div>${cdLayer}`;
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
    <div class="winhand" style="--n:${r.hand.length + 1 + r.melds.reduce((s, m) => s + m.tiles.length, 0)};--g:${r.melds.length + 1}">
      ${r.melds.length ? `<div class="wh-melds">${r.melds.map((m) => `<div class="meld">${m.tiles.map(small).join('')}</div>`).join('')}</div>` : ''}
      <div class="wh-tiles">${r.hand.map(small).join('')}</div>
      <div class="wh-win">${small(r.win.tile)}</div>
    </div>
    ${isBest ? '<div class="best">★ ベスト更新！ ★</div>' : ''}
    ${rankingEnabled() && registrable(r) ? `<div class="rank-form"><div class="rank-row"><input id="nick" maxlength="12" placeholder="ニックネーム" value="${savedNick().replace(/"/g, '')}"><button class="btn primary" data-act="rank-submit">ランキングに登録</button></div><div id="rankMsg" class="rank-msg"></div></div>` : ''}
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
    } else if (game.phase === 'countdown') {
      $('total').textContent = formatTime(0);
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

// ランキング表示。state = { tab, list, mine } list: null=読み込み中 / false=失敗 / 配列
//  mine: 自分の登録名 (その行を強調する)
export function showRanking(state) {
  const { tab, list, mine } = state;
  const old = $('ranking');
  const keepScroll = old ? old.querySelector('.rank-tabs')?.scrollLeft : 0;
  hideRanking();
  const el = document.createElement('div');
  el.className = 'overlay';
  el.id = 'ranking';
  const cat = CATEGORIES.find((c) => c.id === tab) || CATEGORIES[0];
  let body;
  if (list === null) body = '<div class="rank-empty">読み込み中…</div>';
  else if (list === false) body = '<div class="rank-empty">ランキングを読み込めませんでした。</div>';
  else if (!list.length) body = `<div class="rank-empty">${esc(cat.label)}の記録はまだありません。<br>最初の1位になろう！</div>`;
  else {
    body = `<table class="rank-table"><tbody>${list
      .map(
        (r) => `<tr class="${mine && r.name === mine ? 'me' : ''}"><td class="rk"><span class="medal m${r.rank <= 3 ? r.rank : 0}">${r.rank}</span></td><td class="nm">${esc(r.name)}</td><td class="tm">${formatTime(r.ms)}</td><td class="yk">${esc(r.yaku.join('・'))}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  }
  const tabs = CATEGORIES.map(
    (c) => `${c.id === '天和' ? '<span class="rank-brk"></span>' : ''}<button class="rank-tab ${c.id === tab ? 'on' : ''}" data-act="rank-tab" data-cat="${c.id}" role="tab" aria-selected="${c.id === tab}">${esc(c.label)}</button>`,
  ).join('');
  el.innerHTML = `<div class="card rank-card">
    <div class="rank-head"><h2>ランキング</h2><button class="rank-x" data-act="rank-close" aria-label="閉じる">×</button></div>
    <div class="rank-tabs" role="tablist">${tabs}</div>
    <div class="rank-sub"><b>${esc(cat.label)}</b> TOP10</div>
    <div class="rank-body">${body}</div>
  </div>`;
  el.addEventListener('click', (ev) => {
    if (ev.target === el) hideRanking();
  });
  document.body.appendChild(el);
  // 選択中のタブが見える位置までスクロール
  const bar = el.querySelector('.rank-tabs');
  // PCでは縦ホイールでタブを横にスクロールできるようにする
  bar.addEventListener('wheel', (ev) => {
    if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
      bar.scrollLeft += ev.deltaY;
      ev.preventDefault();
    }
  }, { passive: false });
  const on = bar.querySelector('.on');
  if (keepScroll) bar.scrollLeft = keepScroll;
  if (on) {
    const l = on.offsetLeft - 12;
    const r = on.offsetLeft + on.offsetWidth + 12;
    if (l < bar.scrollLeft) bar.scrollLeft = l;
    else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth;
  }
}

export function hideRanking() {
  const el = $('ranking');
  if (el) el.remove();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
