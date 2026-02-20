BEGIN TRANSACTION;

CREATE TABLE reco_events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT,
  mode TEXT,
  ip_country TEXT,
  search_country TEXT
);

INSERT INTO reco_events_new (
  id, ts, event_type, session_id, mode, ip_country, search_country
)
SELECT
  id, ts, event_type, session_id, mode, ip_country, search_country
FROM reco_events;

DROP TABLE reco_events;
ALTER TABLE reco_events_new RENAME TO reco_events;

CREATE INDEX IF NOT EXISTS idx_reco_events_ts ON reco_events(ts);
CREATE INDEX IF NOT EXISTS idx_reco_events_event_type ON reco_events(event_type);
CREATE INDEX IF NOT EXISTS idx_reco_events_search_country ON reco_events(search_country);

COMMIT;
