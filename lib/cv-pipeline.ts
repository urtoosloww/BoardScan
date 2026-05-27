'use client';
import { BoundingBox, ProcessResult, Unit } from './types';

// ── No OpenCV. Pure JS/Canvas pipeline — loads instantly, works offline. ────

const TARGET_PX = 80;
const BOX_COLORS = [
  '#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
  '#6366f1','#d946ef','#0ea5e9','#22c55e','#eab308',
];

// ── Image loading ─────────────────────────────────────────────────────────────
function imgToCanvas(src: string, maxDim = 1200): Promise<HTMLCanvasElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      res(c);
    };
    img.onerror = rej;
    img.src = src;
  });
}

// ── Pixel-level ops ───────────────────────────────────────────────────────────
function toGray(rgba: Uint8ClampedArray, n: number): Float32Array {
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++)
    g[i] = rgba[i*4]*0.299 + rgba[i*4+1]*0.587 + rgba[i*4+2]*0.114;
  return g;
}

// Separable box blur — O(N) per axis with correct replicate boundary
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    // Initialize window for x=0 with replicate boundary (clamp left negatives to 0)
    let s = 0;
    for (let d = -r; d <= r; d++) s += src[y * w + Math.max(0, Math.min(w - 1, d))];
    tmp[y * w] = s * inv;
    // Slide window across remaining columns
    for (let x = 1; x < w; x++) {
      s += src[y * w + Math.min(w - 1, x + r)];
      s -= src[y * w + Math.max(0, x - r - 1)];
      tmp[y * w + x] = s * inv;
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let d = -r; d <= r; d++) s += tmp[Math.max(0, Math.min(h - 1, d)) * w + x];
    dst[x] = s * inv;
    for (let y = 1; y < h; y++) {
      s += tmp[Math.min(h - 1, y + r) * w + x];
      s -= tmp[Math.max(0, y - r - 1) * w + x];
      dst[y * w + x] = s * inv;
    }
  }
  return dst;
}

// Sobel gradient magnitude
function sobel(g: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const gx = -g[(y-1)*w+(x-1)] - 2*g[y*w+(x-1)] - g[(y+1)*w+(x-1)]
               +  g[(y-1)*w+(x+1)] + 2*g[y*w+(x+1)] + g[(y+1)*w+(x+1)];
      const gy = -g[(y-1)*w+(x-1)] - 2*g[(y-1)*w+x] - g[(y-1)*w+(x+1)]
               +  g[(y+1)*w+(x-1)] + 2*g[(y+1)*w+x] + g[(y+1)*w+(x+1)];
      out[y*w+x] = Math.sqrt(gx*gx + gy*gy);
    }
  }
  return out;
}

// Row/col projection sums
function rowSums(e: Float32Array, w: number, h: number): Float32Array {
  const p = new Float32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y] += e[y*w+x];
  return p;
}
function colSums(e: Float32Array, w: number, h: number): Float32Array {
  const p = new Float32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[x] += e[y*w+x];
  return p;
}

// Smooth a 1D array
function smooth1D(arr: Float32Array, r: number): Float32Array {
  const inv = 1 / (2*r + 1);
  const out = new Float32Array(arr.length);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[Math.min(i+r, arr.length-1)];
    if (i > 0) s -= arr[Math.max(i-r-1, 0)];
    out[i] = s * inv;
  }
  return out;
}

// Find local maxima above a threshold, at least minDist apart
function findPeaks(p: Float32Array, minAmp: number, minDist: number): number[] {
  const peaks: number[] = [];
  for (let i = minDist; i < p.length - minDist; i++) {
    if (p[i] < minAmp) continue;
    let ok = true;
    for (let d = 1; d <= minDist && ok; d++)
      if (p[i-d] >= p[i] || p[i+d] >= p[i]) ok = false;
    if (ok) peaks.push(i);
  }
  return peaks;
}

function clusterPositions(pos: number[], gap: number): number[] {
  if (!pos.length) return [];
  const s = [...pos].sort((a, b) => a - b);
  const out = [s[0]]; const cnt = [1];
  for (let i = 1; i < s.length; i++) {
    if (s[i] - out[out.length-1] < gap) {
      const n = cnt[cnt.length-1];
      out[out.length-1] = (out[out.length-1]*n + s[i]) / (n+1);
      cnt[cnt.length-1]++;
    } else { out.push(s[i]); cnt.push(1); }
  }
  return out;
}

function medianSpacing(vals: number[]): number {
  if (vals.length < 2) return 0;
  const d = [];
  for (let i = 1; i < vals.length; i++) d.push(vals[i] - vals[i-1]);
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

// ── Linear algebra (for homography) ──────────────────────────────────────────
function gaussElim(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let maxR = c;
    for (let r = c+1; r < n; r++)
      if (Math.abs(M[r][c]) > Math.abs(M[maxR][c])) maxR = r;
    [M[c], M[maxR]] = [M[maxR], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = c+1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n-1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i+1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i] || 1;
  }
  return x;
}

// Direct linear transform for homography from N >= 4 correspondences
function computeH(
  src: [number,number][],
  dst: [number,number][]
): Float64Array {
  const rows: number[][] = [];
  for (let i = 0; i < src.length; i++) {
    const [x, y] = src[i], [xp, yp] = dst[i];
    rows.push([-x,-y,-1, 0,0,0, xp*x, xp*y, xp]);
    rows.push([ 0,0,0, -x,-y,-1, yp*x, yp*y, yp]);
  }
  // Least-squares: AᵀA h = 0 with h[8]=1 → solve 8×8
  const A8 = rows.map(r => r.slice(0, 8));
  const b = rows.map(r => -r[8]);
  // Normal equations
  const AtA: number[][] = Array.from({length:8}, () => new Array(8).fill(0));
  const Atb: number[] = new Array(8).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < 8; j++) {
      Atb[j] += A8[i][j] * b[i];
      for (let k = 0; k < 8; k++) AtA[j][k] += A8[i][j] * A8[i][k];
    }
  }
  const h8 = gaussElim(AtA, Atb);
  return new Float64Array([...h8, 1]);
}

function invertH3(H: Float64Array): Float64Array {
  const [a,b,c,d,e,f,g,h,i] = H;
  const det = a*(e*i-f*h) - b*(d*i-f*g) + c*(d*h-e*g);
  const inv = 1 / (det || 1);
  return new Float64Array([
     (e*i-f*h)*inv, -(b*i-c*h)*inv,  (b*f-c*e)*inv,
    -(d*i-f*g)*inv,  (a*i-c*g)*inv, -(a*f-c*d)*inv,
     (d*h-e*g)*inv, -(a*h-b*g)*inv,  (a*e-b*d)*inv,
  ]);
}

function applyH(H: Float64Array, x: number, y: number): [number,number] {
  const w = H[6]*x + H[7]*y + H[8];
  return [(H[0]*x + H[1]*y + H[2])/w, (H[3]*x + H[4]*y + H[5])/w];
}

// ── Perspective warp ──────────────────────────────────────────────────────────
function warpCanvas(
  src: HTMLCanvasElement,
  Hinv: Float64Array,
  outW: number,
  outH: number
): HTMLCanvasElement {
  const sCtx = src.getContext('2d')!;
  const sData = sCtx.getImageData(0, 0, src.width, src.height).data;
  const sw = src.width, sh = src.height;

  const dst = document.createElement('canvas');
  dst.width = outW; dst.height = outH;
  const dCtx = dst.getContext('2d')!;
  const out = dCtx.createImageData(outW, outH);
  const od = out.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = applyH(Hinv, x, y);
      const x0 = sx | 0, y0 = sy | 0;
      if (x0 < 0 || x0 >= sw-1 || y0 < 0 || y0 >= sh-1) continue;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0*sw+x0)*4, i10 = (y0*sw+x0+1)*4;
      const i01 = ((y0+1)*sw+x0)*4, i11 = ((y0+1)*sw+x0+1)*4;
      const oi = (y*outW+x)*4;
      for (let c = 0; c < 4; c++) {
        od[oi+c] = (1-fx)*(1-fy)*sData[i00+c] + fx*(1-fy)*sData[i10+c]
                 + (1-fx)*fy*sData[i01+c]     + fx*fy*sData[i11+c];
      }
    }
  }
  dCtx.putImageData(out, 0, 0);
  return dst;
}

// ── Component detection ───────────────────────────────────────────────────────
function adaptiveThresh(
  gray: Float32Array, w: number, h: number, r: number, C: number
): Uint8Array {
  const mean = boxBlur(gray, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w*h; i++) out[i] = gray[i] < mean[i] - C ? 1 : 0;
  return out;
}

// Fast separable dilate: horizontal max then vertical max
function dilateSep(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < r && x < w; x++) sum += src[y*w+x];
    for (let x = 0; x < w; x++) {
      sum += x+r < w ? src[y*w+x+r] : 0;
      sum -= x-r-1 >= 0 ? src[y*w+x-r-1] : 0;
      tmp[y*w+x] = sum > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y < r && y < h; y++) sum += tmp[y*w+x];
    for (let y = 0; y < h; y++) {
      sum += y+r < h ? tmp[(y+r)*w+x] : 0;
      sum -= y-r-1 >= 0 ? tmp[(y-r-1)*w+x] : 0;
      dst[y*w+x] = sum > 0 ? 1 : 0;
    }
  }
  return dst;
}

function erodeSep(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let zeros = 0;
    for (let x = 0; x < r && x < w; x++) if (!src[y*w+x]) zeros++;
    for (let x = 0; x < w; x++) {
      if (x+r < w && !src[y*w+x+r]) zeros++;
      if (x-r-1 >= 0 && !src[y*w+x-r-1]) zeros--;
      tmp[y*w+x] = zeros === 0 && src[y*w+x] ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let zeros = 0;
    for (let y = 0; y < r && y < h; y++) if (!tmp[y*w+x]) zeros++;
    for (let y = 0; y < h; y++) {
      if (y+r < h && !tmp[(y+r)*w+x]) zeros++;
      if (y-r-1 >= 0 && !tmp[(y-r-1)*w+x]) zeros--;
      dst[y*w+x] = zeros === 0 && tmp[y*w+x] ? 1 : 0;
    }
  }
  return dst;
}

// Two-pass connected components with union-find
function connectedComponents(
  bin: Uint8Array, w: number, h: number
): { x: number; y: number; w: number; h: number }[] {
  const lbl = new Int32Array(w * h).fill(-1);
  const par: number[] = [];
  const find = (n: number): number => par[n] === n ? n : (par[n] = find(par[n]));
  const union = (a: number, b: number) => { par[find(a)] = find(b); };

  // First pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!bin[y*w+x]) continue;
      const t = y > 0 ? lbl[(y-1)*w+x] : -1;
      const l = x > 0 ? lbl[y*w+x-1] : -1;
      if (t < 0 && l < 0) { lbl[y*w+x] = par.length; par.push(par.length); }
      else if (t >= 0 && l < 0) lbl[y*w+x] = t;
      else if (l >= 0 && t < 0) lbl[y*w+x] = l;
      else { lbl[y*w+x] = t; union(t, l); }
    }
  }

  // Collect bounding boxes per root
  const bx1: number[] = []; const by1: number[] = [];
  const bx2: number[] = []; const by2: number[] = [];
  for (let i = 0; i < par.length; i++) {
    bx1.push(Infinity); by1.push(Infinity); bx2.push(-1); by2.push(-1);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (lbl[y*w+x] < 0) continue;
      const r = find(lbl[y*w+x]);
      if (x < bx1[r]) bx1[r] = x; if (x > bx2[r]) bx2[r] = x;
      if (y < by1[r]) by1[r] = y; if (y > by2[r]) by2[r] = y;
    }
  }

  const out: { x:number; y:number; w:number; h:number }[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < par.length; i++) {
    const r = find(i);
    if (seen.has(r) || bx2[r] < 0) continue;
    seen.add(r);
    out.push({ x: bx1[r], y: by1[r], w: bx2[r]-bx1[r]+1, h: by2[r]-by1[r]+1 });
  }
  return out;
}

// IoU + NMS
function iou(a: {x:number;y:number;w:number;h:number}, b: typeof a): number {
  const x1 = Math.max(a.x,b.x), y1 = Math.max(a.y,b.y);
  const x2 = Math.min(a.x+a.w,b.x+b.w), y2 = Math.min(a.y+a.h,b.y+b.h);
  if (x2<=x1||y2<=y1) return 0;
  const inter = (x2-x1)*(y2-y1);
  return inter / (a.w*a.h + b.w*b.h - inter);
}

function nms<T extends {x:number;y:number;w:number;h:number}>(
  boxes: T[], thresh: number
): T[] {
  const s = [...boxes].sort((a,b) => b.w*b.h - a.w*a.h);
  const keep = s.map(() => true);
  for (let i = 0; i < s.length; i++) {
    if (!keep[i]) continue;
    for (let j = i+1; j < s.length; j++)
      if (keep[j] && iou(s[i], s[j]) > thresh) keep[j] = false;
  }
  return s.filter((_,i) => keep[i]);
}

export function toRealWorld(x: number, y: number, w: number, h: number, ppu: number) {
  return { realX: x/ppu, realY: y/ppu, realW: w/ppu, realH: h/ppu };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
export async function processImage(
  imageSrc: string,
  gridSquareSize: number,
  _unit: Unit,
  onStatus: (msg: string) => void,
  manualDims?: { boardW: number; boardH: number },
): Promise<ProcessResult> {

  onStatus('Loading image...');
  const canvas = await imgToCanvas(imageSrc, 1200);
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const rgba = ctx.getImageData(0, 0, W, H).data;

  // ── 1. Enhance ──────────────────────────────────────────────────────────────
  onStatus('Enhancing contrast...');
  const gray = toGray(rgba, W * H);
  const blurred = boxBlur(gray, W, H, 3);
  const edges = sobel(blurred, W, H);

  // ── 2. Grid line detection via projection profiles ──────────────────────────
  // Skip entirely when the user provides manual board dimensions.
  let hLines: number[] = [];
  let vLines: number[] = [];
  let hSpacing = 0;
  let vSpacing = 0;
  let gridDetected = false;

  if (!manualDims) {
    onStatus('Detecting grid lines...');
    const minDim = Math.min(W, H);
    const minAmpH = W * 5;
    const minAmpV = H * 5;
    const minDist = Math.round(minDim * 0.02);

    const rProj = smooth1D(rowSums(edges, W, H), 3);
    const cProj = smooth1D(colSums(edges, W, H), 3);

    hLines = findPeaks(rProj, minAmpH, minDist);
    vLines = findPeaks(cProj, minAmpV, minDist);

    if (hLines.length < 3 || vLines.length < 3) {
      const fH = Math.min(...rProj) + (Math.max(...rProj) - Math.min(...rProj)) * 0.25;
      const fV = Math.min(...cProj) + (Math.max(...cProj) - Math.min(...cProj)) * 0.25;
      hLines = findPeaks(rProj, fH, minDist);
      vLines = findPeaks(cProj, fV, minDist);
    }

    hLines = clusterPositions(hLines, minDist);
    vLines = clusterPositions(vLines, minDist);

    hSpacing = medianSpacing(hLines);
    vSpacing = medianSpacing(vLines);
    gridDetected = hLines.length >= 3 && vLines.length >= 3
      && hSpacing > 8 && vSpacing > 8;
  }

  // ── 3. Perspective correction ────────────────────────────────────────────────
  onStatus('Correcting perspective...');

  let correctedCanvas: HTMLCanvasElement;
  let pixelsPerUnit: number;
  let gridSpacingPx: number;
  let outW: number, outH: number;
  let displayScale = 1;

  if (manualDims) {
    // Manual calibration: derive scale from known board dimensions
    pixelsPerUnit = W / manualDims.boardW;
    // Use 2.54mm perfboard pitch as reference cell if gridSquareSize not set meaningfully,
    // otherwise use the provided gridSquareSize for morphology parameters.
    gridSpacingPx = Math.round(pixelsPerUnit * gridSquareSize);
    outW = W; outH = H;
    correctedCanvas = canvas;
  } else if (gridDetected) {
    const avgSpacing = (hSpacing + vSpacing) / 2;
    displayScale = TARGET_PX / avgSpacing;

    outW = Math.round(W * displayScale);
    outH = Math.round(H * displayScale);

    correctedCanvas = document.createElement('canvas');
    correctedCanvas.width = outW;
    correctedCanvas.height = outH;
    const corrCtx = correctedCanvas.getContext('2d')!;
    corrCtx.drawImage(canvas, 0, 0, outW, outH);

    pixelsPerUnit = TARGET_PX / gridSquareSize;
    gridSpacingPx = TARGET_PX;
  } else {
    const sp = ((hSpacing || 0) + (vSpacing || 0)) / ((hSpacing && vSpacing) ? 2 : 1) || Math.min(W, H) * 0.06;
    pixelsPerUnit = sp / gridSquareSize;
    gridSpacingPx = sp;
    outW = W; outH = H;
    correctedCanvas = canvas;
  }

  // ── 4. Component detection ───────────────────────────────────────────────────
  onStatus('Detecting components...');

  const cCtx = correctedCanvas.getContext('2d')!;
  const cRgba = cCtx.getImageData(0, 0, outW, outH).data;
  const cGray = toGray(cRgba, outW * outH);

  // Background estimate: the mat dominates (>50% of pixels), so the median
  // gray value is a reliable, boundary-artifact-free background reference.
  const grayHist = new Uint32Array(256);
  for (let i = 0; i < outW * outH; i++) grayHist[cGray[i] | 0]++;
  let cumH = 0; const halfPx = (outW * outH) / 2;
  let bgGray = 128;
  for (let v = 0; v < 256; v++) { cumH += grayHist[v]; if (cumH >= halfPx) { bgGray = v; break; } }

  // Smooth at component scale so fine texture (thin grid lines) averages out.
  const localR = Math.max(4, Math.round(gridSpacingPx * 0.2));
  const localBlur = boxBlur(cGray, outW, outH, localR);

  // Flag pixels whose local mean deviates from the mat color.
  // Threshold 30: above JPEG block artifacts (~15 levels) yet below typical
  // component contrast (gold resistor ≈ 49, dark components ≈ 188+).
  let binary: Uint8Array<ArrayBuffer> = new Uint8Array(outW * outH);
  for (let i = 0; i < outW * outH; i++)
    binary[i] = Math.abs(localBlur[i] - bgGray) > 30 ? 1 : 0;

  // Zero out the border margin — replicate boundary makes those values unreliable.
  const bm = Math.min(localR, Math.min(outW, outH) >> 1);
  for (let y = 0; y < bm; y++) for (let x = 0; x < outW; x++) binary[y*outW+x] = 0;
  for (let y = outH-bm; y < outH; y++) for (let x = 0; x < outW; x++) binary[y*outW+x] = 0;
  for (let x = 0; x < bm; x++) for (let y = 0; y < outH; y++) binary[y*outW+x] = 0;
  for (let x = outW-bm; x < outW; x++) for (let y = 0; y < outH; y++) binary[y*outW+x] = 0;

  // Mask actual grid-line positions using scaled source coordinates.
  // Keep gw small (2px) so the gap is narrow enough for closeR to bridge.
  if (gridDetected) {
    const gw = 2;
    for (const yl of hLines) {
      const sy = Math.round(yl * displayScale);
      for (let y = Math.max(0, sy - gw); y <= Math.min(outH - 1, sy + gw); y++)
        for (let x = 0; x < outW; x++) binary[y * outW + x] = 0;
    }
    for (const xl of vLines) {
      const sx = Math.round(xl * displayScale);
      for (let x = Math.max(0, sx - gw); x <= Math.min(outW - 1, sx + gw); x++)
        for (let y = 0; y < outH; y++) binary[y * outW + x] = 0;
    }
  }

  // Close: bridges grid-line gaps (gw=2, 5px gap → need closeR≥3; use 7% of cell).
  // Open: removes JPEG artifact blobs and thin grid lines; 8% of cell removes ≤ 12px blobs
  //        while keeping real components (smallest ≈ 40px in scaled image).
  const closeR = Math.max(5, Math.round(gridSpacingPx * 0.07));
  const openR  = Math.max(6, Math.round(gridSpacingPx * 0.08));
  binary = dilateSep(binary, outW, outH, closeR) as Uint8Array<ArrayBuffer>;
  binary = erodeSep(binary, outW, outH, closeR) as Uint8Array<ArrayBuffer>;
  binary = erodeSep(binary, outW, outH, openR) as Uint8Array<ArrayBuffer>;
  binary = dilateSep(binary, outW, outH, openR) as Uint8Array<ArrayBuffer>;

  const blobs = connectedComponents(binary, outW, outH);

  const minCellArea = Math.max(100, gridSpacingPx * gridSpacingPx * 0.04);
  const filtered = blobs.filter(b => {
    const area = b.w * b.h;
    const ar = b.w / b.h;
    return area >= minCellArea && area <= outW * outH * 0.6 && ar >= 0.04 && ar <= 25;
  });

  const deduped = nms(filtered, 0.3);

  // Sort top-to-bottom, left-to-right
  deduped.sort((a, b) => {
    const ra = Math.floor(a.y / Math.max(TARGET_PX, 1));
    const rb = Math.floor(b.y / Math.max(TARGET_PX, 1));
    return ra !== rb ? ra - rb : a.x - b.x;
  });

  const boxes: BoundingBox[] = deduped.map((r, i) => ({
    id: `box-${Date.now()}-${i}`,
    label: `C${i+1}`,
    color: BOX_COLORS[i % BOX_COLORS.length],
    x: r.x, y: r.y, w: r.w, h: r.h,
    ...toRealWorld(r.x, r.y, r.w, r.h, pixelsPerUnit),
  }));

  return {
    correctedDataUrl: correctedCanvas.toDataURL('image/jpeg', 0.92),
    imageW: outW,
    imageH: outH,
    pixelsPerUnit,
    gridSpacingPx,
    boxes,
    gridDetected,
  };
}
