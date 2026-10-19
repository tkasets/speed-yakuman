import { API_BASE as CONFIG_BASE } from './config.js';

// 開発用: ?debug=1&api=http://localhost:8787 でAPIの向き先を差し替えられる
const qs = new URLSearchParams(location.search);
const API_BASE = (qs.has('debug') && qs.get('api')) || CONFIG_BASE;

export const rankingEnabled = () => Boolean(API_BASE);

const NICK_KEY = 'speedYakuman.nick';

export function savedNick() {
  try {
    return localStorage.getItem(NICK_KEY) || '';
  } catch {
    return '';
  }
}

async function request(path, options) {
  const res = await fetch(API_BASE + path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'error'), { status: res.status });
  return data;
}

export async function fetchRanking(cat) {
  return (await request('/api/ranking?cat=' + encodeURIComponent(cat))).ranking;
}

// 戻り値: { name, rank, cat }
export async function submitScore({ name, ms, yaku, resets }) {
  try {
    localStorage.setItem(NICK_KEY, name);
  } catch {
    /* 保存できなくても続行 */
  }
  return request('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ms, yaku, resets }),
  });
}
