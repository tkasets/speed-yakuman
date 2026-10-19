// スピード役満 ランキングAPI (Cloudflare Workers + D1)
//   GET  /api/ranking → 上位10件 (ニックネームごとのベスト)
//   POST /api/score   → { name, ms, yaku: [...], resets } を登録

const ALLOWED_ORIGINS = new Set([
  'https://speedyakuman.t-kasets.com',
  'http://localhost:8000',
  'http://localhost:3000',
]);

const YAKUMAN = new Set([
  '天和', '国士無双', '国士無双十三面', '四暗刻', '四暗刻単騎', '大三元', '小四喜', '大四喜',
  '字一色', '緑一色', '清老頭', '九蓮宝燈', '純正九蓮宝燈', '四槓子', '大七星',
]);
const KAZOE = /^数え役満\(\d{2}翻\)$/;
const NORMAL = /^(満貫|跳満|倍満|三倍満)\(\d{1,2}翻\)$/; // 満貫以上の通常和了

// ランキングの種類 (クライアントの src/categories.js と同じ)。役名がこの文字列で始まる記録が対象。
const CATEGORIES = [
  '満貫', '跳満', '倍満', '三倍満', '数え役満', '天和', '国士無双', '四暗刻', '大三元', '小四喜',
  '大四喜', '字一色', '緑一色', '清老頭', '九蓮宝燈', '四槓子', '大七星',
];
const categoryOf = (yaku) => {
  for (const name of yaku) {
    const c = CATEGORIES.find((x) => name.startsWith(x));
    if (c) return c;
  }
  return 'all';
};
// 役名は JSON 配列で保存してあるので、要素の先頭一致は '"<種類>' で探せる
const likePattern = (cat) => `%"${cat}%`;

const MIN_MS = 100; // 0.1秒 (天和の即ツモを許すための下限)
const MAX_MS = 24 * 60 * 60 * 1000;
const BURST_LIMIT = 3; // 60秒あたりの投稿数 (同一IP)
const DAILY_LIMIT = 100; // 24時間あたりの投稿数 (同一IP)

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://speedyakuman.t-kasets.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cleanName(raw) {
  const s = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>"'`&]/g, '')
    .trim();
  return [...s].slice(0, 12).join('') || '名無し';
}

// 速い順の上位N件 (cat が '' なら全種類)
const TOP_SQL = `
  SELECT name, ms, yaku, resets, created_at FROM scores
  WHERE (? = '' OR yaku LIKE ?)
  ORDER BY ms ASC, id ASC LIMIT ?`;

async function getRanking(env, origin, cat) {
  const { results } = await env.DB.prepare(TOP_SQL).bind(cat === 'all' ? '' : 'x', cat === 'all' ? '' : likePattern(cat), 10).all();
  const list = results.map((r, i) => ({
    rank: i + 1,
    name: r.name,
    ms: r.ms,
    yaku: JSON.parse(r.yaku),
    resets: r.resets,
    at: r.created_at,
  }));
  return json({ cat, ranking: list }, 200, origin);
}

async function postScore(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400, origin);
  }
  const ms = Number(body.ms);
  const resets = Number(body.resets ?? 0);
  const yaku = Array.isArray(body.yaku) ? body.yaku.map(String) : [];
  if (!Number.isInteger(ms) || ms < MIN_MS || ms > MAX_MS) return json({ error: 'invalid time' }, 400, origin);
  if (!Number.isInteger(resets) || resets < 0 || resets > 99999) return json({ error: 'invalid resets' }, 400, origin);
  if (yaku.length < 1 || yaku.length > 6 || !yaku.every((y) => YAKUMAN.has(y) || KAZOE.test(y) || NORMAL.test(y))) {
    return json({ error: 'invalid yaku' }, 400, origin);
  }
  const name = cleanName(body.name);

  // 同一IPの連続投稿を制限 (IPそのものは保存せずハッシュだけ)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await sha256(`speedyakuman:${ip}`);
  const now = Math.floor(Date.now() / 1000);
  const recent = await env.DB.prepare(
    'SELECT SUM(created_at > ?) AS burst, COUNT(*) AS day FROM scores WHERE ip_hash = ? AND created_at > ?',
  )
    .bind(now - 60, ipHash, now - 86400)
    .first();
  if ((recent?.burst ?? 0) >= BURST_LIMIT || (recent?.day ?? 0) >= DAILY_LIMIT) {
    return json({ error: 'too many requests' }, 429, origin);
  }

  await env.DB.prepare('INSERT INTO scores (name, ms, yaku, resets, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(name, ms, JSON.stringify(yaku), resets, ipHash, now)
    .run();

  // 順位 = その種類の中で、自分より速い記録の数 + 1
  const cat = categoryOf(yaku);
  const faster = await env.DB.prepare("SELECT COUNT(*) AS n FROM scores WHERE (? = '' OR yaku LIKE ?) AND ms < ?")
    .bind(cat === 'all' ? '' : 'x', cat === 'all' ? '' : likePattern(cat), ms)
    .first();
  return json({ ok: true, name, cat, rank: (faster?.n ?? 0) + 1 }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    // 他のサイトからのブラウザ経由の書き込みは拒否 (curl等はOriginが無いので通る = 完全な不正対策ではない)
    if (request.method === 'POST' && origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'forbidden' }, 403, origin);
    try {
      if (url.pathname === '/api/ranking' && request.method === 'GET') {
        const cat = url.searchParams.get('cat') || 'all';
        if (cat !== 'all' && !CATEGORIES.includes(cat)) return json({ error: 'invalid category' }, 400, origin);
        return await getRanking(env, origin, cat);
      }
      if (url.pathname === '/api/score' && request.method === 'POST') return await postScore(request, env, origin);
      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'server error' }, 500, origin);
    }
  },
};
