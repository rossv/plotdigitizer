
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export type Point = { x: number; y: number };

export type SmartWandOptions = {
  // 1. Adaptive Threshold
  // Window size for local adaptive thresholding (must be odd).
  thresholdWindow: number;
  // Bias for threshold (multiplier of local mean). < 1.0 makes it strictly darker than mean.
  thresholdBias: number;

  // 2. Thickness Gating
  // Fraction of seed thickness to require for valid path pixels.
  thicknessKeepFrac: number;
  // Minimum component size to keep (in pixels).
  minComponent: number;

  // 3. Tube Walking
  // Step size in pixels.
  stepSize: number;
  // Strength of momentum vs new direction (0..1). Higher = smoother turns.
  momentum: number;
  // Max gap to bridge (pixels).
  maxGap: number;
  // Search angle for gap jumping (degrees).
  gapAngle: number;

  // Limits
  maxPoints: number;
  maxSteps: number;

  // Output
  simplifyEps: number;
  resampleStep: number | null;
};

export const DEFAULT_SMART_WAND_OPTIONS: SmartWandOptions = {
  thresholdWindow: 15, // Local window size
  thresholdBias: 0.90, // Strictness of darkness
  thicknessKeepFrac: 0.5, // Keep pixels at least 50% as thick as seed
  minComponent: 30, // Despeckle
  stepSize: 2, // 2px steps
  momentum: 0.8, // Smooth paths
  maxGap: 15,
  gapAngle: 45,
  maxPoints: 8000,
  maxSteps: 5000,
  simplifyEps: 1.0,
  resampleStep: null,
};

type Img = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

// --- 1. Image Processing Utils ---

function getLuma(img: Img, x: number, y: number): number {
  const i = (y * img.width + x) << 2;
  const r = img.data[i];
  const g = img.data[i + 1];
  const b = img.data[i + 2];
  // Fast luma approximation
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Adaptive Thresholding (Simplified Sauvola/Mean).
 * Returns binary mask: 1 = Ink (Dark), 0 = Background (Light)
 */
function adaptiveThreshold(img: Img, opts: SmartWandOptions): Uint8Array {
  const { width: w, height: h } = img;
  const out = new Uint8Array(w * h);
  const win = Math.floor(opts.thresholdWindow / 2);
  const bias = opts.thresholdBias;

  // Integral image for fast mean calculation could be used, but for typical canvas sizes (~1MP),
  // a simple unoptimized sliding window or just direct check is "okay-ish", but Integral Image is strictly better.
  // Let's implement Integral Image for O(1) mean.

  const integral = new Float32Array((w + 1) * (h + 1));

  // Build integral image
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      const val = getLuma(img, x, y);
      rowSum += val;
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }

  const getSum = (x0: number, y0: number, x1: number, y1: number) => {
    // clamp coords
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(w, x1); y1 = Math.min(h, y1);
    return integral[y1 * (w + 1) + x1]
      - integral[y0 * (w + 1) + x1]
      - integral[y1 * (w + 1) + x0]
      + integral[y0 * (w + 1) + x0];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pixel = getLuma(img, x, y);

      const x0 = x - win, y0 = y - win;
      const x1 = x + win + 1, y1 = y + win + 1;
      const count = (Math.min(w, x1) - Math.max(0, x0)) * (Math.min(h, y1) - Math.max(0, y0));

      const sum = getSum(x0, y0, x1, y1);
      const mean = sum / count;

      // Ink is darker than background. 
      // If pixel < mean * bias, it's ink.
      // (Assuming light background, dark ink)
      if (pixel < mean * bias) {
        out[y * w + x] = 1;
      } else {
        out[y * w + x] = 0;
      }
    }
  }

  return out;
}

/**
 * Distance Transform (Chamfer / Chessboard approximation).
 */
function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const dist = new Float32Array(w * h);

  // Init
  for (let i = 0; i < dist.length; i++) dist[i] = mask[i] ? INF : 0;

  // Forward
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let min = dist[i];
      if (x > 0) min = Math.min(min, dist[i - 1] + 1);
      if (y > 0) min = Math.min(min, dist[i - w] + 1);
      if (x > 0 && y > 0) min = Math.min(min, dist[i - w - 1] + 1.414);
      if (x < w - 1 && y > 0) min = Math.min(min, dist[i - w + 1] + 1.414);
      dist[i] = min;
    }
  }

  // Backward
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let min = dist[i];
      if (x < w - 1) min = Math.min(min, dist[i + 1] + 1);
      if (y < h - 1) min = Math.min(min, dist[i + w] + 1);
      if (x < w - 1 && y < h - 1) min = Math.min(min, dist[i + w + 1] + 1.414);
      if (x > 0 && y < h - 1) min = Math.min(min, dist[i + w - 1] + 1.414);
      dist[i] = min;
    }
  }

  // Clamp
  for (let i = 0; i < dist.length; i++) if (dist[i] > 1e5) dist[i] = 0;

  return dist;
}

function removeSmallComponents(mask: Uint8Array, w: number, h: number, minSize: number): Uint8Array {
  const visited = new Uint8Array(w * h);
  const out = mask.slice();
  const stack: number[] = [];

  for (let i = 0; i < w * h; i++) {
    if (!out[i] || visited[i]) continue;

    let count = 0;
    stack.push(i);
    visited[i] = 1;
    const component: number[] = [i];

    while (stack.length) {
      const idx = stack.pop()!;
      count++;
      const x = idx % w;
      const y = Math.floor(idx / w);

      // 8-neighbors
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nidx = ny * w + nx;
            if (out[nidx] && !visited[nidx]) {
              visited[nidx] = 1;
              stack.push(nidx);
              component.push(nidx);
            }
          }
        }
      }
    }

    if (count < minSize) {
      for (const idx of component) out[idx] = 0;
    }
  }
  return out;
}


// --- 2. Ridge Walking Core ---

function interpolateDT(dist: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);

  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return 0;

  const v00 = dist[y0 * w + x0];
  const v10 = dist[y0 * w + x1];
  const v01 = dist[y1 * w + x0];
  const v11 = dist[y1 * w + x1];

  const wx = x - x0;
  const wy = y - y0;

  const i1 = v00 * (1 - wx) + v10 * wx;
  const i2 = v01 * (1 - wx) + v11 * wx;
  return i1 * (1 - wy) + i2 * wy;
}

function normalize(v: { x: number, y: number }) {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function ridgeWalk(
  dist: Float32Array,
  w: number,
  h: number,
  start: Point,
  seedThickness: number,
  opts: SmartWandOptions
): Point[] {
  const pts: Point[] = [];
  const minDT = seedThickness * opts.thicknessKeepFrac;

  // Initial Direction Estimation (PCA or local gradient)
  // Quick hack: Search local max neighborhood to align with tube

  // 1. Refine Start Point (Local Max DT)
  let curr = { ...start };
  // Search small radius for better center
  let bestT = interpolateDT(dist, w, h, curr.x, curr.y);
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = start.x + dx, ny = start.y + dy;
        const val = interpolateDT(dist, w, h, nx, ny);
        if (val > bestT) {
          bestT = val;
          curr = { x: nx, y: ny };
        }
      }
    }
  }

  pts.push(curr);

  // 2. Determine initial direction
  // Look for valid neighbor with highest DT to start moving
  let dir = { x: 0, y: 0 };
  // Scan circle
  let maxN = -1;
  for (let ang = 0; ang < Math.PI * 2; ang += 0.2) {
    const tx = curr.x + Math.cos(ang) * opts.stepSize;
    const ty = curr.y + Math.sin(ang) * opts.stepSize;
    const val = interpolateDT(dist, w, h, tx, ty);
    if (val > maxN && val >= minDT) {
      maxN = val;
      dir = { x: Math.cos(ang), y: Math.sin(ang) };
    }
  }

  // If we're stuck at start
  if (dir.x === 0 && dir.y === 0) return pts;

  // To prevent immediate U-turn, track visited roughly?
  // Tube walking is inherently directed. We need to go "forward".
  // But which way is forward? The user clicked.
  // Ideally, we trace BOTH directions from seed and merge.

  const traceOneWay = (startP: Point, startD: { x: number, y: number }) => {
    const line: Point[] = [startP];
    let cPos = { ...startP };
    let cDir = { ...startD };

    for (let step = 0; step < opts.maxSteps; step++) {
      // 1. Predict next position
      const predX = cPos.x + cDir.x * opts.stepSize;
      const predY = cPos.y + cDir.y * opts.stepSize;

      // 2. Correct (Centering)
      // Search perpendicular line
      const perpX = -cDir.y;
      const perpY = cDir.x;

      let bestVal = -1;
      let bestOff = 0;

      // Search range +/- thickness (roughly)
      const searchR = Math.max(2, Math.ceil(seedThickness));

      for (let k = -searchR; k <= searchR; k += 0.5) {
        const sx = predX + perpX * k;
        const sy = predY + perpY * k;
        const v = interpolateDT(dist, w, h, sx, sy);
        // Bias towards center (0 offset) slightly to prevent drift into neighboring tracks
        const biasedV = v - Math.abs(k) * 0.01;
        if (biasedV > bestVal) {
          bestVal = biasedV;
          bestOff = k;
        }
      }

      if (bestVal < minDT) {
        // Try Gap Jump?
        // Simple cone search
        let foundGap = false;
        const cone = (opts.gapAngle * Math.PI) / 180;
        const baseAngle = Math.atan2(cDir.y, cDir.x);

        let bestJumpVal = -1;
        let bestJumpPos = null;

        const jumpStep = opts.stepSize;

        for (let range = jumpStep; range <= opts.maxGap; range += jumpStep) {
          for (let da = -cone; da <= cone; da += 0.2) {
            const ja = baseAngle + da;
            const jx = cPos.x + Math.cos(ja) * range;
            const jy = cPos.y + Math.sin(ja) * range;
            const jv = interpolateDT(dist, w, h, jx, jy);

            if (jv >= minDT && jv > bestJumpVal) {
              bestJumpVal = jv;
              bestJumpPos = { x: jx, y: jy };
            }
          }
        }

        if (bestJumpPos) {
          // Jump!
          const jumpDir = normalize({ x: bestJumpPos.x - cPos.x, y: bestJumpPos.y - cPos.y });
          cPos = bestJumpPos;
          cDir = jumpDir; // Reset momentum
          line.push(cPos);
          foundGap = true;
          continue;
        } else {
          break; // Terminate
        }
      }

      const nextX = predX + perpX * bestOff;
      const nextY = predY + perpY * bestOff;

      // Check bounds
      if (nextX < 0 || nextY < 0 || nextX >= w || nextY >= h) break;

      // Update Direction (Momentum)
      const newDirRaw = { x: nextX - cPos.x, y: nextY - cPos.y };
      const len = Math.hypot(newDirRaw.x, newDirRaw.y);
      if (len < 0.1) break; // Stalled

      const normNew = { x: newDirRaw.x / len, y: newDirRaw.y / len };

      // Blend
      const blendX = cDir.x * opts.momentum + normNew.x * (1 - opts.momentum);
      const blendY = cDir.y * opts.momentum + normNew.y * (1 - opts.momentum);
      cDir = normalize({ x: blendX, y: blendY });

      cPos = { x: nextX, y: nextY };
      line.push(cPos);

      if (line.length >= opts.maxPoints) break;
    }
    return line;
  };

  // Trace Forward
  const fwd = traceOneWay(curr, dir);

  // Trace Backward (invert dir)
  const backDir = { x: -dir.x, y: -dir.y };
  const bwd = traceOneWay(curr, backDir);

  // Combine: reverse(bwd) + fwd
  // bwd starts at curr, fwd starts at curr. duplicate curr.
  const combined = [...bwd.reverse(), ...fwd.slice(1)];

  return combined;
}

// --- Output Processing ---

function simplifyRDP(points: Point[], eps: number): Point[] {
  if (points.length < 3) return points;

  // Standard RDP
  const sqEps = eps * eps;
  const stack: { first: number, last: number }[] = [{ first: 0, last: points.length - 1 }];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  while (stack.length > 0) {
    const { first, last } = stack.pop()!;
    let maxSqDist = 0;
    let index = -1;

    const p1 = points[first];
    const p2 = points[last];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;

    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      let distSq = 0;
      if (lenSq === 0) {
        distSq = (p.x - p1.x) ** 2 + (p.y - p1.y) ** 2;
      } else {
        const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq;
        const tClamped = Math.max(0, Math.min(1, t));
        const projX = p1.x + tClamped * dx;
        const projY = p1.y + tClamped * dy;
        distSq = (p.x - projX) ** 2 + (p.y - projY) ** 2;
      }

      if (distSq > maxSqDist) {
        maxSqDist = distSq;
        index = i;
      }
    }

    if (maxSqDist > sqEps) {
      keep[index] = 1;
      stack.push({ first: first, last: index });
      stack.push({ first: index, last: last });
    }
  }

  const res: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) res.push(points[i]);
  }
  return res;
}

// --- Main Entry ---

export function smartWandTrace(
  image: { data: Uint8ClampedArray; width: number; height: number },
  seed: Point,
  options?: Partial<SmartWandOptions>
): Point[] {
  const opts: SmartWandOptions = { ...DEFAULT_SMART_WAND_OPTIONS, ...(options ?? {}) };
  const img: Img = { data: image.data, width: image.width, height: image.height };

  // 1. Adaptive Threshold
  const mask = adaptiveThreshold(img, opts);

  // 2. Distance Transform
  const dist = distanceTransform(mask, img.width, img.height);

  // 3. Estimate Seed Thickness
  // Sample median DT around seed
  const win = 3;
  const samples: number[] = [];
  for (let dy = -win; dy <= win; dy++) {
    for (let dx = -win; dx <= win; dx++) {
      const nx = Math.round(seed.x + dx), ny = Math.round(seed.y + dy);
      if (nx >= 0 && nx < img.width && ny >= 0 && ny < img.height) {
        samples.push(dist[ny * img.width + nx]);
      }
    }
  }
  samples.sort((a, b) => a - b);
  let seedThickness = samples[Math.floor(samples.length / 2)];
  if (seedThickness < 1.0) seedThickness = 1.0;

  // 4. Trace
  let pts = ridgeWalk(dist, img.width, img.height, seed, seedThickness, opts);

  // 5. Simplify
  pts = simplifyRDP(pts, opts.simplifyEps);

  return pts;
}

export type WandPreset = {
  id: string;
  name: string;
  description: string;
  opts: Partial<SmartWandOptions>;
};

export const WAND_PRESETS: WandPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Standard adaptive trace.',
    opts: {},
  },
  {
    id: 'thick_only',
    name: 'Thick Only',
    description: 'Ignores medium lines, tracks main curves.',
    opts: {
      thicknessKeepFrac: 0.8, // Only keep things almost as thick as seed
    },
  },
  {
    id: 'tolerant',
    name: 'Tolerant',
    description: 'Tracks thinner/worn lines.',
    opts: {
      thicknessKeepFrac: 0.3, // Allow thinner segments
      thresholdBias: 0.95, // Less strict darkness
    },
  },
  {
    id: 'jumpy',
    name: 'Gap Jumper',
    description: 'Jumps larger gaps.',
    opts: {
      maxGap: 30,
      gapAngle: 60,
    },
  },
  {
    id: 'strict',
    name: 'Strict',
    description: 'Stops at any break or noise.',
    opts: {
      maxGap: 2, // No jumping
      thresholdBias: 0.85, // Must be very dark
    },
  },
  {
    id: 'smooth',
    name: 'Smooth',
    description: 'High momentum for clean curves.',
    opts: {
      momentum: 0.95,
      stepSize: 3,
    },
  },
];

export function generateWandVariations(
  image: { data: Uint8ClampedArray; width: number; height: number },
  seed: Point
): { preset: WandPreset; points: Point[] }[] {
  return WAND_PRESETS.map((preset) => {
    const pts = smartWandTrace(image, seed, preset.opts);
    return { preset, points: pts };
  });
}
