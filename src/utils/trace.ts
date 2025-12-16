import { smartWandTrace } from './smartWand';

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

    const visited = new Set<string>();
    const getKey = (x: number, y: number) => `${x},${y}`;

    const isMatch = (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const diff = Math.abs(r - targetColor.r) + Math.abs(g - targetColor.g) + Math.abs(b - targetColor.b);
        return diff <= tolerance;
    };

    const getBestNeighbor = (cx: number, cy: number, exclude: Set<string>, lastDx: number, lastDy: number): { point: { x: number, y: number }, dx: number, dy: number } | null => {
        const neighbors = [
            { x: cx + 1, y: cy }, { x: cx - 1, y: cy },
            { x: cx, y: cy + 1 }, { x: cx, y: cy - 1 },
            { x: cx + 1, y: cy + 1 }, { x: cx - 1, y: cy - 1 },
            { x: cx + 1, y: cy - 1 }, { x: cx - 1, y: cy + 1 }
        ];

        let bestN: { point: { x: number, y: number }, dx: number, dy: number } | null = null;
        let minScore = Infinity;

        // Normalize last direction to avoid scaling issues (approximation)
        // If lastDx/Dy are 0 (start), penalty is 0.
        const hasMomentum = lastDx !== 0 || lastDy !== 0;

        for (const n of neighbors) {
            const key = getKey(n.x, n.y);
            if (visited.has(key) || exclude.has(key)) continue;

            if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;

            const idx = (n.y * width + n.x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const colorDiff = Math.abs(r - targetColor.r) + Math.abs(g - targetColor.g) + Math.abs(b - targetColor.b);

            if (colorDiff <= tolerance) {
                // Score = ColorDiff + AnglePenalty
                // AnglePenalty: prefer dot product > 0.

                let anglePenalty = 0;
                if (hasMomentum) {
                    const ndx = n.x - cx;
                    const ndy = n.y - cy;
                    // Dot product: lastDx*ndx + lastDy*ndy
                    // We want to penalize negative dot products (reversals) or sharp turns.
                    // Simple heuristic: 
                    // Aligned (same dir): dot > 0.
                    // 90 deg: dot = 0.
                    // 180 deg: dot < 0.

                    const dot = lastDx * ndx + lastDy * ndy;

                    // Normalize lengths roughly?
                    // neighbors are length 1 or 1.414. lastDir is 1 or 1.414.
                    // Let's just use sign and magnitude.

                    if (dot < 0) {
                        anglePenalty = 2000; // Strong penalty for going backward against momentum
                    } else if (dot === 0) {
                        anglePenalty = 200; // Significant penalty for 90 degree turn
                    } else {
                        anglePenalty = 0; // No penalty for forward moves
                    }
                }

                const score = colorDiff + anglePenalty;

                if (score < minScore) {
                    minScore = score;
                    bestN = { point: n, dx: n.x - cx, dy: n.y - cy };
                }
            }
        }
        return bestN;
    };

    // 1. Start Point
    const start = { x: Math.round(startX), y: Math.round(startY) };
    if (!isMatch(start.x, start.y)) return [];

    visited.add(getKey(start.x, start.y));
    const deque: { x: number, y: number }[] = [start];

    // 2. Walk Forward
    // We walk as far as we can in one direction
    let current = start;
    let lastDx = 0;
    let lastDy = 0;
    let MAX_STEPS = 10000;
    let steps = 0;

    while (steps < MAX_STEPS) {
        // For the very first step, we don't have momentum.
        // But once we pick a neighbor, we set momentum.
        const result = getBestNeighbor(current.x, current.y, new Set(), lastDx, lastDy);
        if (result) {
            visited.add(getKey(result.point.x, result.point.y));
            deque.push(result.point);
            current = result.point;
            lastDx = result.dx;
            lastDy = result.dy;
            steps++;
        } else {
            break;
        }
    }

    // 3. Walk Backward
    // Start from original point again. Reset momentum?
    // We want to go in the "opposite" direction of the first step we took?
    // Actually, we just want to find *any* valid unvisited neighbor from start.
    // And then establish momentum from *that* direction.

    current = start;
    lastDx = 0;
    lastDy = 0;
    steps = 0;

    // Check neighbors of start to find the backward path start
    // const backStart = getBestNeighbor(current.x, current.y, new Set(), 0, 0); // No momentum for first step back logic

    // if (backStart) {
    //     // Found a path 
    //     // Note: visited check inside getBestNeighbor ensures we don't go down the Forward path

    //     // But wait, the loop below handles steps.
    //     // We just reset current and momentum and let the loop run.
    //     // However, we need to handle the fact that getBestNeighbor takes lastDx.
    //     // If we pass 0,0, it picks best color match.
    // }

    while (steps < MAX_STEPS) {
        const result = getBestNeighbor(current.x, current.y, new Set(), lastDx, lastDy);
        if (result) {
            visited.add(getKey(result.point.x, result.point.y));
            deque.unshift(result.point); // Add to start of array
            current = result.point;
            // IMPORTANT: For backward walk, the "direction of movement" relative to the line 
            // is actually *away* from start.
            // But we are adding to the *front* of the deque.
            // So physically we are moving away. Momentum logic still holds:
            // "Don't turn around relative to how you are walking right now".
            lastDx = result.dx;
            lastDy = result.dy;
            steps++;
        } else {
            break;
        }
    }

    return deque;
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

// Polyline Simplification
export const simplifyRDP = (points: { x: number, y: number }[], epsilon: number): { x: number, y: number }[] => {
    if (points.length < 3) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const x1 = points[0].x, y1 = points[0].y;
        const x2 = points[end].x, y2 = points[end].y;
        const x0 = points[i].x, y0 = points[i].y;

        let d = 0;
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx === 0 && dy === 0) {
            d = Math.sqrt((x0 - x1) ** 2 + (y0 - y1) ** 2);
        } else {
            const num = Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1);
            const den = Math.sqrt(dx * dx + dy * dy);
            d = num / den;
        }

        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > epsilon) {
        const recResults1 = simplifyRDP(points.slice(0, index + 1), epsilon);
        const recResults2 = simplifyRDP(points.slice(index), epsilon);
        return [...recResults1.slice(0, -1), ...recResults2];
    } else {
        return [points[0], points[end]];
    }
};

// Resample Points (Interpolation)
export const resamplePoints = (points: { x: number; y: number }[], count: number): { px: number; py: number }[] => {
    if (count < 2 || points.length < 2) {
        return points.map(p => ({ px: p.x, py: p.y }));
    }

    const resultPoints: { px: number; py: number }[] = [];
    const cumLengths: number[] = [0];
    let totalLength = 0;

    // Ensure points are unique to avoid zero-length segments
    const uniquePoints = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const p = points[i];
        const prev = uniquePoints[uniquePoints.length - 1];
        if (Math.abs(p.x - prev.x) > 0.001 || Math.abs(p.y - prev.y) > 0.001) {
            uniquePoints.push(p);
        }
    }

    if (uniquePoints.length < 2) {
        return uniquePoints.map(p => ({ px: p.x, py: p.y }));
    }

    // Calculate lengths
    for (let i = 1; i < uniquePoints.length; i++) {
        const dx = uniquePoints[i].x - uniquePoints[i - 1].x;
        const dy = uniquePoints[i].y - uniquePoints[i - 1].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        totalLength += dist;
        cumLengths.push(totalLength);
    }

    const stepLength = totalLength / (count - 1);

    resultPoints.push({ px: uniquePoints[0].x, py: uniquePoints[0].y });

    let idx = 0; // Segment index

    for (let i = 1; i < count - 1; i++) {
        const currentTarget = i * stepLength;

        // Find segment
        while (idx < cumLengths.length - 2 && currentTarget > cumLengths[idx + 1]) {
            idx++;
        }

        const segStartDist = cumLengths[idx];
        const segEndDist = cumLengths[idx + 1];
        const segLen = segEndDist - segStartDist;

        let t = 0;
        if (segLen > 0.000001) {
            t = (currentTarget - segStartDist) / segLen;
        }
        t = Math.max(0, Math.min(1, t));

        const p0 = uniquePoints[idx];
        const p1 = uniquePoints[idx + 1];

        resultPoints.push({
            px: p0.x + (p1.x - p0.x) * t,
            py: p0.y + (p1.y - p0.y) * t
        });
    }

    const lastP = uniquePoints[uniquePoints.length - 1];
    resultPoints.push({ px: lastP.x, py: lastP.y });

    return resultPoints;
};
