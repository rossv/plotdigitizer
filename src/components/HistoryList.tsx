
import React from 'react';
import { History, Check, ArrowLeft } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';

interface HistoryItem {
    description: string;
}

interface HistoryListProps {
    history: HistoryItem[];
    currentIndex: number;
    onJump: (index: number) => void;
    isOpen: boolean;
}

export const HistoryList: React.FC<HistoryListProps> = ({ history, currentIndex, onJump, isOpen }) => {
    const [parent] = useAutoAnimate();

    if (!isOpen) return null;

    // We want to show the list in reverse order (newest on top).
    // But we need to keep track of the original index.
    // history[currentIndex] is the *current visible state*.
    // Wait, history[i] is the state *after* action i.
    // So if currentIndex is 2, we are seeing the state resulting from action 2.
    // Action 3, 4, ... are "future" (redoable).

    // The list should show:
    // [Future Action 2] (Redoable)
    // [Future Action 1] (Redoable)
    // [Current Action]  (Active) <-- currentIndex
    // [Past Action 1]   (Undoable)
    // ...
    // [Initial State]

    // Actually, standard history lists usually show the actions performed.
    // If I am at index 2.
    // Items 0, 1, 2 have been performed.
    // items 3, 4... are undone.

    // Let's render from length-1 down to 0, plus a virtual "-1" for "Initial State".

    const renderItems = [];

    // Create array of indices: [length-1, ..., 0]
    for (let i = history.length - 1; i >= 0; i--) {
        renderItems.push(i);
    }

    return (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <History className="w-3 h-3" />
                    History
                </h4>
            </div>
            <div
                ref={parent}
                className="max-h-80 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700"
            >
                {renderItems.map((index) => {
                    const isFuture = index > currentIndex;
                    const isActive = index === currentIndex;
                    const isPast = index < currentIndex;

                    let label = "Initial State";
                    if (index >= 0) {
                        label = history[index].description || `Action ${index + 1}`;
                    }

                    return (
                        <button
                            key={index}
                            onClick={() => onJump(index)}
                            className={`w-full text-left px-4 py-2 text-xs transition-colors flex items-center gap-3 relative group
                ${isActive
                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                                    : isFuture
                                        ? 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }
              `}
                        >
                            <div className={`w-4 flex justify-center ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                {isActive && <Check className="w-3 h-3" />}
                                {!isActive && isFuture && <ArrowLeft className="w-3 h-3 rotate-180" />}
                                {!isActive && isPast && <ArrowLeft className="w-3 h-3" />}
                            </div>
                            <span className={`truncate ${isFuture ? 'line-through decoration-slate-300 dark:decoration-slate-600' : ''}`}>
                                {label}
                            </span>
                            {isActive && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm" />
                            )}
                        </button>
                    );
                })}
            </div>
            {history.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 italic">
                    No history yet
                </div>
            )}
        </div>
    );
};
