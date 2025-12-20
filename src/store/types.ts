import type { StateCreator } from 'zustand';
import type { AppMode, AxisCalibration, Point, Series, YAxisDefinition, CurveFitConfig, SnapConfig } from '../types';

export type { AppMode, AxisCalibration, Point, Series, YAxisDefinition, CurveFitConfig, SnapConfig };

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

export interface Workspace {
    id: string;
    name: string;
    imageUrl: string | null;
    mode: AppMode;
    xAxis: AxisCalibration;
    xAxisName: string;
    yAxes: YAxisDefinition[];
    activeYAxisId: string;
    series: Series[];
    activeSeriesId: string;
    pendingCalibrationPoint: { axis: 'X' | 'Y'; step: 1 | 2; px: number; py: number } | null;
    singlePoints: Point[];
    history: { series: Series[]; yAxes: YAxisDefinition[]; description: string }[];
    historyIndex: number;
    selectedPointIds: string[];
}

export interface UISlice {
    theme: 'light' | 'dark';
    modal: ModalState;
    toggleTheme: () => void;
    openModal: (params: Omit<ModalState, 'isOpen'>) => void;
    closeModal: () => void;
}

export interface WorkspaceSlice {
    workspaces: Workspace[];
    activeWorkspaceId: string;
    addWorkspace: () => void;
    removeWorkspace: (id: string) => void;
    setActiveWorkspace: (id: string) => void;
    updateWorkspaceName: (id: string, name: string) => void;
    loadProject: (projectData: any) => void;
    setImageUrl: (url: string | null) => void;
    setMode: (mode: AppMode) => void;
    autoDetectAxes: () => Promise<void>;
}

export interface CalibrationSlice {
    setXAxisName: (name: string) => void;
    setXAxisPoint: (step: 1 | 2, px: number, py: number, val: number) => void;
    toggleXAxisLog: () => void;
    addYAxis: () => void;
    deleteYAxis: (id: string) => void;
    setActiveYAxis: (id: string) => void;
    updateYAxisName: (id: string, name: string) => void;
    setYAxisPoint: (step: 1 | 2, px: number, py: number, val: number) => void;
    toggleYAxisLog: (axisId?: string) => void;
    setPendingCalibrationPoint: (point: { axis: 'X' | 'Y'; step: 1 | 2; px: number; py: number } | null) => void;
    startCalibration: (axis: 'X' | 'Y', axisId?: string) => void;
    confirmCalibrationPoint: (val: number) => void;
    updateCalibrationPointPosition: (axisType: 'X' | 'Y', axisId: string | null, pointIndex: 1 | 2, newPx: number, newPy: number) => void;
    updateCalibrationPointValue: (axisType: 'X' | 'Y', axisId: string | null, pointIndex: 1 | 2, newValue: number) => void;
}

export interface DataSlice {
    addSeries: () => void;
    setActiveSeries: (id: string) => void;
    setSeriesYAxis: (seriesId: string, axisId: string) => void;
    updateSeriesName: (id: string, name: string) => void;
    updateSeriesColor: (id: string, color: string) => void;
    clearSeriesPoints: (id: string) => void;
    setSeriesFitConfig: (seriesId: string, config: Partial<CurveFitConfig>) => void;
    toggleSeriesLabels: (seriesId: string) => void;
    toggleSeriesPointCoordinates: (seriesId: string) => void;
    resampleActiveSeries: (count: number) => void;
    addPoint: (px: number, py: number) => void;
    addSinglePoint: (px: number, py: number) => void;
    addPoints: (points: { px: number; py: number }[]) => void;
    deletePoint: (pointId: string) => void;
    undo: () => void;
    redo: () => void;
    jumpToHistory: (index: number) => void;
    updateSeriesLabelPosition: (seriesId: string, position: { x: number; y: number } | undefined) => void;
    selectPoints: (ids: string[], append?: boolean) => void;
    togglePointSelection: (id: string, multi?: boolean) => void;
    clearSelection: () => void;
    deleteSelectedPoints: () => void;
    updatePointPosition: (pointId: string, px: number, py: number) => void;
    nudgeSelection: (dx: number, dy: number) => void;
    snapSeriesPoints: (seriesId: string, config: SnapConfig) => void;
    snapSeriesToFit: (seriesId: string) => void;
}

export type StoreState = UISlice & WorkspaceSlice & CalibrationSlice & DataSlice;

export type StoreSlice<T> = StateCreator<StoreState, [], [], T>;
