"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search, UserPlus, UserCheck, UserX, Check, X, Clock, Users2, Loader2,
} from "lucide-react";
import {
  friendsApi, usersApi,
  type FriendEntry, type CommunityUser, type PresenceStatus,
} from "../lib/communityApi";
import { onChat } from "../lib/communitySocket";
import { useCommunityStore } from "../store/useCommunityStore";
import { toast } from "./Toast";

const PRESENCE_DOT: Record<PresenceStatus, string> = {
  ONLINE: "bg-emerald-400",
  IDLE: "bg-amber-400",
  DND: "bg-rose-500",
  OFFLINE: "bg-neutral-600",
};
const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  ONLINE: "Trực tuyến",
  IDLE: "Chờ",
  DND: "Bận",
  OFFLINE: "Ngoại tuyến",
};

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-fuchsia-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-purple-500",
];
function gradientFor(seed?: string) {
  if (!seed) return AVATAR_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
function initials(name?: string) {
  return name ? name.trim().slice(0, 2).toUpperCase() : "?";
}

function Avatar({ name, url, presence, size = 40 }: { name?: string; url?: string; presence?: PresenceStatus; size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div className={`w-full h-full rounded-2xl bg-gradient-to-br ${gradientFor(name)} flex items-center justify-center font-black text-white overflow-hidden`} style={{ fontSize: size * 0.34 }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : initials(name)}
      </div>
      {presence && (
        <span className={`absolute -bottom-0.5 -right-0.5 rounded-full ${PRESENCE_DOT[presence]} ring-2 ring-[#08080f]`} style={{ width: size * 0.3, height: size * 0.3 }} />
      )}
    </div>
  );
}

type Tab = "all" | "online" | "pending" | "add";

/**
 * Khu "Bạn bè" toàn màn hình (thay cho khu chat khi chọn ở view switcher).
 * Dùng friendsApi + usersApi có sẵn: danh sách bạn, lời mời đến/đi, thêm bạn.
 */
export default function FriendsView({
  onOpenProfile,
}: {
  onOpenProfile?: (userId: string) => void;
}) {
  const me = useCommunityStore((s) => s.user);
  const presenceMap = useCommunityStore((s) => s.presenceMap);

  const [tab, setTab] = useState<Tab>("all");
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requests, setRequests] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommunityUser[]>([]);
  const [searching, setSearching] = useState(false);

  const presOf = (u?: CommunityUser): PresenceStatus =>
    (u && (presenceMap[u.id] || u.presence)) || "OFFLINE";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fr, rq] = await Promise.all([
        friendsApi.list().catch(() => [] as FriendEntry[]),
        friendsApi.requests().catch(() => [] as FriendEntry[]),
      ]);
      setFriends(fr);
      setRequests(rq);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: lời mời đến/chấp nhận/từ chối/hủy → tự tải lại danh sách.
  useEffect(() => {
    const offs = [
      onChat("friend:request-received", () => load()),
      onChat("friend:accepted", () => load()),
      onChat("friend:declined", () => load()),
      onChat("friend:removed", () => load()),
    ];
    return () => { offs.forEach((o) => o()); };
  }, [load]);

  useEffect(() => {
    if (tab !== "add") return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const list = await usersApi.search(q);
        setResults(list.filter((u) => u.id !== me?.id));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, tab, me?.id]);

  // Lời mời đến / đi: ưu tiên field `direction` từ backend, fallback theo requesterId.
  const incoming = requests.filter((r) =>
    r.direction === "incoming" || (!r.direction && r.requesterId && r.requesterId !== me?.id)
  );
  const outgoing = requests.filter((r) =>
    r.direction === "outgoing" || (!r.direction && r.requesterId === me?.id)
  );

  const friendIdSet = new Set<string>();
  friends.forEach((f) => { if (f.user?.id) friendIdSet.add(f.user.id); });
  const pendingIdSet = new Set<string>();
  requests.forEach((r) => { if (r.user?.id) pendingIdSet.add(r.user.id); });

  const doAdd = async (userId: string) => {
    setBusyId(userId);
    try { await friendsApi.request(userId); toast.success("Đã gửi lời mời kết bạn."); await load(); }
    catch (e: any) { toast.error(e?.message || "Gửi lời mời thất bại."); }
    finally { setBusyId(null); }
  };
  const doAccept = async (reqId: string) => {
    setBusyId(reqId);
    try { await friendsApi.accept(reqId); toast.success("Đã chấp nhận lời mời."); await load(); }
    catch (e: any) { toast.error(e?.message || "Thao tác thất bại."); }
    finally { setBusyId(null); }
  };
  const doDecline = async (reqId: string) => {
    setBusyId(reqId);
    try { await friendsApi.decline(reqId); await load(); }
    catch (e: any) { toast.error(e?.message || "Thao tác thất bại."); }
    finally { setBusyId(null); }
  };
  const doRemove = async (userId: string) => {
    setBusyId(userId);
    try { await friendsApi.remove(userId); toast.success("Đã hủy kết bạn."); await load(); }
    catch (e: any) { toast.error(e?.message || "Thao tác thất bại."); }
    finally { setBusyId(null); }
  };

  const onlineFriends = friends.filter((f) => presOf(f.user) === "ONLINE");
  const shownFriends = tab === "online" ? onlineFriends : friends;

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: "all", label: "Tất cả", badge: friends.length || undefined },
    { id: "online", label: "Trực tuyến", badge: onlineFriends.length || undefined },
    { id: "pending", label: "Đang chờ", badge: requests.length || undefined },
    { id: "add", label: "Thêm bạn" },
  ];

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#08080f]">
      {/* Header + tabs */}
      <div className="h-[52px] flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
        <Users2 className="w-4.5 h-4.5 text-violet-300 flex-shrink-0" />
        <span className="text-[14px] font-black text-white mr-2">Bạn bè</span>
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                tab === t.id ? "bg-violet-500/20 text-violet-100" : "text-neutral-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${tab === t.id ? "bg-violet-500/40 text-white" : "bg-white/10 text-neutral-300"}`}>{t.badge}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3">
        <div className="max-w-[680px] mx-auto">
          {loading ? (
            <div className="py-20 flex items-center justify-center"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
          ) : tab === "add" ? (
            <div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm theo tên người dùng..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 transition-all"
                />
              </div>
              {searching ? (
                <div className="py-10 flex items-center justify-center"><Loader2 className="w-5 h-5 text-violet-400 animate-spin" /></div>
              ) : query.trim().length < 2 ? (
                <p className="py-10 text-center text-[12px] text-neutral-600">Nhập ít nhất 2 ký tự để tìm.</p>
              ) : results.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-neutral-600">Không tìm thấy người dùng nào.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {results.map((u) => {
                    // Ưu tiên friendStatus do backend trả kèm kết quả search.
                    const fs = u.friendStatus;
                    const already = fs === "FRIENDS" || friendIdSet.has(u.id);
                    const sent = fs === "REQUEST_SENT";
                    const received = fs === "REQUEST_RECEIVED";
                    const pending = sent || received || (!fs && pendingIdSet.has(u.id));
                    return (
                      <div key={u.id} className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                        <button onClick={() => onOpenProfile?.(u.id)} className="cursor-pointer"><Avatar name={u.displayName || u.username} url={u.avatarUrl} presence={presOf(u)} /></button>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold text-white truncate">{u.displayName || u.username}</div>
                          <div className="text-[11px] text-neutral-500 truncate">@{u.username}</div>
                        </div>
                        {already ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 px-2"><UserCheck className="w-3.5 h-3.5" /> Bạn bè</span>
                        ) : received ? (
                          <button
                            onClick={() => u.friendRequestId && doAccept(u.friendRequestId)}
                            disabled={busyId === u.friendRequestId}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                          >
                            {busyId === u.friendRequestId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Chấp nhận
                          </button>
                        ) : pending ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 px-2"><Clock className="w-3.5 h-3.5" /> Đang chờ</span>
                        ) : (
                          <button onClick={() => doAdd(u.id)} disabled={busyId === u.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50">
                            {busyId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Kết bạn
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : tab === "pending" ? (
            <div>
              {requests.length === 0 ? (
                <EmptyState icon={Clock} text="Không có lời mời nào đang chờ." />
              ) : (
                <>
                  {incoming.length > 0 && (
                    <>
                      <SectionLabel text={`Lời mời đến — ${incoming.length}`} />
                      {incoming.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                          <button onClick={() => r.user?.id && onOpenProfile?.(r.user.id)} className="cursor-pointer"><Avatar name={r.user?.displayName || r.user?.username} url={r.user?.avatarUrl} presence={presOf(r.user)} /></button>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold text-white truncate">{r.user?.displayName || r.user?.username || "Người dùng"}</div>
                            <div className="text-[11px] text-neutral-500">Muốn kết bạn với bạn</div>
                          </div>
                          <button onClick={() => doAccept(r.id)} disabled={busyId === r.id} data-tip="Chấp nhận" data-tip-pos="top" className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-all cursor-pointer disabled:opacity-50"><Check className="w-4 h-4" /></button>
                          <button onClick={() => doDecline(r.id)} disabled={busyId === r.id} data-tip="Từ chối" data-tip-pos="top" className="w-8 h-8 flex items-center justify-center rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition-all cursor-pointer disabled:opacity-50"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </>
                  )}
                  {outgoing.length > 0 && (
                    <>
                      <SectionLabel text={`Đã gửi — ${outgoing.length}`} />
                      {outgoing.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                          <button onClick={() => r.user?.id && onOpenProfile?.(r.user.id)} className="cursor-pointer"><Avatar name={r.user?.displayName || r.user?.username} url={r.user?.avatarUrl} presence={presOf(r.user)} /></button>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold text-white truncate">{r.user?.displayName || r.user?.username || "Người dùng"}</div>
                            <div className="text-[11px] text-amber-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Đang chờ phản hồi</div>
                          </div>
                          <button onClick={() => doDecline(r.id)} disabled={busyId === r.id} className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-neutral-300 hover:bg-white/[0.1] text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50">Thu hồi</button>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <div>
              {shownFriends.length === 0 ? (
                <EmptyState icon={Users2} text={tab === "online" ? "Không có bạn nào đang trực tuyến." : "Bạn chưa có người bạn nào. Hãy thêm bạn mới!"} />
              ) : (
                shownFriends.map((f) => {
                  const u = f.user;
                  const pres = presOf(u);
                  return (
                    <div key={f.id} className="group flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                      <button onClick={() => u?.id && onOpenProfile?.(u.id)} className="cursor-pointer"><Avatar name={u?.displayName || u?.username} url={u?.avatarUrl} presence={pres} /></button>
                      <button onClick={() => u?.id && onOpenProfile?.(u.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                        <div className="text-[13px] font-bold text-white truncate">{u?.displayName || u?.username || "Người dùng"}</div>
                        <div className="text-[11px] text-neutral-500 truncate">{PRESENCE_LABEL[pres]}</div>
                      </button>
                      <button onClick={() => u?.id && doRemove(u.id)} disabled={busyId === u?.id} data-tip="Hủy kết bạn" data-tip-pos="top" className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer opacity-0 group-hover:opacity-100 disabled:opacity-50"><UserX className="w-4 h-4" /></button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <div className="px-2.5 pt-3 pb-1.5 text-[10px] font-black uppercase tracking-wider text-neutral-500">{text}</div>;
}

function EmptyState({ icon: Icon, text }: { icon: typeof Users2; text: string }) {
  return (
    <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center"><Icon className="w-7 h-7 text-violet-500/40" /></div>
      <p className="text-[12px] text-neutral-500 max-w-[260px]">{text}</p>
    </div>
  );
}
