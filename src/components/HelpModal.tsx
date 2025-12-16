import React, { useState } from 'react';
import { X, HelpCircle, FileText, Info, GitCommit } from 'lucide-react';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

import changelogText from '../../CHANGELOG.md?raw';

interface ChangeLogEntry {
    version?: string;
    date?: string;
    content: React.ReactNode[];
}

const parseChangelog = (text: string): ChangeLogEntry[] => {
    const lines = text.split('\n');
    const entries: ChangeLogEntry[] = [];
    let currentEntry: ChangeLogEntry | null = null;
    let currentList: React.ReactElement[] = [];

    const flushList = (entry: ChangeLogEntry) => {
        if (currentList.length > 0) {
            entry.content.push(
                <ul key={`list-${entry.content.length}`} className="list-disc pl-5 space-y-1 mb-4">
                    {currentList}
                </ul>
            );
            currentList = [];
        }
    };

    lines.forEach((line, index) => {
        const h2Match = line.match(/^## \[(.*?)\] - (.*)/);
        if (h2Match) {
            if (currentEntry) {
                flushList(currentEntry);
                entries.push(currentEntry);
            }
            currentEntry = {
                version: h2Match[1],
                date: h2Match[2],
                content: [],
            };
            return;
        }

        if (!currentEntry) return;

        const h3Match = line.match(/^### (.*)/);
        if (h3Match) {
            flushList(currentEntry);
            currentEntry.content.push(
                <h4 key={`h4-${index}`} className="font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">
                    {h3Match[1]}
                </h4>
            );
            return;
        }

        const listMatch = line.match(/^[-*] (.*)/);
        if (listMatch) {
            // Check for indented sub-items (simple heuristic)
            // Ideally we'd track indentation levels, but for this specific changelog format, 
            // the main items are rendered as top-level bullets.
            // If the line *before* this one was a list item or sub-item, we are in a list.

            // Actually, let's keep it simple: generic bullet rendering.
            // Bold text handling: **text**
            const content = listMatch[1].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            currentList.push(
                <li key={`li-${index}`} className="text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: content }} />
            );
            return;
        }

        // Handle sub-lists (indented) - distinct form top level? 
        // For simplicity in this regex-based parser, we treat indented dashed lines as list items too.
        // If we want nested ULs, we need state. For now, flat list is okay or just indented visuals.
        const subListMatch = line.match(/^\s+[-*] (.*)/);
        if (subListMatch) {
            const content = subListMatch[1].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            currentList.push(
                <li key={`li-${index}`} className="text-slate-600 dark:text-slate-300 ml-4 list-[circle]" dangerouslySetInnerHTML={{ __html: content }} />
            );
            return;
        }
    });

    if (currentEntry) {
        flushList(currentEntry);
        entries.push(currentEntry);
    }

    return entries;
};

const changelogEntries = parseChangelog(changelogText);

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'usage' | 'changelog' | 'about'>('usage');

    // Global Key Listener
    React.useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl h-[80vh] border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold">
                        <HelpCircle className="w-5 h-5 text-blue-500" />
                        <h3>Help & Information</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-4 pt-4 border-b border-slate-100 dark:border-slate-800 flex gap-4">
                    <button
                        onClick={() => setActiveTab('usage')}
                        className={`pb-2 text-sm font-medium transition relative ${activeTab === 'usage'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Usage
                        </div>
                        {activeTab === 'usage' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('changelog')}
                        className={`pb-2 text-sm font-medium transition relative ${activeTab === 'changelog'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <GitCommit className="w-4 h-4" />
                            Changelog
                        </div>
                        {activeTab === 'changelog' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('about')}
                        className={`pb-2 text-sm font-medium transition relative ${activeTab === 'about'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            About
                        </div>
                        {activeTab === 'about' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
                        )}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'usage' && (
                        <div className="space-y-6 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                            <section>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Getting Started</h4>
                                <p>
                                    Welcome to Plot Digitizer! This tool helps you extract numerical data from images of plots and graphs.
                                    Follow these steps to digitize your data:
                                </p>
                            </section>

                            <section>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">1. Load Your Image</h4>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Drag and drop an image file (PNG, JPG, SVG) onto the canvas, or click "Load Image / PDF" in the sidebar.</li>
                                    <li>You can also paste an image directly from your clipboard (Ctrl+V).</li>
                                </ul>
                            </section>

                            <section>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">2. Calibrate Axes</h4>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Click "Calibrate X" in the sidebar. Click two points on the X-axis of your image and enter their values.</li>
                                    <li>Click "Calibrate Y" (or standard Y axis). Click two points on the Y-axis and enter their values.</li>
                                    <li><strong>Calibration Guides:</strong> Visual crosshairs and guides assist in aligning the second point perfectly horizontally or vertically.</li>
                                    <li>Ensure axes names and log scales are set correctly if needed.</li>
                                </ul>
                            </section>

                            <section>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">3. Digitize Points</h4>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><strong>Digitize (Manual):</strong> Click to place individual points along the data series.</li>
                                    <li><strong>Wand (Auto-Trace):</strong> Click and drag to flood-fill and detect lines of a specific color.</li>
                                    <li><strong>Smart Wand:</strong> A guided tracing tool that follows the path you drag along, automatically placing points.</li>
                                    <li><strong>Point Tool:</strong> Place independent "Points of Interest" (POI pins) separate from the main data series.</li>
                                    <li><strong>Select / Edit:</strong> Move or delete existing points.</li>
                                </ul>
                            </section>

                            <section>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">4. Managing Data</h4>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><strong>Series Management:</strong> Add multiple data series. Rename them and change their color using the color picker dot.</li>
                                    <li><strong>Fit & Resample:</strong> Use the "Fit & Resample" button to fit a curve (Linear, Polynomial, Exponential) and generate a new set of evenly spaced points based on that fit.</li>
                                </ul>
                            </section>

                            <section>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">5. Export Data</h4>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>The data table updates automatically. Click "Copy" or "Download CSV".</li>
                                    <li>Export the annotated plot as an image, or "Graphics Only" for a transparent overlay.</li>
                                </ul>
                            </section>
                        </div>
                    )}

                    {activeTab === 'changelog' && (
                        <div className="space-y-6">
                            {changelogEntries.map((entry, i) => (
                                <div key={i} className="border-b border-slate-100 dark:border-slate-800 pb-4 last:border-0 last:pb-0">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-baseline gap-3">
                                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                                {entry.version}
                                            </h3>
                                            <span className="text-xs font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                {entry.date}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-sm">
                                        {entry.content}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'about' && (
                        <div className="space-y-6 text-center py-8">
                            <div>
                                <img
                                    src={`${import.meta.env.BASE_URL}logo.png`}
                                    alt="Logo"
                                    className="w-20 h-20 mx-auto mb-4 object-contain"
                                />
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Plot Digitizer</h2>
                                <span className="px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 text-xs font-bold tracking-wide uppercase border border-blue-200 dark:border-blue-500/30">
                                    Version {__APP_VERSION__}
                                </span>
                            </div>

                            <div className="max-w-md mx-auto text-slate-600 dark:text-slate-400 text-sm">
                                <p className="mb-4">
                                    A professional tool designed to help researchers, students, and engineers extract precise data from plots, charts, and graphs.
                                </p>
                            </div>

                            <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-2">Created By</h4>
                                <p className="text-slate-800 dark:text-slate-200 font-medium">Ross Volkwein</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
};
