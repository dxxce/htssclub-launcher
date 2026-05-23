"use client";

import {
  Settings, Search, Bell, Minus, Square, X,
  Play, Plus, Film, Home, Library, Compass, UserCircle, LogOut, TrendingUp, Sparkles, ChevronLeft, RotateCw, Gamepad2, MessageSquare, Languages
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import ValorantHub from "./components/ValorantHub";
import AnimeHub from "./components/AnimeHub";
import ShortReelsHub from "./components/ShortReelsHub";
import DiscordHub from "./components/DiscordHub";
import TranslationHub from "./components/TranslationHub";
import CombinedDeals from "./components/CombinedDeals";
import ConfirmModal, { ConfirmOptions } from "./components/ConfirmModal";

const NAV_ITEMS = [
  { id: "home", label: "Trang chủ", icon: Home },
  { id: "anime", label: "Anime", icon: Film },
  { id: "short_reels", label: "Phim Ngắn", icon: Compass },
  { id: "valorant", label: "Valorant", icon: Gamepad2 },
  { id: "deals", label: "Ưu đãi Game", icon: Sparkles },
  { id: "discord", label: "Discord", icon: MessageSquare },
  { id: "translation", label: "Dịch & Giọng nói", icon: Languages },
];

const NEWS_ITEMS = [
  {
    id: 1,
    category: "Cập nhật",
    date: "Hôm nay, 14:20",
    title: "HTSS Launcher bổ sung tính năng dịch hội thoại AI đa ngôn ngữ",
    summary: "Trải nghiệm tính năng dịch thời gian thực tích hợp trực tiếp vào Launcher giúp giao tiếp không rào cản.",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: 2,
    category: "Sự kiện",
    date: "18 tháng 5",
    title: "Giải đấu Valorant HTSS Championship mùa hè chính thức mở đăng ký",
    summary: "Đăng ký tham gia ngay cùng đội tuyển của bạn để giành những phần quà giá trị cùng kỷ niệm chương.",
    image: "https://images.unsplash.com/photo-1560253023-3ec5d502959f?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: 3,
    category: "Game News",
    date: "17 tháng 5",
    title: "Steam Sale hè 2026: Danh sách các tựa game AAA giảm giá sốc nhất",
    summary: "Điểm qua những tựa game bom tấn đang có mức giá cực hời trên cửa hàng Steam hiện nay.",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: 4,
    category: "Hệ thống",
    date: "15 tháng 5",
    title: "Nâng cấp máy chủ Anime Hub - xem phim chất lượng 4K siêu tốc",
    summary: "Nâng cấp băng thông máy chủ chuyên dụng giúp cải thiện tốc độ tải video anime lên đến 200%.",
    image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=300&q=80",
  }
];

export default function HomePage() {
  const [activeNav, setActiveNav] = useState("home");
  const [activeTab, setActiveTab] = useState("Thịnh hành");
  const [reloadKey, setReloadKey] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState<string[]>(["home"]);
  const [backCallbacks, setBackCallbacks] = useState<Record<string, (() => void) | null>>({});
  const [confirmConfig, setConfirmConfig] = useState<ConfirmOptions | null>(null);


  const [updateConfig, setUpdateConfig] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [appVersion, setAppVersion] = useState("0.6.9");

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
      return;
    }
    // Fetch version dynamically on mount
    const fetchVersion = async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const ver = await getVersion();
        setAppVersion(ver);
      } catch (err) {
        console.error("Lỗi lấy phiên bản:", err);
      }
    };
    fetchVersion();

    // Check for updates on mount
    const checkUpdates = async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        const res = await invoke<any>("check_for_updates");
        if (res && res.has_update) {
          setUpdateConfig(res);
          setShowUpdateModal(true);
        }
      } catch (err) {
        console.error("Lỗi kiểm tra cập nhật:", err);
      }
    };
    checkUpdates();

    // Listen to update progress events
    let unlistenFn: (() => void) | null = null;
    let isCleanedUp = false;

    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const cleanup = await listen<number>("update-progress", (event) => {
        setUpdateProgress(event.payload);
      });
      if (isCleanedUp) {
        cleanup();
      } else {
        unlistenFn = cleanup;
      }
    };
    setupListener();

    return () => {
      isCleanedUp = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

    useEffect(() => {
    window.confirmCustom = (options) => {
      setConfirmConfig(options);
    };
    return () => {
      delete window.confirmCustom;
    };
  }, []);

  useEffect(() => {
    if (!visitedTabs.includes(activeNav)) {
      setVisitedTabs(prev => [...prev, activeNav]);
    }
  }, [activeNav, visitedTabs]);

  const registerBack = useCallback((cb: (() => void) | null) => {
    setBackCallbacks(prev => ({
      ...prev,
      [activeNav]: cb
    }));
  }, [activeNav]);

  const activeNavLabel = NAV_ITEMS.find(n => n.id === activeNav)?.label || "Trang chủ";

  const handleReload = () => {
    setReloadKey(prev => prev + 1);
  };

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const isFullscreen = await win.isFullscreen();
    win.setFullscreen(!isFullscreen);
  };

  const handleClose = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().close();
  };

  return (
    <div className="w-full h-full relative z-10 flex text-white overflow-hidden bg-[#030305]">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-cyan-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Left Navbar Menu */}
      <div className="w-[260px] h-full bg-[#070709]/80 backdrop-blur-2xl flex flex-col relative z-50 border-r border-white/5 flex-shrink-0 pt-6 select-none">
        {/* Sidebar Drag Region */}
        <div data-tauri-drag-region="true" className="absolute top-0 left-0 w-full h-10 cursor-move" />

        {/* Logo */}
        <div className="flex items-center gap-3 px-6 mb-8 mt-2 relative z-10 group/logo select-none">
          {/* Logo container */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            <img 
              src="/logo.svg" 
              alt="Logo" 
              className="w-7 h-7 object-contain relative z-10 transition-transform duration-700 ease-out group-hover/logo:rotate-[180deg] group-hover/logo:scale-110" 
            />
          </div>
          
          <div className="flex flex-col justify-center">
            <div className="text-[18px] font-black tracking-tight leading-none text-white flex items-center">
              <span>htss</span>
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_6px_rgba(34,211,238,0.3)]">.club</span>
            </div>
            <div className="text-[8px] font-bold text-neutral-500 tracking-[0.22em] uppercase mt-1 leading-none">
              Launcher v{appVersion}
            </div>
          </div>
        </div>
        
        {/* Navigation Area */}
        <div className="flex flex-col px-4 gap-1.5 flex-1">
          <div className="text-[10px] font-bold text-neutral-500 tracking-[0.2em] uppercase mb-2 ml-3">Menu</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg font-medium transition-all duration-200 group ${isActive
                    ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                    : "text-neutral-400 hover:text-white hover:bg-white/5"
                  }`}
              >
                <Icon className={`w-[18px] h-[18px] transition-colors duration-200 ${isActive ? "text-white" : "text-neutral-500 group-hover:text-neutral-300"}`} />
                <span className="text-[13px] tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* User Profile Area */}
        <div className="p-4 border-t border-white/5 bg-[#030305]/50 mt-auto">
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors border border-transparent hover:border-white/5 group">
            <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0 border border-white/10">
              <UserCircle className="w-5 h-5 text-neutral-400 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white truncate group-hover:text-cyan-400 transition-colors">DeeCee</div>
              <div className="text-[11px] text-neutral-500 truncate">Premium Member</div>
            </div>
            <Settings className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors mr-1" />
          </div>

          <button className="flex items-center gap-3 w-full px-4 py-2.5 mt-2 rounded-xl text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors font-medium text-sm">
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 h-full flex flex-col pt-10 relative z-10 min-w-0">
        
        {/* Draggable Header Bar */}
        <div data-tauri-drag-region="true" className="absolute top-0 left-0 w-full h-10 z-50 flex items-center justify-between cursor-move select-none">
          
          {/* Top Left Action Buttons */}
          <div data-tauri-drag-region="false" className="flex items-center h-full px-6 gap-4 cursor-default">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => { 
                  const cb = backCallbacks[activeNav];
                  if (cb) cb(); 
                }}
                disabled={!backCallbacks[activeNav]}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${backCallbacks[activeNav] ? 'text-neutral-200 hover:bg-white/10 hover:text-white' : 'text-neutral-600 opacity-55 cursor-not-allowed'}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={handleReload}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-all text-neutral-400 hover:text-white cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="w-[1px] h-4 bg-white/10" />
            <div className="text-sm font-semibold text-neutral-300 tracking-wide">
              {activeNavLabel}
            </div>
          </div>

          {/* Top Right Action Buttons */}
          <div data-tauri-drag-region="false" className="flex items-center h-full cursor-default">
            <div className="flex items-center gap-1 px-4 border-r border-white/5 h-5">
              <button className="relative w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-all text-neutral-400 hover:text-white cursor-pointer">
                <Search className="w-4 h-4" />
              </button>
              <div className="relative">
                <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] z-10" />
                <button className="relative w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-all text-neutral-400 hover:text-white cursor-pointer">
                  <Bell className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Window Controls */}
            <div className="flex items-center h-full">
              <button onClick={handleMinimize} className="h-full px-3.5 hover:bg-white/10 transition-colors group text-neutral-400 hover:text-white cursor-pointer">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleMaximize} className="h-full px-3.5 hover:bg-white/10 transition-colors group text-neutral-400 hover:text-white cursor-pointer">
                <Square className="w-3 h-3" />
              </button>
              <button onClick={handleClose} className="h-full px-3.5 hover:bg-red-500 hover:text-white transition-colors group text-neutral-400 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        {/* Scrollable Content */}
        <div className={`flex-1 px-6 pb-6 custom-scrollbar relative z-10 flex flex-col min-w-0 ${activeNav === "deals" ? "overflow-hidden" : "overflow-y-auto"}`}>
          {visitedTabs.includes("valorant") && (
            <div className={activeNav === "valorant" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
              <ValorantHub reloadKey={reloadKey} />
            </div>
          )}
          {visitedTabs.includes("anime") && (
            <div className={activeNav === "anime" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
              <AnimeHub reloadKey={reloadKey} onRegisterBack={registerBack} />
            </div>
          )}
          {visitedTabs.includes("short_reels") && (
            <div className={activeNav === "short_reels" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
              <ShortReelsHub reloadKey={reloadKey} onRegisterBack={registerBack} />
            </div>
          )}
          {visitedTabs.includes("discord") && (
            <div className={activeNav === "discord" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
              <DiscordHub reloadKey={reloadKey} />
            </div>
          )}
          {visitedTabs.includes("translation") && (
            <div className={activeNav === "translation" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
              <TranslationHub reloadKey={reloadKey} />
            </div>
          )}
          {visitedTabs.includes("deals") && (
            <div className={activeNav === "deals" ? "flex flex-col flex-1 min-h-0 min-w-0" : "hidden"}>
              <CombinedDeals />
            </div>
          )}
          
          <div className={activeNav === "home" ? "flex flex-col flex-1 min-w-0 gap-6 text-neutral-200" : "hidden"}>
            {/* Premium Header Banner */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[#0c0c12]/70 to-[#050508]/40 border border-white/5 backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-2xl">
              {/* Glow effects */}
              <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-20%] right-[-10%] w-[40%] h-[70%] bg-cyan-600/10 blur-[80px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[60%] bg-violet-600/10 blur-[70px] rounded-full" />
              </div>

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                    </div>
                    <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">HTSS CLUB LAUNCHER</h1>
                  </div>
                  <p className="text-xs md:text-sm text-neutral-400 mt-2 max-w-xl leading-relaxed">
                    Chào mừng bạn quay trở lại! Trải nghiệm giải trí đỉnh cao với kho phim Anime, Phim ngắn, dịch giọng nói AI và theo dõi các ưu đãi game bản quyền mới nhất mỗi ngày.
                  </p>
                </div>

                {/* Quick actions grid */}
                <div className="flex flex-wrap gap-2">
                  {NAV_ITEMS.filter(item => item.id !== "home").map((item) => {
                    const IconComponent = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveNav(item.id)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-cyan-500/30 rounded-xl text-[11px] font-bold text-neutral-300 hover:text-cyan-400 transition-all duration-300 cursor-pointer hover:shadow-[0_0_15px_rgba(6,182,212,0.05)]"
                      >
                        <IconComponent className="w-3.5 h-3.5" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tin tức & Cập nhật Section */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Tin tức & Cập nhật</h2>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Tin mới nhất về game và hệ thống HTSS.CLUB</p>
                </div>
              </div>

              {/* News Feed - 2 Column Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {NEWS_ITEMS.map((news) => (
                  <div 
                    key={news.id}
                    className="group bg-[#0e0e15]/40 hover:bg-[#12121e]/85 border border-white/5 hover:border-cyan-500/25 rounded-2xl p-4 flex gap-4 transition-all duration-300 backdrop-blur-md cursor-pointer"
                  >
                    <div className="relative w-24 h-16 sm:w-28 sm:h-20 overflow-hidden rounded-xl bg-neutral-950 border border-white/5 shrink-0">
                      <img 
                        src={news.image} 
                        alt="" 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                    </div>
                    <div className="flex flex-col justify-between min-w-0 flex-1">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                            {news.category}
                          </span>
                          <span className="text-[9px] text-neutral-500">{news.date}</span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-neutral-100 group-hover:text-cyan-400 transition-colors mt-2 line-clamp-2">
                          {news.title}
                        </h4>
                      </div>
                      <p className="text-[10px] text-neutral-400 line-clamp-1 mt-1">
                        {news.summary}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>


          </div>
        </div>
        {confirmConfig && (
          <ConfirmModal 
            config={confirmConfig} 
            onClose={() => setConfirmConfig(null)} 
          />
        )}

        {/* Premium Auto-Updater Glassmorphic Modal */}
        {showUpdateModal && updateConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">
            <div className="w-[450px] bg-gradient-to-b from-[#0e0e12]/95 to-[#050508]/98 border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden select-none">
              {/* Ambient background glow */}
              <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-cyan-500/10 blur-[80px] rounded-full pointer-events-none animate-pulse" />
              <div className="absolute bottom-[-20%] right-[-20%] w-[50%] h-[50%] bg-blue-600/10 blur-[80px] rounded-full pointer-events-none animate-pulse" />

              <div className="flex flex-col items-center text-center relative z-10">
                {/* Sparkles Icon */}
                <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(6,182,212,0.15)] animate-bounce">
                  <Sparkles className="w-6 h-6 text-cyan-400" />
                </div>

                <h2 className="text-xl font-black text-white tracking-tight mb-1">
                  Có Bản Cập Nhật Mới!
                </h2>
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 bg-white/5 border border-white/5 px-2.5 py-1 rounded-full mb-4">
                  <span>{updateConfig.current_version}</span>
                  <span className="text-cyan-400">➔</span>
                  <span className="text-cyan-300 font-bold">{updateConfig.latest_version}</span>
                </div>

                {/* Release Notes */}
                {updateConfig.notes && (
                  <div className="w-full bg-[#030305]/60 border border-white/5 rounded-xl p-3.5 text-left mb-5 max-h-[120px] overflow-y-auto custom-scrollbar">
                    <div className="text-[10px] font-bold text-neutral-500 tracking-wider uppercase mb-1.5">
                      Nhật ký cập nhật
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
                      {updateConfig.notes}
                    </p>
                  </div>
                )}

                {isUpdating ? (
                  /* Downloading Progress State */
                  <div className="w-full space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-cyan-400 font-bold animate-pulse">
                        Đang tải bản cập nhật...
                      </span>
                      <span className="text-neutral-400 font-bold">{updateProgress}%</span>
                    </div>
                    
                    {/* Progress Bar Container */}
                    <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 transition-all duration-300 rounded-full relative"
                        style={{ width: `${updateProgress}%` }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-[shimmer_1.5s_infinite]" />
                      </div>
                    </div>
                    <div className="text-[10px] text-neutral-500 text-center italic">
                      Ứng dụng sẽ tự động khởi động lại sau khi tải xong.
                    </div>
                  </div>
                ) : (
                  /* Update Choice State */
                  <div className="flex items-center gap-3 w-full mt-2">
                    <button
                      onClick={() => setShowUpdateModal(false)}
                      className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-neutral-300 hover:text-white rounded-xl text-xs font-bold transition-all duration-200"
                    >
                      Bỏ qua
                    </button>
                    <button
                      onClick={async () => {
                        setIsUpdating(true);
                        const { invoke } = await import('@tauri-apps/api/core');
                        try {
                          await invoke("download_and_install_update", { url: updateConfig.url });
                        } catch (err) {
                          console.error("Lỗi cập nhật:", err);
                          setIsUpdating(false);
                          alert("Không thể tải bản cập nhật: " + err);
                        }
                      }}
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white rounded-xl text-xs font-bold transition-all duration-300 shadow-[0_4px_15px_rgba(6,182,212,0.25)] border border-cyan-400/20 active:scale-95 animate-pulse"
                    >
                      Cập nhật ngay
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
