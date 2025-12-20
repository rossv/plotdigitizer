import type { StoreSlice, CalibrationSlice, AxisCalibration } from '../types';
import { updateActiveWorkspace, initialAxis, updateSeriesFit } from '../utils';
import { calculateCalibration, pixelToData } from '../../utils/math';

export const createCalibrationSlice: StoreSlice<CalibrationSlice> = (set) => ({
    setXAxisName: (name) => set(state => updateActiveWorkspace(state, () => ({ xAxisName: name }))),
    setXAxisPoint: () => { },

    toggleXAxisLog: () => set(state => updateActiveWorkspace(state, (ws) => {
        const newIsLog = !ws.xAxis.isLog;
        const newXAxis = { ...ws.xAxis, isLog: newIsLog };

        if (newXAxis.p1 && newXAxis.p2) {
            try {
                const { slope, intercept } = calculateCalibration(
                    newXAxis.p1.px, newXAxis.p1.val,
                    newXAxis.p2.px, newXAxis.p2.val,
                    newXAxis.isLog
                );
                newXAxis.slope = slope;
                newXAxis.intercept = intercept;

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
        // We rely on uuid imported in utils or handled elsewhere. 
        // Actually, we need to generate ID here. 
        // Since I didn't import uuid here, use random fallback which is acceptable for now or import uuid.
        // I'll import uuid to be safe.
        // Wait, import 'v4' was NOT in my proposed content above. 
        // I should add it.
        const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();

        return {
            yAxes: [...ws.yAxes, {
                id,
                name: `Y Axis ${ws.yAxes.length + 1}`,
                color: '#ef4444',
                calibration: { ...initialAxis }
            }],
            activeYAxisId: id
        };
    })),

    deleteYAxis: (id) => set(state => updateActiveWorkspace(state, (ws) => {
        if (ws.yAxes.length <= 1) return {};
        const newAxes = ws.yAxes.filter(a => a.id !== id);
        const fallbackAxisId = newAxes[0].id;
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

                    const updatedSeries = ws.series.map(s => {
                        const yAxis = ws.yAxes.find(y => y.id === s.yAxisId)?.calibration;
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
                const updatedSeries = ws.series.map(s => {
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
});
