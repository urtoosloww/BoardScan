'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { processImage } from '@/lib/cv-pipeline';
import { AIAnalysis, AIComponent, Unit } from '@/lib/types';

const SURFACE_ICONS: Record<string, string> = {
  cutting_mat: '🟩',
  perfboard: '⬜',
  breadboard: '🟦',
  pcb: '🟫',
  ruler: '📏',
  desk: '🪵',
  unknown: '❓',
};

const SURFACE_LABELS: Record<string, string> = {
  cutting_mat: 'Cutting Mat',
  perfboard: 'Perfboard',
  breadboard: 'Breadboard',
  pcb: 'PCB',
  ruler: 'Ruler',
  desk: 'Desk',
  unknown: 'Unknown',
};

type AnalysisState =
  | { status: 'running'; progress: number }
  | { status: 'done'; analysis: AIAnalysis }
  | { status: 'error'; message: string };

const PROGRESS_STEPS = [
  'Sending image to AI...',
  'Identifying surface & reference scale...',
  'Detecting components...',
  'Estimating real-world dimensions...',
  'Building measurement map...',
];

export function AIAnalysisStep() {
  const {
    rawImageSrc, rawImageW, rawImageH,
    setScale, setStep, setProcessing, setResult, setAIAnalysis, reset,
  } = useStore();

  const [state, setState] = useState<AnalysisState>({ status: 'running', progress: 0 });
  const [progressLabel, setProgressLabel] = useState(PROGRESS_STEPS[0]);
  const [showManual, setShowManual] = useState(false);
  const [manualGridSize, setManualGridSize] = useState(10);
  const [manualUnit, setManualUnit] = useState<Unit>('mm');
  const [manualBoardW, setManualBoardW] = useState(60);
  const [manualBoardH, setManualBoardH] = useState(40);
  const [noGrid, setNoGrid] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !rawImageSrc) return;
    ran.current = true;
    runAnalysis();
  }, []);

  async function runAnalysis() {
    setState({ status: 'running', progress: 0 });

    // Animate progress labels while waiting
    let stepIdx = 0;
    const ticker = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, PROGRESS_STEPS.length - 1);
      setProgressLabel(PROGRESS_STEPS[stepIdx]);
      setState({ status: 'running', progress: Math.round((stepIdx / PROGRESS_STEPS.length) * 85) });
    }, 1800);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: rawImageSrc }),
      });

      clearInterval(ticker);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setState({ status: 'error', message: err.error ?? 'AI analysis failed' });
        return;
      }

      const analysis: AIAnalysis = await res.json();
      setState({ status: 'done', progress: 100, analysis } as AnalysisState);
      setAIAnalysis(analysis);

      // Auto-fill manual fields from AI
      if (analysis.scale?.pixelsPerMM) {
        const pxMM = analysis.scale.pixelsPerMM;
        setManualGridSize(analysis.surface?.gridSizeMM ?? 10);
        setManualUnit('mm');
      }
    } catch (err) {
      clearInterval(ticker);
      setState({ status: 'error', message: String(err) });
    }
  }

  async function runPipeline(opts?: { boardW?: number; boardH?: number }) {
    if (!rawImageSrc) return;
    const analysis = state.status === 'done' ? state.analysis : null;
    const gridMM = analysis?.surface?.gridSizeMM ?? manualGridSize;
    const unit: Unit = 'mm';

    setScale(gridMM, unit);
    setStep('processing');
    setProcessing(true, 'Starting analysis...');

    try {
      // Build manual dims from AI or user override
      const manualDims = opts?.boardW
        ? { boardW: opts.boardW, boardH: opts.boardH! }
        : analysis?.scale?.boardWidthMM && analysis?.scale?.boardHeightMM
        ? { boardW: analysis.scale.boardWidthMM, boardH: analysis.scale.boardHeightMM }
        : undefined;

      const result = await processImage(
        rawImageSrc, gridMM, unit,
        (msg) => useStore.getState().setProcessing(true, msg),
        manualDims,
      );

      // Overlay AI component labels onto detected boxes
      if (analysis?.components?.length) {
        result.boxes = labelBoxesFromAI(result.boxes, analysis.components, result.imageW, result.imageH);
      }

      setResult(result);
    } catch (err) {
      console.error(err);
      setProcessing(false);
      setStep('ai-analysis');
    }
  }

  async function runManual() {
    if (!rawImageSrc) return;
    const unit: Unit = manualUnit;
    const gridSize = noGrid ? 10 : manualGridSize;
    setScale(gridSize, unit);
    setStep('processing');
    setProcessing(true, 'Starting analysis...');
    try {
      const manualDims = noGrid
        ? { boardW: manualBoardW, boardH: manualBoardH }
        : undefined;
      const result = await processImage(
        rawImageSrc, gridSize, unit,
        (msg) => useStore.getState().setProcessing(true, msg),
        manualDims,
      );
      setResult(result);
    } catch (err) {
      console.error(err);
      setProcessing(false);
      setStep('ai-analysis');
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <button onClick={reset} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <span className="font-semibold text-white">AI Analysis</span>
        <div className="w-16" />
      </header>

      {/* Image preview */}
      <div className="relative bg-black overflow-hidden" style={{ height: '38vh' }}>
        {rawImageSrc && (
          <img src={rawImageSrc} alt="" className="absolute inset-0 w-full h-full object-contain" />
        )}

        {/* Component bbox overlays when done */}
        {state.status === 'done' && (
          <ComponentOverlay
            components={state.analysis.components}
            imageW={rawImageW}
            imageH={rawImageH}
          />
        )}

        {/* Running overlay */}
        {state.status === 'running' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-gray-600 border-t-cyan-400 animate-spin" />
            <p className="text-cyan-300 text-sm font-semibold animate-pulse">{progressLabel}</p>
            <div className="w-48 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-700"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error overlay */}
        {state.status === 'error' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-red-400 text-sm text-center">AI analysis failed: {state.message}</p>
            <button
              onClick={() => { ran.current = false; runAnalysis(); }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Results / manual panel */}
      <div className="flex-1 overflow-y-auto bg-gray-900 border-t border-gray-800">
        {state.status === 'done' && !showManual && (
          <AIResultPanel
            analysis={state.analysis}
            onAccept={runPipeline}
            onManual={() => setShowManual(true)}
          />
        )}

        {(state.status === 'error' || showManual) && (
          <ManualFallback
            gridSize={manualGridSize}
            unit={manualUnit}
            noGrid={noGrid}
            boardW={manualBoardW}
            boardH={manualBoardH}
            onGridSize={setManualGridSize}
            onUnit={setManualUnit}
            onNoGrid={setNoGrid}
            onBoardW={setManualBoardW}
            onBoardH={setManualBoardH}
            onAnalyze={runManual}
            onBack={state.status === 'done' ? () => setShowManual(false) : undefined}
          />
        )}

        {state.status === 'running' && (
          <div className="p-6 text-center text-gray-500 text-sm">
            Hang tight — Claude is examining your photo in detail...
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI Result Panel ───────────────────────────────────────────────────────────

function AIResultPanel({
  analysis, onAccept, onManual,
}: {
  analysis: AIAnalysis;
  onAccept: () => void;
  onManual: () => void;
}) {
  const s = analysis.surface;
  const sc = analysis.scale;
  const icon = SURFACE_ICONS[s.type] ?? '❓';
  const label = SURFACE_LABELS[s.type] ?? s.type;
  const confPct = Math.round(s.confidence * 100);

  return (
    <div className="p-4 space-y-4">
      {/* AI Insight bubble */}
      <div className="bg-gray-800 border border-cyan-900/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center shrink-0 text-cyan-400 text-base">✦</div>
          <p className="text-gray-200 text-sm leading-relaxed">{analysis.insight}</p>
        </div>
      </div>

      {/* Surface + scale card */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 rounded-xl p-3">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Surface</p>
          <p className="text-white font-semibold text-sm">{icon} {label}</p>
          <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{s.description}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${confPct}%` }} />
            </div>
            <span className="text-[10px] text-gray-400">{confPct}%</span>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-3">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Scale</p>
          {sc.pixelsPerMM ? (
            <>
              <p className="text-cyan-400 font-mono font-bold text-sm">{sc.pixelsPerMM.toFixed(1)} px/mm</p>
              {sc.boardWidthMM && sc.boardHeightMM && (
                <p className="text-gray-300 text-xs mt-0.5">
                  ~{Math.round(sc.boardWidthMM)} × {Math.round(sc.boardHeightMM)} mm
                </p>
              )}
              <p className="text-gray-500 text-[10px] mt-1 line-clamp-2">{sc.method}</p>
            </>
          ) : (
            <p className="text-yellow-400 text-xs">Could not determine scale — use manual mode</p>
          )}
        </div>
      </div>

      {/* Component list */}
      {analysis.components.length > 0 && (
        <div>
          <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-2">
            {analysis.components.length} component{analysis.components.length !== 1 ? 's' : ''} identified
          </p>
          <div className="space-y-1.5">
            {analysis.components.map((c) => (
              <div key={c.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-[10px] font-mono font-bold text-gray-400 w-6 shrink-0">{c.id}</span>
                <span className="text-white text-xs font-semibold flex-1">{c.label}</span>
                {c.widthMM && c.heightMM && (
                  <span className="text-gray-400 text-[10px] font-mono">
                    {c.widthMM.toFixed(1)} × {c.heightMM.toFixed(1)} mm
                  </span>
                )}
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 h-3 rounded-sm ${i < Math.round(c.confidence * 5) ? 'bg-cyan-500' : 'bg-gray-700'}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onManual}
          className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-sm transition-colors"
        >
          Enter manually
        </button>
        <button
          onClick={onAccept}
          disabled={!analysis.scale?.pixelsPerMM && !analysis.scale?.boardWidthMM}
          className="flex-1 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm transition-colors"
        >
          Accept & Analyze →
        </button>
      </div>
    </div>
  );
}

// ─── Component overlay on image ───────────────────────────────────────────────

function ComponentOverlay({
  components, imageW, imageH,
}: {
  components: AIComponent[];
  imageW: number;
  imageH: number;
}) {
  if (!components?.length) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {components.map((c, idx) => {
        const [nx, ny, nw, nh] = c.bbox;
        // Convert normalized to percentage of container
        const left = `${nx * 100}%`;
        const top = `${ny * 100}%`;
        const width = `${nw * 100}%`;
        const height = `${nh * 100}%`;

        const hue = (idx * 47) % 360;
        return (
          <div
            key={c.id}
            className="absolute border-2 rounded"
            style={{
              left, top, width, height,
              borderColor: `hsl(${hue},80%,60%)`,
              backgroundColor: `hsla(${hue},80%,60%,0.12)`,
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 text-[9px] font-bold font-mono px-1 rounded"
              style={{ backgroundColor: `hsl(${hue},80%,30%)`, color: '#fff' }}
            >
              {c.id}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Manual fallback ──────────────────────────────────────────────────────────

function ManualFallback({
  gridSize, unit, noGrid, boardW, boardH,
  onGridSize, onUnit, onNoGrid, onBoardW, onBoardH,
  onAnalyze, onBack,
}: {
  gridSize: number; unit: Unit; noGrid: boolean; boardW: number; boardH: number;
  onGridSize: (n: number) => void; onUnit: (u: Unit) => void; onNoGrid: (b: boolean) => void;
  onBoardW: (n: number) => void; onBoardH: (n: number) => void;
  onAnalyze: () => void; onBack?: () => void;
}) {
  const unitOptions: Unit[] = ['mm', 'cm', 'in'];

  return (
    <div className="p-5 space-y-4">
      {onBack && (
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← Back to AI results</button>
      )}

      <div className="flex rounded-xl overflow-hidden border border-gray-700">
        <button
          onClick={() => onNoGrid(false)}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${!noGrid ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400'}`}
        >Grid mat</button>
        <button
          onClick={() => onNoGrid(true)}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${noGrid ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400'}`}
        >No grid / Perfboard</button>
      </div>

      {noGrid ? (
        <>
          <p className="text-gray-400 text-xs">Enter the actual board dimensions.</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-gray-500 text-xs block mb-1">Width</label>
              <input type="number" value={boardW} min={1} step={0.5}
                onChange={(e) => onBoardW(parseFloat(e.target.value) || 1)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-cyan-500" />
            </div>
            <div className="flex-1">
              <label className="text-gray-500 text-xs block mb-1">Height</label>
              <input type="number" value={boardH} min={1} step={0.5}
                onChange={(e) => onBoardH(parseFloat(e.target.value) || 1)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-cyan-500" />
            </div>
            <div className="flex items-end">
              <div className="flex rounded-xl overflow-hidden border border-gray-700">
                {unitOptions.map((u) => (
                  <button key={u} onClick={() => onUnit(u)}
                    className={`px-3 py-2.5 font-mono font-semibold text-sm transition-colors ${unit === u ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-gray-400 text-xs">Enter the size of each grid square on your cutting mat.</p>
          <div className="flex gap-2">
            <input type="number" value={gridSize} min={0.1} step={0.1}
              onChange={(e) => onGridSize(parseFloat(e.target.value) || 1)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-cyan-500" />
            <div className="flex rounded-xl overflow-hidden border border-gray-700">
              {unitOptions.map((u) => (
                <button key={u} onClick={() => onUnit(u)}
                  className={`px-3 py-2.5 font-mono font-semibold text-sm transition-colors ${unit === u ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: '5mm', size: 5, unit: 'mm' as Unit },
              { label: '1cm', size: 1, unit: 'cm' as Unit },
              { label: '10mm', size: 10, unit: 'mm' as Unit },
              { label: '¼"', size: 0.25, unit: 'in' as Unit },
            ].map(({ label, size, unit: u }) => (
              <button key={label}
                onClick={() => { onGridSize(size); onUnit(u); }}
                className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:border-cyan-500 hover:text-white transition-colors">
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <button
        onClick={onAnalyze}
        className="w-full py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors"
      >
        Analyze →
      </button>
    </div>
  );
}

// ─── Label CV boxes from AI component list ────────────────────────────────────
function labelBoxesFromAI(
  boxes: import('@/lib/types').BoundingBox[],
  aiComponents: AIComponent[],
  imageW: number,
  imageH: number,
): import('@/lib/types').BoundingBox[] {
  return boxes.map((box) => {
    const cx = (box.x + box.w / 2) / imageW;
    const cy = (box.y + box.h / 2) / imageH;

    let best: AIComponent | null = null;
    let bestDist = Infinity;

    for (const c of aiComponents) {
      const [nx, ny, nw, nh] = c.bbox;
      const acx = nx + nw / 2;
      const acy = ny + nh / 2;
      const d = Math.hypot(cx - acx, cy - acy);
      if (d < bestDist) { bestDist = d; best = c; }
    }

    if (best && bestDist < 0.25) {
      return { ...box, label: best.label };
    }
    return box;
  });
}
