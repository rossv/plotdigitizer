import * as pdfjsLib from 'pdfjs-dist';

// Initialize worker
// We'll point to the local worker file we're copying to public/
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface PdfPageInfo {
    pageNumber: number;
    width: number;
    height: number;
}

export const loadPdfDocument = async (url: string) => {
    const loadingTask = pdfjsLib.getDocument(url);
    return await loadingTask.promise;
};

export const renderPdfPageToDataUrl = async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number, scale = 2.0): Promise<string> => {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
        throw new Error('Could not get canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
        canvasContext: context,
        viewport: viewport,
    } as any).promise;

    return canvas.toDataURL('image/png');
};
