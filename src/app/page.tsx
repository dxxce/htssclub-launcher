"use client";

import {
  Settings, Search, Bell, Minus, Square, X,
  Play, Plus, Film, Home, Library, Compass, UserCircle, LogOut, TrendingUp, Sparkles, ChevronLeft, RotateCw, Gamepad2, MessageSquare
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import ValorantHub from "./components/ValorantHub";
import AnimeHub from "./components/AnimeHub";
import DiscordHub from "./components/DiscordHub";
import ConfirmModal, { ConfirmOptions } from "./components/ConfirmModal";

const NAV_ITEMS = [
  { id: "home", label: "Trang chủ", icon: Home },
  { id: "anime", label: "Anime", icon: Film },
  { id: "valorant", label: "Valorant", icon: Gamepad2 },
  { id: "discord", label: "Discord", icon: MessageSquare },
];

export default function HomePage() {
  const [activeNav, setActiveNav] = useState("home");
  const [activeTab, setActiveTab] = useState("Thịnh hành");
  const [reloadKey, setReloadKey] = useState(0);
  const [backCallback, setBackCallback] = useState<(() => void) | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmOptions | null>(null);

  const [updateConfig, setUpdateConfig] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
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
    let unlisten: any;
    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<number>("update-progress", (event) => {
        setUpdateProgress(event.payload);
      });
    };
    setupListener();

    return () => {
      if (unlisten) unlisten.then((f: any) => f());
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

  const registerBack = useCallback((cb: (() => void) | null) => {
    setBackCallback(() => cb);
  }, []);

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
              Launcher v0.1.0
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
                onClick={() => { if (backCallback) backCallback(); }}
                disabled={!backCallback}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${backCallback ? 'text-neutral-200 hover:bg-white/10 hover:text-white' : 'text-neutral-600 opacity-55 cursor-not-allowed'}`}
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
        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar relative z-10 flex flex-col min-w-0">
          {activeNav === "valorant" && <ValorantHub key={reloadKey} />}
          {activeNav === "anime" && <AnimeHub key={reloadKey} onRegisterBack={registerBack} />}
          {activeNav === "discord" && <DiscordHub key={reloadKey} />}
          
          {activeNav === "home" && (
            <div className="flex flex-col items-center justify-center w-full h-full min-h-[400px] gap-4">
              <Sparkles className="w-12 h-12 text-cyan-500 mb-2" />
              <h2 className="text-2xl font-black text-white">Chào mừng đến với HTSS.CLUB</h2>
              <p className="text-neutral-400">Vui lòng chọn một chức năng từ thanh công cụ bên trái.</p>
            </div>
          )}
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
