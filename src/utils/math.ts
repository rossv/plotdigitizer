import type { AxisCalibration } from '../types';

type Vec2 = { x: number; y: number };

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
  const point = { x: px, y: py };
  const geometric = pixelToDataGeometric(point, xAxis, yAxis);
  if (geometric) return geometric;

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
  const geometric = dataToPixelGeometric(dataX, dataY, xAxis, yAxis);
  if (geometric) return geometric;

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

const EPS = 1e-8;

const toLinearValue = (value: number, isLog: boolean): number | null => {
  if (!Number.isFinite(value)) return null;
  if (!isLog) return value;
  if (value <= 0) return null;
  return Math.log10(value);
};

const fromLinearValue = (value: number, isLog: boolean): number => (isLog ? Math.pow(10, value) : value);

const subtract = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

const lineIntersection = (p: Vec2, r: Vec2, q: Vec2, s: Vec2): Vec2 | null => {
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const qp = subtract(q, p);
  const t = cross(qp, s) / denom;
  return add(p, scale(r, t));
};

const pixelToDataGeometric = (point: Vec2, xAxis: AxisCalibration, yAxis: AxisCalibration) => {
  if (!xAxis.p1 || !xAxis.p2 || !yAxis.p1 || !yAxis.p2) return null;

  const xP1 = { x: xAxis.p1.px, y: xAxis.p1.py };
  const xP2 = { x: xAxis.p2.px, y: xAxis.p2.py };
  const yP1 = { x: yAxis.p1.px, y: yAxis.p1.py };
  const yP2 = { x: yAxis.p2.px, y: yAxis.p2.py };

  const ux = subtract(xP2, xP1);
  const uy = subtract(yP2, yP1);
  const det = cross(ux, uy);
  if (Math.abs(det) < EPS) return null;

  const origin = lineIntersection(xP1, ux, yP1, uy);
  if (!origin) return null;

  const x1 = toLinearValue(xAxis.p1.val, xAxis.isLog);
  const x2 = toLinearValue(xAxis.p2.val, xAxis.isLog);
  const y1 = toLinearValue(yAxis.p1.val, yAxis.isLog);
  const y2 = toLinearValue(yAxis.p2.val, yAxis.isLog);
  if (x1 === null || x2 === null || y1 === null || y2 === null) return null;

  const rel = subtract(point, origin);
  const alpha = cross(rel, uy) / det;
  const beta = cross(ux, rel) / det;

  const xValLinear = x1 + alpha * (x2 - x1);
  const yValLinear = y1 + beta * (y2 - y1);

  return {
    x: fromLinearValue(xValLinear, xAxis.isLog),
    y: fromLinearValue(yValLinear, yAxis.isLog),
  };
};

const dataToPixelGeometric = (
  dataX: number,
  dataY: number,
  xAxis: AxisCalibration,
  yAxis: AxisCalibration
): Vec2 | null => {
  if (!xAxis.p1 || !xAxis.p2 || !yAxis.p1 || !yAxis.p2) return null;

  const xP1 = { x: xAxis.p1.px, y: xAxis.p1.py };
  const xP2 = { x: xAxis.p2.px, y: xAxis.p2.py };
  const yP1 = { x: yAxis.p1.px, y: yAxis.p1.py };
  const yP2 = { x: yAxis.p2.px, y: yAxis.p2.py };

  const ux = subtract(xP2, xP1);
  const uy = subtract(yP2, yP1);
  const origin = lineIntersection(xP1, ux, yP1, uy);
  if (!origin) return null;

  const x1 = toLinearValue(xAxis.p1.val, xAxis.isLog);
  const x2 = toLinearValue(xAxis.p2.val, xAxis.isLog);
  const y1 = toLinearValue(yAxis.p1.val, yAxis.isLog);
  const y2 = toLinearValue(yAxis.p2.val, yAxis.isLog);
  const xVal = toLinearValue(dataX, xAxis.isLog);
  const yVal = toLinearValue(dataY, yAxis.isLog);
  if (x1 === null || x2 === null || y1 === null || y2 === null || xVal === null || yVal === null) return null;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < EPS || Math.abs(dy) < EPS) return null;

  const alpha = (xVal - x1) / dx;
  const beta = (yVal - y1) / dy;

  return add(origin, add(scale(ux, alpha), scale(uy, beta)));
};
