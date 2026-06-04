"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Coins, ArrowRight, CheckCircle2, Ban, Copy } from "lucide-react";
import { walletApi, type TransferDetail } from "../lib/communityApi";
import { toast } from "./Toast";

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
function initials(name?: string) { return (name || "?").trim().slice(0, 2).toUpperCase(); }

function MiniAvatar({ name, url }: { name?: string; url?: string }) {
  return (
    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradFor(name)} flex items-center justify-center text-base font-black text-white overflow-hidden`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : initials(name)}
    </div>
  );
}

/**
 * Màn hình chi tiết một lượt chuyển xu — gọi GET /wallet/transfers/:transferId.
 * Dùng cho: sau khi chuyển thành công (success=true để hiện banner), và khi bấm
 * vào 1 giao dịch trong tab Lịch sử / thẻ xu trong DM.
 */
export default function TransferDetailModal({
  transferId, success, onClose,
}: {
  transferId: string;
  success?: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    walletApi.transferDetail(transferId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Không tải được chi tiết giao dịch."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transferId]);

  const out = detail?.direction === "OUT";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="relative w-full max-w-[400px] glass rounded-2xl shadow-2xl animate-pop-in overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <button onClick={onClose} className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="py-16 flex items-center justify-center"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
        ) : error || !detail ? (
          <div className="py-16 flex flex-col items-center gap-2 px-6 text-center">
            <Ban className="w-8 h-8 text-neutral-700" />
            <p className="text-[12px] text-rose-400">{error || "Không tìm thấy giao dịch."}</p>
          </div>
        ) : (
          <div className="px-6 pt-7 pb-6">
            {/* Banner thành công (sau khi vừa chuyển) */}
            {success && (
              <div className="flex flex-col items-center gap-2 mb-4">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-[15px] font-black text-white">Chuyển xu thành công!</p>
              </div>
            )}

            {/* Số tiền */}
            <div className="flex flex-col items-center gap-1 mb-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{out ? "Đã chuyển đi" : "Đã nhận được"}</div>
              <div className="flex items-center gap-2">
                <Coins className="w-6 h-6 text-amber-400" />
                <span className={`text-[30px] font-black tabular-nums ${out ? "text-rose-300" : "text-emerald-300"}`}>
                  {out ? "−" : "+"}{detail.amount.toLocaleString("vi-VN")}
                </span>
                <span className="text-[13px] font-bold text-amber-400/70 self-end mb-1.5">xu</span>
              </div>
            </div>

            {/* Người gửi → người nhận */}
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="flex flex-col items-center gap-1 w-24">
                <MiniAvatar name={detail.from?.displayName || detail.from?.username} url={detail.from?.avatarUrl} />
                <span className="text-[11px] font-bold text-neutral-200 truncate max-w-[90px]">{detail.from?.displayName || detail.from?.username || "—"}</span>
                <span className="text-[9px] text-neutral-600">Người gửi</span>
              </div>
              <ArrowRight className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="flex flex-col items-center gap-1 w-24">
                <MiniAvatar name={detail.to?.displayName || detail.to?.username} url={detail.to?.avatarUrl} />
                <span className="text-[11px] font-bold text-neutral-200 truncate max-w-[90px]">{detail.to?.displayName || detail.to?.username || "—"}</span>
                <span className="text-[9px] text-neutral-600">Người nhận</span>
              </div>
            </div>

            {/* Thông tin chi tiết */}
            <div className="flex flex-col gap-2">
              {detail.note && (
                <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-0.5">Lời nhắn</div>
                  <p className="text-[12px] text-neutral-200 break-words">{detail.note}</p>
                </div>
              )}
              {typeof detail.myBalanceAfter === "number" && (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
                  <span className="text-[12px] font-semibold text-neutral-300">Số dư của bạn sau giao dịch</span>
                  <span className="flex items-center gap-1 text-[13px] font-black text-amber-300"><Coins className="w-3.5 h-3.5 text-amber-400" />{detail.myBalanceAfter.toLocaleString("vi-VN")}</span>
                </div>
              )}
              {detail.createdAt && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[12px] font-semibold text-neutral-400">Thời gian</span>
                  <span className="text-[12px] font-bold text-neutral-200">{new Date(detail.createdAt).toLocaleString("vi-VN")}</span>
                </div>
              )}
              <button
                onClick={() => { navigator.clipboard.writeText(detail.transferId); toast.success("Đã sao chép mã giao dịch."); }}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-400"><Copy className="w-3.5 h-3.5" /> Mã giao dịch</span>
                <span className="text-[11px] font-mono text-neutral-300 truncate max-w-[150px]">{detail.transferId}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
