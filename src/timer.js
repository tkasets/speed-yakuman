export const now = () => performance.now();

export function formatTime(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(2) + '秒';
  const m = Math.floor(s / 60);
  return `${m}分${(s - m * 60).toFixed(2).padStart(5, '0')}秒`;
}
