import { v4 as uuidv4 } from 'uuid';
import type { AxisCalibration, Series } from '../types';
import type { StoreState, Workspace } from './types';
import { fitLinear, fitPolynomial, fitExponential } from '../utils/curveFit';

export const initialAxis: AxisCalibration = {
    p1: null,
    p2: null,
    isLog: false,
    slope: null,
    intercept: null,
};

export const SERIES_PALETTE = [
    '#10b981', // Emerald 500
    '#f59e0b', // Amber 500
    '#8b5cf6', // Violet 500
    '#ec4899', // Pink 500
    '#06b6d4', // Cyan 500
    '#84cc16', // Lime 500
    '#6366f1', // Indigo 500
];

export const getRandomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

export const defaultYAxisId = 'y-axis-1';

// Helper to recalculate fit for a series
export const updateSeriesFit = (series: Series): Series => {
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

export const createInitialWorkspace = (name: string): Workspace => ({
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

export const updateActiveWorkspace = (state: StoreState, updater: (ws: Workspace) => Partial<Workspace>): Partial<StoreState> => {
    const activeWsIndex = state.workspaces.findIndex(w => w.id === state.activeWorkspaceId);
    if (activeWsIndex === -1) return {};

    const activeWs = state.workspaces[activeWsIndex];
    const updates = updater(activeWs);

    const newWs = { ...activeWs, ...updates };
    const newWorkspaces = [...state.workspaces];
    newWorkspaces[activeWsIndex] = newWs;

    return { workspaces: newWorkspaces };
};
