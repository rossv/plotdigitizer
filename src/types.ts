export type Point = {
  id: string;
  x: number; // Pixel X
  y: number; // Pixel Y
  seriesId: string;
  dataX?: number; // Calculated Real X
  dataY?: number; // Calculated Real Y
};

export type AxisCalibration = {
  p1: { px: number; py: number; val: number } | null;
  p2: { px: number; py: number; val: number } | null;
  isLog: boolean;
  slope: number | null; // ax or ay
  intercept: number | null; // bx or by
};

export type Series = {
  id: string;
  name: string;
  color: string;
  points: Point[];
  yAxis: AxisCalibration; // Each series can technically have its own Y scaling
};

export type AppMode = 'IDLE' | 'CALIBRATE_X' | 'CALIBRATE_Y' | 'DIGITIZE';
