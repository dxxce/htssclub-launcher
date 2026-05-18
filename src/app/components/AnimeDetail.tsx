"use client";

import { useEffect, useState } from "react";
import { Play, Loader2, ListVideo, X, ChevronLeft } from "lucide-react";
import AnimePlayer from "./AnimePlayer";

interface AnimeDetailProps {
  id: number;
  onBack: () => void;
  onRegisterBack?: (cb: (() => void) | null) => void;
}

export default function AnimeDetail({ id, onBack, onRegisterBack }: AnimeDetailProps) {
  const [currentId, setCurrentId] = useState(id);
  const [detail, setDetail] = useState<any>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeEpData, setActiveEpData] = useState<any>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [activeSubtitles, setActiveSubtitles] = useState<any[]>([]);

  useEffect(() => {
    setCurrentId(id);
  }, [id]);

  useEffect(() => {
    setActiveEpData(null);
    setStreamUrl(null);
    setActiveSubtitles([]);
  }, [currentId]);

  useEffect(() => {
    if (onRegisterBack) {
      const timer = setTimeout(() => {
        if (activeEpData && streamUrl) {
          onRegisterBack(() => {
            setActiveEpData(null);
            setStreamUrl(null);
            setActiveSubtitles([]);
          });
        } else {
          onRegisterBack(onBack);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeEpData, streamUrl, onRegisterBack, onBack]);

  useEffect(() => {
    return () => {
      if (onRegisterBack) {
        const timer = setTimeout(() => {
          onRegisterBack(null);
        }, 0);
      }
    };
  }, [onRegisterBack]);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        // fetch detail
        const resDetail = await fetch(`https://ani.htss.club/api/anime/${currentId}`);
        const jsonDetail = await resDetail.json();
        if (jsonDetail.data) {
          setDetail(jsonDetail.data);
        }

        // fetch episodes
        const resEps = await fetch(`https://ani.htss.club/api/anime/${currentId}/episodes`);
        const jsonEps = await resEps.json();
        
        // Find episodes
        const allEps: any[] = [];
        if (jsonEps.teams) {
          jsonEps.teams.forEach((t: any) => {
            if (t.groups) {
              t.groups.forEach((g: any) => {
                if (g.episodes) {
                  allEps.push(...g.episodes);
                }
              });
            }
          });
        }
        setEpisodes(allEps.sort((a, b) => a.number - b.number));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [currentId]);

  const handlePlayEpisode = async (ep: any) => {
    try {
      setStreamUrl(null); // Reset
      setActiveEpData(ep);
      const res = await fetch(`https://ani.htss.club/api/anime/${currentId}/episode/${ep.id}`);
      const json = await res.json();
      
      if (json.streams && json.streams.length > 0) {
        let rawUrl = json.streams[0].url;
        let subs = json.streams[0].subtitles || [];
        setActiveSubtitles(subs);
        setStreamUrl(rawUrl);
      } else {
        alert("Không tìm thấy link stream!");
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi khi tải tập phim!");
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#030305]">
        <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mb-4" />
        <p className="text-neutral-400">Đang tải thông tin phim...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#030305]">
        <p className="text-red-400">Không tìm thấy thông tin phim!</p>
      </div>
    );
  }

  const renderEpisodesGrid = () => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
      {episodes.map(ep => {
        const isActive = activeEpData?.id === ep.id;
        return (
          <button
            key={ep.id}
            onClick={() => handlePlayEpisode(ep)}
            className={`relative overflow-hidden rounded-xl aspect-[4/3] flex flex-col items-center justify-center border transition-all duration-300 group
              ${isActive 
                ? 'bg-cyan-500/20 border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.2)]' 
                : 'bg-white/[0.03] border-white/5 hover:bg-white/10 hover:border-white/20'
              }`}
          >
            <span className={`text-2xl font-black transition-colors ${isActive ? 'text-cyan-400' : 'text-neutral-400 group-hover:text-white'}`}>
              {ep.number}
            </span>
            <span className={`text-[10px] uppercase font-bold tracking-widest mt-1 transition-colors ${isActive ? 'text-cyan-500' : 'text-neutral-600 group-hover:text-neutral-400'}`}>
              TẬP
            </span>
            
            {isActive && (
              <div className="absolute top-2 right-2 flex gap-1">
                <div className="w-1 h-3 bg-cyan-400 animate-pulse rounded-full" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-3 bg-cyan-400 animate-pulse rounded-full" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-3 bg-cyan-400 animate-pulse rounded-full" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col w-full relative z-10 animate-in fade-in zoom-in-95 duration-300">
      
      {/* Player Mode */}
      {activeEpData && streamUrl ? (
        <div className="w-full flex flex-col min-h-screen">
          <div className="w-full bg-black relative">
            <button 
              onClick={() => { setActiveEpData(null); setStreamUrl(null); setActiveSubtitles([]); }}
              className="absolute top-6 right-6 z-50 w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="max-w-[1600px] mx-auto w-full aspect-video shadow-[0_30px_60px_rgba(0,0,0,0.8)] bg-black">
              <AnimePlayer 
                url={streamUrl} 
                episodeId={activeEpData.id}
                title={`Tập ${activeEpData.number} - ${detail.title}`} 
                subtitles={activeSubtitles}
              />
            </div>
          </div>
          
          <div className="w-full bg-[#0a0a0f] border-b border-white/5 shadow-lg relative z-10">
            <div className="max-w-[1600px] mx-auto w-full px-8 lg:px-12 py-6 flex items-center gap-6">
              <img src={detail.poster} className="w-16 h-24 object-cover rounded-lg shadow-md border border-white/5 hidden sm:block" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white">{detail.title}</h1>
                <p className="text-cyan-400 font-bold text-lg mt-1">Đang phát: Tập {activeEpData.number}</p>
              </div>
            </div>
          </div>
          
          <div className="max-w-[1600px] mx-auto w-full p-8 lg:p-12 flex-1">
             <h2 className="text-xl font-black text-white mb-6 flex items-center gap-3">
               <ListVideo className="w-5 h-5 text-cyan-400" /> Chọn tập khác
             </h2>
             {renderEpisodesGrid()}
          </div>
        </div>
      ) : (
        /* Detail Mode */
        <div className="w-full flex flex-col pb-12 mt-4">
          {/* Hero Section */}
          <div className="relative w-full rounded-3xl overflow-hidden min-h-[55vh] flex flex-col justify-end border border-white/5 shadow-2xl">
            <button 
              onClick={onBack}
              className="absolute top-6 left-6 z-[60] flex items-center justify-center w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors group cursor-pointer shadow-lg"
            >
              <ChevronLeft className="w-6 h-6 text-white group-hover:-translate-x-1 transition-transform" />
            </button>
            <div className="absolute inset-0">
              <img src={detail.cover || detail.poster} alt={detail.title} className="w-full h-full object-cover opacity-30" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#030305] via-[#030305]/80 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#030305] via-[#030305]/50 to-transparent" />
            </div>
            
            <div className="relative z-20 p-8 lg:p-12 flex gap-10 w-full">
              <div className="shrink-0 hidden md:block">
                 <img src={detail.poster} alt={detail.title} className="w-64 h-96 object-cover rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10" />
              </div>
              
              <div className="flex flex-col justify-end pb-4">
                <div className="flex gap-2 mb-4 flex-wrap">
                  {detail.genres && detail.genres.map((g: any) => (
                    <span key={g.id} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-neutral-300 font-bold uppercase tracking-wider">
                      {g.name}
                    </span>
                  ))}
                  {detail.year && (
                    <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-bold uppercase tracking-wider">
                      {detail.year}
                    </span>
                  )}
                  {detail.score && (
                    <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-xs font-bold uppercase tracking-wider">
                      ★ {detail.score}
                    </span>
                  )}
                </div>
                
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white drop-shadow-lg leading-tight mb-4">
                  {detail.title}
                </h1>
                
                <p className="text-neutral-300 text-sm sm:text-base max-w-4xl leading-relaxed mb-8 line-clamp-4">
                  {detail.description || "Chưa có nội dung mô tả."}
                </p>
                
                <div className="flex items-center gap-4">
                  {episodes.length > 0 && (
                    <button 
                      onClick={() => handlePlayEpisode(episodes[0])}
                      className="flex items-center gap-3 bg-cyan-500 hover:bg-cyan-400 text-black px-8 py-4 rounded-2xl font-black transition-all shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.5)] hover:-translate-y-1"
                    >
                      <Play className="w-6 h-6 fill-black" />
                      XEM TẬP 1
                    </button>
                  )}
                  <button className="px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 font-bold text-white transition-all hover:-translate-y-1">
                    Thêm vào danh sách
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Episodes Section */}
          <div className="w-full px-8 lg:px-12 pt-8">
            <h2 className="text-2xl font-black text-white flex items-center gap-3 mb-6">
              <ListVideo className="w-6 h-6 text-cyan-400" /> 
              Danh sách tập phim ({episodes.length})
            </h2>
            {episodes.length === 0 ? (
              <p className="text-neutral-500 italic">Chưa có tập phim nào.</p>
            ) : (
              renderEpisodesGrid()
            )}
          </div>

          {/* Related Parts Section (animeGroups) */}
          {detail.animeGroups && detail.animeGroups.map((group: any) => (
            <div key={group.id} className="w-full px-8 lg:px-12 pt-8">
              <h2 className="text-2xl font-black text-white flex items-center gap-3 mb-6 relative pl-4">
                <div className="absolute left-0 top-1 bottom-1 w-1 bg-cyan-400 rounded-full" />
                Phần liên quan
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
                {group.posts && group.posts.map((post: any) => {
                  const isActive = post.id === currentId || post.legacy_id === currentId;
                  return (
                    <div 
                      key={post.id}
                      onClick={() => !isActive && setCurrentId(post.id)}
                      className="group flex flex-col cursor-pointer"
                    >
                      <div className={`relative aspect-[2/3] rounded-2xl bg-[#0a0a0f] overflow-hidden border-2 transition-all duration-500
                        ${isActive 
                          ? 'border-cyan-500 shadow-[0_0_20px_rgba(34,211,238,0.3)] scale-[1.02]' 
                          : 'border-white/5 hover:border-cyan-500/50 hover:shadow-[0_15px_40px_rgba(34,211,238,0.15)] hover:-translate-y-2'
                        }`}
                      >
                        <img 
                          src={post.poster} 
                          alt={post.title} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                        
                        {/* Active badge */}
                        {isActive && (
                          <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-cyan-500 text-black text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg shadow-cyan-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-black" />
                            ĐANG XEM
                          </div>
                        )}

                        {/* Position / Note label */}
                        {(post.note || post.position) && (
                          <div className="absolute bottom-4 left-4 right-4 py-2 rounded-xl bg-black/60 border border-white/5 backdrop-blur-md flex items-center justify-center">
                            <span className="text-sm font-black text-white">
                              {post.note || post.position}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Title under card */}
                      <p className={`text-sm font-bold mt-3 line-clamp-2 leading-tight transition-colors
                        ${isActive ? 'text-cyan-400' : 'text-neutral-200 group-hover:text-cyan-400'}`}
                      >
                        {post.title}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Characters Section */}
          {detail.characters && detail.characters.length > 0 && (
            <div className="w-full px-8 lg:px-12 pt-8">
              <h2 className="text-2xl font-black text-white mb-6">Diễn Viên / Nhân Vật</h2>
              <div className="flex gap-6 overflow-x-auto custom-scrollbar pb-6 snap-x">
                {detail.characters.map((char: any) => (
                  <div key={char.id} className="min-w-[100px] w-[100px] sm:min-w-[120px] sm:w-[120px] flex flex-col items-center gap-3 snap-start group cursor-pointer">
                    <div className="w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] rounded-full overflow-hidden border-2 border-white/5 group-hover:border-cyan-500/50 transition-colors shadow-lg relative">
                      <img src={char.image_url} alt={char.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <span className="text-[10px] sm:text-xs text-cyan-400 font-bold uppercase text-center px-1">
                          {char.role}
                        </span>
                      </div>
                    </div>
                    <div className="text-center w-full px-1">
                      <p className="text-xs sm:text-sm text-white font-bold line-clamp-2 leading-tight group-hover:text-cyan-400 transition-colors">
                        {char.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
