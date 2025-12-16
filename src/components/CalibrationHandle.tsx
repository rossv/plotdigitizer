import React from 'react';
import { Group, Rect, Text } from 'react-konva';
import { useStore } from '../store';

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

export const CalibrationHandle: React.FC<CalibrationHandleProps> = ({ x, y, label, color, axisType, axisId, pointIndex, scale, xAxis, yAxes }) => {
    const { updateCalibrationPointPosition, setPendingCalibrationPoint, activeWorkspaceId, workspaces } = useStore();
    const activeWorkspace = workspaces.find((w: any) => w.id === activeWorkspaceId);
    const mode = activeWorkspace?.mode || 'IDLE';

    const size = 12 / scale; // Slightly larger for better visibility
    const strokeWidth = 2 / scale;

    return (
        <Group
            x={x}
            y={y}
            draggable
            dragBoundFunc={function (this: any, pos: { x: number, y: number }) {
                const stage = this.getStage();
                if (!stage) return pos;

                // Transform absolute position to local (logical) position
                const transform = stage.getAbsoluteTransform().copy();
                const inverted = transform.copy().invert();
                const localPos = inverted.point(pos);

                let newX = localPos.x;
                let newY = localPos.y;
                const SNAP_THRESHOLD = 20 / scale; // generous threshold

                // candidates for snapping
                const targets: { x?: number, y?: number }[] = [];

                // 1. Check X Axis Points
                if (xAxis.p1 && !(axisType === 'X' && pointIndex === 1)) {
                    targets.push({ x: xAxis.p1.px, y: xAxis.p1.py });
                }
                if (xAxis.p2 && !(axisType === 'X' && pointIndex === 2)) {
                    targets.push({ x: xAxis.p2.px, y: xAxis.p2.py });
                }

                // 2. Check Y Axis Points (all Y axes)
                yAxes.forEach((ax: any) => {
                    if (ax.calibration.p1) {
                        const isSelf = axisType === 'Y' && ax.id === axisId && pointIndex === 1;
                        if (!isSelf) targets.push({ x: ax.calibration.p1.px, y: ax.calibration.p1.py });
                    }
                    if (ax.calibration.p2) {
                        const isSelf = axisType === 'Y' && ax.id === axisId && pointIndex === 2;
                        if (!isSelf) targets.push({ x: ax.calibration.p2.px, y: ax.calibration.p2.py });
                    }
                });

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

                // Convert back to absolute position
                return transform.point({ x: newX, y: newY });
            }}
            onDragEnd={(e) => {
                updateCalibrationPointPosition(axisType, axisId, pointIndex, e.target.x(), e.target.y());
            }}
            onClick={(e) => {
                // If we are in the middle of calibrating (setting a new point),
                // we want the Stage to handle this click (for snapping).
                // Canceling bubble here would prevent the "Add Point" logic on the Stage.
                if (mode === 'CALIBRATE_X' || mode === 'CALIBRATE_Y') {
                    // Let it bubble to Stage
                    return;
                }

                // Otherwise (IDLE, etc), clicking this handle means "Edit this specific point"
                e.cancelBubble = true;
                setPendingCalibrationPoint({
                    axis: axisType,
                    step: pointIndex,
                    px: x,
                    py: y
                });
            }}
            onMouseEnter={(e) => {
                const container = e.target.getStage()?.container();
                if (container) container.style.cursor = 'pointer';
            }}
            onMouseLeave={(e) => {
                const container = e.target.getStage()?.container();
                if (container) container.style.cursor = 'default';
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
