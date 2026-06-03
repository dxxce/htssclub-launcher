"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, RotateCw, Check, X, Loader2 } from "lucide-react";

interface AvatarCropperProps {
  /** ảnh nguồn (object URL hoặc data URL) */
  src: string;
  /** kích thước ảnh xuất ra (px, vuông). */
  outputSize?: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

const VIEW = 280; // kích thước vùng xem (px)

/**
 * Cắt avatar dạng hình tròn: kéo để di chuyển, thanh trượt để zoom, xoay 90°.
 * Xuất ra Blob PNG vuông (mặc định 512px).
 */
export default function AvatarCropper({
  src,
  outputSize = 512,
  busy = false,
  onCancel,
  onConfirm,
}: AvatarCropperProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [rotation, setRotation] = useState(0); // 0,90,180,270
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // tâm ảnh so với tâm khung
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  // tải ảnh
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const rotated = rotation === 90 || rotation === 270;
      const w = rotated ? img.naturalHeight : img.naturalWidth;
      const h = rotated ? img.naturalWidth : img.naturalHeight;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      const fit = VIEW / Math.min(w, h);
      setMinScale(fit);
      setScale(fit);
      setOffset({ x: 0, y: 0 });
      setLoaded(true);
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // khi xoay, tính lại fit tối thiểu
  useEffect(() => {
    if (!natural.w) return;
    const rotated = rotation === 90 || rotation === 270;
    const w = rotated ? natural.h : natural.w;
    const h = rotated ? natural.w : natural.h;
    const fit = VIEW / Math.min(w, h);
    setMinScale(fit);
    setScale((s) => Math.max(s, fit));
    setOffset({ x: 0, y: 0 });
  }, [rotation, natural]);

  const clampOffset = useCallback(
    (ox: number, oy: number, sc: number) => {
      const rotated = rotation === 90 || rotation === 270;
      const w = (rotated ? natural.h : natural.w) * sc;
      const h = (rotated ? natural.w : natural.h) * sc;
      const maxX = Math.max(0, (w - VIEW) / 2);
      const maxY = Math.max(0, (h - VIEW) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, ox)),
        y: Math.min(maxY, Math.max(-maxY, oy)),
      };
    },
    [natural, rotation]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset(clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy, scale));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const next = Math.min(minScale * 5, Math.max(minScale, scale * (e.deltaY < 0 ? 1.08 : 0.92)));
    setScale(next);
    setOffset((o) => clampOffset(o.x, o.y, next));
  };

  const changeScale = (v: number) => {
    setScale(v);
    setOffset((o) => clampOffset(o.x, o.y, v));
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // tỉ lệ từ vùng xem (VIEW) sang ảnh xuất (outputSize)
    const ratio = outputSize / VIEW;
    ctx.save();
    // nền trong suốt
    ctx.clearRect(0, 0, outputSize, outputSize);
    // dịch về tâm canvas
    ctx.translate(outputSize / 2 + offset.x * ratio, outputSize / 2 + offset.y * ratio);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale * ratio, scale * ratio);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/png",
      0.92
    );
  };

  // style ảnh hiển thị trong vùng xem
  const imgStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${scale})`,
    transformOrigin: "center center",
    width: natural.w,
    height: natural.h,
    maxWidth: "none",
    userSelect: "none",
    pointerEvents: "none",
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative overflow-hidden rounded-xl bg-black/40 touch-none cursor-grab active:cursor-grabbing"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        {loaded && natural.w > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={imgRef as any} src={src} alt="" style={imgStyle} draggable={false} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
        )}
        {/* overlay vùng cắt hình tròn */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-black/55" style={{ WebkitMaskImage: "radial-gradient(circle at center, transparent 0, transparent 49.5%, black 50%)", maskImage: "radial-gradient(circle at center, transparent 0, transparent 49.5%, black 50%)" }} />
          <div className="absolute inset-2 rounded-full border-2 border-white/70" />
        </div>
      </div>

      {/* điều khiển zoom + xoay */}
      <div className="flex items-center gap-3 w-full mt-4 px-1">
        <ZoomOut className="w-4 h-4 text-neutral-500 flex-shrink-0" />
        <input
          type="range"
          min={minScale}
          max={minScale * 5}
          step={0.001}
          value={scale}
          onChange={(e) => changeScale(parseFloat(e.target.value))}
          className="flex-1 accent-violet-500 cursor-pointer"
        />
        <ZoomIn className="w-4 h-4 text-neutral-500 flex-shrink-0" />
        <button
          onClick={() => setRotation((r) => (r + 90) % 360)}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
          title="Xoay 90°"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[11px] text-neutral-500 mt-2">Kéo để di chuyển · cuộn để phóng to</p>

      <div className="flex items-center gap-2 w-full mt-4">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-neutral-300 hover:text-white hover:bg-white/[0.08] text-sm font-bold transition-all cursor-pointer disabled:opacity-50"
        >
          <X className="w-4 h-4" />
          Huỷ
        </button>
        <button
          onClick={handleConfirm}
          disabled={busy || !loaded}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Lưu avatar
        </button>
      </div>
    </div>
  );
}
