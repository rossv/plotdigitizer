import type { StoreSlice, Workspace, WorkspaceSlice } from '../types';
import { createInitialWorkspace, updateActiveWorkspace } from '../utils';
import { detectAxes } from '../../utils/autoDetect';
import { calculateCalibration } from '../../utils/math';
import { recognizeText } from '../../utils/ocr';

const initWs = createInitialWorkspace('Workspace 1');

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

    loadProject: (projectData) => set((state) => {
        // Detect if legacy or new format
        let newWorkspaces: Workspace[] = [];
        let newActiveId = '';

        if (Array.isArray(projectData.workspaces)) {
            // New format
            newWorkspaces = projectData.workspaces;
            newActiveId = projectData.activeWorkspaceId || newWorkspaces[0]?.id;
        } else {
            // Legacy format - Convert to single workspace
            const ws = createInitialWorkspace('Imported Project');
            // legacy fields: xAxis, yAxes, series, imageUrl, etc.
            Object.keys(projectData).forEach(key => {
                if (key in ws && key !== 'id' && key !== 'name') {
                    // @ts-ignore
                    ws[key] = projectData[key];
                }
            });
            // Ensure history is initialized
            ws.history = [{ series: ws.series, yAxes: ws.yAxes, description: 'Initial State' }];
            ws.historyIndex = 0;

            newWorkspaces = [ws];
            newActiveId = ws.id;
        }

        return {
            workspaces: newWorkspaces,
            activeWorkspaceId: newActiveId,
            theme: projectData.theme || state.theme
        };
    }),

    setImageUrl: (url) => set(state => updateActiveWorkspace(state, () => ({ imageUrl: url }))),

    setMode: (mode) => set(state => updateActiveWorkspace(state, () => ({ mode, pendingCalibrationPoint: null }))),

    autoDetectAxes: async () => {
        const state = get();
        const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
        if (!ws || !ws.imageUrl) return;

        try {
            const result = await detectAxes(ws.imageUrl);

            const roiSize = { w: 60, h: 30 };
            const padding = 5;

            const xP1Roi = { x: result.xAxis.p1.x - roiSize.w / 2, y: result.xAxis.p1.y + padding, w: roiSize.w, h: roiSize.h };
            const xP2Roi = { x: result.xAxis.p2.x - roiSize.w / 2, y: result.xAxis.p2.y + padding, w: roiSize.w, h: roiSize.h };
            const yP1Roi = { x: result.yAxis.p1.x - roiSize.w - padding, y: result.yAxis.p1.y - roiSize.h / 2, w: roiSize.w, h: roiSize.h };
            const yP2Roi = { x: result.yAxis.p2.x - roiSize.w - padding, y: result.yAxis.p2.y - roiSize.h / 2, w: roiSize.w, h: roiSize.h };

            const xMid = (result.xAxis.p1.x + result.xAxis.p2.x) / 2;
            const xLabelRoi = { x: xMid - 100, y: result.xAxis.p1.y + 35, w: 200, h: 40 };

            const yMid = (result.yAxis.p1.y + result.yAxis.p2.y) / 2;
            const yLabelRoi = { x: result.yAxis.p1.x - 80, y: yMid - 100, w: 50, h: 200 };

            const [x1Str, x2Str, y1Str, y2Str, xName, yName] = await Promise.all([
                recognizeText(ws.imageUrl, xP1Roi, { whitelist: '0123456789.-' }),
                recognizeText(ws.imageUrl, xP2Roi, { whitelist: '0123456789.-' }),
                recognizeText(ws.imageUrl, yP1Roi, { whitelist: '0123456789.-' }),
                recognizeText(ws.imageUrl, yP2Roi, { whitelist: '0123456789.-' }),
                recognizeText(ws.imageUrl, xLabelRoi),
                recognizeText(ws.imageUrl, yLabelRoi),
            ]);

            const parseVal = (s: string) => {
                const clean = s.replace(/[^0-9.-]/g, '');
                const n = parseFloat(clean);
                return isNaN(n) ? NaN : n;
            };

            const xP1 = { px: parseFloat(String(result.xAxis.p1.x)), py: parseFloat(String(result.xAxis.p1.y)), val: parseVal(x1Str) };
            const xP2 = { px: parseFloat(String(result.xAxis.p2.x)), py: parseFloat(String(result.xAxis.p2.y)), val: parseVal(x2Str) };
            const yP1 = { px: parseFloat(String(result.yAxis.p1.x)), py: parseFloat(String(result.yAxis.p1.y)), val: parseVal(y1Str) };
            const yP2 = { px: parseFloat(String(result.yAxis.p2.x)), py: parseFloat(String(result.yAxis.p2.y)), val: parseVal(y2Str) };

            set(state => updateActiveWorkspace(state, (ws) => {
                let newXAxis = { ...ws.xAxis, p1: xP1, p2: xP2, slope: null as number | null, intercept: null as number | null };
                const newXAxisName = (xName && xName.length > 1) ? xName.replace(/[\n\r]/g, ' ').trim() : ws.xAxisName;

                if (!isNaN(xP1.val) && !isNaN(xP2.val)) {
                    try {
                        let px1 = xP1.px;
                        let px2 = xP2.px;
                        if (Math.abs(px1 - px2) < 0.1) px2 += 1;
                        const { slope, intercept } = calculateCalibration(px1, xP1.val, px2, xP2.val, newXAxis.isLog);
                        newXAxis.slope = slope;
                        newXAxis.intercept = intercept;
                    } catch (e) {
                        console.warn("Auto-calibration X failed", e);
                    }
                }

                const newYAxes = ws.yAxes.map(y => {
                    if (y.id === ws.activeYAxisId) {
                        let newCalib = { ...y.calibration, p1: yP1, p2: yP2, slope: null as number | null, intercept: null as number | null };
                        let newName = y.name;
                        if (yName && yName.length > 1) {
                            newName = yName.replace(/[\n\r]/g, ' ').trim();
                        }
                        if (!isNaN(yP1.val) && !isNaN(yP2.val)) {
                            try {
                                let py1 = yP1.py;
                                let py2 = yP2.py;
                                if (Math.abs(py1 - py2) < 0.1) py2 += 1;
                                const { slope, intercept } = calculateCalibration(py1, yP1.val, py2, yP2.val, newCalib.isLog);
                                newCalib.slope = slope;
                                newCalib.intercept = intercept;
                            } catch (e) {
                                console.warn("Auto-calibration Y failed", e);
                            }
                        }
                        return { ...y, name: newName, calibration: newCalib };
                    }
                    return y;
                });

                return {
                    xAxis: newXAxis,
                    xAxisName: newXAxisName,
                    yAxes: newYAxes,
                    mode: 'IDLE',
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
});
