export const traceLine = (
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    targetColor: { r: number; g: number; b: number },
    tolerance: number = 50
): { x: number; y: number }[] => {
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

        // Add to result
        points.push({ x, y });

        // Check neighbors
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

    // Optimize points? Keep all for now, maybe downsample later.
    // Sort them? BFS explores in waves, so they might not be strictly ordered by line path.
    // For now return raw cloud of points.
    return points;
};
