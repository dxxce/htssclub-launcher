"use client";

import { useEffect, useRef, useState } from "react";
import {
  X, Loader2, Camera, Check, Crown, Shield, Circle, Ban, UserX, Megaphone,
  Link2, Copy, Trash2, Pencil, ArrowLeftRight, ShieldCheck, ShieldOff, Undo2,
} from "lucide-react";
import { serversApi, uploadsApi, type ServerDetail, type ServerMember, type ServerBan, type MemberRole } from "../lib/communityApi";
import { useCommunityStore } from "../store/useCommunityStore";
import { toast } from "./Toast";
import AvatarCropper from "./AvatarCropper";
import ContextMenu, { ContextMenuState } from "./ContextMenu";

interface Props {
  server: ServerDetail;
  myUserId: string;
  myRole: MemberRole;
  onClose: () => void;
}

type Tab = "overview" | "members" | "bans";

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-fuchsia-500", "from-sky-500 to-cyan-400", "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-500", "from-rose-500 to-pink-500", "from-violet-500 to-purple-500",
];
function gradientFor(seed?: string) {
  if (!seed) return AVATAR_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
function initials(name?: string) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

export default function ServerSettings({ server, myUserId, myRole, onClose }: Props) {
  const reloadServer = useCommunityStore((s) => s.selectServer);
  const loadServers = useCommunityStore((s) => s.loadServers);

  const isOwner = myRole === "OWNER";
  const isAdmin = myRole === "OWNER" || myRole === "ADMIN";

  const [tab, setTab] = useState<Tab>("overview");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  // overview
  const [name, setName] = useState(server.name);
  const [savingName, setSavingName] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [inviteCode, setInviteCode] = useState(server.inviteCode || "");
  const [announce, setAnnounce] = useState("");
  const [sendingAnnounce, setSendingAnnounce] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // members / bans
  const [members, setMembers] = useState<ServerMember[]>(server.members || []);
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [loadingBans, setLoadingBans] = useState(false);
  const [nickEditing, setNickEditing] = useState<string | null>(null);
  const [nickValue, setNickValue] = useState("");

  useEffect(() => {
    setMembers(server.members || []);
  }, [server.members]);

  const refresh = async () => {
    await reloadServer(server.id);
    try {
      const m = await serversApi.members(server.id);
      setMembers(m);
    } catch {
      /* ignore */
    }
  };

  // ── overview actions ──
  const saveName = async () => {
    if (!name.trim() || name.trim() === server.name || savingName) return;
    setSavingName(true);
    try {
      await toast.promise(serversApi.update(server.id, { name: name.trim() }).then(() => Promise.all([reloadServer(server.id), loadServers()])), {
        loading: "Đang lưu tên server...", success: "Đã đổi tên server!", error: (e) => e?.message || "Đổi tên thất bại.",
      });
    } catch { /* toast */ } finally { setSavingName(false); }
  };

  const onPickIcon = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Vui lòng chọn tệp ảnh.");
    if (file.size > 8 * 1024 * 1024) return toast.error("Ảnh quá lớn (tối đa 8MB).");
    setCropSrc(URL.createObjectURL(file));
  };

  const onCropConfirm = async (blob: Blob) => {
    setUploadingIcon(true);
    try {
      const { url } = await toast.promise(uploadsApi.avatar(blob, "server.png"), {
        loading: "Đang tải ảnh...", success: "Đã tải ảnh!", error: (e) => e?.message || "Tải ảnh thất bại.",
      });
      await toast.promise(serversApi.update(server.id, { iconUrl: url }).then(() => Promise.all([reloadServer(server.id), loadServers()])), {
        loading: "Đang cập nhật avatar server...", success: "Đã cập nhật avatar server!", error: (e) => e?.message || "Cập nhật thất bại.",
      });
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    } catch { /* toast */ } finally { setUploadingIcon(false); }
  };

  const genInvite = async () => {
    try {
      const r = await serversApi.invite(server.id);
      setInviteCode(r.inviteCode);
      await navigator.clipboard.writeText(r.inviteCode);
      toast.success("Đã tạo & sao chép mã mời.");
    } catch (e: any) { toast.error(e?.message || "Không tạo được mã mời."); }
  };

  const revokeInvite = async () => {
    try {
      await toast.promise(serversApi.revokeInvite(server.id), {
        loading: "Đang thu hồi mã mời...", success: "Đã thu hồi mã mời.", error: (e) => e?.message || "Thu hồi thất bại.",
      });
      setInviteCode("");
    } catch { /* toast */ }
  };

  const sendAnnounce = async () => {
    if (!announce.trim() || sendingAnnounce) return;
    setSendingAnnounce(true);
    try {
      await toast.promise(serversApi.announce(server.id, announce.trim()), {
        loading: "Đang gửi thông báo...", success: "Đã gửi thông báo toàn server!", error: (e) => e?.message || "Gửi thất bại.",
      });
      setAnnounce("");
    } catch { /* toast */ } finally { setSendingAnnounce(false); }
  };

  // ── member actions ──
  const loadBans = async () => {
    setLoadingBans(true);
    try {
      setBans(await serversApi.bans(server.id));
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách ban.");
    } finally {
      setLoadingBans(false);
    }
  };

  useEffect(() => {
    if (tab === "bans" && isAdmin) loadBans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const changeRole = (m: ServerMember, role: "ADMIN" | "MEMBER") => {
    toast.promise(serversApi.updateRole(server.id, m.userId, role).then(refresh), {
      loading: "Đang đổi vai trò...", success: `Đã đặt ${role === "ADMIN" ? "Quản trị viên" : "Thành viên"}.`, error: (e) => e?.message || "Đổi vai trò thất bại.",
    });
  };

  const kick = (m: ServerMember) => {
    toast.promise(serversApi.kick(server.id, m.userId).then(refresh), {
      loading: "Đang kick...", success: "Đã kick thành viên.", error: (e) => e?.message || "Kick thất bại.",
    });
  };

  const ban = (m: ServerMember) => {
    toast.promise(serversApi.banMember(server.id, m.userId).then(refresh), {
      loading: "Đang ban...", success: "Đã ban thành viên.", error: (e) => e?.message || "Ban thất bại.",
    });
  };

  const transfer = (m: ServerMember) => {
    toast.promise(serversApi.transferOwnership(server.id, m.userId).then(() => Promise.all([refresh(), loadServers()])), {
      loading: "Đang chuyển quyền sở hữu...", success: "Đã chuyển quyền sở hữu!", error: (e) => e?.message || "Chuyển quyền thất bại.",
    });
  };

  const saveNickname = async (m: ServerMember) => {
    try {
      await toast.promise(serversApi.setNickname(server.id, m.userId, nickValue.trim()).then(refresh), {
        loading: "Đang lưu nickname...", success: "Đã đặt nickname.", error: (e) => e?.message || "Đặt nickname thất bại.",
      });
      setNickEditing(null);
    } catch { /* toast */ }
  };

  const unban = (b: ServerBan) => {
    toast.promise(serversApi.unban(server.id, b.userId).then(loadBans), {
      loading: "Đang gỡ ban...", success: "Đã gỡ ban.", error: (e) => e?.message || "Gỡ ban thất bại.",
    });
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 transition-all";

  const memberMenu = (m: ServerMember, e: React.MouseEvent) => {
    e.preventDefault();
    const items: ContextMenuState["items"] = [];
    const targetIsOwner = m.role === "OWNER";
    const isSelf = m.userId === myUserId;

    // nickname: bản thân hoặc admin cho người khác
    if (isSelf || isAdmin) {
      items.push({
        label: "Đặt nickname", icon: Pencil, accent: "sky",
        onClick: () => { setNickEditing(m.userId); setNickValue(m.nickname || ""); },
      });
    }
    if (isAdmin && !targetIsOwner && !isSelf) {
      if (m.role === "MEMBER") items.push({ label: "Thăng Quản trị viên", icon: ShieldCheck, accent: "violet", onClick: () => changeRole(m, "ADMIN") });
      else items.push({ label: "Hạ xuống Thành viên", icon: ShieldOff, accent: "amber", onClick: () => changeRole(m, "MEMBER") });
    }
    if (isOwner && !targetIsOwner) {
      items.push({ label: "Chuyển quyền sở hữu", icon: ArrowLeftRight, accent: "amber", onClick: () => transfer(m) });
    }
    if (isAdmin && !targetIsOwner && !isSelf) {
      items.push({ type: "separator" });
      items.push({ label: "Kick", icon: UserX, danger: true, onClick: () => kick(m) });
      items.push({ label: "Ban", icon: Ban, danger: true, onClick: () => ban(m) });
    }
    if (items.length === 0) items.push({ type: "label", label: "Không có hành động" });
    setMenu({ x: e.clientX, y: e.clientY, header: m.nickname || m.user?.displayName || m.user?.username, items });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm animate-fade-in" onMouseDown={() => !uploadingIcon && onClose()}>
      <div onMouseDown={(e) => e.stopPropagation()} className="relative w-full max-w-[640px] h-[560px] glass rounded-2xl shadow-2xl animate-pop-in overflow-hidden flex flex-col">
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black text-white overflow-hidden flex-shrink-0 ${server.iconUrl ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(server.name)}`}`}>
              {server.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={server.iconUrl} alt="" className="w-full h-full object-cover" />
              ) : initials(server.name)}
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-black text-white truncate">Quản trị server</div>
              <div className="text-[11px] text-neutral-500 truncate">{server.name}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 flex-shrink-0">
          {([
            { id: "overview" as const, label: "Tổng quan" },
            { id: "members" as const, label: `Thành viên (${members.length})` },
            ...(isAdmin ? [{ id: "bans" as const, label: "Bị cấm" }] : []),
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                tab === t.id ? "bg-violet-600/20 text-violet-200 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.4)]" : "text-neutral-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5">
          {/* ───── TỔNG QUAN ───── */}
          {tab === "overview" && (
            cropSrc ? (
              <div>
                <p className="text-[12px] text-neutral-400 mb-3 text-center font-semibold">Cắt avatar server</p>
                <AvatarCropper src={cropSrc} busy={uploadingIcon} onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }} onConfirm={onCropConfirm} />
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Avatar + tên */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => isAdmin && fileRef.current?.click()}
                    disabled={!isAdmin}
                    className={`relative w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black text-white overflow-hidden group flex-shrink-0 ${server.iconUrl ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(server.name)}`} ${isAdmin ? "cursor-pointer" : "cursor-default"}`}
                  >
                    {server.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={server.iconUrl} alt="" className="w-full h-full object-cover" />
                    ) : initials(server.name)}
                    {isAdmin && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">Tên server</label>
                    <div className="flex items-center gap-2">
                      <input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} maxLength={48} className={inputCls} onKeyDown={(e) => e.key === "Enter" && saveName()} />
                      {isAdmin && (
                        <button onClick={saveName} disabled={savingName || name.trim() === server.name} className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
                          {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickIcon} />

                {/* Mã mời */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">Mã mời</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                      <Link2 className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                      <span className="flex-1 text-sm font-mono text-neutral-200 truncate">{inviteCode || "Chưa có mã mời"}</span>
                      {inviteCode && (
                        <button onClick={() => { navigator.clipboard.writeText(inviteCode); toast.success("Đã sao chép."); }} className="p-1 rounded text-neutral-400 hover:text-white cursor-pointer">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {isAdmin && (
                      <>
                        <button onClick={genInvite} className="px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-[12px] font-bold text-neutral-200 hover:bg-white/[0.1] transition-all cursor-pointer whitespace-nowrap">Tạo mới</button>
                        <button onClick={revokeInvite} disabled={!inviteCode} className="px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[12px] font-bold text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">Thu hồi</button>
                      </>
                    )}
                  </div>
                </div>

                {/* Thông báo toàn server */}
                {isAdmin && (
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">
                      <Megaphone className="w-3.5 h-3.5" /> Thông báo toàn server
                    </label>
                    <textarea value={announce} onChange={(e) => setAnnounce(e.target.value)} rows={3} placeholder="Nội dung thông báo gửi tới toàn bộ thành viên..." className={`${inputCls} resize-none`} />
                    <button onClick={sendAnnounce} disabled={!announce.trim() || sendingAnnounce} className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-[12px] font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                      {sendingAnnounce ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
                      Gửi thông báo
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {/* ───── THÀNH VIÊN ───── */}
          {tab === "members" && (
            <div className="flex flex-col gap-1">
              {members.map((m, mi) => {
                const RoleIcon = m.role === "OWNER" ? Crown : m.role === "ADMIN" ? Shield : Circle;
                const nm = m.nickname || m.user?.displayName || m.user?.username || "Người dùng";
                const editing = nickEditing === m.userId;
                return (
                  <div key={m.id || m.userId || mi} className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors group/m">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black text-white overflow-hidden flex-shrink-0 ${m.user?.avatarUrl ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(nm)}`}`}>
                      {m.user?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : initials(nm)}
                    </span>
                    {editing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input autoFocus value={nickValue} onChange={(e) => setNickValue(e.target.value)} maxLength={32} placeholder="Nickname (để trống = bỏ)" className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-violet-500/40 text-[12px] text-neutral-100 outline-none" onKeyDown={(e) => { if (e.key === "Enter") saveNickname(m); if (e.key === "Escape") setNickEditing(null); }} />
                        <button onClick={() => saveNickname(m)} className="p-1.5 rounded-lg bg-violet-600 text-white cursor-pointer"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setNickEditing(null)} className="p-1.5 rounded-lg bg-white/10 text-neutral-300 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-bold text-neutral-100 truncate">{nm}</span>
                            {m.userId === myUserId && <span className="text-[9px] font-black text-violet-400 px-1.5 py-0.5 rounded bg-violet-500/15">BẠN</span>}
                          </div>
                          {m.nickname && <div className="text-[10px] text-neutral-500 truncate">@{m.user?.username}</div>}
                        </div>
                        <span className={`flex items-center gap-1 text-[10px] font-bold ${m.role === "OWNER" ? "text-amber-400" : m.role === "ADMIN" ? "text-sky-400" : "text-neutral-500"}`}>
                          <RoleIcon className="w-3.5 h-3.5" />
                          {m.role === "OWNER" ? "Chủ" : m.role === "ADMIN" ? "Admin" : "Member"}
                        </span>
                        <button onClick={(e) => memberMenu(m, e)} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer opacity-0 group-hover/m:opacity-100">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ───── BAN ───── */}
          {tab === "bans" && (
            <div>
              {loadingBans ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
              ) : bans.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-neutral-600 gap-2">
                  <Ban className="w-8 h-8 text-neutral-700" />
                  <p className="text-[13px]">Chưa có ai bị cấm.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {bans.map((b, bi) => {
                    const nm = b.user?.displayName || b.user?.username || b.userId;
                    return (
                      <div key={b.id || b.userId || bi} className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black text-white overflow-hidden flex-shrink-0 ${b.user?.avatarUrl ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(nm)}`}`}>
                          {b.user?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : initials(nm)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold text-neutral-100 truncate">{nm}</div>
                          {b.reason && <div className="text-[10px] text-neutral-500 truncate">Lý do: {b.reason}</div>}
                        </div>
                        <button onClick={() => unban(b)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer">
                          <Undo2 className="w-3.5 h-3.5" /> Gỡ ban
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
