CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ms INTEGER NOT NULL,
  yaku TEXT NOT NULL,
  resets INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_ms ON scores (ms);
CREATE INDEX IF NOT EXISTS idx_scores_ip ON scores (ip_hash, created_at);
