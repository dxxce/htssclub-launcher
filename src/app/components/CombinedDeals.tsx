"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Search, RotateCw, ExternalLink, HelpCircle, Gamepad2, Sparkles, Clock, ChevronDown 
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
  isUpcoming?: boolean;
  appId?: string; // steam only
  slug?: string; // epic only
  releaseDate?: string;
  expiryDate?: string;
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
  promotions?: {
    promotionalOffers?: {
      promotionalOffers?: {
        startDate: string;
        endDate: string;
        discountSetting?: {
          discountType: string;
          discountPercentage: number;
        };
      }[];
    }[];
  };
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


function formatExpiryDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `Hạn: ${hours}:${minutes} - ${day}/${month}`;
  } catch {
    return "";
  }
}

function formatStartDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `Mở khóa: ${hours}:${minutes} - ${day}/${month}`;
  } catch {
    return "";
  }
}

function parseSteamHTML(html: string): CombinedDeal[] {
  const list: CombinedDeal[] = [];
  try {
    const data = JSON.parse(html);
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

        const isFree = pctNumeric === 100 || 
                       priceText.toLowerCase().includes("free") || 
                       finalPrice.toLowerCase().includes("free") || 
                       priceText.toLowerCase().includes("miễn phí") ||
                       finalPrice.toLowerCase().includes("miễn phí") ||
                       priceText.includes("0đ") ||
                       finalPrice.includes("0đ") ||
                       (!priceText && !finalPrice);

        list.push({
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
    console.error("Lỗi parse Steam HTML:", e);
  }
  return list;
}

function parseEpicJSON(json: string): CombinedDeal[] {
  const list: CombinedDeal[] = [];
  if (!json || !json.trim().startsWith("{")) return list;
  try {
    const data = JSON.parse(json);
    const elements = (data?.data?.Catalog?.searchStore?.elements || []) as EpicElement[];

    elements.forEach((el) => {
      let img = "";
      if (el.keyImages && el.keyImages.length > 0) {
        const wide = el.keyImages.find((imgObj) => imgObj.type === "OfferImageWide");
        const thumb = el.keyImages.find((imgObj) => imgObj.type === "Thumbnail");
        img = wide?.url || thumb?.url || el.keyImages[0]?.url || "";
      }

      let originalPrice = el.price?.totalPrice?.fmtPrice?.originalPrice || "";
      let discountPrice = el.price?.totalPrice?.fmtPrice?.discountPrice || "";
      const discountPriceNumeric = el.price?.totalPrice?.discountPrice ?? 999999;
      
      const origNumeric = el.price?.totalPrice?.originalPrice || 0;
      const discNumeric = el.price?.totalPrice?.discountPrice || 0;
      let discountPct = 0;
      if (origNumeric > 0) {
        discountPct = Math.round(((origNumeric - discNumeric) / origNumeric) * 100);
      }

      if (!originalPrice && el.price?.totalPrice?.originalPrice !== undefined) {
        const origVal = el.price?.totalPrice?.originalPrice;
        originalPrice = origVal && origVal > 0 ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(origVal) : "0?";
      }
      if (!discountPrice && el.price?.totalPrice?.discountPrice !== undefined) {
        const discVal = el.price?.totalPrice?.discountPrice;
        discountPrice = discVal && discVal > 0 ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(discVal) : "0?";
      }

      const mappingSlug = el.catalogNs?.mappings?.find((m) => m.pageType === "productHome")?.pageSlug || el.catalogNs?.mappings?.[0]?.pageSlug;
      const slug = mappingSlug || el.productSlug || el.urlSlug || "";
      let isFree = discountPriceNumeric === 0;
      let isUpcoming = false;
      let expiryDate: string | undefined = undefined;

      if (el.promotions?.promotionalOffers && el.promotions.promotionalOffers.length > 0) {
        const offers = el.promotions.promotionalOffers[0].promotionalOffers;
        if (offers && offers.length > 0) {
          expiryDate = offers[0].endDate;
          isFree = offers[0].discountSetting?.discountPercentage === 0;
        }
      } else if (el.promotions?.upcomingPromotionalOffers && el.promotions.upcomingPromotionalOffers.length > 0) {
        const offers = el.promotions.upcomingPromotionalOffers[0].promotionalOffers;
        if (offers && offers.length > 0) {
          expiryDate = offers[0].startDate;
          isFree = false;
          isUpcoming = true;
        }
      } else {
        isFree = false;
      }

      if (el.title && slug) {
        list.push({
          id: `epic-${el.id}`,
          platform: "epic",
          title: el.title,
          img,
          href: `https://store.epicgames.com/p/${slug}`,
          originalPrice: (isFree && !isUpcoming) ? "" : originalPrice,
          finalPrice: isUpcoming ? "Sắp ra mắt" : (isFree ? "Free" : discountPrice),
          discountPct: isUpcoming ? "COMING SOON" : (isFree ? "FREE" : `-${discountPct}%`),
          discountPctNumeric: isUpcoming ? 50 : (isFree ? 100 : discountPct),
          isFree: isFree && !isUpcoming,
          isUpcoming,
          slug,
          expiryDate: expiryDate ? (isUpcoming ? formatStartDate(expiryDate) : formatExpiryDate(expiryDate)) : undefined
        });
      }
    });
  } catch (e) {
    console.error("Lỗi parse Epic JSON:", e);
  }
  return list;
}

export default function CombinedDeals() {
  const [steamDeals, setSteamDeals] = useState<CombinedDeal[]>([]);
  const [epicDeals, setEpicDeals] = useState<CombinedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | "steam" | "epic">("steam");
  const [steamDealType, setSteamDealType] = useState<"free" | "discount">("free");

  // Steam Dropdown state
  const [steamDropdownOpen, setSteamDropdownOpen] = useState(false);
  const steamDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (steamDropdownRef.current && !steamDropdownRef.current.contains(event.target as Node)) {
        setSteamDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [steamPage, setSteamPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreSteam, setHasMoreSteam] = useState(true);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
    if (isAtBottom && platformFilter === "steam") {
      fetchNextSteamPage();
    }
  };

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

  const deals = React.useMemo(() => {
    const combined = [...steamDeals, ...epicDeals];
    combined.sort((a, b) => {
      if (a.isFree && !b.isFree) return -1;
      if (!a.isFree && b.isFree) return 1;
      if (a.isUpcoming && !b.isUpcoming) return -1;
      if (!a.isUpcoming && b.isUpcoming) return 1;
      return b.discountPctNumeric - a.discountPctNumeric;
    });
    return combined;
  }, [steamDeals, epicDeals]);

  const fetchSteamExpiryDates = useCallback((steamList: CombinedDeal[]) => {
    import("@tauri-apps/api/core").then(({ invoke }) => {
      steamList.forEach((deal) => {
        if (deal.platform === "steam" && deal.isFree && deal.appId && !deal.expiryDate) {
          invoke<string>("fetch_steam_game_details", { appId: deal.appId, language: "vietnamese" })
            .then((rawJson) => {
              try {
                const parsed = JSON.parse(rawJson);
                const gameData = parsed[deal.appId];
                if (gameData && gameData.success && gameData.data.price_overview) {
                  const discountEndDate = gameData.data.price_overview.discount_end_date;
                  if (discountEndDate) {
                    setSteamDeals((prev) =>
                      prev.map((d) =>
                        d.id === deal.id
                          ? { ...d, expiryDate: discountEndDate }
                          : d
                      )
                    );
                  }
                }
              } catch (e) {
                console.error("Error parsing steam detail JSON:", e);
              }
            })
            .catch((err) => {
              console.error(`Error fetching steam detail for ${deal.appId}:`, err);
            });
        }
      });
    });
  }, []);

  const fetchInitialDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSteamPage(1);
    setHasMoreSteam(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      // Fetch Steam Specials & Epic concurrently
      const [steamRaw, epicRaw] = await Promise.all([
        invoke<string>("fetch_steam_sales", {
          page: 1,
          language: "vietnamese",
          country: "VN",
          specials: 1,
          maxprice: steamDealType === "free" ? "free" : "",
          hidef2p: 1,
          ndl: 1,
        }).catch((err) => {
          console.error("Steam Specials Fetch Error:", err);
          return "";
        }),
        invoke<string>("fetch_epic_games").catch((err) => {
          console.error("Epic Fetch Error:", err);
          return "";
        })
      ]);

      const parsedSteam = parseSteamHTML(steamRaw);
      const parsedEpic = parseEpicJSON(epicRaw);

      setSteamDeals(parsedSteam);
      setEpicDeals(parsedEpic);
      setHasMoreSteam(parsedSteam.length === 25);

      fetchSteamExpiryDates(parsedSteam);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || "Đã xảy ra lỗi khi tải ưu đãi game.");
    } finally {
      setLoading(false);
    }
  }, [steamDealType, fetchSteamExpiryDates]);

  const fetchNextSteamPage = useCallback(async () => {
    if (loading || loadingMore || !hasMoreSteam) return;
    setLoadingMore(true);
    const nextPage = steamPage + 1;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const steamRaw = await invoke<string>("fetch_steam_sales", {
        page: nextPage,
        language: "vietnamese",
        country: "VN",
        specials: 1,
        maxprice: steamDealType === "free" ? "free" : "",
        hidef2p: 1,
        ndl: 1,
      });

      const parsedSteam = parseSteamHTML(steamRaw);
      if (parsedSteam.length > 0) {
        setSteamDeals((prev) => {
          const existingIds = new Set(prev.map(d => d.id));
          const filteredNew = parsedSteam.filter(d => !existingIds.has(d.id));
          return [...prev, ...filteredNew];
        });
        setSteamPage(nextPage);
        setHasMoreSteam(parsedSteam.length === 25);
        fetchSteamExpiryDates(parsedSteam);
      } else {
        setHasMoreSteam(false);
      }
    } catch (err) {
      console.error("Lỗi tải thêm game Steam:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [steamPage, steamDealType, loading, loadingMore, hasMoreSteam, fetchSteamExpiryDates]);

  useEffect(() => {
    fetchInitialDeals();
  }, [fetchInitialDeals]);

  // Client filter
  const filteredDeals = deals.filter((deal) => {
    const matchesSearch = deal.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = platformFilter === "all" ? true : deal.platform === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-5 w-full animate-fade-in relative z-10 text-neutral-200">
      
      {/* Search & Platform Toggles (Styled like DiscordHub) */}
      <div className="flex flex-col gap-3 select-none">
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
            {/* Steam Game Type Selector */}
            {platformFilter === "steam" && (
              <div ref={steamDropdownRef} className="relative select-none z-30">
                {/* Trigger Button */}
                <button
                  onClick={() => setSteamDropdownOpen(!steamDropdownOpen)}
                  className={`bg-[#030305]/40 hover:bg-[#0c0c16]/85 border border-white/5 ${
                    steamDropdownOpen 
                      ? "text-cyan-400 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]" 
                      : "text-neutral-300 hover:border-cyan-500/20"
                  } text-[11px] font-semibold rounded-lg px-2.5 py-1 flex items-center justify-between gap-1.5 cursor-pointer transition-all duration-300 h-7 min-w-[95px] select-none`}
                >
                  <span>{steamDealType === "free" ? "Miễn phí" : "Giảm giá"}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-neutral-500 transition-transform duration-300 ${steamDropdownOpen ? "rotate-180 text-cyan-400" : ""}`} />
                </button>

                {/* Dropdown Menu */}
                {steamDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-[95px] bg-[#0c0c12]/95 border border-white/10 backdrop-blur-xl rounded-lg py-1 shadow-[0_10px_30px_rgba(0,0,0,0.6)] z-50 overflow-hidden animate-fade-in origin-top transition-all duration-200">
                    <div
                      onClick={() => {
                        setSteamDealType("free");
                        setSteamDropdownOpen(false);
                      }}
                      className={`px-3 py-1.5 text-[11px] cursor-pointer transition-all duration-200 flex items-center justify-between ${
                        steamDealType === "free"
                          ? "bg-cyan-500/10 text-cyan-400 font-bold"
                          : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <span>Miễn phí</span>
                    </div>
                    <div
                      onClick={() => {
                        setSteamDealType("discount");
                        setSteamDropdownOpen(false);
                      }}
                      className={`px-3 py-1.5 text-[11px] cursor-pointer transition-all duration-200 flex items-center justify-between ${
                        steamDealType === "discount"
                          ? "bg-cyan-500/10 text-cyan-400 font-bold"
                          : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <span>Giảm giá</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Search Input */}
            <div className="relative w-[130px] sm:w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500" />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#030305]/40 border border-white/5 focus:border-cyan-500/30 focus:shadow-[0_0_15px_rgba(6,182,212,0.15)] rounded-lg pl-8 pr-2 py-1 text-[11px] text-neutral-200 placeholder-neutral-500 focus:outline-none focus:bg-[#030305]/75 transition-all duration-300"
              />
            </div>

            {/* Refresh button */}
            <button
              onClick={fetchInitialDeals}
              disabled={loading}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/10 hover:text-cyan-400 border border-white/5 hover:border-cyan-500/20 text-neutral-400 cursor-pointer active:scale-95 transition-all duration-300"
              title="Làm mới"
            >
              <RotateCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs (Exactly like Discord) */}
        <div className="flex border-b border-white/5 pb-px">
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
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto pr-1 no-scrollbar min-h-0"
      >
        {error ? (
          <div className="flex flex-col items-center justify-center py-10 bg-[#0c0c12]/60 border border-white/5 backdrop-blur-md rounded-2xl text-center p-6">
            <HelpCircle className="w-10 h-10 text-red-400 mb-2 animate-pulse" />
            <h3 className="text-xs font-bold text-white">Không thể kết nối dịch vụ</h3>
            <p className="text-[10px] text-neutral-400 mt-1 mb-3">{error}</p>
            <button
              onClick={fetchInitialDeals}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-black text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-md"
            >
              Thử lại
            </button>
          </div>
        ) : loading ? (
          /* Loading skeleton rows */
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 sm:h-[112px] bg-[#0e0e15]/20 border border-white/5 rounded-2xl animate-pulse flex items-center justify-between px-5">
                <div className="flex items-center gap-4">
                  <div className="w-28 h-16 sm:w-36 sm:h-20 bg-white/5 rounded-lg" />
                  <div className="space-y-2">
                    <div className="h-3.5 bg-white/5 rounded w-48" />
                    <div className="h-2.5 bg-white/5 rounded w-24" />
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
          <div className="space-y-2 pr-1">
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
                      handleOpenGame(deal.href);
                    }
                  }}
                  className={`group border border-white/5 rounded-2xl px-5 py-4 flex items-center justify-between transition-all duration-300 backdrop-blur-xl cursor-pointer ${
                    isSteam 
                      ? "hover:border-cyan-500/35 hover:shadow-[0_0_25px_rgba(6,182,212,0.1)] bg-[#0e0e15]/40 hover:bg-[#12121e]/85" 
                      : "hover:border-violet-500/35 hover:shadow-[0_0_25px_rgba(139,92,246,0.1)] bg-[#0e0e15]/40 hover:bg-[#12121e]/85"
                  }`}
                >
                  {/* Left Section: Image, Info */}
                  <div className="flex items-center gap-4 min-w-0 flex-1 mr-3">
                    {/* Game Thumbnail */}
                    <div className="relative w-28 h-16 sm:w-36 sm:h-20 overflow-hidden rounded-lg bg-neutral-950 border border-white/5 shrink-0 flex items-center justify-center">
                      <DealImage deal={deal} />
                    </div>

                    {/* Title and Badge */}
                    <div className="min-w-0 flex-1">
                      <h4 className={`text-xs sm:text-sm font-bold text-neutral-100 transition-colors truncate ${
                        isSteam ? "group-hover:text-cyan-400" : "group-hover:text-violet-400"
                      }`}>
                        {deal.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className={`inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                          isSteam ? "bg-cyan-500/10 border-cyan-500/25 text-cyan-400" : "bg-violet-500/10 border-violet-500/25 text-violet-400"
                        }`}>
                          {isSteam ? "Steam" : "Epic Games"}
                        </span>
                        
                        {deal.expiryDate ? (
                          <span className="flex items-center gap-1 text-[9px] font-extrabold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded animate-pulse">
                            <Clock className="w-2.5 h-2.5" />
                            {deal.expiryDate}
                          </span>
                        ) : isSteam && deal.releaseDate && deal.releaseDate !== "N/A" ? (
                          <span className="text-[9px] text-neutral-500 font-semibold">
                            Ra mắt: {deal.releaseDate}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Right Section: Discount, Price, Launch */}
                  <div className="flex items-center gap-4 shrink-0">
                    {/* Discount percentage badge */}
                    {deal.discountPct && (
                      <div className={`font-black text-[10px] px-2 py-0.5 rounded shadow select-none ${
                        deal.isFree
                          ? "bg-[#a3f307] text-[#030305] shadow-[0_0_12px_rgba(163,243,7,0.3)]"
                          : isSteam
                            ? "bg-[#a3f307] text-[#030305]"
                            : "bg-violet-600 text-white"
                      }`}>
                        {deal.discountPct}
                      </div>
                    )}

                    {/* Price Block */}
                    <div className="flex flex-col items-end justify-center min-w-[80px]">
                      {deal.originalPrice && deal.originalPrice !== deal.finalPrice && (
                        <span className="text-xs text-neutral-400 line-through font-semibold leading-none mb-1">
                          {deal.originalPrice}
                        </span>
                      )}
                      <span className={`text-sm font-black mt-0.5 leading-none ${
                        deal.isFree ? "text-[#a3f307] drop-shadow-[0_0_8px_rgba(163,243,7,0.3)]" : "text-neutral-200"
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

        {/* Infinite Scroll Sentinel for Steam */}
        {platformFilter === "steam" && (
          <div className="w-full py-4 flex flex-col items-center justify-center gap-2 select-none text-[10px]">
            {loadingMore ? (
              <div className="flex items-center gap-2 text-cyan-400 font-bold animate-pulse">
                <div className="w-3.5 h-3.5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                <span>Đang tải thêm ưu đãi Steam...</span>
              </div>
            ) : !hasMoreSteam ? (
              <span className="text-neutral-500 font-black uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5 shadow-inner">
                🎉 Đã hiển thị toàn bộ ưu đãi Steam
              </span>
            ) : null}
          </div>
        )}
      </div>

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
