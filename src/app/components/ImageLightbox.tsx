"use client";

import { useEffect } from "react";
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { openExternal } from "../lib/linkUtils";

// Lightbox xem ảnh full màn hình (điều hướng trái/phải, mở ngoài).
export default function ImageLightbox({
  images, index, onClose, onIndex,
}: {
  images: { url: string; name: string }[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const cur = images[index];
  const hasMany = images.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasMany) onIndex((index - 1 + images.length) % images.length);
      else if (e.key === "ArrowRight" && hasMany) onIndex((index + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, hasMany, onClose, onIndex]);

  if (!cur) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div className="absolute top-0 inset-x-0 h-14 flex items-center justify-between px-5 z-10" onMouseDown={(e) => e.stopPropagation()}>
        <span className="text-[12px] font-semibold text-neutral-300 truncate max-w-[60%]">
          {cur.name}{hasMany ? `  ·  ${index + 1}/${images.length}` : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => openExternal(cur.url)} data-tip="Mở trong trình duyệt" data-tip-pos="bottom" className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {hasMany && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onIndex((index - 1 + images.length) % images.length)}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.15] text-white transition-colors cursor-pointer z-10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cur.url}
        alt={cur.name}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[86vh] object-contain rounded-lg shadow-2xl animate-pop-in"
      />

      {hasMany && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onIndex((index + 1) % images.length)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.15] text-white transition-colors cursor-pointer z-10"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {hasMany && (
        <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-2 px-4 overflow-x-auto custom-scrollbar" onMouseDown={(e) => e.stopPropagation()}>
          {images.map((im, i) => (
            <button
              key={i}
              onClick={() => onIndex(i)}
              className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all cursor-pointer ${i === index ? "border-violet-400" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
