import { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { loadPdfDocument } from '../utils/pdf-utils';
import testPlotUrl from '../assets/test_plot.svg';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function useFileHandler() {
    const { setImageUrl, openModal } = useStore();
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
    // This hook owns blob URLs used as active image sources. Revoke when replaced or unmounted.
    const currentImageObjectUrlRef = useRef<string | null>(null);

    const setOwnedImageUrl = useCallback((nextUrl: string) => {
        if (currentImageObjectUrlRef.current) {
            URL.revokeObjectURL(currentImageObjectUrlRef.current);
        }
        currentImageObjectUrlRef.current = nextUrl;
        setImageUrl(nextUrl);
    }, [setImageUrl]);

    useEffect(() => {
        return () => {
            if (currentImageObjectUrlRef.current) {
                URL.revokeObjectURL(currentImageObjectUrlRef.current);
                currentImageObjectUrlRef.current = null;
            }
        };
    }, []);

    const processFile = useCallback(async (file: File) => {
        const url = URL.createObjectURL(file);

        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            // PDF loader only needs the object URL during initial load, so this code path revokes immediately after load attempt.
            try {
                const pdf = await loadPdfDocument(url);
                setPdfDocument(pdf);
            } catch (error) {
                console.error("Failed to load PDF", error);
                openModal({ type: 'alert', message: "Failed to load PDF file is it valid?" });
            } finally {
                URL.revokeObjectURL(url);
            }
        } else {
            setOwnedImageUrl(url);
        }
    }, [setOwnedImageUrl, openModal]);

    const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            await processFile(e.target.files[0]);
        }
    }, [processFile]);

    const loadTestImage = useCallback(async () => {
        try {
            const response = await fetch(testPlotUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setOwnedImageUrl(url);
        } catch (e) {
            console.error("Failed to load test image", e);
        }
    }, [setOwnedImageUrl]);

    return {
        pdfDocument,
        setPdfDocument,
        handleFile,
        processFile,
        loadTestImage
    };
}
