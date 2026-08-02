// Copies the Garage Saathi PWA (which lives in the repo root, because the root IS the
// GitHub Pages site) into mobile/www/ so Capacitor has a webDir to bundle.
//
// Two native-only rewrites happen here, so the shared root files stay exactly what
// GitHub Pages serves:
//   1. The Leaflet + face-api CDN tags are repointed at vendored copies under vendor/,
//      so the packaged app keeps its map and face detection with no network.
//   2. Nothing else. app.js / sync.js / db.js are copied byte-for-byte — the native
//      build must run the same code the 34/34 enforcement tests and the 5-role
//      regression were run against.

import { cp, mkdir, rm, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const www = join(here, 'www');

// Everything the app actually loads. Deliberately explicit: copying the whole repo
// would drag .git, node_modules, sync.db, uploads/ and the probe_*.html files in.
const FILES = [
  'index.html',
  'styles.css',
  'seed-data.js',
  'seed-docs.js',
  'db.js',
  'sync.js',
  'app.js',
  'manifest.webmanifest',
];
const DIRS = ['icons', 'assets'];

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });

for (const f of FILES) {
  if (!(await exists(join(root, f)))) throw new Error(`missing web asset: ${f}`);
  await cp(join(root, f), join(www, f));
}
for (const d of DIRS) {
  if (await exists(join(root, d))) await cp(join(root, d), join(www, d), { recursive: true });
}

// --- vendored third-party libs (offline map + face detection) ---------------
const VENDOR = [
  ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'vendor/leaflet.css'],
  ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'vendor/leaflet.js'],
  ['https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js', 'vendor/face-api.js'],
];
const cache = join(here, '.vendor-cache');
await mkdir(cache, { recursive: true });
await mkdir(join(www, 'vendor'), { recursive: true });

for (const [url, dest] of VENDOR) {
  const cached = join(cache, dest.split('/').pop());
  if (!(await exists(cached))) {
    process.stdout.write(`fetching ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`vendor fetch failed ${res.status}: ${url}`);
    await writeFile(cached, Buffer.from(await res.arrayBuffer()));
  }
  await cp(cached, join(www, dest));
}

// Leaflet's CSS references marker images relative to itself; pull those too so the
// map's default markers render offline.
const LEAFLET_IMAGES = ['marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png', 'layers.png', 'layers-2x.png'];
await mkdir(join(www, 'vendor', 'images'), { recursive: true });
for (const img of LEAFLET_IMAGES) {
  const cached = join(cache, img);
  if (!(await exists(cached))) {
    const res = await fetch(`https://unpkg.com/leaflet@1.9.4/dist/images/${img}`);
    if (!res.ok) continue;
    await writeFile(cached, Buffer.from(await res.arrayBuffer()));
  }
  await cp(cached, join(www, 'vendor', 'images', img));
}

// --- rewrite index.html to use the vendored copies --------------------------
let html = await readFile(join(www, 'index.html'), 'utf8');
const before = html;
html = html
  .replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'vendor/leaflet.css')
  .replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'vendor/leaflet.js')
  .replace('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js', 'vendor/face-api.js');
if (html === before) throw new Error('CDN rewrite matched nothing — index.html changed shape, check it');

// The service worker is dead weight inside a native shell: the assets are already on
// disk, and a stale SW cache would silently pin an old app.js across updates.
html = html.replace(
  "if ('serviceWorker' in navigator) {",
  "if ('serviceWorker' in navigator && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {"
);

// Capacitor injects its own native-bridge before the page loads, so window.Capacitor
// already exists here. The shim only has to land ahead of db.js/sync.js/app.js.
html = html.replace('<script src="seed-data.js"></script>',
  '<script src="native-bridge-shim.js"></script>\n  <script src="seed-data.js"></script>');

await writeFile(join(www, 'index.html'), html);

// The shim is native-only, so it is written here rather than kept in the repo root.
await cp(join(here, 'native-bridge-shim.js'), join(www, 'native-bridge-shim.js'));

console.log(`www/ built: ${FILES.length} files, ${DIRS.length} dirs, ${VENDOR.length} vendored libs`);
