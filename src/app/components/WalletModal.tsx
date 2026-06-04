"use client";

import { useEffect, useRef, useState } from "react";
import {
  X, Loader2, Coins, Search, Send, Wallet, History as HistoryIcon,
  ArrowDownLeft, ArrowUpRight, Gift, RotateCcw, ArrowLeftRight,
} from "lucide-react";
import { walletApi, usersApi, type CommunityUser, type Transaction } from "../lib/communityApi";
import { useCommunityStore } from "../store/useCommunityStore";
import { playTransferFailSound } from "../lib/notifySounds";
import TransferDetailModal from "./TransferDetailModal";
import { toast } from "./Toast";

interface Props {
  onClose: () => void;
  presetTarget?: CommunityUser | null;
}

type Tab = "overview" | "transfer" | "history";
type TxType = Transaction["type"];

const GRADS = [
  "from-indigo-500 to-fuchsia-500", "from-sky-500 to-cyan-400", "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-500", "from-rose-500 to-pink-500", "from-violet-500 to-purple-500",
];
function gradFor(seed?: string) {
  if (!seed) return GRADS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADS[h % GRADS.length];
}
function initials(name?: string) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  } catch { return iso; }
}

const TX_META: Record<TxType, { label: string; icon: typeof Coins; color: string; bg: string }> = {
  TOPUP: { label: "Nạp xu", icon: ArrowDownLeft, color: "text-emerald-300", bg: "bg-emerald-500/15" },
  SPEND: { label: "Tiêu xu", icon: ArrowUpRight, color: "text-rose-300", bg: "bg-rose-500/15" },
  REWARD: { label: "Thưởng", icon: Gift, color: "text-amber-300", bg: "bg-amber-500/15" },
  REFUND: { label: "Hoàn xu", icon: RotateCcw, color: "text-sky-300", bg: "bg-sky-500/15" },
  TRANSFER: { label: "Chuyển khoản", icon: ArrowLeftRight, color: "text-violet-300", bg: "bg-violet-500/15" },
};

/** Ví xu hợp nhất: tổng quan + chuyển xu + lịch sử. */
export default function WalletModal({ onClose, presetTarget }: Props) {
  const me = useCommunityStore((s) => s.user);
  const refreshMe = useCommunityStore((s) => s.refreshMe);
  const [tab, setTab] = useState<Tab>(presetTarget ? "transfer" : "overview");
  const balance = me?.balance ?? 0;
  // Chi tiết giao dịch chuyển xu: { transferId, success? } → mở TransferDetailModal.
  const [detail, setDetail] = useState<{ transferId: string; success?: boolean } | null>(null);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="relative w-full max-w-[440px] h-[580px] glass rounded-2xl shadow-2xl animate-pop-in overflow-hidden flex flex-col">
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
          <h3 className="flex items-center gap-2 text-base font-black text-white">
            <Wallet className="w-5 h-5 text-amber-400" /> Ví xu
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Thẻ số dư */}
        <div className="px-5 flex-shrink-0">
          <div className="relative rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 p-4 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-400/70">Số dư hiện tại</div>
            <div className="flex items-center gap-2 mt-1">
              <Coins className="w-7 h-7 text-amber-400" />
              <span className="text-[28px] font-black text-amber-300 leading-none">{balance.toLocaleString("vi-VN")}</span>
              <span className="text-[12px] font-bold text-amber-400/60 mb-0.5">xu</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 flex-shrink-0">
          {([
            { id: "overview" as const, label: "Tổng quan", icon: Wallet },
            { id: "transfer" as const, label: "Chuyển xu", icon: Send },
            { id: "history" as const, label: "Lịch sử", icon: HistoryIcon },
          ]).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                  tab === t.id ? "bg-amber-500/15 text-amber-200 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.35)]" : "text-neutral-400 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5">
          {tab === "overview" && <OverviewTab balance={balance} onTransfer={() => setTab("transfer")} onHistory={() => setTab("history")} />}
          {tab === "transfer" && <TransferTab me={me} balance={balance} refreshMe={refreshMe} onDone={() => setTab("history")} presetTarget={presetTarget} onTransferred={(transferId) => setDetail({ transferId, success: true })} />}
          {tab === "history" && <HistoryTab onViewTransfer={(transferId) => setDetail({ transferId })} />}
        </div>
      </div>

      {/* Chi tiết giao dịch chuyển xu */}
      {detail && (
        <TransferDetailModal transferId={detail.transferId} success={detail.success} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ balance, onTransfer, onHistory }: { balance: number; onTransfer: () => void; onHistory: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-neutral-500">Quản lý xu cộng đồng của bạn. Dùng xu để tặng bạn bè hoặc mua vật phẩm.</p>
      <button onClick={onTransfer} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-amber-500/40 hover:bg-white/[0.06] transition-all cursor-pointer text-left">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0"><Send className="w-5 h-5 text-amber-400" /></div>
        <div className="flex-1">
          <div className="text-[13px] font-bold text-white">Chuyển xu</div>
          <div className="text-[11px] text-neutral-500">Gửi xu cho thành viên khác</div>
        </div>
      </button>
      <button onClick={onHistory} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-violet-500/40 hover:bg-white/[0.06] transition-all cursor-pointer text-left">
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0"><HistoryIcon className="w-5 h-5 text-violet-300" /></div>
        <div className="flex-1">
          <div className="text-[13px] font-bold text-white">Lịch sử giao dịch</div>
          <div className="text-[11px] text-neutral-500">Xem toàn bộ biến động xu</div>
        </div>
      </button>
      <div className="mt-1 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="text-[11px] text-neutral-500">Tổng số dư khả dụng</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Coins className="w-4 h-4 text-amber-400" />
          <span className="text-[16px] font-black text-amber-300">{balance.toLocaleString("vi-VN")}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function TransferTab({ me, balance, refreshMe, onDone, presetTarget, onTransferred }: { me: CommunityUser | null; balance: number; refreshMe: () => Promise<void>; onDone: () => void; presetTarget?: CommunityUser | null; onTransferred?: (transferId: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommunityUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [target, setTarget] = useState<CommunityUser | null>(presetTarget ?? null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (target) return;
    if (debTimer.current) clearTimeout(debTimer.current);
    const q = query.trim();
    setSearchErr(null);
    if (q.length < 1) { setResults([]); return; }
    debTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const list = await usersApi.search(q);
        setResults(list.filter((u) => u.id !== me?.id));
      } catch (e: any) {
        setResults([]);
        setSearchErr(e?.message || "Tìm kiếm thất bại.");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debTimer.current) clearTimeout(debTimer.current); };
  }, [query, target, me?.id]);

  const amountNum = parseInt(amount || "0", 10) || 0;
  const canSend = !!target && amountNum > 0 && amountNum <= balance && !busy;

  const submit = async () => {
    if (!canSend || !target) return;
    setBusy(true);
    try {
      const result = await toast.promise(
        walletApi.transfer(target.id, amountNum, note.trim() || undefined).then(async (r) => { await refreshMe(); return r; }),
        { loading: "Đang chuyển xu...", success: `Đã chuyển ${amountNum.toLocaleString("vi-VN")} xu!`, error: (e) => e?.message || "Chuyển xu thất bại." }
      );
      // Tiếng "thành công" do sự kiện wallet:transaction phát (tránh kêu 2 lần).
      setTarget(null); setQuery(""); setAmount(""); setNote("");
      // Hiện màn hình chi tiết giao dịch (gọi API detail) thay vì chỉ nhảy tab.
      if (result?.transferId) onTransferred?.(result.transferId);
      else onDone();
    } catch {
      playTransferFailSound();
    } finally { setBusy(false); }
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 transition-all";

  return (
    <div className="flex flex-col">
      <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">Người nhận</label>
      {target ? (
        <div className="flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl bg-white/[0.04] border border-violet-500/30">
          <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradFor(target.username)} flex items-center justify-center text-[11px] font-black text-white overflow-hidden flex-shrink-0`}>
            {target.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={target.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : initials(target.displayName || target.username)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-white truncate">{target.displayName || target.username}</div>
            <div className="text-[11px] text-neutral-500 truncate">@{target.username}</div>
          </div>
          <button onClick={() => { setTarget(null); setQuery(""); }} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="mb-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nhập tên đăng nhập để tìm..." className={`${inputCls} pl-9`} />
            {searching && <Loader2 className="w-4 h-4 text-violet-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>
          {searchErr && <p className="text-[11px] text-rose-400 mt-1.5">{searchErr}</p>}
          {!searching && query.trim().length >= 1 && results.length === 0 && !searchErr && (
            <p className="text-[11px] text-neutral-600 mt-1.5">Không tìm thấy người dùng &quot;{query.trim()}&quot;.</p>
          )}
          {results.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 max-h-44 overflow-y-auto custom-scrollbar">
              {results.map((u) => (
                <button key={u.id} onClick={() => { setTarget(u); setResults([]); }} className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer text-left">
                  <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradFor(u.username)} flex items-center justify-center text-[10px] font-black text-white overflow-hidden flex-shrink-0`}>
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : initials(u.displayName || u.username)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold text-neutral-100 truncate">{u.displayName || u.username}</div>
                    <div className="text-[10px] text-neutral-500 truncate">@{u.username}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">Số xu</label>
      <div className="relative mb-2">
        <Coins className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input type="number" min={1} max={balance} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" className={`${inputCls} pl-9`} />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[100, 200, 500, 1000, 5000].map((v) => (
          <button
            key={v}
            onClick={() => setAmount((prev) => {
              const cur = parseInt(prev || "0", 10) || 0;
              return String(Math.min(cur + v, balance));
            })}
            disabled={v > balance}
            className="flex-1 min-w-[56px] py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] font-bold text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            +{v.toLocaleString("vi-VN")}
          </button>
        ))}
        <button
          onClick={() => setAmount(String(balance))}
          disabled={balance <= 0}
          className="flex-1 min-w-[56px] py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Tối đa
        </button>
        <button
          onClick={() => setAmount("")}
          disabled={!amount}
          className="flex-1 min-w-[56px] py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] font-bold text-neutral-400 hover:bg-rose-500/15 hover:text-rose-300 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Xoá
        </button>
      </div>

      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Lời nhắn (tuỳ chọn)" className={`${inputCls} mb-3`} />
      {amountNum > balance && <p className="text-[11px] text-rose-400 mb-2 -mt-1">Số xu vượt quá số dư.</p>}

      <button onClick={submit} disabled={!canSend} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-sm font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {target ? `Chuyển ${amountNum > 0 ? amountNum.toLocaleString("vi-VN") + " xu" : "xu"}` : "Chọn người nhận"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function HistoryTab({ onViewTransfer }: { onViewTransfer?: (transferId: string) => void }) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await walletApi.transactions();
        if (cancelled) return;
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTxs(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Không tải được lịch sử.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>;
  if (error) return <div className="flex flex-col items-center justify-center py-12 text-center gap-2"><Coins className="w-8 h-8 text-neutral-700" /><p className="text-[12px] text-rose-400">{error}</p></div>;
  if (txs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center"><HistoryIcon className="w-6 h-6 text-neutral-600" /></div>
      <p className="text-[13px] text-neutral-400">Chưa có giao dịch nào.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {txs.map((t, i) => {
        const meta = TX_META[t.type] || TX_META.SPEND;
        const Icon = meta.icon;
        const positive = t.amount >= 0;
        const clickable = t.type === "TRANSFER" && !!t.transferId;
        return (
          <div
            key={t.id || `tx-${i}`}
            onClick={clickable ? () => onViewTransfer?.(t.transferId!) : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] transition-colors ${clickable ? "hover:bg-white/[0.06] cursor-pointer" : "hover:bg-white/[0.04]"}`}
          >
            <div className={`w-9 h-9 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}><Icon className={`w-4.5 h-4.5 ${meta.color}`} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-neutral-100 truncate">{meta.label}{t.reason && <span className="text-neutral-500 font-normal"> · {t.reason}</span>}</div>
              <div className="text-[10px] text-neutral-600">{fmtDate(t.createdAt)}{clickable && <span className="text-violet-400/70"> · Xem chi tiết</span>}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-[13px] font-black ${positive ? "text-emerald-300" : "text-rose-300"}`}>{positive ? "+" : ""}{t.amount.toLocaleString("vi-VN")}</div>
              <div className="text-[10px] text-neutral-600">Còn {t.balanceAfter.toLocaleString("vi-VN")}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
