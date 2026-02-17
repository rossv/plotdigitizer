import { describe, it, expect, vi, afterEach } from 'vitest';
import { createUISlice } from './uiSlice';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('createUISlice', () => {
    it('defaults to light theme when browser globals are unavailable', () => {
        vi.stubGlobal('window', undefined);
        vi.stubGlobal('localStorage', undefined);

        const slice = createUISlice(vi.fn(), vi.fn(), {} as any);

        expect(slice.theme).toBe('light');
    });

    it('uses persisted theme when localStorage contains a valid value', () => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn().mockReturnValue('dark'),
            setItem: vi.fn(),
        });
        vi.stubGlobal('window', {
            matchMedia: vi.fn().mockReturnValue({ matches: false }),
        });

        const slice = createUISlice(vi.fn(), vi.fn(), {} as any);

        expect(slice.theme).toBe('dark');
    });

    it('falls back to system preference when storage value is missing', () => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn().mockReturnValue(null),
            setItem: vi.fn(),
        });
        vi.stubGlobal('window', {
            matchMedia: vi.fn().mockReturnValue({ matches: true }),
        });

        const slice = createUISlice(vi.fn(), vi.fn(), {} as any);

        expect(slice.theme).toBe('dark');
    });
});
