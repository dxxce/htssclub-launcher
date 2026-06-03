"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X, Loader2, Coins, Copy, UserPlus, UserCheck, Clock, Check, Calendar, BadgeCheck, Ban,
} from "lucide-react";
import { usersApi, friendsApi, type CommunityUser, type PresenceStatus, type FriendEntry } from "../lib/communityApi";
import { useCommunityStore } from "../store/useCommunityStore";
import { toast } from "./Toast";

interface Props {
  userId: string;
  onClose: () => void;
  onTransfer?: (user: CommunityUser) => void;
}

type FriendState =
  | "none"        // chưa có quan hệ
  | "friends"     // đã là bạn
  | "outgoing"    // mình đã gửi lời mời
  | "incoming"    // họ gửi lời mời cho mình
  | "self";       // chính mình

const PRESENCE_DOT: Record<PresenceStatus, string> = {
  ONLINE: "bg-emerald-400", IDLE: "bg-amber-400", DND: "bg-rose-400", OFFLINE: "bg-neutral-600",
};
const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  ONLINE: "Trực tuyến", IDLE: "Chờ", DND: "Bận", OFFLINE: "Ngoại tuyến",
};
const STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Hoạt động", cls: "text-emerald-300 bg-emerald-500/15" },
  BANNED: { label: "Bị cấm", cls: "text-rose-300 bg-rose-500/15" },
  SUSPENDED: { label: "Tạm khoá", cls: "text-amber-300 bg-amber-500/15" },
  PENDING: { label: "Chờ duyệt", cls: "text-sky-300 bg-sky-500/15" },
};
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

export default function UserProfileModal({ userId, onClose, onTransfer }: Props) {
  const me = useCommunityStore((s) => s.user);
  const presenceMap = useCommunityStore((s) => s.presenceMap);
  const [user, setUser] = useState<CommunityUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [friendState, setFriendState] = useState<FriendState>("none");
  const [incomingReqId, setIncomingReqId] = useState<string | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);

  const isSelf = me?.id === userId;

  const loadFriendStatus = useCallback(async () => {
    if (isSelf) { setFriendState("self"); return; }
    try {
      const [friends, requests] = await Promise.all([
        friendsApi.list().catch(() => [] as FriendEntry[]),
        friendsApi.requests().catch(() => [] as FriendEntry[]),
      ]);
      const isFriend = friends.some(
        (f) => f.user?.id === userId || f.requesterId === userId || f.addresseeId === userId
      );
      if (isFriend) { setFriendState("friends"); return; }
      // lời mời đến (họ là requester) → mình accept được
      const incoming = requests.find(
        (r) => r.requesterId === userId || (r.user?.id === userId && r.addresseeId === me?.id)
      );
      if (incoming) { setFriendState("incoming"); setIncomingReqId(incoming.id); return; }
      // lời mời đi (mình là requester)
      const outgoing = requests.find(
        (r) => r.addresseeId === userId || (r.user?.id === userId && r.requesterId === me?.id)
      );
      if (outgoing) { setFriendState("outgoing"); return; }
      setFriendState("none");
    } catch {
      setFriendState("none");
    }
  }, [userId, isSelf, me?.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    usersApi.getById(userId)
      .then((u) => { if (!cancelled) setUser(u); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Không tải được hồ sơ."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    loadFriendStatus();
    return () => { cancelled = true; };
  }, [userId, loadFriendStatus]);

  const presence: PresenceStatus = (user && presenceMap[user.id]) || user?.presence || "OFFLINE";
  const nm = user?.displayName || user?.username || "Người dùng";

  const doFriendAction = async () => {
    if (friendBusy) return;
    setFriendBusy(true);
    try {
      if (friendState === "none") {
        await toast.promise(friendsApi.request(userId), {
          loading: "Đang gửi lời mời...", success: "Đã gửi lời mời kết bạn!", error: (e) => e?.message || "Gửi lời mời thất bại.",
        });
        setFriendState("outgoing");
      } else if (friendState === "incoming" && incomingReqId) {
        await toast.promise(friendsApi.accept(incomingReqId), {
          loading: "Đang chấp nhận...", success: "Đã trở thành bạn bè!", error: (e) => e?.message || "Chấp nhận thất bại.",
        });
        setFriendState("friends");
      } else if (friendState === "friends") {
        await toast.promise(friendsApi.remove(userId), {
          loading: "Đang huỷ kết bạn...", success: "Đã huỷ kết bạn.", error: (e) => e?.message || "Huỷ kết bạn thất bại.",
        });
        setFriendState("none");
      }
    } catch { /* toast */ } finally { setFriendBusy(false); }
  };

  // cấu hình nút theo trạng thái
  const friendBtn = {
    none:     { icon: UserPlus,  label: "Kết bạn",        cls: "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white" },
    outgoing: { icon: Clock,     label: "Đã gửi lời mời", cls: "bg-white/[0.06] border border-white/10 text-neutral-400 cursor-default" },
    incoming: { icon: Check,     label: "Chấp nhận",      cls: "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white" },
    friends:  { icon: UserCheck, label: "Bạn bè",         cls: "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-300" },
    self:     { icon: UserPlus,  label: "",               cls: "" },
  }[friendState];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="relative w-full max-w-[380px] glass rounded-2xl shadow-2xl animate-pop-in overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <button onClick={onClose} className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-white/80 hover:text-white bg-black/20 hover:bg-black/40 transition-colors cursor-pointer">
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
        ) : error || !user ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 px-6 text-center">
            <Ban className="w-8 h-8 text-neutral-700" />
            <p className="text-[12px] text-rose-400">{error || "Không tìm thấy người dùng."}</p>
          </div>
        ) : (
          <>
            {/* Banner: nếu có avatar dùng chính ảnh làm nền mờ, ngược lại gradient động */}
            <div className="relative h-28 overflow-hidden">
              {user.avatarUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={user.avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#101019] via-[#101019]/40 to-transparent" />
                </>
              ) : (
                <>
                  <div className={`absolute inset-0 bg-gradient-to-br ${gradFor(user.username)}`} />
                  <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.25), transparent 45%)" }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#101019] to-transparent" />
                </>
              )}
            </div>

            <div className="px-5 pb-5 -mt-12 relative">
              <div className="relative inline-block">
                <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${gradFor(user.username)} ring-4 ring-[#101019] flex items-center justify-center text-2xl font-black text-white overflow-hidden`}>
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : initials(nm)}
                </div>
                <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${PRESENCE_DOT[presence]} ring-4 ring-[#101019]`} />
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black text-white">{nm}</h3>
                {(user as any).isAdmin && <BadgeCheck className="w-4 h-4 text-sky-400" />}
              </div>
              <div className="text-[12px] text-neutral-500">{user.username}</div>

              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-bold text-neutral-300">
                  <span className={`w-1.5 h-1.5 rounded-full ${PRESENCE_DOT[presence]}`} />
                  {PRESENCE_LABEL[presence]}
                </span>
                {user.status && STATUS_META[user.status] && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_META[user.status].cls}`}>
                    {STATUS_META[user.status].label}
                  </span>
                )}
                {friendState === "friends" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-300 bg-emerald-500/15">Bạn bè</span>
                )}
              </div>

              {/* Thông tin */}
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-300"><Coins className="w-4 h-4 text-amber-400" /> Số dư</span>
                  <span className="text-[13px] font-black text-amber-300">{(user.balance ?? 0).toLocaleString("vi-VN")}</span>
                </div>
                {user.createdAt && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-400"><Calendar className="w-3.5 h-3.5" /> Tham gia</span>
                    <span className="text-[12px] font-bold text-neutral-200">{new Date(user.createdAt).toLocaleDateString("vi-VN")}</span>
                  </div>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(user.id); toast.success("Đã sao chép ID."); }}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-400"><Copy className="w-3.5 h-3.5" /> ID</span>
                  <span className="text-[11px] font-mono text-neutral-300 truncate max-w-[160px]">{user.id}</span>
                </button>
              </div>

              {/* Hành động */}
              {!isSelf && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={doFriendAction}
                    disabled={friendBusy || friendState === "outgoing"}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-80 group/fr ${friendBtn.cls}`}
                  >
                    {friendBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <friendBtn.icon className="w-4 h-4" />}
                    <span className={friendState === "friends" ? "group-hover/fr:hidden" : ""}>{friendBtn.label}</span>
                    {friendState === "friends" && <span className="hidden group-hover/fr:inline">Huỷ kết bạn</span>}
                  </button>
                  <button
                    onClick={() => onTransfer?.(user)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-[12px] font-bold transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <Coins className="w-4 h-4" /> Chuyển xu
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
