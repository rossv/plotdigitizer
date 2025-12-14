
import { getBlob, getBlobOrientation } from './blobUtils';

type Point = { x: number; y: number };

// Min Priority Queue
class PriorityQueue<T> {
    private heap: { node: T; priority: number }[] = [];

    push(node: T, priority: number) {
        this.heap.push({ node, priority });
        this.bubbleUp();
    }

    pop(): T | undefined {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0];
        const bottom = this.heap.pop();
        if (this.heap.length > 0 && bottom) {
            this.heap[0] = bottom;
            this.bubbleDown();
        }
        return top.node;
    }

    size() { return this.heap.length; }

    private bubbleUp() {
        let index = this.heap.length - 1;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.heap[parent].priority <= this.heap[index].priority) break;
            [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
            index = parent;
        }
    }

    private bubbleDown() {
        let index = 0;
        while (true) {
            const left = 2 * index + 1;
            const right = 2 * index + 2;
            let smallest = index;

            if (left < this.heap.length && this.heap[left].priority < this.heap[smallest].priority) smallest = left;
            if (right < this.heap.length && this.heap[right].priority < this.heap[smallest].priority) smallest = right;

            if (smallest === index) break;
            [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
            index = smallest;
        }
    }
}

// Helper to get pixel color diff
const getDiff = (data: Uint8ClampedArray, width: number, x: number, y: number, target: { r: number, g: number, b: number }) => {
    const idx = (y * width + x) * 4;
    return Math.abs(data[idx] - target.r) + Math.abs(data[idx + 1] - target.g) + Math.abs(data[idx + 2] - target.b);
}

export const traceCostBased = (
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    targetColor: { r: number; g: number; b: number },
    tolerance: number = 50
): Point[] => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Weights configuration
    const W_COLOR = 1.0;
    const W_TURN = 8.0;   // High penalty for turning to ensure straight lines/smooth curves
    const W_GAP = 5.0;    // Cost added when in "white space"

    // Get initial orientation to seed the bidirectional search
    const startBlob = getBlob(data, width, height, Math.round(startX), Math.round(startY), targetColor, tolerance);
    let initialAngle = 0;

    if (startBlob && startBlob.points.length > 5) {
        initialAngle = getBlobOrientation(startBlob);
    } else {
        // Fallback: Check local neighborhood gradients or just 0
        initialAngle = 0;
    }

    const traceDirection = (startAngle: number): Point[] => {
        // State: x, y, angle (momentum), cost, path
        const pq = new PriorityQueue<{ x: number, y: number, angle: number, cost: number, path: Point[] }>();

        pq.push({
            x: Math.round(startX),
            y: Math.round(startY),
            angle: startAngle,
            cost: 0,
            path: [{ x: Math.round(startX), y: Math.round(startY) }]
        }, 0);

        const localVisited = new Map<string, number>(); // x,y -> minCost

        // We track the "Best Path" found so far (longest valid path)
        let longestPath: Point[] = [];

        // Hard limits to prevent infinite loops / freezes
        const MAX_STEPS = 5000;
        const MAX_PATH_LEN = 1500;
        let iter = 0;

        while (pq.size() > 0 && iter < MAX_STEPS) {
            const current = pq.pop()!;
            iter++;

            if (current.path.length > longestPath.length) {
                longestPath = current.path;
            }

            if (current.path.length >= MAX_PATH_LEN) continue;

            // Generate 8-connected neighbors
            const neighbors = [
                { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 },
                { x: current.x + 1, y: current.y + 1 }, { x: current.x - 1, y: current.y - 1 },
                { x: current.x + 1, y: current.y - 1 }, { x: current.x - 1, y: current.y + 1 }
            ];

            for (const n of neighbors) {
                if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;

                // 1. Calculate Angle info
                const dx = n.x - current.x;
                const dy = n.y - current.y;
                const angle = Math.atan2(dy, dx);

                // Helper for angle diff
                let angleDiff = Math.abs(angle - current.angle);
                while (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff; // Normalize to [0, PI]

                // CONSTRAINT: No reversals. Must move generally "forward" (+/- 90 deg)
                // This acts as the "Momentum" constraint preventing backtracking
                if (angleDiff > Math.PI / 1.8) continue;

                // 2. Costs
                // A. Turn Cost
                const turnPenalty = angleDiff * W_TURN;

                // B. Color/Gap Cost
                const diff = getDiff(data, width, n.x, n.y, targetColor);
                let pixelCost = 0;
                if (diff <= tolerance) {
                    // Good pixel
                    pixelCost = (diff / 255) * W_COLOR;
                } else {
                    // Gap pixel - High cost
                    pixelCost = W_GAP + (diff / 255) * W_COLOR;
                }

                // Total Step Cost
                const stepCost = 1 + pixelCost + turnPenalty;
                const newTotalCost = current.cost + stepCost;

                // 3. Pruning / Visited
                // If we have visited this pixel with a LOWER cost, ignore this path.
                const key = `${n.x},${n.y}`;
                if (localVisited.has(key) && localVisited.get(key)! <= newTotalCost) continue;
                localVisited.set(key, newTotalCost);

                // 4. "Cost Density" Pruning
                // If the average cost per pixel is too high, it means we are forcing our way through noise or empty space.
                // Allow some leeway at start, but clamp down as path grows.
                const avgCost = newTotalCost / (current.path.length + 1);
                // Threshold: 
                // Solid line (0 diff) -> ~1.0
                // Gap (white) -> ~1 + 5 = 6.0
                // We want to allow gap jumping (avg cost will rise), but not indefinitely.
                // let's say max average cost 5.0?
                if (avgCost > 4.0 && current.path.length > 10) continue;

                pq.push({
                    x: n.x,
                    y: n.y,
                    angle: angle,
                    cost: newTotalCost,
                    path: [...current.path, n] // Note: JS array spread is O(N), for 1500 items it's acceptable but not optimal. 
                }, newTotalCost);
            }
        }
        return longestPath;
    };

    // Run Bi-directional
    const pathForward = traceDirection(initialAngle);
    // Reverse initial angle for backward search
    // Note: traceDirection includes start point. We'll need to merge carefully.
    const pathBackward = traceDirection(initialAngle + Math.PI);

    // Merge: Backward (reversed) + Forward (slice 1 to avoid double start)
    return [...pathBackward.reverse(), ...pathForward.slice(1)];
};
