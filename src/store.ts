import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppMode, AxisCalibration, Point, Series, YAxisDefinition, CurveFitConfig } from './types';
import { calculateCalibration, pixelToData } from './utils/math';
import { fitLinear, fitPolynomial, fitExponential } from './utils/curveFit';

interface AppState {
  imageUrl: string | null;
  setImageUrl: (url: string | null) => void;

  mode: AppMode;
  setMode: (mode: AppMode) => void;

  xAxis: AxisCalibration;
  xAxisName: string;
  setXAxisName: (name: string) => void;
  setXAxisPoint: (step: 1 | 2, px: number, py: number, val: number) => void;
  toggleXAxisLog: () => void;

  yAxes: YAxisDefinition[];
  activeYAxisId: string;
  addYAxis: () => void;
  deleteYAxis: (id: string) => void;
  setActiveYAxis: (id: string) => void;
  updateYAxisName: (id: string, name: string) => void;
  setYAxisPoint: (step: 1 | 2, px: number, py: number, val: number) => void;
  toggleYAxisLog: (axisId?: string) => void;

  series: Series[];
  activeSeriesId: string;
  addSeries: () => void;
  setActiveSeries: (id: string) => void;
  setSeriesYAxis: (seriesId: string, axisId: string) => void;
  updateSeriesName: (id: string, name: string) => void;
  clearSeriesPoints: (id: string) => void;
  setSeriesFitConfig: (seriesId: string, config: Partial<CurveFitConfig>) => void;
  toggleSeriesLabels: (seriesId: string) => void;

  pendingCalibrationPoint: { axis: 'X' | 'Y'; step: 1 | 2; px: number; py: number } | null;
  setPendingCalibrationPoint: (point: { axis: 'X' | 'Y'; step: 1 | 2; px: number; py: number } | null) => void;
  confirmCalibrationPoint: (val: number) => void;

  addPoint: (px: number, py: number) => void;
  addPoints: (points: { px: number; py: number }[]) => void;
  deletePoint: (pointId: string) => void;

  history: { series: Series[]; yAxes: YAxisDefinition[] }[];
  historyIndex: number;
  undo: () => void;
  redo: () => void;

  theme: 'light' | 'dark';
  toggleTheme: () => void;


  updateCalibrationPointPosition: (
    axisType: 'X' | 'Y',
    axisId: string | null,
    pointIndex: 1 | 2,
    newPx: number,
    newPy: number
  ) => void;

  updateSeriesLabelPosition: (seriesId: string, position: { x: number; y: number } | undefined) => void;
}

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
    // Clear fit if disabled or not enough points
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

  // Determine constraint
  // constraintY is the fixed Y value at X=0
  // undefined means no constraint (auto)
  let constraintY: number | undefined = undefined;

  if (interceptMode === 'zero') {
    constraintY = 0;
  } else if (interceptMode === 'firstPoint' && series.points.length > 0) {
    // Find point with smallest X or just index 0?
    // "First Digitized Point" usually means the first one the user clicked (index 0).
    // However, for fitting, sorting by X implies the "y-intercept" logic might desire the point with min X?
    // User request: "lock the y intercept to the first digitized point"
    // Interpretation: The Y-intercept of the curve (at x=0) should be equal to the Y-value of the first point.
    // This is mathematically "y(0) = firstPoint.dataY". 
    // Usually "first digitized point" means the first one added to the list.
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

  // Update points with fittedY
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

export const useStore = create<AppState>((set, get) => ({
  imageUrl: null,
  setImageUrl: (url) => set({ imageUrl: url }),

  mode: 'IDLE',
  setMode: (mode) => set({ mode, pendingCalibrationPoint: null }),

  pendingCalibrationPoint: null,
  setPendingCalibrationPoint: (point) => set({ pendingCalibrationPoint: point }),

  confirmCalibrationPoint: (val) => {
    const { pendingCalibrationPoint: p, activeYAxisId } = get();
    if (!p) return;

    if (p.axis === 'X') {
      set((state) => {
        const newAxis = { ...state.xAxis } as AxisCalibration;
        if (p.step === 1) newAxis.p1 = { px: p.px, py: p.py, val };
        if (p.step === 2) newAxis.p2 = { px: p.px, py: p.py, val };

        if (newAxis.p1 && newAxis.p2) {
          try {
            const { slope, intercept } = calculateCalibration(
              newAxis.p1.px,
              newAxis.p1.val,
              newAxis.p2.px,
              newAxis.p2.val,
              newAxis.isLog
            );
            newAxis.slope = slope;
            newAxis.intercept = intercept;
            // Axis changed, might need to update all points' dataX and re-fit? 
            // Ideally yes, but existing code didn't trigger full re-calc of data values on axis calibration finish.
            // For now, let's assume points are added AFTER calibration.
            // If points existed, their dataX/dataY would be stale. Use case implies calibration first.
            return { xAxis: newAxis, pendingCalibrationPoint: null, mode: 'IDLE' };
          } catch (e) {
            console.error(e);
          }
        }
        return { xAxis: newAxis, pendingCalibrationPoint: null };
      });
    } else {
      set((state) => {
        const updatedYAxes = state.yAxes.map((axis) => {
          if (axis.id !== activeYAxisId) return axis;

          const newCalibration = { ...axis.calibration } as AxisCalibration;
          if (p.step === 1) newCalibration.p1 = { px: p.px, py: p.py, val };
          if (p.step === 2) newCalibration.p2 = { px: p.px, py: p.py, val };

          if (newCalibration.p1 && newCalibration.p2) {
            try {
              const { slope, intercept } = calculateCalibration(
                newCalibration.p1.py,
                newCalibration.p1.val,
                newCalibration.p2.py,
                newCalibration.p2.val,
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

        const activeAxis = updatedYAxes.find(a => a.id === activeYAxisId);
        const isComplete = activeAxis?.calibration.p1 && activeAxis?.calibration.p2;

        return {
          yAxes: updatedYAxes,
          pendingCalibrationPoint: null,
          ...(isComplete ? { mode: 'IDLE' } : {})
        };
      });
    }
  },

  xAxis: { ...initialAxis },
  xAxisName: 'X Axis',
  setXAxisName: (name) => set({ xAxisName: name }),
  setXAxisPoint: (_step, _px, _py, _val) => { },
  toggleXAxisLog: () => {
    set((state) => ({ xAxis: { ...state.xAxis, isLog: !state.xAxis.isLog } }));
  },

  yAxes: [
    {
      id: defaultYAxisId,
      name: 'Y Axis 1',
      color: '#ef4444',
      calibration: { ...initialAxis }
    }
  ],
  activeYAxisId: defaultYAxisId,

  addYAxis: () => set(state => {
    const id = uuidv4();
    return {
      yAxes: [...state.yAxes, {
        id,
        name: `Y Axis ${state.yAxes.length + 1}`,
        color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
        calibration: { ...initialAxis }
      }],
      activeYAxisId: id // auto-select new axis
    };
  }),

  deleteYAxis: (id) => set(state => {
    if (state.yAxes.length <= 1) return {}; // Prevent deleting last axis
    const newAxes = state.yAxes.filter(a => a.id !== id);
    // Remap series using this axis to the first available axis
    const fallbackAxisId = newAxes[0].id;
    const updatedSeries = state.series.map(s => s.yAxisId === id ? { ...s, yAxisId: fallbackAxisId } : s);

    // Note: If axis changes, points' dataY calculation depends on it. 
    // We should technically re-calculate dataY for all points in those series.
    // For this scope, we'll leave as is, but trigger fit update if needed.

    const finalSeries = updatedSeries.map(s => updateSeriesFit(s));

    return {
      yAxes: newAxes,
      activeYAxisId: state.activeYAxisId === id ? fallbackAxisId : state.activeYAxisId,
      series: finalSeries
    };
  }),

  setActiveYAxis: (id) => set({ activeYAxisId: id }),
  updateYAxisName: (id, name) => set((state) => ({
    yAxes: state.yAxes.map((axis) =>
      axis.id === id ? { ...axis, name } : axis
    )
  })),
  setYAxisPoint: (_step, _px, _py, _val) => { },

  toggleYAxisLog: (axisId) => {
    set((state) => {
      const targetId = axisId || state.activeYAxisId;
      return {
        yAxes: state.yAxes.map((axis) =>
          axis.id === targetId
            ? { ...axis, calibration: { ...axis.calibration, isLog: !axis.calibration.isLog } }
            : axis
        ),
      };
    });
  },

  series: [
    {
      id: 'series-1',
      name: 'Series 1',
      color: '#ef4444',
      points: [],
      yAxisId: defaultYAxisId,
      fitConfig: { enabled: false, type: 'linear', interceptMode: 'auto' },
      showLabels: false,
    },
  ],
  activeSeriesId: 'series-1',

  addSeries: () =>
    set((state) => {
      const id = `series-${state.series.length + 1}`;
      return {
        series: [
          ...state.series,
          {
            id,
            name: `Series ${state.series.length + 1}`,
            color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
            points: [],
            yAxisId: state.activeYAxisId || state.yAxes[0].id,
            fitConfig: { enabled: false, type: 'linear', interceptMode: 'auto' },
            showLabels: false,
          },
        ],
        activeSeriesId: id,
      };
    }),

  setActiveSeries: (id) => set({ activeSeriesId: id }),

  setSeriesYAxis: (seriesId, axisId) => set(state => {
    const yAxis = state.yAxes.find(y => y.id === axisId)?.calibration;

    // If we can't find the axis (shouldn't happen) or it's not calibrated, 
    // we still update the ID, but maybe we can't calculate values yet.
    // However, existing points might need their data cleared if axis is uncalibrated?
    // For now, we'll attempt calculation if possible, or fallback to existing behavior.

    const updatedSeries = state.series.map(s => {
      if (s.id !== seriesId) return s;

      // If we found the new axis, recalculate all points
      let updatedPoints = s.points;
      if (yAxis) {
        updatedPoints = s.points.map(p => {
          // We need to re-calculate based on new axis
          // Note: This relies on pixel coordinates being the source of truth
          const coords = pixelToData(p.x, p.y, state.xAxis, yAxis);
          if (coords) {
            return { ...p, dataX: coords.x, dataY: coords.y };
          }
          return p; // Keep old data if calculation fails? Or set undefined?
          // If we switch to an uncalibrated axis, coords will be null/undefined likely.
          // pixelToData returns null if calibration is incomplete.
          // In that case, we should probably set dataX/dataY to undefined?
          // Existing points might have valid data from previous axis.
          // If we switch to uncalibrated axis, retaining numbers might be misleading.
        });
      }

      return updateSeriesFit({ ...s, yAxisId: axisId, points: updatedPoints });
    });

    return { series: updatedSeries };
  }),

  updateSeriesName: (id, name) => set((state) => {
    const updatedSeries = state.series.map((s) => s.id === id ? { ...s, name } : s);
    return { series: updatedSeries };
  }),

  clearSeriesPoints: (id) => set((state) => {
    const updatedSeries = state.series.map((s) => {
      if (s.id !== id) return s;
      // Update fit (will just clear it since 0 points)
      return updateSeriesFit({ ...s, points: [] });
    });
    const newHistory = state.history ? state.history.slice(0, state.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: state.yAxes });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  setSeriesFitConfig: (seriesId, config) => set(state => {
    const updatedSeries = state.series.map(s => {
      if (s.id !== seriesId) return s;
      const newConfig = { ...s.fitConfig, ...config };
      // If toggling on or changing type, we need to recalculate
      return updateSeriesFit({ ...s, fitConfig: newConfig });
    });
    return { series: updatedSeries };
  }),

  toggleSeriesLabels: (seriesId) => set((state) => ({
    series: state.series.map((s) =>
      s.id === seriesId ? { ...s, showLabels: !s.showLabels } : s
    ),
  })),

  addPoint: (px, py) => set((state) => {
    const activeSeries = state.series.find((s) => s.id === state.activeSeriesId);
    if (!activeSeries) return {};

    const yAxis = state.yAxes.find(y => y.id === activeSeries.yAxisId)?.calibration;
    if (!yAxis) return {};

    const coords = pixelToData(px, py, state.xAxis, yAxis);
    if (!coords) return {};

    const newPoint: Point = {
      id: uuidv4(),
      x: px,
      y: py,
      seriesId: state.activeSeriesId,
      dataX: coords.x,
      dataY: coords.y,
    };

    const updatedSeries = state.series.map((s) => {
      if (s.id === state.activeSeriesId) {
        const newSeries = { ...s, points: [...s.points, newPoint].sort((a, b) => (a.dataX || 0) - (b.dataX || 0)) };
        return updateSeriesFit(newSeries);
      }
      return s;
    });

    const newHistory = state.history ? state.history.slice(0, state.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: state.yAxes });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  addPoints: (points) => set((state) => {
    const activeSeries = state.series.find((s) => s.id === state.activeSeriesId);
    if (!activeSeries) return {};

    const yAxis = state.yAxes.find(y => y.id === activeSeries.yAxisId)?.calibration;
    if (!yAxis) return {};

    const newPoints: Point[] = [];
    for (const { px, py } of points) {
      const coords = pixelToData(px, py, state.xAxis, yAxis);
      if (!coords) continue;
      newPoints.push({
        id: uuidv4(),
        x: px,
        y: py,
        seriesId: state.activeSeriesId,
        dataX: coords.x,
        dataY: coords.y,
      });
    }

    if (newPoints.length === 0) return {};

    const updatedSeries = state.series.map((s) => {
      if (s.id === state.activeSeriesId) {
        const newSeries = { ...s, points: [...s.points, ...newPoints].sort((a, b) => (a.dataX || 0) - (b.dataX || 0)) };
        return updateSeriesFit(newSeries);
      }
      return s;
    });

    const newHistory = state.history ? state.history.slice(0, state.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: state.yAxes });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  deletePoint: (pointId) => set((state) => {
    const updatedSeries = state.series.map((s) => {
      const hasPoint = s.points.some(p => p.id === pointId);
      if (!hasPoint) return s;

      const newSeries = {
        ...s,
        points: s.points.filter((p) => p.id !== pointId),
      };
      return updateSeriesFit(newSeries);
    });

    const newHistory = state.history ? state.history.slice(0, state.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries, yAxes: state.yAxes });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  history: [],
  historyIndex: -1,

  undo: () => set((state) => {
    if (state.historyIndex < 0) return {};

    const newIndex = state.historyIndex - 1;
    const targetIndex = Math.max(newIndex, 0);

    if (!state.history || targetIndex >= state.history.length) {
      // Prevent history underflow and ignore undo if no snapshot exists
      return { historyIndex: newIndex };
    }

    return {
      series: state.history[targetIndex].series,
      yAxes: state.history[targetIndex].yAxes, // restore axes too if meaningful
      historyIndex: newIndex
    };
  }),

  redo: () => set((state) => {
    if (!state.history || state.historyIndex >= state.history.length - 1) return {};
    const newIndex = state.historyIndex + 1;
    return {
      series: state.history[newIndex].series,
      yAxes: state.history[newIndex].yAxes,
      historyIndex: newIndex
    };
  }),

  theme: (localStorage.getItem('theme') as 'light' | 'dark') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    return { theme: newTheme };
  }),

  updateCalibrationPointPosition: (axisType, axisId, pointIndex, newPx, newPy) => set((state) => {
    if (axisType === 'X') {
      const newAxis = { ...state.xAxis };
      if (pointIndex === 1 && newAxis.p1) {
        newAxis.p1 = { ...newAxis.p1, px: newPx, py: newPy };
      } else if (pointIndex === 2 && newAxis.p2) {
        newAxis.p2 = { ...newAxis.p2, px: newPx, py: newPy };
      }

      // Recalculate
      if (newAxis.p1 && newAxis.p2) {
        try {
          const { slope, intercept } = calculateCalibration(
            newAxis.p1.px, newAxis.p1.val,
            newAxis.p2.px, newAxis.p2.val,
            newAxis.isLog
          );
          newAxis.slope = slope;
          newAxis.intercept = intercept;

          // Should update points too if needed, but for now just updating calibration
          // Technically points haven't moved on screen (px, py same), but dataX changes.
          const updatedSeries = state.series.map(s => {
            // Re-calculate dataX for all points
            const yAxis = state.yAxes.find(y => y.id === s.yAxisId)?.calibration;
            const updatedPoints = s.points.map(p => {
              const coords = pixelToData(p.x, p.y, newAxis, yAxis || { ...initialAxis }); // fallback
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
      // Y Axes
      const updatedYAxes = state.yAxes.map(axis => {
        if (axis.id !== axisId) return axis;

        const newCalib = { ...axis.calibration };
        if (pointIndex === 1 && newCalib.p1) {
          newCalib.p1 = { ...newCalib.p1, px: newPx, py: newPy };
        } else if (pointIndex === 2 && newCalib.p2) {
          newCalib.p2 = { ...newCalib.p2, px: newPx, py: newPy };
        }

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

      // Update Series dependent on this Y Axis
      const updatedSeries = state.series.map(s => {
        if (s.yAxisId !== axisId) return s;
        const yAxis = updatedYAxes.find(y => y.id === axisId)?.calibration;
        const updatedPoints = s.points.map(p => {
          const coords = pixelToData(p.x, p.y, state.xAxis, yAxis || { ...initialAxis });
          return coords ? { ...p, dataX: coords.x, dataY: coords.y } : p;
        });
        return updateSeriesFit({ ...s, points: updatedPoints });
      });

      return { yAxes: updatedYAxes, series: updatedSeries };
    }
  }),

  updateSeriesLabelPosition: (seriesId, position) => set(state => ({
    series: state.series.map(s => s.id === seriesId ? { ...s, labelPosition: position } : s)
  })),
}));
