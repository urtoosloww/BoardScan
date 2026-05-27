'use client';
import { useState } from 'react';
import { useStore, getDistances } from '@/lib/store';
import { exportSVG, exportPDF } from '@/lib/export';

function fmt(n: number, unit: string) {
  return unit === 'in' ? n.toFixed(3) : n.toFixed(1);
}

export function MeasurementPanel() {
  const { result, boxes, selectedId, unit, selectBox, updateBox, deleteBox, reset } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const ul = unit === 'in' ? '"' : unit;

  if (!result) return null;

  const distances = getDistances(boxes);
  const selectedBox = boxes.find((b) => b.id === selectedId);

  const startEdit = (id: string, label: string) => {
    setEditingId(id);
    setEditLabel(label);
  };

  const commitEdit = (id: string) => {
    if (editLabel.trim()) updateBox(id, { label: editLabel.trim() });
    setEditingId(null);
  };

  const handleExportSVG = () => {
    exportSVG(result.correctedDataUrl, result.imageW, result.imageH, boxes, unit, result.pixelsPerUnit);
  };

  const handleExportPDF = () => {
    exportPDF(result.correctedDataUrl, result.imageW, result.imageH, boxes, unit, result.pixelsPerUnit);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800 text-white text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800 shrink-0">
        <span className="font-bold text-sm text-white">Components</span>
        <button
          onClick={reset}
          className="text-gray-500 hover:text-red-400 transition-colors text-[10px]"
        >
          New scan
        </button>
      </div>

      {/* Component list */}
      <div className="flex-1 overflow-y-auto">
        {boxes.length === 0 && (
          <p className="text-gray-600 text-center mt-8 px-4">
            No components detected. Add boxes manually with the + button.
          </p>
        )}

        {boxes.map((box) => {
          const isSelected = selectedId === box.id;
          return (
            <div
              key={box.id}
              onClick={() => selectBox(isSelected ? null : box.id)}
              className={`px-3 py-2.5 border-b border-gray-800/60 cursor-pointer transition-colors ${
                isSelected ? 'bg-gray-800' : 'hover:bg-gray-800/50'
              }`}
            >
              {/* Label row */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: box.color }} />
                {editingId === box.id ? (
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={() => commitEdit(box.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(box.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-gray-700 border border-cyan-500 rounded px-1.5 py-0.5 text-white text-xs w-full font-mono focus:outline-none"
                  />
                ) : (
                  <span
                    className="font-mono font-bold text-white flex-1 truncate"
                    onDoubleClick={(e) => { e.stopPropagation(); startEdit(box.id, box.label); }}
                    title="Double-click to rename"
                  >
                    {box.label}
                  </span>
                )}
                {isSelected && editingId !== box.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteBox(box.id); }}
                    className="text-gray-500 hover:text-red-400 transition-colors ml-auto shrink-0"
                    title="Delete"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 ml-4 text-[10px]">
                <span className="text-gray-400">W</span>
                <span className="text-gray-200 font-mono">{fmt(box.realW, unit)}{ul}</span>
                <span className="text-gray-400">H</span>
                <span className="text-gray-200 font-mono">{fmt(box.realH, unit)}{ul}</span>
                <span className="text-gray-400">X</span>
                <span className="text-gray-200 font-mono">{fmt(box.realX, unit)}{ul}</span>
                <span className="text-gray-400">Y</span>
                <span className="text-gray-200 font-mono">{fmt(box.realY, unit)}{ul}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Distances section */}
      {selectedBox && distances.length > 0 && (
        <div className="border-t border-gray-800 px-3 py-2.5 shrink-0 max-h-40 overflow-y-auto">
          <p className="text-gray-400 font-semibold mb-1.5 text-[10px] uppercase tracking-wider">
            Distance from {selectedBox.label}
          </p>
          {distances
            .filter((d) => d.fromId === selectedId || d.toId === selectedId)
            .map((d) => {
              const otherId = d.fromId === selectedId ? d.toId : d.fromId;
              const other = boxes.find((b) => b.id === otherId);
              if (!other) return null;
              return (
                <div key={`${d.fromId}-${d.toId}`} className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300 font-mono">{other.label}</span>
                  <span className="text-cyan-400 font-mono font-bold">{fmt(d.value, unit)}{ul}</span>
                </div>
              );
            })}
        </div>
      )}

      {/* Scale info */}
      <div className="px-3 py-2 border-t border-gray-800 shrink-0 text-[10px] text-gray-500">
        Scale: {result.pixelsPerUnit.toFixed(1)}px / {ul} · {result.gridDetected ? '✓ grid detected' : '⚠ grid estimated'}
      </div>

      {/* Export buttons */}
      <div className="px-3 py-3 border-t border-gray-800 flex gap-2 shrink-0">
        <button
          onClick={handleExportSVG}
          className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold transition-colors"
        >
          SVG
        </button>
        <button
          onClick={handleExportPDF}
          className="flex-1 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white font-semibold transition-colors"
        >
          PDF
        </button>
      </div>
    </div>
  );
}
