import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  alt?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;

export default function WhatsAppImageLightbox({ src, alt = "Imagem", open, onOpenChange }: Props) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  const resetView = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) resetView();
  }, [open, resetView]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!open || !el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => {
        const next = s + (e.deltaY < 0 ? 0.12 : -0.12);
        return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s + 0.25));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s - 0.25));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    dragging.current = true;
    lastPoint.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setPos((p) => ({
      x: p.x + e.clientX - lastPoint.current.x,
      y: p.y + e.clientY - lastPoint.current.y,
    }));
    lastPoint.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 max-w-[100vw] w-[100vw] h-[100vh] max-h-[100vh]",
          "translate-x-[-50%] translate-y-[-50%] border-0 bg-black/95 p-0 rounded-none",
          "sm:rounded-none overflow-hidden",
        )}
      >
        <DialogTitle className="sr-only">Visualizar imagem</DialogTitle>

        <div
          ref={viewportRef}
          className={cn(
            "relative flex-1 min-h-0 overflow-hidden touch-none",
            scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => {
            if (scale === 1) setScale(2);
            else resetView();
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={src}
              alt={alt}
              draggable={false}
              className="max-w-full max-h-full select-none object-contain transition-transform duration-75"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                transformOrigin: "center center",
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 border-t border-white/10 bg-black/80 px-4 py-3 shrink-0">
          <Button type="button" variant="secondary" size="sm" onClick={zoomOut} aria-label="Diminuir zoom">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-white/80 tabular-nums min-w-[3rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={zoomIn} aria-label="Aumentar zoom">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={resetView} aria-label="Resetar zoom">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <span className="hidden sm:inline text-[11px] text-white/50 ml-2">
            Scroll para zoom · arraste para mover · duplo clique para ampliar
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
