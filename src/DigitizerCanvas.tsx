import React, { useEffect, useRef, useState } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import { Circle, Image as KonvaImage, Layer, Stage } from 'react-konva';
import useImage from 'use-image';
import { useStore } from './store';

export const DigitizerCanvas: React.FC = () => {
  const { imageUrl, mode, addPoint, setXAxisPoint, setYAxisPoint } = useStore();
  const [image] = useImage(imageUrl || '', 'anonymous');
  const stageRef = useRef<KonvaStage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [currentScale, setCurrentScale] = useState(1);
  const [calibStep, setCalibStep] = useState<1 | 2>(1);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Reset calibration sequence whenever the mode changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalibStep(1);
  }, [mode]);

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (!imageUrl) return;

    const stage = e.target.getStage();
    if (!stage) return;
    const ptr = stage.getRelativePointerPosition();
    if (!ptr) return;

    if (mode === 'DIGITIZE') {
      addPoint(ptr.x, ptr.y);
    } else if (mode === 'CALIBRATE_X') {
      const val = parseFloat(prompt(`Enter X value for point ${calibStep}:`) || '0');
      setXAxisPoint(calibStep, ptr.x, ptr.y, val);
      setCalibStep((prev) => (prev === 1 ? 2 : 1));
    } else if (mode === 'CALIBRATE_Y') {
      const val = parseFloat(prompt(`Enter Y value for point ${calibStep}:`) || '0');
      setYAxisPoint(calibStep, ptr.x, ptr.y, val);
      setCalibStep((prev) => (prev === 1 ? 2 : 1));
    }
  };

  const series = useStore((state) => state.series);
  const points = React.useMemo(() =>
    series.flatMap((ser) => ser.points.map((p) => ({ ...p, color: ser.color }))),
    [series]
  );
  return (
    <div ref={containerRef} className="flex-1 h-full bg-slate-100 overflow-hidden relative">
      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
          Load an image to get started
        </div>
      )}
      <Stage
        width={size.width}
        height={size.height}
        draggable
        onClick={handleStageClick}
        ref={stageRef}
        onWheel={(e) => {
          e.evt.preventDefault();
          const stage = stageRef.current;
          if (!stage) return;
          const oldScale = stage.scaleX();
          const pointer = stage.getPointerPosition();
          const scaleBy = 1.1;
          const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

          const mousePointTo = {
            x: (pointer?.x ?? 0) / oldScale - stage.x() / oldScale,
            y: (pointer?.y ?? 0) / oldScale - stage.y() / oldScale,
          };

          stage.scale({ x: newScale, y: newScale });
          const newPos = {
            x: -(mousePointTo.x - (pointer?.x ?? 0) / newScale) * newScale,
            y: -(mousePointTo.y - (pointer?.y ?? 0) / newScale) * newScale,
          };
          stage.position(newPos);
          setCurrentScale(newScale);
          stage.batchDraw();
        }}
      >
        <Layer>{image && <KonvaImage image={image} />}</Layer>

        <Layer>
          {points.map((p) => (
            <Circle
              key={p.id}
              x={p.x}
              y={p.y}
              radius={4 / currentScale}
              fill={p.color}
              stroke="#0f172a"
              strokeWidth={1 / currentScale}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
};
