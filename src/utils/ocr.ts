
import Tesseract from 'tesseract.js';

export interface Region {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const recognizeText = async (
    imageSource: string | HTMLImageElement | HTMLCanvasElement,
    region: Region,
    options?: {
        whitelist?: string;
    }
): Promise<string> => {
    // Create an offscreen canvas to crop the image
    const canvas = document.createElement('canvas');
    canvas.width = region.w;
    canvas.height = region.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not create canvas context");

    // Load image if string
    let img: HTMLImageElement | HTMLCanvasElement;
    if (typeof imageSource === 'string') {
        img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.crossOrigin = 'Anonymous';
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = imageSource;
        });
    } else {
        img = imageSource;
    }

    // Draw crop
    ctx.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);

    // Pre-processing?
    // Tesseract works best on black text on white background.
    // We can try to invert if detected as dark background, or threshold.
    // For now, let's dump the raw crop.
    // Convert to grayscale and high contrast might help.
    const imageData = ctx.getImageData(0, 0, region.w, region.h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        // Simple binarizaton
        // const val = avg > 128 ? 255 : 0;
        // data[i] = data[i + 1] = data[i + 2] = val;

        // Let's just do grayscale for now to reduce color noise
        data[i] = data[i + 1] = data[i + 2] = avg;
    }
    ctx.putImageData(imageData, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');

    // OCR
    // We restrict whitelist to numbers and simple chars
    const worker = await Tesseract.createWorker('eng');

    if (options?.whitelist) {
        await worker.setParameters({
            tessedit_char_whitelist: options.whitelist,
        });
    } else {
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789.-',
        });
    }

    const { data: { text } } = await worker.recognize(dataUrl);

    await worker.terminate();

    return text.trim();
};
