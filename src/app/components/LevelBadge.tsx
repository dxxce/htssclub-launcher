"use client";

import { Circle, Square, Shield, Hexagon, Star, Crown } from "lucide-react";
import type { CSSProperties } from "react";
import type { LevelStyle, BadgeShape } from "../lib/communityApi";

function ShapeIcon({ shape, className }: { shape?: BadgeShape; className?: string }) {
  switch (shape) {
    case "square": return <Square className={className} />;
    case "shield": return <Shield className={className} />;
    case "hexagon": return <Hexagon className={className} />;
    case "star": return <Star className={className} />;
    case "crown": return <Crown className={className} />;
    default: return <Circle className={className} />;
  }
}

// hex (#rrggbb) -> rgba với alpha cho nền/viền/glow mờ.
export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Màu mặc định theo bậc level (fallback khi backend chưa trả style).
export function fallbackTier(level: number): { color: string; color2: string } {
  if (level >= 101) return { color: "#fb7185", color2: "#f43f5e" };
  if (level >= 91) return { color: "#ef4444", color2: "#f87171" };
  if (level >= 81) return { color: "#f97316", color2: "#fb923c" };
  if (level >= 71) return { color: "#ec4899", color2: "#f472b6" };
  if (level >= 61) return { color: "#a855f7", color2: "#c084fc" };
  if (level >= 51) return { color: "#8b5cf6", color2: "#a78bfa" };
  if (level >= 41) return { color: "#6366f1", color2: "#818cf8" };
  if (level >= 31) return { color: "#3b82f6", color2: "#60a5fa" };
  if (level >= 21) return { color: "#14b8a6", color2: "#2dd4bf" };
  if (level >= 11) return { color: "#22c55e", color2: "#86efac" };
  return { color: "#64748b", color2: "#94a3b8" };
}

// Lấy cặp màu của một level (ưu tiên style backend, fallback theo bậc).
export function levelColors(level?: number, style?: LevelStyle): { color: string; color2: string; glow: boolean } | null {
  if (typeof level !== "number" || level < 1) return null;
  const fb = fallbackTier(level);
  return {
    color: style?.color || fb.color,
    color2: style?.colorSecondary || fb.color2,
    glow: !!style?.glow,
  };
}

// Style cho TÊN người dùng: tô màu theo level + glow nhẹ (đậm hơn nếu style.glow).
export function levelNameStyle(level?: number, style?: LevelStyle): CSSProperties | undefined {
  const c = levelColors(level, style);
  if (!c) return undefined;
  return {
    color: c.color2,
    textShadow: c.glow ? `0 0 12px ${rgba(c.color, 0.75)}` : `0 0 7px ${rgba(c.color, 0.4)}`,
  };
}

// Huy hiệu cấp độ — phong cách "kính mờ": nền + viền màu nhạt, icon + chữ màu sáng.
export default function LevelBadge({ level, style, size = "sm" }: { level?: number; style?: LevelStyle; size?: "sm" | "md" }) {
  const c = levelColors(level, style);
  if (!c) return null;
  const cls = size === "md" ? "text-[11px] px-2 py-0.5 gap-1" : "text-[10px] px-1.5 py-0.5 gap-1";
  const icon = size === "md" ? "w-3.5 h-3.5" : "w-3 h-3";
  return (
    <span
      data-tip={`Cấp ${level}${style?.name ? ` · ${style.name}` : ""}`}
      data-tip-pos="top"
      className={`inline-flex items-center rounded-md font-extrabold tabular-nums leading-none flex-shrink-0 border ${cls}`}
      style={{
        background: `linear-gradient(135deg, ${rgba(c.color, 0.2)}, ${rgba(c.color2, 0.12)})`,
        borderColor: rgba(c.color, 0.4),
        color: c.color2,
        boxShadow: c.glow ? `0 0 10px ${rgba(c.color, 0.5)}` : undefined,
      }}
    >
      <ShapeIcon shape={style?.shape} className={icon} />
      <span style={{ color: "#f5f5f7" }}>Lv{level}</span>
    </span>
  );
}
