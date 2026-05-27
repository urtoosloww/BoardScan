// Downloads the self-contained opencv.js (WASM embedded as data URI, ~10 MB)
// to public/ so it's served from the same origin — no CDN latency.
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const PUBLIC = join(process.cwd(), 'public');
const DEST = join(PUBLIC, 'opencv.js');
const URL = 'https://docs.opencv.org/4.10.0/opencv.js';

if (!existsSync(PUBLIC)) mkdirSync(PUBLIC, { recursive: true });

if (existsSync(DEST)) {
  console.log('✓ public/opencv.js already present — skipping download');
  process.exit(0);
}

console.log('Downloading opencv.js (~10 MB) to public/ …');
try {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeFileSync(DEST, Buffer.from(await res.arrayBuffer()));
  console.log('✓ public/opencv.js ready');
} catch (err) {
  // Non-fatal: the loader will fall back to CDN at runtime
  console.warn('⚠  Could not download opencv.js:', err.message);
  console.warn('   The app will load it from CDN at runtime instead.');
}
