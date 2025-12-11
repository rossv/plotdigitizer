import regression, { type DataPoint } from 'regression';
import type { Point } from '../types';

export const fitLinear = (points: Point[]): Point[] => {
    const data: DataPoint[] = points
        .filter((p) => p.dataX !== undefined && p.dataY !== undefined)
        .map((p) => [p.dataX!, p.dataY!]);

    if (data.length < 2) return [];

    const result = regression.linear(data);
    return generateCurvePoints(result.predict, points);
};

export const fitPolynomial = (points: Point[], order: number = 2): Point[] => {
    const data: DataPoint[] = points
        .filter((p) => p.dataX !== undefined && p.dataY !== undefined)
        .map((p) => [p.dataX!, p.dataY!]);

    if (data.length <= order) return [];

    const result = regression.polynomial(data, { order });
    return generateCurvePoints(result.predict, points);
};

export const fitExponential = (points: Point[]): Point[] => {
    const data: DataPoint[] = points
        .filter((p) => p.dataX !== undefined && p.dataY !== undefined && p.dataY! > 0)
        .map((p) => [p.dataX!, p.dataY!]);

    if (data.length < 2) return [];

    const result = regression.exponential(data);
    return generateCurvePoints(result.predict, points);
};

const generateCurvePoints = (
    predict: (x: number) => DataPoint,
    points: Point[]
): Point[] => {
    // Generate lots of points for smooth curve
    const xValues = points.map(p => p.dataX!).sort((a, b) => a - b);
    const minX = xValues[0];
    const maxX = xValues[xValues.length - 1];
    const step = (maxX - minX) / 100;

    const curvePoints: Point[] = [];
    for (let x = minX; x <= maxX; x += step) {
        const prediction = predict(x);
        // Note: We only have real coordinates here. 
        // We'll trust the consumer to project back to pixels if needed
        // OR we return special point type that only has data coords.
        // For drawing, we actually need to project BACK to pixels.
        // But store.ts doesn't export pixelToData inverse directly easily?
        // Actually store has pixelToData. We need dataToPixel.

        // Let's just return normalized points and handle projection in component/store?
        // Or better, let's keep it simple: return data points.
        curvePoints.push({
            id: 'fit-' + x,
            x: 0, // placeholder, will be calculated by renderer
            y: 0, // placeholder
            seriesId: 'fit',
            dataX: prediction[0],
            dataY: prediction[1]
        });
    }
    return curvePoints;
};
