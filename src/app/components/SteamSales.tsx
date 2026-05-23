"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  Search, RotateCw, ChevronLeft, ChevronRight, Gamepad2, 
  ExternalLink, Sparkles, HelpCircle, ArrowUpRight,
  ChevronDown, X
} from "lucide-react";

interface SteamGame {
  appId: string;
  href: string;
  title: string;
  img: string;
  defaultImg: string;
  releaseDate: string;
  discountPct: string;
  originalPrice: string;
  finalPrice: string;
  priceText: string;
}

export function SteamIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" className={className}>
      <path d="M.329 10.333A8.01 8.01 0 0 0 7.99 16C12.414 16 16 12.418 16 8s-3.586-8-8.009-8A8.006 8.006 0 0 0 0 7.468l.003.006 4.304 1.769A2.2 2.2 0 0 1 5.62 8.88l1.96-2.844-.001-.04a3.046 3.046 0 0 1 3.042-3.043 3.046 3.046 0 0 1 3.042 3.043 3.047 3.047 0 0 1-3.111 3.044l-2.804 2a2.223 2.223 0 0 1-3.075 2.11 2.22 2.22 0 0 1-1.312-1.568L.33 10.333Z"/>
      <path d="M4.868 12.683a1.715 1.715 0 0 0 1.318-3.165 1.7 1.7 0 0 0-1.263-.02l1.023.424a1.261 1.261 0 1 1-.97 2.33l-.99-.41a1.7 1.7 0 0 0 .882.84Zm3.726-6.687a2.03 2.03 0 0 0 2.027 2.029 2.03 2.03 0 0 0 2.027-2.029 2.03 2.03 0 0 0-2.027-2.027 2.03 2.03 0 0 0-2.027 2.027m2.03-1.527a1.524 1.524 0 1 1-.002 3.048 1.524 1.524 0 0 1 .002-3.048"/>
    </svg>
  );
}

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  isEpic?: boolean;
}

function CustomSelect({ value, onChange, options, className = "", isEpic = false }: CustomSelectProps) {
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
                    ? (isEpic ? "bg-violet-500/10 text-violet-400 font-bold" : "bg-cyan-500/10 text-cyan-400 font-bold")
                    : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className="tracking-wide">{opt.label}</span>
                {isActive && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isEpic ? "bg-violet-400" : "bg-cyan-400"} shadow-md`} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SteamGameCardProps {
  game: SteamGame;
  handleCardClick: (game: SteamGame) => void;
  handleOpenGame: (url: string) => void;
}

function SteamGameCard({ game, handleCardClick, handleOpenGame }: SteamGameCardProps) {
  const [imgSrc, setImgSrc] = useState(game.img);
  const [hasFallback, setHasFallback] = useState(false);
  const [isBroken, setIsBroken] = useState(false);

  const handleError = () => {
    if (!hasFallback && game.defaultImg && game.defaultImg !== game.img) {
      setImgSrc(game.defaultImg);
      setHasFallback(true);
    } else {
      setIsBroken(true);
    }
  };

  const hasDiscount = game.discountPct && game.discountPct !== "";
  const isFree = game.priceText?.toLowerCase().includes("free") || 
                 game.finalPrice?.toLowerCase().includes("free") || 
                 (!game.priceText && !game.finalPrice);

  return (
    <div
      onClick={() => handleCardClick(game)}
      className="group bg-[#0e0e15]/40 hover:bg-[#12121e]/85 border border-white/5 hover:border-cyan-500/40 rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:shadow-[0_12px_32px_rgba(6,182,212,0.15)] hover:-translate-y-1.5 transition-all duration-300 relative flex flex-col justify-between backdrop-blur-md"
    >
      <div>
        {/* Game Image capsule with glowing tag */}
        <div className="relative aspect-[460/215] w-full overflow-hidden bg-neutral-950 flex items-center justify-center border-b border-white/5">
          {isBroken ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-cyan-950/10 text-cyan-500/40">
              <SteamIcon className="w-10 h-10 mb-1.5 animate-pulse" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Steam Game</span>
            </div>
          ) : (
            <img
              src={imgSrc}
              alt=""
              onError={handleError}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-750"
              loading="lazy"
            />
          )}

          {/* Discount Overlay Tag on Card (Steam Style) */}
          {hasDiscount && (
            <div className="absolute top-2.5 left-2.5 bg-[#a3f307] text-[#030305] font-black text-[11px] px-2 py-1 rounded-md shadow-lg select-none z-10 scale-95 group-hover:scale-100 transition-transform duration-300">
              {game.discountPct}
            </div>
          )}

          {/* Quick action overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/10 backdrop-blur-md px-3.5 py-2 rounded-full text-[10px] font-black text-white shadow-lg tracking-wider uppercase">
              <span>Xem chi tiết game</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Text Details */}
        <div className="p-4 pb-0">
          <h3 className="text-xs font-bold text-neutral-100 group-hover:text-cyan-400 transition-colors line-clamp-2 leading-relaxed tracking-wide min-h-[36px]">
            {game.title}
          </h3>
          <p className="text-[10px] text-neutral-500 mt-1.5 flex items-center gap-1">
            <span>Phát hành:</span>
            <span className="text-neutral-400 font-semibold">{game.releaseDate}</span>
          </p>
        </div>
      </div>

      {/* Price block */}
      <div className="p-4 pt-0">
        <div className="h-px bg-white/5 my-3.5" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasDiscount ? (
              <div className="flex flex-col justify-center">
                <span className="text-[9px] text-neutral-500 line-through leading-none">
                  {game.originalPrice}
                </span>
                <span className="text-sm font-black text-[#a3f307] mt-1 leading-none">
                  {game.finalPrice}
                </span>
              </div>
            ) : (
              <span className={`text-xs font-black leading-none ${isFree ? "text-[#a3f307]" : "text-neutral-200"}`}>
                {game.priceText || game.finalPrice || "Free To Play"}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {game.appId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenGame(`steam://store/${game.appId}`);
                }}
                className="w-7 h-7 rounded-lg bg-[#1b2838]/60 hover:bg-[#2a475e] border border-blue-400/10 hover:border-blue-400/30 flex items-center justify-center text-blue-400 transition-colors cursor-pointer"
                title="Khởi chạy trực tiếp Steam Client"
              >
                <SteamIcon className="w-3.5 h-3.5" />
              </button>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenGame(game.href);
              }}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-500 hover:text-white transition-colors cursor-pointer"
              title="Mở trong trình duyệt"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SteamScreenshot {
  id: number;
  path_thumbnail: string;
  path_full: string;
}

interface SteamGenre {
  id: string;
  description: string;
}

interface SteamPriceOverview {
  discount_percent: number;
  initial_formatted: string;
  final_formatted: string;
}

interface SteamGameDetails {
  name: string;
  short_description: string;
  header_image?: string;
  developers?: string[];
  publishers?: string[];
  genres?: SteamGenre[];
  screenshots?: SteamScreenshot[];
  price_overview?: SteamPriceOverview;
  is_free?: boolean;
  release_date?: {
    date: string;
  };
  platforms?: {
    windows: boolean;
    mac: boolean;
    linux: boolean;
  };
}

interface SteamGameDetailModalProps {
  appId: string;
  gameTitle: string;
  fallbackImage: string;
  onClose: () => void;
  handleOpenGame: (url: string) => void;
}

export function SteamGameDetailModal({ appId, gameTitle, fallbackImage, onClose, handleOpenGame }: SteamGameDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<SteamGameDetails | null>(null);
  const [activeImage, setActiveImage] = useState<string>(fallbackImage);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const rawJson = await invoke<string>("fetch_steam_game_details", { appId });
        const parsed = JSON.parse(rawJson);
        const gameData = parsed[appId];
        if (gameData && gameData.success) {
          if (active) {
            setDetails(gameData.data);
            if (gameData.data.header_image) {
              setActiveImage(gameData.data.header_image);
            }
          }
        } else {
          throw new Error("Steam không trả về dữ liệu chi tiết cho game này.");
        }
      } catch (err) {
        console.error("Lỗi lấy chi tiết game:", err);
        if (active) {
          setError("Không thể tải chi tiết game từ Steam.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchDetails();
    return () => {
      active = false;
    };
  }, [appId]);

  // Click outside to close helper
  const modalRef = useRef<HTMLDivElement>(null);
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div 
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in"
    >
      <div 
        ref={modalRef}
        className="relative w-full max-w-4xl bg-[#09090f] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] md:max-h-[85vh]"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 w-9 h-9 rounded-full bg-black/60 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-lg"
        >
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          /* Premium Modal Skeleton Loading */
          <div className="flex flex-col flex-1 p-6 space-y-6">
            <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
            <div className="space-y-4">
              <div className="h-6 bg-white/5 rounded-md w-1/3 animate-pulse" />
              <div className="h-4 bg-white/5 rounded-md w-full animate-pulse" />
              <div className="h-4 bg-white/5 rounded-md w-5/6 animate-pulse" />
            </div>
          </div>
        ) : error || !details ? (
          /* Error Fallback with options */
          <div className="flex flex-col items-center justify-center p-12 text-center flex-1">
            <HelpCircle className="w-16 h-16 text-red-500/60 mb-4 animate-pulse" />
            <h3 className="text-lg font-bold text-white mb-2">{gameTitle}</h3>
            <p className="text-xs text-neutral-400 max-w-sm mb-6">
              Không thể tải trực tiếp thông tin từ Steam Store. Bạn vẫn có thể mở game bằng Steam Client hoặc Trình duyệt Web.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleOpenGame(`steam://store/${appId}`)}
                className="px-6 py-3 bg-cyan-500 text-black font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
              >
                Mở Steam Client
              </button>
              <button
                onClick={() => handleOpenGame(`https://store.steampowered.com/app/${appId}`)}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors"
              >
                Mở Trình duyệt Web
              </button>
            </div>
          </div>
        ) : (
          /* Real Details Content */
          <div className="overflow-y-auto overflow-x-hidden flex-1 no-scrollbar">
            
            {/* Top Large Artwork Banner */}
            <div className="relative h-72 md:h-[420px] w-full overflow-hidden bg-neutral-950 border-b border-white/5">
              <img 
                src={activeImage} 
                alt="" 
                className="w-full h-full object-cover animate-fade-in"
              />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#09090f] to-transparent" />
            </div>

            {/* Content Area */}
            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Left Column */}
              <div className="md:col-span-2 space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
                    {details.name}
                  </h2>
                  
                  {/* Developers / Publishers */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs text-neutral-400">
                    {details.developers && details.developers.length > 0 && (
                      <div>
                        Nhà phát triển: <span className="text-cyan-400 font-semibold">{details.developers.join(", ")}</span>
                      </div>
                    )}
                    {details.publishers && details.publishers.length > 0 && (
                      <div>
                        Nhà phát hành: <span className="text-neutral-300 font-semibold">{details.publishers.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Short Description */}
                <div>
                  <h4 className="text-xs uppercase font-bold tracking-widest text-neutral-400 mb-2">Giới thiệu game</h4>
                  <p className="text-sm text-neutral-300 leading-relaxed font-medium">
                    {details.short_description ? details.short_description.replace(/&quot;/g, '"') : "Không có mô tả chi tiết."}
                  </p>
                </div>

                {/* Genres */}
                {details.genres && details.genres.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase font-bold tracking-widest text-neutral-400 mb-2.5">Thể loại</h4>
                    <div className="flex flex-wrap gap-2">
                      {details.genres.map((genre) => (
                        <span 
                          key={genre.id} 
                          className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs text-neutral-300 font-medium"
                        >
                          {genre.description}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Screenshots Gallery */}
                {details.screenshots && details.screenshots.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase font-bold tracking-widest text-neutral-400 mb-2.5">Hình ảnh chi tiết (Click để xem)</h4>
                    <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar">
                      {details.screenshots.map((shot) => (
                        <div 
                          key={shot.id}
                          onClick={() => setActiveImage(shot.path_full)}
                          className={`flex-shrink-0 w-32 aspect-[16/9] rounded-lg overflow-hidden border cursor-pointer hover:scale-95 transition-all duration-300 ${
                            activeImage === shot.path_full ? "border-cyan-500 scale-95 shadow-[0_0_10px_rgba(6,182,212,0.3)]" : "border-white/5 hover:border-white/20"
                          }`}
                        >
                          <img 
                            src={shot.path_thumbnail} 
                            alt="" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Sidebar Action block */}
              <div className="bg-[#0e0e16]/60 border border-white/5 rounded-xl p-5 flex flex-col justify-between space-y-6 h-fit backdrop-blur-md">
                
                {/* Price Display */}
                <div>
                  <h4 className="text-[10px] uppercase font-bold tracking-widest text-neutral-400 mb-2">Giá ưu đãi từ Steam</h4>
                  <div className="flex items-center gap-3">
                    {details.price_overview ? (
                      <>
                        {details.price_overview.discount_percent > 0 && (
                          <span className="bg-[#a3f307] text-[#030305] font-black text-sm px-2 py-1.5 rounded-lg leading-none select-none">
                            -{details.price_overview.discount_percent}%
                          </span>
                        )}
                        <div className="flex flex-col justify-center">
                          {details.price_overview.discount_percent > 0 && (
                            <span className="text-[10px] text-neutral-500 line-through leading-none mb-1">
                              {details.price_overview.initial_formatted}
                            </span>
                          )}
                          <span className="text-xl font-black text-[#a3f307] leading-none">
                            {details.price_overview.final_formatted}
                          </span>
                        </div>
                      </>
                    ) : (
                      <span className="text-xl font-black text-[#a3f307]">
                        {details.is_free ? "MIỄN PHÍ (Free To Play)" : "Liên kết Steam"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Info List */}
                <div className="text-xs border-t border-white/5 pt-4 space-y-2">
                  <div className="flex justify-between text-neutral-400">
                    <span>Ngày phát hành:</span>
                    <span className="text-white font-semibold">{details.release_date?.date || "N/A"}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Nền tảng hỗ trợ:</span>
                    <span className="text-white font-semibold flex items-center gap-1.5">
                      {details.platforms?.windows && <span title="Windows">Windows</span>}
                      {details.platforms?.mac && <span title="macOS">macOS</span>}
                      {details.platforms?.linux && <span title="Linux">Linux</span>}
                    </span>
                  </div>
                </div>

                {/* Major Actions */}
                <div className="space-y-3.5 pt-4 border-t border-white/5">
                  <button
                    onClick={() => handleOpenGame(`steam://store/${appId}`)}
                    className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black uppercase text-xs tracking-wider py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] cursor-pointer active:scale-95"
                  >
                    <SteamIcon className="w-4 h-4" />
                    Khởi chạy Steam Client
                  </button>

                  <button
                    onClick={() => handleOpenGame(`https://store.steampowered.com/app/${appId}`)}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4 text-neutral-400" />
                    Xem trang Web Steam
                  </button>
                </div>

              </div>

            </div>

          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function SteamSales({ isMini = false }: { isMini?: boolean }) {
  const [games, setGames] = useState<SteamGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Detail Modal State
  const [selectedGameForModal, setSelectedGameForModal] = useState<SteamGame | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [gameType, setGameType] = useState<"specials" | "free" | "both">("specials");
  const [country, setCountry] = useState("VN");
  const language = "vietnamese";

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      const specialsParam = gameType === "specials" || gameType === "both" ? 1 : 0;
      const maxpriceParam = gameType === "free" || gameType === "both" ? "free" : "";

      const rawHtmlResponse = await invoke<string>("fetch_steam_sales", {
        page,
        language,
        country,
        specials: specialsParam,
        maxprice: maxpriceParam,
      });

      // Parse JSON from Steam search (it wraps { success, results_html, total_count })
      let data;
      try {
        data = JSON.parse(rawHtmlResponse);
      } catch {
        throw new Error("Không thể phân tích phản hồi từ Steam.");
      }

      if (!data || !data.results_html) {
        setGames([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      setTotalCount(data.total_count || 0);

      // Parse the HTML string using the browser's DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.results_html, "text/html");
      const rows = doc.querySelectorAll("a.search_result_row");
      
      const parsedGames: SteamGame[] = [];
      rows.forEach((row) => {
        const appId = row.getAttribute("data-ds-appid") || "";
        const href = row.getAttribute("href") || "";
        const title = row.querySelector(".title")?.textContent?.trim() || "Chưa có tên";
        
        // Use high-resolution header capsule image instead of tiny search capsule
        const img = appId 
          ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
          : row.querySelector(".search_capsule img")?.getAttribute("src") || "";

        const defaultImg = row.querySelector(".search_capsule img")?.getAttribute("src") || "";

        const releaseDate = row.querySelector(".search_released")?.textContent?.trim() || "N/A";
        const discountPct = row.querySelector(".discount_pct")?.textContent?.trim() || "";
        const originalPrice = row.querySelector(".discount_original_price")?.textContent?.trim() || "";
        const finalPrice = row.querySelector(".discount_final_price")?.textContent?.trim() || "";
        const priceText = row.querySelector(".search_price")?.textContent?.trim() || "";

        parsedGames.push({
          appId,
          href,
          title,
          img,
          defaultImg,
          releaseDate,
          discountPct,
          originalPrice,
          finalPrice,
          priceText
        });
      });

      // Apply client-side search query filter if search query is provided
      let filtered = parsedGames;
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        filtered = parsedGames.filter(g => g.title.toLowerCase().includes(queryLower));
      }

      setGames(filtered);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || "Đã xảy ra lỗi không xác định.");
    } finally {
      setLoading(false);
    }
  }, [page, gameType, country, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSales();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchSales]);

  const handleOpenGame = async (url: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_in_browser", { url });
    } catch (err) {
      console.error("Lỗi mở liên kết:", err);
    }
  };

  const handleCardClick = (game: SteamGame) => {
    if (game.appId) {
      setSelectedGameForModal(game);
    } else {
      handleOpenGame(game.href);
    }
  };

  const totalPages = Math.ceil(totalCount / 25) || 1;

  if (isMini) {
    return (
      <div className="w-full relative">
        {error ? (
          <div className="flex flex-col items-center justify-center py-8 bg-[#0c0c12]/40 border border-white/5 backdrop-blur-md rounded-2xl text-center">
            <p className="text-xs text-neutral-400">Không thể kết nối tới Steam</p>
          </div>
        ) : loading ? (
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-[#0c0c12]/30 border border-white/5 rounded-2xl p-3 animate-pulse space-y-3 w-[240px] shrink-0">
                <div className="aspect-[460/215] w-full bg-white/5 rounded-xl" />
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
              <div key={game.appId} className="w-[240px] shrink-0 snap-start">
                <SteamGameCard
                  game={game}
                  handleCardClick={handleCardClick}
                  handleOpenGame={handleOpenGame}
                />
              </div>
            ))}
          </div>
        )}

        {selectedGameForModal && (
          <SteamGameDetailModal
            appId={selectedGameForModal.appId}
            gameTitle={selectedGameForModal.title}
            fallbackImage={selectedGameForModal.img}
            onClose={() => setSelectedGameForModal(null)}
            handleOpenGame={handleOpenGame}
          />
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
          <div className="absolute top-[-10%] right-[-10%] w-[35%] h-[60%] bg-cyan-600/10 blur-[70px] rounded-full" />
        </div>
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.15)]">
            <Sparkles className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center">
              <h2 className="text-xl font-black text-white tracking-tight">Steam Deals & Sales</h2>
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-bold ml-2.5">
                Cửa hàng
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">Danh sách game giảm giá và miễn phí trực tiếp từ Steam Store</p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          
          {/* Search bar inside the catalog */}
          <div className="relative w-full sm:w-[220px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Tìm kiếm game..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#030305]/40 border border-white/5 focus:border-cyan-500/30 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)] rounded-xl pl-10 pr-4 py-2.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:bg-[#030305]/75 transition-all duration-300"
            />
          </div>

          {/* Game Type Filter Selector */}
          <CustomSelect
            value={gameType}
            onChange={(val) => {
              setGameType(val as "specials" | "free" | "both");
              setPage(1);
            }}
            options={[
              { value: "specials", label: "Đang giảm giá" },
              { value: "free", label: "Miễn phí (Free)" },
              { value: "both", label: "Giảm giá & Miễn phí" }
            ]}
          />

          {/* Region / Currency Filter Selector */}
          <CustomSelect
            value={country}
            onChange={(val) => {
              setCountry(val);
              setPage(1);
            }}
            options={[
              { value: "VN", label: "Việt Nam (VND)" },
              { value: "US", label: "Mỹ (USD)" }
            ]}
          />

          {/* Reload button */}
          <button
            onClick={fetchSales}
            disabled={loading}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-cyan-500/10 hover:text-cyan-400 border border-white/5 hover:border-cyan-500/20 text-neutral-400 cursor-pointer active:scale-95 transition-all duration-300 shadow-sm"
            title="Tải lại"
          >
            <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

        </div>
      </div>

      {/* Main Grid View */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[#0c0c12]/60 border border-white/5 backdrop-blur-md rounded-3xl p-6 text-center">
          <HelpCircle className="w-12 h-12 text-red-400 mb-3 animate-pulse" />
          <h3 className="text-base font-bold text-white mb-1">Không thể kết nối tới Steam</h3>
          <p className="text-xs text-neutral-400 mb-4 max-w-sm">{error}</p>
          <button
            onClick={fetchSales}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black text-xs font-bold rounded-xl active:scale-95 transition-all shadow-[0_4px_15px_rgba(6,182,212,0.2)] cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      ) : loading ? (
        /* Skeleton Grid Loading state */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="bg-[#0c0c12]/30 border border-white/5 rounded-2xl overflow-hidden p-3 animate-pulse space-y-3">
              <div className="aspect-[460/215] w-full bg-white/5 rounded-xl" />
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
          <Gamepad2 className="w-12 h-12 text-neutral-500 mb-3" />
          <h3 className="text-base font-bold text-white mb-1">Không tìm thấy game nào</h3>
          <p className="text-xs text-neutral-400 max-w-xs">Không có kết quả nào phù hợp với bộ lọc hiện tại của bạn.</p>
        </div>
      ) : (
        /* Real Game Grid Layout */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 relative z-10">
          {games.map((game) => (
            <SteamGameCard
              key={game.appId}
              game={game}
              handleCardClick={handleCardClick}
              handleOpenGame={handleOpenGame}
            />
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {!loading && !error && games.length > 0 && (
        <div className="flex items-center justify-between bg-[#0c0c12]/40 border border-white/5 rounded-2xl p-4 mt-2">
          <div className="text-xs text-neutral-400">
            Hiển thị <span className="font-bold text-neutral-200">{games.length}</span> / <span className="font-bold text-neutral-200">{totalCount}</span> game đang sale
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`p-2 rounded-xl bg-white/5 border border-white/5 text-neutral-400 hover:text-white cursor-pointer active:scale-95 transition-all flex items-center justify-center ${page === 1 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="text-xs font-bold text-neutral-200">
              Trang {page} / {totalPages}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={`p-2 rounded-xl bg-white/5 border border-white/5 text-neutral-400 hover:text-white cursor-pointer active:scale-95 transition-all flex items-center justify-center ${page === totalPages ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Steam Game Details Modal */}
      {selectedGameForModal && (
        <SteamGameDetailModal
          appId={selectedGameForModal.appId}
          gameTitle={selectedGameForModal.title}
          fallbackImage={selectedGameForModal.img}
          onClose={() => setSelectedGameForModal(null)}
          handleOpenGame={handleOpenGame}
        />
      )}

    </div>
  );
}
