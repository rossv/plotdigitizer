export type Point = {
  id: string;
  x: number; // Pixel X
  y: number; // Pixel Y
  seriesId: string;
  dataX?: number; // Calculated Real X
  dataY?: number; // Calculated Real Y
  fittedY?: number; // Y value from the fitted curve at dataX
};

export type AxisCalibration = {
  p1: { px: number; py: number; val: number } | null;
  p2: { px: number; py: number; val: number } | null;
  isLog: boolean;
  slope: number | null; // ax or ay
  intercept: number | null; // bx or by
};

export type YAxisDefinition = {
  id: string;
  name: string;
  color: string;
  calibration: AxisCalibration;
};

export type CurveFitType = 'linear' | 'polynomial' | 'exponential';

export type CurveFitConfig = {
  enabled: boolean;
  type: CurveFitType;
  order?: number; // For polynomial
  interceptMode?: 'auto' | 'zero' | 'firstPoint';
};

export type CurveFitResult = {
  points: Point[]; // Points to draw the curve on canvas
  equation: string;
  r2: number;
  predict: (x: number) => number; // Function to predict Y for a given X
};

export type Series = {
  id: string;
  name: string;
  color: string;
  points: Point[];
  yAxisId: string;
  fitConfig: CurveFitConfig;
  fitResult?: CurveFitResult;
  showLabels?: boolean;
  showPointCoordinates?: boolean; // New property
  labelPosition?: { x: number; y: number };
};

export type AppMode = 'IDLE' | 'CALIBRATE_X' | 'CALIBRATE_Y' | 'DIGITIZE' | 'TRACE' | 'TRACE_ADVANCED' | 'SELECT' | 'SINGLE_POINT';

export type SnapConfig = {
  mode: 'decimal' | 'sigfig';
  precision: number;
  targets: ('x' | 'y')[];
};

