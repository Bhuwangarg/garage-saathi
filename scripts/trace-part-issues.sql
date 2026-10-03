-- Where did a part actually go?
--
-- Every part that leaves the store writes a ledger row naming the job card it
-- was issued against. This lists those rows newest first, with the card they
-- landed on and the bus that card is for — so an issue made against the wrong
-- card is visible as the wrong bus.
--
-- `on_card` is what that card currently shows for the same part: less than
-- `qty` means the card lost the line (the app repairs this by itself from
-- version d738a6e onward, so it should read the same from now on).
--
-- Paste into the Supabase SQL Editor (Project → SQL Editor → New query).
-- Reads only; it changes nothing. Change the 14 below for a wider window.

WITH led AS (
  SELECT data::jsonb AS d FROM records WHERE store = 'ledger'
),
issues AS (
  SELECT d->>'partId'                            AS part_id,
         d->>'jobId'                             AS job_id,
         NULLIF(d->>'qty', '')::numeric          AS qty,
         COALESCE(NULLIF(d->>'at', '')::bigint, 0) AS at_ms,
         d->>'by'                                AS by_id,
         COALESCE((d->>'reused')::boolean, false) AS reused
  FROM led
  WHERE d->>'type' = 'out'
    AND COALESCE(d->>'jobId', '') <> ''
    AND COALESCE(NULLIF(d->>'at', '')::bigint, 0)
        > (EXTRACT(EPOCH FROM now()) * 1000)::bigint - 14 * 86400000
),
cards AS (SELECT id AS job_id, data::jsonb AS d FROM records WHERE store = 'jobcards'),
buses AS (SELECT id AS bus_id, data::jsonb->>'regNo' AS reg FROM records WHERE store = 'buses'),
parts AS (SELECT id AS part_id, data::jsonb->>'name' AS part_name FROM records WHERE store = 'parts')
SELECT to_char(to_timestamp(i.at_ms / 1000) AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI') AS issued_at,
       COALESCE(p.part_name, i.part_id)        AS part,
       i.qty,
       CASE WHEN i.reused THEN 'used' ELSE 'new' END AS kind,
       COALESCE(u.name, i.by_id)               AS issued_by,
       COALESCE(b.reg, '(no bus)')             AS bus_on_the_card,
       LEFT(COALESCE(c.d->>'problem', '(card not found)'), 44) AS job_card,
       i.job_id,
       COALESCE((SELECT SUM(NULLIF(l->>'qty', '')::numeric)
                 FROM jsonb_array_elements(COALESCE(c.d->'partsUsed', '[]'::jsonb)) l
                 WHERE l->>'partId' = i.part_id
                   AND COALESCE((l->>'reused')::boolean, false) = i.reused), 0) AS on_card
FROM issues i
LEFT JOIN cards c ON c.job_id = i.job_id
LEFT JOIN buses b ON b.bus_id = c.d->>'busId'
LEFT JOIN parts p ON p.part_id = i.part_id
LEFT JOIN users u ON u.id  = i.by_id
ORDER BY i.at_ms DESC;
