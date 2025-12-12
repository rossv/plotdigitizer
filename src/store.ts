import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppMode, AxisCalibration, Point, Series, YAxisDefinition, CurveFitConfig, SnapConfig } from './types';
import { calculateCalibration, pixelToData, dataToPixel } from './utils/math';
import { fitLinear, fitPolynomial, fitExponential } from './utils/curveFit';

// --- Types ---

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

  // Undo/Redo history
  history: { series: Series[]; yAxes: YAxisDefinition[] }[];
  historyIndex: number;

  selectedPointIds: string[];
}

interface StoreState {
  // Global State
  theme: 'light' | 'dark';
  workspaces: Workspace[];
  activeWorkspaceId: string;

  // Global Actions
  toggleTheme: () => void;
  addWorkspace: () => void;
  removeWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;
  updateWorkspaceName: (id: string, name: string) => void;
  loadProject: (projectData: any) => void; // Handles complex loading

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
  clearSeriesPoints: (id: string) => void;
  setSeriesFitConfig: (seriesId: string, config: Partial<CurveFitConfig>) => void;
  toggleSeriesLabels: (seriesId: string) => void;

  setPendingCalibrationPoint: (point: { axis: 'X' | 'Y'; step: 1 | 2; px: number; py: number } | null) => void;
  confirmCalibrationPoint: (val: number) => void;

  addPoint: (px: number, py: number) => void;
  addPoints: (points: { px: number; py: number }[]) => void;
  deletePoint: (pointId: string) => void;

  undo: () => void;
  redo: () => void;

  updateCalibrationPointPosition: (
    axisType: 'X' | 'Y',
    axisId: string | null,
    pointIndex: 1 | 2,
    newPx: number,
    newPy: number
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
  toggleSeriesPointCoordinates: (seriesId: string) => void;
}

// --- Helpers ---

const initialAxis: AxisCalibration = {
  p1: null,
  p2: null,
  isLog: false,
  slope: null,
  intercept: null,
};

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
      color: '#ef4444',
      points: [],
      yAxisId: defaultYAxisId,
      fitConfig: { enabled: false, type: 'linear', interceptMode: 'auto' },
      showLabels: false,
      showPointCoordinates: false,
    },
  ],
  activeSeriesId: 'series-1',
  pendingCalibrationPoint: null,
  history: [],
  historyIndex: -1,
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

export const useStore = create<StoreState>((set) => ({
  // Global State
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  workspaces: [createInitialWorkspace('Workspace 1')],
  activeWorkspaceId: '', // Set in init below? No, easy to set default.

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
      // Ensure history is reset
      ws.history = [];
      ws.historyIndex = -1;

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

  // --- Workspace Actions ---

  setImageUrl: (url) => set(state => updateActiveWorkspace(state, () => ({ imageUrl: url }))),

  setMode: (mode) => set(state => updateActiveWorkspace(state, () => ({ mode, pendingCalibrationPoint: null }))),

  setPendingCalibrationPoint: (point) => set(state => updateActiveWorkspace(state, () => ({ pendingCalibrationPoint: point }))),

  confirmCalibrationPoint: (val) => set(state => updateActiveWorkspace(state, (ws) => {
    const p = ws.pendingCalibrationPoint;
    if (!p) return {};

    if (p.axis === 'X') {
      const newAxis = { ...ws.xAxis } as AxisCalibration;
      if (p.step === 1) newAxis.p1 = { px: p.px, py: p.py, val };
      if (p.step === 2) newAxis.p2 = { px: p.px, py: p.py, val };

      if (newAxis.p1 && newAxis.p2) {
        try {
          const { slope, intercept } = calculateCalibration(
            newAxis.p1.px, newAxis.p1.val,
            newAxis.p2.px, newAxis.p2.val,
            newAxis.isLog
          );
          newAxis.slope = slope;
          newAxis.intercept = intercept;
          return { xAxis: newAxis, pendingCalibrationPoint: null, mode: 'IDLE' };
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

        if (newCalibration.p1 && newCalibration.p2) {
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
      const isComplete = activeAxis?.calibration.p1 && activeAxis?.calibration.p2;

      return {
        yAxes: updatedYAxes,
        pendingCalibrationPoint: null,
        ...(isComplete ? { mode: 'IDLE' } : {})
      };
    }
  })),

  // Default initializers for non-primitive arguments
  setXAxisName: (name) => set(state => updateActiveWorkspace(state, () => ({ xAxisName: name }))),
  setXAxisPoint: () => { },

  toggleXAxisLog: () => set(state => updateActiveWorkspace(state, (ws) => ({
    xAxis: { ...ws.xAxis, isLog: !ws.xAxis.isLog }
  }))),

  addYAxis: () => set(state => updateActiveWorkspace(state, (ws) => {
    const id = uuidv4();
    return {
      yAxes: [...ws.yAxes, {
        id,
        name: `Y Axis ${ws.yAxes.length + 1}`,
        color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
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
    return {
      yAxes: ws.yAxes.map(axis =>
        axis.id === targetId
          ? { ...axis, calibration: { ...axis.calibration, isLog: !axis.calibration.isLog } }
          : axis
      ),
    };
  })),

  addSeries: () => set(state => updateActiveWorkspace(state, (ws) => {
    const id = `series-${ws.series.length + 1}`;
    return {
      series: [
        ...ws.series,
        {
          id,
          name: `Series ${ws.series.length + 1}`,
          color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
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

  clearSeriesPoints: (id) => set(state => updateActiveWorkspace(state, (ws) => {
    const updatedSeries = ws.series.map((s) => {
      if (s.id !== id) return s;
      return updateSeriesFit({ ...s, points: [] });
    });
    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes });

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
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
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
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  deletePoint: (pointId) => set(state => updateActiveWorkspace(state, (ws) => {
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
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  undo: () => set(state => updateActiveWorkspace(state, (ws) => {
    if (ws.historyIndex < 0) return {};
    const newIndex = ws.historyIndex - 1;
    const targetIndex = Math.max(newIndex, 0);

    if (!ws.history || targetIndex >= ws.history.length) {
      return { historyIndex: newIndex };
    }

    return {
      series: ws.history[targetIndex].series,
      yAxes: ws.history[targetIndex].yAxes,
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

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes });

    return {
      series: updatedSeries,
      selectedPointIds: [],
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  updatePointPosition: (pointId, px, py) => set(state => updateActiveWorkspace(state, (ws) => {
    // Find series for this point
    let targetSeriesId = '';
    for (const s of ws.series) {
      if (s.points.some(p => p.id === pointId)) {
        targetSeriesId = s.id;
        break;
      }
    }
    if (!targetSeriesId) return {};

    const yAxis = ws.yAxes.find(y => y.id === ws.series.find(s => s.id === targetSeriesId)?.yAxisId)?.calibration;
    const xAxis = ws.xAxis;

    if (!yAxis) return {};

    const coords = pixelToData(px, py, xAxis, yAxis); // Calculate new data based on pixel
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
      }).sort((a, b) => (a.dataX || 0) - (b.dataX || 0)); // Keep sorted
      return updateSeriesFit({ ...s, points: newPoints });
    });

    // Don't push history on every drag frame? 
    // Usually this function is called on DragEnd. So yes, push history.
    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  })),

  nudgeSelection: (dx, dy) => set(state => updateActiveWorkspace(state, (ws) => {
    if (ws.selectedPointIds.length === 0) return {};

    const xAxis = ws.xAxis;

    const updatedSeries = ws.series.map(s => {
      const hasSelected = s.points.some(p => ws.selectedPointIds.includes(p.id));
      if (!hasSelected) return s;

      const yAxis = ws.yAxes.find(y => y.id === s.yAxisId)?.calibration;
      if (!yAxis) return s; // Should not happen if series exists

      const newPoints = s.points.map(p => {
        if (!ws.selectedPointIds.includes(p.id)) return p;
        const newPx = p.x + dx;
        const newPy = p.y + dy;
        const coords = pixelToData(newPx, newPy, xAxis, yAxis);
        return {
          ...p,
          x: newPx,
          y: newPy,
          dataX: coords?.x,
          dataY: coords?.y
        };
      }).sort((a, b) => (a.dataX || 0) - (b.dataX || 0));

      return updateSeriesFit({ ...s, points: newPoints });
    });

    const newHistory = ws.history ? ws.history.slice(0, ws.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes });

    return {
      series: updatedSeries,
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
    newHistory.push({ series: updatedSeries, yAxes: ws.yAxes });

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
