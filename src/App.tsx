
import React, { useEffect, useRef } from 'react';
import { Plus, ScanLine, Image as ImageIcon, Sun, Moon, Trash2, Download, Database, Undo, Redo, Camera, Copy, ImageOff, Save, FolderOpen, X } from 'lucide-react';
import { DigitizerCanvas } from './DigitizerCanvas';
import type { DigitizerHandle } from './DigitizerCanvas';
import { useStore } from './store';
import testPlotUrl from './assets/test_plot.svg';
import { generateTableData, downloadCSV } from './utils/export';
import { loadPdfDocument } from './utils/pdf-utils';
import { PdfPageSelector } from './components/PdfPageSelector';
import * as pdfjsLib from 'pdfjs-dist';

export default function App() {
  const digitizerRef = useRef<DigitizerHandle>(null);
  const [pdfDocument, setPdfDocument] = React.useState<pdfjsLib.PDFDocumentProxy | null>(null);

  const {
    activeWorkspaceId,
    workspaces,
    setActiveWorkspace,
    addWorkspace,
    removeWorkspace,
    updateWorkspaceName, // This was missing in the destructure
    theme,
    toggleTheme,
    loadProject,

    // Actions
    setImageUrl,
    setMode,
    addSeries,
    setXAxisName,
    toggleXAxisLog,
    toggleYAxisLog,
    updateYAxisName,
    addYAxis,
    deleteYAxis,
    setActiveYAxis,
    setActiveSeries,
    setSeriesYAxis,
    setSeriesFitConfig,
    undo,
    redo,
    updateSeriesName,
    clearSeriesPoints,
    toggleSeriesLabels,
  } = useStore();

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
  // Fail-safe
  if (!activeWorkspace) {
    if (workspaces.length > 0) setActiveWorkspace(workspaces[0].id);
    return null;
  }

  const {
    imageUrl,
    mode,
    series,
    activeSeriesId,
    xAxis,
    xAxisName,
    yAxes,
    activeYAxisId
  } = activeWorkspace;

  const activeSeries = series.find((s) => s.id === activeSeriesId);
  const activeSeriesYAxis = yAxes.find((y) => y.id === activeSeries?.yAxisId)?.calibration;



  const isCalibrated =
    xAxis.slope !== null &&
    xAxis.intercept !== null &&
    activeSeriesYAxis?.slope !== null &&
    activeSeriesYAxis?.intercept !== null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const pdf = await loadPdfDocument(url);
          setPdfDocument(pdf);
        } catch (error) {
          console.error("Failed to load PDF", error);
          alert("Failed to load PDF file is it valid?");
        }
      } else {
        setImageUrl(url);
      }
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

  const handleExportImage = (graphicsOnly = false) => {
    if (digitizerRef.current) {
      const dataUrl = digitizerRef.current.toDataURL({ graphicsOnly });
      if (dataUrl) {
        const link = document.createElement('a');
        link.download = graphicsOnly ? 'digitized_graphics.png' : 'digitized_plot.png';
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  const handleSaveProject = async () => {
    const state = useStore.getState();
    const { workspaces, activeWorkspaceId, theme } = state;

    // Process all workspaces to convert blob URLs to base64 if needed
    const processedWorkspaces = await Promise.all(workspaces.map(async (ws) => {
      let base64Image = ws.imageUrl;
      if (ws.imageUrl && ws.imageUrl.startsWith('blob:')) {
        try {
          const resp = await fetch(ws.imageUrl);
          const blob = await resp.blob();
          base64Image = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error(`Failed to convert image for workspace ${ws.name}`, e);
        }
      }
      return { ...ws, imageUrl: base64Image };
    }));

    const projectData = {
      version: 2, // Increment version
      createdAt: new Date().toISOString(),
      workspaces: processedWorkspaces,
      activeWorkspaceId,
      theme
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `plot_digitizer_project_${new Date().toISOString().slice(0, 10)}.json`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const isLegacy = json.xAxis && json.yAxes && json.series;
        const isNew = Array.isArray(json.workspaces);

        if (!isLegacy && !isNew) {
          alert("Invalid project file: missing core data");
          return;
        }
        loadProject(json);
      } catch (err) {
        console.error("Failed to parse project file", err);
        alert("Failed to load project file");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Handle paste events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.items) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              const url = URL.createObjectURL(file);
              setImageUrl(url);
              break;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [setImageUrl]);

  // Apply theme class to html element on mount
  useEffect(() => {
    console.log('Theme effect running. Theme:', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      console.log('Added dark class. ClassList:', document.documentElement.classList.toString());
    } else {
      document.documentElement.classList.remove('dark');
      console.log('Removed dark class. ClassList:', document.documentElement.classList.toString());
    }
  }, [theme]);

  return (
    <div className="flex h-screen w-screen bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
      <aside className="w-96 p-4 flex flex-col gap-4 overflow-hidden z-10">

        {/* Header Bin */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Plot Digitizer</h1>
                <span className="px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 text-[10px] font-bold tracking-wide uppercase border border-blue-200 dark:border-blue-500/30 shadow-sm">
                  Beta
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Extract data from images</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="group relative flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all outline-none focus:ring-2 focus:ring-blue-500/20"
            title="Toggle Theme"
          >
            <div className={`p-1 rounded-md transition-all ${theme === 'light' ? 'bg-white shadow-sm text-amber-500' : 'text-slate-400'}`}>
              <Sun className="h-4 w-4" />
            </div>
            <div className={`p-1 rounded-md transition-all ${theme === 'dark' ? 'bg-slate-700 shadow-sm text-blue-400' : 'text-slate-400'}`}>
              <Moon className="h-4 w-4" />
            </div>
          </button>
        </div>



        {/* Controls Container - Scrollable */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">

          {/* File & History Bin */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-3 transition-colors">


            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSaveProject}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-xs font-medium"
              >
                <Save className="h-4 w-4" />
                Save Project
              </button>
              <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-xs font-medium cursor-pointer">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleLoadProject}
                  className="hidden"
                />
                <FolderOpen className="h-4 w-4" />
                Load Project
              </label>
            </div>

            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFile}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-500 dark:hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-medium transition">
                  <ImageIcon className="h-4 w-4" />
                  Load Image / PDF
                </div>
              </label>
              <button
                onClick={loadTestImage}
                title="Load Test Image"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
              >
                <Database className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Axes Bin */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Calibration</h3>
              <span className="text-[10px] uppercase tracking-wide text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{mode !== 'IDLE' ? mode : 'Ready'}</span>
            </div>

            {/* X-Axis Section */}
            <div className={`p-3 rounded-xl border transition-all ${mode === 'CALIBRATE_X'
              ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
              : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
              }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${xAxis.slope ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                <input
                  type="text"
                  value={xAxisName}
                  onChange={(e) => setXAxisName(e.target.value)}
                  className="flex-1 min-w-0 text-xs font-medium bg-transparent border-none p-0 focus:ring-0 text-slate-700 dark:text-slate-200 placeholder-slate-400"
                  placeholder="X Axis Name"
                />
                <button
                  onClick={toggleXAxisLog}
                  className={`text-[10px] px-2 py-0.5 rounded border transition shrink-0 ${xAxis.isLog
                    ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
                    }`}
                >
                  {xAxis.isLog ? 'Log' : 'Lin'}
                </button>
              </div>
              <button
                onClick={() => setMode('CALIBRATE_X')}
                className={`w-full flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold transition ${mode === 'CALIBRATE_X'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
              >
                Calibrate X
              </button>
            </div>

            {/* Y-Axes Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Y Axes</span>
                <button
                  onClick={addYAxis}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 transition"
                  title="Add Y Axis"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {yAxes.map((y) => {
                  const isActive = activeYAxisId === y.id;
                  const isCalibrating = mode === 'CALIBRATE_Y' && isActive;
                  return (
                    <div
                      key={y.id}
                      onClick={() => setActiveYAxis(y.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${isActive
                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 ring-1 ring-blue-500/10'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0 border-2"
                          style={{
                            borderColor: y.color,
                            backgroundColor: y.calibration.slope ? y.color : 'transparent'
                          }}
                        />
                        <input
                          type="text"
                          value={y.name}
                          onChange={(e) => updateYAxisName(y.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 min-w-0 text-xs font-medium bg-transparent border-none p-0 focus:ring-0 text-slate-700 dark:text-slate-200 placeholder-slate-400"
                          placeholder="Axis Name"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleYAxisLog(y.id); }}
                          className={`text-[10px] px-2 py-0.5 rounded border transition shrink-0 ${y.calibration.isLog
                            ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
                            }`}
                        >
                          {y.calibration.isLog ? 'Log' : 'Lin'}
                        </button>
                        {yAxes.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteYAxis(y.id); }}
                            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveYAxis(y.id);
                          setMode('CALIBRATE_Y');
                        }}
                        className={`w-full flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold transition ${isCalibrating
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500'
                          }`}
                      >
                        Calibrate {y.name}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Series Bin */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-3 transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Data Series</h3>
              <button
                onClick={addSeries}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 transition"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <select
              value={activeSeriesId}
              onChange={(e) => setActiveSeries(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {activeSeries && (
              <div className="space-y-3 pt-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={activeSeries?.name || ''}
                    onChange={(e) => updateSeriesName(activeSeriesId, e.target.value)}
                    className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Series Name"
                  />
                  <button
                    onClick={() => {
                      if (window.confirm('Clear all points in this series?')) {
                        clearSeriesPoints(activeSeriesId);
                      }
                    }}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition border border-transparent hover:border-red-200 dark:hover:border-red-800"
                    title="Clear Series Points"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">Y Axis:</span>
                  <select
                    value={activeSeries.yAxisId}
                    onChange={(e) => setSeriesYAxis(activeSeriesId, e.target.value)}
                    className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    {yAxes.map((axis) => (
                      <option key={axis.id} value={axis.id}>
                        {axis.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={activeSeries.fitConfig.enabled}
                        onChange={(e) => setSeriesFitConfig(activeSeriesId, { enabled: e.target.checked })}
                        className="checkbox"
                      />
                      Fit Curve
                    </label>
                    {activeSeries.fitConfig.enabled && activeSeries.fitResult && (
                      <span className="text-[10px] font-mono bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                        R²={activeSeries.fitResult.r2.toFixed(3)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!activeSeries.showLabels}
                        onChange={() => toggleSeriesLabels(activeSeriesId)}
                        className="checkbox"
                      />
                      Show Label
                    </label>
                  </div>

                  {activeSeries.fitConfig.enabled && (
                    <div className="space-y-2 pt-1 animate-in slide-in-from-top-1 fade-in duration-200">
                      <div className="flex gap-2">
                        <select
                          value={activeSeries.fitConfig.type}
                          onChange={(e) => setSeriesFitConfig(activeSeriesId, { type: e.target.value as any })}
                          className="flex-1 text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                        >
                          <option value="linear">Linear</option>
                          <option value="polynomial">Polynomial</option>
                          <option value="exponential">Exponential</option>
                        </select>
                        {activeSeries.fitConfig.type === 'polynomial' && (
                          <input
                            type="number"
                            min="2"
                            max="6"
                            value={activeSeries.fitConfig.order || 2}
                            onChange={(e) => setSeriesFitConfig(activeSeriesId, { order: parseInt(e.target.value) || 2 })}
                            className="w-10 text-[11px] px-1 py-1 rounded border border-slate-200 dark:border-slate-700 text-center bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">Intercept:</span>
                        <select
                          value={activeSeries.fitConfig.interceptMode || 'auto'}
                          onChange={(e) => setSeriesFitConfig(activeSeriesId, { interceptMode: e.target.value as any })}
                          className="flex-1 text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                        >
                          <option value="auto">Auto</option>
                          <option value="zero">Lock to Origin (0,0)</option>
                          <option value="firstPoint">Lock to First Point Y</option>
                        </select>
                      </div>
                      {activeSeries.fitResult?.equation && (
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-1.5 rounded border border-slate-100 dark:border-slate-800 break-all leading-tight">
                          y = {activeSeries.fitResult.equation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                disabled={!isCalibrated}
                onClick={() => setMode(mode === 'DIGITIZE' ? 'IDLE' : 'DIGITIZE')}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition shadow-sm ${mode === 'DIGITIZE'
                  ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                  : isCalibrated
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 ring-1 ring-inset ring-emerald-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
              >
                <ScanLine className="h-4 w-4" />
                Digitize
              </button>
              <button
                disabled={!isCalibrated}
                onClick={() => setMode(mode === 'TRACE' ? 'IDLE' : 'TRACE')}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition shadow-sm ${mode === 'TRACE'
                  ? 'bg-purple-600 text-white shadow-purple-500/20'
                  : isCalibrated
                    ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 ring-1 ring-inset ring-purple-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
              >
                Wand
              </button>
            </div>
          </div>

          {/* Points Bin */}
          <div className="flex-1 min-h-[150px] p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col transition-colors">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Points <span className="ml-1 text-xs font-normal text-slate-400">({series.reduce((acc, s) => acc + s.points.length, 0)})</span></h3>
              <div className="flex gap-1">
                {/* Export Mini Buttons */}
                <button
                  onClick={() => handleExportImage(false)}
                  title="Export Snapshot"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleExportImage(true)}
                  title="Export Graphics Only"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                >
                  <ImageOff className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={async () => {
                    const tsv = generateTableData(series, '\t');
                    await navigator.clipboard.writeText(tsv);
                    // Minimal feedback - could expand if needed
                  }}
                  title="Copy to Clipboard"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    const csv = generateTableData(series, ',');
                    downloadCSV(csv, 'digitized_data.csv');
                  }}
                  title="Export CSV"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-800/30">
              <div className="flex-1 overflow-auto">
                <table className="min-w-full text-left border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                    <tr>
                      {series.map(s => (
                        <th key={s.id} colSpan={2 + (s.fitConfig.enabled ? 1 : 0)} className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-slate-700 last:border-r-0 bg-slate-50 dark:bg-slate-800/50">
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 text-center truncate">
                            {s.name}
                          </div>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {series.map(s => {
                        const yAxisName = yAxes.find(y => y.id === s.yAxisId)?.name || 'Y Axis';
                        return (
                          <React.Fragment key={s.id}>
                            <th className="px-2 py-1 border-b border-r border-slate-200 dark:border-slate-700 last:border-r-0">
                              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase text-center">{xAxisName}</div>
                            </th>
                            <th className="px-2 py-1 border-b border-r border-slate-200 dark:border-slate-700 last:border-r-0">
                              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase text-center">{yAxisName}</div>
                            </th>
                            {s.fitConfig.enabled && (
                              <th className="px-2 py-1 border-b border-r border-slate-200 dark:border-slate-700 last:border-r-0">
                                <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase text-center">Fit</div>
                              </th>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Array.from({ length: Math.max(0, ...series.map(s => s.points.length)) }).map((_, i) => (
                      <tr key={i} className="hover:bg-white dark:hover:bg-slate-700/50 transition-colors">
                        {series.map(s => {
                          const p = s.points[i];
                          return (
                            <React.Fragment key={s.id}>
                              <td className="px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 last:border-r-0 text-right">
                                {p?.dataX !== undefined ? p.dataX.toFixed(3) : ''}
                              </td>
                              <td className="px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 last:border-r-0 text-right">
                                {p?.dataY !== undefined ? p.dataY.toFixed(3) : ''}
                              </td>
                              {s.fitConfig.enabled && (
                                <td className="px-2 py-1 text-xs font-mono text-blue-600 dark:text-blue-400 border-r border-slate-100 dark:border-slate-800 last:border-r-0 text-right">
                                  {p?.fittedY !== undefined ? p.fittedY.toFixed(3) : '-'}
                                </td>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                    {!series.some(s => s.points.length > 0) && (
                      <tr>
                        <td colSpan={series.reduce((acc, s) => acc + 2 + (s.fitConfig.enabled ? 1 : 0), 0)} className="p-4 text-center text-slate-400 dark:text-slate-500 text-xs italic">
                          No points captured
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </aside>

      <div className="flex-1 h-full overflow-hidden relative bg-slate-100 dark:bg-slate-950">
        <div className="absolute inset-4 rounded-2xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors flex flex-col">

          {/* Canvas Toolbar */}
          <div className="h-10 border-b border-slate-100 dark:border-slate-800 flex items-center px-3 gap-2 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center gap-1">
              <button
                onClick={undo}
                title="Undo (Ctrl+Z)"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Undo className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                title="Redo (Ctrl+Shift+Z)"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Redo className="w-4 h-4" />
              </button>
            </div>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
            {/* Workspace Tabs moved here */}
            <div className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide pl-1">
              {workspaces.map(ws => (
                <div
                  key={ws.id}
                  className={`group relative flex items-center gap-2 px-3 py-1 rounded-md transition-all shrink-0 cursor-pointer border ${ws.id === activeWorkspaceId
                    ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 shadow-sm text-slate-800 dark:text-slate-100'
                    : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                    }`}
                  onClick={() => setActiveWorkspace(ws.id)}
                >
                  <input
                    value={ws.name}
                    onChange={(e) => updateWorkspaceName(ws.id, e.target.value)}
                    className="bg-transparent text-xs font-medium focus:outline-none min-w-[60px] max-w-[120px]"
                  />
                  {workspaces.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Close this workspace? Unsaved changes will be lost.")) {
                          removeWorkspace(ws.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addWorkspace}
                className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 transition shrink-0"
                title="New Workspace"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <DigitizerCanvas ref={digitizerRef} />
          </div>
        </div>
      </div>
      {pdfDocument && (
        <PdfPageSelector
          pdfDocument={pdfDocument}
          onSelectPage={(url) => {
            setImageUrl(url);
            setPdfDocument(null);
          }}
          onCancel={() => setPdfDocument(null)}
        />
      )}
    </div>
  );
}
