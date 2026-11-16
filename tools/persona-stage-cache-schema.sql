CREATE TABLE IF NOT EXISTS stage_cache (
  key TEXT PRIMARY KEY, operation TEXT NOT NULL, encoding TEXT NOT NULL, payload BLOB NOT NULL,
  bytes INTEGER NOT NULL, stored_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS stage_cache_age ON stage_cache(stored_at);
CREATE INDEX IF NOT EXISTS stage_cache_expiry ON stage_cache(expires_at);
