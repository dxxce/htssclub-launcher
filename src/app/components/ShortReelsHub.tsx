"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Play, Sparkles, Clock, Star, Search, Tv, RefreshCw, Eye } from "lucide-react";
import AnimePlayer from "./AnimePlayer";

interface ReelItem {
  key: string;
  cover: string;
  title: string;
  desc: string;
  episode_count: number;
  follow_count: number;
  series_tag?: string[];
  tag?: string[];
  content_tags?: string[];
  hot_score?: string;
}

interface ShortReelSubtitle {
  file: string;
  label: string;
  default?: boolean;
}

interface Episode {
  id: string;
  name: string;
  cover: string;
  external_audio_h264_m3u8: string;
  external_audio_h265_m3u8: string;
  subtitle_list?: ShortReelSubtitle[];
}

interface SeriesDetail {
  id: string;
  name: string;
  desc: string;
  cover: string;
  episode_count: number;
  follow_count: number;
  tag?: string[];
  content_tags?: string[];
  episode_list: Episode[];
}

interface ReelModule {
  type: string;
  module_name: string;
  module_key: string;
  items: ReelItem[];
}

interface ShortReelsHubProps {
  onRegisterBack?: (cb: (() => void) | null) => void;
}

export default function ShortReelsHub({ onRegisterBack }: ShortReelsHubProps) {
  const [activeTab, setActiveTab] = useState<"503" | "547">("503");
  const [modules, setModules] = useState<ReelModule[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected series for detail view
  const [selectedSeries, setSelectedSeries] = useState<ReelItem | null>(null);
  const [seriesDetail, setSeriesDetail] = useState<SeriesDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Current playing episode
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);

  // Pagination states
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedModuleKey, setFeedModuleKey] = useState("1036");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Dynamic search API state variables
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ReelItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchNextCursor, setSearchNextCursor] = useState("");
  const [searchHasMore, setSearchHasMore] = useState(false);

  // Hot recommendations and modal state variables
  const [isSearchPopupOpen, setIsSearchPopupOpen] = useState(false);
  const [hotList, setHotList] = useState<ReelItem[]>([]);
  const [hotListLoading, setHotListLoading] = useState(false);
  const popupInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch initial feed items using tab index API
  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<any>("fetch_short_reels_index", {
        tabKey: activeTab
      });

      if (res && res.success && res.data && res.data.data && res.data.data.items) {
        const rawModules = res.data.data.items;
        const parsedModules: ReelModule[] = [];

        rawModules.forEach((mod: any) => {
          const modItems: ReelItem[] = [];
          if (mod.items && Array.isArray(mod.items)) {
            mod.items.forEach((item: any) => {
              if (item.key && item.title) {
                modItems.push({
                  key: item.key,
                  cover: item.cover,
                  title: item.title,
                  desc: item.desc || "",
                  episode_count: item.episode_count || 0,
                  follow_count: item.follow_count || 0,
                  series_tag: item.series_tag || [],
                  tag: item.tag || [],
                  content_tags: item.content_tags || [],
                  hot_score: item.hot_score ? String(item.hot_score) : ""
                });
              }
            });
          }

          if (modItems.length > 0) {
            // Determine a fallback module name if empty
            let displayName = mod.module_name || "";
            if (!displayName) {
              if (mod.type === "column_vertical_three" || mod.type === "column_vertical") {
                displayName = "Mới cập nhật";
              } else if (mod.type === "recommend") {
                displayName = "Lựa chọn phổ biến";
              } else if (mod.type === "coming_soon") {
                displayName = "Sắp khởi chiếu 🎉";
              } else {
                displayName = "Đề xuất cho bạn";
              }
            }

            parsedModules.push({
              type: mod.type || "recommend",
              module_name: displayName,
              module_key: String(mod.module_key || ""),
              items: modItems
            });
          }
        });

        setModules(parsedModules);

        // Dynamically extract the feed module key
        let feedKey = activeTab === "503" ? "1036" : "2204";
        const recommendMod = rawModules.find((m: any) => m.type === "recommend");
        if (recommendMod && recommendMod.module_key) {
          feedKey = String(recommendMod.module_key);
        } else if (rawModules.length > 0) {
          const lastMod = rawModules[rawModules.length - 1];
          if (lastMod && lastMod.module_key) {
            feedKey = String(lastMod.module_key);
          }
        }
        setFeedModuleKey(feedKey);

        // Map page_info pagination details
        const pageInfo = res.data.data.page_info;
        if (pageInfo) {
          setNextCursor(pageInfo.next || "");
          setHasMore(!!pageInfo.has_more);
        } else {
          setHasMore(false);
          setNextCursor("");
        }
      } else {
        setError("Không thể tải danh sách phim. Định dạng dữ liệu không hợp lệ.");
      }
    } catch (err: any) {
      console.error("Lỗi lấy danh sách phim ngắn:", err);
      setError(err.toString() || "Đã xảy ra lỗi khi kết nối máy chủ.");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Fetch more feed items (pagination)
  const fetchMoreFeed = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<any>("fetch_short_reels_feed", {
        moduleKey: feedModuleKey,
        next: nextCursor
      });

      if (res && res.success && res.data && res.data.data && res.data.data.items) {
        const rawItems = res.data.data.items;
        const parsedReels: ReelItem[] = [];

        rawItems.forEach((item: any) => {
          if (item.key && item.title) {
            parsedReels.push({
              key: item.key,
              cover: item.cover,
              title: item.title,
              desc: item.desc || "",
              episode_count: item.episode_count || 0,
              follow_count: item.follow_count || 0,
              series_tag: item.series_tag || [],
              tag: item.tag || [],
              content_tags: item.content_tags || [],
              hot_score: item.hot_score ? String(item.hot_score) : ""
            });
          }
          if (item.module_card && item.module_card.items) {
            item.module_card.items.forEach((subItem: any) => {
              if (subItem.key && subItem.title) {
                parsedReels.push({
                  key: subItem.key,
                  cover: subItem.cover,
                  title: subItem.title,
                  desc: subItem.desc || "",
                  episode_count: subItem.episode_count || 0,
                  follow_count: subItem.follow_count || 0,
                  series_tag: subItem.series_tag || [],
                  tag: subItem.tag || [],
                  content_tags: subItem.content_tags || [],
                  hot_score: subItem.hot_score ? String(subItem.hot_score) : ""
                });
              }
            });
          }
        });

        // Append and filter duplicates under the recommend module
        setModules(prev => {
          const hasRecommend = prev.some(mod => mod.type === "recommend");
          if (!hasRecommend) {
            return [
              ...prev,
              {
                type: "recommend",
                module_name: "Lựa chọn phổ biến",
                module_key: feedModuleKey,
                items: parsedReels
              }
            ];
          }

          return prev.map(mod => {
            if (mod.type === "recommend") {
              const combined = [...mod.items, ...parsedReels];
              const uniqueItems = combined.filter(
                (reel, index, self) => self.findIndex(r => r.key === reel.key) === index
              );
              return { ...mod, items: uniqueItems };
            }
            return mod;
          });
        });

        const pageInfo = res.data.data.page_info;
        if (pageInfo) {
          setNextCursor(pageInfo.next || "");
          setHasMore(!!pageInfo.has_more);
        } else {
          setHasMore(false);
          setNextCursor("");
        }
      }
    } catch (err) {
      console.error("Lỗi tải thêm phim ngắn:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, feedModuleKey, nextCursor]);

  // Fetch series detail & episodes
  const fetchSeriesDetail = useCallback(async (seriesId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setSeriesDetail(null);
    setCurrentEpisode(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<any>("fetch_short_reels_detail", {
        seriesId: seriesId
      });

      if (res && res.success && res.data && res.data.data && res.data.data.info) {
        const info = res.data.data.info;
        const parsedDetail: SeriesDetail = {
          id: info.id,
          name: info.name,
          desc: info.desc || "",
          cover: info.cover,
          episode_count: info.episode_count || 0,
          follow_count: info.follow_count || 0,
          tag: info.tag || [],
          content_tags: info.content_tags || [],
          episode_list: (info.episode_list || []).map((ep: any) => {
            const subs: ShortReelSubtitle[] = (ep.subtitle_list || []).map((sub: any) => ({
              file: sub.subtitle || "",
              label: sub.display_name || sub.language || "",
              default: sub.language === "vi-VN" || sub.language === "vi"
            }));
            return {
              id: ep.id,
              name: ep.name,
              cover: ep.cover || info.cover,
              external_audio_h264_m3u8: ep.external_audio_h264_m3u8 || "",
              external_audio_h265_m3u8: ep.external_audio_h265_m3u8 || "",
              subtitle_list: subs
            };
          })
        };

        setSeriesDetail(parsedDetail);
        
        // Auto-select episode 1 if available
        if (parsedDetail.episode_list.length > 0) {
          setCurrentEpisode(parsedDetail.episode_list[0]);
        }
      } else {
        setDetailError("Không thể tải thông tin chi tiết phim ngắn này.");
      }
    } catch (err: any) {
      console.error("Lỗi tải chi tiết phim ngắn:", err);
      setDetailError(err.toString() || "Đã xảy ra lỗi khi tải dữ liệu phim.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Load feed on mount or tab change
  useEffect(() => {
    fetchFeed();
  }, [activeTab, fetchFeed]);

  // Debounce search query to prevent rapid network calls
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 400); // 400ms debounce
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch search results from Supabase / drama API
  const fetchSearchResults = useCallback(async (keyword: string, isNext = false) => {
    if (!keyword) return;

    if (isNext) {
      if (loadingMore || !searchHasMore) return;
      setLoadingMore(true);
    } else {
      setSearchLoading(true);
      setSearchResults([]);
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const nextVal = isNext ? searchNextCursor : "";

      const res = await invoke<any>("search_short_reels", {
        keyword,
        next: nextVal,
        customToken: null
      });

      if (res && res.success && res.data && res.data.data && res.data.data.items) {
        const rawItems = res.data.data.items;
        const parsedReels: ReelItem[] = [];

        rawItems.forEach((item: any) => {
          const itemKey = item.key || item.id;
          const itemTitle = item.title || item.name;
          if (itemKey && itemTitle) {
            parsedReels.push({
              key: itemKey,
              cover: item.cover,
              title: itemTitle,
              desc: item.desc || "",
              episode_count: item.episode_count || 0,
              follow_count: item.follow_count || 0,
              series_tag: item.series_tag || [],
              tag: item.tag || [],
              content_tags: item.content_tags || [],
              hot_score: item.hot_score ? String(item.hot_score) : ""
            });
          }
          if (item.module_card && item.module_card.items) {
            item.module_card.items.forEach((subItem: any) => {
              const subKey = subItem.key || subItem.id;
              const subTitle = subItem.title || subItem.name;
              if (subKey && subTitle) {
                parsedReels.push({
                  key: subKey,
                  cover: subItem.cover,
                  title: subTitle,
                  desc: subItem.desc || "",
                  episode_count: subItem.episode_count || 0,
                  follow_count: subItem.follow_count || 0,
                  series_tag: subItem.series_tag || [],
                  tag: subItem.tag || [],
                  content_tags: subItem.content_tags || [],
                  hot_score: subItem.hot_score ? String(subItem.hot_score) : ""
                });
              }
            });
          }
        });

        setSearchResults(prev => {
          if (isNext) {
            const combined = [...prev, ...parsedReels];
            return combined.filter(
              (reel, index, self) => self.findIndex(r => r.key === reel.key) === index
            );
          }
          return parsedReels;
        });

        const pageInfo = res.data.data.page_info;
        if (pageInfo) {
          setSearchNextCursor(pageInfo.next || "");
          setSearchHasMore(!!pageInfo.has_more);
        } else {
          setSearchHasMore(false);
          setSearchNextCursor("");
        }
      }
    } catch (err) {
      console.error("Lỗi tìm kiếm phim ngắn:", err);
    } finally {
      setSearchLoading(false);
      setLoadingMore(false);
    }
  }, [loadingMore, searchHasMore, searchNextCursor]);

  // Trigger search when debounced query updates
  useEffect(() => {
    if (debouncedQuery !== "") {
      fetchSearchResults(debouncedQuery, false);
    } else {
      setSearchResults([]);
      setSearchHasMore(false);
      setSearchNextCursor("");
    }
  }, [debouncedQuery, fetchSearchResults]);

  // Fetch hot suggestions from Rust / hot-list API
  const fetchHotList = useCallback(async () => {
    setHotListLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<any>("fetch_short_reels_hot_list");
      if (res && res.success && res.data && res.data.data && res.data.data.items) {
        const rawItems = res.data.data.items;
        const parsedReels: ReelItem[] = [];

        rawItems.forEach((item: any) => {
          const itemKey = item.key || item.id;
          const itemTitle = item.title || item.name;
          if (itemKey && itemTitle) {
            parsedReels.push({
              key: itemKey,
              cover: item.cover,
              title: itemTitle,
              desc: item.desc || "",
              episode_count: item.episode_count || 0,
              follow_count: item.follow_count || 0,
              series_tag: item.series_tag || [],
              tag: item.tag || [],
              content_tags: item.content_tags || [],
              hot_score: item.hot_score ? String(item.hot_score) : ""
            });
          }
        });

        setHotList(parsedReels.slice(0, 10)); // Maximum 10 items
      }
    } catch (err) {
      console.error("Lỗi tải danh sách đề xuất hot:", err);
    } finally {
      setHotListLoading(false);
    }
  }, []);

  // Fetch recommendations when popup is opened
  useEffect(() => {
    if (isSearchPopupOpen && hotList.length === 0) {
      fetchHotList();
    }
  }, [isSearchPopupOpen, hotList.length, fetchHotList]);

  // Autofocus input field inside Search Popup modal
  useEffect(() => {
    if (isSearchPopupOpen) {
      const timer = setTimeout(() => {
        popupInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isSearchPopupOpen]);

  // Support Escape key to close the search popup modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSearchPopupOpen) {
        setIsSearchPopupOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchPopupOpen]);

  // Unified Infinite Scroll Trigger Hook (for both Home Feed and Live Search Results)
  useEffect(() => {
    if (selectedSeries) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const isSearchMode = debouncedQuery !== "";
    const canLoad = isSearchMode
      ? (searchHasMore && !loadingMore && !searchLoading)
      : (hasMore && !loadingMore && !loading);

    const loadMoreFunc = isSearchMode
      ? () => fetchSearchResults(debouncedQuery, true)
      : fetchMoreFeed;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoad) {
          loadMoreFunc();
        }
      },
      {
        rootMargin: "300px",
      }
    );

    observer.observe(sentinel);
    return () => {
      if (sentinel) observer.unobserve(sentinel);
    };
  }, [
    hasMore,
    loadingMore,
    loading,
    fetchMoreFeed,
    selectedSeries,
    debouncedQuery,
    searchHasMore,
    searchLoading,
    fetchSearchResults
  ]);

  // Handle browser back callback registration
  const handleBackToFeed = useCallback(() => {
    setSelectedSeries(null);
    setSeriesDetail(null);
    setCurrentEpisode(null);
    if (onRegisterBack) onRegisterBack(null);
  }, [onRegisterBack]);

  const handleSelectSeries = (series: ReelItem) => {
    setSelectedSeries(series);
    fetchSeriesDetail(series.key);
    if (onRegisterBack) {
      onRegisterBack(handleBackToFeed);
    }
  };

  const handleEpisodeEnded = useCallback(() => {
    if (!seriesDetail || !currentEpisode) return;
    const currentIndex = seriesDetail.episode_list.findIndex(ep => ep.id === currentEpisode.id);
    if (currentIndex !== -1 && currentIndex + 1 < seriesDetail.episode_list.length) {
      const nextEpisode = seriesDetail.episode_list[currentIndex + 1];
      setCurrentEpisode(nextEpisode);
    }
  }, [seriesDetail, currentEpisode]);

  // Filter reels locally by search inside each module
  const filteredModules = modules.map(mod => {
    const filteredItems = mod.items.filter(reel =>
      reel.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reel.desc.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { ...mod, items: filteredItems };
  }).filter(mod => mod.items.length > 0);

  return (
    <div className="w-full flex-1 flex flex-col min-w-0 relative" style={{ fontFamily: "var(--font-sans), sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(168, 85, 247, 0.35);
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(168, 85, 247, 0.6);
        }
      `}} />
      {selectedSeries ? (
        /* ================= DETAIL & PLAYER VIEW ================= */
        <div className="w-full flex flex-col gap-6 animate-fade-in">
          {/* Header Actions */}
          <div className="flex items-center gap-3 pt-6 px-1">
            <button
              onClick={handleBackToFeed}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight leading-none mb-1.5">
                {selectedSeries.title}
              </h1>
              <p className="text-xs text-neutral-400">Đang phát phim ngắn cao cấp</p>
            </div>
          </div>

          {detailLoading ? (
            /* Loading State for Details */
            <div className="w-full flex flex-col gap-6">
              {/* Top Section loading */}
              <div className="w-full flex flex-col lg:flex-row gap-6 items-start justify-center">
                {/* Player skeleton */}
                <div className="w-full lg:w-[400px] flex-shrink-0">
                  <div className="w-full aspect-[9/16] bg-white/5 animate-pulse" />
                </div>
                {/* Playlist skeleton */}
                <div className="flex-1 min-w-[300px] max-w-[640px] bg-white/5 rounded-2xl h-[480px] p-5 space-y-4 animate-pulse w-full">
                  <div className="h-4 bg-white/5 rounded w-1/4" />
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2.5 pt-4">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <div key={i} className="w-11 h-11 rounded-xl bg-white/5" />
                    ))}
                  </div>
                </div>
              </div>
              {/* Bottom details loading */}
              <div className="w-full bg-white/5 rounded-2xl p-6 h-[180px] animate-pulse" />
            </div>
          ) : detailError ? (
            /* Error State for Details */
            <div className="w-full flex flex-col items-center justify-center p-12 bg-white/5 border border-white/5 rounded-3xl">
              <p className="text-red-400 mb-4 text-sm font-semibold">{detailError}</p>
              <button
                onClick={() => fetchSeriesDetail(selectedSeries.key)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Thử lại
              </button>
            </div>
          ) : seriesDetail ? (
            /* Detailed Layout Split */
            <div className="w-full flex flex-col gap-6 animate-fade-in">
              {/* TOP SECTION: PLAYER & PLAYLIST */}
              <div className="w-full flex flex-col lg:flex-row gap-6 items-start justify-center">
                
                {/* Column 1: Vertical Video Player (9:16 aspect ratio) */}
                <div className="w-full lg:w-[400px] flex-shrink-0">
                  <div className="w-full aspect-[9/16] overflow-hidden relative">
                    {currentEpisode ? (
                      <AnimePlayer
                        url={currentEpisode.external_audio_h264_m3u8 || currentEpisode.external_audio_h265_m3u8}
                        episodeId={currentEpisode.id}
                        poster={currentEpisode.cover || seriesDetail.cover}
                        title={`${seriesDetail.name} - ${currentEpisode.name}`}
                        aspectRatio="absolute inset-0 w-full h-full"
                        onEnded={handleEpisodeEnded}
                        subtitles={currentEpisode.subtitle_list || []}
                        subtitleSize="18px"
                        pip={true}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-white/5 rounded-2xl border border-white/5 text-neutral-400 text-xs">
                        Vui lòng chọn một tập để bắt đầu phát.
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Grid Episodes Playlist (Compact Squares) */}
                <div className="flex-1 min-w-[300px] max-w-[640px] w-full bg-white/5 border border-white/5 rounded-2xl p-5 flex flex-col h-[480px]">
                  <div className="flex items-center gap-2 pb-3.5 border-b border-white/5 mb-4">
                    <Tv className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-black text-white tracking-wide uppercase">Danh sách tập</span>
                    <span className="ml-auto text-[10px] font-semibold text-neutral-400 bg-white/5 px-2 py-0.5 rounded-full">
                      {seriesDetail.episode_list.length} tập
                    </span>
                  </div>

                  {/* Scrollable grid of compact square episode buttons */}
                  <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2.5">
                      {seriesDetail.episode_list.map((ep, idx) => {
                        const isSelected = currentEpisode?.id === ep.id;
                        return (
                          <button
                            key={ep.id}
                            onClick={() => setCurrentEpisode(ep)}
                            title={`Tập ${idx + 1}`}
                            className={`w-11 h-11 rounded-xl border flex flex-col items-center justify-center text-xs font-bold font-mono transition-all duration-200 cursor-pointer ${
                              isSelected
                                ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20 scale-105"
                                : "bg-[#030305]/30 border-white/0 hover:border-white/10 hover:bg-white/5 text-neutral-300 hover:text-white"
                            }`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>

              {/* BOTTOM SECTION: DETAILED MOVIE INFO */}
              <div className="w-full bg-white/5 border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
                {/* Poster image preview */}
                <div className="w-32 aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-white/10 flex-shrink-0 bg-black/40">
                  <img
                    src={seriesDetail.cover}
                    alt={seriesDetail.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Movie info metadata */}
                <div className="flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <h2 className="text-xl font-black text-white leading-tight tracking-tight">
                      {seriesDetail.name}
                    </h2>
                    
                    <div className="flex flex-wrap items-center gap-1.5">
                      {seriesDetail.tag?.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        >
                          {tag}
                        </span>
                      ))}
                      {seriesDetail.content_tags?.map((ct, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-neutral-300 border border-white/5"
                        >
                          {ct}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">Tóm tắt nội dung</h3>
                      <p className="text-xs text-neutral-300 leading-relaxed font-medium">
                        {seriesDetail.desc || "Không có tóm tắt cho phim ngắn này."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pt-4 border-t border-white/5 text-xs text-neutral-400">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-purple-400" />
                      <span>Tổng tập: <strong className="text-white">{seriesDetail.episode_count}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span>Yêu thích: <strong className="text-white">{seriesDetail.follow_count}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ) : null}
        </div>
      ) : (
        /* ================= FEED GRID VIEW ================= */
        <div className="w-full flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
            <div className="flex items-center gap-4 select-none">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-purple-400 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Phim Ngắn</h1>
                <p className="text-neutral-500 text-sm">Tuyển tập những tựa phim ngắn đặc sắc nhất, lồng tiếng chất lượng cao</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Glassmorphic Search Trigger Bar */}
              <div
                onClick={() => setIsSearchPopupOpen(true)}
                className="relative w-56 cursor-pointer group"
              >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 group-hover:text-purple-400 transition-colors" />
                <div className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/5 group-hover:border-purple-500/20 group-hover:bg-white/10 rounded-xl text-xs text-neutral-500 select-none transition-all">
                  Tìm kiếm phim...
                </div>
              </div>

              <button
                onClick={fetchFeed}
                className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive tabs */}
          <div className="flex gap-2.5 p-1 bg-white/5 border border-white/5 rounded-2xl w-fit">
            {(["503", "547"] as const).map((tab) => {
              const label = tab === "503" ? "Phim ngắn" : "Hoạt hình";
              const isSelected = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                      : "text-neutral-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {loading ? (
            /* Skeleton Loading Grid grouped by mock sections */
            <div className="flex flex-col gap-8">
              {Array.from({ length: 2 }).map((_, sIdx) => {
                const isHorizontalSkeleton = sIdx === 1;
                return (
                  <div key={sIdx} className="flex flex-col gap-4">
                    <div className="h-5 bg-white/5 rounded-lg w-40 animate-pulse" />
                    {isHorizontalSkeleton ? (
                      <div className="flex gap-5 overflow-x-hidden pb-3">
                        {Array.from({ length: 8 }).map((_, idx) => (
                          <div key={idx} className="w-[150px] sm:w-[170px] md:w-[190px] lg:w-[210px] flex-shrink-0 flex flex-col gap-2">
                            <div className="w-full aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
                            <div className="h-3 bg-white/5 rounded w-3/4 animate-pulse mt-1" />
                            <div className="h-2.5 bg-white/5 rounded w-1/2 animate-pulse" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-6">
                        {Array.from({ length: 8 }).map((_, idx) => (
                          <div key={idx} className="flex flex-col gap-2">
                            <div className="w-full aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
                            <div className="h-3 bg-white/5 rounded w-3/4 animate-pulse mt-1" />
                            <div className="h-2.5 bg-white/5 rounded w-1/2 animate-pulse" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : error ? (
            /* Error Feed Display */
            <div className="w-full py-16 flex flex-col items-center justify-center bg-white/5 border border-white/5 rounded-3xl text-center">
              <p className="text-red-400 mb-4 text-xs font-bold">{error}</p>
              <button
                onClick={fetchFeed}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Tải lại trang
              </button>
            </div>
          ) : filteredModules.length === 0 ? (
            /* Empty Search Display */
            <div className="w-full py-16 flex flex-col items-center justify-center bg-white/5 border border-white/5 rounded-3xl text-center text-neutral-400">
              <Tv className="w-10 h-10 text-neutral-500 mb-3" />
              <p className="text-xs">Không tìm thấy tựa phim nào phù hợp.</p>
            </div>
          ) : (
            /* Grid Display of Short Reels Cards grouped by Sections */
            <>
              <div className="flex flex-col gap-10">
                {filteredModules.map((mod) => {
                  const isComingSoon = mod.type === "coming_soon";
                  return (
                    <div key={mod.module_key} className="flex flex-col gap-4 animate-fade-in">
                      {/* Section Header */}
                      <div className="flex items-center gap-2 select-none">
                        <span className="text-cyan-400 text-base font-light font-sans">▷</span>
                        <h2 className="text-xs font-black tracking-wider uppercase text-neutral-200">
                          {mod.module_name}
                        </h2>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent ml-3" />
                      </div>

                      {/* Section Cards Container */}
                      {isComingSoon ? (
                        /* Horizontal scroll row (Exactly 1 row) */
                        <div 
                          className="flex gap-5 overflow-x-auto pb-4 pt-1 scroll-smooth snap-x snap-mandatory no-scrollbar"
                          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        >
                          {mod.items.map((reel) => (
                            <div 
                              key={reel.key} 
                              className="w-[150px] sm:w-[170px] md:w-[190px] lg:w-[210px] flex-shrink-0 snap-start"
                            >
                              <div
                                onClick={() => handleSelectSeries(reel)}
                                className="group flex flex-col bg-white/5 border border-white/0 hover:border-purple-500/20 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:translate-y-[-4px] hover:shadow-[0_12px_24px_rgba(168,85,247,0.1)] relative h-full"
                              >
                                {/* Poster Image Container */}
                                <div className="w-full aspect-[2/3] relative overflow-hidden bg-black/40">
                                  <img
                                    src={reel.cover}
                                    alt={reel.title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    loading="lazy"
                                  />

                                  {/* Gradient Overlay */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90 transition-opacity" />

                                  {/* Floating play indicator on hover */}
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <div className="w-10 h-10 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-500/40 transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                      <Play className="w-4 h-4 fill-current ml-0.5" />
                                    </div>
                                  </div>

                                  {/* Hot Score Badge at Top-Left */}
                                  {reel.hot_score ? (
                                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-purple-600/90 backdrop-blur-md px-2 py-0.5 rounded-lg border border-purple-500/30 text-[9px] font-extrabold text-white shadow-md shadow-purple-500/20">
                                      <span className="text-yellow-300 animate-pulse">🔥</span>
                                      <span>{reel.hot_score}</span>
                                    </div>
                                  ) : null}

                                  {/* Total Episodes Tag */}
                                  <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/5 text-[9px] font-bold text-neutral-300">
                                    <Tv className="w-2.5 h-2.5 text-purple-400" />
                                    <span>{reel.episode_count} Tập</span>
                                  </div>
                                </div>

                                {/* Info Metadata Box */}
                                <div className="p-3 flex-1 flex flex-col justify-between gap-1.5">
                                  <div>
                                    <h3 className="text-sm font-extrabold text-neutral-100 group-hover:text-purple-300 transition-colors line-clamp-1">
                                      {reel.title}
                                    </h3>
                                    <p className="text-xs text-neutral-400 line-clamp-2 mt-1 leading-normal font-medium">
                                      {reel.desc || "Phim ngắn kịch tính hấp dẫn."}
                                    </p>
                                  </div>

                                  {/* Tags */}
                                  {((reel.content_tags && reel.content_tags.length > 0) || (reel.tag && reel.tag.length > 0)) && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {(reel.content_tags && reel.content_tags.length > 0 ? reel.content_tags : reel.tag || []).slice(0, 2).map((t, idx) => (
                                        <span
                                          key={idx}
                                          className="text-[8px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/5"
                                        >
                                          {t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* Standard grid display */
                        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-6">
                          {mod.items.map((reel) => (
                            <div
                              key={reel.key}
                              onClick={() => handleSelectSeries(reel)}
                              className="group flex flex-col bg-white/5 border border-white/0 hover:border-purple-500/20 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:translate-y-[-4px] hover:shadow-[0_12px_24px_rgba(168,85,247,0.1)] relative"
                            >
                              {/* Poster Image Container */}
                              <div className="w-full aspect-[2/3] relative overflow-hidden bg-black/40">
                                <img
                                  src={reel.cover}
                                  alt={reel.title}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  loading="lazy"
                                />

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90 transition-opacity" />

                                {/* Floating play indicator on hover */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                  <div className="w-10 h-10 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-500/40 transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                    <Play className="w-4 h-4 fill-current ml-0.5" />
                                  </div>
                                </div>

                                {/* Hot Score Badge at Top-Left */}
                                {reel.hot_score ? (
                                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-purple-600/90 backdrop-blur-md px-2 py-0.5 rounded-lg border border-purple-500/30 text-[9px] font-extrabold text-white shadow-md shadow-purple-500/20">
                                    <span className="text-yellow-300 animate-pulse">🔥</span>
                                    <span>{reel.hot_score}</span>
                                  </div>
                                ) : null}

                                {/* Total Episodes Tag */}
                                <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/5 text-[9px] font-bold text-neutral-300">
                                  <Tv className="w-2.5 h-2.5 text-purple-400" />
                                  <span>{reel.episode_count} Tập</span>
                                </div>
                              </div>

                              {/* Info Metadata Box */}
                              <div className="p-3 flex-1 flex flex-col justify-between gap-1.5">
                                <div>
                                  <h3 className="text-sm font-extrabold text-neutral-100 group-hover:text-purple-300 transition-colors line-clamp-1">
                                    {reel.title}
                                  </h3>
                                  <p className="text-xs text-neutral-400 line-clamp-2 mt-1 leading-normal font-medium">
                                    {reel.desc || "Phim ngắn kịch tính hấp dẫn."}
                                  </p>
                                </div>

                                {/* Tags (Using content_tags with tag fallback) */}
                                {((reel.content_tags && reel.content_tags.length > 0) || (reel.tag && reel.tag.length > 0)) && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {(reel.content_tags && reel.content_tags.length > 0 ? reel.content_tags : reel.tag || []).slice(0, 2).map((t, idx) => (
                                      <span
                                        key={idx}
                                        className="text-[8px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/5"
                                      >
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Infinite Scroll Sentinel & Loading Indicator */}
              <div ref={sentinelRef} className="w-full py-8 flex flex-col items-center justify-center gap-4 select-none">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-neutral-400 text-xs font-bold animate-pulse">
                    <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    <span>Đang tự động tải thêm phim ngắn hấp dẫn...</span>
                  </div>
                ) : debouncedQuery !== "" ? (
                  /* Search mode pagination state */
                  !searchHasMore && searchResults.length > 0 ? (
                    <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest bg-white/5 px-4 py-2 rounded-full border border-white/5 shadow-inner">
                      🎉 Đã hiển thị toàn bộ kết quả tìm kiếm
                    </span>
                  ) : (
                    <div className="h-2 w-full" />
                  )
                ) : (
                  /* Standard mode pagination state */
                  !hasMore && modules.some(mod => mod.items.length > 0) ? (
                    <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest bg-white/5 px-4 py-2 rounded-full border border-white/5 shadow-inner">
                      🎉 Đã hiển thị toàn bộ phim ngắn
                    </span>
                  ) : (
                    <div className="h-2 w-full" />
                  )
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ================= PREMIUM GLASSMORPHIC SEARCH POPUP MODAL ================= */}
      {isSearchPopupOpen && (
        <div className="fixed inset-y-0 right-0 left-[260px] bg-black/90 backdrop-blur-xl z-[9999] flex items-center justify-center p-4 sm:p-10 transition-all duration-300 animate-fade-in overflow-hidden">
          {/* Ambient Purple & Cyan Backlights */}
          <div className="absolute top-[10%] left-[20%] w-[350px] h-[350px] bg-purple-600/10 blur-[100px] rounded-full pointer-events-none animate-pulse" />
          <div className="absolute bottom-[20%] right-[20%] w-[300px] h-[300px] bg-cyan-600/5 blur-[100px] rounded-full pointer-events-none animate-pulse" />

          <div className="relative w-full max-w-4xl bg-[#0d0d12]/90 border border-white/10 rounded-2xl shadow-[0_32px_64px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[85vh] animate-slide-up backdrop-blur-3xl">
            
            {/* Modal Input Header */}
            <div className="relative flex flex-col p-6 sm:p-8 border-b border-white/5 bg-black/40 select-none gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                  <span className="text-[10px] font-black tracking-widest text-purple-400 uppercase">Khám phá Vũ Trụ Phim Ngắn</span>
                </div>
                <button
                  onClick={() => {
                    setIsSearchPopupOpen(false);
                    setSearchQuery("");
                  }}
                  className="text-neutral-400 hover:text-white transition-all cursor-pointer text-xs font-black bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 px-3 py-1.5 rounded-lg border border-white/5 hover:border-rose-500/30 active:scale-95 flex items-center gap-1.5"
                >
                  <span>Đóng [ESC]</span>
                </button>
              </div>

              <div className="relative flex items-center">
                <Search className="w-5 h-5 text-purple-400 absolute left-5 top-1/2 -translate-y-1/2" />
                <input
                  ref={popupInputRef}
                  type="text"
                  placeholder="Tìm kiếm phim ngắn, hoạt hình siêu hấp dẫn..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/5 hover:border-white/10 focus:border-purple-500 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none transition-all duration-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] focus:shadow-[0_0_20px_rgba(168,85,247,0.15)] font-semibold"
                />
                {searchQuery.trim() !== "" && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white flex items-center justify-center transition-all cursor-pointer text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Quick Search Tag Filters */}
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <span className="text-neutral-500 font-bold mr-1">Gợi ý từ khóa:</span>
                {["Báo thù", "Cưới trước yêu sau", "Tổng tài", "Thần thoại", "Lịch sử", "Lãng mạn"].map((tagText) => (
                  <button
                    key={tagText}
                    onClick={() => setSearchQuery(tagText)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-purple-500/10 text-neutral-400 hover:text-purple-300 border border-white/5 hover:border-purple-500/20 active:scale-95 transition-all duration-200 cursor-pointer font-semibold text-[11px]"
                  >
                    #{tagText}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar space-y-8 min-h-0">
              {searchQuery.trim() === "" ? (
                /* ================= SUGGESTIONS MODE ================= */
                <div className="space-y-5 animate-fade-in">
                  <div className="flex items-center gap-2 select-none">
                    <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400">
                      Xu hướng phim ngắn hot hôm nay 🔥
                    </h3>
                  </div>

                  {hotListLoading ? (
                    /* Elegant Shimmer Shimmer Recommendation list */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 animate-pulse">
                          <div className="w-6 h-4 bg-white/10 rounded" />
                          <div className="w-10 h-14 bg-white/10 rounded-lg flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 bg-white/10 rounded w-1/2" />
                            <div className="h-2.5 bg-white/10 rounded w-3/4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : hotList.length === 0 ? (
                    <div className="w-full py-8 text-center text-xs text-neutral-500 font-bold select-none">
                      Không có đề xuất nào hôm nay.
                    </div>
                  ) : (
                    /* Rich numbered Hot List suggestion grid */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                      {hotList.map((item, idx) => {
                        const views = item.follow_count
                          ? (item.follow_count >= 1000
                              ? (item.follow_count / 1000).toFixed(1) + "K"
                              : item.follow_count)
                          : "1.9K";

                        const tags = (item.series_tag && item.series_tag.length > 0)
                          ? item.series_tag.slice(0, 2)
                          : (item.content_tags && item.content_tags.length > 0)
                            ? item.content_tags.slice(0, 2)
                            : ["Yêu kẻ thù", "Báo thù"];

                        return (
                          <div
                            key={item.key}
                            onClick={() => {
                              handleSelectSeries(item);
                              setIsSearchPopupOpen(false);
                            }}
                            className="flex gap-4 p-4 rounded-xl bg-[#111115]/60 border border-white/5 hover:border-purple-500/30 hover:bg-[#15151e]/90 transition-all duration-300 cursor-pointer group shadow-md hover:shadow-xl relative animate-fade-in"
                          >
                            {/* Left Poster Image */}
                            <div className="w-24 h-32 rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0 relative border border-white/5 group-hover:border-purple-500/30 shadow-md">
                              <img
                                src={item.cover}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                              />

                              {/* Star Badge top-left */}
                              <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-amber-500 text-white rounded flex items-center justify-center shadow-md">
                                <Star className="w-3 h-3 fill-current text-white" />
                              </div>

                              {/* FREE Badge top-right */}
                              <div className="absolute top-1.5 right-1.5 bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider shadow-md">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                <span>FREE</span>
                              </div>
                            </div>

                            {/* Right Detail Column */}
                            <div className="flex-1 flex flex-col min-w-0 justify-between py-1">
                              <div>
                                {/* Title & Hot score */}
                                <div className="flex items-start justify-between gap-3">
                                  <h4 className="text-sm font-extrabold text-neutral-100 group-hover:text-purple-300 transition-colors truncate">
                                    {item.title}
                                  </h4>
                                  <span className="text-[10px] font-bold text-rose-500 flex items-center gap-0.5 flex-shrink-0 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/10 select-none">
                                    <Search className="w-2.5 h-2.5" />
                                    <span>{item.hot_score || "261.8K"}</span>
                                  </span>
                                </div>

                                {/* Description */}
                                <p className="text-xs text-neutral-400 line-clamp-2 mt-1.5 leading-normal">
                                  {item.desc || "Phim ngắn kịch tính hấp dẫn."}
                                </p>

                                {/* Tags */}
                                <div className="text-[10px] text-neutral-500 mt-2 font-medium">
                                  {tags.join(" · ")}
                                </div>
                              </div>

                              {/* Stats bottom */}
                              <div className="flex items-center gap-4 mt-3 text-xs text-neutral-400 border-t border-white/5 pt-2">
                                <span>{item.episode_count || 80} tập</span>
                                <span className="flex items-center gap-1 text-amber-500 font-bold">
                                  <Eye className="w-3.5 h-3.5 text-amber-500 fill-current" />
                                  <span>{views}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* ================= ACTIVE LIVE SEARCH RESULTS VIEW ================= */
                <div className="space-y-6 animate-fade-in animate-duration-200">
                  {searchLoading ? (
                    <div className="space-y-4">
                      <div className="h-4 bg-white/5 rounded-lg w-64 animate-pulse" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {Array.from({ length: 4 }).map((_, idx) => (
                          <div key={idx} className="flex flex-col gap-2">
                            <div className="w-full aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
                            <div className="h-3 bg-white/5 rounded w-3/4 animate-pulse mt-1" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="w-full py-16 flex flex-col items-center justify-center bg-white/5 border border-white/5 rounded-3xl text-center text-neutral-400 animate-fade-in">
                      <Tv className="w-10 h-10 text-neutral-500 mb-3 animate-bounce" />
                      <p className="text-xs">
                        Không tìm thấy tựa phim nào cho từ khóa{" "}
                        <strong className="text-purple-400">"{searchQuery}"</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 select-none">
                        <span className="text-purple-400 text-xs font-black">🔎 KẾT QUẢ TÌM KIẾM</span>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-purple-500/20 to-transparent ml-3" />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {searchResults.map((reel) => (
                          <div
                            key={reel.key}
                            onClick={() => {
                              handleSelectSeries(reel);
                              setIsSearchPopupOpen(false);
                            }}
                            className="group flex flex-col bg-white/5 border border-white/0 hover:border-purple-500/20 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:translate-y-[-4px] hover:shadow-[0_12px_24px_rgba(168,85,247,0.1)] relative"
                          >
                            <div className="w-full aspect-[2/3] relative overflow-hidden bg-black/40">
                              <img
                                src={reel.cover}
                                alt={reel.title}
                                className="w-full h-full object-cover transform scale-100 group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                              
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-500/40 transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                  <Play className="w-3 h-3 fill-current ml-0.5" />
                                </div>
                              </div>

                              {reel.hot_score ? (
                                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-purple-600/90 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-purple-500/30 text-[8px] font-extrabold text-white">
                                  <span className="text-yellow-300">🔥</span>
                                  <span>{reel.hot_score}</span>
                                </div>
                              ) : null}

                              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-white/5 text-[8px] font-bold text-neutral-300">
                                <Tv className="w-2 h-2 text-purple-400" />
                                <span>{reel.episode_count} Tập</span>
                              </div>
                            </div>

                            <div className="p-2.5 flex-1 flex flex-col justify-between gap-1">
                              <h4 className="text-xs font-extrabold text-neutral-100 group-hover:text-purple-300 transition-colors line-clamp-1">
                                {reel.title}
                              </h4>
                              {reel.desc && (
                                <p className="text-[10px] text-neutral-500 line-clamp-1 leading-normal font-medium">
                                  {reel.desc}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
