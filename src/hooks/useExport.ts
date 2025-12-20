import { useState } from 'react';
import type { DigitizerHandle } from '../DigitizerCanvas';

export function useExport(digitizerRef: React.RefObject<DigitizerHandle | null>) {
    const [exportSuccess, setExportSuccess] = useState(false);
    const [exportGraphicsSuccess, setExportGraphicsSuccess] = useState(false);

    const handleExportImage = (graphicsOnly = false) => {
        if (digitizerRef.current) {
            const dataUrl = digitizerRef.current.toDataURL({ graphicsOnly });
            if (dataUrl) {
                const link = document.createElement('a');
                link.download = graphicsOnly ? 'digitized_graphics.png' : 'digitized_plot.png';
                link.href = dataUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                if (graphicsOnly) {
                    setExportGraphicsSuccess(true);
                    setTimeout(() => setExportGraphicsSuccess(false), 2000);
                } else {
                    setExportSuccess(true);
                    setTimeout(() => setExportSuccess(false), 2000);
                }
            }
        }
    };

    return { handleExportImage, exportSuccess, exportGraphicsSuccess };
}
