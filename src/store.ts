import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppMode, AxisCalibration, Point, Series, YAxisDefinition, CurveFitConfig, SnapConfig } from './types';
import { calculateCalibration, pixelToData, dataToPixel } from './utils/math';
import { fitLinear, fitPolynomial, fitExponential, findBestFit, generatePointsFromPredict } from './utils/curveFit';
import { detectAxes } from './utils/autoDetect';
import { recognizeText } from './utils/ocr';

// --- Types ---

export type ModalType = 'alert' | 'confirm' | 'prompt';

export interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title?: string;
  message: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
}



interface Workspace {
  id: string; // Unique ID for the workspace
  name: string; // Tab Name

  imageUrl: string | null;
  mode: AppMode;

  xAxis: AxisCalibration;
  xAxisName: string;

  yAxes: YAxisDefinition[];
  activeYAxisId: string;

  series: Series[];
  activeSeriesId: string;

  // Specific UI state that should be per-workspace
  pendingCalibrationPoint: { axis: 'X' | 'Y'; step: 1 | 2; px: number; py: number } | null;

  singlePoints: Point[]; // Independent graphical points

  // Undo/Redo history
  history: { series: Series[]; yAxes: YAxisDefinition[]; description: string }[];
  historyIndex: number;

  selectedPointIds: string[];
}

interface StoreState {
  // Global State
  theme: 'light' | 'dark';
  workspaces: Workspace[];
  activeWorkspaceId: string;
  modal: ModalState;

  // Global Actions
  toggleTheme: () => void;
  addWorkspace: () => void;
  removeWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;
  updateWorkspaceName: (id: string, name: string) => void;
  loadProject: (projectData: any) => void; // Handles complex loading

  openModal: (params: Omit<ModalState, 'isOpen'>) => void;
  closeModal: () => void;

  // Workspace Actions (operate on active workspace)
  setImageUrl: (url: string | null) => void;
  setMode: (mode: AppMode) => void;

  setXAxisName: (name: string) => void;
  setXAxisPoint: (step: 1 | 2, px: number, py: number, val: number) => void;
  toggleXAxisLog: () => void;

  addYAxis: () => void;
  deleteYAxis: (id: string) => void;
  setActiveYAxis: (id: string) => void;
  updateYAxisName: (id: string, name: string) => void;
  setYAxisPoint: (step: 1 | 2, px: number, py: number, val: number) => void;
  toggleYAxisLog: (axisId?: string) => void;

  addSeries: () => void;
  setActiveSeries: (id: string) => void;
  setSeriesYAxis: (seriesId: string, axisId: string) => void;
  updateSeriesName: (id: string, name: string) => void;
  updateSeriesColor: (id: string, color: string) => void;
  clearSeriesPoints: (id: string) => void;
  setSeriesFitConfig: (seriesId: string, config: Partial<CurveFitConfig>) => void;
  toggleSeriesLabels: (seriesId: string) => void;

  setPendingCalibrationPoint: (point: { axis: 'X' | 'Y'; step: 1 | 2; px: number; py: number } | null) => void;
  startCalibration: (axis: 'X' | 'Y', axisId?: string) => void;
  confirmCalibrationPoint: (val: number) => void;

  addPoint: (px: number, py: number) => void;
  addSinglePoint: (px: number, py: number) => void;
  addPoints: (points: { px: number; py: number }[]) => void;
  deletePoint: (pointId: string) => void;

  undo: () => void;
  redo: () => void;
  jumpToHistory: (index: number) => void;

  updateCalibrationPointPosition: (
    axisType: 'X' | 'Y',
    axisId: string | null,
    pointIndex: 1 | 2,
    newPx: number,
    newPy: number
  ) => void;

  updateCalibrationPointValue: (
    axisType: 'X' | 'Y',
    axisId: string | null,
    pointIndex: 1 | 2,
    newValue: number
  ) => void;

  updateSeriesLabelPosition: (seriesId: string, position: { x: number; y: number } | undefined) => void;

  // Selection & Editing
  selectPoints: (ids: string[], append?: boolean) => void;
  togglePointSelection: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  deleteSelectedPoints: () => void;
  updatePointPosition: (pointId: string, px: number, py: number) => void;
  nudgeSelection: (dx: number, dy: number) => void;
  snapSeriesPoints: (seriesId: string, config: SnapConfig) => void;
  snapSeriesToFit: (seriesId: string) => void;
  toggleSeriesPointCoordinates: (seriesId: string) => void;
  resampleActiveSeries: (count: number) => void;
  autoDetectAxes: () => Promise<void>;
}

// --- Helpers ---

const initialAxis: AxisCalibration = {
  p1: null,
  p2: null,
  isLog: false,
  slope: null,
  intercept: null,
};

const SERIES_PALETTE = [
  '#10b981', // Emerald 500
  '#f59e0b', // Amber 500
  '#8b5cf6', // Violet 500
  '#ec4899', // Pink 500
  '#06b6d4', // Cyan 500
  '#84cc16', // Lime 500
  '#6366f1', // Indigo 500
];

const getRandomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;


const defaultYAxisId = 'y-axis-1';

// Helper to recalculate fit for a series
const updateSeriesFit = (series: Series): Series => {
  if (!series.fitConfig.enabled || series.points.length < 2) {
    if (!series.fitResult && series.points.every(p => p.fittedY === undefined)) {
      return series;
    }
    return {
      ...series,
      fitResult: undefined,
      points: series.points.map(p => ({ ...p, fittedY: undefined }))
    };
  }

  const { type, order, interceptMode } = series.fitConfig;
  let constraintY: number | undefined = undefined;

  if (interceptMode === 'zero') {
    constraintY = 0;
  } else if (interceptMode === 'firstPoint' && series.points.length > 0) {
    const firstPoint = series.points[0];
    if (firstPoint.dataY !== undefined) {
      constraintY = firstPoint.dataY;
    }
  }

  let result = null;
  try {
    if (type === 'linear') result = fitLinear(series.points, constraintY);
    else if (type === 'polynomial') result = fitPolynomial(series.points, order, constraintY);
    else if (type === 'exponential') result = fitExponential(series.points, constraintY);
  } catch (e) {
    console.error('Fit calculation failed', e);
  }

  if (!result) {
    return {
      ...series,
      fitResult: undefined,
      points: series.points.map(p => ({ ...p, fittedY: undefined }))
    };
  }

  const updatedPoints = series.points.map(p => ({
    ...p,
    fittedY: p.dataX !== undefined ? result.predict(p.dataX) : undefined
  }));

  return {
    ...series,
    fitResult: result,
    points: updatedPoints
  };
};

const createInitialWorkspace = (name: string): Workspace => ({
  id: uuidv4(),
  name,
  imageUrl: null,
  mode: 'IDLE',
  xAxis: { ...initialAxis },
  xAxisName: 'X Axis',
  yAxes: [
    {
      id: defaultYAxisId,
      name: 'Y Axis 1',
      color: '#ef4444',
      calibration: { ...initialAxis }
    }
  ],
  activeYAxisId: defaultYAxisId,
  series: [
    {
      id: 'series-1',
      name: 'Series 1',
      color: SERIES_PALETTE[0],
      points: [],
      yAxisId: defaultYAxisId,
      fitConfig: { enabled: false, type: 'linear', interceptMode: 'auto' },
      showLabels: false,
      showPointCoordinates: false,
    },
  ],
  activeSeriesId: 'series-1',
  singlePoints: [],
  pendingCalibrationPoint: null,
  history: [
    {
      series: [
        {
          id: 'series-1',
          name: 'Series 1',
          color: SERIES_PALETTE[0],
          points: [],
          yAxisId: defaultYAxisId,
          fitConfig: { enabled: false, type: 'linear', interceptMode: 'auto' },
          showLabels: false,
          showPointCoordinates: false,
        },
      ],
      yAxes: [
        {
          id: defaultYAxisId,
          name: 'Y Axis 1',
          color: '#ef4444',
          calibration: { ...initialAxis }
        }
      ],
      description: 'Initial State'
    }
  ],
  historyIndex: 0,
  selectedPointIds: [],
});

// Helper to update the active workspace
const updateActiveWorkspace = (state: StoreState, updater: (ws: Workspace) => Partial<Workspace>): Partial<StoreState> => {
  const activeWsIndex = state.workspaces.findIndex(w => w.id === state.activeWorkspaceId);
  if (activeWsIndex === -1) return {};

  const activeWs = state.workspaces[activeWsIndex];
  const updates = updater(activeWs);

  const newWs = { ...activeWs, ...updates };
  const newWorkspaces = [...state.workspaces];
  newWorkspaces[activeWsIndex] = newWs;

  return { workspaces: newWorkspaces };
};

export const useStore = create<StoreState>((set, get) => ({
  // Global State
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  workspaces: [createInitialWorkspace('Workspace 1')],
  activeWorkspaceId: '', // Set in init below? No, easy to set default.
  modal: {
    isOpen: false,
    type: 'alert',
    message: '',
  },

  // Set initial active ID after creation
  // logic to ensure ID matches the first workspace

  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    return { theme: newTheme };
  }),

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
      // Ensure history is initialized with the current state
      ws.history = [{ series: ws.series, yAxes: ws.yAxes, description: 'Initial State' }];
      ws.historyIndex = 0;

      newWorkspaces = [...state.workspaces, ws]; // Add as new tab? Or replace? 
      // User request said "saving or loading a project is effective for all workspaces"
      // This implies loading a project REPLACES the current session or adds to it? 
      // Usually "Load Project" replaces the current state.
      // But if standard behavior, we might want to replace.
      // The previous implementation replaced everything.
      // Let's assume Load Project replaces All Workspaces if it's a full project file.
      // But if it's a legacy file, let's treat it as a "Full Project" that just happens to have one workspace.

      return {
        workspaces: [ws],
        activeWorkspaceId: ws.id,
        theme: projectData.theme || state.theme
      };
    }

    return {
      workspaces: newWorkspaces,
      activeWorkspaceId: newActiveId,
      theme: projectData.theme || state.theme
    };
  }),

  openModal: (params) => set({ modal: { ...params, isOpen: true } }),
  closeModal: () => set({ modal: { isOpen: false, type: 'alert', message: '' } }),

  // --- Workspace Actions ---

  setImageUrl: (url) => set(state => updateActiveWorkspace(state, () => ({ imageUrl: url }))),

  setMode: (mode) => set(state => updateActiveWorkspace(state, () => ({ mode, pendingCalibrationPoint: null }))),

  setPendingCalibrationPoint: (point) => set(state => updateActiveWorkspace(state, () => ({ pendingCalibrationPoint: point }))),

  startCalibration: (axis, axisId) => set(state => updateActiveWorkspace(state, (ws) => {
    if (axis === 'X') {
      return {
        mode: 'CALIBRATE_X',
        xAxis: { ...ws.xAxis, p1: null, p2: null, slope: null, intercept: null },
        pendingCalibrationPoint: null
      };
    } else {
      const updatedYAxes = ws.yAxes.map(y => {
        if (axisId && y.id !== axisId) return y;
        // If axisId is provided, reset only that axis. If not (shouldn't happen for Y), reset active? 
        // Logic in UI calls this with specific ID.
        return { ...y, calibration: { ...y.calibration, p1: null, p2: null, slope: null, intercept: null } };
      });
      return {
        mode: 'CALIBRATE_Y',
        yAxes: updatedYAxes,
        activeYAxisId: axisId || ws.activeYAxisId,
        pendingCalibrationPoint: null
      };
    }
  })),

  confirmCalibrationPoint: (val) => set(state => updateActiveWorkspace(state, (ws) => {
    const p = ws.pendingCalibrationPoint;
    if (!p) return {};

    if (p.axis === 'X') {
      const newAxis = { ...ws.xAxis } as AxisCalibration;
      if (p.step === 1) newAxis.p1 = { px: p.px, py: p.py, val };
      if (p.step === 2) newAxis.p2 = { px: p.px, py: p.py, val };

      if (p.step === 2 && newAxis.p1 && newAxis.p2) {
        try {
          const { slope, intercept } = calculateCalibration(
            newAxis.p1.px, newAxis.p1.val,
            newAxis.p2.px, newAxis.p2.val,
            newAxis.isLog
          );
          newAxis.slope = slope;
          newAxis.intercept = intercept;

          // Recalculate all points based on new X calibration
          const updatedSeries = ws.series.map(s => {
            const yAxis = ws.yAxes.find(y => y.id === s.yAxisId)?.calibration;
            // We need both axes to be valid to calculate data points. 
            // If Y is not calibrated yet, we can't fully calculate, but X part is updated.
            // Actually pixelToData returns null if ANY axis is missing.
            // But maybe we should try to update X even if Y is missing? 
            // Existing logic in pixelToData checks all slopes/intercepts.
            // So if Y is not ready, points dataX/dataY become undefined/outdated? 
            // Actually pixelToData returns null, so we might lose dataX/Y if Y isn't ready.
            // But if we are Recalibrating X, Y might be ready.

            // If Y is ready, we recalculate.
            const updatedPoints = s.points.map(pt => {
              const coords = pixelToData(pt.x, pt.y, newAxis, yAxis || { ...initialAxis });
              return coords ? { ...pt, dataX: coords.x, dataY: coords.y } : pt;
            });
            return updateSeriesFit({ ...s, points: updatedPoints });
          });

          return { xAxis: newAxis, pendingCalibrationPoint: null, mode: 'IDLE', series: updatedSeries };
        } catch (e) {
          console.error(e);
        }
      }
      return { xAxis: newAxis, pendingCalibrationPoint: null };
    } else {
      const updatedYAxes = ws.yAxes.map((axis) => {
        if (axis.id !== ws.activeYAxisId) return axis;

        const newCalibration = { ...axis.calibration } as AxisCalibration;
        if (p.step === 1) newCalibration.p1 = { px: p.px, py: p.py, val };
        if (p.step === 2) newCalibration.p2 = { px: p.px, py: p.py, val };

        if (p.step === 2 && newCalibration.p1 && newCalibration.p2) {
          try {
            const { slope, intercept } = calculateCalibration(
              newCalibration.p1.py, newCalibration.p1.val,
              newCalibration.p2.py, newCalibration.p2.val,
              newCalibration.isLog
            );
            newCalibration.intercept = intercept;
            newCalibration.slope = slope;
          } catch (e) {
            console.error(e);
          }
        }
        return { ...axis, calibration: newCalibration };
      });

      const activeAxis = updatedYAxes.find(a => a.id === ws.activeYAxisId);
      const isComplete = p.step === 2 && activeAxis?.calibration.p1 && activeAxis?.calibration.p2;

      let extraUpdates = {};

      if (isComplete && activeAxis) {
        // Recalculate points
        const updatedSeries = ws.series.map(s => {
          // We need to know which Y axis this series uses.
          const seriesYAxis = updatedYAxes.find(y => y.id === s.yAxisId)?.calibration;
          const updatedPoints = s.points.map(pt => {
            const coords = pixelToData(pt.x, pt.y, ws.xAxis, seriesYAxis || { ...initialAxis });
            return coords ? { ...pt, dataX: coords.x, dataY: coords.y } : pt;
          });
          return updateSeriesFit({ ...s, points: updatedPoints });
        });
        extraUpdates = { series: updatedSeries, mode: 'IDLE' };
      }

      return {
        yAxes: updatedYAxes,
        pendingCalibrationPoint: null,
        ...extraUpdates
      };
    }
  })),

  // Default initializers for non-primitive arguments
  setXAxisName: (name) => set(state => updateActiveWorkspace(state, () => ({ xAxisName: name }))),
  setXAxisPoint: () => { },

  toggleXAxisLog: () => set(state => updateActiveWorkspace(state, (ws) => {
    const newIsLog = !ws.xAxis.isLog;
    const newXAxis = { ...ws.xAxis, isLog: newIsLog };

    // If fully calibrated, recalculate params and points
    if (newXAxis.p1 && newXAxis.p2) {
      try {
        const { slope, intercept } = calculateCalibration(
          newXAxis.p1.px, newXAxis.p1.val,
          newXAxis.p2.px, newXAxis.p2.val,
          newXAxis.isLog
        );
        newXAxis.slope = slope;
        newXAxis.intercept = intercept;

        // Recalculate all points
        const updatedSeries = ws.series.map(s => {
          const yAxis = ws.yAxes.find(y => y.id === s.yAxisId)?.calibration;
          const updatedPoints = s.points.map(pt => {
            const coords = pixelToData(pt.x, pt.y, newXAxis, yAxis || { ...initialAxis });
            return coords ? { ...pt, dataX: coords.x, dataY: coords.y } : pt;
          });
          return updateSeriesFit({ ...s, points: updatedPoints });
        });

        return { xAxis: newXAxis, series: updatedSeries };
      } catch (e) {
        console.error("Failed to recalculate X calibration on toggle", e);
        return { xAxis: newXAxis };
      }
    }
    return { xAxis: newXAxis };
  })),

  addYAxis: () => set(state => updateActiveWorkspace(state, (ws) => {
    const id = uuidv4();
    return {
      yAxes: [...ws.yAxes, {
        id,
        name: `Y Axis ${ws.yAxes.length + 1}`,
        color: getRandomColor(),
        calibration: { ...initialAxis }
      }],
      activeYAxisId: id
    };
  })),

  deleteYAxis: (id) => set(state => updateActiveWorkspace(state, (ws) => {
    if (ws.yAxes.length <= 1) return {};
    const newAxes = ws.yAxes.filter(a => a.id !== id);
    const fallbackAxisId = newAxes[0].id; // Fallback
    const updatedSeries = ws.series.map(s => s.yAxisId === id ? { ...s, yAxisId: fallbackAxisId } : s);
    const finalSeries = updatedSeries.map(s => updateSeriesFit(s));

    return {
      yAxes: newAxes,
      activeYAxisId: ws.activeYAxisId === id ? fallbackAxisId : ws.activeYAxisId,
      series: finalSeries
    };
  })),

  setActiveYAxis: (id) => set(state => updateActiveWorkspace(state, () => ({ activeYAxisId: id }))),

  updateYAxisName: (id, name) => set(state => updateActiveWorkspace(state, (ws) => ({
    yAxes: ws.yAxes.map(axis => axis.id === id ? { ...axis, name } : axis)
  }))),

  setYAxisPoint: () => { },

  toggleYAxisLog: (axisId) => set(state => updateActiveWorkspace(state, (ws) => {
    const targetId = axisId || ws.activeYAxisId;

    // 1. Update the axis
    const updatedYAxes = ws.yAxes.map(axis => {
      if (axis.id !== targetId) return axis;

      const newIsLog = !axis.calibration.isLog;
      const newCal = { ...axis.calibration, isLog: newIsLog };

      if (newCal.p1 && newCal.p2) {
        try {
          const { slope, intercept } = calculateCalibration(
            newCal.p1.py, newCal.p1.val,
            newCal.p2.py, newCal.p2.val,
            newCal.isLog
          );
          newCal.slope = slope;
          newCal.intercept = intercept;
        } catch (e) {
          console.error("Failed to recalculate Y calibration on toggle", e);
        }
      }
      return { ...axis, calibration: newCal };
    });

    // 2. Recalculate points for series using this axis
    const changedAxis = updatedYAxes.find(a => a.id === targetId);
    if (!changedAxis || !changedAxis.calibration.p1 || !changedAxis.calibration.p2) {
      return { yAxes: updatedYAxes };
    }

    const updatedSeries = ws.series.map(s => {
      if (s.yAxisId !== targetId) return s;

      const updatedPoints = s.points.map(pt => {
        const coords = pixelToData(pt.x, pt.y, ws.xAxis, changedAxis.calibration);
        return coords ? { ...pt, dataX: coords.x, dataY: coords.y } : pt;
      });
      return updateSeriesFit({ ...s, points: updatedPoints });
    });

    return { yAxes: updatedYAxes, series: updatedSeries };
  })),

  addSeries: () => set(state => updateActiveWorkspace(state, (ws) => {
    const id = `series-${ws.series.length + 1}`;
    return {
      series: [
        ...ws.series,
        {
          id,
          name: `Series ${ws.series.length + 1}`,
          color: SERIES_PALETTE[ws.series.length % SERIES_PALETTE.length] || getRandomColor(),
          points: [],
          yAxisId: ws.activeYAxisId || ws.yAxes[0].id,
          fitConfig: { enabled: false, type: 'linear', interceptMode: 'auto' },
          showLabels: false,
          showPointCoordinates: false,
        },
      ],
      activeSeriesId: id,
    };
  })),

  setActiveSeries: (id) => set(state => updateActiveWorkspace(state, () => ({ activeSeriesId: id }))),

  setSeriesYAxis: (seriesId, axisId) => set(state => updateActiveWorkspace(state, (ws) => {
    const yAxis = ws.yAxes.find(y => y.id === axisId)?.calibration;
    const updatedSeries = ws.series.map(s => {
      if (s.id !== seriesId) return s;
      let updatedPoints = s.points;
      if (yAxis) {
        updatedPoints = s.points.map(p => {
          const coords = pixelToData(p.x, p.y, ws.xAxis, yAxis);
          if (coords) {
            return { ...p, dataX: coords.x, dataY: coords.y };
          }
          return p;
        });
      }
      return updateSeriesFit({ ...s, yAxisId: axisId, points: updatedPoints });
    });
    return { series: updatedSeries };
  })),

  updateSeriesName: (id, name) => set(state => updateActiveWorkspace(state, (ws) => ({
    series: ws.series.map(s => s.id === id ? { ...s, name } : s)
  }))),

  updateSeriesColor: (id, color) => set(state => updateActiveWorkspace(state, (ws) => ({
    series: ws.series.map(s => s.id === id ? { ...s, color } : s)
  }))),

  clearSeriesPoints: (id) => set(state => updateActiveWorkspace(state, (ws) => {
    const updatedSeries = ws.series.map((s) => {
      if (s.id !== id) return s;
      return updateSeriesFit({ ...s, points: [] });
    });
    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Clear Series Points' });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  setSeriesFitConfig: (seriesId, config) => set(state => updateActiveWorkspace(state, (ws) => {
    const updatedSeries = ws.series.map(s => {
      if (s.id !== seriesId) return s;
      const newConfig = { ...s.fitConfig, ...config };
      return updateSeriesFit({ ...s, fitConfig: newConfig });
    });
    return { series: updatedSeries };
  })),

  toggleSeriesLabels: (seriesId) => set(state => updateActiveWorkspace(state, (ws) => ({
    series: ws.series.map((s) => s.id === seriesId ? { ...s, showLabels: !s.showLabels } : s),
  }))),

  toggleSeriesPointCoordinates: (seriesId) => set(state => updateActiveWorkspace(state, (ws) => ({
    series: ws.series.map((s) => s.id === seriesId ? { ...s, showPointCoordinates: !s.showPointCoordinates } : s),
  }))),

  resampleActiveSeries: (count) => set(state => updateActiveWorkspace(state, (ws) => {
    const activeSeries = ws.series.find(s => s.id === ws.activeSeriesId);
    if (!activeSeries || activeSeries.points.length < 2) return {};

    const points = activeSeries.points.filter(p => p.dataX !== undefined && p.dataY !== undefined);
    if (points.length < 2) return {};

    // 1. Find Best Fit
    const bestFit = findBestFit(points);
    if (!bestFit) return {};

    // 2. Generate New Points
    // Determine Range
    const xValues = points.map(p => p.dataX!).sort((a, b) => a - b);
    const minX = xValues[0];
    const maxX = xValues[xValues.length - 1];

    const newPointsData = generatePointsFromPredict(
      bestFit.result.predict,
      minX,
      maxX,
      count,
      activeSeries.id
    );

    // 3. Convert Data to Pixel
    // We need the Y axis.
    const yAxis = ws.yAxes.find(y => y.id === activeSeries.yAxisId)?.calibration;
    if (!yAxis) return {};

    const newPoints: Point[] = newPointsData.map(p => {
      const pixel = dataToPixel(p.dataX!, p.dataY!, ws.xAxis, yAxis);
      return {
        ...p,
        x: pixel?.x || 0,
        y: pixel?.y || 0
      };
    });

    // 4. Update Series
    const updatedSeries = ws.series.map(s => {
      if (s.id !== activeSeries.id) return s;
      return updateSeriesFit({
        ...s,
        fitConfig: {
          enabled: true,
          type: bestFit.config.type,
          order: bestFit.config.order,
          interceptMode: 'auto' // Defaulting to auto, maybe could infer?
        },
        points: newPoints
      });
    });

    // 5. Check/Add History
    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Resample Series' });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  addPoint: (px, py) => set(state => updateActiveWorkspace(state, (ws) => {
    const activeSeries = ws.series.find((s) => s.id === ws.activeSeriesId);
    if (!activeSeries) return {};

    const yAxis = ws.yAxes.find(y => y.id === activeSeries.yAxisId)?.calibration;
    if (!yAxis) return {};

    const coords = pixelToData(px, py, ws.xAxis, yAxis);
    if (!coords) return {};

    const newPoint: Point = {
      id: uuidv4(),
      x: px,
      y: py,
      seriesId: ws.activeSeriesId,
      dataX: coords.x,
      dataY: coords.y,
    };

    const updatedSeries = ws.series.map((s) => {
      if (s.id === ws.activeSeriesId) {
        const newSeries = { ...s, points: [...s.points, newPoint].sort((a, b) => (a.dataX || 0) - (b.dataX || 0)) };
        return updateSeriesFit(newSeries);
      }
      return s;
    });

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Add Point' });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  addSinglePoint: (px, py) => set(state => updateActiveWorkspace(state, (ws) => {
    // Determine which Y axis to use. Use active Y axis.
    const activeAxisId = ws.activeYAxisId || (ws.yAxes[0] ? ws.yAxes[0].id : null);
    if (!activeAxisId) return {};

    const yAxis = ws.yAxes.find(y => y.id === activeAxisId)?.calibration;
    if (!yAxis) return {};

    const coords = pixelToData(px, py, ws.xAxis, yAxis);
    if (!coords) return {};

    const newPoint: Point = {
      id: uuidv4(),
      x: px,
      y: py,
      seriesId: 'single-point', // Special ID
      dataX: coords.x,
      dataY: coords.y,
    };

    return {
      singlePoints: [...ws.singlePoints, newPoint]
    };
  })),

  addPoints: (points) => set(state => updateActiveWorkspace(state, (ws) => {
    const activeSeries = ws.series.find((s) => s.id === ws.activeSeriesId);
    if (!activeSeries) return {};

    const yAxis = ws.yAxes.find(y => y.id === activeSeries.yAxisId)?.calibration;
    if (!yAxis) return {};

    const newPoints: Point[] = [];
    for (const { px, py } of points) {
      const coords = pixelToData(px, py, ws.xAxis, yAxis);
      if (!coords) continue;
      newPoints.push({
        id: uuidv4(),
        x: px,
        y: py,
        seriesId: ws.activeSeriesId,
        dataX: coords.x,
        dataY: coords.y,
      });
    }

    if (newPoints.length === 0) return {};

    const updatedSeries = ws.series.map((s) => {
      if (s.id === ws.activeSeriesId) {
        const newSeries = { ...s, points: [...s.points, ...newPoints].sort((a, b) => (a.dataX || 0) - (b.dataX || 0)) };
        return updateSeriesFit(newSeries);
      }
      return s;
    });

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Add Points' });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  deletePoint: (pointId) => set(state => updateActiveWorkspace(state, (ws) => {
    // Check single points first
    if (ws.singlePoints.some(p => p.id === pointId)) {
      return {
        singlePoints: ws.singlePoints.filter(p => p.id !== pointId)
      };
    }

    const updatedSeries = ws.series.map((s) => {
      const hasPoint = s.points.some(p => p.id === pointId);
      if (!hasPoint) return s;
      const newSeries = {
        ...s,
        points: s.points.filter((p) => p.id !== pointId),
      };
      return updateSeriesFit(newSeries);
    });

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Delete Point' });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  autoDetectAxes: async () => {
    const state = get();
    const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
    if (!ws || !ws.imageUrl) return;

    try {
      // state.openModal({ type: 'alert', message: 'Detecting axes... please wait.' });

      const result = await detectAxes(ws.imageUrl);

      // state.openModal({ type: 'alert', message: 'Axes detected. Reading values...' });

      // Helper to define ROI
      // Standard: 
      // X Axis: Numbers are below the axis.
      // Y Axis: Numbers are to the left of the axis.

      const roiSize = { w: 60, h: 30 }; // Approx box size
      const padding = 5;

      // X1: Origin (Left). Number is likely just below, slightly left? 
      // If X axis is detected, let's look below P1 and P2.
      const xP1Roi = {
        x: result.xAxis.p1.x - roiSize.w / 2,
        y: result.xAxis.p1.y + padding,
        w: roiSize.w,
        h: roiSize.h
      };
      const xP2Roi = {
        x: result.xAxis.p2.x - roiSize.w / 2,
        y: result.xAxis.p2.y + padding,
        w: roiSize.w,
        h: roiSize.h
      };

      // Y1: Origin (Bottom). Number is left.
      const yP1Roi = {
        x: result.yAxis.p1.x - roiSize.w - padding,
        y: result.yAxis.p1.y - roiSize.h / 2,
        w: roiSize.w,
        h: roiSize.h
      };
      const yP2Roi = {
        x: result.yAxis.p2.x - roiSize.w - padding,
        y: result.yAxis.p2.y - roiSize.h / 2,
        w: roiSize.w,
        h: roiSize.h
      };

      // OCR to find Labels
      // X Label: Centered below the X axis (roughly).
      // Let's take a wide box below the X axis, centered.
      const xMid = (result.xAxis.p1.x + result.xAxis.p2.x) / 2;
      const xLabelRoi = {
        x: xMid - 100, // 200px width
        y: result.xAxis.p1.y + 35, // Below the numbers (which are ~5-30px below)
        w: 200,
        h: 40
      };

      // Y Label: Centered left of the Y axis.
      // Often rotated. Tesseract might catch it if it's horizontal, but if vertical...
      // Let's try to grab it. If Tesseract sees rotated text, it might read it.
      const yMid = (result.yAxis.p1.y + result.yAxis.p2.y) / 2;
      const yLabelRoi = {
        x: result.yAxis.p1.x - 80, // Far left
        y: yMid - 100, // 200px height
        w: 50, // Narrow vertical strip?
        h: 200
      };

      // Run OCR (Parallel)
      // For numbers: restrict to numbers.
      // For labels: allow all (or alphabet).
      // Note: We need to pass options to recognizeText. I updated recognizeText to take options.
      const [x1Str, x2Str, y1Str, y2Str, xName, yName] = await Promise.all([
        recognizeText(ws.imageUrl, xP1Roi, { whitelist: '0123456789.-' }),
        recognizeText(ws.imageUrl, xP2Roi, { whitelist: '0123456789.-' }),
        recognizeText(ws.imageUrl, yP1Roi, { whitelist: '0123456789.-' }),
        recognizeText(ws.imageUrl, yP2Roi, { whitelist: '0123456789.-' }),
        recognizeText(ws.imageUrl, xLabelRoi), // No whitelist = all chars
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
        // Update X Axis
        let newXAxis = { ...ws.xAxis, p1: xP1, p2: xP2, slope: null as number | null, intercept: null as number | null };
        const newXAxisName = (xName && xName.length > 1) ? xName.replace(/[\n\r]/g, ' ').trim() : ws.xAxisName;


        if (!isNaN(xP1.val) && !isNaN(xP2.val)) {
          try {
            let px1 = xP1.px;
            let px2 = xP2.px;
            if (Math.abs(px1 - px2) < 0.1) px2 += 1; // Prevent coincidence

            const { slope, intercept } = calculateCalibration(px1, xP1.val, px2, xP2.val, newXAxis.isLog);
            newXAxis.slope = slope;
            newXAxis.intercept = intercept;
          } catch (e) {
            console.warn("Auto-calibration X failed", e);
          }
        }

        // Update Active Y Axis
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
                if (Math.abs(py1 - py2) < 0.1) py2 += 1; // Prevent coincidence

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

        // Pass errors to next step via temporary state or just alert here?
        // We are inside set(), we can't side-effect easily. 
        // But we can store errors in the workspace temporarily? No.
        // We can just log. 
        // Actually, we can retarget the opensModal from OUTSIDE set.

        return {
          xAxis: newXAxis,
          xAxisName: newXAxisName,
          yAxes: newYAxes,
          mode: 'IDLE',
          // We can't pass the error string out easily from this reducer-like block.
          // But we can check isCalibrated logic? No.
        };
      }));

      // We need to know if it failed.
      // We can check the state AFTER the update.
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

      // Notify success/warning
      get().openModal({
        type: 'alert',
        message: msg
      });

    } catch (e) {
      console.error(e);
      state.openModal({ type: 'alert', message: 'Failed to detect axes. Please calibrate manually.' });
    }
  },

  undo: () => set(state => updateActiveWorkspace(state, (ws) => {
    // Cannot undo if we are at the initial state (index 0)
    if (ws.historyIndex <= 0) return {};

    const newIndex = ws.historyIndex - 1;

    // Safety check
    if (!ws.history || newIndex >= ws.history.length) {
      return { historyIndex: newIndex };
    }

    return {
      series: ws.history[newIndex].series,
      yAxes: ws.history[newIndex].yAxes,
      historyIndex: newIndex
    };
  })),

  redo: () => set(state => updateActiveWorkspace(state, (ws) => {
    if (!ws.history || ws.historyIndex >= ws.history.length - 1) return {};
    const newIndex = ws.historyIndex + 1;
    return {
      series: ws.history[newIndex].series,
      yAxes: ws.history[newIndex].yAxes,
      historyIndex: newIndex
    };
  })),

  jumpToHistory: (index) => set(state => updateActiveWorkspace(state, (ws) => {
    if (!ws.history || index < 0 || index >= ws.history.length) return {};

    // If index is -1, we are in initial state. Wait, initial state isn't clearly stored? 
    // Actually, history stores *previous* states?
    // Let's look at `undo`.
    // undo sets index = index - 1. 
    // If index = 0, we restore history[0]. 
    // Wait, undo logic:
    // const newIndex = ws.historyIndex - 1;
    // const targetIndex = Math.max(newIndex, 0); <-- This looks suspicious.
    // If I undo from index 0 -> -1. targetIndex = 0. Restores history[0]. 

    // Correction: The `history` array contains *Snapshots after actions*.
    // When we ADD an action, we push to history.
    // So history[0] is state AFTER action 1.
    // Index points to the current state in history.

    // If I am at index 5, and I undo. index becomes 4.
    // We should restore history[4].
    // If I undo from index 0 -> index becomes -1.
    // We can't restore history[-1]. 
    // We probably need to store the *Initial State* or assume if we go past 0 we go to empty?
    // The current undo logic: `const targetIndex = Math.max(newIndex, 0);`
    // If index is -1, it restores `history[0]`. This means checking undo limit is effectively stuck at state 0?
    // Let's verify existing behavior.

    // Existing undo:
    // if (ws.historyIndex < 0) return {};
    // const newIndex = ws.historyIndex - 1;
    // const targetIndex = Math.max(newIndex, 0); // Stops at 0
    // return { series: ws.history[targetIndex].series ... }

    // This implies we can never go back to "empty" if we have history. 
    // It seems the initial empty state is lost if we don't store it.
    // However, I will follow the requested "jump" logic which sets the index.

    // If I jump to index K:
    // historyIndex = K.
    // State restored = history[K].

    // But what if K = -1? 
    // If existing undo doesn't support -1, I won't force it, but "Reverse chronological order" implies I can go back.
    // Let's just implement setting the index and restoring that index.

    if (index === -1) {
      // Cannot easily restore initial state unless we kept it.
      // For now, allow jumping to 0 to N.
      return {};
    }

    return {
      series: ws.history[index].series,
      yAxes: ws.history[index].yAxes,
      historyIndex: index
    };
  })),

  updateCalibrationPointPosition: (axisType, axisId, pointIndex, newPx, newPy) => set(state => updateActiveWorkspace(state, (ws) => {
    if (axisType === 'X') {
      const newAxis = { ...ws.xAxis };
      if (pointIndex === 1 && newAxis.p1) newAxis.p1 = { ...newAxis.p1, px: newPx, py: newPy };
      else if (pointIndex === 2 && newAxis.p2) newAxis.p2 = { ...newAxis.p2, px: newPx, py: newPy };

      if (newAxis.p1 && newAxis.p2) {
        try {
          const { slope, intercept } = calculateCalibration(
            newAxis.p1.px, newAxis.p1.val,
            newAxis.p2.px, newAxis.p2.val,
            newAxis.isLog
          );
          newAxis.slope = slope;
          newAxis.intercept = intercept;

          const updatedSeries = ws.series.map(s => {
            const yAxis = ws.yAxes.find(y => y.id === s.yAxisId)?.calibration;
            const updatedPoints = s.points.map(p => {
              const coords = pixelToData(p.x, p.y, newAxis, yAxis || { ...initialAxis });
              return coords ? { ...p, dataX: coords.x, dataY: coords.y } : p;
            });
            return updateSeriesFit({ ...s, points: updatedPoints });
          });
          return { xAxis: newAxis, series: updatedSeries };

        } catch (e) {
          console.error(e);
          return { xAxis: newAxis };
        }
      }
      return { xAxis: newAxis };
    } else {
      const updatedYAxes = ws.yAxes.map(axis => {
        if (axis.id !== axisId) return axis;
        const newCalib = { ...axis.calibration };
        if (pointIndex === 1 && newCalib.p1) newCalib.p1 = { ...newCalib.p1, px: newPx, py: newPy };
        else if (pointIndex === 2 && newCalib.p2) newCalib.p2 = { ...newCalib.p2, px: newPx, py: newPy };

        if (newCalib.p1 && newCalib.p2) {
          try {
            const { slope, intercept } = calculateCalibration(
              newCalib.p1.py, newCalib.p1.val,
              newCalib.p2.py, newCalib.p2.val,
              newCalib.isLog
            );
            newCalib.intercept = intercept;
            newCalib.slope = slope;
          } catch (e) {
            console.error(e);
          }
        }
        return { ...axis, calibration: newCalib };
      });

      const updatedSeries = ws.series.map(s => {
        if (s.yAxisId !== axisId) return s;
        const yAxis = updatedYAxes.find(y => y.id === axisId)?.calibration;
        const updatedPoints = s.points.map(p => {
          const coords = pixelToData(p.x, p.y, ws.xAxis, yAxis || { ...initialAxis });
          return coords ? { ...p, dataX: coords.x, dataY: coords.y } : p;
        });
        return updateSeriesFit({ ...s, points: updatedPoints });
      });

      return { yAxes: updatedYAxes, series: updatedSeries };
    }
  })),

  updateCalibrationPointValue: (axisType, axisId, pointIndex, newValue) => set(state => updateActiveWorkspace(state, (ws) => {
    if (axisType === 'X') {
      const newAxis = { ...ws.xAxis };
      if (pointIndex === 1 && newAxis.p1) newAxis.p1 = { ...newAxis.p1, val: newValue };
      else if (pointIndex === 2 && newAxis.p2) newAxis.p2 = { ...newAxis.p2, val: newValue };

      if (newAxis.p1 && newAxis.p2) {
        try {
          const { slope, intercept } = calculateCalibration(
            newAxis.p1.px, newAxis.p1.val,
            newAxis.p2.px, newAxis.p2.val,
            newAxis.isLog
          );
          newAxis.slope = slope;
          newAxis.intercept = intercept;

          const updatedSeries = ws.series.map(s => {
            const yAxis = ws.yAxes.find(y => y.id === s.yAxisId)?.calibration;
            const updatedPoints = s.points.map(p => {
              const coords = pixelToData(p.x, p.y, newAxis, yAxis || { ...initialAxis });
              return coords ? { ...p, dataX: coords.x, dataY: coords.y } : p;
            });
            return updateSeriesFit({ ...s, points: updatedPoints });
          });
          return { xAxis: newAxis, series: updatedSeries };

        } catch (e) {
          console.error(e);
          return { xAxis: newAxis };
        }
      }
      return { xAxis: newAxis };
    } else {
      const updatedYAxes = ws.yAxes.map(axis => {
        if (axis.id !== axisId) return axis;
        const newCalib = { ...axis.calibration };
        if (pointIndex === 1 && newCalib.p1) newCalib.p1 = { ...newCalib.p1, val: newValue };
        else if (pointIndex === 2 && newCalib.p2) newCalib.p2 = { ...newCalib.p2, val: newValue };

        if (newCalib.p1 && newCalib.p2) {
          try {
            const { slope, intercept } = calculateCalibration(
              newCalib.p1.py, newCalib.p1.val,
              newCalib.p2.py, newCalib.p2.val,
              newCalib.isLog
            );
            newCalib.intercept = intercept;
            newCalib.slope = slope;
          } catch (e) {
            console.error(e);
          }
        }
        return { ...axis, calibration: newCalib };
      });

      const updatedSeries = ws.series.map(s => {
        if (s.yAxisId !== axisId) return s;
        const yAxis = updatedYAxes.find(y => y.id === axisId)?.calibration;
        const updatedPoints = s.points.map(p => {
          const coords = pixelToData(p.x, p.y, ws.xAxis, yAxis || { ...initialAxis });
          return coords ? { ...p, dataX: coords.x, dataY: coords.y } : p;
        });
        return updateSeriesFit({ ...s, points: updatedPoints });
      });

      return { yAxes: updatedYAxes, series: updatedSeries };
    }
  })),

  updateSeriesLabelPosition: (seriesId, position) => set(state => updateActiveWorkspace(state, (ws) => ({
    series: ws.series.map(s => s.id === seriesId ? { ...s, labelPosition: position } : s)
  }))),

  // --- Selection & Editing ---

  selectPoints: (ids, append = false) => set(state => updateActiveWorkspace(state, (ws) => ({
    selectedPointIds: append ? [...new Set([...ws.selectedPointIds, ...ids])] : ids
  }))),

  togglePointSelection: (id, multi = true) => set(state => updateActiveWorkspace(state, (ws) => {
    const isSelected = ws.selectedPointIds.includes(id);
    let newSelection;
    if (multi) {
      newSelection = isSelected
        ? ws.selectedPointIds.filter(pid => pid !== id)
        : [...ws.selectedPointIds, id];
    } else {
      newSelection = [id];
    }
    return { selectedPointIds: newSelection };
  })),

  clearSelection: () => set(state => updateActiveWorkspace(state, () => ({ selectedPointIds: [] }))),

  deleteSelectedPoints: () => set(state => updateActiveWorkspace(state, (ws) => {
    if (ws.selectedPointIds.length === 0) return {};

    const updatedSeries = ws.series.map(s => {
      // Optimization: check if series has any selected points
      const hasSelected = s.points.some(p => ws.selectedPointIds.includes(p.id));
      if (!hasSelected) return s;

      const newPoints = s.points.filter(p => !ws.selectedPointIds.includes(p.id));
      return updateSeriesFit({ ...s, points: newPoints });
    });

    // Also filter singlePoints
    const updatedSinglePoints = ws.singlePoints.filter(p => !ws.selectedPointIds.includes(p.id));

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Delete Selection' });

    return {
      series: updatedSeries,
      singlePoints: updatedSinglePoints,
      selectedPointIds: [],
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  updatePointPosition: (pointId, px, py) => set(state => updateActiveWorkspace(state, (ws) => {
    // Check single points
    if (ws.singlePoints.some(p => p.id === pointId)) {
      const activeAxisId = ws.activeYAxisId || (ws.yAxes[0] ? ws.yAxes[0].id : null);
      if (!activeAxisId) return {};

      const yAxis = ws.yAxes.find(y => y.id === activeAxisId)?.calibration;
      if (!yAxis) return {};
      const coords = pixelToData(px, py, ws.xAxis, yAxis);
      if (!coords) return {};

      return {
        singlePoints: ws.singlePoints.map(p => p.id === pointId ? { ...p, x: px, y: py, dataX: coords.x, dataY: coords.y } : p)
      };
    }

    // Find series for this point
    let targetSeriesId = '';
    for (const s of ws.series) {
      if (s.points.some(p => p.id === pointId)) {
        targetSeriesId = s.id;
        break;
      }
    }
    if (!targetSeriesId) return {};

    const series = ws.series.find(s => s.id === targetSeriesId);
    if (!series) return {};

    const yAxis = ws.yAxes.find(y => y.id === series.yAxisId)?.calibration;
    const xAxis = ws.xAxis;

    if (!yAxis) return {};

    const coords = pixelToData(px, py, xAxis, yAxis);
    if (!coords) return {};

    const updatedSeries = ws.series.map(s => {
      if (s.id !== targetSeriesId) return s;
      const newPoints = s.points.map(p => {
        if (p.id !== pointId) return p;
        return {
          ...p,
          x: px,
          y: py,
          dataX: coords.x,
          dataY: coords.y
        };
      }).sort((a, b) => (a.dataX || 0) - (b.dataX || 0));
      return updateSeriesFit({ ...s, points: newPoints });
    });

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Move Point' });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  nudgeSelection: (dx, dy) => set(state => updateActiveWorkspace(state, (ws) => {
    if (ws.selectedPointIds.length === 0) return {};

    const xAxis = ws.xAxis;

    // Nudge series points
    const updatedSeries = ws.series.map(s => {
      const hasSelected = s.points.some(p => ws.selectedPointIds.includes(p.id));
      if (!hasSelected) return s;

      const yAxis = ws.yAxes.find(y => y.id === s.yAxisId)?.calibration;
      if (!yAxis) return s;

      const updatedPoints = s.points.map(p => {
        if (!ws.selectedPointIds.includes(p.id)) return p;
        const newPx = p.x + dx;
        const newPy = p.y + dy;
        const coords = pixelToData(newPx, newPy, xAxis, yAxis);
        return coords ? { ...p, x: newPx, y: newPy, dataX: coords.x, dataY: coords.y } : p;
      });

      return updateSeriesFit({ ...s, points: updatedPoints });
    });

    // Nudge single points
    const activeAxisId = ws.activeYAxisId || (ws.yAxes[0] ? ws.yAxes[0].id : null);
    const activeYAxis = activeAxisId ? ws.yAxes.find(y => y.id === activeAxisId)?.calibration : null;

    const updatedSinglePoints = ws.singlePoints.map(p => {
      if (!ws.selectedPointIds.includes(p.id)) return p;
      if (!activeYAxis) return p;

      const newPx = p.x + dx;
      const newPy = p.y + dy;
      const coords = pixelToData(newPx, newPy, ws.xAxis, activeYAxis);
      return coords ? { ...p, x: newPx, y: newPy, dataX: coords.x, dataY: coords.y } : p;
    });

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Nudge Selection' });

    return {
      series: updatedSeries,
      singlePoints: updatedSinglePoints,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  snapSeriesPoints: (seriesId, config) => set(state => updateActiveWorkspace(state, (ws) => {
    const { mode, precision, targets } = config;
    const xAxis = ws.xAxis;

    const updatedSeries = ws.series.map(s => {
      if (s.id !== seriesId) return s;

      const yAxis = ws.yAxes.find(y => y.id === s.yAxisId)?.calibration;
      if (!yAxis) return s;

      const newPoints = s.points.map(p => {
        if (p.dataX === undefined || p.dataY === undefined) return p;

        let newDataX = p.dataX;
        let newDataY = p.dataY;

        if (targets.includes('x')) {
          if (mode === 'decimal') newDataX = parseFloat(newDataX.toFixed(precision));
          else if (mode === 'sigfig') newDataX = parseFloat(newDataX.toPrecision(precision));
        }

        if (targets.includes('y')) {
          if (mode === 'decimal') newDataY = parseFloat(newDataY.toFixed(precision));
          else if (mode === 'sigfig') newDataY = parseFloat(newDataY.toPrecision(precision));
        }

        const newPixelCoords = dataToPixel(newDataX, newDataY, xAxis, yAxis);

        // If conversion fails (e.g. invalid log value), keep origin
        if (!newPixelCoords) return p;

        return {
          ...p,
          dataX: newDataX,
          dataY: newDataY,
          x: newPixelCoords.x,
          y: newPixelCoords.y
        };
      });

      return updateSeriesFit({ ...s, points: newPoints });
    });

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Snap Points' });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  snapSeriesToFit: (seriesId) => set(state => updateActiveWorkspace(state, (ws) => {
    const series = ws.series.find(s => s.id === seriesId);
    if (!series || !series.fitResult || !series.fitConfig.enabled) return {};

    const xAxis = ws.xAxis;
    const yAxis = ws.yAxes.find(y => y.id === series.yAxisId)?.calibration;

    if (!yAxis) return {};

    const predict = series.fitResult.predict;

    const updatedPoints = series.points.map(p => {
      if (p.dataX === undefined) return p;

      const newDataY = predict(p.dataX);
      const pixel = dataToPixel(p.dataX, newDataY, xAxis, yAxis);

      if (!pixel) return p;

      return {
        ...p,
        dataY: newDataY,
        x: pixel.x,
        y: pixel.y
      };
    });

    const updatedSeries = ws.series.map(s => {
      if (s.id !== seriesId) return s;
      return updateSeriesFit({ ...s, points: updatedPoints });
    });

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes, description: 'Snap to Curve' });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

}));

// Initializes the store with a default item if not already set (which it is)
useStore.setState((state) => {
  if (state.workspaces.length > 0 && !state.activeWorkspaceId) {
    return { activeWorkspaceId: state.workspaces[0].id }
  }
  return {}
})
