import React, { useEffect, useState, useRef } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { generateWandVariations } from '../utils/smartWand';
import type { WandPreset, Point } from '../utils/smartWand';

interface WandVariationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (points: Point[]) => void;
    imageData: ImageData;
    seed: Point;
    targetColor: { r: number; g: number; b: number }; // purely for vis if needed, though wand ignores it
}

export const WandVariationModal: React.FC<WandVariationModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    imageData,
    seed,
}) => {
    const [variations, setVariations] = useState<{ preset: WandPreset; points: Point[] }[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen && imageData) {
            setLoading(true);
            // Run in timeout to let UI render the modal first
            setTimeout(() => {
                const vars = generateWandVariations(imageData, seed);
                setVariations(vars);
                setLoading(false);
                // Default select 'balanced' (index 0 usually)
                if (vars.length > 0) setSelectedIdx(0);
            }, 50);
        } else {
            setVariations([]);
            setSelectedIdx(null);
        }
    }, [isOpen, imageData, seed]);

    // Global Keyboard Interaction
    useEffect(() => {
        if (!isOpen) return;
        const handleKeys = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleConfirm();
            }
        };
        window.addEventListener('keydown', handleKeys, { capture: true });
        return () => window.removeEventListener('keydown', handleKeys, { capture: true });
    }, [isOpen, selectedIdx, variations, onClose]); // Dependencies for closure stability

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (selectedIdx !== null && variations[selectedIdx]) {
            onSelect(variations[selectedIdx].points);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Smart Wand Variations</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Select the best result.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 min-h-[400px]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-4">
                            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                            <p className="text-slate-500 font-medium">Analyzing path options...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            {variations.map((v, i) => (
                                <VariationCard
                                    key={v.preset.id}
                                    variation={v}
                                    isSelected={i === selectedIdx}
                                    onClick={() => setSelectedIdx(i)}
                                    width={imageData.width}
                                    height={imageData.height}
                                    seed={seed}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIdx === null || loading}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
                    >
                        <Check className="h-4 w-4" />
                        Use Selected Trace
                    </button>
                </div>
            </div>
        </div>
    );
};

// Canvas preview card
const VariationCard: React.FC<{
    variation: { preset: WandPreset; points: Point[] };
    isSelected: boolean;
    onClick: () => void;
    width: number;
    height: number;
    seed: Point;
}> = ({ variation, isSelected, onClick, width, height, seed }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw bounds calculation to fit trace in view
        // Find bounding box of points + seed
        let minX = seed.x, maxX = seed.x, minY = seed.y, maxY = seed.y;

        // Add some padding context
        const pad = 50;
        variation.points.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        // Determine scale to fit in the card canvas (lets say 300x200 fixed)
        const cardW = canvas.width;
        const cardH = canvas.height;

        const contentW = (maxX - minX) + pad * 2;
        const contentH = (maxY - minY) + pad * 2;

        const scale = Math.min(cardW / contentW, cardH / contentH);

        // Transform
        ctx.save();
        ctx.translate(cardW / 2, cardH / 2);
        ctx.scale(scale, scale);
        ctx.translate(-(minX + (maxX - minX) / 2), -(minY + (maxY - minY) / 2));

        // Draw Points
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = '#2563eb'; // blue-600
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (variation.points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(variation.points[0].x, variation.points[0].y);
            for (let i = 1; i < variation.points.length; i++) {
                ctx.lineTo(variation.points[i].x, variation.points[i].y);
            }
            ctx.stroke();
        }

        // Draw Seed
        ctx.fillStyle = '#ef4444'; // red-500
        ctx.beginPath();
        ctx.arc(seed.x, seed.y, 4 / scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

    }, [variation, width, height, seed]);

    return (
        <div
            onClick={onClick}
            className={`group relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md ${isSelected
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-slate-600'
                }`}
        >
            <div className="aspect-video w-full bg-slate-100 dark:bg-slate-900/50 relative">
                {/* Background Grid Pattern (CSS or SVG) could go here for "transparency" look */}
                <canvas
                    ref={canvasRef}
                    width={300}
                    height={200}
                    className="w-full h-full object-contain"
                />
                <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                    {variation.points.length} pts
                </div>
            </div>

            <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                    <h3 className={`font-bold text-sm ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                        {variation.preset.name}
                    </h3>
                    {isSelected && <div className="bg-blue-500 rounded-full p-0.5"><Check className="w-3 h-3 text-white" /></div>}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{variation.preset.description}</p>
            </div>
        </div>
    );
};
