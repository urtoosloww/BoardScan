'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { UploadStep } from '@/components/UploadStep';
import { AIAnalysisStep } from '@/components/AIAnalysisStep';
import { ProcessingStep } from '@/components/ProcessingStep';
import { AnnotationCanvas } from '@/components/AnnotationCanvas';
import { MeasurementPanel } from '@/components/MeasurementPanel';
import { DrawingView } from '@/components/DrawingView';

export default function Home() {
  const { step } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [viewMode, setViewMode] = useState<'photo' | 'drawing'>('photo');

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setCanvasSize({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight,
        });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (step === 'upload') return <UploadStep />;
  if (step === 'ai-analysis' || step === 'scale') return <AIAnalysisStep />;
  if (step === 'processing') return <ProcessingStep />;

  // Annotate step — two-column layout
  return (
    <div className="flex flex-col h-full w-full bg-gray-950 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-2 border-b border-gray-800 bg-gray-950 shrink-0">
        <button
          onClick={() => setViewMode('photo')}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
            viewMode === 'photo'
              ? 'bg-gray-800 text-white border-b-2 border-cyan-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Photo
        </button>
        <button
          onClick={() => setViewMode('drawing')}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
            viewMode === 'drawing'
              ? 'bg-gray-800 text-white border-b-2 border-cyan-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Drawing
        </button>
      </div>

      {viewMode === 'drawing' ? (
        <DrawingView />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Canvas area */}
          <div ref={containerRef} className="flex-1 relative overflow-hidden">
            <AnnotationCanvas containerW={canvasSize.w} containerH={canvasSize.h} />
          </div>

          {/* Measurement panel — 220px on desktop, full sheet on mobile */}
          <div className="hidden sm:flex w-56 shrink-0 flex-col">
            <MeasurementPanel />
          </div>

          {/* Mobile bottom sheet */}
          <MobileSheet />
        </div>
      )}
    </div>
  );
}

function MobileSheet() {
  const [open, setOpen] = useState(false);
  const { boxes, selectedId, unit } = useStore();

  return (
    <div className="sm:hidden absolute bottom-0 left-0 right-0 z-20">
      {/* Handle */}
      <div
        className="bg-gray-900 border-t border-gray-800 flex flex-col items-center"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="w-10 h-1 rounded-full bg-gray-700 my-2" />
        <div className="flex items-center justify-between w-full px-4 pb-2">
          <span className="text-white text-sm font-semibold">
            {boxes.length} component{boxes.length !== 1 ? 's' : ''}
          </span>
          <span className="text-gray-400 text-xs">{open ? '▼' : '▲'} details</span>
        </div>
      </div>

      {/* Expandable panel */}
      {open && (
        <div className="h-64 overflow-hidden">
          <MeasurementPanel />
        </div>
      )}
    </div>
  );
}
