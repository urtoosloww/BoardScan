import { NextRequest } from 'next/server';
import { spawn } from 'child_process';

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

function findClaudeBin(): string {
  // Explicit override
  if (process.env.CLAUDE_BIN_PATH) return process.env.CLAUDE_BIN_PATH;

  // Auto-detect: newest anthropic.claude-code extension
  const extDir = join(process.env.HOME ?? '/Users/' + process.env.USER, '.vscode', 'extensions');
  if (existsSync(extDir)) {
    try {
      const dirs = execSync(`ls "${extDir}" 2>/dev/null | grep "anthropic.claude-code" | sort -V | tail -1`, { encoding: 'utf8' }).trim();
      if (dirs) {
        const bin = join(extDir, dirs, 'resources', 'native-binary', 'claude');
        if (existsSync(bin)) return bin;
      }
    } catch { /* fall through */ }
  }

  // Fallback: claude on PATH
  return 'claude';
}

const CLAUDE_BIN = findClaudeBin();

// Single combined prompt — --system-prompt flag conflicts with stream-json mode
// so everything lives in the user message.
const ANALYSIS_PROMPT =
  'You are a precision measurement AI for an electronics documentation tool.\n' +
  'Analyze this electronics workspace photo and extract accurate real-world measurements.\n' +
  '\n' +
  'STEP 1 - SCALE CALIBRATION\n' +
  'Find the best reference in the image with a known real-world dimension.\n' +
  'Priority (use whichever is most reliable):\n' +
  '  1. Ruler / tape measure\n' +
  '  2. Cutting mat grid squares: 10mm standard, 5mm fine, 25mm large\n' +
  '  3. Perfboard / stripboard hole pitch: exactly 2.54mm\n' +
  '  4. Breadboard tie-strip spacing: 2.54mm\n' +
  '  5. Known hardware dimensions (cross-check only):\n' +
  '     Arduino Uno 53.4x68.6mm, Nano 18x45mm, Mega 53.4x101.6mm\n' +
  '     RPi 4 85x56mm, DIP-8 9.8x6.8mm, DIP-14 19.2x6.8mm, DIP-16 22x7mm\n' +
  '     DIP-28 35.6x14mm, resistor body 2.5x6.5mm, 5mm LED 5mm dia\n' +
  '     16x2 LCD 80x36mm, HC-SR04 45x20mm, relay module 50x26mm\n' +
  '\n' +
  'STEP 2 - PERSPECTIVE CORRECTION\n' +
  'If the camera is angled (not directly overhead):\n' +
  '- Identify foreshortening (objects compressed on one axis)\n' +
  '- Estimate tilt angle theta from grid lines if visible\n' +
  '- Apply: true_mm = pixel_span / pixelsPerMM_raw / cos(theta)\n' +
  '- Report separate x/y scale if they differ\n' +
  '\n' +
  'STEP 3 - COMPONENT BOUNDING BOXES\n' +
  'For every distinct component:\n' +
  '- Tight bbox as normalized 0-1 fractions [x, y, w, h] top-left origin\n' +
  '- Real-world width + height in mm, perspective-corrected\n' +
  '- Precise labels: "Arduino Nano" not "board", "100uF electrolytic" not "cylinder"\n' +
  '\n' +
  'Return ONLY valid JSON, no markdown, no text outside the JSON object:\n' +
  '{\n' +
  '  "surface": {\n' +
  '    "type": "one string: cutting_mat_10mm, cutting_mat_5mm, cutting_mat_25mm, perfboard, breadboard, pcb, ruler, desk, or unknown",\n' +
  '    "description": "One sentence describing the background/reference surface",\n' +
  '    "gridSizeMM": null,\n' +
  '    "pitchMM": null,\n' +
  '    "confidence": 0.0\n' +
  '  },\n' +
  '  "perspective": {\n' +
  '    "isOverhead": true,\n' +
  '    "tiltDegrees": 0,\n' +
  '    "xScaleNote": "description of horizontal distortion or none",\n' +
  '    "yScaleNote": "description of vertical distortion or none"\n' +
  '  },\n' +
  '  "scale": {\n' +
  '    "pixelsPerMM": 0.0,\n' +
  '    "pixelsPerMM_x": 0.0,\n' +
  '    "pixelsPerMM_y": 0.0,\n' +
  '    "method": "Exact explanation: what reference, how many pixels it spans, the math",\n' +
  '    "boardWidthMM": 0.0,\n' +
  '    "boardHeightMM": 0.0,\n' +
  '    "confidence": 0.0\n' +
  '  },\n' +
  '  "components": [\n' +
  '    {\n' +
  '      "id": "C1",\n' +
  '      "label": "Precise name e.g. Arduino Nano",\n' +
  '      "type": "one string: arduino, ic, resistor, capacitor, led, transistor, lcd, relay, sensor_module, connector, wire, battery, perfboard_section, or other",\n' +
  '      "bbox": [0.12, 0.34, 0.25, 0.18],\n' +
  '      "widthMM": 45.0,\n' +
  '      "heightMM": 18.0,\n' +
  '      "confidence": 0.85,\n' +
  '      "reasoning": "One line: how you measured this component"\n' +
  '    }\n' +
  '  ],\n' +
  '  "insight": "2-3 sentences: surface/reference found, how scale was derived, what components are visible and confidence level"\n' +
  '}';

// ─── Run claude binary (OAuth auth, no API key needed) ────────────────────────
function askClaude(imageBase64: string, mediaType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const message = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: ANALYSIS_PROMPT },
        ],
      },
    }) + '\n';

    const proc = spawn(CLAUDE_BIN, [
      '--print',
      '--verbose',
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
        } catch { /* skip non-JSON lines */ }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Claude exited ' + code + ': ' + stderr.slice(0, 400)));
        return;
      }
      if (!resultText) {
        reject(new Error('No result from Claude. stderr: ' + stderr.slice(0, 200)));
        return;
      }
      resolve(resultText);
    });

    proc.on('error', reject);
    proc.stdin.write(message);
    proc.stdin.end();
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return Response.json({ error: 'Missing imageDataUrl' }, { status: 400 });
    }

    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,([\s\S]+)$/);
    if (!match) {
      return Response.json({ error: 'Invalid image data URL' }, { status: 400 });
    }

    const mediaType = match[1];
    const base64Data = match[2].replace(/\s/g, '');

    const raw = await askClaude(base64Data, mediaType);

    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('No JSON in Claude response:', raw.slice(0, 500));
      return Response.json({ error: 'AI returned unexpected format', raw: raw.slice(0, 600) }, { status: 500 });
    }

    const jsonStr = raw.slice(jsonStart, jsonEnd + 1);

    // First try strict parse
    let result: unknown;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      // Repair common Claude JSON issues before re-trying:
      // 1. <placeholder text> → null
      // 2. Trailing commas before } or ]
      // 3. Unquoted pipe-separated enum values  like  "type": val1 | val2
      // 4. JS-style comments
      const repaired = jsonStr
        .replace(/<[^>]+>/g, 'null')                       // <number or null> → null
        .replace(/,\s*([\]}])/g, '$1')                    // trailing commas
        .replace(/\/\/[^\n]*/g, '')                        // // comments
        .replace(/\/\*[\s\S]*?\*\//g, '')                 // /* */ comments
        .replace(/":\s*([a-zA-Z_][a-zA-Z0-9_ ]*(?:\s*\|\s*[a-zA-Z_][a-zA-Z0-9_ ]*)+)([,\n}])/g,
          '": "other"$2');                                 // bare enum alternatives

      try {
        result = JSON.parse(repaired);
      } catch (e2) {
        console.error('JSON repair failed:', (e2 as Error).message, '\nRAW:\n', jsonStr.slice(0, 800));
        return Response.json({ error: 'Could not parse AI response: ' + (e2 as Error).message }, { status: 500 });
      }
    }

    return Response.json(result);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('analyze error:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
