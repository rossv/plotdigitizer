
import Tesseract from 'tesseract.js';

export interface Region {
    x: number;
    y: number;
    w: number;
    h: number;
}

const UPSCALE = 2.5;

export const recognizeText = async (
    imageSource: string | HTMLImageElement | HTMLCanvasElement,
    region: Region,
    options?: {
        whitelist?: string;
        worker?: Tesseract.Worker;
    }
): Promise<string> => {
    const scaledW = Math.round(region.w * UPSCALE);
    const scaledH = Math.round(region.h * UPSCALE);

    const canvas = document.createElement('canvas');
    canvas.width = scaledW;
    canvas.height = scaledH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not create canvas context");

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

    // Draw crop upscaled
    ctx.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, scaledW, scaledH);

    // Grayscale + adaptive binarization using mean as threshold
    const imageData = ctx.getImageData(0, 0, scaledW, scaledH);
    const data = imageData.data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const mean = sum / (data.length / 4);
    const threshold = mean * 0.85;

    for (let i = 0; i < data.length; i += 4) {
        const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const val = gray < threshold ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = val;
        data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');

    const ownWorker = !options?.worker;
    const worker = options?.worker ?? await Tesseract.createWorker('eng');

    await worker.setParameters({
        tessedit_char_whitelist: options?.whitelist ?? '0123456789.-',
    });

    const { data: { text } } = await worker.recognize(dataUrl);

    if (ownWorker) await worker.terminate();

    return text.trim();
};
