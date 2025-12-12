import type { Series } from '../types';

export const generateTableData = (series: Series[], delimiter: string = ','): string => {
    const columns: string[][] = [];
    const headers: string[] = [];
    let maxRows = 0;

    series.forEach((s) => {
        headers.push(`X_${s.name}`, `Y_${s.name}`);
        if (s.fitConfig.enabled) {
            headers.push(`Fit_${s.name}`);
        }

        const sX: string[] = [];
        const sY: string[] = [];
        const sFit: string[] = [];

        s.points.forEach(p => {
            sX.push(p.dataX !== undefined ? p.dataX.toString() : '');
            sY.push(p.dataY !== undefined ? p.dataY.toString() : '');
            if (s.fitConfig.enabled) {
                sFit.push(p.fittedY !== undefined ? p.fittedY.toString() : '');
            }
        });

        columns.push(sX, sY);
        if (s.fitConfig.enabled) {
            columns.push(sFit);
        }

        maxRows = Math.max(maxRows, sX.length);
    });

    const lines: string[] = [];
    lines.push(headers.join(delimiter));

    for (let i = 0; i < maxRows; i++) {
        const row: string[] = [];
        columns.forEach(col => {
            row.push(col[i] || '');
        });
        lines.push(row.join(delimiter));
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
