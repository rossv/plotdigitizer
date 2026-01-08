
import { useStore } from './src/store/index';
import { v4 as uuidv4 } from 'uuid';

// Mock crypto.randomUUID if not available (Node < 19)
if (!global.crypto) {
    global.crypto = {
        randomUUID: () => uuidv4() as `${string}-${string}-${string}-${string}-${string}`
    } as any;
} else if (!global.crypto.randomUUID) {
    global.crypto.randomUUID = () => uuidv4() as `${string}-${string}-${string}-${string}-${string}`;
}

// Helper to log state
const logState = (step: string) => {
    const state = useStore.getState();
    const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
    if (!ws) {
        console.log(`[${step}] No active workspace`);
        return;
    }
    console.log(`[${step}] History Index: ${ws.historyIndex}, History Length: ${ws.history.length}`);
    console.log(`   X Axis: p1=${!!ws.xAxis.p1}, p2=${!!ws.xAxis.p2}, slope=${ws.xAxis.slope}`);
    const yAxis = ws.yAxes[0];
    console.log(`   Y Axis 1: p1=${!!yAxis.calibration.p1}, p2=${!!yAxis.calibration.p2}, slope=${yAxis.calibration.slope}`);
    console.log(`   Series 1 Points: ${ws.series[0].points.length}`);
};

const run = () => {
    console.log("Starting Repro...");
    logState("Initial");

    const state = useStore.getState();
    const wsId = state.activeWorkspaceId;

    // 1. Calibrate X Axis
    console.log("--- Calibrating X Axis ---");
    // Manually set X axis calibration (as confirmCalibrationPoint would)
    // We can use the store actions
    state.startCalibration('X');
    state.setPendingCalibrationPoint({ axis: 'X', step: 1, px: 10, py: 100 });
    state.confirmCalibrationPoint(0);

    state.setPendingCalibrationPoint({ axis: 'X', step: 2, px: 110, py: 100 });
    state.confirmCalibrationPoint(10);

    logState("After X Calibration");

    // 2. Calibrate Y Axis
    console.log("--- Calibrating Y Axis ---");
    state.startCalibration('Y', state.workspaces[0].activeYAxisId);
    state.setPendingCalibrationPoint({ axis: 'Y', step: 1, px: 10, py: 100 });
    state.confirmCalibrationPoint(0);

    state.setPendingCalibrationPoint({ axis: 'Y', step: 2, px: 10, py: 10 });
    state.confirmCalibrationPoint(10);

    logState("After Y Calibration");

    // 3. Add Points (Simulate Wand)
    console.log("--- Adding Points (Wand) ---");
    useStore.getState().addPoints([
        { px: 20, py: 90 },
        { px: 30, py: 80 }
    ]);

    logState("After Adding Points");

    // 4. Undo
    console.log("--- Undoing ---");
    useStore.getState().undo();

    logState("After Undo");
};

run();
