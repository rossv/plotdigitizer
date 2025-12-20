import { useState } from 'react';
import { useStore } from '../store';

export function useProject() {
    const { workspaces, activeWorkspaceId, theme, loadProject, openModal } = useStore();
    const [saveSuccess, setSaveSuccess] = useState(false);

    const handleSaveProject = async () => {
        // Process workspaces to convert blob URLs to base64
        const processedWorkspaces = await Promise.all(workspaces.map(async (ws) => {
            let base64Image = ws.imageUrl;
            if (ws.imageUrl && ws.imageUrl.startsWith('blob:')) {
                try {
                    const resp = await fetch(ws.imageUrl);
                    const blob = await resp.blob();
                    base64Image = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.error(`Failed to convert image for workspace ${ws.name}`, e);
                }
            }
            return { ...ws, imageUrl: base64Image };
        }));

        const projectData = {
            version: 2,
            createdAt: new Date().toISOString(),
            workspaces: processedWorkspaces,
            activeWorkspaceId,
            theme
        };

        const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `plot_digitizer_project_${new Date().toISOString().slice(0, 10)}.json`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
    };

    const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                const isLegacy = json.xAxis && json.yAxes && json.series;
                const isNew = Array.isArray(json.workspaces);

                if (!isLegacy && !isNew) {
                    openModal({ type: 'alert', message: "Invalid project file: missing core data" });
                    return;
                }
                loadProject(json);
            } catch (err) {
                console.error("Failed to parse project file", err);
                openModal({ type: 'alert', message: "Failed to load project file" });
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    return { handleSaveProject, handleLoadProject, saveSuccess };
}
