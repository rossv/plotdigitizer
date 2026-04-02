import { v4 as uuidv4 } from 'uuid';
import type { AxisCalibration, Series } from '../types';
import type { StoreState, Workspace } from './types';
import { fitLinear, fitPolynomial, fitExponential, fitPower, fitLogarithmic } from '../utils/curveFit';

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
        else if (type === 'power') result = fitPower(series.points, constraintY);
        else if (type === 'logarithmic') result = fitLogarithmic(series.points, constraintY);
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
    imageRotation: 0,
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
            singlePoints: [],
            xAxis: { ...initialAxis },
            imageRotation: 0,
            description: 'Initial State'
        }
    ],
    historyIndex: 0,
    selectedPointIds: [],
});

export const rotatePointClockwise = (point: { x: number; y: number }, imageWidth: number, imageHeight: number) => {
    if (imageWidth <= 0 || imageHeight <= 0) return point;
    return {
        x: imageHeight - point.y,
        y: point.x,
    };
};

export const normalizeRotation = (degrees: number) => ((degrees % 360) + 360) % 360;

export const getRotatedBounds = (imageWidth: number, imageHeight: number, rotationDegrees: number) => {
    const radians = normalizeRotation(rotationDegrees) * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));

    return {
        width: imageWidth * cos + imageHeight * sin,
        height: imageWidth * sin + imageHeight * cos,
    };
};

export const rotatePointBetweenAngles = (
    point: { x: number; y: number },
    imageWidth: number,
    imageHeight: number,
    fromDegrees: number,
    toDegrees: number,
) => {
    if (imageWidth <= 0 || imageHeight <= 0) return point;

    const fromBounds = getRotatedBounds(imageWidth, imageHeight, fromDegrees);
    const toBounds = getRotatedBounds(imageWidth, imageHeight, toDegrees);
    const deltaRad = (toDegrees - fromDegrees) * Math.PI / 180;

    const cxFrom = fromBounds.width / 2;
    const cyFrom = fromBounds.height / 2;
    const cxTo = toBounds.width / 2;
    const cyTo = toBounds.height / 2;

    const relX = point.x - cxFrom;
    const relY = point.y - cyFrom;
    const cos = Math.cos(deltaRad);
    const sin = Math.sin(deltaRad);

    return {
        x: relX * cos - relY * sin + cxTo,
        y: relX * sin + relY * cos + cyTo,
    };
};

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
