import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppMode, AxisCalibration, Point, Series } from './types';
import { calculateCalibration, pixelToData } from './utils/math';
import { fitLinear, fitPolynomial, fitExponential } from './utils/curveFit';

interface AppState {
  imageUrl: string | null;
  setImageUrl: (url: string | null) => void;

  mode: AppMode;
  setMode: (mode: AppMode) => void;

  xAxis: AxisCalibration;
  setXAxisPoint: (step: 1 | 2, px: number, py: number, val: number) => void;
  toggleXAxisLog: () => void;

  series: Series[];
  activeSeriesId: string;
  addSeries: () => void;
  setActiveSeries: (id: string) => void;
  setYAxisPoint: (step: 1 | 2, px: number, py: number, val: number) => void;
  toggleYAxisLog: () => void;

  pendingCalibrationPoint: { axis: 'X' | 'Y'; step: 1 | 2; px: number; py: number } | null;
  setPendingCalibrationPoint: (point: { axis: 'X' | 'Y'; step: 1 | 2; px: number; py: number } | null) => void;
  confirmCalibrationPoint: (val: number) => void;

  addPoint: (px: number, py: number) => void;
  addPoints: (points: { px: number; py: number }[]) => void;
  deletePoint: (pointId: string) => void;

  history: { series: Series[] }[];
  historyIndex: number;
  undo: () => void;
  redo: () => void;

  fittedCurves: { id: string; seriesId: string; type: string; points: Point[] }[];
  addFittedCurve: (seriesId: string, type: 'linear' | 'polynomial' | 'exponential') => void;
  deleteFittedCurve: (id: string) => void;
}

const initialAxis: AxisCalibration = {
  p1: null,
  p2: null,
  isLog: false,
  slope: null,
  intercept: null,
};

export const useStore = create<AppState>((set, get) => ({
  imageUrl: null,
  setImageUrl: (url) => set({ imageUrl: url }),

  mode: 'IDLE',
  setMode: (mode) => set({ mode, pendingCalibrationPoint: null }),

  pendingCalibrationPoint: null,
  setPendingCalibrationPoint: (point) => set({ pendingCalibrationPoint: point }),

  confirmCalibrationPoint: (val) => {
    const { pendingCalibrationPoint: p, activeSeriesId } = get();
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
            return { xAxis: newAxis, pendingCalibrationPoint: null, mode: 'IDLE' };
          } catch (e) {
            console.error(e);
          }
        }
        return { xAxis: newAxis, pendingCalibrationPoint: null };
      });
    } else {
      set((state) => {
        const updatedSeries = state.series.map((series) => {
          if (series.id !== activeSeriesId) return series;

          const newAxis = { ...series.yAxis } as AxisCalibration;
          if (p.step === 1) newAxis.p1 = { px: p.px, py: p.py, val };
          if (p.step === 2) newAxis.p2 = { px: p.px, py: p.py, val };

          if (newAxis.p1 && newAxis.p2) {
            try {
              const { slope, intercept } = calculateCalibration(
                newAxis.p1.py,
                newAxis.p1.val,
                newAxis.p2.py,
                newAxis.p2.val,
                newAxis.isLog
              );
              newAxis.intercept = intercept;
              newAxis.slope = slope;
              return { ...series, yAxis: newAxis };
            } catch (e) {
              console.error(e);
            }
          }
          return { ...series, yAxis: newAxis };
        });

        const activeSeries = updatedSeries.find(s => s.id === activeSeriesId);
        const isComplete = activeSeries?.yAxis.p1 && activeSeries?.yAxis.p2;

        return {
          series: updatedSeries,
          pendingCalibrationPoint: null,
          ...(isComplete ? { mode: 'IDLE' } : {})
        };
      });
    }
  },

  xAxis: { ...initialAxis },
  setXAxisPoint: (_step, _px, _py, _val) => { },
  toggleXAxisLog: () => {
    set((state) => ({ xAxis: { ...state.xAxis, isLog: !state.xAxis.isLog } }));
  },

  series: [
    {
      id: 'series-1',
      name: 'Series 1',
      color: '#ef4444',
      points: [],
      yAxis: { ...initialAxis },
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
            yAxis: { ...initialAxis },
          },
        ],
        activeSeriesId: id,
      };
    }),

  setActiveSeries: (id) => set({ activeSeriesId: id }),
  setYAxisPoint: (_step, _px, _py, _val) => { },

  toggleYAxisLog: () => {
    const { activeSeriesId } = get();
    set((state) => ({
      series: state.series.map((series) =>
        series.id === activeSeriesId
          ? { ...series, yAxis: { ...series.yAxis, isLog: !series.yAxis.isLog } }
          : series
      ),
    }));
  },

  fittedCurves: [],
  addFittedCurve: (seriesId, type) => {
    const state = get();
    const series = state.series.find(s => s.id === seriesId);
    if (!series || series.points.length < 2) return;

    let fitPoints: Point[] = [];
    try {
      if (type === 'linear') fitPoints = fitLinear(series.points);
      else if (type === 'polynomial') fitPoints = fitPolynomial(series.points);
      else if (type === 'exponential') fitPoints = fitExponential(series.points);
    } catch (e) {
      console.error('Fit failed', e);
      return;
    }

    if (fitPoints.length === 0) return;

    const newCurve = {
      id: uuidv4(),
      seriesId,
      type,
      points: fitPoints
    };

    set(state => ({
      fittedCurves: [...state.fittedCurves, newCurve]
    }));
  },

  deleteFittedCurve: (id) => set(state => ({
    fittedCurves: state.fittedCurves.filter(c => c.id !== id)
  })),

  addPoint: (px, py) => set((state) => {
    const activeSeries = state.series.find((s) => s.id === state.activeSeriesId);
    if (!activeSeries) return {};

    const coords = pixelToData(px, py, state.xAxis, activeSeries.yAxis);
    if (!coords) return {};

    const newPoint: Point = {
      id: uuidv4(),
      x: px,
      y: py,
      seriesId: state.activeSeriesId,
      dataX: coords.x,
      dataY: coords.y,
    };

    const updatedSeries = state.series.map((s) =>
      s.id === state.activeSeriesId ? { ...s, points: [...s.points, newPoint] } : s
    );

    const newHistory = state.history ? state.history.slice(0, state.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  addPoints: (points: { px: number; py: number }[]) => set((state) => {
    const activeSeries = state.series.find((s) => s.id === state.activeSeriesId);
    if (!activeSeries) return {};

    const newPoints: Point[] = [];
    for (const { px, py } of points) {
      const coords = pixelToData(px, py, state.xAxis, activeSeries.yAxis);
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

    const updatedSeries = state.series.map((s) =>
      s.id === state.activeSeriesId ? { ...s, points: [...s.points, ...newPoints] } : s
    );

    const newHistory = state.history ? state.history.slice(0, state.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  deletePoint: (pointId) => set((state) => {
    const updatedSeries = state.series.map((s) => ({
      ...s,
      points: s.points.filter((p) => p.id !== pointId),
    }));

    const newHistory = state.history ? state.history.slice(0, state.historyIndex + 1) : [];
    newHistory.push({ series: updatedSeries });

    return {
      series: updatedSeries,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  history: [],
  historyIndex: -1,

  undo: () => set((state) => {
    if (state.historyIndex <= 0) return {};
    const newIndex = state.historyIndex - 1;
    return {
      series: state.history[newIndex].series,
      historyIndex: newIndex
    };
  }),

  redo: () => set((state) => {
    if (!state.history || state.historyIndex >= state.history.length - 1) return {};
    const newIndex = state.historyIndex + 1;
    return {
      series: state.history[newIndex].series,
      historyIndex: newIndex
    };
  }),
}));
