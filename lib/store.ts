'use client';
import { create } from 'zustand';
import { AIAnalysis, BoundingBox, Distance, ProcessResult, Step, Unit } from './types';

interface AppState {
  step: Step;
  rawImageSrc: string | null;
  rawImageW: number;
  rawImageH: number;
  gridSize: number;
  unit: Unit;
  processing: boolean;
  processingStatus: string;
  result: ProcessResult | null;
  boxes: BoundingBox[];
  selectedId: string | null;
  aiAnalysis: AIAnalysis | null;

  // Actions
  setStep: (s: Step) => void;
  setRawImage: (src: string, w: number, h: number) => void;
  setScale: (gridSize: number, unit: Unit) => void;
  setProcessing: (b: boolean, status?: string) => void;
  setResult: (r: ProcessResult) => void;
  selectBox: (id: string | null) => void;
  updateBox: (id: string, patch: Partial<BoundingBox>) => void;
  addBox: (box: BoundingBox) => void;
  deleteBox: (id: string) => void;
  reset: () => void;
  setAIAnalysis: (a: AIAnalysis | null) => void;
}

export const useStore = create<AppState>((set, get) => ({
  step: 'upload',
  rawImageSrc: null,
  rawImageW: 0,
  rawImageH: 0,
  gridSize: 10,
  unit: 'mm',
  processing: false,
  processingStatus: '',
  result: null,
  boxes: [],
  selectedId: null,
  aiAnalysis: null,

  setStep: (step) => set({ step }),
  setRawImage: (rawImageSrc, rawImageW, rawImageH) =>
    set({ rawImageSrc, rawImageW, rawImageH }),
  setScale: (gridSize, unit) => set({ gridSize, unit }),
  setProcessing: (processing, processingStatus = '') =>
    set({ processing, processingStatus }),
  setResult: (result) =>
    set({ result, boxes: result.boxes, step: 'annotate', processing: false }),
  selectBox: (selectedId) => set({ selectedId }),
  updateBox: (id, patch) =>
    set((s) => ({ boxes: s.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
  addBox: (box) => set((s) => ({ boxes: [...s.boxes, box], selectedId: box.id })),
  deleteBox: (id) =>
    set((s) => ({
      boxes: s.boxes.filter((b) => b.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  reset: () =>
    set({
      step: 'upload',
      rawImageSrc: null,
      result: null,
      boxes: [],
      selectedId: null,
      processing: false,
      aiAnalysis: null,
    }),
  setAIAnalysis: (aiAnalysis) => set({ aiAnalysis }),
}));

export function getDistances(boxes: BoundingBox[]): Distance[] {
  const dist: Distance[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const cxA = a.realX + a.realW / 2, cyA = a.realY + a.realH / 2;
      const cxB = b.realX + b.realW / 2, cyB = b.realY + b.realH / 2;
      dist.push({
        fromId: a.id,
        toId: b.id,
        value: Math.sqrt((cxB - cxA) ** 2 + (cyB - cyA) ** 2),
      });
    }
  }
  return dist;
}
