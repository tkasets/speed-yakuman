import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../api/worker.js';

// node:sqlite を D1 の prepare/bind/all/first/run 形に包む簡易シム
function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../api/schema.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind: (...a) => ((args = a), stmt),
        all: async () => ({ results: db.prepare(sql).all(...args) }),
        first: async () => db.prepare(sql).get(...args) ?? null,
        run: async () => db.prepare(sql).run(...args),
      };
      return stmt;
    },
  };
}

const ORIGIN = 'https://speedyakuman.t-kasets.com';
const env = { DB: makeDB() };
const post = (body, ip = '1.1.1.1', origin = ORIGIN) =>
  worker.fetch(
    new Request('https://api.example/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    env,
  );
const get = () => worker.fetch(new Request('https://api.example/api/ranking', { headers: { Origin: ORIGIN } }), env);

test('登録して上位に出る・同じ名前でも記録は1件ずつ並ぶ', async () => {
  let r = await post({ name: 'たろう', ms: 30000, yaku: ['大三元'], resets: 2 }, '2.2.2.1');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).rank, 1);
  r = await post({ name: 'はなこ', ms: 20000, yaku: ['四暗刻'], resets: 0 }, '2.2.2.2');
  assert.equal((await r.json()).rank, 1);
  r = await post({ name: 'たろう', ms: 50000, yaku: ['字一色'], resets: 5 }, '2.2.2.3'); // 同じ名前の別記録
  const list = (await (await get()).json()).ranking;
  assert.deepEqual(list.map((x) => [x.rank, x.name, x.ms]), [[1, 'はなこ', 20000], [2, 'たろう', 30000], [3, 'たろう', 50000]]);
  assert.deepEqual(list[0].yaku, ['四暗刻']);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('不正な値は弾く', async () => {
  assert.equal((await post({ ms: 5, yaku: ['大三元'] }, '3.3.3.1')).status, 400); // 速すぎ
  assert.equal((await post({ ms: 5000, yaku: ['ただの役'] }, '3.3.3.2')).status, 400); // 役満でない
  assert.equal((await post({ ms: 5000, yaku: [] }, '3.3.3.3')).status, 400);
  assert.equal((await post({ ms: 'x', yaku: ['大三元'] }, '3.3.3.4')).status, 400);
  assert.equal((await post({ ms: 5000, yaku: ['大三元'] }, '3.3.3.5', 'https://evil.example')).status, 403);
  const ok = await post({ name: '<b>悪い&名前</b>', ms: 9000, yaku: ['数え役満(14翻)'] }, '3.3.3.6');
  assert.equal((await ok.json()).name, 'b悪い名前/b');
});

test('同一IPの連続投稿は制限される', async () => {
  let last;
  for (let i = 0; i < 4; i++) last = await post({ name: `x${i}`, ms: 40000 + i, yaku: ['大三元'] }, '9.9.9.9');
  assert.equal(last.status, 429);
});

test('ニックネーム未入力は「名無し」', async () => {
  const r = await post({ name: '  ', ms: 45000, yaku: ['大四喜'] }, '4.4.4.4');
  assert.equal((await r.json()).name, '名無し');
});

test('種類(タブ)ごとのランキングと、満貫以上の通常和了の登録', async () => {
  const e2 = { DB: makeDB() };
  const post2 = (body, ip) =>
    worker.fetch(new Request('https://api.example/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), e2);
  const get2 = (cat) => worker.fetch(new Request('https://api.example/api/ranking?cat=' + encodeURIComponent(cat), { headers: { Origin: ORIGIN } }), e2);
  await post2({ name: 'a', ms: 10000, yaku: ['満貫(5翻)'] }, '5.0.0.1');
  await post2({ name: 'b', ms: 8000, yaku: ['三倍満(11翻)'] }, '5.0.0.2');
  await post2({ name: 'c', ms: 20000, yaku: ['国士無双十三面', '天和'] }, '5.0.0.3');
  await post2({ name: 'd', ms: 15000, yaku: ['国士無双'] }, '5.0.0.4');
  const names = async (cat) => (await (await get2(cat)).json()).ranking.map((x) => x.name);
  assert.deepEqual(await names('all'), ['b', 'a', 'd', 'c']); // all はAPIの内部用 (画面のタブには出さない)
  assert.deepEqual(await names('満貫'), ['a']);
  assert.deepEqual(await names('倍満'), []); // 三倍満は倍満に混ざらない
  assert.deepEqual(await names('三倍満'), ['b']);
  assert.deepEqual(await names('国士無双'), ['d', 'c']);
  assert.deepEqual(await names('天和'), ['c']);
  assert.equal((await get2('でたらめ')).status, 400);
  const r = await (await post2({ name: 'e', ms: 12000, yaku: ['国士無双'] }, '5.0.0.5')).json();
  assert.deepEqual([r.cat, r.rank], ['国士無双', 1]); // d(15000)・c(20000)より速い
});
