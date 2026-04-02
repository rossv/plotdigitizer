import type { AppMode, AxisCalibration, CurveFitConfig, Point, Series, YAxisDefinition } from '../types';
import type { Workspace } from './types';
import { createInitialWorkspace } from './utils';

type ThemeMode = 'light' | 'dark';

type ProjectStatus = 'ok' | 'recovered' | 'migrated' | 'invalid';

export interface SanitizedProjectData {
    status: ProjectStatus;
    workspaces: Workspace[];
    activeWorkspaceId: string;
    theme?: ThemeMode;
    warnings: string[];
}

const APP_MODES: AppMode[] = ['IDLE', 'CALIBRATE_X', 'CALIBRATE_Y', 'DIGITIZE', 'TRACE', 'TRACE_ADVANCED', 'SELECT', 'SINGLE_POINT'];
const FIT_TYPES: CurveFitConfig['type'][] = ['linear', 'polynomial', 'exponential', 'power', 'logarithmic'];
const INTERCEPT_MODES: NonNullable<CurveFitConfig['interceptMode']>[] = ['auto', 'zero', 'firstPoint'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const asString = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value : fallback;

const sanitizeCalibrationPoint = (value: unknown): AxisCalibration['p1'] => {
    if (!isRecord(value)) return null;
    if (!isFiniteNumber(value.px) || !isFiniteNumber(value.py) || !isFiniteNumber(value.val)) return null;
    return { px: value.px, py: value.py, val: value.val };
};

const sanitizeAxisCalibration = (value: unknown, fallback: AxisCalibration): AxisCalibration => {
    if (!isRecord(value)) return fallback;
    return {
        p1: sanitizeCalibrationPoint(value.p1),
        p2: sanitizeCalibrationPoint(value.p2),
        isLog: typeof value.isLog === 'boolean' ? value.isLog : fallback.isLog,
        slope: value.slope === null || isFiniteNumber(value.slope) ? value.slope : null,
        intercept: value.intercept === null || isFiniteNumber(value.intercept) ? value.intercept : null,
    };
};

const sanitizePoint = (value: unknown): Point | null => {
    if (!isRecord(value)) return null;
    if (typeof value.id !== 'string' || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || typeof value.seriesId !== 'string') return null;

    return {
        id: value.id,
        x: value.x,
        y: value.y,
        seriesId: value.seriesId,
        dataX: isFiniteNumber(value.dataX) ? value.dataX : undefined,
        dataY: isFiniteNumber(value.dataY) ? value.dataY : undefined,
        fittedY: isFiniteNumber(value.fittedY) ? value.fittedY : undefined,
    };
};

const sanitizeFitConfig = (value: unknown, fallback: CurveFitConfig): CurveFitConfig => {
    if (!isRecord(value)) return fallback;

    return {
        enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
        type: typeof value.type === 'string' && FIT_TYPES.includes(value.type as CurveFitConfig['type'])
            ? value.type as CurveFitConfig['type']
            : fallback.type,
        order: isFiniteNumber(value.order) ? value.order : fallback.order,
        interceptMode: typeof value.interceptMode === 'string' && INTERCEPT_MODES.includes(value.interceptMode as NonNullable<CurveFitConfig['interceptMode']>)
            ? value.interceptMode as NonNullable<CurveFitConfig['interceptMode']>
            : fallback.interceptMode,
    };
};

const sanitizeSeries = (value: unknown, fallback: Series): Series | null => {
    if (!isRecord(value)) return null;
    if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.yAxisId !== 'string') return null;

    const points = Array.isArray(value.points)
        ? value.points.map(sanitizePoint).filter((point): point is Point => point !== null)
        : fallback.points;

    return {
        ...fallback,
        id: value.id,
        name: value.name,
        color: asString(value.color, fallback.color),
        yAxisId: value.yAxisId,
        points,
        fitConfig: sanitizeFitConfig(value.fitConfig, fallback.fitConfig),
        showLabels: typeof value.showLabels === 'boolean' ? value.showLabels : fallback.showLabels,
        showPointCoordinates: typeof value.showPointCoordinates === 'boolean' ? value.showPointCoordinates : fallback.showPointCoordinates,
        labelPosition: isRecord(value.labelPosition) && isFiniteNumber(value.labelPosition.x) && isFiniteNumber(value.labelPosition.y)
            ? { x: value.labelPosition.x, y: value.labelPosition.y }
            : undefined,
    };
};

const sanitizeYAxis = (value: unknown, fallback: YAxisDefinition): YAxisDefinition | null => {
    if (!isRecord(value)) return null;
    if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;

    return {
        id: value.id,
        name: value.name,
        color: asString(value.color, fallback.color),
        calibration: sanitizeAxisCalibration(value.calibration, fallback.calibration),
    };
};

const sanitizeWorkspace = (value: unknown, index: number): { workspace: Workspace | null; recovered: boolean } => {
    if (!isRecord(value)) return { workspace: null, recovered: false };

    if (typeof value.id !== 'string' || typeof value.name !== 'string' || !('xAxis' in value) || !('yAxes' in value) || !('series' in value)) {
        return { workspace: null, recovered: false };
    }

    const base = createInitialWorkspace(`Workspace ${index + 1}`);
    let recovered = false;

    const yAxes = Array.isArray(value.yAxes)
        ? value.yAxes.map(v => sanitizeYAxis(v, base.yAxes[0])).filter((axis): axis is YAxisDefinition => axis !== null)
        : [];
    if (yAxes.length === 0) {
        yAxes.push(base.yAxes[0]);
        recovered = true;
    }

    const series = Array.isArray(value.series)
        ? value.series.map(v => sanitizeSeries(v, base.series[0])).filter((entry): entry is Series => entry !== null)
        : [];
    if (series.length === 0) {
        series.push(base.series[0]);
        recovered = true;
    }

    const activeYAxisId = typeof value.activeYAxisId === 'string' && yAxes.some(axis => axis.id === value.activeYAxisId)
        ? value.activeYAxisId
        : yAxes[0].id;
    if (activeYAxisId !== value.activeYAxisId) recovered = true;

    const normalizedSeries = series.map((entry, sIdx) => yAxes.some(axis => axis.id === entry.yAxisId)
        ? entry
        : { ...entry, yAxisId: activeYAxisId, id: entry.id || `series-${sIdx + 1}` });

    const activeSeriesId = typeof value.activeSeriesId === 'string' && normalizedSeries.some(entry => entry.id === value.activeSeriesId)
        ? value.activeSeriesId
        : normalizedSeries[0].id;
    if (activeSeriesId !== value.activeSeriesId) recovered = true;

    const workspace: Workspace = {
        ...base,
        id: value.id,
        name: value.name,
        imageUrl: typeof value.imageUrl === 'string' || value.imageUrl === null ? value.imageUrl : base.imageUrl,
        mode: typeof value.mode === 'string' && APP_MODES.includes(value.mode as AppMode) ? value.mode as AppMode : base.mode,
        xAxis: sanitizeAxisCalibration(value.xAxis, base.xAxis),
        xAxisName: asString(value.xAxisName, base.xAxisName),
        yAxes,
        activeYAxisId,
        series: normalizedSeries,
        activeSeriesId,
        pendingCalibrationPoint: isRecord(value.pendingCalibrationPoint)
            && (value.pendingCalibrationPoint.axis === 'X' || value.pendingCalibrationPoint.axis === 'Y')
            && (value.pendingCalibrationPoint.step === 1 || value.pendingCalibrationPoint.step === 2)
            && isFiniteNumber(value.pendingCalibrationPoint.px)
            && isFiniteNumber(value.pendingCalibrationPoint.py)
            ? {
                axis: value.pendingCalibrationPoint.axis,
                step: value.pendingCalibrationPoint.step,
                px: value.pendingCalibrationPoint.px,
                py: value.pendingCalibrationPoint.py,
            }
            : null,
        singlePoints: Array.isArray(value.singlePoints)
            ? value.singlePoints.map(sanitizePoint).filter((point): point is Point => point !== null)
            : base.singlePoints,
        selectedPointIds: Array.isArray(value.selectedPointIds)
            ? value.selectedPointIds.filter((id): id is string => typeof id === 'string')
            : base.selectedPointIds,
        history: base.history,
        historyIndex: 0,
    };

    if (!Array.isArray(value.history) || !isFiniteNumber(value.historyIndex)) recovered = true;

    return { workspace, recovered };
};

const sanitizeLegacyWorkspace = (projectData: Record<string, unknown>): Workspace => {
    const ws = createInitialWorkspace('Imported Project');

    if ('xAxis' in projectData) ws.xAxis = sanitizeAxisCalibration(projectData.xAxis, ws.xAxis);
    if ('xAxisName' in projectData) ws.xAxisName = asString(projectData.xAxisName, ws.xAxisName);

    if (Array.isArray(projectData.yAxes)) {
        const yAxes = projectData.yAxes.map(value => sanitizeYAxis(value, ws.yAxes[0])).filter((axis): axis is YAxisDefinition => axis !== null);
        if (yAxes.length > 0) {
            ws.yAxes = yAxes;
            ws.activeYAxisId = yAxes[0].id;
        }
    }

    if (Array.isArray(projectData.series)) {
        const series = projectData.series.map(value => sanitizeSeries(value, ws.series[0])).filter((entry): entry is Series => entry !== null);
        if (series.length > 0) {
            ws.series = series.map(entry => ws.yAxes.some(axis => axis.id === entry.yAxisId) ? entry : { ...entry, yAxisId: ws.activeYAxisId });
            ws.activeSeriesId = ws.series[0].id;
        }
    }

    if (typeof projectData.imageUrl === 'string' || projectData.imageUrl === null) {
        ws.imageUrl = projectData.imageUrl;
    }

    ws.history = [{ series: ws.series, singlePoints: ws.singlePoints, yAxes: ws.yAxes, xAxis: ws.xAxis, description: 'Initial State' }];
    ws.historyIndex = 0;

    return ws;
};

export const sanitizeProjectData = (projectData: unknown): SanitizedProjectData => {
    if (!isRecord(projectData)) {
        return {
            status: 'invalid',
            workspaces: [],
            activeWorkspaceId: '',
            warnings: ['The selected file is not a valid project format.'],
        };
    }

    const warnings: string[] = [];
    let status: ProjectStatus = 'ok';
    let workspaces: Workspace[] = [];
    let recoveredCount = 0;

    if (Array.isArray(projectData.workspaces)) {
        const sanitized = projectData.workspaces.map((ws, idx) => sanitizeWorkspace(ws, idx));
        workspaces = sanitized.map(item => item.workspace).filter((ws): ws is Workspace => ws !== null);
        recoveredCount = sanitized.filter(item => item.workspace !== null && item.recovered).length;

        if (workspaces.length !== projectData.workspaces.length) {
            warnings.push('Some invalid workspaces were removed during project import.');
            status = 'recovered';
        }
        if (recoveredCount > 0) {
            warnings.push('Some workspace fields were repaired with safe defaults.');
            status = 'recovered';
        }
    } else {
        const legacyWorkspace = sanitizeLegacyWorkspace(projectData);
        workspaces = [legacyWorkspace];
        status = 'migrated';
        warnings.push('This project used a legacy format and was migrated.');
    }

    if (workspaces.length === 0) {
        return {
            status: 'invalid',
            workspaces: [],
            activeWorkspaceId: '',
            warnings: ['The selected project file did not contain any valid workspaces.'],
        };
    }

    const providedActiveId = typeof projectData.activeWorkspaceId === 'string' ? projectData.activeWorkspaceId : '';
    const activeWorkspaceId = workspaces.some(ws => ws.id === providedActiveId)
        ? providedActiveId
        : workspaces[0].id;

    if (providedActiveId && activeWorkspaceId !== providedActiveId) {
        warnings.push('The active workspace in the file was invalid, so the first valid workspace was selected.');
        if (status === 'ok') status = 'recovered';
    }

    const theme = projectData.theme === 'light' || projectData.theme === 'dark'
        ? projectData.theme
        : undefined;

    return { status, workspaces, activeWorkspaceId, theme, warnings };
};
