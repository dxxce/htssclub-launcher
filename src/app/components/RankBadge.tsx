"use client";

import { Shield, Gem, Crown, Award } from "lucide-react";
import type { RankInfo, BadgeShape } from "../lib/communityApi";

// Huy hiệu rank (tier/division). Màu + hình lấy trực tiếp từ rank object (backend
// là nguồn chân lý về cosmetics).
function ShapeIcon({ shape, className }: { shape?: BadgeShape; className?: string }) {
  switch (shape) {
    case "gem": return <Gem className={className} />;
    case "crown": return <Crown className={className} />;
    case "wings": return <Award className={className} />;
    default: return <Shield className={className} />;
  }
}

// hex (#rrggbb) -> rgba với alpha cho nền/viền mờ.
function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export default function RankBadge({ rank, size = "sm" }: { rank?: RankInfo | null; size?: "sm" | "md" }) {
  if (!rank || !rank.tier || rank.tier === "UNRANKED") return null;
  const color = rank.color || "#9ca3af";
  const color2 = rank.colorSecondary || color;
  const label = rank.label || rank.tierName || rank.tier;
  const cls = size === "md" ? "text-[11px] px-2 py-0.5 gap-1" : "text-[10px] px-1.5 py-0.5 gap-1";
  const icon = size === "md" ? "w-3.5 h-3.5" : "w-3 h-3";
  return (
    <span
      data-tip={`Hạng ${label}`}
      data-tip-pos="top"
      className={`inline-flex items-center rounded-md font-extrabold leading-none flex-shrink-0 border ${cls}`}
      style={{
        background: `linear-gradient(135deg, ${rgba(color, 0.2)}, ${rgba(color2, 0.12)})`,
        borderColor: rgba(color, 0.4),
        color: color2,
        boxShadow: rank.glow ? `0 0 10px ${rgba(color, 0.5)}` : undefined,
      }}
    >
      <ShapeIcon shape={rank.shape} className={icon} />
      {label}
    </span>
  );
}
