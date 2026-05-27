export type Unit = 'mm' | 'cm' | 'in';
export type Step = 'upload' | 'ai-analysis' | 'scale' | 'processing' | 'annotate';

export interface AIComponent {
  id: string;
  label: string;
  type: string;
  bbox: [number, number, number, number]; // normalized 0-1
  widthMM: number | null;
  heightMM: number | null;
  confidence: number;
  notes?: string;
}

export interface AIAnalysis {
  surface: {
    type: string;
    description: string;
    gridSizeMM: number | null;
    pitchMM: number | null;
    confidence: number;
  };
  scale: {
    pixelsPerMM: number | null;
    method: string;
    boardWidthMM: number | null;
    boardHeightMM: number | null;
  };
  components: AIComponent[];
  insight: string;
}

export interface BoundingBox {
  id: string;
  label: string;
  // Pixel coords in the corrected (warped) image
  x: number;
  y: number;
  w: number;
  h: number;
  // Real-world (derived from pixelsPerUnit)
  realX: number;
  realY: number;
  realW: number;
  realH: number;
  color: string;
}

export interface ProcessResult {
  correctedDataUrl: string;
  imageW: number;
  imageH: number;
  pixelsPerUnit: number;   // px per user-chosen unit in the corrected image
  gridSpacingPx: number;   // px per grid square in the corrected image
  boxes: BoundingBox[];
  gridDetected: boolean;
}

export interface Distance {
  fromId: string;
  toId: string;
  value: number; // in user units
}
