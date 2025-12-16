import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import Konva from 'konva';
import { Circle, Group, Image as KonvaImage, Line as KonvaLine, Layer, Stage, Text, Label, Tag, Rect, Path } from 'react-konva';
import useImage from 'use-image';
import { CalibrationInput } from './components/CalibrationInput';
import { WandVariationModal } from './components/WandVariationModal';
import { traceLine, resamplePoints, simplifyRDP } from './utils/trace'; // Fixed import to include simplifyRDP
import { pixelToData } from './utils/math';
import { useStore } from './store';
import { CalibrationHandle } from './components/CalibrationHandle';
import { Magnifier } from './components/Magnifier';

// Animated Components
const AnimatedCircle = (props: React.ComponentProps<typeof Circle>) => {
  const ref = useRef<any>(null);
  useEffect(() => {
    const node = ref.current;
    if (node) {
      node.scale({ x: 0, y: 0 });
      node.to({
        scaleX: 1,
        scaleY: 1,
        duration: 0.4,
        easing: Konva.Easings.BackEaseOut,
      });
    }
  }, []);
  return <Circle ref={ref} {...props} />;
};

const AnimatedGroup = (props: React.ComponentProps<typeof Group>) => {
  const ref = useRef<any>(null);
  useEffect(() => {
    const node = ref.current;
    if (node) {
      node.scale({ x: 0, y: 0 });
      node.to({
        scaleX: 1,
        scaleY: 1,
        duration: 0.4,
        easing: Konva.Easings.BackEaseOut,
      });
    }
  }, []);
  return <Group ref={ref} {...props} />;
};

export interface DigitizerHandle {
  toDataURL: (options?: { graphicsOnly?: boolean }) => string | null;
}

export interface DigitizerCanvasProps {
  onLoadImage?: () => void;
}

export const DigitizerCanvas = forwardRef<DigitizerHandle, DigitizerCanvasProps>(
  ({ onLoadImage }, ref) => {
    const {
      updateSeriesLabelPosition,
      activeWorkspaceId,
      workspaces,
      selectPoints,
      togglePointSelection,
      updatePointPosition,
      clearSelection,
    } = useStore();

    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
    if (!activeWorkspace) return null;

    const { imageUrl, mode, xAxis, xAxisName, series, yAxes, activeYAxisId, selectedPointIds } = activeWorkspace;
    const [image] = useImage(imageUrl || '', 'anonymous');
    const stageRef = useRef<KonvaStage | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

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

    const [currentScale, setCurrentScale] = useState(1);
    // Removed local calibStep state in favor of derived state below
    const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);

    // Selection State
    const isSelectingRef = useRef(false);
    const selectionStartRef = useRef<{ x: number, y: number } | null>(null);
    const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

    // Guide Lines & Cursor Coords
    const [pointerPos, setPointerPos] = useState<{ x: number, y: number } | null>(null);
    const [cursorDataCoords, setCursorDataCoords] = useState<{ x: number, y: number } | null>(null);

    // Smart Wand Variations
    const [wandModalOpen, setWandModalOpen] = useState(false);
    const [wandModalData, setWandModalData] = useState<{ imageData: ImageData, seed: { x: number, y: number }, targetColor: { r: number, g: number, b: number } } | null>(null);



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

    // Derived Calibration Step
    let calibStep = 1;
    if (mode === 'CALIBRATE_X') {
      calibStep = !xAxis.p1 ? 1 : 2;
    } else if (mode === 'CALIBRATE_Y') {
      const yAxis = activeYAxisDef; // already derived above
      calibStep = (yAxis && !yAxis.calibration.p1) ? 1 : 2;
    }

    // --- MAGNIFIER STATE ---
    const [magPos, setMagPos] = useState({ x: -9999, y: -9999 }); // init offscreen
    const [magSize, setMagSize] = useState({ width: 220, height: 220 });
    const [magnifierZoom, setMagnifierZoom] = useState(2);
    const zoomFactors = [2, 4, 8];

    // Initial Placement for Magnifier
    useEffect(() => {
      if (stageSize.width > 0 && magPos.x === -9999) {
        setMagPos({ x: stageSize.width - 240, y: 20 });
      }
    }, [stageSize.width, magPos.x]);


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

          // 1. Point Snapping (Existing calibration points)
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

          // 2. Line Snapping (Crosshairs from P1)
          if (!closest) {
            let p1: { px: number; py: number } | null = null;
            if (mode === 'CALIBRATE_X') {
              p1 = xAxis.p1 ? { px: xAxis.p1.px, py: xAxis.p1.py } : null;
            } else if (mode === 'CALIBRATE_Y') {
              const yAxis = yAxes.find(y => y.id === activeYAxisId);
              p1 = yAxis?.calibration.p1 ? { px: yAxis.calibration.p1.px, py: yAxis.calibration.p1.py } : null;
            }

            if (p1) {
              // Vertical Line Snap (match X)
              const distV = Math.abs(relPointer.x - p1.px);
              if (distV < SNAP_THRESHOLD && distV < minDist) {
                minDist = distV;
                closest = { x: p1.px, y: relPointer.y };
              }
              // Horizontal Line Snap (match Y)
              const distH = Math.abs(relPointer.y - p1.py);
              if (distH < SNAP_THRESHOLD && distH < minDist) {
                minDist = distH;
                // If we already snapped vertical, this implies intersection, but intersection is P1 which is covered by point snap.
                // So we just take the new closest.
                closest = { x: relPointer.x, y: p1.py };
              }
            }
          }

          setSnapPoint(closest);
        }
      } else {
        if (snapPoint) setSnapPoint(null);
      }
    };

    const finishTrace = (tracedPoints: { x: number; y: number }[]) => {
      setWandModalOpen(false);
      if (tracedPoints.length === 0) return;

      useStore.getState().openModal({
        type: 'prompt',
        message: 'How many points do you want to add?',
        defaultValue: '20',
        onConfirm: (countStr) => {
          if (!countStr) return;
          const desiredCount = parseInt(countStr, 10);
          if (isNaN(desiredCount) || desiredCount < 2) return;

          const { addPoints } = useStore.getState();

          const simplifiedPoints = tracedPoints.length > 2
            ? simplifyRDP(tracedPoints, 2.0)
            : tracedPoints;

          const resultPoints = resamplePoints(simplifiedPoints, desiredCount);
          addPoints(resultPoints);
        }
      });
    };

    const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
      if (!imageUrl) return;

      const stage = e.target.getStage();
      if (!stage) return;
      const ptr = stage.getRelativePointerPosition();
      if (!ptr) return;

      // Prevent adding point if we were selecting
      if (selectionBox && (selectionBox.width > 2 || selectionBox.height > 2)) return;

      const state = useStore.getState();
      const { addPoint, addSinglePoint, activeWorkspaceId, workspaces, setPendingCalibrationPoint } = state;
      const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
      if (!activeWorkspace) return;
      const mode = activeWorkspace.mode;

      if (mode === 'DIGITIZE') {
        addPoint(ptr.x, ptr.y);
      } else if (mode === 'SINGLE_POINT') {
        addSinglePoint(ptr.x, ptr.y);
      } else if (mode === 'TRACE' || mode === 'TRACE_ADVANCED') {
        if (!image) return;

        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(image, 0, 0);

        const pData = ctx.getImageData(Math.round(ptr.x), Math.round(ptr.y), 1, 1).data;
        const targetColor = { r: pData[0], g: pData[1], b: pData[2] };

        if (mode === 'TRACE_ADVANCED') {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          setWandModalData({
            imageData,
            seed: { x: ptr.x, y: ptr.y },
            targetColor: { ...targetColor }
          });
          setWandModalOpen(true);
        } else {
          const tracedPoints = traceLine(ctx, ptr.x, ptr.y, targetColor, 100);
          finishTrace(tracedPoints);
        }
      } else if (mode === 'CALIBRATE_X') {
        const target = snapPoint || ptr;
        const step = !activeWorkspace.xAxis.p1 ? 1 : 2;
        setPendingCalibrationPoint({ axis: 'X', step, px: target.x, py: target.y });
      } else if (mode === 'CALIBRATE_Y') {
        const target = snapPoint || ptr;
        const yAxis = activeWorkspace.yAxes.find(y => y.id === activeWorkspace.activeYAxisId);
        if (yAxis) {
          const step = !yAxis.calibration.p1 ? 1 : 2;
          setPendingCalibrationPoint({ axis: 'Y', step, px: target.x, py: target.y });
        }
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
        <Magnifier
          imageUrl={imageUrl}
          stageRef={stageRef}
          containerRef={containerRef}
          magPos={magPos}
          setMagPos={setMagPos}
          magSize={magSize}
          setMagSize={setMagSize}
          magnifierZoom={magnifierZoom}
          setMagnifierZoom={setMagnifierZoom}
          zoomFactors={zoomFactors}
        />

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

            {/* X Axis Calibration Guide */}
            {xAxis.p1 && !xAxis.p2 && mode === 'CALIBRATE_X' && pointerPos && (
              <>
                {/* Crosshair Guides */}
                <KonvaLine
                  points={[xAxis.p1.px, 0, xAxis.p1.px, stageSize.height / currentScale]}
                  stroke="#ADD8E6"
                  strokeWidth={1 / currentScale}
                  dash={[5, 3]}
                  opacity={0.8}
                  listening={false}
                />
                <KonvaLine
                  points={[0, xAxis.p1.py, stageSize.width / currentScale, xAxis.p1.py]}
                  stroke="#ADD8E6"
                  strokeWidth={1 / currentScale}
                  dash={[5, 3]}
                  opacity={0.8}
                  listening={false}
                />
                {/* Connect line to pointer */}
                <KonvaLine
                  points={[xAxis.p1.px, xAxis.p1.py, pointerPos.x, pointerPos.y]}
                  stroke="#3b82f6"
                  strokeWidth={1 / currentScale}
                  dash={[4, 4]}
                  listening={false}
                />
              </>
            )}

            {/* X Axis */}
            {xAxis.p1 && xAxis.p2 && (
              <>
                <KonvaLine
                  points={[xAxis.p1.px, xAxis.p1.py, xAxis.p2.px, xAxis.p2.py]}
                  stroke="#3b82f6"
                  strokeWidth={1 / currentScale}
                  dash={[4, 4]}
                />
                {(() => {
                  const midX = (xAxis.p1.px + xAxis.p2.px) / 2;
                  const midY = (xAxis.p1.py + xAxis.p2.py) / 2;
                  const angleRad = Math.atan2(xAxis.p2.py - xAxis.p1.py, xAxis.p2.px - xAxis.p1.px);

                  const isBottom = image ? midY > image.height / 2 : true;
                  const dist = 25 / currentScale;

                  const nx = -Math.sin(angleRad) * dist;
                  const ny = Math.cos(angleRad) * dist;

                  let fx = midX + nx;
                  let fy = midY + ny;

                  const wentDown = fy > midY;

                  if (isBottom && !wentDown) {
                    fx = midX - nx;
                    fy = midY - ny;
                  } else if (!isBottom && wentDown) {
                    fx = midX - nx;
                    fy = midY - ny;
                  }

                  return (
                    <Text
                      text={xAxisName}
                      x={fx}
                      y={fy}
                      rotation={angleRad * 180 / Math.PI}
                      fill="#3b82f6"
                      fontSize={16 / currentScale}
                      fontStyle="bold"
                      offsetY={(16 / currentScale) / 2}
                      offsetX={(xAxisName.length * 8) / (2 * currentScale)}
                    />
                  );
                })()}
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
                      {(() => {
                        const midX = (p1.px + p2.px) / 2;
                        const midY = (p1.py + p2.py) / 2;
                        const angleRad = Math.atan2(p2.py - p1.py, p2.px - p1.px);

                        // "if calibration points are more towards the right... place label to the right"
                        // "if towards left... place to left"
                        const isRight = image ? midX > image.width / 2 : true;
                        const dist = 25 / currentScale;

                        const nx = -Math.sin(angleRad) * dist;
                        const ny = Math.cos(angleRad) * dist;

                        let fx = midX + nx;
                        let fy = midY + ny;

                        // Check alignment
                        const wentRight = fx > midX;

                        if (isRight && !wentRight) {
                          fx = midX - nx;
                          fy = midY - ny;
                        } else if (!isRight && wentRight) {
                          fx = midX - nx;
                          fy = midY - ny;
                        }

                        return (
                          <Text
                            text={axis.name}
                            x={fx}
                            y={fy}
                            rotation={angleRad * 180 / Math.PI}
                            fill={color}
                            fontSize={16 / currentScale}
                            fontStyle="bold"
                            offsetY={(16 / currentScale) / 2}
                            offsetX={(axis.name.length * 8) / (2 * currentScale)}
                          />
                        );
                      })()}
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

                  {/* Y Axis Calibration Guide */}
                  {p1 && !p2 && mode === 'CALIBRATE_Y' && axis.id === activeYAxisId && pointerPos && (
                    <>
                      {/* Crosshair Guides */}
                      <KonvaLine
                        points={[p1.px, 0, p1.px, stageSize.height / currentScale]}
                        stroke="#ADD8E6"
                        strokeWidth={1 / currentScale}
                        dash={[5, 3]}
                        opacity={0.8}
                        listening={false}
                      />
                      <KonvaLine
                        points={[0, p1.py, stageSize.width / currentScale, p1.py]}
                        stroke="#ADD8E6"
                        strokeWidth={1 / currentScale}
                        dash={[5, 3]}
                        opacity={0.8}
                        listening={false}
                      />
                      {/* Connect line to pointer */}
                      <KonvaLine
                        points={[p1.px, p1.py, pointerPos.x, pointerPos.y]}
                        stroke={color}
                        strokeWidth={1 / currentScale}
                        dash={[4, 4]}
                        listening={false}
                      />
                    </>
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

            {points.map((p) => {
              if (p.isSinglePoint) {
                return (

                  <AnimatedGroup
                    key={p.id}
                    x={p.x}
                    y={p.y}
                    draggable
                    onDragEnd={(e: any) => {
                      updatePointPosition(p.id, e.target.x(), e.target.y());
                    }}
                    onClick={(e: any) => {
                      e.cancelBubble = true;
                      if (mode === 'SELECT' || mode === 'DIGITIZE' || mode === 'SINGLE_POINT') {
                        togglePointSelection(p.id, e.evt.ctrlKey || e.evt.shiftKey);
                      }
                    }}
                  >
                    <Group
                      scaleX={1 / currentScale}
                      scaleY={1 / currentScale}
                      offsetX={12}
                      offsetY={22}
                    >
                      <Path
                        data="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"
                        fill={p.color}
                        stroke={p.selected ? '#3b82f6' : '#0f172a'}
                        strokeWidth={p.selected ? 2 : 1.5}
                        shadowColor="black"
                        shadowBlur={4}
                        shadowOpacity={0.3}
                      />
                      <Circle
                        x={12}
                        y={10}
                        radius={3}
                        fill="white"
                        listening={false}
                      />
                    </Group>
                  </AnimatedGroup>
                );
              }

              return (

                <AnimatedCircle
                  key={p.id}
                  x={p.x}
                  y={p.y}
                  radius={(p.selected ? 6 : 4) / currentScale}
                  fill={p.color}
                  stroke={p.selected ? '#3b82f6' : '#0f172a'}
                  strokeWidth={(p.selected ? 3 : 1) / currentScale}
                  draggable
                  onDragEnd={(e: any) => {
                    updatePointPosition(p.id, e.target.x(), e.target.y());
                  }}
                  onClick={(e: any) => {
                    e.cancelBubble = true;
                    if (mode === 'SELECT' || mode === 'DIGITIZE' || mode === 'SINGLE_POINT') {
                      togglePointSelection(p.id, e.evt.ctrlKey || e.evt.shiftKey);
                    }
                  }}
                />
              );

            })}

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

        {wandModalOpen && wandModalData && (
          <WandVariationModal
            isOpen={wandModalOpen}
            imageData={wandModalData.imageData}
            seed={wandModalData.seed}
            targetColor={wandModalData.targetColor}
            onSelect={(points) => finishTrace(points)}
            onClose={() => setWandModalOpen(false)}
          />
        )}
      </div>
    );
  });
