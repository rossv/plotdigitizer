import { v4 as uuidv4 } from 'uuid';
import type { StoreSlice, Point, DataSlice } from '../types';
import { updateActiveWorkspace, updateSeriesFit, SERIES_PALETTE, getRandomColor } from '../utils';
import { findBestFit, generatePointsFromPredict } from '../../utils/curveFit';
import { dataToPixel, pixelToData } from '../../utils/math';

export const createDataSlice: StoreSlice<DataSlice> = (set) => ({
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

        const bestFit = findBestFit(points);
        if (!bestFit) return {};

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

        const updatedSeries = ws.series.map(s => {
            if (s.id !== activeSeries.id) return s;
            return updateSeriesFit({
                ...s,
                fitConfig: {
                    enabled: true,
                    type: bestFit.config.type,
                    order: bestFit.config.order,
                    interceptMode: 'auto'
                },
                points: newPoints
            });
        });

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
            seriesId: 'single-point',
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

    undo: () => set(state => updateActiveWorkspace(state, (ws) => {
        if (ws.historyIndex <= 0) return {};
        const newIndex = ws.historyIndex - 1;
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
        return {
            series: ws.history[index].series,
            yAxes: ws.history[index].yAxes,
            historyIndex: index
        };
    })),

    updateSeriesLabelPosition: (seriesId, position) => set(state => updateActiveWorkspace(state, (ws) => ({
        series: ws.series.map(s => s.id === seriesId ? { ...s, labelPosition: position } : s)
    }))),

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
            const hasSelected = s.points.some(p => ws.selectedPointIds.includes(p.id));
            if (!hasSelected) return s;
            const newPoints = s.points.filter(p => !ws.selectedPointIds.includes(p.id));
            return updateSeriesFit({ ...s, points: newPoints });
        });

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
});
