'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { processImage } from '@/lib/cv-pipeline';
import { Unit } from '@/lib/types';

export function ScaleStep() {
  const { rawImageSrc, gridSize, unit, setScale, setProcessing, setResult, setStep, reset } = useStore();
  const [localSize, setLocalSize] = useState(gridSize);
  const [localUnit, setLocalUnit] = useState<Unit>(unit);
  const [noGrid, setNoGrid] = useState(false);
  const [boardW, setBoardW] = useState<number>(60);
  const [boardH, setBoardH] = useState<number>(40);

  const handleAnalyze = async () => {
    if (!rawImageSrc) return;
    if (noGrid && (boardW <= 0 || boardH <= 0)) return;
    if (!noGrid && localSize <= 0) return;

    setScale(localSize, localUnit);
    setStep('processing');
    setProcessing(true, 'Starting analysis...');

    try {
      const result = await processImage(
        rawImageSrc, localSize, localUnit,
        (msg) => useStore.getState().setProcessing(true, msg),
        noGrid ? { boardW, boardH } : undefined,
      );
      setResult(result);
    } catch (err) {
      console.error(err);
      setProcessing(false);
      setStep('scale');
      alert('Processing failed. Please try a clearer photo.');
    }
  };

  const unitOptions: Unit[] = ['mm', 'cm', 'in'];

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <button onClick={reset} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
          ← Back
        </button>
        <span className="text-white font-semibold">Set Scale</span>
        <div className="w-16" />
      </header>

      {/* Image preview */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {rawImageSrc && (
          <img
            src={rawImageSrc}
            alt="Preview"
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full border border-white/10">
          {noGrid ? 'Enter the real-world board dimensions' : 'Grid mat should be visible in the photo'}
        </div>
      </div>

      {/* Scale input panel */}
      <div className="bg-gray-900 border-t border-gray-800 p-5 safe-area-bottom">
        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden border border-gray-700 mb-5">
          <button
            onClick={() => setNoGrid(false)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              !noGrid ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Grid mat
          </button>
          <button
            onClick={() => setNoGrid(true)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              noGrid ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            No grid / Perfboard
          </button>
        </div>

        {noGrid ? (
          /* Manual board dimensions */
          <>
            <p className="text-white font-semibold mb-1">What are the board dimensions?</p>
            <p className="text-gray-400 text-xs mb-4">
              Enter the actual size of the PCB or perfboard you photographed.
            </p>

            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Width</label>
                <input
                  type="number" value={boardW} min={1} step={0.5}
                  onChange={(e) => setBoardW(parseFloat(e.target.value) || 1)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Height</label>
                <input
                  type="number" value={boardH} min={1} step={0.5}
                  onChange={(e) => setBoardH(parseFloat(e.target.value) || 1)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              <div className="flex items-end pb-0">
                <div className="flex rounded-xl overflow-hidden border border-gray-700">
                  {unitOptions.map((u) => (
                    <button
                      key={u}
                      onClick={() => setLocalUnit(u)}
                      className={`px-3 py-3 font-mono font-semibold transition-colors ${
                        localUnit === u
                          ? 'bg-cyan-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Common perfboard sizes */}
            <p className="text-gray-500 text-xs mb-2">Common perfboard sizes:</p>
            <div className="flex gap-2 mb-5 flex-wrap">
              {[
                { label: '50×30mm', w: 50, h: 30, u: 'mm' as Unit },
                { label: '70×50mm', w: 70, h: 50, u: 'mm' as Unit },
                { label: '100×80mm', w: 100, h: 80, u: 'mm' as Unit },
                { label: '2"×3"', w: 2, h: 3, u: 'in' as Unit },
              ].map(({ label, w, h, u }) => (
                <button
                  key={label}
                  onClick={() => { setBoardW(w); setBoardH(h); setLocalUnit(u); }}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:border-cyan-500 hover:text-white transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          /* Grid mat mode */
          <>
            <p className="text-white font-semibold mb-1">How large is each grid square?</p>
            <p className="text-gray-400 text-xs mb-4">
              Measure one square on your mat — this sets the scale for all measurements.
            </p>

            <div className="flex gap-2 mb-4">
              <input
                type="number" value={localSize} min={0.1} step={0.1}
                onChange={(e) => setLocalSize(parseFloat(e.target.value) || 1)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg font-mono focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <div className="flex rounded-xl overflow-hidden border border-gray-700">
                {unitOptions.map((u) => (
                  <button
                    key={u}
                    onClick={() => setLocalUnit(u)}
                    className={`px-4 py-3 font-mono font-semibold transition-colors ${
                      localUnit === u
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mb-5 flex-wrap">
              {[
                { label: '1cm', size: 1, unit: 'cm' as Unit },
                { label: '5mm', size: 5, unit: 'mm' as Unit },
                { label: '10mm', size: 10, unit: 'mm' as Unit },
                { label: '¼"', size: 0.25, unit: 'in' as Unit },
                { label: '1"', size: 1, unit: 'in' as Unit },
              ].map(({ label, size, unit: u }) => (
                <button
                  key={label}
                  onClick={() => { setLocalSize(size); setLocalUnit(u); }}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:border-cyan-500 hover:text-white transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          onClick={handleAnalyze}
          disabled={noGrid ? boardW <= 0 || boardH <= 0 : localSize <= 0}
          className="w-full py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-base transition-colors"
        >
          Analyze →
        </button>
      </div>
    </div>
  );
}
