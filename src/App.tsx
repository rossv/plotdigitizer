import React from 'react';
import { Axis3D, Plus, ScanLine } from 'lucide-react';
import { DigitizerCanvas } from './DigitizerCanvas';
import { useStore } from './store';

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

  return (
    <div className="flex h-screen w-screen bg-slate-100">
      <aside className="w-80 bg-white border-r border-slate-200 p-4 flex flex-col gap-4 shadow-lg z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plot Digitizer</h1>
          <p className="text-sm text-slate-500">Calibrate axes, digitize points, export data.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="file">
            Load Plot Image
          </label>
          <input
            id="file"
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="w-full text-sm"
          />
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
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold transition ${
                mode === 'CALIBRATE_X'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-800 hover:border-blue-500'
              }`}
            >
              <Axis3D className="h-4 w-4" /> X Axis
            </button>
            <button
              onClick={() => setMode('CALIBRATE_Y')}
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold transition ${
                mode === 'CALIBRATE_Y'
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
              className={`text-[11px] px-2 py-1 rounded border ${
                xAxis.isLog ? 'border-blue-500 text-blue-600' : 'border-slate-200 text-slate-500'
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
                className={`text-[11px] px-2 py-1 rounded border ${
                  activeSeries.yAxis.isLog
                    ? 'border-blue-500 text-blue-600'
                    : 'border-slate-200 text-slate-500'
                }`}
              >
                {activeSeries.yAxis.isLog ? 'Log' : 'Linear'}
              </button>
            </div>
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
          <button
            disabled={!isCalibrated}
            onClick={() => setMode(mode === 'DIGITIZE' ? 'IDLE' : 'DIGITIZE')}
            className={`w-full flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-bold transition ${
              mode === 'DIGITIZE'
                ? 'bg-emerald-600 text-white'
                : isCalibrated
                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <ScanLine className="h-4 w-4" />
            {mode === 'DIGITIZE' ? 'Stop Digitizing' : 'Start Digitizing'}
          </button>
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
            <div className="max-h-48 overflow-auto divide-y divide-slate-100">
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
      </aside>

      <DigitizerCanvas />
    </div>
  );
}
