'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image, Rect, Text, Transformer, Line } from 'react-konva';
import { useStore } from '@/lib/store';
import { BoundingBox } from '@/lib/types';
import { toRealWorld } from '@/lib/cv-pipeline';

interface Props {
  containerW: number;
  containerH: number;
}

function useImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return;
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  return img;
}

function EditableBox({
  box, isSelected, scale, pixelsPerUnit, unit,
  onSelect, onChange,
}: {
  box: BoundingBox; isSelected: boolean; scale: number;
  pixelsPerUnit: number; unit: string;
  onSelect: () => void; onChange: (patch: Partial<BoundingBox>) => void;
}) {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleTransformEnd = () => {
    const node = shapeRef.current;
    if (!node) return;
    const sx = node.scaleX(), sy = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const newW = Math.max(10, node.width() * sx);
    const newH = Math.max(10, node.height() * sy);
    const nx = node.x(), ny = node.y();
    onChange({
      x: nx / scale, y: ny / scale, w: newW / scale, h: newH / scale,
      ...toRealWorld(nx / scale, ny / scale, newW / scale, newH / scale, pixelsPerUnit),
    });
  };

  const handleDragEnd = (e: any) => {
    const nx = e.target.x() / scale, ny = e.target.y() / scale;
    onChange({
      x: nx, y: ny,
      ...toRealWorld(nx, ny, box.w, box.h, pixelsPerUnit),
    });
  };

  const scaledX = box.x * scale, scaledY = box.y * scale;
  const scaledW = box.w * scale, scaledH = box.h * scale;
  const ul = unit === 'in' ? '"' : unit;
  const wLabel = unit === 'in' ? box.realW.toFixed(3) : box.realW.toFixed(1);
  const hLabel = unit === 'in' ? box.realH.toFixed(3) : box.realH.toFixed(1);

  return (
    <>
      <Rect
        ref={shapeRef}
        x={scaledX} y={scaledY}
        width={scaledW} height={scaledH}
        stroke={box.color}
        strokeWidth={isSelected ? 2 : 1.5}
        dash={[6, 3]}
        fill={isSelected ? `${box.color}22` : 'transparent'}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
      <Rect
        x={scaledX} y={scaledY - 18}
        width={box.label.length * 7 + 10} height={16}
        fill={box.color} cornerRadius={3}
        onClick={onSelect} onTap={onSelect}
      />
      <Text
        x={scaledX + 5} y={scaledY - 16}
        text={box.label}
        fill="white" fontSize={10} fontFamily="monospace" fontStyle="bold"
        onClick={onSelect} onTap={onSelect}
      />
      <Text
        x={scaledX + scaledW / 2} y={scaledY + scaledH + 3}
        text={`${wLabel}${ul}`}
        fill={box.color} fontSize={9} fontFamily="monospace"
        align="center"
      />
      <Text
        x={scaledX + scaledW + 4} y={scaledY + scaledH / 2}
        text={`${hLabel}${ul}`}
        fill={box.color} fontSize={9} fontFamily="monospace"
        verticalAlign="middle"
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox: any, newBox: any) =>
            newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
          }
          rotateEnabled={false}
          keepRatio={false}
        />
      )}
    </>
  );
}

export default function AnnotationCanvasInner({ containerW, containerH }: Props) {
  const { result, boxes, selectedId, unit, selectBox, updateBox, addBox } = useStore();
  const bgImage = useImage(result?.correctedDataUrl ?? null);

  if (!result || !bgImage) return (
    <div className="w-full h-full flex items-center justify-center text-gray-500">
      Loading canvas...
    </div>
  );

  const scale = Math.min(containerW / result.imageW, containerH / result.imageH);
  const stageW = result.imageW * scale;
  const stageH = result.imageH * scale;

  const handleStageClick = (e: any) => {
    if (e.target === e.target.getStage()) selectBox(null);
  };

  const handleAddBox = () => {
    const cx = result.imageW / 2, cy = result.imageH / 2;
    const w = result.gridSpacingPx * 2, h = result.gridSpacingPx * 2;
    addBox({
      id: `box-${Date.now()}`,
      label: `C${boxes.length + 1}`,
      x: cx, y: cy, w, h,
      color: '#3b82f6',
      ...toRealWorld(cx, cy, w, h, result.pixelsPerUnit),
    });
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gray-950">
      <Stage
        width={stageW} height={stageH}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer>
          <Image image={bgImage} width={stageW} height={stageH} />
          {Array.from({ length: Math.ceil(result.imageW / result.gridSpacingPx) }).map((_, i) => (
            <Line
              key={`v${i}`}
              points={[i * result.gridSpacingPx * scale, 0, i * result.gridSpacingPx * scale, stageH]}
              stroke="rgba(34,211,238,0.12)" strokeWidth={1}
            />
          ))}
          {Array.from({ length: Math.ceil(result.imageH / result.gridSpacingPx) }).map((_, i) => (
            <Line
              key={`h${i}`}
              points={[0, i * result.gridSpacingPx * scale, stageW, i * result.gridSpacingPx * scale]}
              stroke="rgba(34,211,238,0.12)" strokeWidth={1}
            />
          ))}
          {boxes.map((box) => (
            <EditableBox
              key={box.id}
              box={box}
              isSelected={selectedId === box.id}
              scale={scale}
              pixelsPerUnit={result.pixelsPerUnit}
              unit={unit}
              onSelect={() => selectBox(box.id)}
              onChange={(patch) => updateBox(box.id, patch)}
            />
          ))}
        </Layer>
      </Stage>
      <button
        onClick={handleAddBox}
        title="Add bounding box"
        className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-2xl shadow-lg flex items-center justify-center transition-colors"
      >
        +
      </button>
    </div>
  );
}
