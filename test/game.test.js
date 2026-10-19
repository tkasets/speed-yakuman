import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { parseHand } from '../src/tiles.js';

const mk = (opts = {}) => new Game({ onChange() {}, onWin() {}, speed: 0, ...opts });

test('指定手牌の天和をツモ和了できる', () => {
  const g = mk({ forcedHand: parseHand('11123456789999m') });
  g.startRun();
  assert.ok(g.pending.tsumo.includes('天和'));
  g.tsumo();
  assert.equal(g.phase, 'won');
});

test('ランダムプレイで例外なく進行する (打牌・スキップ・リセット)', async () => {
  const g = mk();
  g.startRun();
  for (let n = 0; n < 400 && g.phase === 'playing'; n++) {
    const p = g.pending;
    if (p?.kind === 'self') {
      const r = Math.random();
      if (p.tsumo) g.tsumo();
      else if (r < 0.03) g.reset();
      else if (p.ankan.length && r < 0.3) g.ankan(p.ankan[0]);
      else if (p.kakan.length && r < 0.3) g.kakan(p.kakan[0]);
      else g.discard(g.drawn !== null && r < 0.5 ? 'd' : Math.floor(Math.random() * g.hand.length));
    } else if (p?.kind === 'call') {
      const i = Math.floor(Math.random() * (p.options.length + 1));
      i < p.options.length ? g.call(i) : g.skip();
    }
    await new Promise((r) => setTimeout(r, 0));
    const tiles = g.hand.length + (g.drawn !== null ? 1 : 0) + g.melds.length * 3;
    if (g.pending?.kind === 'self') assert.ok(tiles === 14 || tiles === 14 - 0, `tiles=${tiles}`);
  }
});

test('リーチ: 聴牌になる牌を切るとき確認が出て宣言でき、以後はツモ切りのみ', async () => {
  const g = mk({ forcedHand: parseHand('123456789m123p4p9s') });
  g.startRun();
  assert.ok(g.pending.riichiTiles.includes(26), String(g.pending.riichiTiles)); // 9s切りで聴牌
  g.pick('d'); // 9s: 聴牌になる牌 → リーチ確認が出る
  assert.equal(g.riichiPrompt, 'd');
  g.cancelRiichiPrompt();
  assert.equal(g.riichiPrompt, null);
  assert.equal(g.rivers[0].length, 0);
  g.pick('d');
  g.confirmRiichi(true);
  assert.equal(g.riichi, true);
  assert.equal(g.doubleRiichi, true); // 第一打なのでダブルリーチ
  assert.equal(g.rivers[0].length, 1);
});

test('フリテン: 自分の捨て牌に待ち牌があるとロン不可', () => {
  const g = mk({ forcedHand: parseHand('123456789m123p4p9s') });
  g.startRun();
  const waits = [{ tile: 12 }]; // 4p
  assert.equal(g.furitenReason(waits), '');
  g.myDiscards.add(12);
  assert.ok(g.furitenReason(waits));
  g.myDiscards.clear();
  g.tempFuriten = true;
  assert.equal(g.furitenReason(waits), '見逃し');
});

test('リーチしないで切る(ダマ)も選べる', () => {
  const g = mk({ forcedHand: parseHand('123456789m123p4p9s') });
  g.startRun();
  g.pick('d');
  g.confirmRiichi(false);
  assert.equal(g.riichi, false);
  assert.equal(g.rivers[0].length, 1);
});

test('ポン後に牌を切れる', () => {
  const g = mk({ forcedHand: parseHand('1199m123456p123s5z') });
  g.startRun();
  g.discard('d');
  // CPU南が 1m を切った想定でポン
  g.pending = { kind: 'call', tile: 0, from: 1, options: [{ type: 'pon' }] };
  g.rivers[1].push(0);
  g.call(0);
  assert.equal(g.pending.kind, 'self');
  const n = g.hand.length;
  g.pick(0);
  assert.equal(g.hand.length, n - 1);
  assert.equal(g.rivers[0].length, 2);
});

test('カンドラ: 暗槓ですぐ、大明槓は次の打牌後に増える。リーチ時は裏ドラも', () => {
  const g = mk({ forcedHand: parseHand('1111m23456p123s5z8z') });
  g.startRun();
  assert.equal(g.doraCount, 1);
  g.ankan(0);
  assert.equal(g.doraCount, 2);
  assert.equal(g._doraTiles().length, 2);
  // 大明槓は打牌後
  g.pending = { kind: 'self', tsumo: null, ankan: [], kakan: [], riichiTiles: [] };
  g._kanDora(false);
  assert.equal(g.doraCount, 2);
  g.discard(0);
  assert.equal(g.doraCount, 3);
  g.riichi = true;
  assert.equal(g._uraTiles().length, 3);
});
