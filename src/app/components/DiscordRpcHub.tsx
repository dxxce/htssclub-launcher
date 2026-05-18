"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle, XCircle, AlertCircle, Loader2,
  Power, Puzzle, RefreshCw, Terminal, Shield, Zap, Settings2,
  ChevronRight, Info, ExternalLink, Activity, Clock, Link, Image as ImageIcon, Eye, Trash2, Users
} from "lucide-react";

interface LogLine {
  type: "info" | "success" | "error" | "warn";
  msg: string;
}

export default function DiscordRpcHub() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [equicordInstalled, setEquicordInstalled] = useState<boolean | null>(null);
  const [isCheckingInstall, setIsCheckingInstall] = useState(true);

  // Custom RPC States
  const [rpcMode, setRpcMode] = useState<"direct" | "equicord">("direct");
  const [rpcAppName, setRpcAppName] = useState("htss.club");
  const [rpcClientId, setRpcClientId] = useState("1495523138816053459");
  const [rpcDetails, setRpcDetails] = useState("Đang phát triển Launcher");
  const [rpcState, setRpcState] = useState("HTSS Club v0.6.9");
  const [rpcLargeImg, setRpcLargeImg] = useState("logo");
  const [rpcLargeTxt, setRpcLargeTxt] = useState("HTSS.CLUB");
  const [rpcSmallImg, setRpcSmallImg] = useState("check");
  const [rpcSmallTxt, setRpcSmallTxt] = useState("Verified Developer");
  const [rpcBtn1Label, setRpcBtn1Label] = useState("Tải Launcher");
  const [rpcBtn1Url, setRpcBtn1Url] = useState("https://htss.club");
  const [rpcBtn2Label, setRpcBtn2Label] = useState("");
  const [rpcBtn2Url, setRpcBtn2Url] = useState("");
  const [rpcShowTime, setRpcShowTime] = useState(true);
  const [rpcPartySize, setRpcPartySize] = useState(1);
  const [rpcPartyMax, setRpcPartyMax] = useState(1);
  
  const [rpcActive, setRpcActive] = useState(false);
  const [rpcLoading, setRpcLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // States to resolve Discord application info directly from Discord's REST API
  const [isResolvingApp, setIsResolvingApp] = useState(false);
  const [resolvedAppIcon, setResolvedAppIcon] = useState<string | null>(null);
  const [resolvedAppName, setResolvedAppName] = useState<string | null>(null);

  const handleResolveAppInfo = async () => {
    if (!rpcClientId.trim()) {
      addLog("warn", "Vui lòng nhập Client ID trước khi kiểm tra!");
      return;
    }
    setIsResolvingApp(true);
    addLog("info", `Đang kết nối tới API Discord để truy vấn thông tin cho Client ID: ${rpcClientId}...`);
    try {
      const res = await fetch(`https://discord.com/api/v9/oauth2/applications/${rpcClientId.trim()}/rpc`);
      if (res.ok) {
        const data = await res.json();
        setResolvedAppName(data.name);
        if (data.name) {
          setRpcAppName(data.name);
        }
        if (data.icon) {
          const iconUrl = `https://cdn.discordapp.com/app-icons/${rpcClientId.trim()}/${data.icon}.png`;
          setResolvedAppIcon(iconUrl);
          addLog("success", `Truy vấn thành công! Tên ứng dụng trên Discord: "${data.name}"`);
        } else {
          setResolvedAppIcon(null);
          addLog("success", `Truy vấn thành công! Tên ứng dụng trên Discord: "${data.name}" (Ứng dụng không có logo)`);
        }
      } else {
        addLog("error", `Không tìm thấy ứng dụng tương ứng với Client ID này trên Discord. Mã lỗi: ${res.status}`);
        setResolvedAppName(null);
        setResolvedAppIcon(null);
      }
    } catch (e) {
      addLog("error", `Lỗi kết nối tới API Discord: ${e}`);
      setResolvedAppName(null);
      setResolvedAppIcon(null);
    } finally {
      setIsResolvingApp(false);
    }
  };

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const ver = await getVersion();
        setRpcState(`HTSS Club v${ver}`);
      } catch (err) {
        console.error("Lỗi lấy phiên bản RPC:", err);
      }
    };
    fetchVersion();
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (rpcActive && rpcShowTime) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [rpcActive, rpcShowTime]);

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const hrs = Math.floor(mins / 60);
    const displayMins = mins % 60;
    const displaySecs = sec % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${displayMins.toString().padStart(2, '0')}:${displaySecs.toString().padStart(2, '0')} đã trôi qua`;
    }
    return `${displayMins.toString().padStart(2, '0')}:${displaySecs.toString().padStart(2, '0')} đã trôi qua`;
  };

  const addLog = (type: LogLine["type"], msg: string) => {
    setLogs(prev => [...prev.slice(-49), { type, msg }]);
  };

  const loadEquicordRpcConfig = async () => {
    try {
      const resp: { enabled: boolean; config: any } = await invoke("get_equicord_custom_rpc");
      if (resp && resp.config) {
        const cfg = resp.config;
        setRpcClientId(cfg.client_id || "1495523138816053459");
        if (cfg.app_name) setRpcAppName(cfg.app_name);
        setRpcDetails(cfg.details || "");
        setRpcState(cfg.state || "");
        setRpcLargeImg(cfg.large_image || "");
        setRpcLargeTxt(cfg.large_text || "");
        setRpcSmallImg(cfg.small_image || "");
        setRpcSmallTxt(cfg.small_text || "");
        setRpcBtn1Label(cfg.button_1_label || "");
        setRpcBtn1Url(cfg.button_1_url || "");
        setRpcBtn2Label(cfg.button_2_label || "");
        setRpcBtn2Url(cfg.button_2_url || "");
        setRpcShowTime(cfg.show_timestamp ?? true);
        setRpcPartySize(cfg.party_size ?? 1);
        setRpcPartyMax(cfg.party_max ?? 1);
        
        if (resp.enabled) {
          setRpcActive(true);
          setRpcMode("equicord");
          addLog("info", "Đã nạp và kích hoạt CustomRPC từ cấu hình Equicord!");
          return true;
        }
        addLog("info", "Đã tải cấu hình CustomRPC hiện tại từ Equicord!");
      }
      return false;
    } catch (e) {
      addLog("error", `Không thể tải cấu hình từ Equicord: ${e}`);
      return false;
    }
  };

  const loadDirectRpcConfig = async () => {
    try {
      const resp: { enabled: boolean; config: any } = await invoke("get_direct_rpc_config");
      if (resp && resp.config) {
        const cfg = resp.config;
        setRpcClientId(cfg.client_id || "1495523138816053459");
        setRpcDetails(cfg.details || "");
        setRpcState(cfg.state || "");
        setRpcLargeImg(cfg.large_image || "");
        setRpcLargeTxt(cfg.large_text || "");
        setRpcSmallImg(cfg.small_image || "");
        setRpcSmallTxt(cfg.small_text || "");
        setRpcBtn1Label(cfg.button_1_label || "");
        setRpcBtn1Url(cfg.button_1_url || "");
        setRpcBtn2Label(cfg.button_2_label || "");
        setRpcBtn2Url(cfg.button_2_url || "");
        setRpcShowTime(cfg.show_timestamp ?? true);
        setRpcPartySize(cfg.party_size ?? 1);
        setRpcPartyMax(cfg.party_max ?? 1);
        
        if (resp.enabled) {
          setRpcActive(true);
          setRpcMode("direct");
          // Tự động kết kết nối Direct RPC ngầm (chạy ngầm, không block UI chính)
          invoke("set_discord_rpc", {
            req: {
              client_id: cfg.client_id || "1495523138816053459",
              app_name: null,
              details: cfg.details || "",
              state: cfg.state || "",
              large_image: cfg.large_image || "",
              large_text: cfg.large_text || "",
              small_image: cfg.small_image || "",
              small_text: cfg.small_text || "",
              button_1_label: cfg.button_1_label || "",
              button_1_url: cfg.button_1_url || "",
              button_2_label: cfg.button_2_label || "",
              button_2_url: cfg.button_2_url || "",
              show_timestamp: cfg.show_timestamp ?? true,
              party_size: cfg.party_size ?? 1,
              party_max: cfg.party_max ?? 1,
            }
          }).then(() => {
            addLog("success", "Đã tự động khôi phục và kết nối Custom RPC trực tiếp thành công!");
          }).catch((err) => {
            addLog("warn", `Không thể tự động khôi phục Custom RPC: ${err}`);
            setRpcActive(false);
          });
        } else {
          addLog("info", "Đã tải cấu hình Custom RPC trực tiếp đã lưu!");
        }
      }
    } catch (e) {
      addLog("error", `Không thể tải cấu hình Custom RPC trực tiếp: ${e}`);
    }
  };

  const checkEquicordInstalled = async () => {
    setIsCheckingInstall(true);
    try {
      const installed = await invoke<boolean>("check_equicord_installed");
      setEquicordInstalled(installed);
      if (installed) {
        const eq_active = await loadEquicordRpcConfig();
        if (!eq_active) {
          loadDirectRpcConfig();
        }
      } else {
        loadDirectRpcConfig();
      }
    } catch (e) {
      addLog("error", `Lỗi kiểm tra Equicord: ${e}`);
      setEquicordInstalled(false);
      loadDirectRpcConfig();
    } finally {
      setIsCheckingInstall(false);
    }
  };

  useEffect(() => {
    checkEquicordInstalled();
  }, []);

  const handleActivateRpc = async () => {
    setRpcLoading(true);
    addLog("info", `Đang gửi yêu cầu kích hoạt Custom RPC (${rpcMode === "direct" ? "Kết nối trực tiếp" : "Ghi đè Equicord"})...`);
    try {
      if (rpcMode === "direct") {
        // Tự động tắt Equicord CustomRPC trước để giải phóng cổng IPC của Discord!
        try {
          await invoke("clear_equicord_custom_rpc");
          addLog("info", "Đã tự động tắt Ghi đè Equicord để giải phóng cổng kết nối Discord.");
        } catch {}

        await invoke("set_discord_rpc", {
          req: {
            client_id: rpcClientId,
            app_name: null,
            details: rpcDetails,
            state: rpcState,
            large_image: rpcLargeImg,
            large_text: rpcLargeTxt,
            small_image: rpcSmallImg,
            small_text: rpcSmallTxt,
            button_1_label: rpcBtn1Label,
            button_1_url: rpcBtn1Url,
            button_2_label: rpcBtn2Label,
            button_2_url: rpcBtn2Url,
            show_timestamp: rpcShowTime,
            party_size: rpcPartySize,
            party_max: rpcPartyMax,
          }
        });
        await invoke("save_direct_rpc_config", {
          enabled: true,
          config: {
            client_id: rpcClientId,
            app_name: null,
            details: rpcDetails,
            state: rpcState,
            large_image: rpcLargeImg,
            large_text: rpcLargeTxt,
            small_image: rpcSmallImg,
            small_text: rpcSmallTxt,
            button_1_label: rpcBtn1Label,
            button_1_url: rpcBtn1Url,
            button_2_label: rpcBtn2Label,
            button_2_url: rpcBtn2Url,
            show_timestamp: rpcShowTime,
            party_size: rpcPartySize,
            party_max: rpcPartyMax,
          }
        });
        setRpcActive(true);
        addLog("success", "Kích hoạt Custom Discord RPC trực tiếp thành công và đã lưu cấu hình!");
      } else {
        // Tự động tắt Direct RPC trước để giải phóng cổng IPC của Discord!
        try {
          await invoke("clear_discord_rpc");
          await invoke("save_direct_rpc_config", {
            enabled: false,
            config: {
              client_id: rpcClientId,
              app_name: null,
              details: rpcDetails,
              state: rpcState,
              large_image: rpcLargeImg,
              large_text: rpcLargeTxt,
              small_image: rpcSmallImg,
              small_text: rpcSmallTxt,
              button_1_label: rpcBtn1Label,
              button_1_url: rpcBtn1Url,
              button_2_label: rpcBtn2Label,
              button_2_url: rpcBtn2Url,
              show_timestamp: rpcShowTime,
              party_size: rpcPartySize,
              party_max: rpcPartyMax,
            }
          });
        } catch {}

        await invoke("save_equicord_custom_rpc", {
          req: {
            client_id: rpcClientId || "1495523138816053459",
            app_name: rpcAppName,
            details: rpcDetails,
            state: rpcState,
            large_image: rpcLargeImg,
            large_text: rpcLargeTxt,
            small_image: rpcSmallImg,
            small_text: rpcSmallTxt,
            button_1_label: rpcBtn1Label,
            button_1_url: rpcBtn1Url,
            button_2_label: rpcBtn2Label,
            button_2_url: rpcBtn2Url,
            show_timestamp: rpcShowTime,
            party_size: rpcPartySize,
            party_max: rpcPartyMax,
          }
        });
        setRpcActive(true);
        addLog("success", "Lưu cấu hình CustomRPC vào Equicord thành công! Hãy khởi động lại Discord để áp dụng thay đổi.");
      }
    } catch (e) {
      addLog("error", `Lỗi kích hoạt RPC: ${e}`);
    } finally {
      setRpcLoading(false);
    }
  };

  const handleDeactivateRpc = async () => {
    setRpcLoading(true);
    addLog("info", "Đang hủy kích hoạt Custom RPC...");
    try {
      if (rpcMode === "direct") {
        await invoke("clear_discord_rpc");
        await invoke("save_direct_rpc_config", {
          enabled: false,
          config: {
            client_id: rpcClientId,
            app_name: null,
            details: rpcDetails,
            state: rpcState,
            large_image: rpcLargeImg,
            large_text: rpcLargeTxt,
            small_image: rpcSmallImg,
            small_text: rpcSmallTxt,
            button_1_label: rpcBtn1Label,
            button_1_url: rpcBtn1Url,
            button_2_label: rpcBtn2Label,
            button_2_url: rpcBtn2Url,
            show_timestamp: rpcShowTime,
            party_size: rpcPartySize,
            party_max: rpcPartyMax,
          }
        });
        setRpcActive(false);
        addLog("success", "Đã gỡ Custom Discord RPC kết nối trực tiếp và lưu trạng thái tắt.");
      } else {
        await invoke("clear_equicord_custom_rpc");
        setRpcActive(false);
        addLog("success", "Đã tắt plugin CustomRPC của Equicord. Hãy khởi động lại Discord để áp dụng thay đổi.");
      }
    } catch (e) {
      addLog("error", `Lỗi gỡ RPC: ${e}`);
    } finally {
      setRpcLoading(false);
    }
  };

  const logColor = (type: LogLine["type"]) => {
    switch (type) {
      case "success": return "text-emerald-400";
      case "error": return "text-red-400";
      case "warn": return "text-yellow-400";
      default: return "text-neutral-400";
    }
  };

  const logPrefix = (type: LogLine["type"]) => {
    switch (type) {
      case "success": return "[✓]";
      case "error": return "[✗]";
      case "warn": return "[!]";
      default: return "[›]";
    }
  };

  return (
    <div className="flex flex-col gap-6 py-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-4 select-none">
        <div className="w-12 h-12 rounded-2xl bg-[#5865F2]/20 border border-[#5865F2]/30 flex items-center justify-center">
          <Activity className="w-6 h-6 text-[#5865F2]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Custom Discord Rich Presence</h1>
          <p className="text-neutral-500 text-sm">Tự thiết kế và cá nhân hóa trạng thái hiển thị của bạn trên Discord</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] overflow-hidden flex flex-col">
        <div className="p-5 flex flex-col md:flex-row gap-6">
          
          {/* Left Form Column */}
          <div className="flex-1 flex flex-col gap-4">
            
            {/* RPC Mode Toggle */}
            <div className="flex flex-col gap-1.5 select-none">
              <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Chế độ hoạt động</label>
              <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 w-fit">
                <button
                  onClick={() => {
                    setRpcMode("direct");
                    loadDirectRpcConfig();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    rpcMode === "direct"
                      ? "bg-[#5865F2] text-white shadow-lg shadow-[#5865F2]/10"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" /> Kết nối trực tiếp (Cần Client ID)
                </button>
                <button
                  onClick={() => {
                    setRpcMode("equicord");
                    loadEquicordRpcConfig();
                  }}
                  disabled={!equicordInstalled}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    !equicordInstalled
                      ? "opacity-40 cursor-not-allowed text-neutral-600"
                      : rpcMode === "equicord"
                      ? "bg-[#5865F2] text-white shadow-lg shadow-[#5865F2]/10"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <Puzzle className="w-3.5 h-3.5" /> Ghi đè Equicord (Tự chọn tên App)
                </button>
              </div>
            </div>

            {/* Custom App Name (Only for Equicord mode) */}
            {rpcMode === "equicord" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Tên ứng dụng hiển thị (App Name)</label>
                <input
                  type="text"
                  value={rpcAppName}
                  onChange={(e) => setRpcAppName(e.target.value)}
                  placeholder="Ví dụ: Roblox, GTA V, Đang Học Bài..."
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all font-bold"
                />
                <span className="text-[10px] text-neutral-500 leading-normal px-0.5 select-none">
                  * Tự do đặt tên ứng dụng hiển thị trên hồ sơ (ví dụ: <span className="text-neutral-300 font-semibold">Đang chơi Roblox</span>).
                </span>
              </div>
            )}

            {/* Row 1: Client ID */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between select-none">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  {rpcMode === "direct" ? "Application Client ID" : "Application Client ID (Tùy chọn)"}
                </label>
                {rpcMode === "direct" && (
                  <a 
                    href="https://discord.com/developers/applications" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[10px] text-[#5865F2] hover:text-[#4752c4] hover:underline flex items-center gap-0.5 transition-colors font-medium"
                  >
                    Tự đặt tên App riêng <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={rpcClientId}
                  onChange={(e) => setRpcClientId(e.target.value)}
                  placeholder="Nhập Discord Client ID..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all font-mono"
                />
                <button
                  onClick={handleResolveAppInfo}
                  disabled={isResolvingApp}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/5 transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResolvingApp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Kiểm tra
                </button>
              </div>
              <span className="text-[10px] text-neutral-500 leading-normal px-0.5 select-none">
                {rpcMode === "direct" ? (
                  <>* Tên ứng dụng hiển thị trên Discord chính là tên ứng dụng tương ứng với Client ID này trên Discord Developer Portal.</>
                ) : (
                  <>* Có thể giữ nguyên ID mặc định để sử dụng các biểu tượng hệ thống có sẵn của HTSS Club.</>
                )}
              </span>
            </div>

            {/* Row 2: Details & State */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Details (Dòng 1)</label>
                <input
                  type="text"
                  value={rpcDetails}
                  onChange={(e) => setRpcDetails(e.target.value)}
                  placeholder="Ví dụ: Đang chơi..."
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">State (Dòng 2)</label>
                <input
                  type="text"
                  value={rpcState}
                  onChange={(e) => setRpcState(e.target.value)}
                  placeholder="Ví dụ: Trong trận đấu..."
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all"
                />
              </div>
            </div>

            {/* Row 3: Large Image & Large Image Text */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Large Image Key / URL</label>
                <input
                  type="text"
                  value={rpcLargeImg}
                  onChange={(e) => setRpcLargeImg(e.target.value)}
                  placeholder="Ví dụ: logo hoặc url hình ảnh"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Large Image Text (Tooltip)</label>
                <input
                  type="text"
                  value={rpcLargeTxt}
                  onChange={(e) => setRpcLargeTxt(e.target.value)}
                  placeholder="Hover text ảnh lớn..."
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all"
                />
              </div>
            </div>

            {/* Row 4: Small Image & Small Image Text */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Small Image Key / URL</label>
                <input
                  type="text"
                  value={rpcSmallImg}
                  onChange={(e) => setRpcSmallImg(e.target.value)}
                  placeholder="Ví dụ: check"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Small Image Text (Tooltip)</label>
                <input
                  type="text"
                  value={rpcSmallTxt}
                  onChange={(e) => setRpcSmallTxt(e.target.value)}
                  placeholder="Hover text ảnh nhỏ..."
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all"
                />
              </div>
            </div>

            {/* Row 5: Button 1 Label & URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Nút 1 (Nhãn)</label>
                <input
                  type="text"
                  value={rpcBtn1Label}
                  onChange={(e) => setRpcBtn1Label(e.target.value)}
                  placeholder="Ví dụ: Website"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Nút 1 (URL)</label>
                <input
                  type="text"
                  value={rpcBtn1Url}
                  onChange={(e) => setRpcBtn1Url(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all font-mono"
                />
              </div>
            </div>

            {/* Row 6: Button 2 Label & URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Nút 2 (Nhãn)</label>
                <input
                  type="text"
                  value={rpcBtn2Label}
                  onChange={(e) => setRpcBtn2Label(e.target.value)}
                  placeholder="Ví dụ: Group Facebook"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Nút 2 (URL)</label>
                <input
                  type="text"
                  value={rpcBtn2Url}
                  onChange={(e) => setRpcBtn2Url(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all font-mono"
                />
              </div>
            </div>

            {/* Row 7: Party Size & Max Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Thành viên nhóm (Party Size)</label>
                <input
                  type="number"
                  min="0"
                  value={rpcPartySize}
                  onChange={(e) => setRpcPartySize(parseInt(e.target.value) || 0)}
                  placeholder="Ví dụ: 1"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider select-none">Thành viên tối đa (Party Max)</label>
                <input
                  type="number"
                  min="0"
                  value={rpcPartyMax}
                  onChange={(e) => setRpcPartyMax(parseInt(e.target.value) || 0)}
                  placeholder="Ví dụ: 5"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#5865F2]/50 transition-all font-mono"
                />
              </div>
            </div>

            {/* Checkbox: Show Timestamp */}
            <label className="flex items-center gap-2.5 px-1 py-1 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={rpcShowTime}
                onChange={(e) => setRpcShowTime(e.target.checked)}
                className="w-4 h-4 rounded border-white/10 bg-neutral-900 text-[#5865F2] focus:ring-[#5865F2] focus:ring-opacity-25"
              />
              <span className="text-xs text-neutral-400 font-medium">Hiển thị thời gian đã trôi qua (Timestamp)</span>
            </label>

            {/* Form Actions */}
            <div className="flex gap-3 mt-2 select-none">
              <button
                onClick={handleActivateRpc}
                disabled={rpcLoading}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                  rpcActive
                    ? "bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#a0aeff] border border-[#5865F2]/30"
                    : "bg-[#5865F2] hover:bg-[#4752c4] text-white shadow-[#5865F2]/10"
                }`}
              >
                {rpcLoading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang cập nhật...</>
                ) : rpcActive ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cập nhật RPC</>
                ) : (
                  <><Activity className="w-3.5 h-3.5" /> Kích hoạt RPC</>
                )}
              </button>
              
              {rpcActive && (
                <button
                  onClick={handleDeactivateRpc}
                  disabled={rpcLoading}
                  className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all text-xs font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

          </div>

          {/* Right Preview Column (Discord Profile Mockup) */}
          <div className="w-full md:w-[280px] flex-shrink-0 flex flex-col">
            <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2 ml-1 select-none">Bản xem trước Hồ sơ Discord</label>
            
            {/* Mockup Card */}
            <div className="w-full rounded-2xl bg-[#111214] border border-white/5 overflow-hidden flex flex-col select-none relative shadow-2xl">
              
              {/* Header Profile Banner */}
              <div className="h-16 w-full bg-gradient-to-r from-blue-600 to-[#5865F2] relative flex-shrink-0" />
              
              {/* Profile Body */}
              <div className="px-4 pb-4 pt-12 relative flex flex-col">
                
                {/* Avatar */}
                <div className="absolute top-[-30px] left-4 w-16 h-16 rounded-full border-[5px] border-[#111214] bg-[#232428] overflow-hidden flex items-center justify-center">
                  <div className="w-full h-full bg-[#5865F2] flex items-center justify-center text-white font-black text-xl">
                    DC
                  </div>
                  {/* Status Indicator */}
                  <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-[#111214] bg-emerald-500" />
                </div>

                {/* Nickname & Username */}
                <div className="flex flex-col">
                  <span className="text-sm font-black text-white">DeeCee</span>
                  <span className="text-[11px] text-neutral-500 font-medium">deecee_dev</span>
                </div>

                <div className="w-full h-[1px] bg-white/5 my-3" />

                {/* Playing Activity */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">Đang chơi game</span>
                  
                  <span className="text-xs font-black text-white leading-tight mt-0.5">
                    {rpcMode === "equicord" ? (rpcAppName || "htss.club") : (resolvedAppName || "htss.club")}
                  </span>
                  
                  <div className="flex gap-3">
                    
                    {/* Images block */}
                    <div className="relative w-16 h-16 flex-shrink-0 bg-neutral-800 rounded-lg overflow-hidden border border-white/5 flex items-center justify-center">
                      {rpcLargeImg ? (
                        <div className="w-full h-full bg-[#2b2d31] flex items-center justify-center text-neutral-400 text-[10px] font-bold p-1 text-center truncate">
                          {rpcLargeImg.startsWith("http") ? (
                            <img src={rpcLargeImg} alt={rpcLargeTxt} className="w-full h-full object-cover" />
                          ) : rpcLargeImg === "logo" && resolvedAppIcon ? (
                            <img src={resolvedAppIcon} alt={rpcLargeTxt} className="w-full h-full object-cover" />
                          ) : (
                            rpcLargeImg
                          )}
                        </div>
                      ) : resolvedAppIcon ? (
                        <img src={resolvedAppIcon} alt={rpcLargeTxt} className="w-full h-full object-cover animate-pulse" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-neutral-600" />
                      )}

                      {/* Small image badge overlay */}
                      {rpcSmallImg && (
                        <div className="absolute bottom-[-2px] right-[-2px] w-6 h-6 rounded-full border-2 border-[#111214] bg-neutral-900 overflow-hidden flex items-center justify-center">
                          {rpcSmallImg.startsWith("http") ? (
                            <img src={rpcSmallImg} alt={rpcSmallTxt} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[8px] font-black text-[#5865F2]">{rpcSmallImg.slice(0, 2)}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                      <span className="text-[11px] text-white/90 truncate leading-tight">
                        {rpcDetails || "Đang phát triển Launcher"}
                      </span>
                      <span className="text-[11px] text-neutral-400 truncate leading-tight">
                        {rpcState || "HTSS Club v0.6.9"}
                      </span>
                      {rpcShowTime && (
                        <span className="text-[11px] text-neutral-400 leading-tight flex items-center gap-1 font-mono mt-0.5">
                          <Clock className="w-3 h-3 text-neutral-500" />
                          {rpcActive ? formatElapsed(elapsedSeconds) : "00:00 đã trôi qua"}
                        </span>
                      )}
                      {rpcPartyMax > 0 && (
                        <span className="text-[11px] text-neutral-400 leading-tight flex items-center gap-1 font-mono mt-0.5">
                          <Users className="w-3.5 h-3.5 text-neutral-500" />
                          Nhóm ({rpcPartySize} / {rpcPartyMax})
                        </span>
                      )}
                    </div>

                  </div>

                  {/* Buttons Preview */}
                  <div className="flex flex-col gap-1.5 mt-2">
                    {rpcBtn1Label && (
                      <button className="w-full py-1.5 rounded bg-neutral-800 border border-transparent hover:bg-neutral-700 transition-colors text-white font-semibold text-[11px] text-center truncate">
                        {rpcBtn1Label}
                      </button>
                    )}
                    {rpcBtn2Label && (
                      <button className="w-full py-1.5 rounded bg-neutral-800 border border-transparent hover:bg-neutral-700 transition-colors text-white font-semibold text-[11px] text-center truncate">
                        {rpcBtn2Label}
                      </button>
                    )}
                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-2xl border border-[#5865F2]/20 bg-[#5865F2]/5 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Shield className="w-4 h-4 text-[#7289da] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-neutral-400 leading-relaxed">
            <span className="text-[#7289da] font-semibold">Lưu ý bảo mật: </span>
            Equicord là client mod mã nguồn mở không được chứng nhận bởi Discord. Sử dụng có thể vi phạm ToS của Discord.
            Bật Questify sẽ ghi vào file config tại thư mục cài đặt Equicord. Khởi động lại Discord để áp dụng thay đổi.
          </div>
        </div>
        <div className="w-full h-[1px] bg-[#5865F2]/10" />
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-[#7289da] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-neutral-400 leading-relaxed">
            <span className="text-[#7289da] font-semibold">Hướng dẫn xử lý lỗi RPC: </span>
            Nếu gặp thông báo lỗi <code className="text-red-400 bg-red-950/20 px-1 py-0.5 rounded font-mono text-[10px]">The pipe is being closed (os error 232)</code>, hãy đảm bảo ứng dụng Discord bản máy tính (Desktop Client chính thức) đang mở và đăng nhập hoạt động. Tránh dùng Discord bản Web. Đồng thời, hãy kiểm tra xem Application Client ID bạn điền đã được tạo chính xác trên cổng Discord Developer Portal chưa nhé!
          </div>
        </div>
      </div>

      {/* Log Terminal */}
      {logs.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
            <Terminal className="w-4 h-4 text-neutral-500" />
            <span className="text-xs font-semibold text-neutral-500 tracking-widest uppercase">Log</span>
            <button
              onClick={() => setLogs([])}
              className="ml-auto text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              Xóa
            </button>
          </div>
          <div className="p-4 space-y-1 max-h-48 overflow-y-auto custom-scrollbar font-mono text-[11px]">
            {logs.map((l, i) => (
              <div key={i} className={`flex items-start gap-2 ${logColor(l.type)}`}>
                <span className="opacity-60 flex-shrink-0">{logPrefix(l.type)}</span>
                <span>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
