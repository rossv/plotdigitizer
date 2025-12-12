import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

export const CalibrationInput: React.FC = () => {
    const { setPendingCalibrationPoint, confirmCalibrationPoint, activeWorkspaceId, workspaces } = useStore();
    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
    const pendingCalibrationPoint = activeWorkspace?.pendingCalibrationPoint;
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (pendingCalibrationPoint) {
            setValue('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [pendingCalibrationPoint]);

    if (!pendingCalibrationPoint) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseFloat(value);
        if (!isNaN(num)) {
            confirmCalibrationPoint(num);
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
            <div className="bg-white rounded-lg shadow-xl p-4 w-72 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="font-semibold text-slate-800 mb-2">
                    Calibrate {pendingCalibrationPoint.axis}-Axis
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Enter the value for this point ({pendingCalibrationPoint.px.toFixed(0)}, {pendingCalibrationPoint.py.toFixed(0)})
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label htmlFor="calib-value" className="sr-only">Value</label>
                        <input
                            ref={inputRef}
                            id="calib-value"
                            type="number"
                            step="any"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="e.g. 0, 10, 100"
                            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setPendingCalibrationPoint(null)}
                            className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium shadow-sm"
                        >
                            Confirm
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
