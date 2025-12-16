import React, { useRef, useEffect } from 'react';

interface MagnifierProps {
    imageUrl: string | null;
    stageRef: React.RefObject<any>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    magPos: { x: number; y: number };
    setMagPos: (pos: { x: number; y: number }) => void;
    magSize: { width: number; height: number };
    setMagSize: (size: { width: number; height: number }) => void;
    magnifierZoom: number;
    setMagnifierZoom: React.Dispatch<React.SetStateAction<number>>;
    zoomFactors: number[];
}

export const Magnifier: React.FC<MagnifierProps> = ({
    imageUrl,
    stageRef,
    containerRef,
    magPos,
    setMagPos,
    magSize,
    setMagSize,
    magnifierZoom,
    setMagnifierZoom,
    zoomFactors
}) => {
    const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);
    const magDragRef = useRef<{ startX: number, startY: number, initPos: { x: number, y: number } } | null>(null);
    const magResizeRef = useRef<{ startX: number, startY: number, initSize: { width: number, height: number } } | null>(null);

    // Update Loop (The Lens Effect)
    const updateMagnifier = React.useCallback(() => {
        if (!imageUrl || !magnifierCanvasRef.current || !stageRef.current) return;

        const stage = stageRef.current;
        const pointer = stage.getPointerPosition();

        // If mouse is outside stage, do not update (or show blank)
        if (!pointer) return;

        const canvas = magnifierCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const layers = stage.getChildren(); // Get all Konva Layers

        const pixelRatio = window.devicePixelRatio || 1;
        const width = magSize.width;
        const height = magSize.height;
        const zoom = magnifierZoom;

        // Ensure Canvas Buffer Size matches display size * pixelRatio
        if (canvas.width !== width * pixelRatio) canvas.width = width * pixelRatio;
        if (canvas.height !== height * pixelRatio) canvas.height = height * pixelRatio;

        // 1. Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. define "Source" region logic (The Lens)
        // We want to magnify the pixels where the MOUSE CURSOR is.
        const cx = pointer.x;
        const cy = pointer.y;

        // Visual region to capture (smaller than mag window because we are zooming in)
        const srcW = width / zoom;
        const srcH = height / zoom;
        const srcX = cx - srcW / 2;
        const srcY = cy - srcH / 2;

        // 3. Draw Layers
        // Konva layers are backed by native canvases that map 1:1 to the Stage container (usually)
        layers.forEach((layer: any) => {
            if (!layer.isVisible()) return;

            // Accessing private _canvas is a bit hacky but efficient for this
            const nativeCanvas = layer.getCanvas()._canvas;

            // Draw cropped region from layer -> magnifier
            // Important: Konva back-buffer is scaled by pixelRatio
            ctx.drawImage(
                nativeCanvas,
                srcX * pixelRatio,
                srcY * pixelRatio,
                srcW * pixelRatio,
                srcH * pixelRatio,
                0, 0,
                width * pixelRatio,
                height * pixelRatio
            );
        });

        // 4. Draw Crosshair (Reticle)
        ctx.save();
        ctx.scale(pixelRatio, pixelRatio);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height);
        ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2);
        ctx.stroke();

        ctx.restore();

    }, [imageUrl, magPos, magSize, magnifierZoom, stageRef]);

    // Animation Loop
    React.useLayoutEffect(() => {
        let animId: number;
        const loop = () => {
            updateMagnifier();
            animId = requestAnimationFrame(loop);
        };
        animId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animId);
    }, [updateMagnifier]);


    // Global Event Handlers for Drag/Resize
    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (magDragRef.current && containerRef.current) {
                // Dragging Logic
                const dx = e.clientX - magDragRef.current.startX;
                const dy = e.clientY - magDragRef.current.startY;

                const box = containerRef.current.getBoundingClientRect();

                let nx = magDragRef.current.initPos.x + dx;
                let ny = magDragRef.current.initPos.y + dy;

                // Clamp
                nx = Math.max(0, Math.min(nx, box.width - magSize.width));
                ny = Math.max(0, Math.min(ny, box.height - magSize.height));

                setMagPos({ x: nx, y: ny });
            }

            if (magResizeRef.current) {
                // Resize Logic
                const dx = e.clientX - magResizeRef.current.startX;
                const dy = e.clientY - magResizeRef.current.startY;

                const nw = Math.max(150, magResizeRef.current.initSize.width + dx);
                const nh = Math.max(150, magResizeRef.current.initSize.height + dy);
                setMagSize({ width: nw, height: nh });
            }
        };

        const handleUp = () => {
            magDragRef.current = null;
            magResizeRef.current = null;
            document.body.style.cursor = '';
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [magSize, containerRef, setMagPos, setMagSize, magSize.width, magSize.height]);

    const cycleZoom = () => {
        setMagnifierZoom(z => {
            const idx = zoomFactors.indexOf(z);
            return zoomFactors[(idx + 1) % zoomFactors.length];
        });
    };

    if (!imageUrl || magPos.x <= -5000) return null;

    return (
        <div
            className="absolute border-[3px] border-white ring-1 ring-slate-900/10 shadow-2xl z-20 rounded-xl overflow-hidden bg-white dark:bg-slate-800"
            style={{
                left: magPos.x,
                top: magPos.y,
                width: magSize.width,
                height: magSize.height,
                cursor: 'move',
            }}
            onMouseDown={(e) => {
                if (e.target !== e.currentTarget) return;
                magDragRef.current = {
                    startX: e.clientX,
                    startY: e.clientY,
                    initPos: { ...magPos }
                };
            }}
        >
            <canvas
                ref={magnifierCanvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    pointerEvents: 'none'
                }}
            />

            {/* Zoom label */}
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    cycleZoom();
                }}
                className="absolute bottom-2 right-1/2 translate-x-1/2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm cursor-pointer hover:bg-black/70 select-none transition-colors"
            >
                {magnifierZoom}x
            </div>

            {/* Resize Handle */}
            <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-30"
                style={{
                    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.2) 50%)'
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    magResizeRef.current = {
                        startX: e.clientX,
                        startY: e.clientY,
                        initSize: { ...magSize }
                    };
                    document.body.style.cursor = 'nwse-resize';
                }}
            />
        </div>
    );
};
