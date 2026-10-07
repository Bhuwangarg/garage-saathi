-- Why can one person not stay signed in?
--
-- Four things decide it, and this shows all four for one account at once:
--   account             — does the login exist, what role, when it last worked
--   login switched off  — the account is in `disabledlogins`, so the PIN is
--                         accepted and then every sync is refused (this is what
--                         "it keeps asking me to log in again" looks like)
--   crew record         — a crew-bank row marked left/archived/deleted is what
--                         switches a login off, so this names the cause
--   failed attempts     — five per account in five minutes locks it; the
--                         address line is the shared garage wifi's backstop (50)
--
-- Paste into the Supabase SQL Editor (Project → SQL Editor → New query).
-- Reads only. Change the name on the first line below to check someone else.

WITH who AS (SELECT 'sumit' AS q),
acct AS (
  SELECT u.id, u.name, u.role, u.last_login
  FROM users u, who w
  WHERE lower(u.name) LIKE '%' || w.q || '%'
)
SELECT '1. account'::text AS what,
       a.id::text         AS id,
       a.name::text       AS name,
       a.role::text       AS detail,
       COALESCE(to_char(to_timestamp(a.last_login / 1000) AT TIME ZONE 'Asia/Kolkata',
                        'DD Mon YYYY HH24:MI'), 'never')::text AS more
FROM acct a
UNION ALL
SELECT '2. login switched off', a.id, a.name, 'IN disabledlogins — fix by setting the crew record active again, or delete this row',
       to_char(to_timestamp(d.at / 1000) AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI')
FROM acct a JOIN disabledlogins d ON d.id = a.id
UNION ALL
SELECT '3. crew record', a.id, COALESCE(r.data::jsonb->>'name', ''),
       'status: ' || COALESCE(NULLIF(r.data::jsonb->>'status', ''), 'active')
         || CASE WHEN COALESCE((r.data::jsonb->>'_deleted')::boolean, false) THEN ' + deleted' ELSE '' END,
       r.id
FROM acct a JOIN records r ON r.store = 'drivers' AND r.data::jsonb->>'userId' = a.id
UNION ALL
SELECT '4. failed attempts (last 5 min)', a.id, a.name,
       COUNT(f.*)::text || ' of 5 — the account locks at 5',
       COALESCE(to_char(to_timestamp(MAX(f.at)) AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI'), '')
FROM acct a LEFT JOIN loginfails f
  ON f.k = 'u:' || a.id AND f.at >= EXTRACT(EPOCH FROM now()) - 300
GROUP BY a.id, a.name
UNION ALL
SELECT '5. failed attempts from all addresses', '', '',
       COUNT(*)::text || ' of 50 — everyone behind one wifi shares this',
       ''
FROM loginfails f
WHERE f.k LIKE 'ip:%' AND f.at >= EXTRACT(EPOCH FROM now()) - 300
ORDER BY 1;
