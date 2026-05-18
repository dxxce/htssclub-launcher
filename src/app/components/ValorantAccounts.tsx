"use client";

import { useEffect, useState } from "react";
import { 
  User, Trash2, Check, Plus, RefreshCw, 
  AlertCircle, Loader2, Laptop, LogOut
} from "lucide-react";
import { useValorantStore } from "../store/useValorantStore";

export default function ValorantAccounts() {
  const {
    savedAccounts: accounts,
    activePuuid,
    loading: storeLoading,
    loadAccounts: loadData,
    setActiveAccount: handleSelectAccountStore,
    deleteAccount: handleDeleteAccountStore,
    addClientAccount: handleAddClientStore,
    logoutClientKeepSession: handleLogoutKeepSessionStore
  } = useValorantStore();

  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const showStatus = (type: "success" | "error" | "info", text: string) => {
    setStatus({ type, text });
    setTimeout(() => {
      setStatus(null);
    }, 6000);
  };

  const handleSelectAccount = async (puuid: string) => {
    try {
      setActionLoading(true);
      await handleSelectAccountStore(puuid);
      showStatus("success", "Đã chuyển đổi tài khoản thành công!");
    } catch (err: any) {
      showStatus("error", "Lỗi chuyển đổi tài khoản: " + err.toString());
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAccount = (puuid: string) => {
    if (window.confirmCustom) {
      window.confirmCustom({
        title: "Xóa tài khoản",
        message: "Bạn có chắc chắn muốn xóa tài khoản này khỏi danh sách đã lưu?",
        confirmText: "Xóa tài khoản",
        cancelText: "Hủy",
        type: "danger",
        onConfirm: async () => {
          try {
            setActionLoading(true);
            await handleDeleteAccountStore(puuid);
            showStatus("success", "Đã xóa tài khoản thành công!");
          } catch (err: any) {
            showStatus("error", "Lỗi khi xóa tài khoản: " + err.toString());
          } finally {
            setActionLoading(false);
          }
        }
      });
    } else {
      if (confirm("Bạn có chắc chắn muốn xóa tài khoản này khỏi danh sách đã lưu?")) {
        (async () => {
          try {
            setActionLoading(true);
            await handleDeleteAccountStore(puuid);
            showStatus("success", "Đã xóa tài khoản thành công!");
          } catch (err: any) {
            showStatus("error", "Lỗi khi xóa tài khoản: " + err.toString());
          } finally {
            setActionLoading(false);
          }
        })();
      }
    }
  };

  const handleAddClient = async () => {
    try {
      setActionLoading(true);
      setStatus({ type: "info", text: "Đang quét Riot Client đang chạy ở local..." });
      await handleAddClientStore();
      showStatus("success", `Lưu thành công tài khoản mới từ Riot Client!`);
    } catch (err: any) {
      showStatus("error", err.toString());
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogoutKeepSession = async () => {
    try {
      setActionLoading(true);
      setStatus({ type: "info", text: "Đang tiến hành đăng xuất khỏi Riot Client..." });
      await handleLogoutKeepSessionStore();
      showStatus("success", "Đăng xuất thành công! (Phiên đăng nhập đã lưu vẫn an toàn)");
    } catch (err: any) {
      showStatus("error", "Lỗi đăng xuất: " + err.toString());
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (storeLoading && accounts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[450px]">
        <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
        <p className="text-neutral-400 font-medium">Đang tải dữ liệu tài khoản...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full mt-6 select-none animate-fadeIn">
      {/* Banner status notification */}
      {status && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border mb-6 text-sm transition-all duration-300 ${
          status.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
          status.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-400" :
          "bg-blue-500/10 border-blue-500/20 text-blue-400"
        }`}>
          {status.type === "info" ? <Loader2 className="w-4 h-4 mt-0.5 animate-spin flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span className="font-semibold leading-relaxed">{status.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT & CENTER: Saved Accounts List */}
        <div className="xl:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                <User className="w-4 h-4 text-purple-400" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">Tài Khoản Đã Lưu</h2>
            </div>
            <button 
              onClick={loadData}
              disabled={actionLoading || storeLoading}
              className="p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${actionLoading || storeLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Riot Client default running item */}
            <div 
              className={`relative rounded-2xl overflow-hidden border transition-all duration-300 bg-white/[0.02] p-5 flex items-center justify-between ${
                activePuuid === "running_client" 
                  ? "border-emerald-500/30 bg-emerald-500/[0.02] shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
                  : "border-white/5 hover:border-white/10"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border backdrop-blur-md ${
                  activePuuid === "running_client" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-black/40 border-white/10"
                }`}>
                  <Laptop className={`w-6 h-6 ${activePuuid === "running_client" ? "text-emerald-400" : "text-neutral-400"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-white text-base">Riot Client Đang Chạy</h3>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-neutral-500/10 text-neutral-400 border border-neutral-500/20 tracking-wider">MẶC ĐỊNH</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">Tự động sử dụng tài khoản hiện đang mở trên máy tính</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {activePuuid === "running_client" ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black">
                    <Check className="w-3.5 h-3.5" />
                    ĐANG CHỌN
                  </div>
                ) : (
                  <button 
                    onClick={() => handleSelectAccount("running_client")}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold border border-white/5 hover:border-white/10 transition-colors cursor-pointer"
                  >
                    Chọn sử dụng
                  </button>
                )}
              </div>
            </div>

            {/* List of saved accounts */}
            {accounts.length > 0 ? (
              accounts.map((acc) => {
                const isActive = activePuuid === acc.puuid;
                return (
                  <div 
                    key={acc.puuid}
                    className={`relative rounded-2xl overflow-hidden border transition-all duration-300 bg-white/[0.02] p-5 flex items-center justify-between ${
                      isActive 
                        ? "border-emerald-500/30 bg-emerald-500/[0.02] shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
                        : "border-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border backdrop-blur-md ${
                        isActive ? "bg-emerald-500/10 border-emerald-500/20" : "bg-black/40 border-white/10"
                      }`}>
                        <User className={`w-6 h-6 ${isActive ? "text-emerald-400" : "text-neutral-400"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-white text-base">{acc.game_name}</h3>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-md tracking-wider border ${
                            acc.login_type === "credentials" 
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/20" 
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}>
                            {acc.login_type === "credentials" ? "MẬT KHẨU" : "RIOT CLIENT"}
                          </span>
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                            {acc.shard}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {acc.login_type === "credentials" 
                            ? "Lưu trữ đám mây, tự động gia hạn kết nối" 
                            : "Sao lưu tệp cấu hình session từ Riot Client"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleDeleteAccount(acc.puuid)}
                        disabled={actionLoading}
                        className="p-2.5 bg-red-500/5 hover:bg-red-500/15 text-red-400 rounded-xl border border-red-500/10 hover:border-red-500/20 transition-all cursor-pointer"
                        title="Xóa tài khoản"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {isActive ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black">
                          <Check className="w-3.5 h-3.5" />
                          ĐANG CHỌN
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleSelectAccount(acc.puuid)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold border border-white/5 hover:border-white/10 transition-colors cursor-pointer"
                        >
                          Chọn sử dụng
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : null}
          </div>
        </div>

        {/* RIGHT SIDE: Add Accounts Methods */}
        <div className="flex flex-col gap-6">
          
          {/* Method 1: Auto Link From Running Client */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center border border-red-500/30">
                <Laptop className="w-4 h-4 text-red-400" />
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">Liên Kết Riot Client</h3>
            </div>
            
            <div className="bg-gradient-to-b from-red-500/[0.03] to-transparent border border-red-500/10 rounded-2xl p-5 flex flex-col">
              <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                Nếu bạn đang mở Riot Client và đã đăng nhập tài khoản của mình trên máy tính, hệ thống sẽ tự động sao lưu cấu hình session để khôi phục nhanh sau này.
              </p>
              <button 
                onClick={handleAddClient}
                disabled={actionLoading}
                className="w-full py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white rounded-xl font-bold text-xs shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Lưu TK từ Riot Client đang chạy
              </button>

              <div className="h-px bg-white/5 my-4" />

              <button 
                onClick={handleLogoutKeepSession}
                disabled={actionLoading}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 disabled:bg-white/5 text-red-400 rounded-xl font-bold text-xs border border-white/5 hover:border-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.05)] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4 text-red-400" />
                Đăng xuất Riot Client (Giữ Session)
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
