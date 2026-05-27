'use client';
import dynamic from 'next/dynamic';

// react-konva must load in the browser only. Wrap the entire implementation
// in a single dynamic() so Konva's internal component-type checks see real
// Konva classes rather than Next.js lazy wrappers.
const AnnotationCanvasInner = dynamic(
  () => import('./AnnotationCanvasInner'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        Loading canvas...
      </div>
    ),
  }
);

export function AnnotationCanvas(props: { containerW: number; containerH: number }) {
  return <AnnotationCanvasInner {...props} />;
}
