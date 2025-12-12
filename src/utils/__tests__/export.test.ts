import { describe, expect, it } from 'vitest';
import { generateTableData as generateCSV } from '../export';
import type { Series } from '../../types';

describe('generateCSV', () => {
  it('builds headers and rows for series with unequal lengths', () => {
    const baseSeries: Omit<Series, 'points' | 'name'> = {
      id: 'id-1',
      color: '#000000',
      yAxisId: 'y-axis',
      fitConfig: {
        enabled: false,
        type: 'linear',
      },
    };

    const series: Series[] = [
      {
        ...baseSeries,
        id: 'series-1',
        name: 'Series 1',
        points: [
          { id: 'p1', x: 0, y: 0, seriesId: 'series-1', dataX: 1, dataY: 10 },
          { id: 'p2', x: 0, y: 0, seriesId: 'series-1', dataX: 2, dataY: 20 },
          { id: 'p3', x: 0, y: 0, seriesId: 'series-1', dataX: 3, dataY: 30 },
        ],
      },
      {
        ...baseSeries,
        id: 'series-2',
        name: 'Series 2',
        points: [
          { id: 'p4', x: 0, y: 0, seriesId: 'series-2', dataX: 5, dataY: 50 },
          { id: 'p5', x: 0, y: 0, seriesId: 'series-2', dataX: 6, dataY: 60 },
        ],
      },
    ];

    const csv = generateCSV(series);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('X_Series 1,Y_Series 1,X_Series 2,Y_Series 2');
    expect(lines[1]).toBe('1,10,5,50');
    expect(lines[2]).toBe('2,20,6,60');
    expect(lines[3]).toBe('3,30,,');
  });
});
