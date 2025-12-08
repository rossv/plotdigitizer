import type { AxisCalibration } from '../types';

export const calculateCalibration = (
  p1px: number,
  p1val: number,
  p2px: number,
  p2val: number,
  isLog: boolean
) => {
  let v1 = p1val;
  let v2 = p2val;

  if (isLog) {
    if (v1 <= 0 || v2 <= 0) throw new Error('Log scale requires positive values');
    v1 = Math.log10(v1);
    v2 = Math.log10(v2);
  }

  const slope = (v2 - v1) / (p2px - p1px);
  const intercept = v1 - slope * p1px;

  return { slope, intercept };
};

export const pixelToData = (
  px: number,
  py: number,
  xAxis: AxisCalibration,
  yAxis: AxisCalibration
) => {
  if (
    xAxis.slope === null ||
    xAxis.intercept === null ||
    yAxis.slope === null ||
    yAxis.intercept === null
  ) {
    return null;
  }

  let xVal = xAxis.slope * px + xAxis.intercept;
  if (xAxis.isLog) xVal = Math.pow(10, xVal);

  let yVal = yAxis.slope * py + yAxis.intercept;
  if (yAxis.isLog) yVal = Math.pow(10, yVal);

  return { x: xVal, y: yVal };
};
