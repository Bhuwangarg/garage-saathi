# Moving staff phones off the installed app, onto the web app

**Decided 2026-09-09.** Staff phones stop using the sideloaded Android/iOS app and
use the web app added to the home screen instead.

## Why

`mobile/` is a Capacitor shell that **bundles a copy of the web code into the
installed app** (`webDir: "www"`, and no `server.url` in `capacitor.config.json`).
The JavaScript inside an installed app is frozen at the moment it was built. It
never fetches anything from the server, so **no deploy can ever reach it.**

On 2026-09-09 the bundled copy was dated **2 August** — five weeks old:

    mobile/www/app.js   Aug  2 17:34
    mobile/www/sync.js  Aug  2 17:34

It contained no crew bank, no Crew Manager role, and none of the sync fixes. A
phone running it could not show a staff member created that week, and — because
the old `sync.js` reported an expired session as "Offline" — it silently stopped
receiving records altogether while continuing to look like it was working. That
cost a day of diagnosis: the laptop was correct, the phone was five weeks behind,
and nothing on either screen said so.

The web app has no such gap. The service worker is network-first, so every online
launch picks up the current code, and a fix reaches every phone by itself.

## What each person does, once

Open **Chrome** (Android) or **Safari** (iPhone — it must be Safari) and go to:

    https://garage-saathi-sync.vercel.app

- **Android:** ⋮ menu → *Install app* / *Add to Home screen*.
- **iPhone:** Share button → *Add to Home Screen*.

Then open it from the new home-screen icon and **log in once while online**, so the
device gets a session and pulls the roster.

Hindi, for telling staff · स्टाफ़ को यही बताइए:

> क्रोम (या आईफ़ोन पर सफ़ारी) में यह पता खोलिए, मेन्यू से **होम स्क्रीन पर जोड़ें**
> दबाइए, फिर नए आइकन से ऐप खोलकर एक बार इंटरनेट चालू रखते हुए लॉगिन कीजिए।

## Then delete the old app — this is the important step

Uninstall **Garage Saathi (`com.mahalaxmi.garagesaathi`)** from every phone.

Both icons look the same. If the old one is left installed, people will keep
opening it, keep seeing five-week-old data, and get no warning at all — the old
build cannot be told anything, because its code is frozen and its only
server-controlled message is a PIN lockout. There is no way to make it announce
itself. Removing it is the only reliable fix.

## Confirming a phone is on the new one

Open **Me → Sync**. If there is a **"⤓ Re-download everything"** button, the phone
is running current code. If that button is missing, it is still the old app (or a
stale cache) — check the icon they opened.

Also on that screen: **Status**. "Signed out — log in again to sync" means exactly
that, and is no longer hidden behind the word "Offline".

## Do not sideload the APK again

`mobile/` is left in the repo as a working native project, but it is **not
maintained** and its `www/` is stale. Do not distribute a build from it without
first running `cd mobile && npm run sync` to copy the current web code in — and
even then, every future fix needs a rebuild and a reinstall on every phone, which
is the problem this change exists to end.

If a native app is ever wanted again, the maintainable shape is to set
`server.url` in `capacitor.config.json` to the deployed origin, so the shell loads
the live web app and updates itself.
