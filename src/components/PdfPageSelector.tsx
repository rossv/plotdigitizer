import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { renderPdfPageToDataUrl } from '../utils/pdf-utils';
import { useStore } from '../store';

interface PdfPageSelectorProps {
    pdfDocument: pdfjsLib.PDFDocumentProxy;
    onSelectPage: (dataUrl: string) => void;
    onCancel: () => void;
}

export const PdfPageSelector: React.FC<PdfPageSelectorProps> = ({ pdfDocument, onSelectPage, onCancel }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { openModal } = useStore();

    const totalPages = pdfDocument.numPages;

    useEffect(() => {
        let active = true;
        const loadPreview = async () => {
            setIsLoading(true);
            try {
                const url = await renderPdfPageToDataUrl(pdfDocument, currentPage, 1.5); // Lower scale for preview
                if (active) {
                    setPreviewUrl(url);
                }
            } catch (error) {
                console.error('Failed to render preview', error);
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };

        loadPreview();
        return () => { active = false; };
    }, [pdfDocument, currentPage]);

    const handlePrev = () => {
        if (currentPage > 1) setCurrentPage(p => p - 1);
    };

    const handleNext = () => {
        if (currentPage < totalPages) setCurrentPage(p => p + 1);
    };

    const handleImport = async () => {
        setIsLoading(true);
        try {
            // High quality render for import
            const url = await renderPdfPageToDataUrl(pdfDocument, currentPage, 3.0);
            onSelectPage(url);
        } catch (error) {
            console.error('Failed to render final page', error);
            openModal({ type: 'alert', message: 'Failed to import page' });
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl p-6 flex flex-col gap-4 max-h-[90vh]">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Select Page</h2>
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Page {currentPage} of {totalPages}
                    </span>
                </div>

                <div className="flex-1 overflow-hidden bg-slate-100 dark:bg-slate-950 rounded-xl relative flex items-center justify-center border border-slate-200 dark:border-slate-800">
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    )}
                    {previewUrl ? (
                        <img
                            src={previewUrl}
                            alt={`Page ${currentPage}`}
                            className="max-w-full max-h-full object-contain shadow-lg"
                        />
                    ) : (
                        <div className="text-slate-400">Loading preview...</div>
                    )}
                </div>

                <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrev}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                        >
                            <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-sm shadow-blue-500/20 disabled:opacity-50"
                        >
                            <Check className="w-4 h-4" />
                            Import Page
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
