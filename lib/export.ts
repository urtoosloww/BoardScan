'use client';
import { BoundingBox, Unit } from './types';

function unitLabel(unit: Unit) {
  return unit === 'in' ? '"' : unit;
}

function fmt(n: number, unit: Unit) {
  return unit === 'in' ? n.toFixed(3) : n.toFixed(1);
}

// ─── SVG export ───────────────────────────────────────────────────────────────
export function exportSVG(
  imageDataUrl: string,
  imageW: number,
  imageH: number,
  boxes: BoundingBox[],
  unit: Unit,
  pixelsPerUnit: number
) {
  const scale = 1; // 1 px = 1 SVG unit
  const ul = unitLabel(unit);
  const margin = 60;
  const totalW = imageW + margin * 2;
  const totalH = imageH + margin * 2 + 80;

  let svgParts: string[] = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`
  );
  svgParts.push(`<rect width="${totalW}" height="${totalH}" fill="#0f172a"/>`);

  // Title
  svgParts.push(
    `<text x="${totalW / 2}" y="30" text-anchor="middle" fill="#e2e8f0" font-family="monospace" font-size="16" font-weight="bold">BoardScan Layout</text>`
  );
  svgParts.push(
    `<text x="${totalW / 2}" y="50" text-anchor="middle" fill="#64748b" font-family="monospace" font-size="11">Scale: 1${ul} = ${pixelsPerUnit.toFixed(1)}px</text>`
  );

  // Image
  svgParts.push(`<image href="${imageDataUrl}" x="${margin}" y="${margin + 20}" width="${imageW}" height="${imageH}" opacity="0.9"/>`);

  // Bounding boxes
  for (const box of boxes) {
    const bx = box.x + margin;
    const by = box.y + margin + 20;
    svgParts.push(`<rect x="${bx}" y="${by}" width="${box.w}" height="${box.h}"
      fill="none" stroke="${box.color}" stroke-width="2" stroke-dasharray="6,3"/>`);

    // Label badge
    const lw = Math.max(box.label.length * 7 + 10, 30);
    svgParts.push(`<rect x="${bx}" y="${by - 16}" width="${lw}" height="16" fill="${box.color}" rx="3"/>`);
    svgParts.push(`<text x="${bx + 5}" y="${by - 4}" fill="white" font-family="monospace" font-size="10" font-weight="bold">${box.label}</text>`);

    // Width dimension line (below box)
    const dY = by + box.h + 14;
    svgParts.push(`<line x1="${bx}" y1="${dY}" x2="${bx + box.w}" y2="${dY}" stroke="${box.color}" stroke-width="1"/>`);
    svgParts.push(`<line x1="${bx}" y1="${dY - 4}" x2="${bx}" y2="${dY + 4}" stroke="${box.color}" stroke-width="1"/>`);
    svgParts.push(`<line x1="${bx + box.w}" y1="${dY - 4}" x2="${bx + box.w}" y2="${dY + 4}" stroke="${box.color}" stroke-width="1"/>`);
    svgParts.push(
      `<text x="${bx + box.w / 2}" y="${dY + 12}" text-anchor="middle" fill="${box.color}" font-family="monospace" font-size="9">${fmt(box.realW, unit)}${ul}</text>`
    );

    // Height dimension line (right of box)
    const dX = bx + box.w + 14;
    svgParts.push(`<line x1="${dX}" y1="${by}" x2="${dX}" y2="${by + box.h}" stroke="${box.color}" stroke-width="1"/>`);
    svgParts.push(`<line x1="${dX - 4}" y1="${by}" x2="${dX + 4}" y2="${by}" stroke="${box.color}" stroke-width="1"/>`);
    svgParts.push(`<line x1="${dX - 4}" y1="${by + box.h}" x2="${dX + 4}" y2="${by + box.h}" stroke="${box.color}" stroke-width="1"/>`);
    svgParts.push(
      `<text x="${dX + 5}" y="${by + box.h / 2}" dominant-baseline="middle" fill="${box.color}" font-family="monospace" font-size="9">${fmt(box.realH, unit)}${ul}</text>`
    );
  }

  // Scale bar
  const sbPx = pixelsPerUnit * 10; // 10 units
  const sbX = margin;
  const sbY = imageH + margin + 40;
  svgParts.push(`<line x1="${sbX}" y1="${sbY}" x2="${sbX + sbPx}" y2="${sbY}" stroke="#94a3b8" stroke-width="3"/>`);
  svgParts.push(`<text x="${sbX + sbPx / 2}" y="${sbY + 14}" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="10">10${ul}</text>`);

  svgParts.push('</svg>');
  const svg = svgParts.join('\n');
  download(new Blob([svg], { type: 'image/svg+xml' }), 'boardscan-layout.svg');
}

// ─── PDF export ───────────────────────────────────────────────────────────────
export async function exportPDF(
  imageDataUrl: string,
  imageW: number,
  imageH: number,
  boxes: BoundingBox[],
  unit: Unit,
  pixelsPerUnit: number
) {
  const { jsPDF } = await import('jspdf');
  const ul = unitLabel(unit);

  // A4 landscape
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297, pageH = 210;
  const margin = 10;

  // Header
  doc.setFontSize(14);
  doc.setFont('courier', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('BoardScan — Component Layout', pageW / 2, 12, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('courier', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Scale: 1${ul} = ${pixelsPerUnit.toFixed(1)}px  |  ${boxes.length} components detected`, pageW / 2, 18, { align: 'center' });

  // Image scaled to fit
  const maxW = pageW - margin * 2 - 60; // leave room for table
  const maxH = pageH - 30;
  const scale = Math.min(maxW / imageW, maxH / imageH);
  const imgW = imageW * scale;
  const imgH = imageH * scale;
  const imgX = margin;
  const imgY = 22;

  doc.addImage(imageDataUrl, 'JPEG', imgX, imgY, imgW, imgH);

  // Overlay boxes on PDF image
  for (const box of boxes) {
    const r = parseInt(box.color.slice(1, 3), 16);
    const g = parseInt(box.color.slice(3, 5), 16);
    const b = parseInt(box.color.slice(5, 7), 16);
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([2, 1], 0);
    doc.rect(imgX + box.x * scale, imgY + box.y * scale, box.w * scale, box.h * scale);
    doc.setFillColor(r, g, b);
    doc.setFontSize(5);
    doc.setTextColor(255, 255, 255);
    doc.setFont('courier', 'bold');
    doc.text(box.label, imgX + box.x * scale + 1, imgY + box.y * scale + 4);
  }

  // Table of components
  const tableX = margin + imgW + 5;
  const tableY = imgY;
  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(50, 50, 50);
  doc.text('Component', tableX, tableY);
  doc.text(`W (${ul})`, tableX + 20, tableY);
  doc.text(`H (${ul})`, tableX + 32, tableY);
  doc.text(`X (${ul})`, tableX + 44, tableY);
  doc.text(`Y (${ul})`, tableX + 54, tableY);
  doc.setFont('courier', 'normal');

  boxes.forEach((box, i) => {
    const row = tableY + 6 + i * 5;
    if (row > pageH - margin) return;
    const r = parseInt(box.color.slice(1, 3), 16);
    const g2 = parseInt(box.color.slice(3, 5), 16);
    const b2 = parseInt(box.color.slice(5, 7), 16);
    doc.setTextColor(r, g2, b2);
    doc.text(box.label, tableX, row);
    doc.setTextColor(50, 50, 50);
    doc.text(fmt(box.realW, unit), tableX + 20, row);
    doc.text(fmt(box.realH, unit), tableX + 32, row);
    doc.text(fmt(box.realX, unit), tableX + 44, row);
    doc.text(fmt(box.realY, unit), tableX + 54, row);
  });

  doc.save('boardscan-layout.pdf');
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
