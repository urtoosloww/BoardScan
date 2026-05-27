'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { processImage } from '@/lib/cv-pipeline';
import { AIAnalysis, AIComponent } from '@/lib/types';

const PROGRESS_STEPS = [
  'Sending image to AI...',
  'Identifying surface type...',
  'Estimating real-world scale...',
  'Correcting for camera perspective...',
  'Locating components...',
];

type State =
  | { phase: 'analyzing'; step: number }
  | { phase: 'running_cv'; label: string }
  | { phase: 'error'; message: string; retries: number };

export function AIAnalysisStep() {
  const { rawImageSrc, setScale, setStep, setProcessing, setResult, setAIAnalysis, reset } = useStore();
  const [state, setState] = useState<State>({ phase: 'analyzing', step: 0 });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !rawImageSrc) return;
    ran.current = true;
    run();
  }, []);

  async function run(retryCount = 0) {
    if (!rawImageSrc) return;
    setState({ phase: 'analyzing', step: 0 });

    // Animate through steps while waiting
    let stepIdx = 0;
    const ticker = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, PROGRESS_STEPS.length - 1);
      setState({ phase: 'analyzing', step: stepIdx });
    }, 2000);

    let analysis: AIAnalysis;
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: rawImageSrc }),
      });
      clearInterval(ticker);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? 'Analysis failed');
      }
      analysis = await res.json();
    } catch (err) {
      clearInterval(ticker);
      setState({ phase: 'error', message: String(err), retries: retryCount });
      return;
    }

    setAIAnalysis(analysis);

    // Derive calibration from AI
    const gridMM = analysis.surface?.gridSizeMM ?? analysis.surface?.pitchMM ?? 10;
    const unit = 'mm';
    setScale(gridMM, unit);

    // Build manual dims from AI scale estimate if no grid was detected
    const manualDims = analysis.scale?.boardWidthMM && analysis.scale?.boardHeightMM
      ? { boardW: analysis.scale.boardWidthMM, boardH: analysis.scale.boardHeightMM }
      : undefined;

    // Immediately start CV pipeline — no user confirmation needed
    setStep('processing');
    setProcessing(true, 'Starting analysis...');

    try {
      const result = await processImage(
        rawImageSrc, gridMM, unit,
        (msg) => {
          useStore.getState().setProcessing(true, msg);
          setState({ phase: 'running_cv', label: msg });
        },
        manualDims,
      );

      // Label CV boxes with AI component names
      if (analysis.components?.length) {
        result.boxes = labelBoxes(result.boxes, analysis.components, result.imageW, result.imageH);
      }

      setResult(result);
    } catch (err) {
      setProcessing(false);
      setStep('ai-analysis');
      setState({ phase: 'error', message: 'CV pipeline failed: ' + String(err), retries: retryCount });
    }
  }

  const label = state.phase === 'analyzing'
    ? PROGRESS_STEPS[state.step]
    : state.phase === 'running_cv'
    ? state.label
    : '';

  const progress = state.phase === 'analyzing'
    ? Math.round(((state.step + 1) / PROGRESS_STEPS.length) * 70)
    : state.phase === 'running_cv'
    ? 90
    : 0;

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <button onClick={reset} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <span className="font-semibold">AI Analysis</span>
        <div className="w-16" />
      </header>

      {/* Image preview */}
      <div className="relative bg-black overflow-hidden" style={{ height: '42vh' }}>
        {rawImageSrc && (
          <img src={rawImageSrc} alt="" className="absolute inset-0 w-full h-full object-contain" />
        )}

        {/* Scan line animation */}
        {(state.phase === 'analyzing' || state.phase === 'running_cv') && (
          <>
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="absolute left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_12px_3px_rgba(34,211,238,0.7)] transition-all duration-1000"
              style={{ top: `${progress}%` }}
            />
          </>
        )}

        {/* Error overlay */}
        {state.phase === 'error' && (
          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-red-400 text-sm text-center">{state.message}</p>
            {state.retries < 3 && (
              <button
                onClick={() => { ran.current = false; run(state.retries + 1); }}
                className="px-5 py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-sm font-semibold transition-colors"
              >
                Retry ({state.retries + 1}/3)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status panel */}
      <div className="flex-1 bg-gray-900 border-t border-gray-800 p-5 flex flex-col gap-4">
        {state.phase !== 'error' && (
          <>
            {/* AI insight bubble */}
            <div className="flex items-start gap-3 bg-gray-800 rounded-xl p-4 border border-cyan-900/40">
              <div className="w-7 h-7 rounded-full bg-cyan-600/30 border border-cyan-500/50 flex items-center justify-center shrink-0 text-cyan-400 text-sm">
                ✦
              </div>
              <p className="text-gray-300 text-sm leading-relaxed animate-pulse">
                {label || 'Initializing...'}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>

            {/* Step indicators */}
            <div className="space-y-2">
              {PROGRESS_STEPS.map((s, i) => {
                const currentStep = state.phase === 'analyzing' ? state.step : PROGRESS_STEPS.length;
                const done = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={s} className="flex items-center gap-2.5 text-xs">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      done ? 'bg-cyan-500' : active ? 'bg-cyan-500/20 border border-cyan-400' : 'bg-gray-800'
                    }`}>
                      {done && <span className="text-white text-[8px]">✓</span>}
                      {active && <span className="text-cyan-400 text-[8px] animate-pulse">●</span>}
                    </div>
                    <span className={done ? 'text-gray-500 line-through' : active ? 'text-white' : 'text-gray-600'}>
                      {s}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2.5 text-xs">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  state.phase === 'running_cv' ? 'bg-cyan-500/20 border border-cyan-400' : 'bg-gray-800'
                }`}>
                  {state.phase === 'running_cv' && <span className="text-cyan-400 text-[8px] animate-pulse">●</span>}
                </div>
                <span className={state.phase === 'running_cv' ? 'text-white' : 'text-gray-600'}>
                  Detecting component boundaries...
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Match CV boxes to AI component labels ─────────────────────────────────────
function labelBoxes(
  boxes: import('@/lib/types').BoundingBox[],
  aiComponents: AIComponent[],
  imageW: number,
  imageH: number,
): import('@/lib/types').BoundingBox[] {
  const used = new Set<string>();
  return boxes.map((box) => {
    const cx = (box.x + box.w / 2) / imageW;
    const cy = (box.y + box.h / 2) / imageH;
    let best: AIComponent | null = null;
    let bestDist = Infinity;
    for (const c of aiComponents) {
      if (used.has(c.id)) continue;
      const [nx, ny, nw, nh] = c.bbox;
      const d = Math.hypot(cx - (nx + nw / 2), cy - (ny + nh / 2));
      if (d < bestDist) { bestDist = d; best = c; }
    }
    if (best && bestDist < 0.3) {
      used.add(best.id);
      return { ...box, label: best.label };
    }
    return box;
  });
}
