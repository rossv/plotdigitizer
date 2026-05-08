import Tesseract from 'tesseract.js';
import type { StoreSlice, WorkspaceSlice } from '../types';
import { createInitialWorkspace, normalizeRotation, rotatePointBetweenAngles, updateActiveWorkspace } from '../utils';
import { sanitizeProjectData } from '../projectValidation';
import { detectAxes } from '../../utils/autoDetect';
import { calculateCalibration } from '../../utils/math';
import { recognizeText } from '../../utils/ocr';

// Handles standard floats, scientific notation (1e3, 1E-3), and exponent patterns (10^3, 10^-2, ×10³)
const parseAxisValue = (s: string): number => {
    let clean = s.trim();
    // Superscript digits → ASCII
    const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    clean = clean.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, d => String(sup.indexOf(d)));
    // "10^-3" or "10^3" style
    clean = clean.replace(/10\s*[\^]\s*(-?\d+)/i, (_, e) => String(Math.pow(10, parseInt(e, 10))));
    const n = parseFloat(clean.replace(/[^0-9.eE+\-]/g, ''));
    return isNaN(n) ? NaN : n;
};

const initWs = createInitialWorkspace('Workspace 1');

const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error('Failed to load image for rotation.'));
    img.src = url;
});

export const createWorkspaceSlice: StoreSlice<WorkspaceSlice> = (set, get) => ({
    workspaces: [initWs],
    activeWorkspaceId: initWs.id,

    addWorkspace: () => set(state => {
        const newWs = createInitialWorkspace(`Workspace ${state.workspaces.length + 1}`);
        return {
            workspaces: [...state.workspaces, newWs],
            activeWorkspaceId: newWs.id
        };
    }),

    removeWorkspace: (id) => set(state => {
        if (state.workspaces.length <= 1) return {}; // Prevent deleting last workspace
        const newWorkspaces = state.workspaces.filter(w => w.id !== id);
        let newActiveId = state.activeWorkspaceId;
        if (state.activeWorkspaceId === id) {
            newActiveId = newWorkspaces[newWorkspaces.length - 1].id;
        }
        return { workspaces: newWorkspaces, activeWorkspaceId: newActiveId };
    }),

    setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

    updateWorkspaceName: (id, name) => set(state => ({
        workspaces: state.workspaces.map(w => w.id === id ? { ...w, name } : w)
    })),

    loadProject: (projectData: unknown) => set((state) => {
        const sanitized = sanitizeProjectData(projectData);

        if (sanitized.status === 'invalid') {
            get().openModal({
                type: 'alert',
                title: 'Import Failed',
                message: sanitized.warnings[0] || 'The selected file is invalid and could not be imported.',
            });
            return {};
        }

        if (sanitized.status === 'recovered' || sanitized.status === 'migrated') {
            get().openModal({
                type: 'alert',
                title: sanitized.status === 'migrated' ? 'Project Migrated' : 'Project Recovered',
                message: sanitized.warnings.join('\n') || 'Project data was partially repaired during import.',
            });
        }

        return {
            workspaces: sanitized.workspaces,
            activeWorkspaceId: sanitized.activeWorkspaceId,
            theme: sanitized.theme || state.theme,
        };
    }),

    setImageUrl: (url) => set(state => updateActiveWorkspace(state, () => ({ imageUrl: url, imageRotation: 0 }))),

    setMode: (mode) => set(state => updateActiveWorkspace(state, () => ({ mode, pendingCalibrationPoint: null }))),

    autoDetectAxes: async () => {
        const state = get();
        const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
        if (!ws || !ws.imageUrl) return;

        try {
            const workingImageUrl = ws.imageUrl;
            const result = await detectAxes(workingImageUrl);
            const { width: imageWidth, height: imageHeight } = await getImageDimensions(ws.imageUrl);

            // Adaptive ROI: scale with image size, with sensible minimums
            const roiW = Math.round(Math.max(50, imageWidth * 0.07));
            const roiH = Math.round(Math.max(25, imageHeight * 0.04));
            const padding = Math.round(Math.max(4, imageWidth * 0.004));

            const xP1Roi = { x: result.xAxis.p1.x - roiW / 2, y: result.xAxis.p1.y + padding, w: roiW, h: roiH };
            const xP2Roi = { x: result.xAxis.p2.x - roiW / 2, y: result.xAxis.p2.y + padding, w: roiW, h: roiH };
            const yP1Roi = { x: result.yAxis.p1.x - roiW - padding, y: result.yAxis.p1.y - roiH / 2, w: roiW, h: roiH };
            const yP2Roi = { x: result.yAxis.p2.x - roiW - padding, y: result.yAxis.p2.y - roiH / 2, w: roiW, h: roiH };

            const xMid = (result.xAxis.p1.x + result.xAxis.p2.x) / 2;
            const labelH = Math.round(Math.max(35, imageHeight * 0.05));
            const labelW = Math.round(Math.max(150, imageWidth * 0.15));
            const xLabelRoi = { x: xMid - labelW / 2, y: result.xAxis.p1.y + roiH + padding, w: labelW, h: labelH };

            const yMid = (result.yAxis.p1.y + result.yAxis.p2.y) / 2;
            const yLabelRoi = { x: result.yAxis.p1.x - roiW - padding, y: yMid - labelW / 2, w: roiH, h: labelW };

            const numWhitelist = '0123456789.eE+\-×^';

            // Single worker shared across all OCR calls for speed
            const worker = await Tesseract.createWorker('eng');
            const [x1Str, x2Str, y1Str, y2Str, xName, yName] = await Promise.all([
                recognizeText(workingImageUrl, xP1Roi, { whitelist: numWhitelist, worker }),
                recognizeText(workingImageUrl, xP2Roi, { whitelist: numWhitelist, worker }),
                recognizeText(workingImageUrl, yP1Roi, { whitelist: numWhitelist, worker }),
                recognizeText(workingImageUrl, yP2Roi, { whitelist: numWhitelist, worker }),
                recognizeText(workingImageUrl, xLabelRoi, { worker }),
                recognizeText(workingImageUrl, yLabelRoi, { worker }),
            ]);
            await worker.terminate();

            const parseVal = parseAxisValue;

            const rotateDetectedPoint = (point: { x: number; y: number }) => rotatePointBetweenAngles(
                point,
                imageWidth,
                imageHeight,
                0,
                ws.imageRotation,
            );

            const xP1Rotated = rotateDetectedPoint(result.xAxis.p1);
            const xP2Rotated = rotateDetectedPoint(result.xAxis.p2);
            const yP1Rotated = rotateDetectedPoint(result.yAxis.p1);
            const yP2Rotated = rotateDetectedPoint(result.yAxis.p2);

            const xP1 = { px: xP1Rotated.x, py: xP1Rotated.y, val: parseVal(x1Str) };
            const xP2 = { px: xP2Rotated.x, py: xP2Rotated.y, val: parseVal(x2Str) };
            const yP1 = { px: yP1Rotated.x, py: yP1Rotated.y, val: parseVal(y1Str) };
            const yP2 = { px: yP2Rotated.x, py: yP2Rotated.y, val: parseVal(y2Str) };

            set(state => updateActiveWorkspace(state, (ws) => {
                const newXAxis = { ...ws.xAxis, p1: xP1, p2: xP2, slope: null as number | null, intercept: null as number | null };
                const newXAxisName = (xName && xName.length > 1) ? xName.replace(/[\n\r]/g, ' ').trim() : ws.xAxisName;

                const xValsValid = !isNaN(xP1.val) && !isNaN(xP2.val) && xP1.val !== xP2.val;
                if (xValsValid) {
                    try {
                        const px1 = xP1.px;
                        let px2 = xP2.px;
                        if (Math.abs(px1 - px2) < 0.1) px2 += 1;
                        const { slope, intercept } = calculateCalibration(px1, xP1.val, px2, xP2.val, newXAxis.isLog);
                        newXAxis.slope = slope;
                        newXAxis.intercept = intercept;
                    } catch (e) {
                        console.warn("Auto-calibration X failed", e);
                    }
                } else if (!isNaN(xP1.val) && !isNaN(xP2.val)) {
                    console.warn("Auto-calibration X skipped: identical values detected", xP1.val, xP2.val);
                }

                const newYAxes = ws.yAxes.map(y => {
                    if (y.id === ws.activeYAxisId) {
                        const newCalib = { ...y.calibration, p1: yP1, p2: yP2, slope: null as number | null, intercept: null as number | null };
                        let newName = y.name;
                        if (yName && yName.length > 1) {
                            newName = yName.replace(/[\n\r]/g, ' ').trim();
                        }
                        const yValsValid = !isNaN(yP1.val) && !isNaN(yP2.val) && yP1.val !== yP2.val;
                        if (yValsValid) {
                            try {
                                const py1 = yP1.py;
                                let py2 = yP2.py;
                                if (Math.abs(py1 - py2) < 0.1) py2 += 1;
                                const { slope, intercept } = calculateCalibration(py1, yP1.val, py2, yP2.val, newCalib.isLog);
                                newCalib.slope = slope;
                                newCalib.intercept = intercept;
                            } catch (e) {
                                console.warn("Auto-calibration Y failed", e);
                            }
                        } else if (!isNaN(yP1.val) && !isNaN(yP2.val)) {
                            console.warn("Auto-calibration Y skipped: identical values detected", yP1.val, yP2.val);
                        }
                        return { ...y, name: newName, calibration: newCalib };
                    }
                    return y;
                });

                const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
                newHistory.push({
                    series: ws.series,
                    singlePoints: ws.singlePoints,
                    yAxes: newYAxes,
                    xAxis: newXAxis,
                    imageRotation: ws.imageRotation,
                    description: 'Auto Calibrate Axes',
                });

                return {
                    xAxis: newXAxis,
                    xAxisName: newXAxisName,
                    yAxes: newYAxes,
                    mode: 'IDLE',
                    history: newHistory,
                    historyIndex: newHistory.length - 1,
                };
            }));

            const checks = get().workspaces.find(w => w.id === state.activeWorkspaceId);
            const isXOk = checks?.xAxis.slope !== null;
            const activeY = checks?.yAxes.find(y => y.id === checks.activeYAxisId);
            const isYOk = activeY?.calibration.slope !== null;

            let msg = 'Auto-calibration complete.\nAxes detected.';
            if (!isXOk || !isYOk) {
                msg += '\n\nWARNING: Calibration failed for ' + (!isXOk ? 'X ' : '') + (!isYOk ? 'Y ' : '') + 'axis.';
                msg += '\nPossible causes: Coincident points, or invalid values.';
                msg += '\nPlease check values and position.';
            } else {
                msg += '\nValues calculated successfully.';
            }

            get().openModal({
                type: 'alert',
                message: msg
            });

        } catch (e) {
            console.error(e);
            get().openModal({ type: 'alert', message: 'Failed to detect axes. Please calibrate manually.' });
        }
    },

    rotateImageByDegrees: async (deltaDegrees) => {
        if (!Number.isFinite(deltaDegrees) || Math.abs(deltaDegrees) < 0.0001) return;
        const state = get();
        const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
        if (!ws?.imageUrl) return;

        try {
            const { width, height } = await getImageDimensions(ws.imageUrl);

            set(curr => updateActiveWorkspace(curr, (active) => {
                const nextRotation = normalizeRotation(active.imageRotation + deltaDegrees);
                const rotateCalPoint = (point: { px: number; py: number; val: number } | null) => {
                    if (!point) return null;
                    const rotated = rotatePointBetweenAngles({ x: point.px, y: point.py }, width, height, active.imageRotation, nextRotation);
                    return { ...point, px: rotated.x, py: rotated.y };
                };

                const newXAxis = {
                    ...active.xAxis,
                    p1: rotateCalPoint(active.xAxis.p1),
                    p2: rotateCalPoint(active.xAxis.p2),
                };

                const newYAxes = active.yAxes.map((axis) => ({
                    ...axis,
                    calibration: {
                        ...axis.calibration,
                        p1: rotateCalPoint(axis.calibration.p1),
                        p2: rotateCalPoint(axis.calibration.p2),
                    },
                }));

                const updatedSeries = active.series.map((series) => ({
                    ...series,
                    points: series.points.map((p) => {
                        const rotated = rotatePointBetweenAngles({ x: p.x, y: p.y }, width, height, active.imageRotation, nextRotation);
                        return { ...p, x: rotated.x, y: rotated.y };
                    }),
                    labelPosition: series.labelPosition
                        ? rotatePointBetweenAngles(series.labelPosition, width, height, active.imageRotation, nextRotation)
                        : undefined,
                }));

                const newSinglePoints = active.singlePoints.map((p) => {
                    const rotated = rotatePointBetweenAngles({ x: p.x, y: p.y }, width, height, active.imageRotation, nextRotation);
                    return { ...p, x: rotated.x, y: rotated.y };
                });

                const newPendingPoint = active.pendingCalibrationPoint
                    ? (() => {
                        const rotated = rotatePointBetweenAngles({ x: active.pendingCalibrationPoint.px, y: active.pendingCalibrationPoint.py }, width, height, active.imageRotation, nextRotation);
                        return {
                            ...active.pendingCalibrationPoint,
                            px: rotated.x,
                            py: rotated.y,
                        };
                    })()
                    : null;

                const newHistory = active.history ? active.history.slice(0, active.historyIndex + 1) : [];
                newHistory.push({
                    series: updatedSeries,
                    singlePoints: newSinglePoints,
                    yAxes: newYAxes,
                    xAxis: newXAxis,
                    imageRotation: nextRotation,
                    description: `Rotate Image ${deltaDegrees.toFixed(2)}°`,
                });

                return {
                    xAxis: newXAxis,
                    yAxes: newYAxes,
                    series: updatedSeries,
                    singlePoints: newSinglePoints,
                    pendingCalibrationPoint: newPendingPoint,
                    imageRotation: nextRotation,
                    history: newHistory,
                    historyIndex: newHistory.length - 1,
                    mode: active.mode === 'CALIBRATE_X' || active.mode === 'CALIBRATE_Y' ? 'IDLE' : active.mode,
                };
            }));
        } catch (e) {
            console.error(e);
            get().openModal({ type: 'alert', message: 'Failed to rotate image. Please try reloading the file.' });
        }
    },

    rotateImageClockwise: async () => {
        await get().rotateImageByDegrees(90);
    },

    setImageRotation: async (degrees) => {
        if (!Number.isFinite(degrees)) return;
        const state = get();
        const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
        if (!ws) return;
        const normalizedTarget = normalizeRotation(degrees);
        const delta = normalizedTarget - normalizeRotation(ws.imageRotation);
        if (Math.abs(delta) < 0.0001) return;
        await get().rotateImageByDegrees(delta);
    },
});
