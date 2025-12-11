import type { Series } from '../types';

export const generateCSV = (series: Series[]): string => {
    // Find all unique X values across all series to align rows if needed?
    // Or just simple column lists.
    // The Python code does:
    // Headers: X_1, Y_1, X_2, Y_2, ...
    // Rows: max(rows)

    const columns: string[][] = [];
    const headers: string[] = [];
    let maxRows = 0;

    series.forEach((s) => {
        headers.push(`X_${s.name}`, `Y_${s.name}`);
        const sX: string[] = [];
        const sY: string[] = [];
        s.points.forEach(p => {
            if (p.dataX !== undefined && p.dataY !== undefined) {
                sX.push(p.dataX.toString());
                sY.push(p.dataY.toString());
            }
        });
        columns.push(sX, sY);
        maxRows = Math.max(maxRows, sX.length);
    });

    const lines: string[] = [];
    lines.push(headers.join(','));

    for (let i = 0; i < maxRows; i++) {
        const row: string[] = [];
        columns.forEach(col => {
            row.push(col[i] || '');
        });
        lines.push(row.join(','));
    }

    return lines.join('\n');
};

export const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
