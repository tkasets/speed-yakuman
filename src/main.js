import { Game } from './game.js';
import { parseHand } from './tiles.js';
import { addRecord } from './storage.js';
import { render, showResult, hideResult, startClock, showConfirm, hideConfirm, showRanking, hideRanking } from './ui.js';
import { fetchRanking, submitScore } from './api.js';
import { categoryOf, DEFAULT_CAT } from './categories.js';

// デバッグ: ?debug=1&hand=11123456789999m (14枚目がツモ牌) / ?speed=ミリ秒
// 実際に見えている高さ(スマホのアドレスバー等を除く)をCSSへ渡す。ページ全体が見える範囲に収まるようにする
const setVh = () => document.documentElement.style.setProperty("--vh100", (window.visualViewport ? window.visualViewport.height : window.innerHeight) + "px");
setVh();
window.addEventListener("resize", setVh);
window.addEventListener("orientationchange", setVh);
if (window.visualViewport) window.visualViewport.addEventListener("resize", setVh);

const q = new URLSearchParams(location.search);
const forcedHand = q.has('debug') && q.get('hand') ? parseHand(q.get('hand')) : null; // 手牌指定は ?debug=1 のときだけ

const game = new Game({
  forcedHand,
  speed: Number(q.get('speed')) || 150,
  onChange: render,
  onWin: (result) => {
    const rec = { ms: result.ms, resets: result.resets, yaku: result.yaku, kind: result.kind, at: Date.now() };
    const { isBest } = addRecord(rec);
    showResult(game, { isBest });
  },
});

// ホーム画面ではスタート、和了後の結果画面ではホームに戻る
const next = () => {
  if (game.phase === "won") {
    hideResult();
    game.home();
  } else if (game.phase === "idle") {
    game.startRun();
  }
};

// ランキング画面を開く (タブ切り替えも同じ)。登録直後は自分の行を強調する
let rankMine = '';
let rankSeq = 0;
function openRanking(tab, mine = '') {
  rankMine = mine;
  const seq = ++rankSeq;
  showRanking({ tab, list: null, mine });
  fetchRanking(tab).then(
    (list) => seq === rankSeq && showRanking({ tab, list, mine }),
    () => seq === rankSeq && showRanking({ tab, list: false, mine }),
  );
}

// 上がり画面からランキングに登録する
async function submitRanking(btn) {
  const r = game.result;
  const msg = document.getElementById('rankMsg');
  if (!r || btn.disabled) return;
  const name = (document.getElementById('nick').value || '').trim() || '名無し';
  btn.disabled = true;
  msg.textContent = '登録中…';
  try {
    const res = await submitScore({ name, ms: Math.round(r.ms), yaku: r.yaku, resets: r.resets });
    msg.innerHTML = `${res.rank}位に登録しました！ <a href="#" data-act="rank-open" data-cat="${res.cat || categoryOf(r.yaku)}" data-mine="${res.name.replace(/"/g, '')}">ランキングを見る</a>`;
  } catch (e) {
    btn.disabled = false;
    msg.textContent = e.status === 429 ? '短時間に登録しすぎです。少し待ってからもう一度どうぞ。' : '登録できませんでした。もう一度お試しください。';
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  const { act, i, t } = el.dataset;
  if (act === 'start' || act === 'next') next();
  else if (act === 'discard') game.pick(i === 'd' ? 'd' : Number(i));
  else if (act === 'reset') game.reset();
  else if (act === 'home') {
    if (game.phase === 'playing') showConfirm('ホームに戻りますか？', () => { hideResult(); game.home(); });
    else if (game.phase === 'won') { hideResult(); game.home(); }
  }
  else if (act === 'tsumo') game.tsumo();
  else if (act === 'rank-open') openRanking(el.dataset.cat || DEFAULT_CAT, el.dataset.mine || '');
  else if (act === 'rank-tab') openRanking(el.dataset.cat, rankMine);
  else if (act === 'rank-close') hideRanking();
  else if (act === 'rank-submit') submitRanking(el);
  else if (act === 'riichi-yes') game.confirmRiichi(true);
  else if (act === 'riichi-no') game.confirmRiichi(false);
  else if (act === 'riichi-cancel') game.cancelRiichiPrompt();
  else if (act === 'ankan') game.ankan(Number(t));
  else if (act === 'kakan') game.kakan(Number(t));
  else if (act === 'call') game.call(Number(i));
  else if (act === 'skip') game.skip();
});

document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.target && e.target.tagName === 'INPUT') return; // ニックネーム入力中はショートカットを無効に
  if (document.getElementById('ranking')) {
    if (k === 'escape') hideRanking();
    return;
  }
  if (document.getElementById('confirm')) {
    if (k === 'escape') hideConfirm();
    return;
  }
  const p = game.pending;
  if (game.phase !== 'playing') {
    if (k === ' ' || k === 'enter') { e.preventDefault(); next(); }
    return;
  }
  const callIdx = (type) => (p && p.kind === 'call' ? p.options.findIndex((o) => o.type === type) : -1);
  if (game.riichiPrompt !== null && game.riichiPrompt !== undefined) {
    if (k === 'l') game.confirmRiichi(true);
    else if (k === 'enter') game.confirmRiichi(false);
    else if (k === 'escape') game.cancelRiichiPrompt();
    return;
  }
  if (k === 'r') game.reset();
  else if (k === ' ') { e.preventDefault(); game.skip(); }
  else if (k === 't') { if (callIdx('ron') >= 0) game.call(callIdx('ron')); else game.tsumo(); }
  else if (k === 'p' && callIdx('pon') >= 0) game.call(callIdx('pon'));
  else if (k === 'k' && callIdx('minkan') >= 0) game.call(callIdx('minkan'));
  else if (k === 'c' && callIdx('chi') >= 0) game.call(callIdx('chi'));
  else if (k === 'd' || k === 'enter') game.pick('d');
});
render(game);
startClock(game);
if (q.has('autostart')) game.startRun();
// デバッグ: ?autoplay で自動ツモ切り・スキップ (見た目確認用)
if (q.has('autoplay')) {
  setInterval(() => {
    if (game.pending && game.pending.kind === 'call') game.skip();
    else if (game.pending && game.pending.kind === 'self' && !game.pending.tsumo) game.discard('d');
  }, 5);
}
if (q.has('autowin')) setTimeout(() => game.tsumo(), 300); // デバッグ: 即ツモ和了
if (q.has('autoriichi')) setTimeout(() => { game.pick('d'); game.confirmRiichi(true); }, 200); // デバッグ: 即リーチ
if (q.has('showrank')) openRanking(q.get('showrank') || DEFAULT_CAT, q.get('mine') || ''); // デバッグ
