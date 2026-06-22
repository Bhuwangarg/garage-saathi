# Garage Saathi — Use-Case Review

76 verified suggestions across 13 use cases (each adversarially checked against the code; 2 dropped as already-existing).

## Auth, PINs & role boundaries

### [HIGH · L · feature] No way to change your own PIN or for the owner to reset/revoke a staff PIN
- **Where:** sheetStaff app.js:1230-1246 (only Add); viewMe menu app.js:841-850; no change/reset/disable action exists anywhere (confirmed via grep)
- **User need:** Mechanics share PINs, a driver leaves, or someone shoulder-surfs the 4 digits. The owner needs to rotate or kill a login without recreating the whole roster, and staff want to set their own secret PIN instead of one the owner typed.
- **Change:** sheetStaff shows the team list as read-only chips with no per-user actions, and there is no 'Change PIN' entry in viewMe. Add (1) a 'Change my PIN' action in viewMe that re-PINs the current user (server update + credSet), and (2) per-row 'Reset PIN' and 'Disable account' actions in sheetStaff (owner/supervisor) that call new Sync endpoints. Disabling must also stop offline login: filter disabled users out of renderLogin's user tiles and clear their 'creds' entry, otherwise a revoked staffer's cached PIN keeps working forever offline.

### [HIGH · S · trust] seedCreds() plants working demo PINs (1111/2222/3333…) on every boot, including production
- **Where:** seedCreds app.js:1918-1924, called unconditionally in boot() at app.js:1944; also credSet('u-d1','0010') at app.js:1963
- **User need:** The owner believes the server validates PINs. But the seeded canonical user IDs (u-owner, u-sup, u-store, u-m1…) ship with hard-coded PINs cached locally, so anyone who knows '1111' can sign in offline as the owner on a fresh device.
- **Change:** seedCreds writes the real demo PINs into the offline 'creds' cache whenever localStorage has no creds key — which is true on every fresh/cleared device, not just a demo. Combined with the offline fallback in attemptLogin, these are fully functional credentials, not just hints. Gate seedCreds behind the same LAN/localhost check used for the on-screen hint (app.js:1876), or behind an explicit DEMO flag, so a production deployment never ships known PINs. The same applies to the unconditional credSet('u-d1','0010') in the drivers backfill (app.js:1963).

### [MEDIUM · S · trust] Logout leaves cached PINs on the device — next person can still log in offline
- **Where:** renderLogin/attemptLogin flow; logout handler app.js:1858 (case 'logout'); credGet app.js:1913; Sync.logout sync.js:61
- **User need:** In a small Jaipur garage one cheap Android phone is shared. The owner logs out, hands the phone to a mechanic; or a phone is lost. Logout must actually end access, not just drop the sync token.
- **Change:** logout() in sync.js only clears the token. The offline path in attemptLogin (app.js:1933) still trusts credGet(user.id) === pin from the persistent 'creds' localStorage map, which is never cleared. So after any logout, anyone can pick a user tile and sign in fully offline using a previously-cached PIN. Decide a policy: either (a) on explicit logout, remove that user's entry from 'creds' so re-login requires the server, or (b) keep the cache but require a successful server login at least once per session. At minimum add a 'Forget PINs on this device' action in the Sync/Me menu that does localStorage.removeItem('creds').

### [MEDIUM · S · trust] Owner and supervisor are identical — supervisor can create other supervisors (privilege escalation)
- **Where:** PERMS app.js:120-132 (every entry lists owner+supervisor together); openStaff gated to owner+supervisor app.js:844-847; role dropdown app.js:1240-1241 offers Supervisor
- **User need:** The owner expects to be the only one who can hand out access. A supervisor is a trusted senior mechanic, not the business owner — they should run jobs and stock, but not mint new admin-level accounts.
- **Change:** There is no single owner-exclusive capability: every PERMS entry pairs owner with supervisor, and the Staff menu is shown to both. So a supervisor can open Staff and create a new account with role=Supervisor (or even reset others). Introduce a 'manageStaff' perm scoped to ['owner'] and gate the openStaff menu item and saveStaff on it. Either remove 'Supervisor' from the role dropdown for non-owners, or restrict who can grant the supervisor role. This makes 'owner managing access' a real, enforced boundary instead of a cosmetic crown emoji.

### [MEDIUM · S · trust] Offline PIN entry has no attempt limit — 4-digit brute force on a stolen phone
- **Where:** attemptLogin offline branch app.js:1932-1935; renderPin pinpad app.js:1884-1907
- **User need:** Lockout is the owner's safety net against guessing. But it only exists server-side (sync.js:48 handles 429). On a lost/stolen phone with no network, an attacker can try all 10000 PINs against the plaintext cached credential with zero throttling.
- **Change:** The offline branch compares credGet(user.id) === pin directly with no counter. Add a device-local, per-user failed-attempt counter in localStorage that enforces a cooldown (mirroring the server's lockout) inside attemptLogin's offline path, with exponential backoff after e.g. 5 wrong tries. Also consider not storing the PIN itself in 'creds' but a salted hash, so a stolen phone's localStorage doesn't reveal every staffer's PIN in plaintext.

### [MEDIUM · S · trust] Demo PIN cheat-sheet is shown on LAN IPs — exactly how the garage runs in production
- **Where:** renderLogin app.js:1876-1877 (regex matches 192.168/10./172.16-31/127. as well as localhost)
- **User need:** A real Jaipur garage opens the PWA over local WiFi at an address like 192.168.1.x. The owner does not want the owner/store/mechanic PINs printed on the login screen for everyone standing around to read.
- **Change:** The condition that prints 'Demo PINs — Owner 1111 · Store 3333 · Mechanic 0001' treats all RFC-1918 private ranges (192.168.x, 10.x, 172.16-31.x) as 'demo', but those are precisely the addresses a self-hosted garage server uses on local WiFi. Restrict the hint to localhost/127.0.0.1 only, or hide it whenever the seed/demo flag is off, so production logins never display working credentials.

## Bilingual + mobile + accessibility

### [HIGH · L · content] Most screens leak English in Hindi mode — only ~40 keys exist for ~174 t() calls; everything else is hardcoded
- **Where:** app.js:7-28 (I18N dict) vs every view, e.g. viewStoreHome app.js:404-426 ('Stock value','Low stock','Add stock','Issue part','Reorder soon','Stock healthy','Pending to suppliers','Tap to view bills','Open jobs'), sheetAddJob app.js:966-991 (every label/placeholder), viewMe app.js:841-850 ('More','Drivers','Staff','Sync')
- **User need:** A Hindi-first mechanic or storekeeper with low English literacy taps the हिंदी toggle expecting the app in Hindi, but the nav labels translate while the actual content — card titles, buttons, form fields, the greeting 'Namaste' — stay English. They can't trust or operate a half-translated screen and fall back to guessing by icon.
- **Change:** Expand the I18N dictionary to cover the strings users actually read and act on: card headings, the two storekeeper action buttons (Add stock / Issue part), all sheetAddJob field labels + placeholders + priority options, the viewMe 'More' menu rows, and the greeting. Route every literal through t(). Prioritize the home dashboards, the job/issue/receive forms, and viewMe first since those are the daily-use surfaces. This is the single biggest fix for the Hindi-first use case.

### [HIGH · M · content] Toasts and confirm() dialogs — the words shown at the critical moment of an action — are always English
- **Where:** Toasts: issuePart app.js:193-210, saveJob app.js:999-1016 ('Describe the problem','Pick who to assign this to'), doAttendance app.js:858-888 ('Take a selfie to check in','Selfie required','Getting location…','Checked in (late)'). Native confirm(): app.js:873 and 882 ('Could not get your location. Mark attendance without GPS verification?', 'You are Xm from the garage … Record anyway?')
- **User need:** These messages fire exactly when something succeeded, failed, or needs a yes/no decision — the highest-stakes microcopy. A Hindi-first user who can't read 'Selfie required to mark attendance' or the GPS confirm dialog will silently abandon attendance or tap the wrong button, defeating the anti-fraud purpose.
- **Change:** Move toast strings and the two confirm() prompts through t() with Hindi entries. For confirm(), since native dialogs can't be styled, at minimum localize the message string passed in. Validation toasts ('Describe the problem', 'Enter quantity', 'Only X in stock') should be bilingual since they block task completion.

### [HIGH · S · content] Login and PIN screens are pre-login English-only with no language toggle — first impression fails Hindi-first users
- **Where:** renderLogin app.js:1865-1882 ('Garage maintenance, Jaipur', role shown raw as 'owner'/'store'/'mechanic', 'Demo PINs…') and renderPin app.js:1884-1907 ('Enter PIN'). The .lang toggle only exists in topbar() app.js:356 which renders after login.
- **User need:** The very first thing every user sees on a cold start is the user-picker and PIN pad. A Hindi-first worker sees English role tags and 'Enter PIN' with no way to switch language because the toggle lives inside the post-login top bar. The app feels foreign before they even log in.
- **Change:** Add a small language toggle to renderLogin (and carry it into renderPin), and run 'Enter PIN', the tagline, and the role labels through t(). Add Hindi role names (मालिक/सुपरवाइज़र/स्टोर/मैकेनिक/ड्राइवर) — these are also shown untranslated in viewMe:820 and the driver/staff lists. Roles are user-facing identity labels, not codes, so they must localize.

### [HIGH · S · accessibility] --muted grey (#8b91a0) on white fails contrast, and it's used for the bulk of secondary information
- **Where:** styles.css:7 (--muted:#8b91a0 ≈ 2.6:1 on white), applied via .muted styles.css:72, .small:73, .tiny:74 (11.5px), .li .main .s:195, .bottomnav button:58 — i.e. list subtitles, timestamps, 'X left · reorder at Y', tab labels, most helper text
- **User need:** A worker in a bright, dusty Jaipur garage holding a cheap low-brightness phone in daylight needs readable text. Light-grey 11–13px subtitles carry load-bearing info (qty left, distance from garage, dates) but are nearly invisible outdoors and fail WCAG 1.4.3 (needs 4.5:1, or 3:1 for large text).
- **Change:** Darken --muted to roughly #5c6373 (≈4.6:1 on white) so secondary text and bottom-nav labels become legible, and bump .tiny from 11.5px (styles.css:74) to ~12.5–13px. Low-cost change that lifts readability across nearly every screen.

### [MEDIUM · S · accessibility] viewport blocks pinch-zoom (maximum-scale=1) — locks out users who need to enlarge text
- **Where:** index.html:5 — <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
- **User need:** Older garage owners and workers on cheap small Android screens routinely pinch-to-zoom to read small text. maximum-scale=1 disables that entirely. Combined with the app's 11–13px secondary text, a presbyopic user simply cannot make the text bigger — a hard accessibility barrier and a WCAG 1.4.4 failure.
- **Change:** Remove maximum-scale=1 from the viewport meta. There is no real reason to block zoom in a content app; double-tap and accidental zoom concerns are outweighed by readability for the target demographic. Keep width=device-width and viewport-fit=cover.

### [MEDIUM · S · ux] Language toggle is a tiny 12px pill in the top-right corner — undiscoverable and unreachable one-handed
- **Where:** .lang in styles.css:46-47 (font-size:12px, padding:5px 12px) rendered top-right in topbar() app.js:356; tb-right width is only 60px (styles.css:36) and also holds the sync chip
- **User need:** A Hindi-first user must FIRST find the language switch, but it's a small low-contrast pill labelled only 'हिंदी'/'EN' crammed next to the sync chip in the hardest-to-reach corner for a right-handed thumb on a large phone. Many won't notice it exists, so they never get Hindi at all.
- **Change:** Either (a) add a clearly-labelled 'भाषा / Language' row inside viewMe's More menu (app.js:841) as the primary, thumb-reachable entry point, or (b) enlarge the .lang pill and give it a globe icon (🌐 हिंदी) so it reads as a language switch rather than a stray abbreviation. Combine with the login-screen toggle (separate suggestion) so it's reachable from minute one.

## Owner — dashboard, cost control & billing owners

### [HIGH · M · feature] Make "Cost by company" tappable → a billable line-item breakdown per company
- **Where:** viewHome owner branch, costByCompany card (app.js:538-546); needs a new data-company handler in bind() (~app.js:1835) and a viewCompanyDetail()
- **User need:** The owner's whole reason to use this is to bill each transport company. The card promises "Bill each owner accurately from this" but it is a dead bar — there is no way to see WHICH jobs/parts/labour make up Sahara's ₹X. Between calls the owner needs to drill into a company and read off the line items to actually raise an invoice or defend the amount when the company argues.
- **Change:** Add data-company="<name>" to each hbar row and a new viewCompanyDetail(company) that lists every job for that company's buses with date, regNo, parts cost, labour, external, and a running total. Group by bus so the owner can see "KA-01 cost you ₹12k across 3 jobs". This turns a vanity chart into the billing worksheet the tagline already claims it is.

### [HIGH · M · feature] Surface a money-pit bus ranking with week-over-week trend on the owner home
- **Where:** busCostPerKm (app.js:266-269) only used inside computeInsights (app.js:1622); 7-day chart has no trend indicator (app.js:486-497)
- **User need:** The owner asks "which bus is bleeding me and is my repair spend getting better or worse?" The cost/km calc exists but is buried in Insights and only fires when one bus is 1.8x the median. The home chart shows 7 bars but never says whether this week is up or down vs last — so the owner cannot tell at a glance if costs are trending the wrong way.
- **Change:** Add a small top-3 "Most expensive buses (₹/km)" card on the owner home tapping through to each bus, and add a trend caption to the repair-cost pill (e.g. "↑ 18% vs last week") by comparing costSeries totals for this 7 days vs the prior 7. Both reuse existing functions; busCostPerKm's odometer math should also be documented/guarded since lastServiceOdo can produce a tiny denominator and inflate ₹/km.

### [HIGH · S · bug] Fix the time-window mismatch and label confusion on cost-by-company
- **Where:** costByCompany (app.js:258-264) sums ALL jobs ever; rendered under a card alongside "last 7 days"/"this month" framing (app.js:486-496)
- **User need:** The owner reads the dashboard as a current snapshot (the chart says 7 days, the pill says "this month"). But costByCompany silently totals every job since the garage started using the app. So the company bars keep growing forever and can never match a monthly invoice — the owner will either over-bill or stop trusting the number entirely.
- **Change:** Add a period parameter to costByCompany(sinceMs) defaulting to the same 30-day window as costLast30(), and label the card "Cost by company · last 30 days". Optionally add a small This-month / All-time toggle. Aligning the window is what makes the number safe to bill from.

### [MEDIUM · M · feature] Show margin, not just cost, in cost-by-company (what to charge vs what it cost you)
- **Where:** jobCost (app.js:247-252) and costByCompany card (app.js:542-545); labour is a hardcoded ₹250/hr with no billable rate concept
- **User need:** The owner's real decision is "am I making money on this company?" Today the app only shows internal cost (parts at unitCost + ₹250/hr labour). There is no billable rate or markup, so the owner can see they spent ₹20k on Sahara but not whether the ₹25k they charge actually covers it across the fleet — which is how garages quietly lose money on a bad contract.
- **Change:** Add an optional billable labour rate / parts markup % (store in meta or per-company). Surface a second number per company bar: cost vs billable, with the margin. Even a single garage-wide markup % turns the cost chart into a profitability view the owner can act on.

### [MEDIUM · S · feature] Add an export / share button for a company bill (WhatsApp / copy text)
- **Where:** new viewCompanyDetail() (proposed above); reuse pattern near costByCompany (app.js:539). navigator.share is currently unused anywhere in app.js (grep: 0 hits)
- **User need:** A Jaipur garage owner does not type invoices into Tally between calls — they send a WhatsApp message: "Sahara June repairs: KA-01 ₹12,000, KA-07 ₹8,500, total ₹20,500". Right now the data exists but is trapped on screen; the owner has to hand-copy numbers, which is exactly where billing errors and disputes start.
- **Change:** On the company detail view add a "Share bill" button that builds a plain-text summary (company, period, per-bus totals, grand total) and calls navigator.share({text}) with a clipboard-copy fallback for cheap phones that lack the share API. Keep it text, not PDF, so it works offline and pastes straight into WhatsApp.

### [MEDIUM · S · ux] Relabel/repoint the "Pending bills" tile — it means money owed to suppliers, not company billing
- **Where:** qtile for pending (app.js:504), pending computed from purchases.paymentStatus (app.js:470); tile navigates to 'me' not purchases
- **User need:** An owner glancing at "Pending bills ₹45,000" on their dashboard naturally reads it as "companies owe me ₹45k" (income). It actually means "I owe suppliers ₹45k" (outgoing). This is a money-direction misread on the one screen where the owner makes cash decisions — and tapping it dumps them on the generic Me menu, not the bills.
- **Change:** Rename the tile to "Owed to suppliers" (Hindi: "दुकानदार को देना") and point it at 'purchases' instead of 'me' (qtile already takes a nav arg). Use the amber colour to reinforce it is money going out.

## Supervisor — create, assign, verify job cards

### [HIGH · M · feature] No way to reassign or edit a job after creation
- **Where:** viewJobDetail (app.js:740-751) actions block; sheetAddJob (app.js:966) only sets assignee/priority at create time
- **User need:** A floor supervisor constantly reshuffles work: the assigned mechanic goes on lunch, calls in sick, or a higher-priority bus comes in. They also mistype the bus/problem/priority. Right now the assignee, priority, problem, vendor and labour hours are frozen the instant saveJob runs — there is zero edit path in viewJobDetail. The supervisor's only workaround is to keep the wrong job and live with it, or never use the field properly.
- **Change:** Add an 'Edit / Reassign' button in viewJobDetail (visible to owner/supervisor while status !== 'verified') that opens a sheet prefilled from the job (reuse the sheetAddJob form fields: mechanic select, priority, problem, vendor, hours, notes). On save, mutate the existing jobcard via DB.put instead of creating a new id. The reassign dropdown is the single highest-value fix — it is the action a supervisor takes many times a day and the app currently can't do it at all.

### [HIGH · S · feature] Verify is accept-only — no reject / send-back-for-rework path
- **Where:** verifyJob (app.js:1323-1334) and the actions block in viewJobDetail (app.js:745-747)
- **User need:** When a supervisor inspects a 'done' job and the work is bad (brake still spongy, wrong part fitted, after-photo doesn't show the repair), their only buttons are Verify (accept) or nothing. So they either rubber-stamp bad work or leave the card stuck in 'done' with no signal to the mechanic about what's wrong. Verification is the supervisor's quality gate and it has no fail branch.
- **Change:** Add a 'Send back' button next to Verify for status==='done'. It opens a small sheet for a rejection reason, sets j.status back to 'in-progress', appends the reason to j.notes (or a reworkNotes log with timestamp), and clears closedAt. The mechanic then sees the card return to their open list. This closes the rework loop that markDone/verifyJob currently leave open.

### [HIGH · S · trust] verifyJob does not enforce that proof photos exist
- **Where:** verifyJob (app.js:1323-1328); contrast with markDone (app.js:1308-1318) which DOES gate on photos, and the comment at viewJobDetail (app.js:696-698) acknowledging a 'no proof photo' flag can persist onto verified jobs
- **User need:** markDone forces before+after photos (or a vendor bill), but a job can reach 'done' status through other code paths or have its photos be empty in edge cases, and verifyJob blindly stamps verified/verifiedBy with no re-check. The whole anti-pilferage / proof-of-work value proposition collapses if a supervisor can verify a job with no photographic proof. For an owner billing each bus company off these cards, an unverifiable-but-verified job is a trust and audit hole.
- **Change:** In verifyJob, before stamping verified, re-run the same proof check markDone uses (in-house: before AND after present; vendor: at least one bill photo). If missing, toast 'Cannot verify — proof photo missing' and abort. Optionally surface a red 'No proof photo' badge in jobLi/viewJobDetail so the supervisor sees it before tapping Verify.

### [MEDIUM · M · ux] Jobs list has no filter, grouping, or search
- **Where:** viewJobs (app.js:669-678) renders one flat sorted list of ALL job cards
- **User need:** A busy garage accumulates dozens of jobs. A supervisor wanting 'all open jobs for Suresh' or 'everything on bus RJ14-1234' or 'all outside-vendor jobs' has to eyeball a single long scrolling list on a cheap small Android screen. The assignee and bus are shown only as text in each row, never as a filter. This makes daily allocation and follow-up slow.
- **Change:** Add filter chips at the top of viewJobs: status (open / in-progress / done / verified), and mechanic. Optionally a bus filter when navigating from a bus. Keep it to tappable chips (low digital literacy, no typing) rather than a text search. Even a single status chip row would cut scrolling dramatically.

### [MEDIUM · S · ux] Done-awaiting-verify queue is invisible on the supervisor home
- **Where:** Supervisor home quick-stat tiles (app.js:500-505) only show openJobs.length; viewJobs sort (app.js:672-675) buries 'done' jobs at sort index 2 below all open/in-progress
- **User need:** Verifying completed work is the supervisor's single most time-sensitive daily action — a verified job is what lets the owner bill and frees the bus. But the home screen tile only counts 'open' jobs, and in the jobs list 'done' jobs sit in the middle of the pile. The supervisor has no at-a-glance signal that 3 jobs are sitting finished and waiting for their sign-off, so buses sit idle and billing is delayed.
- **Change:** Add a 'To verify' quick-tile on the supervisor/owner home counting jobs where status==='done', tapping through to jobs. Either pin done-status jobs to the TOP of viewJobs for verifier roles (flip the sort order so 'done' is index 0 for owner/supervisor), or add a 'Needs verify' filter chip. A simple count badge is enough to change behaviour.

### [MEDIUM · S · ux] Driver-report linking is hidden and easy to miss when problem is typed manually
- **Where:** reportPicklist (app.js:960-965) inside sheetAddJob (app.js:979); reports auto-resolve only via the link in saveJob (app.js:1014-1015) and verifyJob (app.js:1330-1332)
- **User need:** When a driver reports 'front brakes weak', the supervisor often just creates a fresh job and types the problem rather than ticking the matching report checkbox — especially since the picklist is tucked in a tinted sub-card with tiny muted text. The result: the driver's open report is never linked, so it never auto-resolves on verify, and the driver keeps seeing it as open. The loop silently breaks even though the linking machinery exists.
- **Change:** Make the report picklist more prominent when openReportsForBus returns matches: render each open report as a tappable suggestion that, when tapped, both ticks the link AND pre-fills the problem textarea (#f-prob) with the report text. Show a count badge ('2 driver reports waiting') on the sub-card header so the supervisor can't overlook it. This nudges supervisors to link instead of retype and keeps the driver feedback loop closed.

## Supervisor — buses, documents & compliance

### [HIGH · M · content] Warn earlier — 30/45-day lead time, not 15 days
- **Where:** docStatus app.js:229-234 and allDocAlerts app.js:235-244 (dl<=15); busLi app.js:574
- **User need:** Renewing insurance, fitness or a permit in Jaipur means an agent or an RTO visit and several days of waiting. A 15-day warning is too late — the supervisor needs weeks to act, especially over patchy network where they may not open the app daily. Driving on a lapsed fitness/permit means impounding and fines.
- **Change:** Introduce two thresholds: amber at <=45 days ('renew soon') and red at <=15 days or expired ('urgent'). Update docStatus to return both bands, raise the allDocAlerts cutoff to 45, and keep red reserved for <=15/expired so the home and alerts badges still highlight true emergencies. Show the band label in Hindi too.

### [HIGH · M · feature] Let supervisors update odometer without a GPS tracker
- **Where:** serviceInfo app.js:292-298 (reads b.odometer, only set in showGps app.js:1351); busesDueService app.js:300-303
- **User need:** Most small Jaipur garages have no live GPS box. With no tracker, the odometer set at bus creation never changes, so serviceInfo always says 'OK' and preventive maintenance silently never fires — the one feature meant to prevent breakdowns is dead for these users. Supervisors read the dashboard odometer manually every week.
- **Change:** Add an editable odometer field on viewBusDetail (a small 'Update km' button writing b.odometer + a timestamp), and add a time-based fallback to serviceInfo: if lastServiceDate is older than N months (e.g. 6) flag 'soon'/'overdue' even when km is low. This makes service-due work for non-GPS fleets and catches buses that sit idle but still age.

### [HIGH · S · feature] Store a photo/scan of each compliance document
- **Where:** viewBusDetail docs section app.js:639-645; sheetAddDoc app.js:926-938; saveDoc app.js:940-949
- **User need:** When traffic police or RTO stop a bus, the driver/supervisor must show the actual insurance/fitness/PUC/permit certificate, not just a number typed into the app. Low-literacy staff trust a photo of the real paper far more than a date field, and a snapshot is the easiest thing to capture on a cheap phone.
- **Change:** Add an optional photo to the document record. In sheetAddDoc add a '📷 Add document photo' button (reuse capturePhoto + Sync.uploadPhoto like incidentPhoto at app.js:1850), store the URL on the doc object in saveDoc, and in viewBusDetail render a thumbnail next to each doc that opens viewPhoto on tap. This turns the docs card into an on-the-go document wallet.

### [HIGH · S · bug] Mark service done with real odometer, parts and cost
- **Where:** logService app.js:1378-1392
- **User need:** A supervisor logging a completed service wants the record to reflect what actually happened (current odometer, oil/filter cost, who did it). Today the function fabricates a 'verified' job with labourHours:2, externalCost:0 and no odometer prompt, so cost analytics under-count service spend and the odometer never advances without GPS — corrupting both the cost-per-km and the next service-due calculation.
- **Change:** Replace the silent write with a small sheet: confirm/enter current odometer (defaulting to b.odometer), optional cost and a one-line note. Set b.odometer and b.lastServiceOdo from the entered value, and write the job card with the real externalCost so service spend shows in costByCompany/costLast30. Keep it a single screen so it stays fast for low-literacy users.

### [MEDIUM · S · ux] Show a service-due badge on the bus list and a quick action in alerts
- **Where:** busLi app.js:573-581 (only counts doc alerts); viewAlerts app.js:1284-1293
- **User need:** A supervisor scanning the bus list (viewBuses) wants to spot at a glance which buses need service, not just which have expiring papers. Right now an overdue-service bus looks identical to a healthy one, and the alerts page lists only documents — so service and compliance are split across two mental models.
- **Change:** In busLi, also compute serviceInfo(b) and render an amber/red '🛢️ service' chip when status is soon/overdue alongside the doc-alert badge. Optionally fold busesDueService() into viewAlerts as a second section so 'Alerts' becomes the single fleet-health screen the supervisor checks each morning.

### [MEDIUM · S · ux] One-tap 'renewed' to extend a document's expiry from the alert
- **Where:** viewAlerts list rows app.js:1287-1290; home alerts app.js:552-553; sheetAddDoc/saveDoc app.js:926-949
- **User need:** After actually renewing insurance/PUC, the supervisor's only path is: open the bus, scroll to docs, tap the doc, change the date, save. That's four steps per document on a small phone, so people skip it and the alert stays red — eroding trust that red badges mean something real.
- **Change:** Add a '✅ Renewed' button directly on each alert row (and on the doc row in viewBusDetail) that opens a one-field sheet pre-set to type/number, asking only for the new expiry date (default +1 year), then writes it via the existing saveDoc path. This closes the compliance loop in two taps and keeps alert counts honest.

## Store keeper — stock in/out, ledger & pilferage trail

### [HIGH · M · trust] Add a Stock-take / count-correction action that logs an audited adjustment
- **Where:** viewPartDetail (app.js:784) + new sheetAdjustStock/confirmAdjust action wired in bind() near app.js:1820; ledger schema in db.js
- **User need:** A storekeeper physically counts the shelf and finds 8 brake pads but the system says 10 (theft, breakage, a missed issue). Today there is NO way to reconcile: stock can only go OUT via issuePart (app.js:190, requires a job card) and only IN via receiveStock. So the honest storekeeper is forced to either invent a fake job to write off the missing 2, or leave the count wrong forever — which destroys the whole pilferage-trail premise.
- **Change:** Add an 'Adjust count' button on viewPartDetail. Open a sheet asking for the real counted quantity and a mandatory reason (e.g. 'physical count', 'damaged', 'wrong entry'). Compute delta = counted − p.qty, set p.qty = counted, and write a ledger row of type 'in' or 'out' with reason `Stock-take: <reason> (was X, now Y)`, by:S.user.id. This keeps the ledger complete and turns reconciliation into an auditable event instead of a silent edit. Gate behind can(role,'issuePart').

### [HIGH · M · feature] Allow returning an unused part back to stock from the job card
- **Where:** issuePart (app.js:190) is decrement-only; partsUsed render in viewJobDetail (app.js:719-722); ledger
- **User need:** A mechanic is issued 1 clutch plate against a job, but it turns out the wrong part or the job needs only part of the issued oil. The storekeeper has no 'return to stock' path, so stock stays understated, the job's parts cost stays inflated (which feeds cost analytics and per-bus ₹/km), and the part may quietly disappear. Returns are a normal daily event in a garage.
- **Change:** On each partsUsed line in viewJobDetail (next to the qty), add a small 'Return' control for users with issuePart permission while job.status!=='verified'. On confirm: increment part.qty, reduce/remove the partsUsed line and its cost, and write a ledger row type 'in', jobId set, reason 'Returned from job'. This closes the loop so the ledger truly reflects net consumption.

### [MEDIUM · S · ux] Add a search box to the parts list and to the Part/Issue dropdowns
- **Where:** viewStore parts list (app.js:772-778); sheetIssue part <select> (app.js:1030); sheetAddStock <select> (app.js:1099)
- **User need:** A real garage store has dozens of part types. On a cheap Android phone the storekeeper must scroll a flat list (viewStore) to find 'oil filter', and a long <select> is even worse to scrub through one-handed while a mechanic waits. Finding the right part fast is the single most repeated store action.
- **Change:** Add a sticky text input at the top of viewStore that filters the rendered parts by name/partNo/category (client-side, re-filter on input). For the issue/add-stock sheets, either add a filter input above the <select> or sort the options so low/relevant parts surface first. Low cost, big daily time saving.

### [MEDIUM · S · bug] Make part details (reorder level, unit cost, name, partNo) editable
- **Where:** viewPartDetail read-only (app.js:784-810); fields only ever set in saveAddPart (app.js:1078) and confirmAddStock (app.js:1136)
- **User need:** reorderLevel and unitCost are captured once at part creation and can NEVER be changed afterward. But the low-stock alert (viewStoreHome app.js:406, Insights app.js:1639) lives or dies on reorderLevel, and a part created via the '➕ New part' path in sheetAddStock with cost 0 will report stock value ₹0 forever if it's never received with a cost. A wrong reorder level means the storekeeper either gets nuisance LOW flags or runs out silently.
- **Change:** Add an 'Edit part' button on viewPartDetail opening a sheet to update name, partNo, category, reorderLevel and unitCost (and unit). Do NOT let it silently change qty — that's what the stock-take action is for. Persist via DB.put('parts',...). Gate behind issuePart permission.

### [MEDIUM · S · trust] Show a running balance in the stock ledger so it ties out to the shelf
- **Where:** viewPartDetail ledger render (app.js:800-808)
- **User need:** The ledger is sold as 'your pilferage trail' (app.js:800) but it only lists +/− movements. To actually audit pilferage the storekeeper must mentally add/subtract every row to see whether the ledger reconciles to today's physical count — impossible on a phone for a low-digital-literacy user. Without a balance column the trail is decorative.
- **Change:** Since moves are already sorted newest-first, walk them oldest→newest once to compute a cumulative balance, then render each row with its resulting balance (e.g. '→ 8 pc'). Show the final balance prominently and, if it disagrees with p.qty, surface a small 'ledger vs stock mismatch' warning that nudges a stock-take. Turns the ledger into a real reconciliation tool.

### [MEDIUM · S · trust] Warn (don't silently allow) when issuing more than half of remaining stock, and surface stock state in the issue dropdown
- **Where:** issuePart guard (app.js:196) and sheetIssue option labels (app.js:1030)
- **User need:** issuePart already blocks issuing more than in stock (good), but a large issue that empties or nearly empties a part is exactly the pattern that masks pilferage, and the storekeeper gets no heads-up. The part dropdown shows '(N unit)' but doesn't flag a LOW or zero-stock part, so it's easy to issue against a part that's about to stock out — the mechanic discovers it mid-job.
- **Change:** In sheetIssue option labels, append a 'LOW' / 'OUT' marker for parts at/below reorderLevel or qty 0 (mirroring the viewStore badge). In issuePart, when qty would drop a part to 0 or below reorderLevel, show a confirm() like 'This will leave only N left / empty this part — continue?' before committing. Cheap friction that protects the count without blocking legitimate large issues.

## Store keeper — supplier bills & payments

### [HIGH · M · bug] Allow editing or deleting a wrong bill
- **Where:** viewPurchases (app.js:1266-1282) — no edit/delete affordance; savePurchase only creates (app.js:1193)
- **User need:** Bills get entered with the wrong amount, wrong supplier, or as duplicates (easy on a flaky phone where a tap seems to do nothing and the keeper taps Save twice). There is currently no way to fix or remove a purchase, so a wrong entry permanently corrupts the pending-to-suppliers total with no recourse.
- **Change:** Make each purchase row open a detail sheet (data-pur navigation) with Edit and Delete actions guarded by can(role,'addPurchase'). Edit reuses the add-purchase form pre-filled; Delete confirms then removes the record (and, if it had received part lines, warns that stock was already added so the keeper can reverse it manually). This gives the books an undo path and stops duplicate/typo bills from poisoning the totals.

### [HIGH · S · bug] Validate the bill amount and reconcile it against entered part lines
- **Where:** savePurchase (app.js:1181-1201)
- **User need:** The keeper enters a bill total and (optionally) per-part costs. Right now amount uses Number(...)||0, so a blank or mistyped amount silently saves a ₹0 bill that vanishes from the pending total — money the garage actually owes disappears from the books. And the sum of part-line costs is never compared to the typed total, so a fat-finger error goes unnoticed.
- **Change:** After the supplier check (line 1183), require a positive amount (toast 'Enter bill amount' and return if <=0). Compute the sum of lines (l.qty*l.cost) and if it differs from the typed amount by more than a rupee, show a confirm/banner ('Parts total ₹X but bill says ₹Y — save anyway?') so the keeper catches data-entry mistakes before the bill is committed.

### [MEDIUM · M · feature] Support partial payments instead of only all-paid / all-pending
- **Where:** togglePaid (app.js:1202-1210); savePurchase amount handling (app.js:1193-1197); purchases schema (db.js:17,188)
- **User need:** Small garages routinely pay suppliers in installments ('paid 10k of the 28k bill, rest next week'). The current model is binary: a bill is either fully paid or fully pending, so any part-payment forces the keeper to either lie ('paid') or undercount the books ('pending'), and the pending-to-suppliers total becomes wrong.
- **Change:** Add a paidAmount field on purchases (default 0). Replace the single 'Mark paid' button with a 'Record payment' action that opens a small sheet to enter an amount; set paymentStatus to 'paid' when paidAmount>=amount else 'partial'. Make the pending total at app.js:1268 sum (amount - paidAmount) so it stays accurate, and show 'paid X of Y' on partially-paid rows.

### [MEDIUM · M · feature] Show payment date and add a payment due-date / overdue flag
- **Where:** viewPurchases rows (app.js:1272-1279); sheetAddPurchase (app.js:1158-1170); togglePaid sets paidAt (app.js:1207)
- **User need:** The keeper needs to answer 'which bills are overdue?' and 'when did we pay this one?'. paidAt is recorded on togglePaid but never displayed, and there is no due date at all, so nothing nudges the keeper before a supplier stops giving credit — a real risk for a garage that buys parts on terms.
- **Change:** Add an optional dueDate field in the add-purchase sheet. In viewPurchases, surface paidAt as 'Paid on <date>' on settled rows, and on pending rows past their dueDate show a red 'OVERDUE' badge and sort/float them to the top. Optionally feed overdue bills into viewAlerts so they appear alongside document-expiry alerts the keeper already checks.

### [MEDIUM · S · feature] Track supplier-wise outstanding totals, not just one grand total
- **Where:** viewPurchases (app.js:1266-1282); viewStoreHome pending card (app.js:421)
- **User need:** A store keeper settles accounts supplier by supplier ('how much do we owe Jaipur Auto Spares?'), not as one lump sum. Today the only number is the combined pending total, and the bill list is a flat date-sorted feed, so to total one supplier's dues you must mentally add up scattered rows.
- **Change:** In viewPurchases, group pending bills by supplier and render a small summary card per supplier with their outstanding amount and bill count, above the flat list (or make each supplier name a collapsible group). Compute it the same way the grand total is built at line 1268 but keyed by p.supplier. This lets the keeper walk into a payment conversation knowing the exact figure.

### [MEDIUM · S · ux] Reuse known suppliers instead of free-typing the name every time
- **Where:** sheetAddPurchase supplier input (app.js:1159); savePurchase (app.js:1182)
- **User need:** On a cheap Android keyboard with Hindi-first, low-literacy users, retyping 'Jaipur Auto Spares' each bill is slow and produces typo variants ('Jaipur auto spare', 'JP Auto') that fragment the supplier-wise totals and pending figures, defeating any per-supplier tracking.
- **Change:** Build a distinct supplier list from existing S.cache.purchases and back the f-sup input with a <datalist> (or a 'recent suppliers' chip row above the input that fills the field on tap). No new schema needed — just dedupe p.supplier from cache. This keeps spelling consistent so grouping/totaling actually works.

## Mechanic — my jobs, photos, closing work

### [HIGH · M · feature] Give mechanics a "Request part" button on the job card
- **Where:** viewJobDetail app.js:719 (Parts used card); PERMS app.js:120; viewStore app.js:766
- **User need:** A mechanic mid-repair discovers they need a brake pad. The anti-pilferage rule (only owner/supervisor/store can issuePart, PERMS line 124) is correct — but it leaves the mechanic with NO in-app action. Today the '+ Issue Part' button is hidden for them (line 719 gated by can(role,'issuePart')) and viewStore shows them no buttons (line 766). They must walk over and tell the storekeeper verbally, which defeats the digital ledger.
- **Change:** Add a 'requestPart' perm for mechanic and a '🙋 Need a part' button on the job-card Parts section (and/or part detail). It creates a lightweight part-request record tied to the job (partId/qty/jobId/status='requested') that surfaces on viewStoreHome/store dashboard as a to-do. The storekeeper taps it to fulfil, which routes into the existing issuePart() against that job — preserving anti-pilferage while removing the dead-end for the person who actually knows what's needed.

### [MEDIUM · M · bug] Add a loading/saving state and failure recovery to the photo capture flow
- **Where:** addJobPhoto app.js:1296-1307 (await Sync.uploadPhoto then load+rerender)
- **User need:** On patchy Jaipur network, Sync.uploadPhoto(shot) (line 1301) can hang for many seconds. The UI gives zero feedback — the mechanic with greasy hands sees nothing happen after the camera closes, assumes it failed, and taps the + again, producing duplicate photos or confusion. If the photo object fails to encode (null), capturePhoto returns null and the function silently returns (line 1298) with no message.
- **Change:** Show a spinner/'Saving photo…' overlay while uploadPhoto runs; the code already falls back to the inline image offline (|| shot, line 1301), so surface a small 'Saved on phone, will upload later' note when offline. On a null capture, toast 'Photo not captured, try again' instead of silently returning. Prevents duplicate taps and reassures the user the work was saved.

### [MEDIUM · S · ux] Show photo-gate progress on the job card instead of only erroring at Mark Done
- **Where:** viewJobDetail app.js:715-716 (photoStrip cards + addPhotoNote); markDone app.js:1316-1318
- **User need:** A mechanic finishes a job, taps the big green Mark Done, and only THEN gets a toast '⚠️ Add before AND after photos first' (line 1317). On a cheap phone with a brief toast, a low-literacy user may not understand which photo is missing, and the toast vanishes. They retap and get stuck.
- **Change:** Render an inline checklist on the photo card showing '✅ Before photo' / '⬜ After photo needed' (derived from j.beforePhotos/afterPhotos length, or the bill photo for externalVendor jobs). Disable/grey the Mark Done button (app.js:743) until the gate is satisfied, with the requirement shown right next to it. This turns a confusing late error into clear, always-visible guidance.

### [MEDIUM · S · feature] Let mechanics log/adjust labour hours when closing a job
- **Where:** markDone app.js:1308-1322; cost display viewJobDetail app.js:735; job creation default labourHours:2 app.js:1387
- **User need:** Labour is hard-coded to 2 hrs at creation (app.js:1387) and ₹250/hr (app.js:249), set by whoever made the card — not the mechanic who did the work. The mechanic who spent 5 hours has no way to record it, so per-bus cost analytics and any future incentive/payroll use are wrong. The mechanic is the only person who knows the real time spent.
- **Change:** On the Mark Done flow (or an editable field on the job card for the assigned mechanic), prompt 'How many hours did this take?' pre-filled with the current value, and write j.labourHours before setting status='done'. Big +/- stepper buttons for low-literacy, greasy-hand use. Improves cost accuracy and respects the mechanic's actual effort.

### [MEDIUM · S · ux] Make the driver-reported problem actionable from the mechanic's job card
- **Where:** viewMechanicHome app.js:447-451 ('Driver said…' list); viewJobDetail app.js:704-712
- **User need:** The home screen shows 'Driver said…' reports for buses the mechanic is working (line 448), but inside the actual job card (viewJobDetail) there is no sign of what the driver reported — only j.problem from the card creator. A mechanic opening a job from the Jobs tab can't see 'driver said brakes feel soft' unless they go back home. The closed-loop intent is half-wired.
- **Change:** In viewJobDetail, after the problem card (line 712), render any open driverreports for j.busId as a small 'What the driver reported' note. This gives the mechanic the firsthand symptom at the moment they need it, and reinforces the loop that verifyJob already closes (app.js:1330).

## Driver — my bus, my rating, reporting problems

### [HIGH · M · content] Route the driver-facing screens through t() so Hindi-first actually applies to drivers
- **Where:** viewDriverHome (app.js:1483-1502) and sheetTripReport (app.js:1580-1584); t()/I18N at app.js:30
- **User need:** Drivers are the lowest-literacy role, but every string they touch — 'Your rating', 'Report a problem on my bus', 'What did you notice on the trip?', 'My reports', the 9 category names — is hardcoded English. The Hindi toggle does nothing on the one screen these users live on.
- **Change:** Add I18N keys for the driver home and trip-report sheet (greeting, 'Your rating', 'trips', the report button, 'My reports', empty states) and the 9 category labels, then replace the literals with t() calls. Categories should map a stable English value (stored in driverreports.category) to a localized label so analytics/job-linking keep working.

### [HIGH · M · feature] Let drivers report by voice note and/or photo, not just typed text
- **Where:** sheetTripReport (app.js:1580-1584) textarea #f-rprob; saveReport (app.js:1586-1592)
- **User need:** After a trip a low-literacy driver must type a Hindi problem description into a textarea on a cheap Android keyboard — the single biggest reason a report just won't get filed. The app already downscales photos elsewhere, so the plumbing exists.
- **Change:** Add a '📷 Photo' button (reuse the existing downscale-to-~60KB capture used for incidents/jobs) and a '🎤 Bolकर bataayein' voice button that uses the Web Speech API to dictate into #f-rprob (graceful fallback: just attach an audio note / make text optional when a photo is present). Store photo/audio on the driverreport so the mechanic sees exactly what the driver meant; relax the 'Describe the problem' guard when a photo or voice note is attached.

### [HIGH · S · ux] Show the driver WHY their rating is what it is (with a simple coaching line)
- **Where:** viewDriverHome (app.js:1487-1489) — the rating tile; data from driverIncidents()/INCIDENT (app.js:308-330)
- **User need:** A driver sees '82/100' and 3 stars but has no idea why or how to improve. The supervisor's viewDriverDetail (app.js:1457-1462) already breaks incidents into 'Harsh braking x2 -5' badges — the person actually being judged is the only one who can't see it.
- **Change:** Under the rating tile, render the same per-type incident summary the supervisor sees (byType badges, last-90-days) plus one plain-Hindi coaching sentence for the top deduction (e.g. 'Aaram se brake lagaayein' for harsh-brake). When score is 100, show 'Saaf record! Shabaash 👍'. Reuse the byType logic from viewDriverDetail so there is no new scoring code. Tapping a badge can expand the dated list.

### [MEDIUM · M · ux] Replace the 9-option category <select> with big icon tiles
- **Where:** sheetTripReport category select #f-rcat (app.js:1582)
- **User need:** A native <select> with 9 English words (Brakes, Engine, AC, Suspension...) is slow to read and tap for a low-literacy driver on a small screen; they likely just leave it on the default 'Brakes' and mis-categorize.
- **Change:** Render the categories as a grid of large tappable tiles with an icon + localized label (brake 🛑, engine ⚙️, AC ❄️, tyre 🛞, etc.), single-select with a clear highlighted state, writing the chosen value into a hidden field that saveReport reads. Keep the stored category value stable for analytics. This mirrors the icon-tile pattern already used for incident types.

### [MEDIUM · S · ux] Tell the driver WHAT was fixed, not just that it is 'fixed'
- **Where:** viewDriverHome 'My reports' list (app.js:1497-1500); report has jobId once verified (app.js:1015,1331)
- **User need:** When a report flips to ✅ 'fixed', the driver gets no proof and no detail — they re-report the same issue or distrust the system. viewDriverDetail already makes resolved reports tappable via data-job (app.js:1467), but the driver's own home does not.
- **Change:** In viewDriverHome's report rows, when r.jobId is set add data-job="${r.jobId}" so the driver can tap through to the job (the route is already permission-safe), and show 'Theek ho gaya · {fmtDate(r.resolvedAt)}'. Optionally surface the after-photo thumbnail from the linked job so the driver visually confirms the repair.

### [MEDIUM · S · ux] Confirm-and-undo on submit, and let a driver cancel a mistaken open report
- **Where:** saveReport (app.js:1586-1592) toast; report rows in viewDriverHome (app.js:1497-1500)
- **User need:** A fat-fingered or duplicate report stays 'open' forever with no way for the driver to take it back, cluttering the supervisor's open-reports list (app.js:436,530). Drivers also get only a tiny toast as confirmation, easy to miss.
- **Change:** After saveReport, show a clearer confirmation (e.g. an in-sheet success state 'Bhej diya ✓ — mechanic ko mil jaayega'). On each OPEN, not-yet-linked report row in viewDriverHome, add a small 'Cancel' (data-act) that sets status to a 'cancelled' state (or deletes it) — guarded so a report already tied to a job (r.jobId) cannot be cancelled.

## First-run / onboarding — empty garage to working

### [HIGH · M · bug] No way to clear demo data — a real garage can never start empty
- **Where:** db.js seedIfEmpty (lines 104-227); app.js boot() (1941-2004); viewMe menu (app.js 841-850)
- **User need:** An actual new Jaipur garage installs the PWA and immediately sees 3 fake buses (RJ14 PA 1023), 7 fake parts, fake jobs/drivers/staff (Bhuwan, Ramesh, Mukesh...) and demo PINs. There is no button anywhere to wipe this. They cannot trust the app: their real bus list is polluted with fictional vehicles and their staff login screen shows people who do not work there. seedIfEmpty unconditionally seeds on any device where meta.seeded is unset, and boot() even back-fills drivers/incidents if the drivers store is empty (1960-1985), so deleting them re-creates them.
- **Change:** Gate all seeding behind an explicit choice. On very first boot (no meta.seeded and empty users), show a one-screen chooser: 'Start fresh (my real garage)' vs 'Load demo data (just exploring)'. Only run seedIfEmpty + seedCreds + the boot() driver back-fill when demo is chosen. Add a 'Reset / clear all data' action in viewMe's More menu (owner only) that clears IndexedDB stores and localStorage creds and returns to this chooser. Remove the unconditional driver back-fill in boot() (1960-1985) so a fresh garage stays empty.

### [HIGH · M · bug] Garage geofence location is hardcoded to one Jaipur point — attendance is wrong for every real garage
- **Where:** db.js line 227 (meta 'garage' seeded with lat 26.9124, lng 75.7873, radiusM 200); doAttendance app.js 868-886; no setter UI anywhere
- **User need:** Attendance is a headline feature ('selfie + GPS confirms you are at the garage'), but the garage coordinates are hardcoded to Mahalaxmi Travels' location. A new garage anywhere else in Jaipur will have every check-in flagged 'too far' / forced through the 'record anyway?' confirm (882), making the geofence meaningless and training staff to dismiss the warning. There is no screen to set the garage's own location.
- **Change:** Add a 'Garage location' setup card (owner-only) — reachable from viewMe More menu or surfaced during first-run onboarding — with a 'Use my current location' button (navigator.geolocation) that writes lat/lng to the meta 'garage' record, plus an editable radius (m) field. Until set, skip the distance/flagged logic in doAttendance instead of comparing against a foreign default. Show the configured address/radius so the owner can confirm it before relying on late/too-far flags.

### [MEDIUM · M · ux] Staff/driver account creation silently depends on being online, and the warning is buried
- **Where:** saveStaff (app.js 1248-1264), sheetStaff note (1244), saveDriver (1518-1536)
- **User need:** On patchy Jaipur networks, an owner setting up staff offline taps 'Create account' and gets a toast 'Sign in online first to add staff' (1262) — but the form gave no warning beforehand, so they fill in name+PIN repeatedly and it keeps failing with no explanation of why or what to do. For drivers, the PIN login is created via the same online-only path (1530) and fails quietly with a parenthetical message. New owners don't understand that accounts are server-created.
- **Change:** In sheetStaff and sheetAddDriver, when Sync is offline/unauthed show an inline banner at the top of the form ('You are offline — connect to create logins. You can still save the driver record now and add their PIN later.') and disable/relabel the create button accordingly. For drivers (whose record saves locally regardless), make the 'add PIN later' path explicit with a visible 'Add login PIN' affordance on the driver detail page so the deferred step isn't lost.

### [MEDIUM · S · ux] Empty-state cards are dead-ends with no call-to-action
- **Where:** viewBuses (app.js 584 'No buses yet'), viewStore Parts card (772-778, no empty text at all), viewDrivers (1409 'No drivers yet'), viewJobs (676)
- **User need:** A low-digital-literacy owner setting up for the first time lands on Buses and sees only the grey text 'No buses yet'. The only way forward is the small '+' FAB in the corner, which is easy to miss on a cheap small-screen Android. On the Store/Parts view with zero parts, the Parts card renders completely blank (parts.map over an empty array) — looks broken. Users get stuck not knowing the next step.
- **Change:** Replace bare empty strings with actionable empty states: an icon, a one-line Hindi/English explanation, and a prominent button that triggers the same action as the FAB. e.g. Buses: '🚌 Abhi koi bus nahi / No buses yet' + a big 'Add your first bus' button (data-act='addBus'). Same pattern for parts (data-act='addStock'), drivers (data-act='addDriver'), jobs. Add the missing empty guard in viewStore so the Parts card never renders blank.

### [LOW · M · ux] No first-run onboarding / 'what to do next' guidance for the owner
- **Where:** viewHome owner dashboard (app.js 456-540); enterApp/route home (1938)
- **User need:** After first login the owner sees a dashboard built for a running garage — a 7-day cost chart (all zeros), quick-stat tiles all showing 0, AI Insights, Service-due. With no data this is confusing and gives no sense of where to begin. A first-time owner with low digital literacy needs a clear ordered checklist: add buses, add parts, add staff, add drivers, set garage location.
- **Change:** When the owner's garage is essentially empty (buses/parts/staff near zero), render a 'Get started' checklist card at the top of viewHome instead of the empty charts: ordered steps with tick marks that complete as each store gets its first record (1. Set garage location 2. Add your first bus 3. Add parts/stock 4. Add staff PINs 5. Add drivers). Each row is tappable (data-act) to its add-sheet. Hide it once the basics exist. This turns the blank dashboard into a guided path.

## Offline-first & multi-device sync

### [HIGH · M · bug] Stock quantity silently drifts when two devices issue parts at once (last-write-wins on whole record)
- **Where:** app.js:198 issuePart (part.qty -= qty) and app.js:221 receiveStock (part.qty += qty); sync.js pull() line 140 last-write-wins by updatedAt
- **User need:** Store-keeper issues 2 brake pads on the tablet while a mechanic receives stock on a phone, both offline. When they sync, the whole parts record is overwritten by whichever has the later updatedAt — one of the two qty changes is lost. The append-only ledger still records both moves, so the audit trail and the on-hand number disagree. For an anti-pilferage tool this is the worst possible failure: the count looks wrong and staff get blamed.
- **Change:** Stop syncing the derived qty as authoritative. Treat the ledger (append-only, unique ids — already collision-safe via uid) as the source of truth and recompute parts.qty = sum(in) - sum(out) from the ledger after each pull, instead of trusting the synced qty field. This makes concurrent issue/receive commutative. Show a tiny 'count rebuilt from ledger' note so the number is explainable.

### [HIGH · M · bug] A poison record can wedge the outbox forever with no visible error
- **Where:** sync.js push() line 109-128 (throws on first non-ok, clears nothing) and tick() line 95 (any throw → status 'offline')
- **User need:** If the server rejects one record (oversized photo, a 4xx from a stale token, a malformed record), push() throws before clearing the outbox, tick() marks the device 'offline,' and it retries the identical failing batch every 4s forever. The user sees a permanent 'Offline' even though the network is fine, and every later change piles up behind the stuck one — silently. Staff have no way to know one bad record is blocking the whole day's sync.
- **Change:** Make push resilient: send records individually or in small batches and remove each from the outbox only on its own success; on a 4xx (non-retryable) move that key to a 'failed' set instead of retrying forever, and surface a distinct status (e.g. 'sync error') plus a count in sheetSync with a 'Retry failed items' button. Re-auth on 401 rather than treating it as offline. This prevents one bad record from freezing all sync.

### [HIGH · S · trust] Sync chip and Sync sheet never say WHEN you last reached the server
- **Where:** app.js:42 syncChipHtml; app.js:1211 sheetSync (shows status/pending/rev only); sync.js setStatus + info() has no lastSyncAt
- **User need:** On patchy WiFi the chip flips between Sync…/Offline/Synced constantly. An owner glancing at it can't tell if 'Offline' means 'we lost signal 10 seconds ago, all good' or 'this phone hasn't talked to the server since yesterday and the day's job cards are stranded.' Without a timestamp, low-digital-literacy staff stop trusting the indicator entirely.
- **Change:** Record lastSyncAt (ms) in localStorage whenever pull/push succeeds; expose it in Sync.info(). In sheetSync show 'Last synced: 2 min ago' (Hindi-friendly relative time), and when offline make the chip tooltip/label read e.g. 'Offline · last synced 9:40 AM'. If lastSyncAt is older than a threshold (e.g. >30 min) while changes are pending, color the chip red so a stranded device is impossible to miss.

### [MEDIUM · L · bug] Deletes never sync — deleted buses/parts/jobs resurrect on the next pull
- **Where:** db.js:84 DB.del (no onChange call); sync.js pull() at line 130-147 (no tombstone handling); push() builds records only from DB.get
- **User need:** A supervisor deletes a duplicate bus or a wrong job card on the tablet. On the two phones (and even back on the tablet after a pull) the record reappears, because del() never enters the outbox and pull() only ever adds/updates records — it has no concept of a deletion. In a 3-device garage this makes cleanup impossible and erodes trust in the whole app.
- **Change:** Make deletes first-class in sync: in DB.del, write a tombstone (mark the record {deleted:true, updatedAt:Date.now()} via put + onChange, OR keep a deletes set in localStorage) instead of a hard delete, and have pull() honor incoming deleted-flag records by removing them locally. At minimum, route DB.del through DB.onChange so the deletion is queued; then teach push/pull/server to carry a deleted marker. Audit every DB.del caller (grep shows doc add/edit/delete, etc.) so a delete on one device propagates to all.

### [MEDIUM · M · perf] Offline-captured photos ship as fat base64 blobs and never get re-uploaded when back online
- **Where:** sync.js uploadPhoto (line 75, returns null offline) used at app.js:885 (selfie), 1301, 1826 (bill), 1850 (incident); push() at sync.js:109 sends rec.data wholesale
- **User need:** A mechanic photographs a brake job before/after with no signal. uploadPhoto returns null so the ~60KB data URL is saved inline. When sync runs on patchy 2G the whole job record (with the base64 image embedded) is pushed in one /push body, and the same heavy data URL lands on every other device permanently — it is never swapped for a lightweight URL once the phone regains signal. This bloats IndexedDB and makes pushes time out exactly when the network is weakest.
- **Change:** Queue un-uploaded photos: when uploadPhoto returns null, store the data URL with a flag and add a background pass in tick() that retries uploadPhoto for any inline-photo records when online, rewriting the field to the returned URL and re-queuing the (now-small) record. Until then, keep big base64 out of the normal /push payload or chunk it, so a failed photo upload doesn't block the rest of the outbox.

### [MEDIUM · M · trust] Concurrent edits overwrite silently — no signal that the server changed your record
- **Where:** sync.js pull() line 140 (silent putRaw on newer updatedAt); app.js onApplied at 1991 only reloads/re-renders, and skips re-render entirely if a sheet is open
- **User need:** Supervisor on the tablet edits a job's notes; meanwhile a mechanic on a phone changes the same job's status. Last-write-wins means one edit vanishes with zero indication. Worse: onApplied skips re-render while a sheet is open (good for not yanking the form), but that means the person editing is looking at and saving over now-stale data they never saw change — guaranteeing their save clobbers the other device's update.
- **Change:** Detect overwrites in pull(): when an incoming record is newer than a local record that is itself still pending in the outbox (i.e. a true conflict, both sides changed), don't blind-overwrite — keep the local pending version and log/flag a conflict, or at least toast 'Job RJ14… was also changed on another device.' And when a sheet is open editing a record that just got a remote update, show a non-blocking banner ('This was updated elsewhere — reload to see latest') instead of silently letting the stale form save win.

## Mechanic — attendance check-in/out

### [HIGH · S · bug] No daily reset — 'forgot to check out' leaves you stuck checked-in
- **Where:** checkedIn derivation in viewMe (app.js:815-816), viewMechanicHome (app.js:434), viewHome (app.js:465)
- **User need:** checkedIn is `last && last.type==='in'` looking only at the most recent record with no date check. A mechanic who forgets to tap checkout when leaving (very common) shows as still checked-in the next morning, so the home banner won't prompt them to check in, the button shows 'Check out', and there is no 'in' record for the new day — silently breaking their attendance and pay.
- **Change:** Scope checkedIn to today: only treat them as checked-in if the last 'in' is from the current calendar day with no later 'out'. If yesterday's session was never closed, auto-flag it as a missing-checkout and present today's button as 'Check in'. Surface a small 'You forgot to check out yesterday' note so it can be corrected.

### [MEDIUM · M · trust] Flags are recorded but invisible, and the mechanic can't explain them
- **Where:** doAttendance writes flagged (app.js:880-886); attendance log render in viewMe (app.js:830-836) only shows LATE, never flagged/dist context
- **User need:** When GPS is missing or the worker is beyond the geofence, the record is saved with flagged:true, but: (1) nothing in the UI ever shows that flag — owner/supervisor scanning the log can't tell a flagged-far entry from a clean one; (2) the mechanic gets no chance to say WHY ('GPS was off', 'I was parking the bus outside'). This breeds disputes with no audit trail.
- **Change:** On a too-far or no-GPS check-in, prompt for a short reason and store it on the attendance record. In the attendance log render a red 'FLAGGED' badge plus the reason and distance, and let owner/supervisor tap a flagged entry to clear/approve it. Gives a fair, reviewable record instead of a silent boolean.

### [MEDIUM · M · ux] Attendance history has no day grouping or hours/days total for pay disputes
- **Where:** attendance log in viewMe (app.js:828-836), capped at .slice(0,20)
- **User need:** A daily-wage mechanic's main reason to open Me is to confirm they were paid for every day they worked. The current log is a flat list of the last 20 in/out events with no per-day pairing, no day count, and no hours worked — so at month-end the worker cannot self-verify their attendance, which is exactly when disputes happen.
- **Change:** Group the mechanic's own records by date showing in-time, out-time and hours per day, plus a header like 'X days this month'. Keep it simple (no charts) so a low-literacy user can match it against their pay. This turns the log into a self-service proof they can show the owner.

### [MEDIUM · S · bug] Selfie uses the rear camera
- **Where:** viewMe check-in button -> doAttendance (app.js:859) calls capturePhoto (app.js:103-117)
- **User need:** A mechanic clocking in is told to take a selfie ('Take a selfie to check in'), but capturePhoto hard-codes inp.capture='environment', which opens the REAR camera on Android. The worker either fumbles to flip the camera (low digital literacy, cheap phone) or unknowingly submits a photo of the wall/floor, defeating the whole 'proof of who showed up' purpose.
- **Change:** Let capturePhoto take a facing argument, e.g. capturePhoto('user'), and pass 'user' from doAttendance so the front camera opens for selfies; keep 'environment' default for job/bill/incident photos. One-line signature change plus the two attendance call sites.

### [MEDIUM · S · bug] Hard-coded 09:30 late cutoff with no garage shift setting
- **Where:** doAttendance late calculation (app.js:876-877)
- **User need:** Late is computed as `d.getHours()>9 || (===9 && getMinutes()>30)` — a fixed 09:30. A small Jaipur garage may open at 08:00, run a second/night shift, or be lenient on a festival day. Mechanics on a legitimately different shift get stamped LATE every day, which is a fairness/pay problem and erodes trust in the whole attendance feature.
- **Change:** Store a shiftStart (and optional grace minutes) on the garage meta record (S.cache.garage) with a default of '09:30', editable by the owner in Me -> Sync/garage settings. Compute `late` against that value instead of the literal 9/30. Also handle workers whose shift starts before they even open the app.

### [MEDIUM · S · bug] Single low-accuracy GPS fix can falsely flag a mechanic as 'too far'
- **Where:** doAttendance getCurrentPosition + tooFar check (app.js:864-883)
- **User need:** On cheap Android phones indoors (inside a metal-roofed garage), the FIRST getCurrentPosition fix is often a coarse cell/wifi estimate hundreds of metres off, yet coords.accuracy is never read. With an 8s timeout the code takes whatever it gets, computes dist, and may pop 'You are 600m from the garage' even though the worker is standing inside — an unfair flag on an honest daily action.
- **Change:** Read pos.coords.accuracy; if accuracy is poor (e.g. > radiusM) treat location as unverified rather than 'too far', and/or use watchPosition briefly to take the best of a few fixes within the timeout. Show 'weak GPS signal' instead of a false out-of-range flag, and only flag tooFar when the fix is confident.

## Owner — AI Insights & the advisor

### [MEDIUM · M · feature] Give insight cards a direct action, not just navigation
- **Where:** insightCard() app.js:1674-1684, computeInsights() reorder/doc/service items app.js:1638-1648
- **User need:** Insights correctly flag problems (reorder N parts, doc expiring, service overdue) but every card only navigates to a list/detail. The owner sees 'Reorder 3 parts' then has to remember which, go to Store, and act manually — friction that means the insight gets ignored. The value of an alert is acting on it in one tap.
- **Change:** Add an optional action button to insightCard for high-value insights: the reorder insight gets 'Create reorder' (opens sheetAddStock/Receive prefilled with the low parts); the doc-expiry insight gets a 'Renew — add new doc' (opens sheetAddDoc for that bus/doc type); the service-overdue insight gets 'Open job card' prefilled for that bus. Render as a small secondary button inside the card with its own data-act so the whole-card nav still works elsewhere.

### [MEDIUM · S · trust] Protect the owner's API key — restrict the advisor to owner and warn before saving
- **Where:** AI Insights screen — callClaude() app.js:1719-1741, sheetSync() key field app.js:1223, ROUTE_PERM app.js:1761
- **User need:** The owner pays for the Anthropic key. Today it is typed into Me → Sync, stored in plaintext localStorage, and sent with `x-api-key` directly from the browser (anthropic-dangerous-direct-browser-access) on ANY device that can open Insights. On a shared cheap Android in a garage, a supervisor or anyone with the unlocked phone can read it from the input (it is type=password but value is prefilled and visible via devtools) and rack up the owner's bill or leak the key.
- **Change:** Gate the key entry and the advisor to role owner only (the 'insights' perm is already owner-scoped via ROUTE_PERM, but the key lives in the shared Sync sheet — move the API key field out of sheetSync into a viewMe→owner-only sheet, or hide it unless S.user.role==='owner'). Add a one-line warning under the field: 'This key bills your Anthropic account. Keep it private.' Add a 'Remove key' button that clears localStorage aiKey. Long-term note in README: a direct browser key is inherently exposable — recommend routing the advisor through the sync server instead so the key never ships to phones.

### [MEDIUM · S · ux] Make the advisor offline-aware instead of failing with a CORS error
- **Where:** viewInsights() app.js:1693-1697, askAi() app.js:1742-1751, callClaude catch app.js:1738-1740
- **User need:** This is an offline-first PWA on patchy Jaipur networks. computeInsights() is fully local and works offline, but the 'Ask the advisor' box is always shown the same way. Offline, tapping Ask runs a fetch that fails and shows 'Could not reach Claude API (network or CORS)' — a scary, meaningless message for a low-digital-literacy owner who doesn't know what CORS is.
- **Change:** In viewInsights, check navigator.onLine (and key presence). If offline, render the advisor box disabled with a calm note: 'Advisor needs internet — your insights below work offline.' If no key, show 'Add your API key to ask questions' with a button that opens the key field directly. In askAi(), before fetching, if !navigator.onLine show 'No internet right now — try when you are back online' rather than letting it fail. Replace the raw CORS string with 'Could not reach the advisor — check your internet and key.'

### [MEDIUM · S · ux] Add tappable Hindi/English suggested questions to the advisor
- **Where:** viewInsights() advisor card app.js:1693-1697, askAi() app.js:1742
- **User need:** The owner is Hindi-first with low digital literacy. The only prompt is an English placeholder 'How do I cut my brake costs?' and an empty text box. Many owners will not know what to type, won't type in English, and will never use the feature. The app already has a Hindi/English toggle, so a blank English box is a dead end.
- **Change:** Below the input, render 3-4 chips (data-act) seeded from the actual data: e.g. 'इस महीने खर्च सबसे ज़्यादा किस बस पर?' / 'Which bus cost most this month?', 'कौन से पार्ट्स अभी मंगाने हैं?', 'ब्रेक का खर्च कैसे घटाऊं?'. Tapping a chip fills #ai-q and calls askAi(). Localize chip text via the existing i18n/t() helper used by the Hindi toggle. This turns a blank box into one-tap, no-typing answers.

### [MEDIUM · S · ux] Let the owner copy/share the advisor's answer and keep the question visible
- **Where:** askAi() app.js:1742-1751, advisor answer container #ai-ans app.js:1696
- **User need:** The advisor answer (line 1748-1750) replaces #ai-ans with text only. The original question disappears from view, there is no way to copy the answer to forward on WhatsApp (the dominant comms channel in a Jaipur garage), and re-rendering the view wipes the answer. An owner who gets a good 'how to cut brake costs' answer will want to send it to the supervisor.
- **Change:** In askAi, render the answer with the asked question echoed above it ('You asked: …') and add a small 'Copy' / 'WhatsApp' action under the answer (navigator.share or wa.me link with the answer text). Keep the last Q&A in a module-level variable so re-entering viewInsights restores it instead of showing an empty box.

### [MEDIUM · S · trust] Add a usage guardrail and clearer model/cost disclosure for the advisor
- **Where:** callClaude() app.js:1719-1741 (model claude-haiku-4-5-20251001, max_tokens 500), askAi() app.js:1742, footer note app.js:1697
- **User need:** Every tap of Ask is a billable call on the owner's own key with no rate limit, no spinner-disable on the button (rapid taps fire multiple requests), and no spend awareness. A confused owner mashing the button, or a left-open device, quietly spends real money. The footer says 'Powered by Claude (Haiku)' but gives no sense of cost or that each question is a paid call.
- **Change:** In askAi(), disable the Ask button while a request is in flight (re-enable on resolve) to stop duplicate calls; debounce empty/duplicate questions. Keep a small daily counter in localStorage and show 'X questions today' so the owner sees usage. Update the footer note to 'Each question uses your Anthropic key (small cost).' Also pin the model to the stable alias claude-haiku-4-5 (not the dated snapshot) so it doesn't silently break when the snapshot is retired, and surface the real API error body on non-401 failures for debuggability.
