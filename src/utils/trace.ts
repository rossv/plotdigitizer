import { smartWandTrace } from './smartWand';

export const traceLine = (
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    targetColor: { r: number; g: number; b: number },
    tolerance: number = 50
): { x: number; y: number }[] => {
    // Existing Simple Fill
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const queue: { x: number; y: number }[] = [{ x: Math.round(startX), y: Math.round(startY) }];
    const visited = new Set<string>();
    const points: { x: number; y: number }[] = [];

    const getKey = (x: number, y: number) => `${x},${y}`;
    visited.add(getKey(startX, startY));

    // Limit iterations to prevent freezing
    let iterations = 0;
    const MAX_ITERATIONS = 50000;

    while (queue.length > 0 && iterations < MAX_ITERATIONS) {
        const { x, y } = queue.shift()!;
        iterations++;
        points.push({ x, y });

        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 },
            { x: x + 1, y: y + 1 }, { x: x - 1, y: y - 1 },
            { x: x + 1, y: y - 1 }, { x: x - 1, y: y + 1 }
        ];

        for (const n of neighbors) {
            if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
            const key = getKey(n.x, n.y);
            if (visited.has(key)) continue;

            const idx = (n.y * width + n.x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const diff = Math.abs(r - targetColor.r) + Math.abs(g - targetColor.g) + Math.abs(b - targetColor.b);

            if (diff <= tolerance) {
                visited.add(key);
                queue.push(n);
            }
        }
    }
    return points;
};


// The Advanced Tracer
export const traceLinePath = (
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,

): { x: number; y: number }[] => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);

    // Use improved Smart Wand algorithm
    // Note: targetColor is ignored by smartWandTrace as it uses robust statistics from the seed neighborhood
    return smartWandTrace(imageData, { x: startX, y: startY });
};
