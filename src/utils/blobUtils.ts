
type Point = { x: number; y: number };

// Basic flood fill to get a blob (connected component)
// Returns all points in the blob and its centroid
export const getBlob = (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    startX: number,
    startY: number,
    targetColor: { r: number; g: number; b: number },
    tolerance: number
): { points: Point[], centroid: Point, bounds: { minX: number, maxX: number, minY: number, maxY: number } } | null => {

    // Check start color first
    const getKey = (x: number, y: number) => `${x},${y}`;
    const visited = new Set<string>();
    const queue: Point[] = [{ x: startX, y: startY }];
    const points: Point[] = [];

    let sumX = 0;
    let sumY = 0;
    let minX = startX, maxX = startX, minY = startY, maxY = startY;

    // Helper for diff
    const getDiff = (x: number, y: number) => {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        return Math.abs(r - targetColor.r) + Math.abs(g - targetColor.g) + Math.abs(b - targetColor.b);
    };

    if (getDiff(startX, startY) > tolerance) return null;

    visited.add(getKey(startX, startY));

    // Limit blob size to prevent hanging on huge fills (e.g. background)
    const MAX_BLOB_SIZE = 5000;

    while (queue.length > 0) {
        if (points.length > MAX_BLOB_SIZE) break;

        const { x, y } = queue.shift()!;
        points.push({ x, y });
        sumX += x;
        sumY += y;

        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);

        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 }
        ];

        for (const n of neighbors) {
            if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
            const k = getKey(n.x, n.y);
            if (visited.has(k)) continue;

            if (getDiff(n.x, n.y) <= tolerance) {
                visited.add(k);
                queue.push(n);
            }
        }
    }

    if (points.length === 0) return null;

    return {
        points,
        centroid: { x: sumX / points.length, y: sumY / points.length },
        bounds: { minX, maxX, minY, maxY }
    };
};

// Calculate orientation (angle) using second-order image moments (PCA equivalent)
export const getBlobOrientation = (blob: { points: Point[], centroid: Point }): number => {
    let mu20 = 0;
    let mu02 = 0;
    let mu11 = 0;

    for (const p of blob.points) {
        const dx = p.x - blob.centroid.x;
        const dy = p.y - blob.centroid.y;
        mu20 += dx * dx;
        mu02 += dy * dy;
        mu11 += dx * dy;
    }

    // Angle of principal axis
    // range: -PI/2 to PI/2 usually, but atan2 gives -PI to PI
    // 0.5 * atan2(2*mu11, mu20 - mu02)
    const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
    return theta;
};
