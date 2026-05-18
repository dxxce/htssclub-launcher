"use client";

import { useEffect, useState, useCallback } from "react";
import { Play, TrendingUp, ChevronLeft, Loader2, Eye, Star, Clock, Search, X } from "lucide-react";
import AnimeDetail from "./AnimeDetail";

interface Anime {
  id: number;
  slug: string;
  title: string;
  poster?: string;
  posterUrl?: string;
  cover?: string;
  image?: string;
  description?: string;
  synopsis?: string;
  views?: number | string;
  rank?: number;
  rating?: string | number;
  current_episode?: string | number;
  episodes?: string | number;
  type?: string;
  year?: string | number;
}

const AnimeCard = ({ anime, onClick }: { anime: Anime; onClick: () => void }) => {
  return (
    <div 
      onClick={onClick}
      className="group relative aspect-[2/3] rounded-2xl bg-[#0a0a0f] overflow-hidden border border-white/5 cursor-pointer transition-all duration-500 hover:border-cyan-500/50 hover:shadow-[0_15px_40px_rgba(34,211,238,0.15)] hover:-translate-y-2"
    >
      <img 
        src={anime.posterUrl || anime.poster || anime.cover || anime.image} 
        alt={anime.title} 
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      {/* Permanent Gradient for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/10" />

      {/* Top badges */}
      <div className="absolute top-0 left-0 w-full p-3 flex justify-between items-start z-20">
        {/* Top Left: Rating or Rank */}
        {(anime.rating || anime.rank) && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#3f191a]/80 backdrop-blur-md border border-white/5 shadow-lg">
            {anime.rating ? (
              <>
                <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                <span className="text-xs font-black text-white">{anime.rating}</span>
              </>
            ) : (
              <>
                <TrendingUp className="w-3.5 h-3.5 text-yellow-500" />
                <span className="text-xs font-black text-white">{anime.rank}</span>
              </>
            )}
          </div>
        )}

        {/* Top Right: Episode */}
        {(anime.current_episode || anime.episodes) && (
          <div className="flex items-center px-3 py-1.5 rounded-lg bg-[#3f191a]/80 backdrop-blur-md border border-white/5 shadow-lg">
            <span className="text-[10px] font-black text-white uppercase tracking-wider">
              TẬP {anime.current_episode || anime.episodes}
            </span>
          </div>
        )}
      </div>

      {/* Play overlay on hover */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <div className="w-12 h-12 rounded-full bg-cyan-500/90 text-white flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.5)] transform scale-50 group-hover:scale-100 transition-all duration-300">
          <Play className="w-5 h-5 fill-white ml-1" />
        </div>
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 w-full p-4 z-20 flex flex-col gap-1.5">
        <h3 className="font-bold text-white text-[15px] leading-tight line-clamp-2 drop-shadow-md group-hover:text-cyan-400 transition-colors">
          {anime.title}
        </h3>
        
        <div className="flex items-center gap-2.5 text-xs font-bold mt-1">
          {anime.year && (
            <span className="flex items-center gap-1.5 text-cyan-400">
              <Clock className="w-3.5 h-3.5" />
              {anime.year}
            </span>
          )}
          {anime.type && (
            <span className="text-cyan-400">{anime.type}</span>
          )}
          {anime.views && (
            <span className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-white drop-shadow-md">{typeof anime.views === 'number' ? anime.views.toLocaleString() : anime.views}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface AnimeHubProps {
  onRegisterBack?: (cb: (() => void) | null) => void;
}

export default function AnimeHub({ onRegisterBack }: AnimeHubProps) {
  const [trending, setTrending] = useState<Anime[]>([]);
  const [latest, setLatest] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [inputPage, setInputPage] = useState("1");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await fetch(`https://ani.htss.club/api/anime/search/live?keyword=${encodeURIComponent(searchQuery)}`);
        const json = await res.json();
        
        let results: Anime[] = [];
        if (Array.isArray(json)) {
          results = json;
        } else if (json.results && Array.isArray(json.results)) {
          results = json.results;
        } else if (json.data && Array.isArray(json.data)) {
          results = json.data;
        } else if (json.data && Array.isArray(json.data.posts)) {
          results = json.data.posts;
        } else if (json.posts && Array.isArray(json.posts)) {
          results = json.posts;
        }
        
        setSearchResults(results);
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  useEffect(() => {
    setInputPage(page.toString());
  }, [page]);

  useEffect(() => {
    async function fetchTrending() {
      try {
        const res = await fetch("https://ani.htss.club/api/anime/trending");
        const json = await res.json();
        setTrending(json.slice(0, 12));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchTrending();
  }, []);

  useEffect(() => {
    async function fetchLatest() {
      try {
        setLoadingLatest(true);
        const res = await fetch(`https://ani.htss.club/api/anime?page=${page}&sort=latest`);
        const json = await res.json();
        if (json.success && json.data && json.data.posts) {
          setLatest(json.data.posts);
          if (json.data.pagination) {
            setTotalPages(json.data.pagination.last_page);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingLatest(false);
      }
    }
    fetchLatest();
  }, [page]);

  useEffect(() => {
    if (!selectedId && onRegisterBack) {
      const timer = setTimeout(() => {
        onRegisterBack(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [selectedId, onRegisterBack]);

  const handleBack = useCallback(() => {
    setSelectedId(null);
  }, []);

  if (selectedId) {
    return (
      <div className="flex-1 w-full flex flex-col relative min-w-0">
        <AnimeDetail id={selectedId} onBack={handleBack} onRegisterBack={onRegisterBack} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
        <p className="text-neutral-400 font-medium">Đang tải dữ liệu Anime...</p>
      </div>
    );
  }

  const heroAnime = trending[0];

  return (
    <div className="flex flex-col w-full">
      {/* Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6">
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400 tracking-tight flex items-center gap-2">
            HTSS Anime
          </h1>
          <p className="text-xs text-neutral-400 mt-1">Khám phá thế giới anime đỉnh cao cùng HTSS Club</p>
        </div>
        
        <div className="relative flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/10 focus-within:border-cyan-500/50 focus-within:shadow-[0_0_20px_rgba(34,211,238,0.15)] transition-all duration-300 w-full md:max-w-xs">
          <Search className="w-5 h-5 text-neutral-400 flex-shrink-0" />
          <input 
            type="text" 
            placeholder="Tìm kiếm anime..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-white placeholder-white/30 text-sm font-semibold w-full"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")} 
              className="text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {searchQuery.trim() ? (
        /* Search Results Area */
        <div className="mt-8 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-500 tracking-tight flex items-center gap-2">
              Kết quả tìm kiếm cho: <span className="text-cyan-400 font-extrabold">"{searchQuery}"</span>
            </h2>
          </div>
          
          {searching ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mb-4" />
              <p className="text-neutral-400 font-medium text-sm">Đang tìm kiếm anime...</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
              {searchResults.map((anime) => (
                <AnimeCard key={anime.id} anime={anime} onClick={() => setSelectedId(anime.id)} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 bg-white/[0.01] border border-white/5 rounded-3xl p-8">
              <p className="text-neutral-400 font-semibold text-base">Không tìm thấy anime nào phù hợp.</p>
              <p className="text-neutral-500 text-xs mt-1">Vui lòng thử từ khóa khác!</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Hero Banner Area */}
          {heroAnime && (
            <div 
              onClick={() => setSelectedId(heroAnime.id)}
              className="relative w-full h-[400px] rounded-3xl overflow-hidden mt-6 shadow-2xl group cursor-pointer border border-white/5 backdrop-blur-3xl bg-white/[0.02]"
            >
              <div className="absolute inset-0 bg-[#070709]" />
              <div className="absolute inset-0 z-0">
                <img 
                  src={heroAnime.posterUrl || heroAnime.poster || heroAnime.cover} 
                  alt={heroAnime.title} 
                  className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-700" 
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#030305] via-[#030305]/60 to-transparent z-10" />
              <div className="absolute right-0 top-0 w-3/4 h-full bg-gradient-to-l from-[#030305]/80 to-transparent z-10" />
              
              <div className="absolute bottom-0 left-0 p-12 z-20 flex flex-col gap-5 w-full">
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[0.65rem] font-bold border border-cyan-500/30 w-fit uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(34,211,238,0.2)] backdrop-blur-md">
                  THỊNH HÀNH SỐ 1
                </div>
                <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 drop-shadow-2xl tracking-tight max-w-2xl leading-[1.1]">
                  {heroAnime.title}
                </h1>
                <p className="text-neutral-300 max-w-xl text-base drop-shadow-md font-medium mt-2 line-clamp-2">
                  {heroAnime.description || heroAnime.synopsis}
                </p>
                <div className="flex gap-4 mt-6">
                  <button className="group relative overflow-hidden bg-white text-black px-8 py-3.5 rounded-xl flex items-center gap-3 font-bold transition-all hover:scale-105 shadow-[0_0_40px_rgba(255,255,255,0.3)] pointer-events-none">
                    <Play className="w-5 h-5 fill-black" />
                    Xem Ngay
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Trending Section */}
          <div className="mt-14 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-500 tracking-tight flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-cyan-400" /> Xu hướng hiện tại
              </h2>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
              {trending.slice(1).map((anime) => (
                <AnimeCard key={anime.id} anime={anime} onClick={() => setSelectedId(anime.id)} />
              ))}
            </div>
          </div>

          {/* Latest Section */}
          <div className="mt-14 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-500 tracking-tight flex items-center gap-2">
                <Play className="w-6 h-6 text-cyan-400" /> Mới cập nhật
              </h2>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
              {latest.map((anime) => (
                <AnimeCard key={anime.id} anime={anime} onClick={() => setSelectedId(anime.id)} />
              ))}
            </div>
            
            {/* Pagination Controls */}
            <div className="flex items-center justify-center gap-4 mt-8 mb-4">
              <button 
                disabled={page === 1 || loadingLatest}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5 transition-colors font-medium border border-white/10"
              >
                Trang trước
              </button>
              
              <div className="flex items-center gap-3 text-sm font-medium text-neutral-400">
                {loadingLatest ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-8 text-cyan-400" />
                ) : (
                  <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 backdrop-blur-md">
                    <span>Trang</span>
                    <input 
                      type="number" 
                      value={inputPage}
                      onChange={(e) => setInputPage(e.target.value)}
                      onBlur={() => {
                        let val = parseInt(inputPage);
                        if (isNaN(val) || val < 1) val = 1;
                        if (val > totalPages) val = totalPages;
                        setPage(val);
                        setInputPage(val.toString());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-12 bg-black/40 text-center rounded-md border border-white/10 focus:border-cyan-500 focus:bg-cyan-500/10 focus:ring-1 focus:ring-cyan-500 outline-none py-1 transition-all text-cyan-400 font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none selection:bg-cyan-500/30"
                    />
                    <span>/ <span className="font-bold text-white">{totalPages}</span></span>
                  </div>
                )}
              </div>

              <button 
                disabled={page === totalPages || loadingLatest}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black disabled:opacity-50 transition-colors font-bold shadow-[0_0_15px_rgba(34,211,238,0.2)]"
              >
                Trang tiếp
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
