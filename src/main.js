import { Game } from './game.js';
import { parseHand } from './tiles.js';
import { addRecord } from './storage.js';
import { render, showResult, hideResult, startClock, showConfirm, hideConfirm } from './ui.js';

// デバッグ: ?debug=1&hand=11123456789999m (14枚目がツモ牌) / ?speed=ミリ秒
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

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, i, t } = el.dataset;
  if (act === 'start' || act === 'next') next();
  else if (act === 'discard') game.pick(i === 'd' ? 'd' : Number(i));
  else if (act === 'reset') game.reset();
  else if (act === 'home') {
    if (game.phase === 'playing') showConfirm('ホームに戻りますか？', () => { hideResult(); game.home(); });
    else if (game.phase === 'won') { hideResult(); game.home(); }
  }
  else if (act === 'tsumo') game.tsumo();
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
