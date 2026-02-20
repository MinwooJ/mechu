CREATE TABLE IF NOT EXISTS reco_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT,
  mode TEXT,
  ip_country TEXT,
  search_country TEXT,
  top3_place_ids TEXT,
  top3_names TEXT,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reco_events_ts ON reco_events(ts);
CREATE INDEX IF NOT EXISTS idx_reco_events_event_type ON reco_events(event_type);
CREATE INDEX IF NOT EXISTS idx_reco_events_search_country ON reco_events(search_country);
