import { useState, useCallback } from 'react';
import { useStore } from '../store';
import { loadPdfDocument } from '../utils/pdf-utils';
import testPlotUrl from '../assets/test_plot.svg';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function useFileHandler() {
    const { setImageUrl, openModal } = useStore();
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);

    const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            const url = URL.createObjectURL(file);

            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                try {
                    const pdf = await loadPdfDocument(url);
                    setPdfDocument(pdf);
                } catch (error) {
                    console.error("Failed to load PDF", error);
                    openModal({ type: 'alert', message: "Failed to load PDF file is it valid?" });
                }
            } else {
                setImageUrl(url);
            }
        }
    }, [setImageUrl, openModal]);

    const loadTestImage = useCallback(async () => {
        try {
            const response = await fetch(testPlotUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setImageUrl(url);
        } catch (e) {
            console.error("Failed to load test image", e);
        }
    }, [setImageUrl]);

    return {
        pdfDocument,
        setPdfDocument,
        handleFile,
        loadTestImage
    };
}
