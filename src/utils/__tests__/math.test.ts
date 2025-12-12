
import { describe, it, expect } from 'vitest';
import { calculateCalibration, pixelToData, dataToPixel } from '../math';
import type { AxisCalibration } from '../../types';

describe('math utils', () => {
    const linearAxis: AxisCalibration = {
        p1: { px: 0, py: 0, val: 0 },
        p2: { px: 100, py: 0, val: 100 },
        isLog: false,
        slope: 1, // (100-0)/(100-0) = 1
        intercept: 0, // 0 - 1*0 = 0
        calibration: { p1: null, p2: null, isLog: false, slope: null, intercept: null } // Mock nested for type satisfaction if needed, though type def usually flat
    } as any;

    const logAxis: AxisCalibration = {
        p1: { px: 0, py: 0, val: 1 },    // log10(1) = 0
        p2: { px: 100, py: 0, val: 100 }, // log10(100) = 2
        isLog: true,
        slope: 0.02, // (2-0)/(100-0) = 0.02
        intercept: 0, // 0 - 0.02*0 = 0
    } as any;

    describe('dataToPixel', () => {
        it('should convert data to pixel coordinates for linear axes', () => {
            const result = dataToPixel(50, 50, linearAxis, linearAxis);
            expect(result).not.toBeNull();
            expect(result!.x).toBeCloseTo(50);
            expect(result!.y).toBeCloseTo(50);
        });

        it('should convert data to pixel coordinates for log axes', () => {
            // X Log: val 10 -> log(10)=1. px = (1-0)/0.02 = 50
            // Y Linear: val 50 -> px 50
            const result = dataToPixel(10, 50, logAxis, linearAxis);
            expect(result).not.toBeNull();
            expect(result!.x).toBeCloseTo(50);
            expect(result!.y).toBeCloseTo(50);
        });

        it('should return null for invalid log values', () => {
            const result = dataToPixel(-10, 50, logAxis, linearAxis);
            expect(result).toBeNull();
        });
    });

    describe('round trip', () => {
        it('should preserve values through pixelToData -> dataToPixel', () => {
            const originalPx = 25;
            const originalPy = 75;

            const data = pixelToData(originalPx, originalPy, linearAxis, linearAxis);
            expect(data).not.toBeNull();

            const pixels = dataToPixel(data!.x, data!.y, linearAxis, linearAxis);
            expect(pixels).not.toBeNull();
            expect(pixels!.x).toBeCloseTo(originalPx);
            expect(pixels!.y).toBeCloseTo(originalPy);
        });
    });
});
