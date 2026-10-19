import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../src/yakuman.js';
import { parseHand, countsOf } from '../src/tiles.js';

const y = (hand, win, opts = {}) =>
  judge({ counts: countsOf(parseHand(hand)), winTile: parseHand(win)[0], ...opts });
const has = (list, name) => assert.ok(list.includes(name), `${name} not in [${list}]`);
const no = (list, name) => assert.ok(!list.includes(name), `${name} unexpectedly in [${list}]`);

test('国士無双', () => {
  has(y('119m19p19s1234567z', '9m'), '国士無双');
  no(y('119m19p19s1234567z', '9m'), '国士無双十三面');
  has(y('19m19p19s12345677z', '7z'), '国士無双十三面');
});

test('四暗刻', () => {
  has(y('111222333444m55p', '1m'), '四暗刻');
  has(y('111222333444m55p', '5p'), '四暗刻単騎');
  no(y('111222333444m55p', '1m', { tsumo: false }), '四暗刻');
});

test('三元・四喜', () => {
  has(y('123m44p555666777z', '1m'), '大三元');
  has(y('111222333444z55m', '5m'), '大四喜');
  has(y('123m11122233344z', '1m'), '小四喜');
  no(y('123m11122233344z', '1m'), '大四喜');
});

test('字一色・緑一色・清老頭', () => {
  has(y('11122233344455z', '5z'), '字一色');
  has(y('223344666888s66z', '2s'), '緑一色');
  no(y('223344666888s55z', '2s'), '緑一色');
  has(y('111999m111999p11s', '1s'), '清老頭');
});

test('九蓮宝燈', () => {
  has(y('11123455678999m', '1m'), '九蓮宝燈');
  has(y('11123455678999m', '5m'), '純正九蓮宝燈');
});

test('四槓子・大七星', () => {
  const melds = [0, 1, 2, 3].map((t) => ({ type: 'ankan', tiles: [t, t, t, t] }));
  const r = judge({ counts: countsOf(parseHand('55p')), melds, winTile: 13, tsumo: true });
  has(r, '四槓子');
  has(y('11223344556677z', '7z'), '大七星');
});

test('天和・非役満', () => {
  has(y('123m44p555666777z', '1m', { tenhou: true }), '天和');
  assert.equal(y('123456789m123p55s', '1p').length, 0);
  assert.equal(y('123456789m123p56s', '1p').length, 0);
});

test('数え役満 (ドラ込み13翻)', () => {
  const hand = '11223344556677m';
  const r = y(hand, '7m', { dora: 0 }); // 二盃口3+清一色6+ツモ1+平和1+ドラ2
  assert.ok(r.some((n) => n.startsWith('数え役満')), String(r));
  const n = y(hand, '7m', { dora: 30 });
  assert.equal(n.kind, 'normal');
  assert.ok(n[0].includes('11')||n[0].includes('三倍満'), String(n));
});

test('通常和了: 役ありの手は通常和了になる', () => {
  const ok = y('123456789m123p55s', '1p', { dora: 30 }); // 一気通貫+ツモ
  assert.equal(ok.kind, 'normal');
  assert.ok(ok.han >= 3);
});
