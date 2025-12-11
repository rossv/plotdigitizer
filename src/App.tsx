import React, { useEffect } from 'react';
import { Axis3D, Plus, ScanLine, Image as ImageIcon } from 'lucide-react';
import { DigitizerCanvas } from './DigitizerCanvas';
import { useStore } from './store';
import testPlotUrl from './assets/test_plot.svg';
import { generateCSV, downloadCSV } from './utils/export';

export default function App() {
  const {
    imageUrl,
    setImageUrl,
    mode,
    setMode,
    series,
    activeSeriesId,
    setActiveSeries,
    addSeries,
    xAxis,
    toggleXAxisLog,
    toggleYAxisLog,
  } = useStore();

  const activeSeries = series.find((s) => s.id === activeSeriesId);
  const isCalibrated =
    xAxis.slope !== null &&
    xAxis.intercept !== null &&
    activeSeries?.yAxis.slope !== null &&
    activeSeries?.yAxis.intercept !== null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setImageUrl(url);
    }
  };

  const loadTestImage = async () => {
    try {
      const response = await fetch(testPlotUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
    } catch (e) {
      console.error("Failed to load test image", e);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useStore.getState().redo();
        } else {
          useStore.getState().undo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        useStore.getState().redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-slate-100">
      <aside className="w-80 bg-white border-r border-slate-200 p-4 flex flex-col gap-4 shadow-lg z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plot Digitizer</h1>
          <p className="text-sm text-slate-500">Calibrate axes, digitize points, export data.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => useStore.getState().undo()}
            className="flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Undo (Ctrl+Z)
          </button>
          <button
            onClick={() => useStore.getState().redo()}
            className="flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Redo (Ctrl+Y)
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="file">
            Load Plot Image
          </label>
          <div className="flex gap-2">
            <input
              id="file"
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="w-full text-sm file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <button
              onClick={loadTestImage}
              title="Load Test Image"
              className="p-2 text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded border border-slate-200"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
          </div>
          {imageUrl && <p className="text-xs text-emerald-600">Image loaded</p>}
        </div>

        <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Calibration</h3>
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Step {mode}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('CALIBRATE_X')}
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold transition ${mode === 'CALIBRATE_X'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-800 hover:border-blue-500'
                }`}
            >
              <Axis3D className="h-4 w-4" /> X Axis
            </button>
            <button
              onClick={() => setMode('CALIBRATE_Y')}
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold transition ${mode === 'CALIBRATE_Y'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-800 hover:border-blue-500'
                }`}
            >
              <Axis3D className="h-4 w-4" /> Y Axis
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>X-Axis: {xAxis.slope ? 'Ready' : 'Not set'}</span>
            <button
              onClick={toggleXAxisLog}
              className={`text-[11px] px-2 py-1 rounded border ${xAxis.isLog ? 'border-blue-500 text-blue-600' : 'border-slate-200 text-slate-500'
                }`}
            >
              {xAxis.isLog ? 'Log' : 'Linear'}
            </button>
          </div>
          {activeSeries && (
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Y-Axis: {activeSeries.yAxis.slope ? 'Ready' : 'Not set'}</span>
              <button
                onClick={toggleYAxisLog}
                className={`text-[11px] px-2 py-1 rounded border ${activeSeries.yAxis.isLog
                  ? 'border-blue-500 text-blue-600'
                  : 'border-slate-200 text-slate-500'
                  }`}
              >
                {activeSeries.yAxis.isLog ? 'Log' : 'Linear'}
              </button>
            </div>
          )}
        </div>

        {/* Fitting Tools */}
        <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2">
          <h3 className="font-semibold text-slate-800">Curve Fitting</h3>
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => useStore.getState().addFittedCurve(activeSeriesId, 'linear')}
              className="p-1 text-xs border bg-white rounded hover:bg-slate-100"
              title="Fit Linear"
            >
              Linear
            </button>
            <button
              onClick={() => useStore.getState().addFittedCurve(activeSeriesId, 'polynomial')}
              className="p-1 text-xs border bg-white rounded hover:bg-slate-100"
              title="Fit Polynomial (Deg 2)"
            >
              Poly
            </button>
            <button
              onClick={() => useStore.getState().addFittedCurve(activeSeriesId, 'exponential')}
              className="p-1 text-xs border bg-white rounded hover:bg-slate-100"
              title="Fit Exponential"
            >
              Exp
            </button>
          </div>
          {useStore.getState().fittedCurves.length > 0 && (
            <button
              onClick={() => useStore.getState().deleteFittedCurve(useStore.getState().fittedCurves[useStore.getState().fittedCurves.length - 1].id)}
              className="w-full text-xs text-red-500 hover:underline text-left mt-1"
            >
              Clear Last Fit
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Series</h3>
            <button
              onClick={addSeries}
              className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <select
            value={activeSeriesId}
            onChange={(e) => setActiveSeries(e.target.value)}
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
          >
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={!isCalibrated}
              onClick={() => setMode(mode === 'DIGITIZE' ? 'IDLE' : 'DIGITIZE')}
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-bold transition ${mode === 'DIGITIZE'
                ? 'bg-emerald-600 text-white'
                : isCalibrated
                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
            >
              <ScanLine className="h-4 w-4" />
              {mode === 'DIGITIZE' ? 'Digitize' : 'Start'}
            </button>
            <button
              disabled={!isCalibrated}
              onClick={() => setMode(mode === 'TRACE' ? 'IDLE' : 'TRACE')}
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-bold transition ${mode === 'TRACE'
                ? 'bg-purple-600 text-white'
                : isCalibrated
                  ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
            >
              Wand
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto text-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800">Captured Points</h3>
            <span className="text-xs text-slate-500">{activeSeries?.points.length ?? 0} pts</span>
          </div>
          <div className="border border-slate-200 rounded overflow-hidden">
            <div className="grid grid-cols-2 bg-slate-50 text-xs font-semibold text-slate-700 px-2 py-1">
              <span>X</span>
              <span>Y</span>
            </div>
            <div className="max-h-48 overflow-auto divide-y divide-slate-100 h-full">
              {activeSeries?.points.map((p) => (
                <div key={p.id} className="grid grid-cols-2 px-2 py-1 text-slate-700">
                  <span>{p.dataX?.toFixed(4)}</span>
                  <span>{p.dataY?.toFixed(4)}</span>
                </div>
              ))}
              {!activeSeries?.points.length && (
                <div className="px-2 py-3 text-center text-slate-400 text-xs">No points yet</div>
              )}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-2">Export</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                const csv = generateCSV(series);
                downloadCSV(csv, 'digitized_data.csv');
              }}
              className="flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              CSV
            </button>
            <button
              onClick={() => {
                const stage = document.querySelector('.konvajs-content canvas') as HTMLCanvasElement;
                if (stage) {
                  const link = document.createElement('a');
                  link.download = 'digitized_plot.png';
                  link.href = stage.toDataURL();
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              }}
              className="flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              PNG
            </button>
          </div>
        </div>
      </aside>

      <DigitizerCanvas />
    </div>
  );
}
