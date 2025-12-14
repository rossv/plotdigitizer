import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import { Circle, Group, Image as KonvaImage, Line as KonvaLine, Layer, Stage, Text, Label, Tag, Rect } from 'react-konva';
import useImage from 'use-image';
import { CalibrationInput } from './components/CalibrationInput';
import { traceLine, traceLinePath } from './utils/trace';
import { pixelToData } from './utils/math';
import { useStore } from './store';

interface CalibrationHandleProps {
  x: number;
  y: number;
  label: string;
  color: string;
  axisType: 'X' | 'Y';
  axisId: string | null;
  pointIndex: 1 | 2;
  scale: number;
  xAxis: any;
  yAxes: any[];
}

const CalibrationHandle: React.FC<CalibrationHandleProps> = ({ x, y, label, color, axisType, axisId, pointIndex, scale, xAxis, yAxes }) => {
  const { updateCalibrationPointPosition } = useStore();
  const size = 12 / scale; // Slightly larger for better visibility
  const strokeWidth = 2 / scale;

  return (
    <Group
      x={x}
      y={y}
      draggable
      dragBoundFunc={(pos) => {
        let newX = pos.x;
        let newY = pos.y;
        const SNAP_THRESHOLD = 20 / scale; // generous threshold

        // candidates for snapping
        const targets: { x?: number, y?: number }[] = [];

        if (axisType === 'X') {
          const other = pointIndex === 1 ? xAxis.p2 : xAxis.p1;
          if (other) {
            targets.push({ x: other.px, y: other.py });
          }
        } else {
          // Current Y Axis
          const currentAxis = yAxes.find((a: any) => a.id === axisId);
          const other = pointIndex === 1 ? currentAxis?.calibration.p2 : currentAxis?.calibration.p1;
          if (other) {
            targets.push({ x: other.px, y: other.py });
          }
          // Other Y Axes (Snap Y to others)
          yAxes.forEach((ax: any) => {
            if (ax.id === axisId) return;
            if (ax.calibration.p1) targets.push({ y: ax.calibration.p1.py });
            if (ax.calibration.p2) targets.push({ y: ax.calibration.p2.py });
          });
        }

        for (const t of targets) {
          if (t.x !== undefined) {
            if (Math.abs(t.x - newX) < SNAP_THRESHOLD) {
              newX = t.x;
            }
          }
          if (t.y !== undefined) {
            if (Math.abs(t.y - newY) < SNAP_THRESHOLD) {
              newY = t.y;
            }
          }
        }

        return { x: newX, y: newY };
      }}
      onDragEnd={(e) => {
        updateCalibrationPointPosition(axisType, axisId, pointIndex, e.target.x(), e.target.y());
      }}
    >
      <Rect
        width={size}
        height={size}
        offsetX={size / 2}
        offsetY={size / 2}
        fill={color}
        stroke="white"
        strokeWidth={strokeWidth}
        shadowColor="black"
        shadowBlur={2 / scale}
        shadowOpacity={0.3}
      />
      <Text
        text={label}
        fill={color}
        fontSize={12 / scale}
        y={size / 2 + 3 / scale}
        x={-size} // visual tweak
      />
    </Group>
  );
};

export interface DigitizerHandle {
  toDataURL: (options?: { graphicsOnly?: boolean }) => string | null;
}

export interface DigitizerCanvasProps {
  onLoadImage?: () => void;
}

export const DigitizerCanvas = forwardRef<DigitizerHandle, DigitizerCanvasProps>(({ onLoadImage }, ref) => {
  const {
    addPoint,
    addSinglePoint,
    setPendingCalibrationPoint,
    updateSeriesLabelPosition,
    activeWorkspaceId,
    workspaces,
    selectPoints,
    togglePointSelection,
    updatePointPosition,
    clearSelection
  } = useStore();

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
  if (!activeWorkspace) return null;

  const { imageUrl, mode, xAxis, xAxisName, series, yAxes, activeYAxisId, selectedPointIds } = activeWorkspace;
  const [image] = useImage(imageUrl || '', 'anonymous');
  const stageRef = useRef<KonvaStage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const magnifierRef = useRef<HTMLCanvasElement>(null);

  const [currentScale, setCurrentScale] = useState(1);
  const [calibStep, setCalibStep] = useState<1 | 2>(1);
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);

  // Selection State
  const isSelectingRef = useRef(false);
  const selectionStartRef = useRef<{ x: number, y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

  // Guide Lines & Cursor Coords
  const [pointerPos, setPointerPos] = useState<{ x: number, y: number } | null>(null);
  const [cursorDataCoords, setCursorDataCoords] = useState<{ x: number, y: number } | null>(null);

  useImperativeHandle(ref, () => ({
    toDataURL: (options) => {
      if (stageRef.current) {
        const stage = stageRef.current;
        const oldScale = stage.scale();
        const oldPos = stage.position();
        let originalImageVisible = true;
        let sourceImageNode: any = null;
        let bgLayer: any = null;
        const hiddenNodes: any[] = [];

        try {
          if (options?.graphicsOnly) {
            // 1. Hide Source Image
            sourceImageNode = stage.findOne('.source-image');
            if (sourceImageNode) {
              originalImageVisible = sourceImageNode.visible();
              sourceImageNode.hide();
            }

            // 2. Hide UI Artifacts
            ['.guide-line', '.snap-indicator', '.selection-box'].forEach(selector => {
              const nodes = stage.find(selector);
              nodes.forEach((node: any) => {
                if (node.visible()) {
                  node.hide();
                  hiddenNodes.push(node);
                }
              });
            });

            // 3. Reset Transform temporarily for accurate bounding box calculation
            stage.scale({ x: 1, y: 1 });
            stage.position({ x: 0, y: 0 });

            // 4. Get Bounding Box of visible content
            const bbox = stage.getClientRect({ relativeTo: stage });

            // 5. Add White Background matching the bbox (with padding)
            const padding = 20;
            // Handle case where bbox might be invalid (e.g. no graphics)
            const bgX = bbox.width > 0 ? bbox.x - padding : 0;
            const bgY = bbox.height > 0 ? bbox.y - padding : 0;
            const bgW = bbox.width > 0 ? bbox.width + (padding * 2) : stage.width();
            const bgH = bbox.height > 0 ? bbox.height + (padding * 2) : stage.height();

            bgLayer = new (window as any).Konva.Layer();
            const bgRect = new (window as any).Konva.Rect({
              x: bgX,
              y: bgY,
              width: bgW,
              height: bgH,
              fill: 'white',
            });
            bgLayer.add(bgRect);
            stage.add(bgLayer);
            bgLayer.moveToBottom();

            // 6. Export cropped area
            return stage.toDataURL({
              pixelRatio: 2,
              x: bgX,
              y: bgY,
              width: bgW,
              height: bgH,
            });
          } else {
            // Standard export
            return stage.toDataURL({ pixelRatio: 2 });
          }
        } finally {
          // Cleanup and Restore
          if (bgLayer) bgLayer.destroy();
          if (sourceImageNode && originalImageVisible) {
            sourceImageNode.show();
          }
          hiddenNodes.forEach(node => node.show());

          // Restore State
          if (oldScale) stage.scale(oldScale);
          if (oldPos) stage.position(oldPos);
        }
      }
      return null;
    }
  }));

  // Active Y Axis (for calibration display)
  const activeYAxisDef = yAxes.find(y => y.id === activeYAxisId);


  useEffect(() => {
    setCalibStep(1);
  }, [mode]);

  // ... (handleStageMouseMove is fine) ...

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Update pointer pos for Guide Lines
    const relPos = stage.getRelativePointerPosition();
    if (relPos) {
      setPointerPos(relPos);
    }

    // Calculate cursor data coordinates if in digitize modes
    if ((mode === 'DIGITIZE' || mode === 'SINGLE_POINT') && activeWorkspace && relPos) {
      const { xAxis, yAxes, activeYAxisId } = activeWorkspace;
      const activeYAxis = yAxes.find(y => y.id === activeYAxisId);

      if (activeYAxis) {
        const coords = pixelToData(relPos.x, relPos.y, xAxis, activeYAxis.calibration);
        setCursorDataCoords(coords);
      } else {
        setCursorDataCoords(null);
      }
    } else {
      if (cursorDataCoords) setCursorDataCoords(null);
    }

    // Box Selection Logic
    if (mode === 'SELECT' && isSelectingRef.current && selectionStartRef.current && relPos) {
      const x = Math.min(selectionStartRef.current.x, relPos.x);
      const y = Math.min(selectionStartRef.current.y, relPos.y);
      const width = Math.abs(relPos.x - selectionStartRef.current.x);
      const height = Math.abs(relPos.y - selectionStartRef.current.y);
      setSelectionBox({ x, y, width, height });
    }

    // Snapping Logic (only in calibration modes)
    if (mode === 'CALIBRATE_X' || mode === 'CALIBRATE_Y') {
      const relPointer = stage.getRelativePointerPosition();
      if (relPointer) {
        const SNAP_THRESHOLD = 10 / currentScale;
        let closest: { x: number; y: number } | null = null;
        let minDist = SNAP_THRESHOLD;

        // Collect all potential snap targets
        const targets: { x: number; y: number }[] = [];
        if (xAxis.p1) targets.push({ x: xAxis.p1.px, y: xAxis.p1.py });
        if (xAxis.p2) targets.push({ x: xAxis.p2.px, y: xAxis.p2.py });
        yAxes.forEach(y => {
          if (y.calibration.p1) targets.push({ x: y.calibration.p1.px, y: y.calibration.p1.py });
          if (y.calibration.p2) targets.push({ x: y.calibration.p2.px, y: y.calibration.p2.py });
        });

        for (const t of targets) {
          const dist = Math.sqrt((t.x - relPointer.x) ** 2 + (t.y - relPointer.y) ** 2);
          if (dist < minDist) {
            minDist = dist;
            closest = t;
          }
        }
        setSnapPoint(closest);
      }
    } else {
      if (snapPoint) setSnapPoint(null);
    }

    if (magnifierRef.current && stageRef.current) {
      const mainCanvas = stageRef.current.content.querySelector('canvas');
      if (mainCanvas) {
        const ctx = magnifierRef.current.getContext('2d');
        if (ctx) {
          // Settings
          const size = 150;
          const zoom = 2; // 2x magnification
          const srcSize = size / zoom;

          // Clear
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, size, size);

          // Konva handles pixel ratio. The <canvas> width/height attributes might be larger than style/stage size.
          const pixelRatio = window.devicePixelRatio || 1;

          // Source coordinates on the actual canvas element
          // NOTE: If snapping, we stick the magnifier to the snap point?
          // Actually, it's better to stick to the mouse so user sees what is there.
          // But maybe we can verify snapping visually on the main canvas.

          const sx = pointer.x * pixelRatio - (srcSize * pixelRatio) / 2;
          const sy = pointer.y * pixelRatio - (srcSize * pixelRatio) / 2;
          const sWidth = srcSize * pixelRatio;
          const sHeight = srcSize * pixelRatio;

          ctx.drawImage(
            mainCanvas,
            sx, sy, sWidth, sHeight,
            0, 0, size, size
          );

          // Draw Reticle (Crosshair)
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(size / 2, 0);
          ctx.lineTo(size / 2, size);
          ctx.moveTo(0, size / 2);
          ctx.lineTo(size, size / 2);
          ctx.stroke();
        }
      }
    }
  };

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (!imageUrl) return;

    const stage = e.target.getStage();
    if (!stage) return;
    const ptr = stage.getRelativePointerPosition();
    if (!ptr) return;

    // Prevent adding point if we were selecting
    if (selectionBox && (selectionBox.width > 2 || selectionBox.height > 2)) return;

    if (mode === 'DIGITIZE') {
      addPoint(ptr.x, ptr.y);
    } else if (mode === 'SINGLE_POINT') {
      addSinglePoint(ptr.x, ptr.y);
    } else if (mode === 'TRACE' || mode === 'TRACE_ADVANCED') {
      if (!image) return;

      // Create temporary canvas for pixel reading
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);

      const targetColor = { r: 0, g: 0, b: 0 }; // Default black for now, could be dynamic
      // Get color at click
      const pData = ctx.getImageData(ptr.x, ptr.y, 1, 1).data;
      targetColor.r = pData[0];
      targetColor.g = pData[1];
      targetColor.b = pData[2];

      let tracedPoints: { x: number; y: number }[] = [];

      if (mode === 'TRACE_ADVANCED') {
        // Use new path tracer
        tracedPoints = traceLinePath(ctx, ptr.x, ptr.y, targetColor, 60);
      } else {
        // Use legacy flood fill
        tracedPoints = traceLine(ctx, ptr.x, ptr.y, targetColor, 60);
      }

      if (tracedPoints.length === 0) return;

      // Ask user for number of points
      useStore.getState().openModal({
        type: 'prompt',
        message: 'How many points do you want to add?',
        defaultValue: '20',
        onConfirm: (countStr) => {
          if (!countStr) return;
          const desiredCount = parseInt(countStr, 10);
          if (isNaN(desiredCount) || desiredCount < 2) return;

          const resultPoints: { px: number; py: number }[] = [];

          if (mode === 'TRACE_ADVANCED') {
            // Arc-length based downsampling
            if (tracedPoints.length <= desiredCount) {
              tracedPoints.forEach(p => resultPoints.push({ px: p.x, py: p.y }));
            } else {
              // 1. Calculate cumulative lengths
              const cumLengths: number[] = [0];
              let totalLength = 0;
              for (let i = 1; i < tracedPoints.length; i++) {
                const p1 = tracedPoints[i - 1];
                const p2 = tracedPoints[i];
                const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
                totalLength += dist;
                cumLengths.push(totalLength);
              }

              // 2. Sample at equal intervals
              const step = totalLength / (desiredCount - 1);

              // Always add first point
              resultPoints.push({ px: tracedPoints[0].x, py: tracedPoints[0].y });

              let currentTarget = step;
              let lastIdx = 0;

              for (let i = 1; i < desiredCount - 1; i++) {
                // Find point closest to currentTarget
                let closestIdx = lastIdx;
                let minDiff = Infinity;

                for (let j = lastIdx; j < cumLengths.length; j++) {
                  const diff = Math.abs(cumLengths[j] - currentTarget);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = j;
                  } else {
                    break;
                  }
                }

                const p = tracedPoints[closestIdx];
                resultPoints.push({ px: p.x, py: p.y });

                lastIdx = closestIdx;
                currentTarget += step;
              }

              // Always add last point
              const lastP = tracedPoints[tracedPoints.length - 1];
              resultPoints.push({ px: lastP.x, py: lastP.y });
            }

          } else {
            // Standard X-Sort Logic
            // 1. Sort by X
            tracedPoints.sort((a, b) => a.x - b.x);

            // 2. Thin points: Bucket by X (round to nearest pixel) and average Y
            const buckets = new Map<number, number[]>();
            for (const p of tracedPoints) {
              const rx = Math.round(p.x);
              if (!buckets.has(rx)) buckets.set(rx, []);
              buckets.get(rx)!.push(p.y);
            }

            const uniquePoints: { x: number; y: number }[] = [];
            const sortedXs = Array.from(buckets.keys()).sort((a, b) => a - b);

            for (const x of sortedXs) {
              const ys = buckets.get(x)!;
              const avgY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
              uniquePoints.push({ x, y: avgY });
            }

            // 3. Select points
            if (uniquePoints.length <= desiredCount) {
              uniquePoints.forEach(p => resultPoints.push({ px: p.x, py: p.y }));
            } else {
              resultPoints.push({ px: uniquePoints[0].x, py: uniquePoints[0].y });

              const minX = uniquePoints[0].x;
              const maxX = uniquePoints[uniquePoints.length - 1].x;
              const totalRange = maxX - minX;

              const step = totalRange / (desiredCount - 1);

              for (let i = 1; i < desiredCount - 1; i++) {
                const targetX = minX + (step * i);
                const closest = uniquePoints.reduce((prev, curr) => {
                  return (Math.abs(curr.x - targetX) < Math.abs(prev.x - targetX) ? curr : prev);
                });
                resultPoints.push({ px: closest.x, py: closest.y });
              }

              resultPoints.push({ px: uniquePoints[uniquePoints.length - 1].x, py: uniquePoints[uniquePoints.length - 1].y });
            }
          }

          useStore.getState().addPoints(resultPoints);
        }
      });

    } else if (mode === 'CALIBRATE_X') {
      const target = snapPoint || ptr;
      setPendingCalibrationPoint({ axis: 'X', step: calibStep, px: target.x, py: target.y });
      setCalibStep((prev) => (prev === 1 ? 2 : 1));
      setSnapPoint(null);
    } else if (mode === 'CALIBRATE_Y') {
      const target = snapPoint || ptr;
      setPendingCalibrationPoint({ axis: 'Y', step: calibStep, px: target.x, py: target.y });
      setCalibStep((prev) => (prev === 1 ? 2 : 1));
      setSnapPoint(null);
    }
  };

  const points = React.useMemo(() => {
    const seriesPoints = series.flatMap((ser) => ser.points.map((p) => ({
      ...p,
      color: ser.color,
      selected: selectedPointIds?.includes(p.id),
      showPointCoordinates: ser.showPointCoordinates,
      isSinglePoint: false,
    })));

    const singlePts = (activeWorkspace.singlePoints || []).map(p => ({
      ...p,
      color: '#eab308', // Yellow-500 equivalent, distinct from default red
      selected: selectedPointIds?.includes(p.id),
      showPointCoordinates: true,
      isSinglePoint: true,
    }));

    return [...seriesPoints, ...singlePts];
  }, [series, activeWorkspace.singlePoints, selectedPointIds]);

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (mode !== 'SELECT') return;

    // Check if clicking on background (Stage or Image)
    const isBackground = e.target === e.target.getStage() || e.target.name() === 'source-image';

    if (isBackground) {
      const stage = e.target.getStage();
      const ptr = stage?.getRelativePointerPosition();
      if (ptr) {
        isSelectingRef.current = true;
        selectionStartRef.current = ptr;

        // Clear selection if no modifier key
        if (!e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) {
          clearSelection();
        }
      }
    }
  };

  const handleStageMouseUp = () => {
    if (mode === 'SELECT' && isSelectingRef.current) {
      if (selectionBox) {
        // Find points in box
        const box = selectionBox;
        const selectedIds: string[] = [];
        points.forEach(p => {
          if (p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height) {
            selectedIds.push(p.id);
          }
        });
        // Append
        selectPoints(selectedIds, true);
      } else {
        // Just a click on stage in select mode -> clear selection (handled in mousedown usually, but safe here too)
      }
    }
    isSelectingRef.current = false;
    selectionStartRef.current = null;
    setSelectionBox(null);
  };

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStageSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Update scale on wheel...
  // (Your existing resize/wheel logic can remain mostly, except for initial width/height)

  return (
    <div ref={containerRef} className="flex-1 h-full w-full overflow-hidden relative bg-transparent">
      {!imageUrl && (
        <div
          onClick={onLoadImage}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors"
        >
          <div className="p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 transition-colors shadow-sm">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-500 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
            </div>
            <span className="font-semibold text-lg text-slate-600 dark:text-slate-300">Click to load Image or PDF</span>
            <span className="text-sm text-slate-400">or paste from clipboard (Ctrl+V)</span>
          </div>
        </div>
      )}

      {/* Instruction Banner */}
      {imageUrl && mode !== 'IDLE' && mode !== 'DIGITIZE' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full shadow-sm text-sm font-medium text-slate-700 dark:text-slate-300 pointer-events-none">
          {mode === 'SELECT'
            ? 'Selection Mode: Drag to select, click to toggle. Del to delete, Arrows to move.'
            : (mode === 'TRACE'
              ? 'Wand Mode: Click a line to auto-trace'
              : (mode === 'TRACE_ADVANCED'
                ? 'Smart Wand: Click complex lines (dashed, overlaps) to trace'
                : `Click point ${calibStep} for ${mode === 'CALIBRATE_X' ? 'X' : (activeYAxisDef ? activeYAxisDef.name : 'Y Axis')}`))
          }
        </div>
      )}

      {/* Magnifier Overlay */}
      <div className="absolute top-4 right-4 w-[150px] h-[150px] bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 shadow-lg z-20 pointer-events-none rounded overflow-hidden">
        <canvas ref={magnifierRef} width={150} height={150} />
      </div>

      <CalibrationInput />

      <Stage
        width={stageSize.width}
        height={stageSize.height}
        draggable={mode !== 'SELECT'}
        onClick={handleStageClick}
        onMouseMove={handleStageMouseMove}
        style={{ cursor: mode === 'IDLE' ? 'default' : 'crosshair' }}
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
        onMouseDown={handleStageMouseDown}
        onMouseUp={handleStageMouseUp}
      >
        <Layer>
          {image && (
            <KonvaImage
              name="source-image"
              image={image}
              opacity={0}
              ref={(node) => {
                if (node) {
                  node.to({
                    opacity: 1,
                    duration: 0.5,
                  });
                }
              }}
            />
          )}
        </Layer>

        {/* Calibration Layer */}
        <Layer>
          {/* Fitted Curves */}
          {/* Fitted Curves */}
          {series.map((ser) => {
            if (!ser.fitConfig.enabled || !ser.fitResult) return null;

            // Find appropriate Y Axis for this curve
            const curveYAxis = yAxes.find(y => y.id === ser.yAxisId)?.calibration;

            // If main axes are not calibrated, can't draw fit
            if (!curveYAxis || curveYAxis.slope === null || curveYAxis.intercept === null || xAxis.slope === null || xAxis.intercept === null) return null;

            const points: number[] = [];
            ser.fitResult.points.forEach(p => {
              if (p.dataX !== undefined && p.dataY !== undefined) {
                // Inverse calibration
                let xVal = p.dataX;
                if (xAxis.isLog && xVal > 0) xVal = Math.log10(xVal);
                const px = (xVal - xAxis.intercept!) / xAxis.slope!;

                let yVal = p.dataY;
                if (curveYAxis.isLog && yVal > 0) yVal = Math.log10(yVal);
                const py = (yVal - curveYAxis.intercept!) / curveYAxis.slope!;

                points.push(px, py);
              }
            });

            return (
              <KonvaLine
                key={`fit-${ser.id}`}
                points={points}
                stroke={ser.color}
                strokeWidth={2 / currentScale}
                tension={0.5}
                listening={false}
                dash={[10, 5]} // Dashed line to distinguish from raw data or connecting lines
              />
            );
          })}

          {/* X Axis */}
          {xAxis.p1 && xAxis.p2 && (
            <>
              <KonvaLine
                points={[xAxis.p1.px, xAxis.p1.py, xAxis.p2.px, xAxis.p2.py]}
                stroke="#3b82f6"
                strokeWidth={1 / currentScale}
                dash={[4, 4]}
              />
              <Text
                text={xAxisName}
                x={(xAxis.p1.px + xAxis.p2.px) / 2}
                y={(xAxis.p1.py + xAxis.p2.py) / 2}
                rotation={Math.atan2(xAxis.p2.py - xAxis.p1.py, xAxis.p2.px - xAxis.p1.px) * 180 / Math.PI}
                fill="#3b82f6"
                fontSize={16 / currentScale}
                fontStyle="bold"
                offsetY={15 / currentScale}
                offsetX={(xAxisName.length * 8) / (2 * currentScale)} // Approx centering
              />
            </>
          )}
          {xAxis.p1 && (
            <CalibrationHandle
              x={xAxis.p1.px}
              y={xAxis.p1.py}
              label={`x=${xAxis.p1.val}`}
              color="#3b82f6"
              axisType="X"
              axisId={null}
              pointIndex={1}
              scale={currentScale}
              xAxis={xAxis}
              yAxes={yAxes}
            />
          )}
          {xAxis.p2 && (
            <CalibrationHandle
              x={xAxis.p2.px}
              y={xAxis.p2.py}
              label={`x=${xAxis.p2.val}`}
              color="#3b82f6"
              axisType="X"
              axisId={null}
              pointIndex={2}
              scale={currentScale}
              xAxis={xAxis}
              yAxes={yAxes}
            />
          )}

          {/* Cursor Coordinate Label */}
          {(mode === 'DIGITIZE' || mode === 'SINGLE_POINT') && cursorDataCoords && pointerPos && (
            <Label
              x={pointerPos.x + 15}
              y={pointerPos.y + 15}
              listening={false}
            >
              <Tag
                fill="rgba(0, 0, 0, 0.75)"
                cornerRadius={4}
                pointerDirection="left"
                pointerWidth={6}
                pointerHeight={6}
                lineJoin="round"
              />
              <Text
                text={`(${cursorDataCoords.x.toFixed(4)}, ${cursorDataCoords.y.toFixed(4)})`}
                fontSize={12 / currentScale}
                fill="white"
                padding={6}
              />
            </Label>
          )}

          {/* Y Axes */}
          {yAxes.map((axis) => {
            const { p1, p2 } = axis.calibration;
            const isActive = axis.id === activeYAxisId;
            const color = axis.color;
            const opacity = isActive ? 1 : 0.6;

            return (
              <Group key={axis.id} opacity={opacity}>
                {p1 && p2 && (
                  <>
                    <KonvaLine
                      points={[p1.px, p1.py, p2.px, p2.py]}
                      stroke={color}
                      strokeWidth={1 / currentScale}
                      dash={[4, 4]}
                      listening={false}
                    />
                    <Text
                      text={axis.name}
                      x={(p1.px + p2.px) / 2}
                      y={(p1.py + p2.py) / 2}
                      rotation={Math.atan2(p2.py - p1.py, p2.px - p1.px) * 180 / Math.PI}
                      fill={color}
                      fontSize={16 / currentScale}
                      fontStyle="bold"
                      offsetY={15 / currentScale}
                      offsetX={(axis.name.length * 8) / (2 * currentScale)}
                    />
                  </>
                )}
                {p1 && (
                  <CalibrationHandle
                    x={p1.px}
                    y={p1.py}
                    label={`y=${p1.val}`}
                    color={color}
                    axisType="Y"
                    axisId={axis.id}
                    pointIndex={1}
                    scale={currentScale}
                    xAxis={xAxis}
                    yAxes={yAxes}
                  />
                )}
                {p2 && (
                  <CalibrationHandle
                    x={p2.px}
                    y={p2.py}
                    label={`y=${p2.val}`}
                    color={color}
                    axisType="Y"
                    axisId={axis.id}
                    pointIndex={2}
                    scale={currentScale}
                    xAxis={xAxis}
                    yAxes={yAxes}
                  />
                )}
              </Group>
            );
          })}
        </Layer>

        {/* Snap Indicator Layer */}
        <Layer>
          {snapPoint && (
            <Circle
              name="snap-indicator"
              x={snapPoint.x}
              y={snapPoint.y}
              radius={8 / currentScale}
              stroke="cyan"
              strokeWidth={2 / currentScale}
              fill="transparent"
              listening={false}
            />
          )}
        </Layer>

        {/* Selection Box */}
        <Layer>
          {selectionBox && (
            <Rect
              name="selection-box"
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              fill="rgba(59, 130, 246, 0.2)"
              stroke="#3b82f6"
              strokeWidth={1 / currentScale}
            />
          )}
        </Layer>

        <Layer>
          {/* Guide Lines (Crosshair) */}
          {mode === 'DIGITIZE' && pointerPos && (
            <>
              <KonvaLine
                name="guide-line"
                points={[0, pointerPos.y, stageSize.width / currentScale, pointerPos.y]}
                stroke="red"
                strokeWidth={1 / currentScale}
                dash={[4, 4]}
                opacity={0.5}
                listening={false}
              />
              <KonvaLine
                name="guide-line"
                points={[pointerPos.x, 0, pointerPos.x, stageSize.height / currentScale]}
                stroke="red"
                strokeWidth={1 / currentScale}
                dash={[4, 4]}
                opacity={0.5}
                listening={false}
              />
            </>
          )}

          {points.map((p) => (
            <Circle
              key={p.id}
              x={p.x}
              y={p.y}
              radius={(p['isSinglePoint'] ? (p.selected ? 10 : 8) : (p.selected ? 6 : 4)) / currentScale}
              fill={p.color}
              stroke={p.selected ? '#3b82f6' : '#0f172a'}
              strokeWidth={(p.selected ? 3 : 1) / currentScale}
              draggable
              onDragEnd={(e) => {
                updatePointPosition(p.id, e.target.x(), e.target.y());
              }}
              onClick={(e) => {
                e.cancelBubble = true;
                if (mode === 'SELECT' || mode === 'DIGITIZE' || mode === 'SINGLE_POINT') {
                  togglePointSelection(p.id, e.evt.ctrlKey || e.evt.shiftKey);
                }
              }}
            />
          ))}

          {/* Point Coordinate Labels */}
          {points.map((p) => {
            if (!p.showPointCoordinates || p.dataX === undefined || p.dataY === undefined) return null;
            return (
              <Text
                key={`coord-${p.id}`}
                x={p.x + 8 / currentScale}
                y={p.y - 8 / currentScale} // Offset slightly top-right
                text={`(${p.dataX.toFixed(3)}, ${p.dataY.toFixed(3)})`}
                fill={'white'}
                stroke={'black'}
                strokeWidth={2 / currentScale}
                fillAfterStrokeEnabled={true}
                fontSize={10 / currentScale}
                fontStyle="bold"
                listening={false}
              />
            );
          })}
        </Layer>

        {/* Series Labels Layer */}
        <Layer>
          {series.map((ser) => {
            if (!ser.showLabels || ser.points.length === 0) return null;
            const centerIndex = Math.floor(ser.points.length / 2);
            const p = ser.points[centerIndex];
            const labelX = ser.labelPosition?.x ?? p.x;
            const labelY = ser.labelPosition?.y ?? p.y;
            const isDragged = ser.labelPosition !== undefined;

            return (
              <Group key={`label-group-${ser.id}`}>
                {isDragged && (
                  <KonvaLine
                    points={[p.x, p.y, labelX, labelY]}
                    stroke={ser.color}
                    strokeWidth={1 / currentScale}
                    dash={[4, 4]}
                    listening={false}
                  />
                )}
                <Label
                  x={labelX}
                  y={labelY}
                  draggable
                  onDragEnd={(e) => {
                    updateSeriesLabelPosition(ser.id, { x: e.target.x(), y: e.target.y() });
                  }}
                >
                  <Tag
                    fill={ser.color}
                    pointerDirection="down"
                    pointerWidth={isDragged ? 0 : 25 / currentScale}
                    pointerHeight={isDragged ? 0 : 80 / currentScale}
                    lineJoin="round"
                    shadowColor="black"
                    shadowBlur={5}
                    shadowOffsetX={2}
                    shadowOffsetY={2}
                    shadowOpacity={0.2}
                    cornerRadius={4}
                  />
                  <Text
                    text={ser.name}
                    fontFamily="sans-serif"
                    fontSize={14 / currentScale}
                    padding={6}
                    fill="white"
                  />
                </Label>
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
});
