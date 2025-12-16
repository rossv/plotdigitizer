import cv from '@techstark/opencv-js';

export interface CalibrationPoints {
    xAxis: { p1: { x: number; y: number }; p2: { x: number; y: number } };
    yAxis: { p1: { x: number; y: number }; p2: { x: number; y: number } };
}

// Helper to load image
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};

export const detectAxes = async (imageUrl: string): Promise<CalibrationPoints> => {
    // Ensure OpenCV is ready (it might be async in some builds, but usually this package is sync-ish or returns prompt)
    // @techstark/opencv-js is often a direct port.
    // Sometimes we need to wait for cv.onRuntimeInitialized.
    // But let's try direct usage. If it fails, we might need a loader.

    if (!cv || !cv.Mat) {
        throw new Error("OpenCV not loaded properly");
    }

    const image = await loadImage(imageUrl);
    const src = cv.imread(image);
    const dst = new cv.Mat();
    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const lines = new cv.Mat();

    try {
        // Pre-processing
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        // Gaussian Blur to reduce noise
        const ksize = new cv.Size(5, 5);
        cv.GaussianBlur(gray, gray, ksize, 0, 0, cv.BORDER_DEFAULT);

        // Canny Edge Detection
        cv.Canny(gray, edges, 50, 150, 3);

        // Hough Line Transform
        // threshold: minimum number of intersections to detect a line
        // minLineLength: minimum number of points that can form a line
        // maxLineGap: maximum gap between two points to be considered in the same line
        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 50, 10);

        const horizontalLines: { x1: number, y1: number, x2: number, y2: number, len: number }[] = [];
        const verticalLines: { x1: number, y1: number, x2: number, y2: number, len: number }[] = [];

        for (let i = 0; i < lines.rows; ++i) {
            const x1 = lines.data32S[i * 4];
            const y1 = lines.data32S[i * 4 + 1];
            const x2 = lines.data32S[i * 4 + 2];
            const y2 = lines.data32S[i * 4 + 3];

            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);

            // Horizontal: angle near 0 or 180
            if (angle < 5 || angle > 175) {
                horizontalLines.push({ x1, y1, x2, y2, len });
            }
            // Vertical: angle near 90
            if (Math.abs(angle - 90) < 5) {
                verticalLines.push({ x1, y1, x2, y2, len });
            }
        }

        // Heuristic: The main axes are likely long and near the bottom/left edges of the plot area.
        // However, plots often have borders.
        // Let's sort by length first.
        horizontalLines.sort((a, b) => b.len - a.len);
        verticalLines.sort((a, b) => b.len - a.len);

        // We need to find ONE best X axis and ONE best Y axis that likely intersect.
        // For now, let's pick the longest ones and see if they make sense (intersection).
        // A better heuristic is finding lines that form a bounding box or "L" shape.

        // Let's filter lines that are too short (covered by Hough params, but extra check OK)

        // Ideally, X axis is at the bottom of the content, Y axis is at the left.
        // But pixel coordinates: (0,0) is top-left.
        // So X axis usually has high Y value, Y axis has low X value.

        // Let's take top 5 long lines of each and find the pair that intersects near their endpoints (forming an L).

        let bestXLine = horizontalLines[0];
        let bestYLine = verticalLines[0];

        // If we assume the graph is in the standard quadrant (L shape bottom-left),
        // The intersection should be minObservedY of X-line and maxObservedX of Y-line? 
        // Actually, intersection is: x = valid, y = valid.

        // Let's refine:
        // Simply picking longest might pick the top border or right border.
        // We prefer "Bottom" for X and "Left" for Y, usually.
        // BUT, Y axis text is to the left, labels below X.

        // Let's try to find an intersection point that is roughly bounded by the image.

        // Fallback: just take the longest. If user sends a box, we might get top/right.
        // Let's iterate and score:
        // Score = Length + (IsBottom ? Bonus : 0) + (IsLeft ? Bonus : 0)
        // "Bottom" means y > image.height / 2
        // "Left" means x < image.width / 2

        const h = image.height;
        const w = image.width;

        const scoreH = (l: typeof horizontalLines[0]) => {
            const midY = (l.y1 + l.y2) / 2;
            const isBottom = midY > h * 0.5;
            // Prefer lines that are not at the very edge (frame), but close.
            // Actually, axis lines ARE often the user drawing.
            return l.len + (isBottom ? 100 : 0);
        };

        const scoreV = (l: typeof verticalLines[0]) => {
            const midX = (l.x1 + l.x2) / 2;
            const isLeft = midX < w * 0.5;
            return l.len + (isLeft ? 100 : 0);
        };

        if (horizontalLines.length > 0) {
            bestXLine = horizontalLines.reduce((prev, curr) => scoreH(curr) > scoreH(prev) ? curr : prev);
        }

        if (verticalLines.length > 0) {
            bestYLine = verticalLines.reduce((prev, curr) => scoreV(curr) > scoreV(prev) ? curr : prev);
        }

        if (!bestXLine || !bestYLine) {
            throw new Error("Could not detect both axes");
        }

        // Calculate approximate intersection
        // Assuming horizontal line is y = y_h
        // Vertical line is x = x_v
        const axisY = (bestXLine.y1 + bestXLine.y2) / 2;
        const axisX = (bestYLine.x1 + bestYLine.x2) / 2;

        // Intersection (Origin candidate)
        const origin = { x: axisX, y: axisY };

        // P1 = Origin (usually)
        // P2 = Far end of the axis

        // For X Axis:
        // P1 is Origin (axisX, axisY).
        // P2 should be the endpoint of the line furthest from Origin.
        const distX1 = Math.abs(bestXLine.x1 - axisX);
        const distX2 = Math.abs(bestXLine.x2 - axisX);
        const xP2x = distX1 > distX2 ? bestXLine.x1 : bestXLine.x2;
        const xP2 = { x: xP2x, y: axisY };

        // For Y Axis:
        // P1 is Origin (axisX, axisY).
        // P2 should be the endpoint furthest from Origin.
        const distY1 = Math.abs(bestYLine.y1 - axisY);
        const distY2 = Math.abs(bestYLine.y2 - axisY);
        const yP2y = distY1 > distY2 ? bestYLine.y1 : bestYLine.y2;
        const yP2 = { x: axisX, y: yP2y };

        // However, currently P1/P2 order usually matches min/max values.
        // If graph is standard Cartesian:
        // X Axis: Left -> Right (Low -> High)
        // Y Axis: Bottom -> Top (Low -> High)

        // So X P1 = (Low X, Axis Y) = Origin
        // X P2 = (High X, Axis Y)

        // Y P1 = (Axis X, Low Y (visually bottom)) = Origin
        // Y P2 = (Axis X, High Y (visually top))

        // Note: In pixel coords, Y increases downwards.
        // So "Visually Bottom" = High Pixel Y. "Visually Top" = Low Pixel Y.
        // Origin is at High Pixel Y (Bottom-Left).

        return {
            xAxis: {
                p1: origin,
                p2: xP2
            },
            yAxis: {
                p1: origin,
                p2: yP2
            }
        };

    } finally {
        // Cleanup
        src.delete();
        dst.delete();
        gray.delete();
        edges.delete();
        lines.delete();
    }
};
