import { useEffect } from 'react';
import { useStore } from '../store';

export function useGlobalShortcuts() {
    const {
        undo,
        redo,
        deleteSelectedPoints,
        nudgeSelection,
        setMode,
        workspaces,
        activeWorkspaceId,
        clearSelection
    } = useStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for global modal state first using getState() to avoid dependency cycles or stale state
            const state = useStore.getState();
            if (state.modal.isOpen) return;

            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeTag = document.activeElement?.tagName.toLowerCase();
                if (activeTag === 'input' || activeTag === 'textarea') return;

                e.preventDefault();
                deleteSelectedPoints();
            } else if (e.key.startsWith('Arrow')) {
                const activeTag = document.activeElement?.tagName.toLowerCase();
                if (activeTag === 'input' || activeTag === 'textarea') return;

                e.preventDefault();
                const step = e.shiftKey ? 10 : 1; // Shift for faster nudge
                let dx = 0;
                let dy = 0;
                if (e.key === 'ArrowUp') dy = -step;
                if (e.key === 'ArrowDown') dy = step;
                if (e.key === 'ArrowLeft') dx = -step;
                if (e.key === 'ArrowRight') dx = step;
                nudgeSelection(dx, dy);
            } else if (e.key === 'Escape') {
                // Cancel Action / Clear Selection
                const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
                if (!ws) return;

                // 1. Priority: Clear Point Selection
                if (ws.selectedPointIds.length > 0) {
                    clearSelection();
                    return;
                }

                // 2. Priority: Cancel any active mode (including Digitize) -> Return to IDLE
                if (ws.mode !== 'IDLE') {
                    setMode('IDLE');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, deleteSelectedPoints, nudgeSelection, setMode, clearSelection, workspaces, activeWorkspaceId]);
}
