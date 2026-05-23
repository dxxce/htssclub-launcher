"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  Gift, RotateCw, ExternalLink, HelpCircle, ArrowUpRight, Gamepad2, ChevronDown
} from "lucide-react";

interface EpicGame {
  id: string;
  title: string;
  description: string;
  img: string;
  originalPrice: string;
  discountPrice: string;
  discountPriceNumeric: number;
  discountPct: number;
  slug: string;
  isFree: boolean;
}

interface EpicElement {
  id: string;
  title: string;
  description?: string;
  keyImages?: { type: string; url: string }[];
  price?: {
    totalPrice?: {
      fmtPrice?: {
        originalPrice?: string;
        discountPrice?: string;
      };
      originalPrice?: number;
      discountPrice?: number;
    };
  };
  categories?: { path: string }[];
  productSlug?: string;
  urlSlug?: string;
  catalogNs?: {
    mappings?: { pageSlug: string; pageType: string }[];
  };
}

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  isEpic?: boolean;
}

function CustomSelect({ value, onChange, options, className = "", isEpic = true }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);
  const activeColor = isEpic ? "text-violet-400 border-violet-500/30" : "text-cyan-400 border-cyan-500/30";
  const hoverColor = isEpic ? "hover:border-violet-500/30 hover:shadow-[0_0_15px_rgba(139,92,246,0.1)]" : "hover:border-cyan-500/30 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)]";

  return (
    <div ref={ref} className={`relative select-none ${className}`}>
      {/* Trigger Button */}
      <div 
        onClick={() => setOpen(!open)}
        className={`bg-[#06060c]/60 hover:bg-[#0c0c16]/85 border border-white/5 ${open ? activeColor : ""} ${hoverColor} text-neutral-300 text-xs font-semibold rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-all duration-300 min-w-[160px] shadow-sm`}
      >
        <span className="tracking-wide">{selectedOption?.label}</span>
        <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-300 ${open ? "rotate-180 " + (isEpic ? "text-violet-400" : "text-cyan-400") : ""}`} />
      </div>
      
      {/* Dropdown Menu */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-full bg-[#08080f]/95 border border-white/10 backdrop-blur-xl rounded-xl py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-50 overflow-hidden animate-fade-in origin-top transition-all duration-200">
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`relative mx-1.5 my-0.5 px-3 py-2 text-xs rounded-lg cursor-pointer transition-all duration-200 flex items-center justify-between ${
                  isActive 
                    ? "bg-violet-500/10 text-violet-400 font-bold"
                    : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className="tracking-wide">{opt.label}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-md" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface EpicGameCardProps {
  game: EpicGame;
  handleCardClick: (game: EpicGame) => void;
  handleOpenGame: (url: string) => void;
}

function EpicGameCard({ game, handleCardClick, handleOpenGame }: EpicGameCardProps) {
  const imgSrc = game.img;
  const [isBroken, setIsBroken] = useState(false);

  const hasDiscount = game.discountPct > 0;
  const originalPriceDisplay = game.originalPrice || `${game.discountPriceNumeric}đ`;

  return (
    <div
      onClick={() => handleCardClick(game)}
      className="group bg-[#0e0e15]/40 hover:bg-[#12121e]/85 border border-white/5 hover:border-violet-500/40 rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:shadow-[0_12px_32px_rgba(139,92,246,0.12)] hover:-translate-y-1.5 transition-all duration-300 relative flex flex-col justify-between backdrop-blur-md"
    >
      <div>
        {/* Game Image with hover animation */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-neutral-950 flex items-center justify-center border-b border-white/5">
          {isBroken || !imgSrc ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-violet-950/10 text-violet-500/40">
              <Gift className="w-10 h-10 mb-1.5 animate-pulse" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Epic Games</span>
            </div>
          ) : (
            <img
              src={imgSrc}
              alt=""
              onError={() => setIsBroken(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          )}

          {/* Quick action overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-bold text-white shadow-lg">
              <span>Mở Epic Games Launcher</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Text Details */}
        <div className="p-3.5 pb-0">
          <h3 className="text-xs font-bold text-neutral-100 group-hover:text-violet-400 transition-colors line-clamp-2 leading-relaxed tracking-wide min-h-[36px]">
            {game.title}
          </h3>
          <p className="text-[10px] text-neutral-500 mt-1.5 line-clamp-2 leading-normal min-h-[30px]">
            {game.description || "Không có mô tả chi tiết."}
          </p>
        </div>
      </div>

      {/* Price block */}
      <div className="p-3.5 pt-0">
        <div className="h-px bg-white/5 my-3" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {game.isFree ? (
              <span className="bg-emerald-500 text-black font-black text-[10px] px-2 py-1 rounded-md leading-none select-none tracking-wider uppercase animate-pulse">
                MIỄN PHÍ
              </span>
            ) : hasDiscount ? (
              <>
                <span className="bg-violet-500 text-black font-black text-[10px] px-1.5 py-1 rounded-md leading-none select-none">
                  -{game.discountPct}%
                </span>
                <div className="flex flex-col justify-center">
                  <span className="text-[9px] text-neutral-500 line-through leading-none">
                    {originalPriceDisplay}
                  </span>
                  <span className="text-xs font-black text-violet-400 mt-0.5 leading-none">
                    {game.discountPrice}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-xs font-black leading-none text-neutral-200">
                {game.discountPrice || "Free"}
              </span>
            )}
          </div>

          {/* Action buttons (Deep link & Web link) */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenGame(`com.epicgames.launcher://store/p/${game.slug}`);
              }}
              className="w-7 h-7 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/10 hover:border-violet-500/30 flex items-center justify-center text-violet-400 transition-colors cursor-pointer"
              title="Mở trong Epic Games Launcher (Deep link)"
            >
              <Gamepad2 className="w-3.5 h-3.5" />
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenGame(`https://store.epicgames.com/p/${game.slug}`);
              }}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-500 hover:text-white transition-colors cursor-pointer"
              title="Mở trong trình duyệt web"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EpicSales({ isMini = false }: { isMini?: boolean }) {
  const [games, setGames] = useState<EpicGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEpicDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const rawResponse = await invoke<string>("fetch_epic_games");

      let data;
      try {
        data = JSON.parse(rawResponse);
      } catch {
        throw new Error("Không thể phân tích phản hồi từ Epic Games Store.");
      }

      const elements = (data?.data?.Catalog?.searchStore?.elements || []) as EpicElement[];
      const parsed: EpicGame[] = [];

      elements.forEach((el) => {
        // Find best image
        let img = "";
        if (el.keyImages && el.keyImages.length > 0) {
          const wide = el.keyImages.find((imgObj) => imgObj.type === "OfferImageWide");
          const thumb = el.keyImages.find((imgObj) => imgObj.type === "Thumbnail");
          img = wide?.url || thumb?.url || el.keyImages[0]?.url || "";
        }

        // Get prices
        const originalPrice = el.price?.totalPrice?.fmtPrice?.originalPrice || "";
        const discountPrice = el.price?.totalPrice?.fmtPrice?.discountPrice || "";
        const discountPriceNumeric = el.price?.totalPrice?.discountPrice ?? 999999;
        
        // Calculate discount percentage
        const origNumeric = el.price?.totalPrice?.originalPrice || 0;
        const discNumeric = el.price?.totalPrice?.discountPrice || 0;
        let discountPct = 0;
        if (origNumeric > 0) {
          discountPct = Math.round(((origNumeric - discNumeric) / origNumeric) * 100);
        }

        // Slug
        const slug = el.productSlug || el.urlSlug || el.catalogNs?.mappings?.[0]?.pageSlug || "";

        // Check if it is currently free
        const isFree = discountPriceNumeric === 0 || el.categories?.some((cat) => cat.path === "freegames") || false;

        // Filter out items without valid slugs or titles
        if (el.title && slug) {
          parsed.push({
            id: el.id,
            title: el.title,
            description: el.description || "",
            img,
            originalPrice,
            discountPrice,
            discountPriceNumeric,
            discountPct,
            slug,
            isFree
          });
        }
      });

      // Sort: show free games first, then discounted games
      parsed.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return b.discountPct - a.discountPct;
      });

      setGames(parsed);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || "Đã xảy ra lỗi không xác định.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEpicDeals();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchEpicDeals]);

  const handleOpenGame = async (url: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_in_browser", { url });
    } catch (err) {
      console.error("Lỗi mở liên kết:", err);
    }
  };

  const handleCardClick = (game: EpicGame) => {
    handleOpenGame(`com.epicgames.launcher://store/p/${game.slug}`);
  };

  if (isMini) {
    return (
      <div className="w-full relative">
        {error ? (
          <div className="flex flex-col items-center justify-center py-8 bg-[#0c0c12]/40 border border-white/5 backdrop-blur-md rounded-2xl text-center">
            <p className="text-xs text-neutral-400">Không thể kết nối tới Epic Games</p>
          </div>
        ) : loading ? (
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-[#0c0c12]/30 border border-white/5 rounded-2xl p-3 animate-pulse space-y-3 w-[240px] shrink-0">
                <div className="aspect-[16/9] w-full bg-white/5 rounded-xl" />
                <div className="h-4 bg-white/5 rounded-md w-3/4" />
                <div className="flex items-center justify-between pt-2">
                  <div className="h-6 bg-white/5 rounded-md w-1/4" />
                  <div className="h-6 bg-white/5 rounded-md w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-xs text-neutral-400 py-6 text-center">Không có game nào.</div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x scroll-smooth">
            {games.slice(0, 10).map((game) => (
              <div key={game.id} className="w-[240px] shrink-0 snap-start">
                <EpicGameCard
                  game={game}
                  handleCardClick={handleCardClick}
                  handleOpenGame={handleOpenGame}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full h-full animate-fade-in relative">
      
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-br from-[#0c0c12]/70 to-[#050508]/40 border border-white/5 backdrop-blur-xl rounded-3xl p-6 shadow-2xl relative z-30 overflow-visible">
        {/* Constrain glow inside this absolute container */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] right-[-10%] w-[35%] h-[60%] bg-violet-600/10 blur-[70px] rounded-full" />
        </div>
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.15)]">
            <Gift className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <div className="flex items-center">
              <h2 className="text-xl font-black text-white tracking-tight">Epic Games Store Specials</h2>
              <span className="text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-full font-bold ml-2.5">
                Cửa hàng
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">Danh sách game đang phát miễn phí và giảm giá khủng từ Epic Games</p>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex items-center gap-3 relative z-10">
          <CustomSelect
            value="all"
            onChange={() => {}}
            options={[
              { value: "all", label: "Tất cả ưu đãi" }
            ]}
          />

          <button
            onClick={fetchEpicDeals}
            disabled={loading}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-violet-500/10 hover:text-violet-400 border border-white/5 hover:border-violet-500/20 text-neutral-400 cursor-pointer active:scale-95 transition-all duration-300 shadow-sm flex items-center gap-2 text-xs font-semibold"
          >
            <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[#0c0c12]/60 border border-white/5 backdrop-blur-md rounded-3xl p-6 text-center">
          <HelpCircle className="w-12 h-12 text-red-400 mb-3 animate-pulse" />
          <h3 className="text-base font-bold text-white mb-1">Không thể kết nối tới Epic Games</h3>
          <p className="text-xs text-neutral-400 mb-4 max-w-sm">{error}</p>
          <button
            onClick={fetchEpicDeals}
            className="px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-black text-xs font-bold rounded-xl active:scale-95 transition-all shadow-[0_4px_15px_rgba(139,92,246,0.2)] cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      ) : loading ? (
        /* Skeleton Grid Loading state */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="bg-[#0c0c12]/30 border border-white/5 rounded-2xl overflow-hidden p-3 animate-pulse space-y-3">
              <div className="aspect-[16/9] w-full bg-white/5 rounded-xl" />
              <div className="h-4 bg-white/5 rounded-md w-3/4" />
              <div className="flex items-center justify-between pt-2">
                <div className="h-6 bg-white/5 rounded-md w-1/4" />
                <div className="h-6 bg-white/5 rounded-md w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[#0c0c12]/60 border border-white/5 backdrop-blur-md rounded-3xl p-6 text-center">
          <Gift className="w-12 h-12 text-neutral-500 mb-3" />
          <h3 className="text-base font-bold text-white mb-1">Không tìm thấy game nào</h3>
          <p className="text-xs text-neutral-400 max-w-xs">Không có ưu đãi nào được ghi nhận từ Epic Games Store lúc này.</p>
        </div>
      ) : (
        /* Real Game Grid Layout */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 relative z-10">
          {games.map((game) => (
            <EpicGameCard
              key={game.id}
              game={game}
              handleCardClick={handleCardClick}
              handleOpenGame={handleOpenGame}
            />
          ))}
        </div>
      )}

    </div>
  );
}
