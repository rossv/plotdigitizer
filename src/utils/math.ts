import type { AxisCalibration } from '../types';

export const calculateCalibration = (
  p1px: number,
  p1val: number,
  p2px: number,
  p2val: number,
  isLog: boolean
) => {
  if (
    !Number.isFinite(p1px) ||
    !Number.isFinite(p1val) ||
    !Number.isFinite(p2px) ||
    !Number.isFinite(p2val)
  ) {
    throw new Error('Calibration parameters must be finite numbers');
  }

  let v1 = p1val;
  let v2 = p2val;

  if (isLog) {
    if (v1 <= 0 || v2 <= 0) throw new Error('Log scale requires positive values');
    v1 = Math.log10(v1);
    v2 = Math.log10(v2);
  }

  const slope = (v2 - v1) / (p2px - p1px);
  const intercept = v1 - slope * p1px;

  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) {
    throw new Error('Calibration resulted in infinite slope/intercept (points likely coincide)');
  }

  return { slope, intercept };
};

export const pixelToData = (
  px: number,
  py: number,
  xAxis: AxisCalibration,
  yAxis: AxisCalibration
) => {
  if (
    !Number.isFinite(xAxis.slope) ||
    !Number.isFinite(xAxis.intercept) ||
    !Number.isFinite(yAxis.slope) ||
    !Number.isFinite(yAxis.intercept)
  ) {
    return null;
  }

  let xVal = xAxis.slope! * px + xAxis.intercept!;
  if (xAxis.isLog) xVal = Math.pow(10, xVal);

  let yVal = yAxis.slope! * py + yAxis.intercept!;
  if (yAxis.isLog) yVal = Math.pow(10, yVal);

  return { x: xVal, y: yVal };
};

export const dataToPixel = (
  dataX: number,
  dataY: number,
  xAxis: AxisCalibration,
  yAxis: AxisCalibration
) => {
  if (
    !Number.isFinite(xAxis.slope) ||
    !Number.isFinite(xAxis.intercept) ||
    !Number.isFinite(yAxis.slope) ||
    !Number.isFinite(yAxis.intercept)
  ) {
    return null;
  }

  let xVal = dataX;
  if (xAxis.isLog) {
    if (xVal <= 0) return null; // Cannot map <= 0 on log scale
    xVal = Math.log10(xVal);
  }
  const px = (xVal - xAxis.intercept!) / xAxis.slope!;

  let yVal = dataY;
  if (yAxis.isLog) {
    if (yVal <= 0) return null;
    yVal = Math.log10(yVal);
  }
  const py = (yVal - yAxis.intercept!) / yAxis.slope!;

  return { x: px, y: py };
};
