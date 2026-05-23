"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Search, RotateCw, ExternalLink, HelpCircle, Gamepad2, Sparkles 
} from "lucide-react";
import { SteamIcon, SteamGameDetailModal } from "./SteamSales";

export function EpicIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className}>
      <path d="M10.978 0v6.026H4.022L0 10.048v3.904l4.022 4.022h6.956v6.026h9.004L24 17.974V6.026L19.982 0z"/>
    </svg>
  );
}

export interface CombinedDeal {
  id: string;
  platform: "steam" | "epic";
  title: string;
  img: string;
  defaultImg?: string;
  href: string;
  originalPrice: string;
  finalPrice: string;
  discountPct: string | number; // e.g. "-75%" or 75
  discountPctNumeric: number;
  isFree: boolean;
  appId?: string; // steam only
  slug?: string; // epic only
  releaseDate?: string;
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

function DealImage({ deal }: { deal: CombinedDeal }) {
  const [imgSrc, setImgSrc] = React.useState(deal.img);
  const [isBroken, setIsBroken] = React.useState(false);

  const handleError = () => {
    if (deal.defaultImg && imgSrc !== deal.defaultImg) {
      setImgSrc(deal.defaultImg);
    } else {
      setIsBroken(true);
    }
  };

  if (isBroken) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-cyan-950/10 text-cyan-500/40 text-[9px] font-bold p-1">
        {deal.platform === "steam" ? (
          <SteamIcon className="w-4 h-4 mb-0.5" />
        ) : (
          <EpicIcon className="w-4 h-4 mb-0.5" />
        )}
        <span>Game</span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt=""
      onError={handleError}
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      loading="lazy"
    />
  );
}

export default function CombinedDeals() {
  const [deals, setDeals] = useState<CombinedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | "steam" | "epic">("steam");

  // Steam Detail Modal State
  const [selectedSteamAppId, setSelectedSteamAppId] = useState<string | null>(null);
  const [selectedSteamTitle, setSelectedSteamTitle] = useState("");
  const [selectedSteamImg, setSelectedSteamImg] = useState("");

  const handleOpenGame = async (url: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_in_browser", { url });
    } catch (err) {
      console.error("Lỗi mở liên kết:", err);
    }
  };

  const fetchAllDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      // Fetch Steam Specials & Epic concurrently
      const [steamRaw, epicRaw] = await Promise.all([
        invoke<string>("fetch_steam_sales", {
          page: 1,
          language: "vietnamese",
          country: "VN",
          specials: 1,
          maxprice: "",
        }).catch((err) => {
          console.error("Steam Specials Fetch Error:", err);
          return "";
        }),
        invoke<string>("fetch_epic_games").catch((err) => {
          console.error("Epic Fetch Error:", err);
          return "";
        })
      ]);

      const combined: CombinedDeal[] = [];

      // 1. Parse Steam Specials
      if (steamRaw) {
        try {
          const data = JSON.parse(steamRaw);
          if (data && data.results_html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(data.results_html, "text/html");
            const rows = doc.querySelectorAll("a.search_result_row");

            rows.forEach((row) => {
              const appId = row.getAttribute("data-ds-appid") || "";
              const href = row.getAttribute("href") || "";
              const title = row.querySelector(".title")?.textContent?.trim() || "Chưa có tên";
              const img = appId 
                ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
                : row.querySelector(".search_capsule img")?.getAttribute("src") || "";

              const defaultImg = row.querySelector(".search_capsule img")?.getAttribute("src") || "";
              const releaseDate = row.querySelector(".search_released")?.textContent?.trim() || "N/A";
              const discountPctStr = row.querySelector(".discount_pct")?.textContent?.trim() || "";
              const originalPrice = row.querySelector(".discount_original_price")?.textContent?.trim() || "";
              const finalPrice = row.querySelector(".discount_final_price")?.textContent?.trim() || "";
              const priceText = row.querySelector(".search_price")?.textContent?.trim() || "";

              let pctNumeric = 0;
              if (discountPctStr) {
                pctNumeric = Math.abs(parseInt(discountPctStr.replace(/[^0-9-]/g, ""), 10)) || 0;
              }

              // A game is free if it's 100% off or the price text implies it
              const isFree = pctNumeric === 100 || 
                             priceText.toLowerCase().includes("free") || 
                             finalPrice.toLowerCase().includes("free") || 
                             priceText.toLowerCase().includes("miễn phí") ||
                             finalPrice.toLowerCase().includes("miễn phí") ||
                             priceText.includes("0đ") ||
                             finalPrice.includes("0đ") ||
                             (!priceText && !finalPrice);

              combined.push({
                id: `steam-${appId || Math.random().toString()}`,
                platform: "steam",
                title,
                img,
                defaultImg,
                href,
                originalPrice: originalPrice || (isFree ? "" : priceText),
                finalPrice: isFree ? "0đ" : (finalPrice || priceText),
                discountPct: discountPctStr || (isFree ? "FREE" : ""),
                discountPctNumeric: isFree ? 100 : pctNumeric,
                isFree,
                appId,
                releaseDate
              });
            });
          }
        } catch (e) {
          console.error("Lỗi parse Steam:", e);
        }
      }

      // 2. Parse Epic deals
      if (epicRaw && epicRaw.trim().startsWith("{")) {
        try {
          const data = JSON.parse(epicRaw);
          const elements = (data?.data?.Catalog?.searchStore?.elements || []) as EpicElement[];

          elements.forEach((el) => {
            let img = "";
            if (el.keyImages && el.keyImages.length > 0) {
              const wide = el.keyImages.find((imgObj) => imgObj.type === "OfferImageWide");
              const thumb = el.keyImages.find((imgObj) => imgObj.type === "Thumbnail");
              img = wide?.url || thumb?.url || el.keyImages[0]?.url || "";
            }

            const originalPrice = el.price?.totalPrice?.fmtPrice?.originalPrice || "";
            const discountPrice = el.price?.totalPrice?.fmtPrice?.discountPrice || "";
            const discountPriceNumeric = el.price?.totalPrice?.discountPrice ?? 999999;
            
            const origNumeric = el.price?.totalPrice?.originalPrice || 0;
            const discNumeric = el.price?.totalPrice?.discountPrice || 0;
            let discountPct = 0;
            if (origNumeric > 0) {
              discountPct = Math.round(((origNumeric - discNumeric) / origNumeric) * 100);
            }

            const slug = el.productSlug || el.urlSlug || el.catalogNs?.mappings?.[0]?.pageSlug || "";
            const isFree = discountPriceNumeric === 0 || el.categories?.some((cat) => cat.path === "freegames") || false;

            if (el.title && slug) {
              combined.push({
                id: `epic-${el.id}`,
                platform: "epic",
                title: el.title,
                img,
                href: `https://store.epicgames.com/p/${slug}`,
                originalPrice: isFree ? "" : originalPrice,
                finalPrice: isFree ? "Free" : discountPrice,
                discountPct: isFree ? "FREE" : `-${discountPct}%`,
                discountPctNumeric: isFree ? 100 : discountPct,
                isFree,
                slug
              });
            }
          });
        } catch (e) {
          console.error("Lỗi parse Epic:", e);
        }
      }

      // Sort: Free games first, then by discount percentage descending
      combined.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return b.discountPctNumeric - a.discountPctNumeric;
      });

      setDeals(combined);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || "Đã xảy ra lỗi khi tải ưu đãi game.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllDeals();
  }, [fetchAllDeals]);

  // Client filter
  const filteredDeals = deals.filter((deal) => {
    const matchesSearch = deal.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = platformFilter === "all" ? true : deal.platform === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  return (
    <div className="flex flex-col gap-5 w-full h-full animate-fade-in relative z-10 text-neutral-200">
      
      {/* Search & Platform Toggles (Styled like DiscordHub) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xs font-black text-white uppercase tracking-wider">Ưu Đãi Game Bản Quyền</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative w-[130px] sm:w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500" />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#030305]/40 border border-white/5 focus:border-cyan-500/30 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)] rounded-lg pl-8 pr-2 py-1 text-[11px] text-neutral-200 placeholder-neutral-500 focus:outline-none focus:bg-[#030305]/75 transition-all duration-300"
              />
            </div>

            {/* Refresh button */}
            <button
              onClick={fetchAllDeals}
              disabled={loading}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/10 hover:text-cyan-400 border border-white/5 hover:border-cyan-500/20 text-neutral-400 cursor-pointer active:scale-95 transition-all duration-300"
              title="Làm mới"
            >
              <RotateCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs (Exactly like Discord) */}
        <div className="flex border-b border-white/5 pb-px select-none">
          <button
            onClick={() => setPlatformFilter("steam")}
            className={`flex items-center gap-1.5 px-4 py-2 border-b-2 font-bold text-[10px] tracking-wider uppercase transition-all duration-200 cursor-pointer ${
              platformFilter === "steam"
                ? "border-cyan-500 text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <SteamIcon className="w-3 h-3" />
            Steam
          </button>
          <button
            onClick={() => setPlatformFilter("epic")}
            className={`flex items-center gap-1.5 px-4 py-2 border-b-2 font-bold text-[10px] tracking-wider uppercase transition-all duration-200 cursor-pointer ${
              platformFilter === "epic"
                ? "border-cyan-500 text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <EpicIcon className="w-3 h-3" />
            Epic Games
          </button>
        </div>
      </div>

      {/* Main List Container */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-10 bg-[#0c0c12]/60 border border-white/5 backdrop-blur-md rounded-2xl text-center p-6">
          <HelpCircle className="w-10 h-10 text-red-400 mb-2 animate-pulse" />
          <h3 className="text-xs font-bold text-white">Không thể kết nối dịch vụ</h3>
          <p className="text-[10px] text-neutral-400 mt-1 mb-3">{error}</p>
          <button
            onClick={fetchAllDeals}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-black text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-md"
          >
            Thử lại
          </button>
        </div>
      ) : loading ? (
        /* Loading skeleton rows */
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-[#0e0e15]/20 border border-white/5 rounded-xl animate-pulse flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <div className="w-20 h-11 bg-white/5 rounded-lg" />
                <div className="space-y-1.5">
                  <div className="h-3 bg-white/5 rounded w-36" />
                  <div className="h-2 bg-white/5 rounded w-16" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-6 bg-white/5 rounded" />
                <div className="w-16 h-4 bg-white/5 rounded" />
                <div className="w-14 h-8 bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredDeals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-[#0c0c12]/60 border border-white/5 backdrop-blur-md rounded-2xl text-center">
          <Gamepad2 className="w-10 h-10 text-neutral-500 mb-2" />
          <p className="text-xs text-neutral-400">Không tìm thấy ưu đãi game nào.</p>
        </div>
      ) : (
        /* Rendered Rows List */
        <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1 no-scrollbar">
          {filteredDeals.map((deal) => {
            const isSteam = deal.platform.startsWith("steam");
            return (
              <div
                key={deal.id}
                onClick={() => {
                  if (isSteam && deal.appId) {
                    setSelectedSteamAppId(deal.appId);
                    setSelectedSteamTitle(deal.title);
                    setSelectedSteamImg(deal.img);
                  } else if (deal.slug) {
                    handleOpenGame(`com.epicgames.launcher://store/p/${deal.slug}`);
                  }
                }}
                className="group bg-[#0e0e15]/40 hover:bg-[#12121e]/85 border border-white/5 hover:border-cyan-500/30 rounded-xl px-4 py-3 flex items-center justify-between transition-all duration-300 backdrop-blur-md cursor-pointer hover:shadow-lg"
              >
                {/* Left Section: Image, Info */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
                  {/* Game Thumbnail */}
                  <div className="relative w-16 h-9 sm:w-20 sm:h-11 overflow-hidden rounded-lg bg-neutral-950 border border-white/5 shrink-0 flex items-center justify-center">
                    <DealImage deal={deal} />
                  </div>

                  {/* Title and Badge */}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-neutral-100 group-hover:text-cyan-400 transition-colors truncate">
                      {deal.title}
                    </h4>
                    <span className={`inline-block text-[9px] font-semibold mt-1 px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      isSteam ? "bg-cyan-500/10 text-cyan-400" : "bg-violet-500/10 text-violet-400"
                    }`}>
                      {isSteam ? "Steam" : "Epic Games"}
                    </span>
                  </div>
                </div>

                {/* Right Section: Discount, Price, Launch */}
                <div className="flex items-center gap-4 shrink-0">
                  {/* Discount percentage badge */}
                  {deal.discountPct && (
                    <div className={`font-black text-[10px] px-2 py-0.5 rounded shadow select-none ${
                      deal.isFree
                        ? "bg-[#a3f307] text-[#030305]"
                        : isSteam
                          ? "bg-[#a3f307] text-[#030305]"
                          : "bg-violet-600 text-white"
                    }`}>
                      {deal.discountPct}
                    </div>
                  )}

                  {/* Price Block */}
                  <div className="flex flex-col items-end justify-center min-w-[70px]">
                    {!deal.isFree && deal.originalPrice && (
                      <span className="text-[9px] text-neutral-500 line-through leading-none">
                        {deal.originalPrice}
                      </span>
                    )}
                    <span className={`text-xs font-black mt-0.5 leading-none ${
                      deal.isFree ? "text-[#a3f307]" : "text-neutral-200"
                    }`}>
                      {deal.finalPrice}
                    </span>
                  </div>

                  {/* Launch button */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSteam && deal.appId) {
                          handleOpenGame(`steam://store/${deal.appId}`);
                        } else if (deal.slug) {
                          handleOpenGame(`com.epicgames.launcher://store/p/${deal.slug}`);
                        }
                      }}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
                        isSteam
                          ? "bg-[#1b2838]/60 hover:bg-[#2a475e] border-blue-400/10 hover:border-blue-400/30 text-blue-400"
                          : "bg-violet-600/10 hover:bg-violet-600/30 border-violet-500/10 hover:border-violet-500/30 text-violet-400"
                      }`}
                      title={isSteam ? "Mở trong Steam Client" : "Mở trong Epic Launcher"}
                    >
                      <Gamepad2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenGame(deal.href);
                      }}
                      className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-500 hover:text-white border border-white/5 transition-colors cursor-pointer"
                      title="Mở trong trình duyệt web"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Steam Details Modal */}
      {selectedSteamAppId && (
        <SteamGameDetailModal
          appId={selectedSteamAppId}
          gameTitle={selectedSteamTitle}
          fallbackImage={selectedSteamImg}
          onClose={() => setSelectedSteamAppId(null)}
          handleOpenGame={handleOpenGame}
        />
      )}
    </div>
  );
}
