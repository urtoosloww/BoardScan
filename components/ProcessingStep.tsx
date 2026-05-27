'use client';
import { useStore } from '@/lib/store';

const STAGES = [
  'Loading image...',
  'Enhancing contrast...',
  'Detecting grid lines...',
  'Correcting perspective...',
  'Detecting components...',
  'Applying AI labels...',
];

export function ProcessingStep() {
  const { processingStatus, rawImageSrc } = useStore();
  const stageIdx = STAGES.findIndex((s) => processingStatus.startsWith(s.split('...')[0]));
  const progress = stageIdx < 0 ? 0 : Math.round(((stageIdx + 1) / STAGES.length) * 100);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 px-4">
      {/* Thumbnail */}
      {rawImageSrc && (
        <div className="relative w-64 h-40 mb-8 rounded-xl overflow-hidden">
          <img src={rawImageSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
          {/* Scan line */}
          <div
            className="absolute left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_8px_2px_rgba(34,211,238,0.6)] transition-all duration-700"
            style={{ top: `${progress}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent"
            style={{ backgroundPosition: `0 ${progress}%`, backgroundSize: '100% 40%' }} />
        </div>
      )}

      {/* Spinner */}
      <div className="w-12 h-12 rounded-full border-2 border-gray-700 border-t-cyan-400 animate-spin mb-6" />

      {/* Status */}
      <p className="text-white font-semibold mb-2">{processingStatus || 'Processing...'}</p>

      {/* Progress bar */}
      <div className="w-64 h-1.5 bg-gray-800 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-cyan-500 rounded-full transition-all duration-500"
          style={{ width: `${progress || 15}%` }}
        />
      </div>

      {/* Stage list */}
      <div className="space-y-1.5 w-64">
        {STAGES.map((stage, i) => {
          const done = i < stageIdx;
          const active = i === stageIdx;
          return (
            <div key={stage} className="flex items-center gap-2 text-xs">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                done ? 'bg-cyan-500' : active ? 'bg-cyan-500/30 border border-cyan-400' : 'bg-gray-800'
              }`}>
                {done && <span className="text-white text-[9px]">✓</span>}
                {active && <span className="text-cyan-400 text-[9px] animate-pulse">●</span>}
              </div>
              <span className={done ? 'text-gray-400 line-through' : active ? 'text-white' : 'text-gray-600'}>
                {stage}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
