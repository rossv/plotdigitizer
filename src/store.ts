import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppMode, AxisCalibration, Point, Series } from './types';
import { calculateCalibration, pixelToData } from './utils/math';

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

  addPoint: (px: number, py: number) => void;
  deletePoint: (pointId: string) => void;
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
  setMode: (mode) => set({ mode }),

  xAxis: { ...initialAxis },
  setXAxisPoint: (step, px, py, val) => {
    set((state) => {
      const newAxis = { ...state.xAxis } as AxisCalibration;
      if (step === 1) newAxis.p1 = { px, py, val };
      if (step === 2) newAxis.p2 = { px, py, val };

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
        } catch (e) {
          console.error(e);
        }
      }
      return { xAxis: newAxis, mode: 'IDLE' };
    });
  },
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

  setYAxisPoint: (step, px, py, val) => {
    const { activeSeriesId } = get();
    set((state) => {
      const updatedSeries = state.series.map((series) => {
        if (series.id !== activeSeriesId) return series;

        const newAxis = { ...series.yAxis } as AxisCalibration;
        if (step === 1) newAxis.p1 = { px, py, val };
        if (step === 2) newAxis.p2 = { px, py, val };

        if (newAxis.p1 && newAxis.p2) {
          try {
            const { slope, intercept } = calculateCalibration(
              newAxis.p1.py,
              newAxis.p1.val,
              newAxis.p2.py,
              newAxis.p2.val,
              newAxis.isLog
            );
            newAxis.slope = slope;
            newAxis.intercept = intercept;
          } catch (e) {
            console.error(e);
          }
        }

        return { ...series, yAxis: newAxis };
      });

      return { series: updatedSeries, mode: 'IDLE' };
    });
  },

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

  addPoint: (px, py) =>
    set((state) => {
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

      return { series: updatedSeries };
    }),

  deletePoint: (pointId) =>
    set((state) => ({
      series: state.series.map((s) => ({
        ...s,
        points: s.points.filter((p) => p.id !== pointId),
      })),
    })),
}));
