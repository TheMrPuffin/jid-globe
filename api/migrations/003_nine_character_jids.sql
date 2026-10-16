-- JIDs went from 6 characters (5GB12A) to 9 (5GB123TXA). SQLite can't change a CHECK
-- constraint in place, so the table is rebuilt. Entries saved with the old 6-character
-- codes are kept.
CREATE TABLE pins_new (
  id         TEXT PRIMARY KEY,
  jid        TEXT NOT NULL CHECK (length(jid) IN (6, 9)),
  lat        REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng        REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  placement  TEXT NOT NULL CHECK (placement IN ('country', 'city', 'manual')),
  city       TEXT,
  note       TEXT,
  added_by   TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO pins_new (rowid, id, jid, lat, lng, placement, city, note, added_by, created_at)
SELECT rowid, id, jid, lat, lng, placement, city, note, added_by, created_at FROM pins;

DROP TABLE pins;
ALTER TABLE pins_new RENAME TO pins;

CREATE INDEX pins_created_at ON pins (created_at);
CREATE INDEX pins_jid ON pins (jid);
