import React, { useEffect, useRef, useState } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import { Circle, Group, Image as KonvaImage, Line as KonvaLine, Layer, Stage, Text } from 'react-konva';
import useImage from 'use-image';
import { CalibrationInput } from './components/CalibrationInput';
import { traceLine } from './utils/trace';
import { useStore } from './store';

export const DigitizerCanvas: React.FC = () => {
  const { imageUrl, mode, addPoint, setPendingCalibrationPoint, xAxis, activeSeriesId, series, fittedCurves } = useStore();
  const [image] = useImage(imageUrl || '', 'anonymous');
  const stageRef = useRef<KonvaStage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [currentScale, setCurrentScale] = useState(1);
  const [calibStep, setCalibStep] = useState<1 | 2>(1);

  // Derive active Y axis from active series
  const activeSeries = series.find(s => s.id === activeSeriesId);
  const yAxis = activeSeries?.yAxis;

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
    } else if (mode === 'TRACE') {
      if (!image) return;
      // Create offscreen canvas to read pixel data
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);

      // traceLine expects coords relative to image dimension
      // ptr.x/y is relative to stage, but since image is at 0,0 and scaled by stage,
      // we need to be careful.
      // The Image node in Layer is at 0,0.
      // ptr is relative to the stage, but "getRelativePointerPosition" returns
      // coordinates relative to the container *transform*?
      // Wait, `getRelativePointerPosition` on stage returns pointer relative to stage
      // accounting for stage scale/pos?
      // Let's verify:
      // If stage is scaled 2x, clicking at 100px screen returns 50px stage.
      // If Image is at 0,0 on Layer, then stage coords == image coords.
      // YES.

      // Pick color at the clicked pixel.
      const pData = ctx.getImageData(Math.round(ptr.x), Math.round(ptr.y), 1, 1).data;
      const targetColor = { r: pData[0], g: pData[1], b: pData[2] };

      // Run trace with picked color
      const tracedPoints = traceLine(ctx, ptr.x, ptr.y, targetColor, 60);

      const mappedPoints = tracedPoints.map(p => ({ px: p.x, py: p.y }));

      // Sample down?
      // For now detailed.

      useStore.getState().addPoints(mappedPoints); // Use getState to avoid adding addPoints to dep array if not needed

    } else if (mode === 'CALIBRATE_X') {
      setPendingCalibrationPoint({ axis: 'X', step: calibStep, px: ptr.x, py: ptr.y });
      setCalibStep((prev) => (prev === 1 ? 2 : 1));
    } else if (mode === 'CALIBRATE_Y') {
      setPendingCalibrationPoint({ axis: 'Y', step: calibStep, px: ptr.x, py: ptr.y });
      setCalibStep((prev) => (prev === 1 ? 2 : 1));
    }
  };

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

      {/* Instruction Banner */}
      {imageUrl && mode !== 'IDLE' && mode !== 'DIGITIZE' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur border border-slate-200 px-4 py-2 rounded-full shadow-sm text-sm font-medium text-slate-700 pointer-events-none">
          Click point {calibStep} for {mode === 'CALIBRATE_X' ? 'X' : 'Y'} Axis
        </div>
      )}

      <CalibrationInput />

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

        {/* Calibration Layer */}
        <Layer>
          {/* Fitted Curves */}
          {fittedCurves.map((curve) => {
            if (!activeSeries || curve.seriesId !== activeSeries.id) return null;
            const points: number[] = [];
            curve.points.forEach(p => {
              if (p.dataX !== undefined && p.dataY !== undefined && xAxis.slope && xAxis.intercept && yAxis?.slope && yAxis?.intercept) {
                // Inverse calibration
                let xVal = p.dataX;
                if (xAxis.isLog) xVal = Math.log10(xVal);
                const px = (xVal - xAxis.intercept) / xAxis.slope;

                let yVal = p.dataY;
                if (yAxis.isLog) yVal = Math.log10(yVal);
                const py = (yVal - yAxis.intercept) / yAxis.slope;

                points.push(px, py);
              }
            });

            return (
              <KonvaLine
                key={curve.id}
                points={points}
                stroke="#9333ea" // purple-600
                strokeWidth={2 / currentScale}
                tension={0.5}
                listening={false}
              />
            );
          })}

          {/* X Axis */}
          {xAxis.p1 && xAxis.p2 && (
            <KonvaLine
              points={[xAxis.p1.px, xAxis.p1.py, xAxis.p2.px, xAxis.p2.py]}
              stroke="#3b82f6"
              strokeWidth={1 / currentScale}
              dash={[4, 4]}
            />
          )}
          {xAxis.p1 && (
            <Group x={xAxis.p1.px} y={xAxis.p1.py}>
              <Circle radius={5 / currentScale} fill="#3b82f6" stroke="white" strokeWidth={1 / currentScale} />
              <Text
                text={`x=${xAxis.p1.val}`}
                fill="#3b82f6"
                fontSize={12 / currentScale}
                y={8 / currentScale}
                offsetX={10} // Rough centering
              />
            </Group>
          )}
          {xAxis.p2 && (
            <Group x={xAxis.p2.px} y={xAxis.p2.py}>
              <Circle radius={5 / currentScale} fill="#3b82f6" stroke="white" strokeWidth={1 / currentScale} />
              <Text
                text={`x=${xAxis.p2.val}`}
                fill="#3b82f6"
                fontSize={12 / currentScale}
                y={8 / currentScale}
              />
            </Group>
          )}

          {/* Y Axis */}
          {yAxis && yAxis.p1 && yAxis.p2 && (
            <KonvaLine
              points={[yAxis.p1.px, yAxis.p1.py, yAxis.p2.px, yAxis.p2.py]}
              stroke="#ef4444"
              strokeWidth={1 / currentScale}
              dash={[4, 4]}
            />
          )}
          {yAxis?.p1 && (
            <Group x={yAxis.p1.px} y={yAxis.p1.py}>
              <Circle radius={5 / currentScale} fill="#ef4444" stroke="white" strokeWidth={1 / currentScale} />
              <Text
                text={`y=${yAxis.p1.val}`}
                fill="#ef4444"
                fontSize={12 / currentScale}
                y={8 / currentScale}
              />
            </Group>
          )}
          {yAxis?.p2 && (
            <Group x={yAxis.p2.px} y={yAxis.p2.py}>
              <Circle radius={5 / currentScale} fill="#ef4444" stroke="white" strokeWidth={1 / currentScale} />
              <Text
                text={`y=${yAxis.p2.val}`}
                fill="#ef4444"
                fontSize={12 / currentScale}
                y={8 / currentScale}
              />
            </Group>
          )}
        </Layer>

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
