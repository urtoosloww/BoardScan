'use client';
import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { generateDrawingSVG, downloadSVG, downloadDXF } from '@/lib/drawing-export';

export function DrawingView() {
  const { result, boxes, unit } = useStore();

  const svgMarkup = useMemo(() => {
    if (!result) return '';
    return generateDrawingSVG({
      boxes,
      imageW: result.imageW,
      imageH: result.imageH,
      pixelsPerUnit: result.pixelsPerUnit,
      unit,
      title: 'Board Layout',
    });
  }, [result, boxes, unit]);

  if (!result) return null;

  const opts = {
    boxes,
    imageW: result.imageW,
    imageH: result.imageH,
    pixelsPerUnit: result.pixelsPerUnit,
    unit,
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 shrink-0 bg-gray-900">
        <span className="text-gray-400 text-xs flex-1">
          Technical drawing — {boxes.length} component{boxes.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => downloadSVG(opts)}
          className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
        >
          <span>↓</span> SVG
        </button>
        <button
          onClick={() => downloadDXF(opts)}
          className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
        >
          <span>↓</span> DXF (AutoDesk)
        </button>
      </div>

      {/* Drawing canvas */}
      <div className="flex-1 overflow-auto bg-gray-800 flex items-center justify-center p-4">
        <div
          className="shadow-2xl"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        />
      </div>
    </div>
  );
}
