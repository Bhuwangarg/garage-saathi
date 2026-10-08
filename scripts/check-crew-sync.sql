-- Why does one phone show fewer crew than another?
--
-- Everything below is what the SERVER holds. Every signed-in device should end
-- up with exactly this, so a phone showing less has failed to store or failed
-- to pull — not been sent less (owner, supervisor and crew manager all receive
-- crew records in full).
--
--   1. totals      — how many crew records exist, and how many are active
--   2. by author   — who created them (`_by` is stamped by the server, not the
--                    device), newest first: confirms the 22 arrived
--   3. photos      — a photo kept INLINE as a data: URL rides in the record on
--                    every sync to every device. A few hundred KB each is what
--                    fills a phone, and a record a phone cannot store is a
--                    person it cannot show
--   4. heaviest    — the biggest crew records, which are the ones that fail
--
-- Paste into the Supabase SQL Editor (Project → SQL Editor → New query).
-- Reads only.

WITH crew AS (
  SELECT r.id, r.data::jsonb AS d, length(r.data) AS bytes, r.updatedAt AS upd
  FROM records r WHERE r.store = 'drivers'
),
rows AS (
  SELECT 1 AS ord, 0::bigint AS sz, '1. totals'::text AS what, ''::text AS who,
         COUNT(*)::text || ' crew records' AS detail,
         COUNT(*) FILTER (WHERE COALESCE(d->>'status','active') = 'active'
                            AND NOT COALESCE((d->>'_deleted')::boolean, false))::text || ' active' AS more
  FROM crew
  UNION ALL
  SELECT 2, COUNT(*)::bigint, '2. added by', COALESCE(u.name, c.d->>'_by', 'unknown'),
         COUNT(*)::text || ' records',
         to_char(to_timestamp(MAX(c.upd) / 1000) AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI') || ' (last)'
  FROM crew c LEFT JOIN users u ON u.id = c.d->>'_by'
  GROUP BY 4
  UNION ALL
  SELECT 3, SUM(bytes)::bigint, '3. photos', 'inline (data: URL)',
         COUNT(*)::text || ' records',
         COALESCE(pg_size_pretty(SUM(bytes)::bigint), '0') || ' carried in every sync'
  FROM crew WHERE d->>'photo' LIKE 'data:%'
  UNION ALL
  SELECT 3, 0, '3. photos', 'hosted (link)', COUNT(*)::text || ' records', 'the record only carries the link'
  FROM crew WHERE d->>'photo' LIKE 'http%'
  UNION ALL
  SELECT 3, 0, '3. photos', 'no photo', COUNT(*)::text || ' records', ''
  FROM crew WHERE COALESCE(d->>'photo', '') = ''
  UNION ALL
  SELECT 4, bytes::bigint, '4. heaviest records', COALESCE(d->>'name', id),
         pg_size_pretty(bytes::bigint),
         CASE WHEN d->>'photo' LIKE 'data:%' THEN 'photo is inline' ELSE '' END
  FROM crew
)
SELECT what, who, detail, more
FROM rows
ORDER BY ord, sz DESC, who
LIMIT 40;
