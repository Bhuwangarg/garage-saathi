# Mahalaxmi redPro Sync (Chrome extension)

Sends Mahalaxmi's own redPro data to Garage Saathi, so a redBus review can be
traced to the bus and crew that ran that trip. It uses the redPro tab you are
signed in to. It only reads: it never replies, assigns, exports or changes
anything in redPro, and it never sees your redPro password.

**What it sends:** redBus's bus and driver per service (hourly; redPro shows
only today, so Garage Saathi keeps the history), reviews, complaints, and the
service list. **Passengers' names and phone numbers are never sent.**

## Install on the office laptop (once, about 5 minutes)

1. Copy the `redpro-extension` folder onto the laptop, for example to `Documents\redpro-extension`.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode** (top right),
   click **Load unpacked**, and choose that folder.
3. Click the puzzle icon in Chrome's toolbar, then the pin next to **Mahalaxmi redPro Sync**.
4. Click the extension's icon. Open **Settings**, paste the **Garage Saathi token**, and click **Save**.
   Bhuwan has the token. It goes in the extension, never in a chat or an e-mail.
5. Open https://www.redbus.pro, sign in as usual, then right-click the tab and choose **Pin**.
   Keep that tab open.
6. Click the extension's icon, then **Sync now**. After a minute each row should show a time.

## Day to day

Nothing to do. Keep Chrome open with the pinned redPro tab. The icon shows:

- **OK**: synced in the last few hours.
- **OLD**: no sync for over 3 hours (the laptop slept, or Chrome was closed).
- **!**: needs a person. Click the icon to read why. Usually: *sign in again in the redPro tab*,
  or *open redPro in a tab*.

Timetable (IST):
- bus & driver: hourly, except 02:00–05:00
- reviews: 06:15 (last 14 days) and 18:15 (last 3 days); the very first sync reads 45 days
- complaints: 07:30, 13:30, 19:30
- service list: 05:30

A slot missed while the laptop slept runs once when it wakes, if it is less than 6 hours late.

## For whoever maintains it

- `lib.js` holds the logic (timetable, which fields are sent, the service-list parser).
  Tests: `TZ=Asia/Kolkata node redpro-extension/test_lib.js`.
- `background.js` holds the Chrome side. It runs the calls inside the redPro tab
  (`chrome.scripting.executeScript`, world `MAIN`) so they carry that tab's sign-in. It posts to
  `<Garage Saathi>/redpro/ingest` with the token (see `REDPRO_TRACE.md`).
- The service list comes in two calls: `getServiceWise` (10 services a page) and then
  `getServiceWiseViaRoute` for each service's via-routes. A review carries the passenger's own
  route, often a via-route. redPro returns an **empty answer** for its ~10 biggest services
  (200–400 routes). Those keep only their main route, and the popup says how many there were.
- **Why an extension and not a program on the laptop:** redPro's bot protection refuses an
  automated browser, and its sign-in does not survive one closing. A real Chrome with a real
  sign-in is the only way in, and this extension does not try to disguise anything.
- To update: replace the folder's files, then click the reload arrow on the extension in `chrome://extensions`.
