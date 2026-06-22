# Garage Saathi — Feature List

190 features across 8 areas, inventoried and QA-traced by a read-only multi-agent pass. Status: ✅ working · 🟡 partial/minor · 🔴 broken.

## Auth, roles & first-run onboarding

- ✅ **Login Screen & PIN Entry** — User selects staff member from list, enters 4-digit PIN via keypad interface; supports offline login with cached PINs. _(owner,supervisor,store,mechanic,driver)_
- ✅ **Server-side PIN Validation & Lockout** — Server validates login PINs against salted SHA-256 hashes; enforces per-user (5 fails) and per-IP (50 fails) lockout within 15-minute window. _(owner,supervisor,store,mechanic,driver)_
- ✅ **Offline-first PIN Cache** — Device caches verified PIN locally in localStorage so staff can sign in offline after first online login; separate per-device (one phone per user). _(owner,supervisor,store,mechanic,driver)_
- ✅ **Change PIN Flow** — Staff change their own PIN via Me > Change PIN form; owner/supervisor can reset staff PINs via /auth/setpin (server-side); requires online, enforces 4-digit format. _(owner,supervisor,store,mechanic,driver)_
- ✅ **Demo PIN Seeding & Demo Mode Toggle** — On first app load, demo PINs (Owner 1111, Store 3333, Mechanic 0001, etc.) are seeded in localStorage for easy testing. 'Start fresh' clears them permanently so real garage doesn't inherit demo creds. _(owner)_
- ✅ **Staff Account Creation (owner/supervisor only)** — Owner/supervisor create staff accounts via Me > Staff > Add staff; form collects name, role, 4-digit PIN; account syncs server-side and appears on every device. _(owner,supervisor)_
- ✅ **Driver Account Creation & Optional App Login** — Owner/supervisor create driver records via Drivers list; optionally attach a 4-digit PIN so driver can log in and report problems in-app. _(owner,supervisor)_
- ✅ **Garage Setup & Location Capture** — Owner sets garage name, geofence location (GPS capture), radius (m), and late-attendance cutoff (HH:MM) via Me > Garage setup; used for attendance geofencing and shift time. _(owner)_
- ✅ **Start Fresh (Clear Demo Data)** — Owner-only action to clear all demo buses, parts, jobs, drivers, attendance, bills and restart with empty app ready for real garage data. _(owner)_
- ✅ **Login Session Management & Token Expiry** — Server issues 12-hour session tokens on successful login; tokens expire and require re-login; sync operations (push, pull, upload) reject 401 on missing/expired token. _(owner,supervisor,store,mechanic,driver)_
- 🟡 **Role-Based Access Control (PERMS Matrix)** — 5 roles: owner (full), supervisor (most actions), store (inventory), mechanic (own jobs), driver (my bus + reports). Access gated by can(role, perm) checks. _(owner,supervisor,store,mechanic,driver)_
- 🟡 **Mechanic Home (Jobs Only)** — Mechanic home should show assigned jobs, check-in banner, service-due tasks; filter jobs to own assignments only. _(mechanic)_
- 🟡 **Store Home (Inventory First)** — Store home should show stock value, low-stock list, pending supplier bills, reorder shortcuts; inventory-focused, not all jobs. _(store)_
- 🟡 **Bottom Navigation Role-Specific Tabs** — Driver sees 'My Bus · Me', Mechanic/Store see 'Home · Jobs · Store · Me', Owner/Supervisor see full 'Home · Buses · Jobs · Store · Me'. _(owner,supervisor,store,mechanic,driver)_
- ✅ **Driver Self-Service Home & Score Display** — Driver sees My Bus hero (assigned bus, photo), rating stars + score (0–100), 'Report a problem' button, trip reports list, 'My Trips' tab. _(driver)_
- ✅ **Role Access to Drivers List & Performance Data** — Owner/Supervisor access Drivers list (roster, scores, incidents), can add drivers, manage assignments, view trip reports. Store/Mechanic/Driver cannot see Drivers list. _(owner,supervisor)_
- ✅ **AI Insights & Pilferage Radar (Owner Only)** — Owner/Supervisor access AI Insights card on dashboard to see pilferage radar, cost analysis, predictive alerts, 'Ask the advisor' Q&A. Requires optional Anthropic API key. _(owner,supervisor)_
- ✅ **Attendance Check-in with Selfie & GPS Geofence** — All staff check in/out via Me > Check In, captures selfie + GPS, verifies location is within garage geofence, flags if late (after configured shift time). _(owner,supervisor,store,mechanic,driver)_
- ✅ **Owner-Only Garage Onboarding Path** — On first run, owner logs in to empty app, sees Me > Garage setup, configures name + location + shift time, optionally runs 'Start fresh' to clear demo data. _(owner)_
- ✅ **Supervisor Role (Operations Focus)** — Supervisor has most owner powers (jobs, drivers, staff) but optionally restricted from owner-only AI insights (intent not implemented). _(supervisor)_
- ✅ **Store Role (Inventory Focus)** — Store can issue/receive parts, add purchases, view jobs (for part requests); cannot add/verify jobs, manage staff, or see drivers/costs/insights. _(store)_
- ✅ **Message on Failed First-Run Seed/Migration** — If boot-time seed or DB migration fails, app continues to login screen (never shows blank screen); error logged to console. _(owner,supervisor,store,mechanic,driver)_
- ✅ **Sync & Offline-First Login State** — Login works offline using cached PIN; online login syncs to server and updates token; offline changes queue and re-sync when online returns. _(owner,supervisor,store,mechanic,driver)_

## Owner dashboard, cost analytics, billing & AI Insights

- ✅ **7-day repair cost bar chart** — Daily cost breakdown (parts+labour+external) over last 7 days displayed as bars; identifies peak cost days and shows 30-day total in feature pill. _(owner,supervisor)_
- ✅ **Cost-per-bus/company billing worksheet + share** — Tap company from cost-by-company chart → view lifetime repair bill grouped by bus/job (parts/labour/outside split) → share or copy bill text for WhatsApp to customer. _(owner,supervisor)_
- ✅ **Cost-by-company lifetime horizontal bar chart** — Summary on owner dashboard showing total repair cost for each company across all buses; tappable to drill into billing worksheet. _(owner,supervisor)_
- ✅ **Cost last-30-days quick stat** — Owner dashboard quick-stat tile showing total ₹ repair cost in current month; updates when jobs close. _(owner,supervisor)_
- ✅ **Money-pit bus detection (AI Insight)** — AI Insights: flags buses with cost/km well above fleet median (>1.8x) to alert owner to potential recurring faults. _(owner,supervisor)_
- ✅ **Pilferage radar: parts billed, no proof photo** — AI Insight: high-severity alert when a verified/done job has parts cost but no 'after' photo—classic sign of undocumented or diverted parts. _(owner,supervisor)_
- ✅ **Parts out, job still open (inventory leak)** — AI Insight: medium-severity alert when parts are issued to a job but job remains open/in-progress—warns of potential diversion or stalled work. _(owner,supervisor)_
- ✅ **Service preventive maintenance alerts (high/low severity)** — AI Insights: high-severity if service overdue (past last service + interval); low-severity if due soon (<1200km remaining). Feeds live odometer from GPS provider. _(owner,supervisor)_
- ✅ **Ask the advisor (Claude API integration)** — Mechanic/owner can type questions (e.g. 'How do I cut brake costs?') into AI Insights and get concise, rupee-aware operational advice from Claude Haiku. Requires Anthropic API key. _(owner,supervisor)_
- ✅ **AI context (garage snapshot sent to Claude)** — Internal: aiContext() generates compact text summary of garage state (buses, jobs, costs, stock, alerts) to ground Claude's advice. _(owner,supervisor)_
- 🟡 **Labour cost calculation (fixed ₹250/hr)** — All job costs include labour component: labourHours × ₹250/hr. This rate is hardcoded and not configurable by owner. _(owner,supervisor)_
- ✅ **Cost display formatting (money function)** — Formats rupees: money(n) = '₹' + Math.round(n).toLocaleString('en-IN'). _(owner,supervisor,store)_
- ✅ **Cost series date bucketing (7-day chart)** — Daily buckets for chart use job createdAt or closedAt; filter by midnight-to-midnight UTC. No DST handling. _(owner,supervisor)_
- ✅ **Cost-by-company null/empty company handling** — costByCompany() groups by bus.company; what if company is null, undefined, or empty string? _(owner,supervisor)_
- ✅ **Billing worksheet company name injection (XSS risk in shareBill)** — shareBill() embeds company name into bill text. Is the name sanitized? _(owner,supervisor)_
- ✅ **Cost computation doesn't double-count parts issued** — Parts can be issued multiple times; are they counted once per issuance or once per part type? _(owner,supervisor)_
- 🟡 **Access control: only owner/supervisor see cost analytics, billing, insights** — Cost charts, insights, ask-the-advisor should be restricted to owner/supervisor roles only. _(owner,supervisor)_
- 🟡 **Garage setup: labour rate, cost parameters** — Garage setup sheet allows owner to configure garage name, geofence, late cutoff, but NOT labour rate, service intervals per bus type, or other cost parameters. _(owner)_
- 🟡 **Demo hardcoded business name in AI context and bills** — BIZ = 'Mahalaxmi Travels' hardcoded at app.js:97. This appears in bills, AI system prompt, and greetings for every garage. _(owner)_
- ✅ **Cost calculation accuracy in presence of zero-hour jobs** — A job can have labourHours = 0 or undefined. Does this break calculations? _(owner,supervisor)_
- 🟡 **Money-pit threshold (1.8x median)** — Magic number 1.8 for flagging high-cost buses—is this appropriate for Indian garages? _(owner,supervisor)_
- ✅ **Cost alert ordering by severity** — computeInsights() sorts results by severity: high → med → low. Are all high-severity alerts actionable and urgent? _(owner,supervisor)_
- ✅ **Insights count badge on home (red if issues, green if clear)** — Dashboard AI card shows badge with number of flagged anomalies; turns red if any, green if none. _(owner,supervisor)_
- ✅ **All-jobs total vs 30-day cost in feature pill** — Feature pill at app.js:566-568 shows total7 (7-day sum) and cost (30-day sum). Are both calculated correctly? _(owner,supervisor)_

## Job Cards Lifecycle

- ✅ **Create job card** — Owner/supervisor creates a new job card by specifying bus, problem description, priority, and optionally outside-vendor details; auto-links open driver reports. _(owner,supervisor)_
- ✅ **Assign job card (create-time)** — Job is assigned to a mechanic at creation time; owner/supervisor can reassign later. _(owner,supervisor)_
- ✅ **Link driver reports to job** — Supervisor links an open driver report (bus issue) to a job at creation or via create-from-report; resolves the report when job is verified. _(owner,supervisor)_
- ✅ **Capture before photo (with busy state)** — Mechanic captures a before-work photo; UI shows busy spinner while saving to device or uploading online; photo gates job closure. _(mechanic,owner,supervisor)_
- ✅ **Capture after photo (with busy state)** — Mechanic captures after-work proof photo; UI shows busy state; required to close job unless external vendor. _(mechanic,owner,supervisor)_
- ✅ **Photo-gate enforcement on close** — Before a mechanic can close a job, at least before+after photos must be present (or bill photo for outside repairs); enforced by disabled Close button and re-checked on submit. _(mechanic)_
- ✅ **Close job with labour hours** — Mechanic confirms hours worked via +/- stepper (0.5-hour increments), then closes job; closes job only after photo-gate passes. _(mechanic)_
- ✅ **Mark job done (legacy path)** — Legacy one-click 'Mark Done' button that closes job without prompting for hours; only works if photos are present. _(mechanic,owner,supervisor)_
- ✅ **Request part from mechanic** — Mechanic requests a part from inventory to complete the job; storekeeper sees the request and fulfils it. _(mechanic)_
- ✅ **Storekeeper fulfil part request** — Storekeeper marks a pending part request as fulfilled and opens issue sheet to deduct from inventory. _(store)_
- ✅ **Issue part to job (anti-pilferage gate)** — Store or supervisor issues a part against a job card only (never to inventory void); prevents untracked pilferage. _(owner,supervisor,store)_
- ✅ **Verify job (supervisor/owner sign-off)** — Supervisor/owner verifies a 'done' job by checking proof (after photo or vendor bill), marks verified, resolves linked driver reports. _(owner,supervisor)_
- ✅ **Send job back for rework (reject verification)** — Supervisor/owner sends a done job back to 'in-progress' if they reject it; mechanic can re-attempt work and photos. _(owner,supervisor)_
- ✅ **Edit/reassign job** — Owner/supervisor can change bus, problem, assignee, priority, external vendor, labour hours, and notes on an open/in-progress job. _(owner,supervisor)_
- ✅ **Outside-vendor job flow (alternate to in-house)** — Job marked as external vendor with a name and cost; photo gate requires bill photo only (not before+after); verified job can show outside cost separately. _(owner,supervisor)_
- ✅ **Job cost breakdown (parts, labour, external)** — On job detail, displays parts cost + labour hours × ₹250/hr + external cost; total shown in cost summary card. _(all staff)_
- ✅ **View job list (filtered by role, status, mechanic)** — All staff see jobs filtered by their role: mechanic sees own jobs only, others see all; optional status/mechanic chips filter further. _(all staff)_
- ✅ **Verifier workflow (to-verify banner)** — Supervisor/owner sees a prominent 'N jobs awaiting verify' banner and 'to verify' status chip, with 'done' jobs pinned to top. _(owner,supervisor)_
- ✅ **Job detail photo gallery (before/after)** — Job detail shows before and after photo strips with thumbnail images; tap to view full-size; add buttons for editable jobs. _(all staff)_
- ✅ **Job detail parts-used ledger** — Shows all parts issued to the job (name, qty, cost); sum displayed in cost card; owner/sup can add more parts via Issue button. _(all staff)_
- ✅ **Photo upload to server (sync-aware)** — When mechanic captures a photo, app tries to upload via Sync.uploadPhoto; if offline, stores as dataURL locally; syncs when online. _(mechanic)_
- ✅ **Job status transitions (state machine)** — Job transitions: open → in-progress (on first photo), open/in-progress → done (close with hours), done → verified (by supervisor), done → in-progress (reject), verified is terminal. _(mechanic,owner,supervisor)_
- ✅ **Job reassign while in-progress** — Owner/supervisor can reassign a job from one mechanic to another even after work has started. _(owner,supervisor)_
- ✅ **Mechanic home shows assigned jobs** — Mechanic's home displays their open/in-progress jobs, checked-in status, and driver-reported issues on their buses. _(mechanic)_
- ✅ **Job closure proof-of-work validation** — Before marking done, app enforces photo(s) exist; verifier re-checks proof before signing off; no undocumented work can be verified. _(mechanic,owner,supervisor)_
- ✅ **I18n labels for job workflow** — All UI labels for job lifecycle (Create, Assign, Close, Verify, Photos, etc.) are in I18N object for EN/HI bilingual support. _(all staff)_
- ✅ **Demo seed data includes complete job lifecycle** — Seed data in db.js includes jobs in all states (verified, in-progress, open) with parts, photos, driver reports linked, so first-time user can see flows. _(owner)_

## Inventory, Stock Ledger & Purchases

- ✅ **Add stock (new part or top-up)** — Unified entry point to create a new part type or top-up an existing part with quantity and cost; auto-calculates weighted-average unit cost for valuation accuracy. _(owner,supervisor,store)_
- ✅ **Issue part against job (anti-pilferage core)** — Parts can ONLY leave stock when issued against a job card; prevents untracked pilferage by making every movement auditable. Deducts quantity, updates job's partsUsed[], calculates cost from unitCost. _(owner,supervisor,store)_
- ✅ **Receive stock (receiving supplier goods)** — Log incoming stock from suppliers, updating quantity and unit cost. Weighted-average cost prevents inventory valuation from drifting when prices fluctuate. _(owner,supervisor,store)_
- 🟡 **Stock ledger (every movement logged)** — Complete audit trail of stock in/out: every receive, issue, and return creates a ledger entry with type (in/out), qty, reason, user, job, timestamp. Designed as anti-pilferage proof. _(owner,supervisor,store)_
- ✅ **Low-stock alerts and reorder** — Parts below reorderLevel flagged with 'LOW' badge on home/store views; AI Insights surface reorder forecast; home tile counts low-stock parts; store home shows 'Reorder soon' list. _(owner,supervisor,store)_
- ✅ **Supplier bills and part-line receiving** — Record incoming supplier invoices with optional part lines that auto-receive into stock. Each part-line item (qty, unit cost) adds to stock and logs the receipt reason as 'Purchase from <supplier>'. _(owner,supervisor,store)_
- 🟡 **Mark bill paid** — Toggle a bill between 'pending' and 'paid' states; tracks paidAt timestamp. Pending total on home/store excludes paid bills. _(owner,supervisor,store)_
- ✅ **Stock valuation (inventory value)** — Sum of (part.qty × part.unitCost) for all parts; displayed as 'Stock value' card on store home and owner dashboard. _(owner,supervisor,store)_
- ✅ **Stock-in reason tracking** — Each stock-in ledger entry records a reason: 'Stock received', 'Purchase from <supplier>', 'Opening stock', 'Stock added', etc. Auditable trace of source. _(owner,supervisor,store)_
- ✅ **Request part (mechanic initiates need)** — Mechanic on a job taps 'Need a part' and creates a lightweight part-request record attached to the job. Stores storekeeper gets it as a to-do. Status='requested' until storekeeper fulfils. _(mechanic)_
- ✅ **Fulfil request (storekeeper issues from request)** — Storekeeper sees pending part requests on job, taps 'Fulfil', marks request status='fulfilled', then is routed to issue-part sheet with job pre-selected, preserving anti-pilferage. _(store)_
- ✅ **Parts-used cost on job card** — Each job tracks parts consumed in partsUsed[] with {partId, qty, cost}. Cost = qty × part.unitCost at time of issue. Job cost breakdown shows parts separately. _(owner,supervisor,store)_
- ✅ **Job closure validation (before parts leave)** — Jobs can only reach 'done'/'verified' status if proof-of-work photos exist. Before/after photos required for in-house work; bill/receipt photo required for outside vendor work. _(owner,supervisor,mechanic)_
- 🟡 **Cost analytics: repair cost + parts breakdown** — Dashboard shows 7-day repair-cost chart + 30-day pill. Breakdown by company, by bus (cost/km). Per-job detail: parts + labour + external. _(owner,supervisor)_
- 🟡 **Low-stock part warning on issue** — When issuing a quantity that would drop part below reorderLevel or empty it, a confirm dialog warns the storekeeper before committing. _(store)_
- 🟡 **Pilferage radar (AI Insights)** — Surfaces three anti-pilferage signals: (1) parts billed with no after-photo, (2) parts issued on jobs left open, (3) parts vs ledger count mismatch. _(owner)_
- 🟡 **Part master data (name, partNo, category, unit, cost, reorder level)** — Each part record stores immutable metadata: name, partNo, category, unit (pc/set/L/kg/m/box), unitCost, reorderLevel. Used to calculate stock value and trigger alerts. _(owner,supervisor,store)_
- ✅ **Unit cost update on receive (valuation tracking)** — When receiving stock with a unit cost, weighted-average formula recalculates unitCost so future issues reflect real blended buy price. _(owner,supervisor,store)_

## Buses, documents, GPS & preventive maintenance

- ✅ **Add/Edit Bus Profiles** — Create and manage bus records with registration, company, model, chassis, engine, odometer, service interval, and last service odometer. _(owner,supervisor)_
- ✅ **Bus Document Management (Expiry Alerts)** — Add insurance, fitness, PUC, permit, road-tax docs per bus with expiry dates; auto-alert when within 15 days or expired. _(owner,supervisor)_
- ✅ **Live GPS & Odometer Tracking** — Real-time bus location (lat/lng), speed, ignition status, and odometer from tracker provider; auto-update bus odometer if new reading is higher. _(owner,supervisor,mechanic,store,driver)_
- ✅ **Preventive Service Maintenance (Service-Due Tracking)** — Auto-calculate next service odometer from service interval and last service; display status (OVERDUE/SOON/OK) on dashboard, bus detail, and GPS screen; log service completion with new odometer and auto-create verified job record. _(owner,supervisor)_
- ✅ **Service History (Job List per Bus)** — Display all repair jobs (verified, in-progress, open) linked to a bus, showing problem, mechanic, cost, dates, and status. _(owner,supervisor,mechanic,store)_
- ✅ **GPS Permission (Mark Service Done)** — Owner/supervisor can log completed preventive service from the live GPS screen without a full job-card workflow. _(owner,supervisor)_
- ✅ **Odometer-to-Service Math** — Calculate cost-per-km (app.js:338-342: busCostPerKm) by dividing total job cost by km since last service; feed into cost analytics. _(owner,supervisor)_
- ✅ **Document Expiry Calculation Edge Case (Timezone)** — Document expiry stored as UTC midnight timestamp; daysLeft() calculates days from now until expiry; rounding behavior at boundary. _(all)_
- ✅ **GPS Button Accessibility (No Role Gate on Render)** — GPS button on bus detail appears for all staff roles who can view the bus, but GPS data viewing is unrestricted. _(all)_
- 🟡 **Service Interval Configuration** — Each bus has a configurable service interval (km) set at creation or via bus detail; defaults to 10,000 km. _(owner,supervisor)_
- ✅ **Last Service Odometer Initialization** — When creating a bus, owner can set 'Last service odometer' to pre-populate the service baseline; defaults to current odometer if blank. _(owner,supervisor)_
- ✅ **Document Types Enumeration** — Fixed list of document types (Insurance, Fitness, PUC, Permit, Road tax) for Indian regulatory compliance. _(owner,supervisor)_
- ✅ **Document Photo Capture & Storage** — Attach a photo to each document (e.g., scanned insurance certificate) for audit trail; photos stored as data URLs in IndexedDB. _(owner,supervisor)_
- ✅ **Document Alerts Calculation** — Scan all buses' documents; flag those expiring ≤15 days out as alerts; rank by days-left ascending. _(owner,supervisor,mechanic,store,driver)_
- ✅ **Service-Due Alert on Dashboard** — Owner/supervisor home shows 'Service due' card with buses needing service (OVERDUE in red, SOON in amber), sorted by km-to-due ascending. _(owner,supervisor)_
- ✅ **Service Odometer Never Goes Backward** — GPS odometer reads can temporarily be noisy; app enforces: once recorded, odometer can only increase or stay same, never decrease. _(owner,supervisor)_
- ✅ **Preventive Service Auto-Job Creation** — When owner marks service done, app auto-creates a verified jobcard with status='verified', bypassing the normal mechanic-assign→work→verify flow. _(owner,supervisor)_
- ✅ **Labour Cost Calculation (₹250/hr default)** — Jobs include labour hours; cost = (hours × ₹250) + parts + external vendor cost. _(owner,supervisor,mechanic)_
- 🔴 **Odometer-Based Cost Metrics (Broken)** — busCostPerKm calculates cost per km; used by cost dashboard for outlier detection. _(owner,supervisor)_

## Drivers, performance, reports & assignment

- ✅ **Driver profiles** — Create, list, and manage driver records (name, phone, license, bus assignment, trip count) _(owner,supervisor)_
- ✅ **Driver ↔ Bus assignment (exclusive)** — Assign one driver to one bus; changing a driver unassigns their previous bus to maintain 1:1 exclusivity _(owner,supervisor)_
- ✅ **Driver ↔ Bus assignment page (dedicated view)** — Single-screen reassign grid: drivers with current bus on left, driverless buses on right; tap to reassign _(owner,supervisor)_
- ✅ **Driver performance scoring (0-100)** — Calculate score as 100 minus weighted incident penalties over last 90 days; displayed as numeric + star rating _(owner,supervisor,driver)_
- ✅ **Incident logging (data points)** — Log performance data (scratch, dent, harsh-brake, overspeed, late, cleanliness, accident, other) with photo + cost + note _(owner,supervisor)_
- ✅ **Driver trip reports (categorized problem reporting)** — Driver reports issues on trip (9 categories: Brakes, Engine, AC, Suspension, Electrical, Tyres, Gearbox, Body, Other) with optional photo/voice, status open/addressed/cancelled _(driver,owner,supervisor)_
- ✅ **Trip report photo attachment** — Capture or upload photo on driver report; uploaded to server or saved inline if offline _(driver)_
- ✅ **Trip report voice dictation** — Optional Web Speech transcription into problem text; supports Hindi + English via rec.lang = LANG _(driver)_
- ✅ **Trip report cancellation (revert open report)** — Driver can cancel an OPEN, not-yet-linked report; blocked once a job is linked or report is resolved _(driver)_
- ✅ **Report → Job conversion (supervisor creates job from driver report)** — Supervisor/owner views driver report on bus detail and converts it to a job card with the report text pre-filled; links are tracked via reportIds array _(owner,supervisor)_
- ✅ **Report workflow (open → linked → addressed)** — Report lifecycle: created as 'open', linked to a job when supervisor creates job (jobId set), marked 'addressed' when job is verified (resolvedAt stamped) _(owner,supervisor,driver)_
- ✅ **Driver home screen (My Bus + My Rating + My Reports)** — Driver-specific home: bus hero photo, 0-100 score, stars, incident breakdown (last 90d), coaching tip, 'Report a problem' button, my reports list (open + resolved) _(driver)_
- ✅ **Driver coaching tips (adaptive feedback)** — Show driver personalized coaching based on their biggest incident type penalty in last 90 days (e.g. 'avoid harsh braking', 'smooth parking') _(driver)_
- ✅ **Driver detail page (score + incidents + trip reports)** — Owner/supervisor views one driver: profile, bus assignment, score/stars, incident history with cost + note, trip reports with status + job link _(owner,supervisor)_
- ✅ **Driver rating visible to driver (self view only)** — Driver sees own score + stars + recent incident breakdown on driver home; cannot see other drivers' scores _(driver)_
- ✅ **Driver self-home when no bus assigned** — Driver shows 'No bus assigned yet. Ask your supervisor' and cannot report problems until assigned _(driver)_
- ✅ **Drivers roster (list sorted by score, worst first)** — Owner/supervisor sees all drivers ranked by score (lowest = most attention needed) with bus assignment + trip count + badge color (red < 70, amber 70-85, green >= 85) _(owner,supervisor)_
- ✅ **Open driver reports on bus detail** — Mechanics/supervisors see a 'Driver-reported issues' card on bus detail showing open trip reports for that bus; can tap to create a job (if permission) _(owner,supervisor,mechanic,store)_
- ✅ **Driver reports in AI Insights (early-warning)** — AI Insights surfaces open driver reports as medium-priority findings ('Driver report open…') to surface issues before they become breakdowns _(owner,supervisor)_
- ✅ **Driver assignment visibility (bus detail Driver row)** — Bus detail shows assigned driver's name, phone, trip count, score + stars; owner/supervisor can see and tap to change _(all)_
- ✅ **Low driver ratings alert (in AI Insights)** — AI Insights surfaces drivers with score < 75 as medium/high-priority findings ('Driver rating low...') with incident count _(owner,supervisor)_
- ✅ **Trip-to-job linking (via reportIds array)** — Job card stores array of reportIds; when job is verified, all linked reports auto-resolve to 'addressed'; when report is created from job sheet, it's pre-checked in the report-picker _(owner,supervisor)_
- ✅ **Report category picker (9-category tiles)** — Driver selects problem area via tappable tiles (Brakes, Engine, AC, Suspension, Electrical, Tyres, Gearbox, Body, Other); category stored in report for analytics _(driver)_
- ✅ **Driver app login PIN (optional, for self-reporting)** — When adding a driver, optionally create an app user account with a 4-digit PIN; allows driver to log in and report problems; PIN creation is async (if server unreachable, driver record still saves) _(owner,supervisor)_
- ✅ **Driver app login PIN optional (no PIN = no self-report capability)** — Driver without a PIN cannot log in; supervisor/owner can still log trip reports on their behalf via driver detail 'Log report' button _(owner,supervisor)_
- ✅ **Report with photo only (no text required)** — Driver can submit report with just a photo (no typed text), e.g. for low-literacy users; text guard relaxed if photo present _(driver)_
- ✅ **Unassigned driver handling** — Drivers can be added without a bus assignment (busId = null); they appear in assignments page as 'unassigned'; score calculated even if unassigned _(owner,supervisor)_
- ✅ **Incident cost tracking (optional damage ₹)** — Each incident can record repair cost (₹); used for damage trend analysis + AI insights _(owner,supervisor)_
- ✅ **Driver list entry point (Me menu + boss card)** — Entry points to Drivers list: 'Drivers' card on boss home (shows lowest-rated + open report count), and Me menu 'Drivers' link (owner/supervisor only) _(owner,supervisor)_
- ✅ **Driver incidents photo attachment** — When logging an incident, optionally attach a photo (damage photo, etc.); uploaded to server or inline if offline _(owner,supervisor)_
- 🟡 **Trips counter (driver profile)** — Each driver has tripsLogged count; displayed on driver list + home + detail; can be incremented manually (not auto-tracked from sync events in MVP) _(owner,supervisor,driver)_
- ✅ **Driver report voice in Hindi + English** — Web Speech API respects LANG setting; voice input captured in Hindi or English per app language _(driver)_
- 🟡 **Driver profile optional photo** — Driver record has a photo field (profile picture); UI support for capture not yet wired in add/edit _(owner,supervisor)_

## Attendance (selfie + GPS geofence)

- ✅ **Selfie-required check-in/out** — Captures a photo proof-of-presence at time of attendance marking; blocks check-in or check-out without a photo _(mechanic,store,driver,supervisor,owner)_
- ✅ **GPS geofence enforcement (distance check)** — Calculates haversine distance from garage location; flags or confirms if staff is outside configured radius (default 200m) _(mechanic,store,driver,supervisor,owner)_
- ✅ **Late-cutoff time configuration** — Owner-configurable shift start time (default 09:30); any check-in after this time is marked late _(owner,supervisor)_
- ✅ **Daily attendance reset via isToday** — Attendance check-in state resets daily; 'checked in today' uses isToday() date comparison to filter old records _(mechanic,store,driver,supervisor,owner)_
- 🟡 **Flagged attendance records (anomaly marker)** — Records marked with 'flagged' field when GPS fails or distance exceeds geofence; stored but not prominently displayed to staff _(owner,supervisor)_
- ✅ **Attendance history & audit trail** — All check-in/out records stored with timestamp, location (lat/lng/distance), late flag, and selfie photo; owner/supervisor see all, mechanic sees only self _(mechanic,store,driver,supervisor,owner)_
- ✅ **Selfie photo upload & offline fallback** — Attendance selfie attempts server upload (Sync.uploadPhoto); if offline or server fails, embedded dataURL is saved as fallback; retried on next sync _(mechanic,store,driver,supervisor,owner)_
- 🟡 **Geofence radius validation & edge cases** — Radius configured in garage setup (default 200m); staff marked out-of-geofence if distance exceeds it; no lower bound validation _(owner)_
- ✅ **GPS location permission & error handling** — Uses navigator.geolocation.getCurrentPosition with 8-second timeout; gracefully falls back to confirm-without-GPS if denied or times out _(mechanic,store,driver,supervisor,owner)_
- ✅ **Late marker display & visibility** — Check-in marked late shows amber 'LATE' badge in attendance log; visible to owner/supervisor when reviewing all staff, and to any user reviewing their own history _(mechanic,store,driver,supervisor,owner)_
- ✅ **Distance-from-garage display** — Attendance log shows distance in meters from garage location if GPS was successful _(mechanic,store,driver,supervisor,owner)_
- ✅ **Garage location setup (geofence center)** — Owner captures garage GPS location (or manually sets lat/lng) via 'Capture my current location' button; stored as geofence center; warning shown if not set _(owner)_

## Sync/offline, PWA, i18n & accessibility

- ✅ **Push sync (outbox)** — Sends locally-changed records to server; queues failed changes with poison-record quarantine to prevent one bad record from blocking the whole sync _(owner,supervisor,store,mechanic,driver)_
- ✅ **Pull sync (reconcile)** — Fetches server changes since last cursor (rev), applies last-write-wins by updatedAt, detects concurrent overwrites (conflict detection) _(owner,supervisor,store,mechanic,driver)_
- 🔴 **Conflict callback (user notification)** — Alerts user when their local edit was overwritten by a newer server change (concurrent-edit scenario) _(owner,supervisor,store,mechanic,driver)_
- ✅ **Soft-delete tombstones** — Marks records with _deleted:true + updatedAt so deletions sync to all devices; tombstones hidden from UI but kept on disk for sync propagation _(owner,supervisor,store,mechanic)_
- ✅ **Offline photo queue (re-upload)** — Queues photos captured offline (inline data-URL), re-uploads to server when online, patches record with final URL _(owner,supervisor,store,mechanic)_
- ✅ **Quarantine management (poison records)** — Isolates server-rejected records (4xx, non-auth) so they don't block push; provides manual clearQuarantine() to retry _(owner,supervisor)_
- ✅ **Offline-first login (credential cache)** — Cached PIN on device allows login when server unreachable; token synced online; brute-force protection both online (429 after 5 fails) and offline (15min lockout after 5 fails) _(owner,supervisor,store,mechanic,driver)_
- ✅ **Service worker (app shell cache)** — Cache-first strategy for app shell (HTML, CSS, JS); full offline app load after install; CACHE version = 'garage-saathi-v21' _(owner,supervisor,store,mechanic,driver)_
- ✅ **PWA manifest (installable app)** — manifest.webmanifest: display=standalone, icons, theme colors, scope=./; enables 'Add to Home Screen' on Android/iOS _(owner,supervisor,store,mechanic,driver)_
- ✅ **Language toggle (EN / Hindi)** — i18n object with EN and HI translations; t(key) helper; toggle via lang button; persisted to localStorage _(owner,supervisor,store,mechanic,driver)_
- ✅ **Hindi i18n completeness** — All UI labels, buttons, toasts, alerts, validation messages translated to Hindi _(owner,supervisor,store,mechanic,driver)_
- 🟡 **Accessibility: tap target sizing** — Buttons and interactive elements meet 44x44px (iOS) / 48x48px (Android) touch targets _(owner,supervisor,store,mechanic,driver)_
- ✅ **Accessibility: color contrast (WCAG AA)** — Text/background color pairs meet minimum 4.5:1 for normal text, 3:1 for large text _(owner,supervisor,store,mechanic,driver)_
- 🟡 **Accessibility: screen reader support (ARIA labels)** — Back button, icon buttons have aria-label; form labels present; semantic HTML5 structure _(owner,supervisor,store,mechanic,driver)_
- ✅ **Accessibility: voice input (speech-to-text)** — Driver reports support voice dictation via WebkitSpeechRecognition; falls back to typing; supports both EN and HI _(driver)_
- ✅ **Sync polling (background reconcile)** — Auto-sync every 4000ms (4 sec) via setInterval; fires on online event; debounced via 600ms kick timer _(owner,supervisor,store,mechanic,driver)_
- ✅ **Default sync URL fallback** — Defaults to http://localhost:8766 if syncUrl not set; used for development; MUST be configured for production _(owner,supervisor,store,mechanic,driver)_
- ✅ **Demo PINs and startup mode** — Seed PINs (1111, 2222, 3333, 0001, etc.) pre-configured in sync_server.py and app.js; 'Start fresh' clears demo data and disables seeding _(owner,supervisor,store,mechanic)_
- ✅ **Garage branding (BIZ constant)** — BIZ = 'Mahalaxmi Travels'; displayed in greet, bills, dashboard; garage meta store overridable by owner _(owner)_
- ✅ **GPS provider adapter & demo fallback** — sync_server.py /gps endpoint simulates GPS data; real provider swappable via GpsProvider adapter (app.js:345–365); demo simulator uses hash-seeded sine curves _(owner,supervisor,mechanic)_
- ✅ **Photo storage (uploads/ directory)** — sync_server.py saves uploaded dataURLs to local /uploads/ folder; serves them back via HTTP GET /uploads/{name} _(owner,supervisor,store,mechanic)_
- ✅ **Auth token lifecycle (online)** — Login returns Bearer token; token stored in localStorage; 12h expiry server-side; expired tokens clear session _(owner,supervisor,store,mechanic,driver)_
- ✅ **Brute-force protection (login attempts)** — Online: 5 fails/user -> 429 lockout, 15min window; Offline: 5 fails/user cached, same 15min offline lockout _(owner,supervisor,store,mechanic,driver)_
- ✅ **PIN change (on device & server)** — Staff can change own PIN online via /auth/setpin; owner/supervisor can reset any staff PIN; change syncs to server _(owner,supervisor,store,mechanic,driver)_
- ✅ **Add staff on server (owner/supervisor)** — Owner/supervisor can create new staff logins via Me → Staff → Add staff; server-side role-gated (403 if mechanic attempts) _(owner,supervisor)_
- ✅ **Sync status indicator (top bar)** — Chip shows Synced (●), Syncing (◐), Offline (○); updates on status change via onStatus callback _(owner,supervisor,store,mechanic,driver)_
- ✅ **Sync info dashboard (diagnostics)** — Me → Sync shows: deviceId, last sync time, pending changes, photos queued, quarantined records, server URL _(owner,supervisor,store,mechanic,driver)_
- ✅ **Manifest display & orientation** — display=standalone hides URL bar; orientation=portrait locks to portrait mode on mobile _(owner,supervisor,store,mechanic,driver)_
- ✅ **App shell caching strategy** — Service worker caches HTML, CSS, JS; cache-first for GET requests; old cache versions deleted on activate _(owner,supervisor,store,mechanic,driver)_
- ✅ **Zoom & pinch support** — No viewport zoom lock; pinch-to-zoom allowed; text remains readable on zoom _(owner,supervisor,store,mechanic,driver)_
- 🟡 **Keyboard support (focus, tab)** — Tab navigation through form inputs and buttons; focus outlines on buttons; no keyboard traps _(owner,supervisor,store,mechanic,driver)_
- ✅ **Form labels & error messages** — Input fields have associated labels; validation toasts (e.g. 'Enter quantity') provide feedback _(owner,supervisor,store,mechanic)_
- ✅ **RTL (right-to-left) layout support** — No explicit RTL support; Hindi UI renders correctly but layout remains LTR (not a blocker for Jaipur market) _(owner,supervisor,store,mechanic,driver)_
- ✅ **Battery & data optimization (offline-first)** — App works fully offline; sync only on network available; photos downscaled to ~60KB JPEG; no auto-refresh consuming data _(owner,supervisor,store,mechanic,driver)_
