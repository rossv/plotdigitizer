
import React, { useEffect, useRef } from 'react';
import { Plus, ScanLine, Image as ImageIcon, Sun, Moon, Trash2, Download, Database, Undo, Redo, Camera, Copy, ImageOff, Save, FolderOpen, X, MousePointer2, Magnet, HelpCircle, MapPin, Check, CheckCircle2, Wand2, Sparkles, Activity, RefreshCw } from 'lucide-react';
import { DigitizerCanvas } from './DigitizerCanvas';
import type { DigitizerHandle } from './DigitizerCanvas';
import { useStore } from './store';
import { SnappingTool } from './components/SnappingTool';
import { HelpModal } from './components/HelpModal';
import { GlobalModal } from './components/GlobalModal';
import testPlotUrl from './assets/test_plot.svg';
import { generateTableData, downloadCSV } from './utils/export';
import { loadPdfDocument } from './utils/pdf-utils';
import { PdfPageSelector } from './components/PdfPageSelector';
import { HistoryList } from './components/HistoryList';
import * as pdfjsLib from 'pdfjs-dist';
import { useAutoAnimate } from '@formkit/auto-animate/react';

export default function App() {
  const digitizerRef = useRef<DigitizerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfDocument, setPdfDocument] = React.useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isSnappingToolOpen, setIsSnappingToolOpen] = React.useState(false);
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [yAxesParent] = useAutoAnimate();
  const [seriesSettingsParent] = useAutoAnimate();

  // Feedback States
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [copySuccess, setCopySuccess] = React.useState(false);
  const [exportSuccess, setExportSuccess] = React.useState(false);
  const [exportGraphicsSuccess, setExportGraphicsSuccess] = React.useState(false);

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
    openModal,

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
    jumpToHistory,
    updateSeriesName,
    updateSeriesColor,
    clearSeriesPoints,
    toggleSeriesLabels,
    deleteSelectedPoints,
    nudgeSelection,
    toggleSeriesPointCoordinates,
    startCalibration,
    resampleActiveSeries,
    autoDetectAxes,
    updateCalibrationPointValue,
    snapSeriesToFit,
  } = useStore();

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
  // Fail-safe
  if (!activeWorkspace) {
    if (workspaces.length > 0) setActiveWorkspace(workspaces[0].id);
    return null;
  }

  const {
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
    xAxis.slope !== null && Number.isFinite(xAxis.slope) &&
    xAxis.intercept !== null && Number.isFinite(xAxis.intercept) &&
    !!activeSeriesYAxis &&
    activeSeriesYAxis.slope !== null && Number.isFinite(activeSeriesYAxis.slope) &&
    activeSeriesYAxis.intercept !== null && Number.isFinite(activeSeriesYAxis.intercept);

  // Force IDLE mode if calibration becomes invalid (e.g. cleared inputs or error)
  useEffect(() => {
    if (!isCalibrated && mode !== 'IDLE' && mode !== 'CALIBRATE_X' && mode !== 'CALIBRATE_Y') {
      setMode('IDLE');
    }
  }, [isCalibrated, mode, setMode]);

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
          openModal({ type: 'alert', message: "Failed to load PDF file is it valid?" });
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

        // Feedback
        if (graphicsOnly) {
          setExportGraphicsSuccess(true);
          setTimeout(() => setExportGraphicsSuccess(false), 2000);
        } else {
          setExportSuccess(true);
          setTimeout(() => setExportSuccess(false), 2000);
        }
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


    // Feedback
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
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
          openModal({ type: 'alert', message: "Invalid project file: missing core data" });
          return;
        }
        loadProject(json);
      } catch (err) {
        console.error("Failed to parse project file", err);
        openModal({ type: 'alert', message: "Failed to load project file" });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for global modal state first using getState() to avoid dependency cycles or stale state
      const state = useStore.getState();
      if (state.modal.isOpen) return;

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
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;

        e.preventDefault();
        deleteSelectedPoints();
      } else if (e.key.startsWith('Arrow')) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;

        e.preventDefault();
        const step = e.shiftKey ? 10 : 1; // Shift for faster nudge
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        nudgeSelection(dx, dy);
      } else if (e.key === 'Escape') {
        // Cancel Action / Clear Selection
        const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
        if (!ws) return;

        // 1. Priority: Clear Point Selection
        if (ws.selectedPointIds.length > 0) {
          state.clearSelection();
          return;
        }

        // 2. Priority: Cancel any active mode (including Digitize) -> Return to IDLE
        if (ws.mode !== 'IDLE') {
          setMode('IDLE');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteSelectedPoints, nudgeSelection, setMode]); // Added setMode dependency

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

  const isXCalibrated = xAxis.slope !== null && !isNaN(xAxis.slope);

  return (
    <div className="flex h-screen w-screen bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
      <aside className="w-96 p-4 flex flex-col gap-4 overflow-hidden z-20 relative">

        {/* Header Bin */}
        <div className="p-4 glass rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between transition-all hover:shadow-md animate-fade-in z-10">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Logo"
              className="w-10 h-10 object-contain"
            />
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
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="group relative flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all outline-none focus:ring-2 focus:ring-blue-500/20 active:scale-95 hover:shadow-sm"
              title="Toggle Theme"
            >
              <div className={`p-1 rounded-md transition-all duration-500 ${theme === 'light' ? 'bg-white shadow-sm text-amber-500 rotate-0' : 'text-slate-400 rotate-90'}`}>
                <Sun className="h-4 w-4" />
              </div>
              <div className={`p-1 rounded-md transition-all duration-500 ${theme === 'dark' ? 'bg-slate-700 shadow-sm text-blue-400 rotate-0' : 'text-slate-400 -rotate-90'}`}>
                <Moon className="h-4 w-4" />
              </div>
            </button>
          </div>
        </div>



        {/* Controls Container - Scrollable */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">

          {/* File & History Bin */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 space-y-3 transition-all hover:shadow-lg animate-slide-up" style={{ animationDelay: '0.1s' }}>


            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSaveProject}
                title="Save current project to a JSON file"
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all active:scale-95 hover:shadow-sm text-xs font-medium animate-pop duration-200 ${saveSuccess
                  ? 'border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
              >
                {saveSuccess ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {saveSuccess ? 'Saved!' : 'Save Project'}
              </button>
              <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all active:scale-95 hover:shadow-sm text-xs font-medium cursor-pointer" title="Load a previously saved project JSON file">
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
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFile}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-500 dark:hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-medium transition-all hover:bg-blue-50/50 dark:hover:bg-blue-900/10 hover:shadow-sm active:scale-95" title="Upload an image or PDF to start digitizing">
                  <ImageIcon className="h-4 w-4" />
                  Load Image / PDF
                </div>
              </label>
              <button
                onClick={loadTestImage}
                title="Load Test Image"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all active:scale-95"
              >
                <Database className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Axes Bin */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 space-y-4 transition-all hover:shadow-lg animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Calibration</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => autoDetectAxes()}
                  className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all active:scale-95"
                  title="Auto-detect axes from image"
                >
                  Auto
                </button>
                <span className="text-[10px] uppercase tracking-wide text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{mode !== 'IDLE' ? mode : 'Ready'}</span>
              </div>
            </div>

            {/* X-Axis Section */}
            <div className={`p-3 rounded-xl border transition-all ${mode === 'CALIBRATE_X'
              ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
              : isXCalibrated
                ? 'bg-green-100 dark:bg-green-900/40 border-green-500 dark:border-green-400 border-2'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
              }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 border-2 transition-colors duration-300 ${isXCalibrated ? 'bg-blue-500 border-blue-500' : 'border-blue-500 bg-transparent'}`} />
                <input
                  type="text"
                  title="Name of the X axis"
                  value={xAxisName}
                  onChange={(e) => setXAxisName(e.target.value)}
                  className="flex-1 min-w-0 text-xs font-medium bg-transparent border-none p-0 focus:ring-0 text-slate-700 dark:text-slate-200 placeholder-slate-400"
                  placeholder="X Axis Name"
                />
                <button
                  onClick={toggleXAxisLog}
                  title="Toggle Logarithmic Scale for X Axis"
                  className={`text-[10px] px-2 py-0.5 rounded border transition shrink-0 ${xAxis.isLog
                    ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
                    }`}
                >
                  {xAxis.isLog ? 'Log' : 'Lin'}
                </button>
                {isXCalibrated && (
                  <div className="animate-scale-in text-emerald-500" title="Calibrated">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                )}
              </div>
              {xAxis.p1 && xAxis.p2 ? (
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="any"
                    value={xAxis.p1.val}
                    onChange={(e) => updateCalibrationPointValue('X', null, 1, parseFloat(e.target.value))}
                    className="w-[30%] min-w-0 text-xs px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none"
                    placeholder="X1"
                    title="Value for Calibration Point 1"
                  />
                  <input
                    type="number"
                    step="any"
                    value={xAxis.p2.val}
                    onChange={(e) => updateCalibrationPointValue('X', null, 2, parseFloat(e.target.value))}
                    className="w-[30%] min-w-0 text-xs px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none"
                    placeholder="X2"
                    title="Value for Calibration Point 2"
                  />
                  <button
                    onClick={() => startCalibration('X')}
                    title="Recalibrate X Axis"
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startCalibration('X')}
                  title="Start calibration for X axis"
                  className={`w-full flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold transition-all active:scale-95 hover:shadow-sm ${mode === 'CALIBRATE_X'
                    ? 'bg-blue-600 text-white shadow-blue-500/30 animate-pulse-slow'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500'
                    }`}
                >
                  {mode === 'CALIBRATE_X' ? 'Calibrating X...' : 'Calibrate X'}
                </button>
              )}
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

              <div className="flex flex-col gap-2" ref={yAxesParent}>
                {yAxes.map((y) => {
                  const isActive = activeYAxisId === y.id;
                  const isCalibrating = mode === 'CALIBRATE_Y' && isActive;
                  const isYCalibrated = y.calibration.slope !== null && !isNaN(y.calibration.slope);
                  return (
                    <div
                      key={y.id}
                      onClick={() => setActiveYAxis(y.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer animate-slide-up ${isCalibrating
                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 ring-1 ring-blue-500/10'
                        : isYCalibrated
                          ? `bg-green-100 dark:bg-green-900/40 border-green-500 dark:border-green-400 border-2 ${isActive ? 'ring-1 ring-blue-500/20' : ''}`
                          : `bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 ${isActive ? 'ring-1 ring-blue-500/20' : ''}`
                        }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0 border-2 transition-colors duration-300"
                          style={{
                            borderColor: y.color,
                            backgroundColor: isYCalibrated ? y.color : 'transparent'
                          }}
                        />
                        <input
                          type="text"
                          title="Name of the Y axis"
                          value={y.name}
                          onChange={(e) => updateYAxisName(y.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 min-w-0 text-xs font-medium bg-transparent border-none p-0 focus:ring-0 text-slate-700 dark:text-slate-200 placeholder-slate-400"
                          placeholder="Axis Name"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleYAxisLog(y.id); }}
                          title="Toggle Logarithmic Scale for Y Axis"
                          className={`text-[10px] px-2 py-0.5 rounded border transition shrink-0 ${y.calibration.isLog
                            ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
                            }`}
                        >
                          {y.calibration.isLog ? 'Log' : 'Lin'}
                        </button>
                        {isYCalibrated && (
                          <div className="animate-scale-in text-emerald-500" title="Calibrated">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                        )}
                        {yAxes.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteYAxis(y.id); }}
                            title="Delete this Y axis"
                            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 group"
                          >
                            <Trash2 className="h-3.5 w-3.5 transition-transform group-hover:rotate-12 group-hover:scale-110" />
                          </button>
                        )}
                      </div>
                      {y.calibration.p1 && y.calibration.p2 ? (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            step="any"
                            value={y.calibration.p1.val}
                            onChange={(e) => updateCalibrationPointValue('Y', y.id, 1, parseFloat(e.target.value))}
                            className="w-[30%] min-w-0 text-xs px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none"
                            placeholder="Y1"
                            title="Value for Calibration Point 1"
                          />
                          <input
                            type="number"
                            step="any"
                            value={y.calibration.p2.val}
                            onChange={(e) => updateCalibrationPointValue('Y', y.id, 2, parseFloat(e.target.value))}
                            className="w-[30%] min-w-0 text-xs px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none"
                            placeholder="Y2"
                            title="Value for Calibration Point 2"
                          />
                          <button
                            onClick={() => {
                              setActiveYAxis(y.id);
                              startCalibration('Y', y.id);
                            }}
                            title={`Recalibrate ${y.name}`}
                            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 transition group"
                          >
                            <RefreshCw className="h-3.5 w-3.5 transition-transform group-hover:rotate-180 duration-500" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveYAxis(y.id);
                            startCalibration('Y', y.id);
                          }}
                          title="Start calibration for this Y axis"
                          className={`w-full flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold transition-all active:scale-95 hover:shadow-sm ${isCalibrating
                            ? 'bg-blue-600 text-white shadow-blue-500/30 animate-pulse-slow'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500'
                            }`}
                        >
                          {isCalibrating ? `Calibrating ${y.name}...` : `Calibrate ${y.name}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Series Bin */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 space-y-3 transition-all hover:shadow-lg animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Data Series</h3>
              <button
                onClick={addSeries}
                title="Create a new data series"
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 transition group"
              >
                <Plus className="h-4 w-4 transition-transform group-hover:rotate-90 type-spring" />
              </button>
            </div>

            <select
              value={activeSeriesId}
              title="Select active data series"
              onChange={(e) => setActiveSeries(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {series.map((s) => (
                <option key={s.id} value={s.id} className="animate-slide-up">
                  {s.name}
                </option>
              ))}
            </select>

            {activeSeries && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">Name:</span>

                  <div className="relative group/color">
                    <div
                      className="w-5 h-5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer transition-transform active:scale-95 hover:shadow-md"
                      style={{ backgroundColor: activeSeries?.color }}
                      title="Change series color"
                      onClick={(e) => {
                        const input = e.currentTarget.nextElementSibling as HTMLInputElement;
                        input?.click();
                      }}
                    />
                    <input
                      type="color"
                      value={activeSeries?.color || '#000000'}
                      onChange={(e) => updateSeriesColor(activeSeriesId, e.target.value)}
                      className="absolute opacity-0 w-0 h-0 -z-10"
                    />
                  </div>

                  <input
                    type="text"
                    title="Rename selected series"
                    value={activeSeries?.name || ''}
                    onChange={(e) => updateSeriesName(activeSeriesId, e.target.value)}
                    className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Series Name"
                  />
                  <button
                    onClick={() => {
                      openModal({
                        type: 'confirm',
                        message: 'Clear all points in this series?',
                        onConfirm: () => clearSeriesPoints(activeSeriesId)
                      });
                    }}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border border-transparent hover:border-red-200 dark:hover:border-red-800 active:scale-95 group"
                    title="Clear Series Points"
                  >
                    <Trash2 className="h-4 w-4 transition-transform group-hover:rotate-12 group-hover:scale-110" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">Y Axis:</span>
                  <select
                    value={activeSeries.yAxisId}
                    title="Associate this series with a specific Y axis"
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

                <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 space-y-2" ref={seriesSettingsParent}>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" title="Apply a curve fit to the data points">
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
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" title="Show point labels on the canvas">
                      <input
                        type="checkbox"
                        checked={!!activeSeries.showLabels}
                        onChange={() => toggleSeriesLabels(activeSeriesId)}
                        className="checkbox"
                      />
                      Show Label
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer select-none" title="Show coordinate values next to points">
                      <input
                        type="checkbox"
                        checked={!!activeSeries.showPointCoordinates}
                        onChange={() => toggleSeriesPointCoordinates(activeSeriesId)}
                        className="checkbox"
                      />
                      Show Values
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

                      {/* Snap Button */}
                      {activeSeries.fitResult && (
                        <div className="pt-2 animate-in slide-in-from-top-1 fade-in duration-200">
                          <button
                            onClick={() => snapSeriesToFit(activeSeriesId)}
                            className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 transition active:scale-95 text-xs font-medium"
                            title="Snap all points in this series to the calculated curve"
                          >
                            <Magnet className="h-3.5 w-3.5" />
                            Snap Points to Curve
                          </button>
                        </div>
                      )}

                      {/* Warning for insufficient points */}
                      {activeSeries.fitConfig.type === 'polynomial' &&
                        activeSeries.fitConfig.order &&
                        activeSeries.points.filter(p => p.dataX !== undefined).length <= activeSeries.fitConfig.order && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800 flex items-start gap-1.5">
                            <span className="mt-0.5">⚠️</span>
                            <span>Need {activeSeries.fitConfig.order + 1} points for Order {activeSeries.fitConfig.order} fit</span>
                          </div>
                        )}

                      {activeSeries.fitResult?.equation && (
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-1.5 rounded border border-slate-100 dark:border-slate-800 break-all leading-tight">
                          y = {activeSeries.fitResult.equation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div >
            )
            }

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                disabled={!isCalibrated}
                onClick={() => setMode(mode === 'DIGITIZE' ? 'IDLE' : 'DIGITIZE')}
                title="Manually add points by clicking"
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all active:scale-95 hover:shadow-md ${mode === 'DIGITIZE'
                  ? 'bg-emerald-600 text-white shadow-emerald-500/40 scale-[1.02] animate-pulse-slow'
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
                onClick={() => setMode(mode === 'SELECT' ? 'IDLE' : 'SELECT')}
                title="Select and manipulate existing points"
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all active:scale-95 hover:shadow-md ${mode === 'SELECT'
                  ? 'bg-blue-600 text-white shadow-blue-500/40 scale-[1.02] animate-pulse-slow'
                  : isCalibrated
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 ring-1 ring-inset ring-blue-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
              >
                <MousePointer2 className="h-4 w-4" />
                Select
              </button>

              <button
                disabled={!isCalibrated}
                onClick={() => setMode(mode === 'TRACE' ? 'IDLE' : 'TRACE')}
                title="Auto-trace lines by clicking on them"
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all active:scale-95 hover:shadow-md ${mode === 'TRACE'
                  ? 'bg-purple-600 text-white shadow-purple-500/40 scale-[1.02] animate-pulse-slow'
                  : isCalibrated
                    ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 ring-1 ring-inset ring-purple-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
              >
                <Wand2 className="h-4 w-4" />
                Wand
              </button>
              <button
                disabled={!isCalibrated}
                onClick={() => setMode(mode === 'TRACE_ADVANCED' ? 'IDLE' : 'TRACE_ADVANCED')}
                className={`relative overflow-hidden flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all active:scale-95 hover:shadow-md ${mode === 'TRACE_ADVANCED'
                  ? 'bg-fuchsia-600 text-white shadow-fuchsia-500/40 scale-[1.02] animate-pulse-slow'
                  : isCalibrated
                    ? 'bg-fuchsia-50 dark:bg-fuchsia-900/20 text-fuchsia-700 dark:text-fuchsia-400 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900/30 ring-1 ring-inset ring-fuchsia-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
                title="Advanced Wand: Handles dashed lines & intersections"
              >
                <Sparkles className="h-4 w-4" />
                Smart Wand
                <div className="absolute -right-3 top-2 w-12 rotate-45 bg-yellow-300 py-[1px] text-center text-[6px] font-extrabold leading-tight tracking-wider text-yellow-900 shadow-sm">
                  BETA
                </div>
              </button>

              <button
                disabled={!isCalibrated}
                onClick={() => setMode(mode === 'SINGLE_POINT' ? 'IDLE' : 'SINGLE_POINT')}
                title="Add single independent points"
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all active:scale-95 hover:shadow-md ${mode === 'SINGLE_POINT'
                  ? 'bg-amber-500 text-white shadow-amber-500/40 scale-[1.02] animate-pulse-slow'
                  : isCalibrated
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 ring-1 ring-inset ring-amber-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
              >
                <MapPin className="h-4 w-4" />
                Point
              </button>

              <button
                disabled={!isCalibrated || !activeSeries}
                onClick={() => {
                  openModal({
                    type: 'prompt',
                    title: 'Resample / Fit',
                    message: 'Enter target number of points (e.g. 10 to decimate, 100 to interpolate). This will replace current points with points from the best-fit curve.',
                    defaultValue: activeSeries?.points.length.toString(),
                    confirmLabel: 'Resample',
                    onConfirm: (val) => {
                      const count = parseInt(val || '0');
                      if (count > 1) {
                        resampleActiveSeries(count);
                      }
                    }
                  });
                }}
                title="Resample points using best-fit curve"
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all active:scale-95 hover:shadow-md ${false // No active mode for this action?
                  ? 'bg-indigo-600 text-white shadow-indigo-500/40 scale-[1.02] animate-pulse-slow'
                  : isCalibrated && activeSeries && activeSeries.points.length >= 2
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 ring-1 ring-inset ring-indigo-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  } transition-all active:scale-95`}
              >
                <Activity className="h-4 w-4" />
                Resample
              </button>
            </div>
          </div >

          {/* Points Bin */}
          < div className="flex-1 min-h-[400px] p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 flex flex-col transition-all hover:shadow-lg animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Points <span className="ml-1 text-xs font-normal text-slate-400">({series.reduce((acc, s) => acc + s.points.length, 0)})</span></h3>
              <div className="flex gap-1">
                {/* Snap Button */}
                <button
                  onClick={() => setIsSnappingToolOpen(true)}
                  disabled={series.reduce((acc, s) => acc + s.points.length, 0) === 0}
                  title="Snap Points to Value"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 group"
                >
                  <Magnet className="h-3.5 w-3.5 transition-transform group-hover:scale-110 group-hover:-rotate-12" />
                </button>
                {/* Export Mini Buttons */}
                <button
                  onClick={() => handleExportImage()}
                  title="Export Plot Image"
                  className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 ${exportSuccess ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {exportSuccess ? <div className="animate-scale-in"><Check className="h-3.5 w-3.5" /></div> : <Camera className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => handleExportImage(true)}
                  title="Export Graphics Only"
                  className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 ${exportGraphicsSuccess ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {exportGraphicsSuccess ? <div className="animate-scale-in"><Check className="h-3.5 w-3.5" /></div> : <ImageOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={async () => {
                    const tsv = generateTableData(series, '\t');
                    await navigator.clipboard.writeText(tsv);
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                  }}
                  title="Copy to Clipboard"
                  className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 ${copySuccess ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {copySuccess ? <div className="animate-scale-in"><Check className="h-3.5 w-3.5" /></div> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => {
                    const csv = generateTableData(series, ',');
                    downloadCSV(csv, 'digitized_data.csv');
                  }}
                  title="Export CSV"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-all active:scale-95"
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
                      <tr key={i} className="hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group">
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
          </div >

        </div >
      </aside >

      <div className="flex-1 h-full overflow-hidden relative bg-slate-100 dark:bg-slate-950">
        <div className="absolute inset-4 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-500 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col animate-scale-in">

          {/* Canvas Toolbar */}
          <div className="h-10 border-b border-slate-100 dark:border-slate-800 flex items-center px-3 gap-2 bg-slate-50/50 dark:bg-slate-800/30">
            <div
              className="flex items-center gap-1 relative"
              onMouseEnter={() => setIsHistoryOpen(true)}
              onMouseLeave={() => setIsHistoryOpen(false)}
            >
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

              <HistoryList
                isOpen={isHistoryOpen}
                history={activeWorkspace?.history || []}
                currentIndex={activeWorkspace?.historyIndex ?? -1}
                onJump={(index) => {
                  jumpToHistory(index);
                  setIsHistoryOpen(false);
                }}
              />
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
                        openModal({ type: 'confirm', message: "Close this workspace? Unsaved changes will be lost.", onConfirm: () => removeWorkspace(ws.id) });
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition group/close"
                    >
                      <X className="h-3 w-3 transition-transform group-hover/close:rotate-90" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addWorkspace}
                className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 transition shrink-0 group"
                title="New Workspace"
              >
                <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-90 type-spring" />
              </button>
            </div>

            <div className="flex-1" />

            <button
              onClick={() => setIsHelpOpen(true)}
              className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition group"
              title="Help & Information"
            >
              <HelpCircle className="w-4 h-4 transition-transform group-hover:scale-110 group-hover:rotate-12" />
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <DigitizerCanvas ref={digitizerRef} onLoadImage={() => fileInputRef.current?.click()} />
          </div>
        </div>
      </div>
      {
        pdfDocument && (
          <PdfPageSelector
            pdfDocument={pdfDocument}
            onSelectPage={(url) => {
              setImageUrl(url);
              setPdfDocument(null);
            }}
            onCancel={() => setPdfDocument(null)}
          />
        )
      }
      <SnappingTool
        seriesId={activeSeriesId}
        isOpen={isSnappingToolOpen}
        onClose={() => setIsSnappingToolOpen(false)}
      />
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
      <GlobalModal />
    </div >
  );
}

