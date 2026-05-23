"use client";

import { useEffect, useState } from "react";
import { Play, Loader2, ListVideo, X, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import AnimePlayer from "./AnimePlayer";

interface AnimeDetailProps {
  id: number;
  onBack: () => void;
  onRegisterBack?: (cb: (() => void) | null) => void;
  reloadKey?: number;
}

export default function AnimeDetail({ id, onBack, onRegisterBack, reloadKey }: AnimeDetailProps) {
  const [currentId, setCurrentId] = useState(id);
  const [detail, setDetail] = useState<any>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeEpData, setActiveEpData] = useState<any>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [activeSubtitles, setActiveSubtitles] = useState<any[]>([]);

  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);

  useEffect(() => {
    setCurrentId(id);
  }, [id]);

  useEffect(() => {
    setActiveEpData(null);
    setStreamUrl(null);
    setActiveSubtitles([]);
    setGroups([]);
    setSelectedGroup(null);
    setIsGroupDropdownOpen(false);
  }, [currentId]);

  // Auto-select group containing the active episode
  useEffect(() => {
    if (activeEpData && groups.length > 0) {
      const isCurrentGroupContainEp = selectedGroup?.episodes?.some((ep: any) => ep.id === activeEpData.id);
      if (!isCurrentGroupContainEp) {
        const matchingGroup = groups.find(g => g.episodes?.some((ep: any) => ep.id === activeEpData.id));
        if (matchingGroup) {
          setSelectedGroup(matchingGroup);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEpData, groups]);

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
        
        // Find episodes and groups
        const allEps: any[] = [];
        const allGroups: any[] = [];
        if (jsonEps.teams) {
          jsonEps.teams.forEach((t: any) => {
            if (t.groups) {
              t.groups.forEach((g: any) => {
                allGroups.push(g);
                if (g.episodes) {
                  allEps.push(...g.episodes);
                }
              });
            }
          });
        }
        setGroups(allGroups);
        if (allGroups.length > 0) {
          // Find the group containing the latest episode (highest episode number)
          let latestGroup = allGroups[0];
          let maxEpNum = -1;
          allGroups.forEach(g => {
            if (g.episodes) {
              g.episodes.forEach((ep: any) => {
                if (ep.number > maxEpNum) {
                  maxEpNum = ep.number;
                  latestGroup = g;
                }
              });
            }
          });
          setSelectedGroup(latestGroup);
        } else {
          setSelectedGroup(null);
        }
        setEpisodes(allEps.sort((a, b) => b.number - a.number));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [currentId, reloadKey]);

  const handlePlayEpisode = async (ep: any) => {
    try {
      setStreamUrl(null); // Reset
      setActiveEpData(ep);

      // Smoothly scroll the parent content area back to top
      setTimeout(() => {
        const container = document.getElementById("anime-detail-container");
        const scrollContainer = container?.closest(".overflow-y-auto");
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 50);

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

  const handleEpisodeEnded = () => {
    if (!activeEpData || episodes.length === 0) return;
    
    // Sort all episodes ascending to find the logical sequence
    const sortedAsc = [...episodes].sort((a, b) => a.number - b.number);
    
    // Find current index in ascending list
    const currentIndex = sortedAsc.findIndex(ep => ep.id === activeEpData.id);
    
    if (currentIndex !== -1 && currentIndex + 1 < sortedAsc.length) {
      const nextEp = sortedAsc[currentIndex + 1];
      handlePlayEpisode(nextEp);
    }
  };

  // Symmetrical Next/Prev episode pre-computation
  const sortedEpisodesAsc = [...episodes].sort((a, b) => a.number - b.number);
  const currentEpIndex = activeEpData ? sortedEpisodesAsc.findIndex(ep => ep.id === activeEpData.id) : -1;
  const prevEp = currentEpIndex > 0 ? sortedEpisodesAsc[currentEpIndex - 1] : null;
  const nextEp = (currentEpIndex !== -1 && currentEpIndex + 1 < sortedEpisodesAsc.length) ? sortedEpisodesAsc[currentEpIndex + 1] : null;

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

  const renderGroupSelector = () => {
    if (groups.length <= 1) return null;
    return (
      <div className="relative">
        {/* Toggle Button */}
        <button
          onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
          className={`flex items-center justify-between gap-3 min-w-[180px] bg-white/[0.03] border rounded-xl px-4 py-2.5 text-xs font-bold text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all duration-300 cursor-pointer shadow-lg
            ${isGroupDropdownOpen 
              ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.15)] text-white bg-white/[0.08]' 
              : 'border-white/5 hover:border-cyan-500/30'
            }`}
        >
          <span>{selectedGroup?.name || "Chọn nhóm tập"}</span>
          <ChevronDown 
            className={`w-4 h-4 text-cyan-400 transition-transform duration-300 
              ${isGroupDropdownOpen ? 'rotate-180' : ''}`} 
          />
        </button>

        {/* Backdrop for Light Dismiss */}
        {isGroupDropdownOpen && (
          <div 
            className="fixed inset-0 z-40 bg-transparent" 
            onClick={() => setIsGroupDropdownOpen(false)} 
          />
        )}

        {/* Dropdown Menu */}
        {isGroupDropdownOpen && (
          <div className="absolute right-0 top-full mt-2 z-50 min-w-[200px] bg-[#0c0c12]/95 border border-white/10 backdrop-blur-md rounded-2xl shadow-2xl py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
              {groups.map((g) => {
                const isSelected = selectedGroup?.name === g.name;
                return (
                  <button
                    key={g.name}
                    onClick={() => {
                      setSelectedGroup(g);
                      setIsGroupDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-xs font-bold transition-colors duration-200
                      ${isSelected 
                        ? 'text-cyan-400 bg-cyan-500/[0.08]' 
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    <span>{g.name}</span>
                    {isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderEpisodesGrid = () => {
    const displayedEps = selectedGroup?.episodes 
      ? [...selectedGroup.episodes].sort((a, b) => b.number - a.number)
      : episodes;

    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2">
        {displayedEps.map(ep => {
          const isActive = activeEpData?.id === ep.id;
          return (
            <button
              key={ep.id}
              onClick={() => handlePlayEpisode(ep)}
              className={`h-11 rounded-lg flex items-center justify-center font-black text-xs sm:text-sm border transition-all duration-300 relative group
                ${isActive 
                  ? 'bg-cyan-500 text-black border-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.35)]' 
                  : 'bg-white/[0.02] border-white/5 text-neutral-400 hover:text-white hover:bg-white/[0.08] hover:border-white/10'
                }`}
            >
              <span>{ep.number}</span>
              
              {/* Subtle top indicator for active state */}
              {isActive && (
                <span className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-0.5 bg-black rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div id="anime-detail-container" className="flex flex-col w-full relative z-10 animate-in fade-in zoom-in-95 duration-300">
      
      {/* Player Mode */}
      {activeEpData && streamUrl ? (
        <div className="w-full flex flex-col min-h-screen">
          <div className="w-full bg-black relative group">
            <button 
              onClick={() => { setActiveEpData(null); setStreamUrl(null); setActiveSubtitles([]); }}
              className="absolute top-6 right-6 z-50 w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="max-w-[1600px] mx-auto w-full aspect-video shadow-[0_30px_60px_rgba(0,0,0,0.8)] bg-black">
              <AnimePlayer 
                url={streamUrl} 
                episodeId={activeEpData.id}
                title={`Tập ${activeEpData.number} - ${detail.title}`} 
                subtitles={activeSubtitles}
                onEnded={handleEpisodeEnded}
              />
            </div>
          </div>
          
          <div className="w-full bg-[#0a0a0f] border-b border-white/5 shadow-lg relative z-10">
            <div className="max-w-[1600px] mx-auto w-full px-8 lg:px-12 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <img src={detail.poster} className="w-16 h-24 object-cover rounded-lg shadow-md border border-white/5 hidden sm:block" />
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white">{detail.title}</h1>
                  <p className="text-cyan-400 font-bold text-lg mt-1">Đang phát: Tập {activeEpData.number}</p>
                </div>
              </div>
              
              {/* Premium Symmetrical navigation buttons */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  disabled={!prevEp}
                  onClick={() => prevEp && handlePlayEpisode(prevEp)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all duration-300
                    ${prevEp
                      ? 'bg-white/[0.02] border-white/5 text-neutral-300 hover:text-white hover:bg-white/[0.08] hover:border-white/10 cursor-pointer shadow-md'
                      : 'border-white/5 text-neutral-600 bg-white/[0.01] cursor-not-allowed opacity-40'
                    }`}
                >
                  <ChevronLeft className="w-4 h-4 text-cyan-400" />
                  <span>Tập trước</span>
                </button>

                <button
                  disabled={!nextEp}
                  onClick={() => nextEp && handlePlayEpisode(nextEp)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all duration-300
                    ${nextEp
                      ? 'bg-cyan-500 text-black border-cyan-500 hover:bg-cyan-400 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] cursor-pointer'
                      : 'border-white/5 text-neutral-600 bg-white/[0.01] cursor-not-allowed opacity-40'
                    }`}
                >
                  <span>Tập tiếp</span>
                  <ChevronRight className="w-4 h-4 text-black" />
                </button>
              </div>
            </div>
          </div>
          
          <div className="max-w-[1600px] mx-auto w-full p-8 lg:p-12 flex-1">
             <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
               <h2 className="text-xl font-black text-white flex items-center gap-3">
                 <ListVideo className="w-5 h-5 text-cyan-400" /> Chọn tập khác
               </h2>
               {renderGroupSelector()}
             </div>
             {renderEpisodesGrid()}
          </div>
        </div>
      ) : (
        /* Detail Mode */
        <div className="w-full flex flex-col pb-12">
          {/* Back Navigation Bar */}
          <div className="flex items-center pt-4 mb-4 px-2">
            <button 
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.08] border border-white/5 hover:border-white/10 text-neutral-300 hover:text-white transition-all text-xs font-black uppercase tracking-wider cursor-pointer group shadow-md"
            >
              <ChevronLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Quay lại</span>
            </button>
          </div>

          {/* Hero Section */}
          <div className="relative w-full min-h-[50vh] flex flex-col justify-end mb-4">
            <div className="absolute inset-0 rounded-3xl overflow-hidden">
              <img src={detail.cover || detail.poster} alt="" className="w-full h-full object-cover opacity-25 select-none pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#030305] via-[#030305]/65 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#030305] via-[#030305]/50 to-transparent" />
            </div>
            
            <div className="relative z-20 px-8 lg:px-12 py-8 flex gap-8 lg:gap-10 w-full">
              <div className="shrink-0 hidden md:block">
                 <img src={detail.poster} alt="" className="w-64 h-96 object-cover rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.65)] border border-white/10 select-none pointer-events-none" />
              </div>
              
              <div className="flex flex-col justify-end pb-4">
                <div className="flex gap-2 mb-4 flex-wrap">
                  {detail.genres && detail.genres.map((g: any) => (
                    <span key={g.id} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-neutral-300 font-bold uppercase tracking-wider">
                      {g.name}
                    </span>
                  ))}
                  {detail.year && (
                    <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-bold uppercase tracking-wider">
                      {detail.year}
                    </span>
                  )}
                  {detail.score && (
                    <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold uppercase tracking-wider">
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
                      onClick={() => handlePlayEpisode(episodes[episodes.length - 1])}
                      className="flex items-center gap-3 bg-cyan-500 hover:bg-cyan-400 text-black px-8 py-4 rounded-2xl font-black transition-all shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.5)] hover:-translate-y-1"
                    >
                      <Play className="w-6 h-6 fill-black" />
                      XEM TẬP {episodes[episodes.length - 1]?.number || 1}
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <h2 className="text-2xl font-black text-white flex items-center gap-3">
                <ListVideo className="w-6 h-6 text-cyan-400" /> 
                Danh sách tập phim ({episodes.length})
              </h2>
              {renderGroupSelector()}
            </div>
            {episodes.length === 0 ? (
              <p className="text-neutral-500 italic">Chưa có tập phim nào.</p>
            ) : (
              renderEpisodesGrid()
            )}
          </div>

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
        </div>
      )}
    </div>
  );
}
