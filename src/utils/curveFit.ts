import regression, { type DataPoint } from 'regression';
import type { Point } from '../types';
import { solveLinearSystem } from './matrix';

export interface FitResult {
    points: Point[];
    equation: string;
    r2: number;
    predict: (x: number) => number;
}

export const fitLinear = (points: Point[], constraintY?: number): FitResult | null => {
    const data: DataPoint[] = points
        .filter((p) => p.dataX !== undefined && p.dataY !== undefined)
        .map((p) => [p.dataX!, p.dataY!]);

    if (data.length < 2) return null;

    let equation: string;
    let predictFn: (x: number) => number;
    let r2: number;

    if (constraintY !== undefined) {
        // Model: y = mx + C (C is fixed)
        // y - C = mx
        // Let y' = y - C. Find m to minimize sum((y' - mx)^2)
        // m = sum(x*y') / sum(x^2)
        let sumXY = 0;
        let sumX2 = 0;
        let sumTotalSquares = 0;
        const yMean = data.reduce((acc, p) => acc + p[1], 0) / data.length;

        for (const [x, y] of data) {
            const yPrime = y - constraintY;
            sumXY += x * yPrime;
            sumX2 += x * x;
            sumTotalSquares += Math.pow(y - yMean, 2);
        }

        if (Math.abs(sumX2) < 1e-10) return null; // All x are 0?
        const m = sumXY / sumX2;

        predictFn = (x: number) => m * x + constraintY;
        equation = `y = ${m.toFixed(4)}x + ${constraintY.toFixed(4)}`;

        // Calculate R2
        let sumResidualSquares = 0;
        for (const [x, y] of data) {
            const pred = predictFn(x);
            sumResidualSquares += Math.pow(y - pred, 2);
        }
        r2 = 1 - (sumResidualSquares / sumTotalSquares);

    } else {
        const result = regression.linear(data, { precision: 10 });
        predictFn = (x: number) => result.predict(x)[1];
        equation = result.string;
        r2 = result.r2;
    }

    return {
        points: generateCurvePoints(predictFn, points),
        equation,
        r2,
        predict: predictFn
    };
};

export const fitPolynomial = (points: Point[], order: number = 2, constraintY?: number): FitResult | null => {
    const data: DataPoint[] = points
        .filter((p) => p.dataX !== undefined && p.dataY !== undefined)
        .map((p) => [p.dataX!, p.dataY!]);

    if (data.length <= order) return null;

    let equation: string;
    let predictFn: (x: number) => number;
    let r2: number;

    if (constraintY !== undefined) {
        // Model: y = c0 + c1*x + ... + cn*x^n
        // Constraint: y(0) = c0 = constraintY
        // y - C = c1*x + c2*x^2 + ... + cn*x^n
        // We have n coefficients (c1 to cn) to find.

        // Matrix form for polynomial through origin (of residuals):
        // Y = X * Beta + epsilon
        // Where X rows are [x, x^2, ..., x^n]
        // Beta is [c1, c2, ..., cn]^T

        // Normal equations: (X^T X) Beta = X^T Y'
        // Let's build A = X^T X (nxn) and B = X^T Y' (n)
        // Indices 0 to n-1 correspond to powers 1 to order.

        const n = order; // number of unknowns c1...cn
        const A = Array.from({ length: n }, () => Array(n).fill(0));
        const B = Array(n).fill(0);

        // Precompute power sums to fill A and B faster? Or just iterate data.
        // Doing simple iteration is O(N * order^2), which is fine for small data/order.

        for (const [x, y] of data) {
            const yPrime = y - constraintY;
            // Let's just construct row vector v = [x, x^2, ... x^n]
            const v = [];
            let val = x;
            for (let k = 0; k < n; k++) {
                v.push(val);
                val *= x;
            }

            // Update A: A += v^T * v
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    A[i][j] += v[i] * v[j];
                }
                B[i] += v[i] * yPrime;
            }
        }

        const coeffs = solveLinearSystem(A, B);
        if (!coeffs) return null; // Singular matrix

        // coeffs[i] is corresponds to x^(i+1)
        // c0 is constraintY

        predictFn = (x: number) => {
            let val = constraintY;
            let xPow = x;
            for (let i = 0; i < n; i++) {
                val += coeffs[i] * xPow;
                xPow *= x;
            }
            return val;
        };

        // Format string
        let eq = `y = ${constraintY.toFixed(4)}`;
        for (let i = 0; i < n; i++) {
            const c = coeffs[i];
            const p = i + 1;
            const sign = c >= 0 ? '+' : '-';
            eq += ` ${sign} ${Math.abs(c).toFixed(4)}x^${p}`;
        }
        equation = eq;

        // Calc R2
        const yMean = data.reduce((acc, p) => acc + p[1], 0) / data.length;
        let sumResidualSquares = 0;
        let sumTotalSquares = 0;
        for (const [x, y] of data) {
            sumTotalSquares += Math.pow(y - yMean, 2);
            sumResidualSquares += Math.pow(y - predictFn(x), 2);
        }
        r2 = 1 - (sumResidualSquares / sumTotalSquares);

    } else {
        const result = regression.polynomial(data, { order, precision: 10 });
        predictFn = (x: number) => result.predict(x)[1];
        equation = result.string;
        r2 = result.r2;
    }

    return {
        points: generateCurvePoints(predictFn, points),
        equation,
        r2,
        predict: predictFn
    };
};

export const fitExponential = (points: Point[], constraintY?: number): FitResult | null => {
    const data: DataPoint[] = points
        // Ensure strictly positive Y for log
        .filter((p) => p.dataX !== undefined && p.dataY !== undefined && p.dataY! > 0)
        .map((p) => [p.dataX!, p.dataY!]);

    if (data.length < 2) return null;

    let equation: string;
    let predictFn: (x: number) => number;
    let r2: number;

    if (constraintY !== undefined) {
        if (constraintY <= 0) {
            // Can't fit standard exponential through origin or negative/zero intercept
            return null;
        }

        // Model: y = A * e^(Bx)
        // Constraint: y(0) = A = constraintY
        // Linearize: ln(y) = ln(A) + Bx
        // ln(y/A) = Bx
        // Let Y' = ln(y/A). Find B to minimize sum((Y' - Bx)^2)
        // B = sum(x * Y') / sum(x^2)

        let sumXY = 0;
        let sumX2 = 0;

        for (const [x, y] of data) {
            const yPrime = Math.log(y / constraintY);
            sumXY += x * yPrime;
            sumX2 += x * x;
        }

        if (Math.abs(sumX2) < 1e-10) return null;
        const b = sumXY / sumX2;

        predictFn = (x: number) => constraintY * Math.exp(b * x);
        equation = `y = ${constraintY.toFixed(4)}e^(${b.toFixed(4)}x)`;

        // R2 on original data
        const yMean = data.reduce((acc, p) => acc + p[1], 0) / data.length;
        let sumResidualSquares = 0;
        let sumTotalSquares = 0;
        for (const [x, y] of data) {
            sumTotalSquares += Math.pow(y - yMean, 2);
            sumResidualSquares += Math.pow(y - predictFn(x), 2);
        }
        r2 = 1 - (sumResidualSquares / sumTotalSquares);

    } else {
        const result = regression.exponential(data, { precision: 10 });
        predictFn = (x: number) => result.predict(x)[1];
        equation = result.string;
        r2 = result.r2;
    }

    return {
        points: generateCurvePoints(predictFn, points),
        equation,
        r2,
        predict: predictFn
    };
};

const generateCurvePoints = (
    predict: (x: number) => number | DataPoint,
    points: Point[]
): Point[] => {
    // Generate lots of points for smooth curve
    const xValues = points.map(p => p.dataX!).sort((a, b) => a - b);
    if (xValues.length === 0) return [];

    const minX = xValues[0];
    const maxX = xValues[xValues.length - 1];
    const range = maxX - minX;

    // Extend range slightly for better visualization
    const padding = range * 0.1 || 1; // Handle single point case?
    const startX = minX - padding;
    const endX = maxX + padding;
    const step = (endX - startX) / 100;

    const curvePoints: Point[] = [];
    for (let x = startX; x <= endX; x += step) {
        let val: number;
        const rawPred = predict(x);

        // Handle regression-js return type [x, y] or number
        if (typeof rawPred === 'number') val = rawPred;
        else val = rawPred[1];

        curvePoints.push({
            id: 'fit-' + x,
            x: 0,
            y: 0,
            seriesId: 'fit',
            dataX: x,
            dataY: val
        });
    }
    return curvePoints;
};


export const findBestFit = (points: Point[]): { config: { type: 'linear' | 'polynomial' | 'exponential', order?: number }, result: FitResult } | null => {
    // Try Linear
    const linear = fitLinear(points);

    // Explicitly type 'best' to allow other fit types later
    let best: { config: { type: 'linear' | 'polynomial' | 'exponential', order?: number }, result: FitResult } | null = linear
        ? { config: { type: 'linear' as const }, result: linear }
        : null;

    // Try Exponential
    const exponential = fitExponential(points);
    if (exponential && (!best || exponential.r2 > best.result.r2)) {
        best = { config: { type: 'exponential' as const }, result: exponential };
    }

    // Try Polynomial (2 to 6)
    for (let order = 2; order <= 6; order++) {
        const poly = fitPolynomial(points, order);
        if (poly && (!best || poly.r2 > best.result.r2)) {
            // Penalize higher order slightly to prefer simpler models if R2 is very close?
            // For now, strict R2.
            best = { config: { type: 'polynomial' as const, order }, result: poly };
        }
    }

    return best;
};

export const generatePointsFromPredict = (
    predict: (x: number) => number,
    minX: number,
    maxX: number,
    count: number,
    seriesId: string
): Point[] => {
    if (count < 2) return [];

    const step = (maxX - minX) / (count - 1);
    const newPoints: Point[] = [];

    for (let i = 0; i < count; i++) {
        const x = minX + i * step;
        const y = predict(x);
        newPoints.push({
            id: `resampled-${Date.now()}-${i}`,
            x: 0, // Pixel coordinates will be recalculated by caller or rendering if needed, but usually we need them?
            // Wait, points in store need pixel coordinates for editing.
            // We only have data coordinates here.
            // The store action will need to convert data->pixel.
            y: 0,
            seriesId,
            dataX: x,
            dataY: y
        });
    }
    return newPoints;
};
