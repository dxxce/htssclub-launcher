"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShoppingCart, User, History, Target, ArrowLeft, Gamepad2, ChevronRight, Loader2 } from "lucide-react";
import ValorantStore from "./ValorantStore";
import ValorantStats from "./ValorantStats";
import ValorantHistory from "./ValorantHistory";
import ValorantBattlepass from "./ValorantBattlepass";
import ValorantAccounts from "./ValorantAccounts";
import { useValorantStore } from "../store/useValorantStore";

export default function ValorantHub() {
  const [currentView, setCurrentView] = useState<"hub" | "store" | "stats" | "history" | "battlepass" | "accounts">("hub");
  
  // Connect to Zustand Global Store
  const {
    savedAccounts,
    activeAccountName,
    loadAccounts
  } = useValorantStore();

  const [loading, setLoading] = useState(false);
  const [riotClientOpen, setRiotClientOpen] = useState<boolean | null>(null);

  useEffect(() => {
    loadAccounts();
  }, [currentView, loadAccounts]);

  if (currentView !== "hub") {
    return (
      <div className="flex flex-col h-full w-full animate-fadeIn">
        <div className="pt-6 -mb-2">
          <button 
            onClick={() => setCurrentView("hub")}
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors w-fit group px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 z-50 relative cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="font-semibold text-sm">Quay lại Hub</span>
          </button>
        </div>
        {currentView === "store" && <ValorantStore />}
        {currentView === "stats" && <ValorantStats />}
        {currentView === "history" && <ValorantHistory />}
        {currentView === "battlepass" && <ValorantBattlepass />}
        {currentView === "accounts" && <ValorantAccounts />}
      </div>
    );
  }

  const features = [
    {
      id: "accounts",
      title: "Quản Lý Tài Khoản",
      description: savedAccounts.length > 0 
        ? `Đang lưu trữ an toàn ${savedAccounts.length} tài khoản Valorant trên máy. Cho phép khôi phục nhanh session và đăng nhập Riot Client tự động.`
        : "Chưa lưu tài khoản nào. Hãy click để kết nối và tự động lưu phiên làm việc từ Riot Client của bạn.",
      icon: User,
      color: "from-indigo-500/10 to-indigo-900/10",
      borderColor: "group-hover:border-indigo-500/30",
      iconColor: "text-indigo-400",
      badge: savedAccounts.length > 0 ? `${savedAccounts.length} TÀI KHOẢN` : "TRỐNG",
      badgeColor: savedAccounts.length > 0 
        ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_8px_rgba(99,102,241,0.15)] font-black" 
        : "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
      btnText: "Quản lý & Chuyển đổi nhanh",
      btnBg: "bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/20 hover:border-indigo-500/30",
      bgImage: "https://media.valorant-api.com/playercards/8edf22c5-4489-ab41-769a-07adb4c454d6/wideart.png"
    },
    {
      id: "store",
      title: "Cửa Hàng Của Bạn",
      description: "Kiểm tra Daily Store, Night Market và các Bundles mới nhất một cách nhanh chóng.",
      icon: ShoppingCart,
      color: "from-red-500/10 to-red-900/10",
      borderColor: "group-hover:border-red-500/30",
      iconColor: "text-red-400",
      badge: "SẴN SÀNG",
      badgeColor: "bg-red-500/10 text-red-400 border-red-500/20",
      btnText: "Truy cập Cửa hàng",
      btnBg: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 hover:border-red-500/30",
      bgImage: "https://media.valorant-api.com/playercards/986d8908-4f47-2e7d-028a-30a3b3e3ddf7/wideart.png"
    },
    {
      id: "stats",
      title: "Hồ Sơ & Thống Kê",
      description: "Theo dõi mức rank, xếp hạng hiện tại và tiến trình leo hạng của tài khoản.",
      icon: User,
      color: "from-blue-500/10 to-blue-900/10",
      borderColor: "group-hover:border-blue-500/30",
      iconColor: "text-blue-400",
      badge: "SẴN SÀNG",
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      btnText: "Xem Hồ sơ",
      btnBg: "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/20 hover:border-blue-500/30",
      bgImage: "https://media.valorant-api.com/playercards/1711d20d-4b1c-c64a-14be-d4ae58a457c6/wideart.png"
    },
    {
      id: "history",
      title: "Lịch Sử Đấu",
      description: "Xem lại chi tiết các trận đấu gần nhất, điểm số và đặc vụ đã sử dụng.",
      icon: History,
      color: "from-purple-500/10 to-purple-900/10",
      borderColor: "group-hover:border-purple-500/30",
      iconColor: "text-purple-400",
      badge: "SẴN SÀNG",
      badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      btnText: "Xem Lịch sử",
      btnBg: "bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20 hover:border-purple-500/30",
      bgImage: "https://media.valorant-api.com/playercards/c8b2f5fd-4331-b172-f3b7-c8a26f356a1f/wideart.png"
    },
    {
      id: "battlepass",
      title: "Nhiệm Vụ & Battlepass",
      description: "Kiểm tra tiến trình nhiệm vụ hằng ngày/tuần và các phần thưởng đã mở khóa.",
      icon: Target,
      color: "from-emerald-500/10 to-emerald-900/10",
      borderColor: "group-hover:border-emerald-500/30",
      iconColor: "text-emerald-400",
      badge: "SẴN SÀNG",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      btnText: "Kiểm tra Nhiệm vụ",
      btnBg: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/30",
      bgImage: "https://media.valorant-api.com/playercards/eef542d2-4724-bc47-f53f-239f8c9c2623/wideart.png"
    }
  ] as const;

  return (
    <div className="flex-1 flex flex-col pt-6 h-full pb-10 w-full select-none">
      {/* Header */}
      <div className="flex items-center gap-4 select-none mb-6">
        <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.15)]">
          <Gamepad2 className="w-7 h-7 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Valorant Hub</h1>
          <p className="text-neutral-500 text-sm">Kiểm tra cửa hàng, theo dõi chỉ số và phân tích trận đấu của bạn</p>
        </div>

        {/* Connected Account Status Badge Shortcut */}
        {activeAccountName ? (
          <div 
            onClick={() => setCurrentView("accounts")}
            className="ml-auto flex items-center gap-2.5 px-3.5 py-1.5 bg-white/[0.03] hover:bg-white/5 border border-white/5 hover:border-white/10 rounded-xl shadow-lg cursor-pointer transition-all active:scale-95 group"
            title="Quản lý tài khoản"
          >
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>
            <span className="text-xs font-bold text-white tracking-wide group-hover:text-emerald-400 transition-colors">{activeAccountName}</span>
          </div>
        ) : (
          <div 
            onClick={() => setCurrentView("accounts")}
            className="ml-auto flex items-center gap-2.5 px-3.5 py-1.5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 rounded-xl shadow-lg cursor-pointer transition-all active:scale-95 group"
            title="Quản lý tài khoản"
          >
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            </div>
            <span className="text-xs font-bold text-red-400 tracking-wide group-hover:text-red-300 transition-colors">Riot Client Chưa Mở</span>
          </div>
        )}
      </div>

      {/* Grid Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {features.map((item) => {
          const isAvailable = true;
          return (
            <div 
              key={item.id}
              onClick={() => isAvailable && setCurrentView(item.id as any)}
              className={`group relative rounded-2xl overflow-hidden border border-white/5 transition-all duration-300 ${
                isAvailable ? 'cursor-pointer hover:-translate-y-1 shadow-lg hover:shadow-2xl' : 'cursor-not-allowed opacity-75'
              } hover:border-white/15 bg-white/[0.03] p-5 flex flex-col justify-between min-h-[220px] ${
                item.id === "accounts" ? "md:col-span-2" : ""
              }`}
            >
              {/* Background Artwork with Gradient Overlay */}
              <div className="absolute inset-0 z-0">
                <img 
                  src={item.bgImage} 
                  alt="" 
                  className="w-full h-full object-cover opacity-10 group-hover:opacity-20 transition-all duration-500 mix-blend-luminosity group-hover:mix-blend-normal group-hover:scale-105" 
                />
                <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-60`} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#030305] via-[#030305]/95 to-[#030305]/20" />
              </div>

              {/* Top Row: Icon and Badge */}
              <div className="relative z-10 flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center backdrop-blur-md shadow-inner group-hover:scale-105 transition-transform duration-300">
                  <item.icon className={`w-5 h-5 ${item.iconColor} drop-shadow-md`} />
                </div>
                {item.badge && (
                  <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border tracking-widest uppercase shadow-sm select-none ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Title & Description */}
              <div className="relative z-10 mt-6 select-none flex-1 flex flex-col justify-center">
                <h3 className="text-base font-bold text-white tracking-tight mb-1 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-neutral-300 transition-all">
                  {item.title}
                </h3>
                <p className="text-xs text-neutral-400 font-medium leading-relaxed group-hover:text-neutral-300 transition-colors">
                  {item.description}
                </p>
              </div>

              {/* Action Button at the Bottom */}
              <div className="relative z-10 mt-4 select-none">
                <button className={`flex items-center justify-center gap-1.5 w-full py-2 rounded-xl font-semibold text-xs transition-all duration-200 cursor-pointer ${item.btnBg}`}>
                  {item.btnText}
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
