CREATE TABLE pins (
  id         TEXT PRIMARY KEY,
  jid        TEXT NOT NULL CHECK (length(jid) = 6),
  lat        REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng        REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  placement  TEXT NOT NULL CHECK (placement IN ('country', 'city', 'manual')),
  city       TEXT,
  note       TEXT,
  added_by   TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX pins_created_at ON pins (created_at);
