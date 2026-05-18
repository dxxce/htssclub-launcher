"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Download, CheckCircle, XCircle, AlertCircle, Loader2,
  Power, RefreshCw, Terminal, Shield, Zap, Info, Activity, Sliders
} from "lucide-react";
import DiscordRpcHub from "./DiscordRpcHub";

type InstallStatus = "idle" | "loading" | "success" | "error";
type QuestifyStatus = "unknown" | "loading" | "enabled" | "disabled" | "error";
type DiscordStatus = "unknown" | "loading" | "running" | "not_running";

interface LogLine {
  type: "info" | "success" | "error" | "warn";
  msg: string;
}

export default function DiscordHub() {
  const [activeSubTab, setActiveSubTab] = useState<"tools" | "rpc">("tools");
  const [installStatus, setInstallStatus] = useState<InstallStatus>("idle");
  const [questifyStatus, setQuestifyStatus] = useState<QuestifyStatus>("loading");
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus>("loading");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [equicordInstalled, setEquicordInstalled] = useState<boolean | null>(null);
  const [isCheckingInstall, setIsCheckingInstall] = useState(true);

  const addLog = (type: LogLine["type"], msg: string) => {
    setLogs(prev => [...prev.slice(-49), { type, msg }]);
  };

  const checkDiscordStatus = async (showLoading = false) => {
    if (showLoading) {
      setDiscordStatus("loading");
    }
    try {
      const running = await invoke<boolean>("check_discord_running");
      setDiscordStatus(running ? "running" : "not_running");
    } catch {
      setDiscordStatus("not_running");
    }
  };

  const checkEquicordInstalled = async (showLoading = false) => {
    if (showLoading) {
      setIsCheckingInstall(true);
    }
    try {
      const installed = await invoke<boolean>("check_equicord_installed");
      setEquicordInstalled(installed);
      if (installed) {
        checkQuestifyStatus(showLoading);
      } else {
        setQuestifyStatus("disabled");
      }
    } catch (e) {
      addLog("error", `Lỗi kiểm tra Equicord: ${e}`);
      setEquicordInstalled(false);
    } finally {
      setIsCheckingInstall(false);
    }
  };

  const checkQuestifyStatus = async (showLoading = false) => {
    if (showLoading) {
      setQuestifyStatus("loading");
    }
    try {
      const enabled = await invoke<boolean>("check_questify_enabled");
      setQuestifyStatus(enabled ? "enabled" : "disabled");
    } catch (e) {
      addLog("warn", `Không thể đọc trạng thái Questify: ${e}`);
      setQuestifyStatus("error");
    }
  };

  const checkDiscordStatusSilent = async () => {
    try {
      const running = await invoke<boolean>("check_discord_running");
      setDiscordStatus(running ? "running" : "not_running");
    } catch {
      setDiscordStatus("not_running");
    }
  };

  useEffect(() => {
    checkDiscordStatus(false);
    checkEquicordInstalled(false);

    const interval = setInterval(() => {
      checkDiscordStatusSilent();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleInstallEquicord = async () => {
    if (installStatus === "loading") return;
    setInstallStatus("loading");
    setLogs([]);
    addLog("info", "Bắt đầu cài đặt Equicord...");
    addLog("info", "Đang tải installer từ GitHub...");

    try {
      const result = await invoke<string>("install_equicord");
      addLog("success", result);
      setInstallStatus("success");
      setEquicordInstalled(true);
      setTimeout(() => checkQuestifyStatus(), 500);
    } catch (e) {
      addLog("error", `Cài đặt thất bại: ${e}`);
      setInstallStatus("error");
    }
  };

  const handleToggleQuestify = async () => {
    if (questifyStatus === "loading") return;
    const targetState = questifyStatus !== "enabled";
    setQuestifyStatus("loading");
    addLog("info", targetState ? "Đang bật plugin Questify..." : "Đang tắt plugin Questify...");

    try {
      await invoke("toggle_questify_plugin", { enable: targetState });
      setQuestifyStatus(targetState ? "enabled" : "disabled");
      addLog("success", targetState
        ? "Questify đã được BẬT. Khởi động lại Discord để áp dụng."
        : "Questify đã được TẮT. Khởi động lại Discord để áp dụng."
      );
    } catch (e) {
      addLog("error", `Lỗi toggle Questify: ${e}`);
      setQuestifyStatus("error");
    }
  };

  const handleKillDiscord = async () => {
    addLog("info", "Đang đóng Discord...");
    try {
      await invoke("kill_discord");
      addLog("success", "Discord đã được đóng.");
      setDiscordStatus("not_running");
    } catch (e) {
      addLog("error", `Lỗi đóng Discord: ${e}`);
    }
  };

  const handleLaunchDiscord = async () => {
    addLog("info", "Đang khởi động Discord...");
    try {
      await invoke("launch_discord");
      addLog("success", "Discord đang được khởi động...");
      setTimeout(() => checkDiscordStatus(), 3000);
    } catch (e) {
      addLog("error", `Lỗi khởi động Discord: ${e}`);
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
          <svg className="w-7 h-7" viewBox="0 0 127.14 96.36" fill="#5865F2">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Discord Tools</h1>
          <p className="text-neutral-500 text-sm">Quản lý cài đặt Equicord và các plugin bổ trợ Discord</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { checkDiscordStatus(true); checkEquicordInstalled(true); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all text-xs font-medium border border-white/5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </button>
        </div>
      </div>

      {/* Sub navigation tabs */}
      <div className="flex border-b border-white/5 pb-px select-none">
        <button
          onClick={() => setActiveSubTab("tools")}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer ${
            activeSubTab === "tools"
              ? "border-[#5865F2] text-white"
              : "border-transparent text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Công cụ & Tiện ích
        </button>
        <button
          onClick={() => setActiveSubTab("rpc")}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer ${
            activeSubTab === "rpc"
              ? "border-[#5865F2] text-white"
              : "border-transparent text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Discord Rich Presence (RPC)
        </button>
      </div>

      {activeSubTab === "tools" ? (
        <>
          {/* Discord Status Card */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${
                discordStatus === "running" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" :
                discordStatus === "loading" ? "bg-yellow-400 animate-pulse" :
                discordStatus === "not_running" ? "bg-neutral-600" : "bg-neutral-700"
              }`} />
              <div>
                <div className="text-sm font-semibold text-white">Ứng dụng Discord</div>
                <div className="text-xs text-neutral-500">
                  {discordStatus === "running" ? "Đang chạy" :
                   discordStatus === "loading" ? "Đang kiểm tra..." :
                   discordStatus === "not_running" ? "Không chạy" : "Không xác định"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {discordStatus === "running" ? (
                <button
                  onClick={handleKillDiscord}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all text-xs font-semibold cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Đóng Discord
                </button>
              ) : (
                <button
                  onClick={handleLaunchDiscord}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#7289da] hover:text-[#a0aeff] border border-[#5865F2]/20 transition-all text-xs font-semibold cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5" />
                  Mở Discord
                </button>
              )}
            </div>
          </div>

          {/* Two Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Equicord Install Card */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Download className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">Cài đặt Equicord</div>
                  <div className="text-xs text-neutral-500 mt-0.5">Bản mod giao diện & plugin tốt nhất cho Discord</div>
                </div>
              </div>

              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                equicordInstalled === true ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" :
                equicordInstalled === false ? "bg-neutral-800/50 border border-white/5 text-neutral-500" :
                "bg-neutral-800/50 border border-white/5 text-neutral-500"
              }`}>
                {isCheckingInstall ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang kiểm tra...</>
                ) : equicordInstalled === true ? (
                  <><CheckCircle className="w-3.5 h-3.5" /> Đã cài đặt</>
                ) : equicordInstalled === false ? (
                  <><AlertCircle className="w-3.5 h-3.5" /> Chưa cài đặt</>
                ) : (
                  <><AlertCircle className="w-3.5 h-3.5" /> Đang kiểm tra...</>
                )}
              </div>

              <div className="text-[11px] text-neutral-600 flex items-start gap-1.5 px-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>Sẽ tự động tải và kích hoạt Equicord vào Discord của bạn. Hãy đóng Discord trước.</span>
              </div>

              <button
                onClick={handleInstallEquicord}
                disabled={installStatus === "loading" || equicordInstalled === true}
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  equicordInstalled === true
                    ? "bg-white/5 text-neutral-600 cursor-not-allowed border border-white/5"
                    : installStatus === "loading"
                    ? "bg-violet-500/20 text-violet-400 cursor-not-allowed border border-violet-500/20"
                    : "bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 hover:border-violet-500/50 cursor-pointer"
                }`}
              >
                {installStatus === "loading" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Đang cài đặt...</>
                ) : equicordInstalled === true ? (
                  <><CheckCircle className="w-4 h-4" /> Đã cài đặt</>
                ) : (
                  <><Download className="w-4 h-4" /> Cài đặt Equicord</>
                )}
              </button>
            </div>

            {/* Questify Plugin Card */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">Plugin Questify</div>
                  <div className="text-xs text-neutral-500 mt-0.5">Tự động hoàn thành Quest nhận quà Discord</div>
                </div>
              </div>

              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                questifyStatus === "enabled" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" :
                questifyStatus === "disabled" ? "bg-neutral-800/50 border border-white/5 text-neutral-500" :
                questifyStatus === "loading" ? "bg-neutral-800/50 border border-white/5 text-neutral-500" :
                questifyStatus === "error" ? "bg-red-500/10 border border-red-500/20 text-red-400" :
                "bg-neutral-800/50 border border-white/5 text-neutral-500"
              }`}>
                {questifyStatus === "loading" ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang xử lý...</>
                ) : questifyStatus === "enabled" ? (
                  <><CheckCircle className="w-3.5 h-3.5" /> Đang bật</>
                ) : questifyStatus === "disabled" ? (
                  <><XCircle className="w-3.5 h-3.5" /> Đang tắt</>
                ) : questifyStatus === "error" ? (
                  <><AlertCircle className="w-3.5 h-3.5" /> Lỗi đọc cấu hình</>
                ) : (
                  <><AlertCircle className="w-3.5 h-3.5" /> {equicordInstalled ? "Đang tải..." : "Yêu cầu cài Equicord trước"}</>
                )}
              </div>

              <div className="text-[11px] text-neutral-600 flex items-start gap-1.5 px-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>Tự động nhận diện nhiệm vụ của Discord và hoàn thành để lấy vật phẩm trang trí.</span>
              </div>

              <button
                onClick={handleToggleQuestify}
                disabled={
                  questifyStatus === "loading" ||
                  !equicordInstalled ||
                  questifyStatus === "unknown"
                }
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  !equicordInstalled
                    ? "bg-white/5 text-neutral-600 cursor-not-allowed border border-white/5"
                    : questifyStatus === "loading"
                    ? "bg-amber-500/20 text-amber-400 cursor-not-allowed border border-amber-500/20"
                    : questifyStatus === "enabled"
                    ? "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20 hover:border-red-500/40 cursor-pointer"
                    : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-[#5865F2]/20 hover:border-amber-500/40 cursor-pointer"
                }`}
              >
                {questifyStatus === "loading" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Đang xử lý...</>
                ) : questifyStatus === "enabled" ? (
                  <><XCircle className="w-4 h-4" /> Tắt Questify</>
                ) : (
                  <><Zap className="w-4 h-4" /> Bật Questify</>
                )}
              </button>
            </div>
          </div>

          {/* Security Banner */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-4 flex items-start gap-3 select-none">
            <Shield className="w-4 h-4 text-neutral-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-neutral-500 leading-relaxed">
              <span className="text-neutral-400 font-semibold">Lưu ý an toàn:</span> Equicord là một bản tùy biến mở rộng mã nguồn tự do được tin dùng bởi cộng đồng. Hãy đảm bảo đóng hoàn toàn Discord trước khi thao tác nâng cấp hoặc cài đặt.
            </div>
          </div>

          {/* Log Terminal */}
          {logs.length > 0 && (
            <div className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <Terminal className="w-4 h-4 text-neutral-500" />
                <span className="text-xs font-semibold text-neutral-500 tracking-widest uppercase">Trình theo dõi (Log)</span>
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
        </>
      ) : (
        <DiscordRpcHub />
      )}
    </div>
  );
}
