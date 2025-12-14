import React, { useState } from 'react';
import { X, Magnet } from 'lucide-react';
import { useStore } from '../store';
import type { SnapConfig } from '../types';

interface SnappingToolProps {
    seriesId: string;
    isOpen: boolean;
    onClose: () => void;
}

export const SnappingTool: React.FC<SnappingToolProps> = ({ seriesId, isOpen, onClose }) => {
    const [mode, setMode] = useState<'decimal' | 'sigfig'>('decimal');
    const [precision, setPrecision] = useState(2);
    const [targets, setTargets] = useState<('x' | 'y')[]>(['y']);

    const { snapSeriesPoints } = useStore();

    if (!isOpen) return null;

    const handleSnap = () => {
        const config: SnapConfig = {
            mode,
            precision,
            targets
        };
        snapSeriesPoints(seriesId, config);
        onClose();
    };

    const toggleTarget = (target: 'x' | 'y') => {
        setTargets(prev =>
            prev.includes(target)
                ? prev.filter(t => t !== target)
                : [...prev, target]
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 animate-scale-in">

                {/* Header */}
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold">
                        <Magnet className="w-5 h-5 text-blue-500" />
                        <h3>Snap Points</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-5">

                    {/* Mode Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Snap Method</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setMode('decimal')}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${mode === 'decimal'
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                    }`}
                            >
                                Decimal Places
                            </button>
                            <button
                                onClick={() => setMode('sigfig')}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${mode === 'sigfig'
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                    }`}
                            >
                                Significant Figures
                            </button>
                        </div>
                    </div>

                    {/* Precision Input */}
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                {mode === 'decimal' ? 'Decimal Places' : 'Significant Digits'}
                            </label>
                            <span className="text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 rounded">
                                Example: {mode === 'decimal'
                                    ? `${(1.23456).toFixed(precision)}`
                                    : `${(1.23456).toPrecision(precision)}`}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min="0"
                                max={mode === 'decimal' ? 6 : 8}
                                step="1"
                                value={precision}
                                onChange={(e) => setPrecision(parseInt(e.target.value))}
                                className="flex-1 accent-blue-600 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <input
                                type="number"
                                min="0"
                                max="10"
                                value={precision}
                                onChange={(e) => setPrecision(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-12 px-2 py-1 text-center text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                            />
                        </div>
                    </div>

                    {/* Targets */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Apply To</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition ${targets.includes('x')
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                    }`}>
                                    {targets.includes('x') && <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                                </div>
                                <input type="checkbox" className="hidden" checked={targets.includes('x')} onChange={() => toggleTarget('x')} />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">X Values</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition ${targets.includes('y')
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                    }`}>
                                    {targets.includes('y') && <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                                </div>
                                <input type="checkbox" className="hidden" checked={targets.includes('y')} onChange={() => toggleTarget('y')} />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">Y Values</span>
                            </label>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSnap}
                        disabled={targets.length === 0}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition"
                    >
                        Snap Points
                    </button>
                </div>

            </div>
        </div>
    );
};
