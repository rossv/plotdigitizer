import { create } from 'zustand';
import type { StoreState } from './types';
import { createUISlice } from './slices/uiSlice';
import { createWorkspaceSlice } from './slices/workspaceSlice';
import { createCalibrationSlice } from './slices/calibrationSlice';
import { createDataSlice } from './slices/dataSlice';

export const useStore = create<StoreState>()((...a) => ({
    ...createUISlice(...a),
    ...createWorkspaceSlice(...a),
    ...createCalibrationSlice(...a),
    ...createDataSlice(...a),
}));

export * from './types';
