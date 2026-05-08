import cv from '@techstark/opencv-js';

export interface CalibrationPoints {
    xAxis: { p1: { x: number; y: number }; p2: { x: number; y: number } };
    yAxis: { p1: { x: number; y: number }; p2: { x: number; y: number } };
}

interface LineSegment {
    x1: number; y1: number;
    x2: number; y2: number;
    len: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};

// Merge nearby parallel segments into super-lines.
// For horizontal lines, cluster by Y midpoint; for vertical by X midpoint.
const clusterLines = (
    lines: LineSegment[],
    axis: 'h' | 'v',
    proximityPx: number
): LineSegment[] => {
    if (lines.length === 0) return [];

    const key = (l: LineSegment) => axis === 'h'
        ? (l.y1 + l.y2) / 2
        : (l.x1 + l.x2) / 2;

    const sorted = [...lines].sort((a, b) => key(a) - key(b));
    const clusters: LineSegment[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
        const last = clusters[clusters.length - 1];
        const lastMid = last.reduce((s, l) => s + key(l), 0) / last.length;
        if (Math.abs(key(sorted[i]) - lastMid) <= proximityPx) {
            last.push(sorted[i]);
        } else {
            clusters.push([sorted[i]]);
        }
    }

    return clusters.map(group => {
        const totalLen = group.reduce((s, l) => s + l.len, 0);
        if (axis === 'h') {
            const avgY = group.reduce((s, l) => s + (l.y1 + l.y2) / 2, 0) / group.length;
            const minX = Math.min(...group.map(l => Math.min(l.x1, l.x2)));
            const maxX = Math.max(...group.map(l => Math.max(l.x1, l.x2)));
            return { x1: minX, y1: avgY, x2: maxX, y2: avgY, len: totalLen };
        } else {
            const avgX = group.reduce((s, l) => s + (l.x1 + l.x2) / 2, 0) / group.length;
            const minY = Math.min(...group.map(l => Math.min(l.y1, l.y2)));
            const maxY = Math.max(...group.map(l => Math.max(l.y1, l.y2)));
            return { x1: avgX, y1: minY, x2: avgX, y2: maxY, len: totalLen };
        }
    });
};

export const detectAxes = async (imageUrl: string): Promise<CalibrationPoints> => {
    if (!cv || !cv.Mat) {
        throw new Error("OpenCV not loaded properly");
    }

    const image = await loadImage(imageUrl);
    const src = cv.imread(image);
    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const lines = new cv.Mat();
    const dst = new cv.Mat();

    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        const ksize = new cv.Size(5, 5);
        cv.GaussianBlur(gray, gray, ksize, 0, 0, cv.BORDER_DEFAULT);
        cv.Canny(gray, edges, 50, 150, 3);
        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 50, 10);

        const h = image.height;
        const w = image.width;
        const minLen = Math.max(w, h) * 0.15;

        const rawH: LineSegment[] = [];
        const rawV: LineSegment[] = [];

        for (let i = 0; i < lines.rows; ++i) {
            const x1 = lines.data32S[i * 4];
            const y1 = lines.data32S[i * 4 + 1];
            const x2 = lines.data32S[i * 4 + 2];
            const y2 = lines.data32S[i * 4 + 3];

            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < minLen) continue;

            const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);

            if (angle < 5 || angle > 175) rawH.push({ x1, y1, x2, y2, len });
            if (Math.abs(angle - 90) < 5) rawV.push({ x1, y1, x2, y2, len });
        }

        const clusteredH = clusterLines(rawH, 'h', 8);
        const clusteredV = clusterLines(rawV, 'v', 8);

        // Score horizontal lines: peak when Y is in the bottom 25%, penalty near very edge (top/bottom 3%)
        const scoreH = (l: LineSegment) => {
            const midY = (l.y1 + l.y2) / 2;
            const relY = midY / h; // 0 = top, 1 = bottom
            // Gaussian-ish peak at relY = 0.875 (bottom quarter), decay toward edges
            const posScore = relY > 0.97 || relY < 0.03
                ? -50  // likely a border frame
                : Math.max(0, 1 - Math.abs(relY - 0.875) / 0.3) * 200;
            return l.len + posScore;
        };

        // Score vertical lines: peak when X is in the left 20%, penalty near very edge
        const scoreV = (l: LineSegment) => {
            const midX = (l.x1 + l.x2) / 2;
            const relX = midX / w; // 0 = left, 1 = right
            const posScore = relX > 0.97 || relX < 0.03
                ? -50
                : Math.max(0, 1 - Math.abs(relX - 0.1) / 0.3) * 200;
            return l.len + posScore;
        };

        if (clusteredH.length === 0 || clusteredV.length === 0) {
            throw new Error("Could not detect both axes");
        }

        const bestXLine = clusteredH.reduce((prev, curr) => scoreH(curr) > scoreH(prev) ? curr : prev);
        const bestYLine = clusteredV.reduce((prev, curr) => scoreV(curr) > scoreV(prev) ? curr : prev);

        const axisY = (bestXLine.y1 + bestXLine.y2) / 2;
        const axisX = (bestYLine.x1 + bestYLine.x2) / 2;

        const origin = { x: axisX, y: axisY };

        const distX1 = Math.abs(bestXLine.x1 - axisX);
        const distX2 = Math.abs(bestXLine.x2 - axisX);
        const xP2x = distX1 > distX2 ? bestXLine.x1 : bestXLine.x2;

        const distY1 = Math.abs(bestYLine.y1 - axisY);
        const distY2 = Math.abs(bestYLine.y2 - axisY);
        const yP2y = distY1 > distY2 ? bestYLine.y1 : bestYLine.y2;

        return {
            xAxis: { p1: origin, p2: { x: xP2x, y: axisY } },
            yAxis: { p1: origin, p2: { x: axisX, y: yP2y } },
        };

    } finally {
        src.delete();
        dst.delete();
        gray.delete();
        edges.delete();
        lines.delete();
    }
};
