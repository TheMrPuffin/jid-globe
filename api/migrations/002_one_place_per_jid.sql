-- A JID is one station, so it has one place. From now on the server enforces that when
-- an entry is saved. This tidies up entries saved before the rule existed: every entry
-- of a JID takes the place its first entry was given.
UPDATE pins
   SET (lat, lng, placement, city) = (
         SELECT first.lat, first.lng, first.placement, first.city
           FROM pins AS first
          WHERE first.jid = pins.jid
          ORDER BY first.created_at, first.rowid
          LIMIT 1
       );

CREATE INDEX pins_jid ON pins (jid);
