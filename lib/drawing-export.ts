'use client';
import { BoundingBox, Unit } from './types';

export interface DrawingOpts {
  boxes: BoundingBox[];
  imageW: number;
  imageH: number;
  pixelsPerUnit: number;
  unit: Unit;
  title?: string;
}

function fmt(n: number, unit: Unit) {
  return unit === 'in' ? n.toFixed(3) : n.toFixed(1);
}

function ul(unit: Unit) {
  return unit === 'in' ? '"' : unit;
}

// ─── SVG dimension-line helpers ───────────────────────────────────────────────

function dimH(x1: number, x2: number, y: number, label: string, color: string): string {
  const mid = (x1 + x2) / 2;
  const lblW = label.length * 5.5 + 4;
  return [
    `<line x1="${x1}" y1="${y-4}" x2="${x1}" y2="${y+4}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x2}" y1="${y-4}" x2="${x2}" y2="${y+4}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x1}" y1="${y-3}" x2="${x1+5}" y2="${y}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x1}" y1="${y+3}" x2="${x1+5}" y2="${y}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x2}" y1="${y-3}" x2="${x2-5}" y2="${y}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x2}" y1="${y+3}" x2="${x2-5}" y2="${y}" stroke="${color}" stroke-width="0.8"/>`,
    `<rect x="${mid-lblW/2}" y="${y-11}" width="${lblW}" height="10" fill="white"/>`,
    `<text x="${mid}" y="${y-3}" text-anchor="middle" font-family="monospace" font-size="7.5" fill="${color}">${label}</text>`,
  ].join('');
}

function dimV(y1: number, y2: number, x: number, label: string, color: string): string {
  const mid = (y1 + y2) / 2;
  const lblW = label.length * 5.5 + 4;
  return [
    `<line x1="${x-4}" y1="${y1}" x2="${x+4}" y2="${y1}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x-4}" y1="${y2}" x2="${x+4}" y2="${y2}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x-3}" y1="${y1}" x2="${x}" y2="${y1+5}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x+3}" y1="${y1}" x2="${x}" y2="${y1+5}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x-3}" y1="${y2}" x2="${x}" y2="${y2-5}" stroke="${color}" stroke-width="0.8"/>`,
    `<line x1="${x+3}" y1="${y2}" x2="${x}" y2="${y2-5}" stroke="${color}" stroke-width="0.8"/>`,
    `<rect x="${x+3}" y="${mid-lblW/2}" width="10" height="${lblW}" fill="white" transform="rotate(90,${x+8},${mid})"/>`,
    `<text x="${x+8}" y="${mid}" dominant-baseline="middle" font-family="monospace" font-size="7.5" fill="${color}" transform="rotate(90,${x+8},${mid})">${label}</text>`,
  ].join('');
}

// ─── SVG Engineering Drawing ──────────────────────────────────────────────────

export function generateDrawingSVG(opts: DrawingOpts): string {
  const { boxes, imageW, imageH, pixelsPerUnit, unit, title = 'Board Layout' } = opts;
  const boardW = imageW / pixelsPerUnit;
  const boardH = imageH / pixelsPerUnit;

  const PAGE_W = 1240;
  const PAGE_H = 878;   // A3 landscape proportions
  const MARGIN = 20;
  const TABLE_W = 230;
  const TITLE_H = 70;
  const DIM_PAD = 36;   // space around board for outer dimension lines

  const drawAreaW = PAGE_W - MARGIN * 2 - TABLE_W - 12;
  const drawAreaH = PAGE_H - MARGIN * 2 - TITLE_H;

  const scale = Math.min(
    (drawAreaW - DIM_PAD * 2) / boardW,
    (drawAreaH - DIM_PAD * 2) / boardH,
  );

  // Board origin in SVG space
  const ox = MARGIN + DIM_PAD + (drawAreaW - DIM_PAD * 2 - boardW * scale) / 2;
  const oy = MARGIN + DIM_PAD + (drawAreaH - DIM_PAD * 2 - boardH * scale) / 2;
  const bW = boardW * scale;
  const bH = boardH * scale;

  const rx = (x: number) => ox + x * scale;
  const ry = (y: number) => oy + y * scale;

  const p: string[] = [];

  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">`);
  p.push(`<rect width="${PAGE_W}" height="${PAGE_H}" fill="white"/>`);

  // Outer frame
  p.push(`<rect x="${MARGIN/2}" y="${MARGIN/2}" width="${PAGE_W-MARGIN}" height="${PAGE_H-MARGIN}" fill="none" stroke="#111" stroke-width="2"/>`);
  // Inner frame
  p.push(`<rect x="${MARGIN}" y="${MARGIN}" width="${PAGE_W-MARGIN*2}" height="${PAGE_H-MARGIN*2-TITLE_H}" fill="none" stroke="#ccc" stroke-width="0.5"/>`);

  // ── Title block ──────────────────────────────────────────────────────────────
  const tbY = PAGE_H - MARGIN / 2 - TITLE_H;
  p.push(`<rect x="${MARGIN/2}" y="${tbY}" width="${PAGE_W-MARGIN}" height="${TITLE_H}" fill="#f8f8f8" stroke="#111" stroke-width="1.5"/>`);
  // Dividers
  p.push(`<line x1="${MARGIN/2}" y1="${tbY+TITLE_H*0.5}" x2="${PAGE_W-MARGIN/2}" y2="${tbY+TITLE_H*0.5}" stroke="#bbb" stroke-width="0.5"/>`);

  p.push(`<text x="${PAGE_W/2}" y="${tbY+22}" text-anchor="middle" font-family="monospace" font-size="15" font-weight="bold" fill="#111">${title}</text>`);
  p.push(`<text x="${PAGE_W/2}" y="${tbY+42}" text-anchor="middle" font-family="monospace" font-size="9" fill="#444">BOARD: ${fmt(boardW, unit)} × ${fmt(boardH, unit)} ${ul(unit)}  ·  SCALE 1:1 (real-world units)  ·  ${boxes.length} component${boxes.length !== 1 ? 's' : ''}</text>`);
  p.push(`<text x="${PAGE_W/2}" y="${tbY+58}" text-anchor="middle" font-family="monospace" font-size="8" fill="#888">Generated by BoardScan  ·  Units: ${unit}  ·  ${new Date().toLocaleDateString()}</text>`);

  // ── Table divider ────────────────────────────────────────────────────────────
  const tableX = PAGE_W - MARGIN - TABLE_W;
  p.push(`<line x1="${tableX}" y1="${MARGIN}" x2="${tableX}" y2="${PAGE_H-MARGIN/2-TITLE_H}" stroke="#aaa" stroke-width="1"/>`);

  // Table header
  const TH = 16;
  p.push(`<rect x="${tableX}" y="${MARGIN}" width="${TABLE_W}" height="${TH+2}" fill="#e8e8e8" stroke="none"/>`);
  const cols = [tableX+6, tableX+58, tableX+110, tableX+155, tableX+192];
  const headers = ['Label', `W(${ul(unit)})`, `H(${ul(unit)})`, `X(${ul(unit)})`, `Y(${ul(unit)})`];
  headers.forEach((h, i) => {
    p.push(`<text x="${cols[i]}" y="${MARGIN+TH-3}" font-family="monospace" font-size="8.5" font-weight="bold" fill="#333">${h}</text>`);
  });
  p.push(`<line x1="${tableX}" y1="${MARGIN+TH+2}" x2="${tableX+TABLE_W}" y2="${MARGIN+TH+2}" stroke="#999" stroke-width="1"/>`);

  boxes.forEach((box, idx) => {
    const rowY = MARGIN + TH + 4 + idx * TH;
    if (rowY + TH > PAGE_H - MARGIN / 2 - TITLE_H - 4) return;
    const color = box.color;
    if (idx % 2 === 1) {
      p.push(`<rect x="${tableX}" y="${rowY}" width="${TABLE_W}" height="${TH}" fill="#f5f5f5" stroke="none"/>`);
    }
    p.push(`<rect x="${cols[0]}" y="${rowY+3}" width="8" height="8" rx="1" fill="${color}"/>`);
    p.push(`<text x="${cols[0]+11}" y="${rowY+12}" font-family="monospace" font-size="8" font-weight="bold" fill="${color}">${box.label}</text>`);
    p.push(`<text x="${cols[1]}" y="${rowY+12}" font-family="monospace" font-size="8" fill="#222">${fmt(box.realW, unit)}</text>`);
    p.push(`<text x="${cols[2]}" y="${rowY+12}" font-family="monospace" font-size="8" fill="#222">${fmt(box.realH, unit)}</text>`);
    p.push(`<text x="${cols[3]}" y="${rowY+12}" font-family="monospace" font-size="8" fill="#555">${fmt(box.realX, unit)}</text>`);
    p.push(`<text x="${cols[4]}" y="${rowY+12}" font-family="monospace" font-size="8" fill="#555">${fmt(box.realY, unit)}</text>`);
    p.push(`<line x1="${tableX}" y1="${rowY+TH}" x2="${tableX+TABLE_W}" y2="${rowY+TH}" stroke="#e0e0e0" stroke-width="0.5"/>`);
  });

  // ── Board outline ────────────────────────────────────────────────────────────
  p.push(`<rect x="${ox}" y="${oy}" width="${bW}" height="${bH}" fill="#fdfdf8" stroke="#333" stroke-width="1.5"/>`);

  // Overall dimensions
  p.push(dimH(ox, ox + bW, oy - 20, `${fmt(boardW, unit)}${ul(unit)}`, '#444'));
  p.push(dimV(oy, oy + bH, ox - 22, `${fmt(boardH, unit)}${ul(unit)}`, '#444'));

  // ── Component boxes ──────────────────────────────────────────────────────────
  boxes.forEach((box) => {
    const color = box.color;
    const bx = rx(box.realX);
    const by = ry(box.realY);
    const bw = Math.max(2, box.realW * scale);
    const bh = Math.max(2, box.realH * scale);

    // Parse color for fill tint
    const r16 = parseInt(color.slice(1, 3), 16);
    const g16 = parseInt(color.slice(3, 5), 16);
    const b16 = parseInt(color.slice(5, 7), 16);

    p.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="rgba(${r16},${g16},${b16},0.1)" stroke="${color}" stroke-width="1" stroke-dasharray="4,2"/>`);

    // Label: inside if box is big enough, badge above otherwise
    const fontSize = 8;
    if (bw > 30 && bh > 14) {
      p.push(`<text x="${bx+bw/2}" y="${by+bh/2}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fontSize}" font-weight="bold" fill="${color}">${box.label}</text>`);
    } else {
      const lw = box.label.length * 6 + 6;
      p.push(`<rect x="${bx}" y="${by-12}" width="${lw}" height="11" rx="2" fill="${color}"/>`);
      p.push(`<text x="${bx+3}" y="${by-3}" font-family="monospace" font-size="7.5" font-weight="bold" fill="white">${box.label}</text>`);
    }

    // Width dimension below
    if (bw >= 14) {
      p.push(dimH(bx, bx + bw, by + bh + 14, `${fmt(box.realW, unit)}${ul(unit)}`, color));
    }

    // Height dimension right
    if (bh >= 12) {
      p.push(dimV(by, by + bh, bx + bw + 14, `${fmt(box.realH, unit)}${ul(unit)}`, color));
    }
  });

  p.push('</svg>');
  return p.join('\n');
}

// ─── DXF R12 (AC1009) ─────────────────────────────────────────────────────────
// Coordinates are in real-world units; Y is flipped (DXF Y increases upward).

export function generateDXF(opts: DrawingOpts): string {
  const { boxes, imageW, imageH, pixelsPerUnit, unit } = opts;
  const boardW = imageW / pixelsPerUnit;
  const boardH = imageH / pixelsPerUnit;

  // DXF Y: flip from screen-space (Y down) to CAD-space (Y up)
  const dy = (screenY: number) => boardH - screenY;

  const lines: string[] = [];

  const e = (...parts: (string | number)[]) => lines.push(...parts.map(String));

  // ── Header ────────────────────────────────────────────────────────────────────
  e('0','SECTION','2','HEADER');
  e('9','$ACADVER','1','AC1009');
  e('9','$INSBASE','10','0.0','20','0.0','30','0.0');
  e('9','$EXTMIN','10','0.0','20','0.0','30','0.0');
  e(`9\n$EXTMAX\n10\n${boardW.toFixed(4)}\n20\n${boardH.toFixed(4)}\n30\n0.0`);
  e('9','$LUNITS','70','2');  // decimal
  // INSUNITS (not in R12 but most readers accept it): 4=mm, 5=cm, 1=inches
  const insunits = unit === 'mm' ? 4 : unit === 'cm' ? 5 : 1;
  e('9','$INSUNITS','70',`${insunits}`);
  e('0','ENDSEC');

  // ── Tables (minimal) ─────────────────────────────────────────────────────────
  e('0','SECTION','2','TABLES');
  e('0','TABLE','2','LAYER','70','4');

  const addLayer = (name: string, color: number) => {
    e('0','LAYER','2',name,'70','0','62',`${color}`,'6','CONTINUOUS');
  };
  addLayer('OUTLINE', 7);      // white/black
  addLayer('COMPONENTS', 5);   // blue
  addLayer('DIMENSIONS', 3);   // green
  addLayer('LABELS', 1);       // red

  e('0','ENDTAB','0','ENDSEC');

  // ── Entities ──────────────────────────────────────────────────────────────────
  e('0','SECTION','2','ENTITIES');

  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    e('0','LINE','8',layer);
    e('10',x1.toFixed(4),'20',y1.toFixed(4),'30','0.0');
    e('11',x2.toFixed(4),'21',y2.toFixed(4),'31','0.0');
  };

  const text = (layer: string, x: number, y: number, h: number, content: string) => {
    e('0','TEXT','8',layer);
    e('10',x.toFixed(4),'20',y.toFixed(4),'30','0.0');
    e('40',h.toFixed(4),'1',content);
  };

  const rect = (layer: string, x: number, y: number, w: number, h: number) => {
    // Corners: bottom-left origin (DXF Y-up space)
    line(layer, x, y, x+w, y);
    line(layer, x+w, y, x+w, y+h);
    line(layer, x+w, y+h, x, y+h);
    line(layer, x, y+h, x, y);
  };

  const dimLineH_dxf = (layer: string, x1: number, x2: number, y: number, label: string) => {
    const th = boardH * 0.012;
    line(layer, x1, y, x2, y);
    line(layer, x1, y - th * 0.4, x1, y + th * 0.4);
    line(layer, x2, y - th * 0.4, x2, y + th * 0.4);
    text(layer, (x1+x2)/2, y + th * 0.2, th * 0.9, label);
  };

  const dimLineV_dxf = (layer: string, y1: number, y2: number, x: number, label: string) => {
    const th = boardH * 0.012;
    line(layer, x, y1, x, y2);
    line(layer, x - th * 0.4, y1, x + th * 0.4, y1);
    line(layer, x - th * 0.4, y2, x + th * 0.4, y2);
    // Rotated text isn't trivially doable in R12 TEXT so we put it horizontally
    text(layer, x + th * 0.3, (y1+y2)/2, th * 0.9, label);
  };

  // Board outline
  rect('OUTLINE', 0, 0, boardW, boardH);

  // Overall dimensions
  const ulStr = ul(unit);
  const dimOff = boardW * 0.04;
  dimLineH_dxf('DIMENSIONS', 0, boardW, boardH + dimOff, `${fmt(boardW, unit)}${ulStr}`);
  dimLineV_dxf('DIMENSIONS', 0, boardH, -dimOff, `${fmt(boardH, unit)}${ulStr}`);

  // Title text
  const th = boardH * 0.015;
  text('LABELS', boardW * 0.02, -dimOff * 2.5, th * 1.4, `BoardScan Layout  |  ${fmt(boardW, unit)} x ${fmt(boardH, unit)} ${ulStr}  |  ${boxes.length} components`);

  // Component boxes
  boxes.forEach((box) => {
    const dxfX = box.realX;
    const dxfY = dy(box.realY + box.realH);  // flip: top becomes bottom in DXF
    const dxfW = box.realW;
    const dxfH = box.realH;

    rect('COMPONENTS', dxfX, dxfY, dxfW, dxfH);

    const labelH = boardH * 0.012;
    const cx = dxfX + dxfW / 2 - box.label.length * labelH * 0.3;
    const cy = dxfY + dxfH / 2 - labelH / 2;
    text('LABELS', cx, cy, labelH, box.label);

    // Dimensions
    const dimOff2 = boardH * 0.025;
    dimLineH_dxf('DIMENSIONS', dxfX, dxfX + dxfW, dxfY - dimOff2, `${fmt(box.realW, unit)}${ulStr}`);
    dimLineV_dxf('DIMENSIONS', dxfY, dxfY + dxfH, dxfX + dxfW + dimOff2, `${fmt(box.realH, unit)}${ulStr}`);
  });

  e('0','ENDSEC','0','EOF');

  return lines.join('\n');
}

// ─── Download helpers ─────────────────────────────────────────────────────────

export function downloadSVG(opts: DrawingOpts) {
  const svg = generateDrawingSVG(opts);
  dl(new Blob([svg], { type: 'image/svg+xml' }), 'boardscan-drawing.svg');
}

export function downloadDXF(opts: DrawingOpts) {
  const dxf = generateDXF(opts);
  dl(new Blob([dxf], { type: 'application/dxf' }), 'boardscan-drawing.dxf');
}

function dl(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
