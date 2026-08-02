// Produces the two source images @capacitor/assets expands into every iOS/Android
// icon and splash size.
//
//   assets/icon.png    1024x1024 — upscaled from the PWA's icons/icon-512.png via sips
//   assets/splash.png  2732x2732 — solid #0f1720, the app's own background_color
//
// The splash is generated rather than drawn: a flat brand-background splash is what the
// manifest already declares (background_color/theme_color are both #0f1720), and it
// avoids stretching a 512px gradient across a tablet screen.

import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'assets');
await mkdir(out, { recursive: true });

// --- icon: 512 -> 1024 ------------------------------------------------------
await copyFile(join(root, 'icons', 'icon-512.png'), join(out, 'icon.png'));
execFileSync('sips', ['-z', '1024', '1024', join(out, 'icon.png')], { stdio: 'ignore' });

// --- splash: solid #0f1720 --------------------------------------------------
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
  };
})();

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
};

const SIZE = 2732;
const [R, G, B] = [0x0f, 0x17, 0x20];

const row = Buffer.alloc(1 + SIZE * 3);       // filter byte 0 + RGB triples
for (let x = 0; x < SIZE; x++) {
  row[1 + x * 3] = R;
  row[2 + x * 3] = G;
  row[3 + x * 3] = B;
}
const raw = Buffer.concat(Array.from({ length: SIZE }, () => row));

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;    // bit depth
ihdr[9] = 2;    // colour type: truecolour
// bytes 10-12 (compression, filter, interlace) stay 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

await writeFile(join(out, 'splash.png'), png);
await writeFile(join(out, 'splash-dark.png'), png);

console.log(`assets/icon.png 1024x1024, assets/splash.png ${SIZE}x${SIZE} (#0f1720)`);
