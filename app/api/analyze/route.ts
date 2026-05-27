import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

function findClaudeBin(): string {
  if (process.env.CLAUDE_BIN_PATH) return process.env.CLAUDE_BIN_PATH;
  const extDir = join(process.env.HOME ?? '/Users/' + process.env.USER, '.vscode', 'extensions');
  if (existsSync(extDir)) {
    try {
      const dir = execSync(`ls "${extDir}" | grep "anthropic.claude-code" | sort -V | tail -1`, { encoding: 'utf8' }).trim();
      if (dir) {
        const bin = join(extDir, dir, 'resources', 'native-binary', 'claude');
        if (existsSync(bin)) return bin;
      }
    } catch { /* fall through */ }
  }
  return 'claude';
}

const CLAUDE_BIN = findClaudeBin();

// ─── Prompt ───────────────────────────────────────────────────────────────────
// Concrete filled-in example so Claude copies the exact format, not schema hints.
const ANALYSIS_PROMPT =
  'You are a precision measurement AI for an electronics documentation tool.\n' +
  'Analyze this photo and return ONLY a JSON object. No markdown, no explanation outside the JSON.\n' +
  '\n' +
  'USE THESE REFERENCE DIMENSIONS FOR SCALE:\n' +
  '  Cutting mat grid: 10mm per square (standard), 5mm (fine), 25mm (large)\n' +
  '  Perfboard / stripboard hole pitch: 2.54mm exactly\n' +
  '  Breadboard tie-strip spacing: 2.54mm\n' +
  '  Arduino Uno: 53.4x68.6mm  Arduino Nano: 18x45mm  Arduino Mega: 53.4x101.6mm\n' +
  '  RPi 4: 85x56mm  DIP-8 IC: 9.8x6.8mm  DIP-14: 19.2x6.8mm  DIP-16: 22x7mm\n' +
  '  Through-hole resistor body: 2.5x6.5mm  5mm LED: 5mm dia  16x2 LCD: 80x36mm\n' +
  '  HC-SR04 ultrasonic: 45x20mm  Relay module: 50x26mm  18650 cell: 18.5x65mm\n' +
  '\n' +
  'PERSPECTIVE: if camera is angled, estimate tilt angle theta and apply cos(theta)\n' +
  'correction so all mm values are true real-world size, not foreshortened.\n' +
  '\n' +
  'Return this JSON (replace ALL placeholder values with your actual measurements):\n' +
  '{\n' +
  '  "surface": {\n' +
  '    "type": "cutting_mat_10mm",\n' +
  '    "description": "Dark green cutting mat with faint 10mm grid",\n' +
  '    "gridSizeMM": 10,\n' +
  '    "pitchMM": null,\n' +
  '    "confidence": 0.85\n' +
  '  },\n' +
  '  "perspective": {\n' +
  '    "isOverhead": false,\n' +
  '    "tiltDegrees": 25,\n' +
  '    "xScaleNote": "mild horizontal foreshortening",\n' +
  '    "yScaleNote": "vertical axis compressed by cos(25deg)"\n' +
  '  },\n' +
  '  "scale": {\n' +
  '    "pixelsPerMM": 3.7,\n' +
  '    "pixelsPerMM_x": 3.8,\n' +
  '    "pixelsPerMM_y": 3.4,\n' +
  '    "method": "16x2 LCD (known 80mm wide) spans 295px → 3.69px/mm, corrected for tilt",\n' +
  '    "boardWidthMM": 280,\n' +
  '    "boardHeightMM": 200,\n' +
  '    "confidence": 0.8\n' +
  '  },\n' +
  '  "components": [\n' +
  '    {\n' +
  '      "id": "C1",\n' +
  '      "label": "Arduino Nano",\n' +
  '      "type": "arduino",\n' +
  '      "bbox": [0.32, 0.65, 0.18, 0.22],\n' +
  '      "widthMM": 45.0,\n' +
  '      "heightMM": 18.0,\n' +
  '      "confidence": 0.9,\n' +
  '      "reasoning": "Known 45x18mm Nano, pixel span confirms scale"\n' +
  '    }\n' +
  '  ],\n' +
  '  "insight": "Green cutting mat with 10mm grid. Scale derived from LCD module width. Camera tilted ~25deg so vertical measurements corrected by 1/cos(25deg). Found Arduino Nano, breadboard, and LCD."\n' +
  '}\n' +
  '\n' +
  'STRICT RULES:\n' +
  '- type field must be ONE of: cutting_mat_10mm, cutting_mat_5mm, cutting_mat_25mm, perfboard, breadboard, pcb, ruler, desk, unknown\n' +
  '- component type must be ONE of: arduino, ic, resistor, capacitor, led, transistor, lcd, relay, sensor_module, connector, wire, battery, perfboard_section, other\n' +
  '- bbox must be exactly 4 numbers [x, y, w, h] each between 0 and 1, separated by commas\n' +
  '- All numbers must be valid JSON (no fractions like 1/3, no missing commas)\n' +
  '- NO pipe characters, NO angle brackets, NO comments inside the JSON\n' +
  '- List EVERY distinct component you can see';

// ─── Aggressive JSON repair ───────────────────────────────────────────────────
function repairJSON(s: string): string {
  return s
    // Strip markdown fences
    .replace(/^```[a-z]*\n?/im, '').replace(/\n?```$/im, '')
    // Remove JS comments
    .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    // Replace <placeholder> with null
    .replace(/<[^>]+>/g, 'null')
    // Fix missing commas between adjacent numbers in arrays: [0.1 0.2] → [0.1, 0.2]
    .replace(/(\d)\s+(\d)/g, '$1, $2')
    // Fix missing commas between } and { (missing comma between array objects)
    .replace(/\}\s*\{/g, '}, {')
    // Fix missing commas between ] and [
    .replace(/\]\s*\[/g, '], [')
    // Remove trailing commas before ] or }
    .replace(/,\s*([\]}])/g, '$1')
    // Fix pipe-separated values in strings: "val1" | "val2" → "val1"
    .replace(/"([^"]+)"\s*\|\s*"([^"]+)"/g, '"$1"')
    // Fix unquoted pipe alternations after colon: : val1 | val2, → : "val1",
    .replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\|\s*[a-zA-Z_][a-zA-Z0-9_]*)+\s*([,\n}])/g, ': "$1"$2')
    // Ensure numbers don't have trailing dots
    .replace(/(\d)\.\s*([,\]}])/g, '$10$2');
}

// ─── Run claude binary (OAuth — no API key needed) ────────────────────────────
function askClaude(imageBase64: string, mediaType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const message = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: ANALYSIS_PROMPT },
        ],
      },
    }) + '\n';

    const proc = spawn(CLAUDE_BIN, [
      '--print', '--verbose',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--model', 'claude-opus-4-7',
    ]);

    let resultText = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const d = JSON.parse(t);
          if (d.type === 'result' && typeof d.result === 'string') {
            resultText = d.result;
          } else if (d.type === 'assistant') {
            for (const block of (d.message?.content ?? [])) {
              if (block.type === 'text') resultText = block.text;
            }
          }
        } catch { /* skip non-JSON stream lines */ }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) reject(new Error('Claude exited ' + code + ': ' + stderr.slice(0, 400)));
      else if (!resultText) reject(new Error('No result from Claude. stderr: ' + stderr.slice(0, 200)));
      else resolve(resultText);
    });

    proc.on('error', reject);
    proc.stdin.write(message);
    proc.stdin.end();
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return Response.json({ error: 'Missing imageDataUrl' }, { status: 400 });
    }

    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,([\s\S]+)$/);
    if (!match) return Response.json({ error: 'Invalid image data URL' }, { status: 400 });

    const raw = await askClaude(match[2].replace(/\s/g, ''), match[1]);

    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('No JSON in response:', raw.slice(0, 500));
      return Response.json({ error: 'AI returned no JSON', raw: raw.slice(0, 600) }, { status: 500 });
    }

    const jsonStr = raw.slice(jsonStart, jsonEnd + 1);

    // Try strict parse first, then repaired
    for (const candidate of [jsonStr, repairJSON(jsonStr)]) {
      try {
        const result = JSON.parse(candidate);
        return Response.json(result);
      } catch { /* try next */ }
    }

    console.error('All parse attempts failed. Raw JSON:\n', jsonStr.slice(0, 1000));
    return Response.json({ error: 'Could not parse AI response — please retry' }, { status: 500 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('analyze error:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
