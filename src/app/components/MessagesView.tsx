"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageCircle, Send, Loader2, Search, X, Trash2, ArrowLeft, Coins, Paperclip, FileAudio, FileText,
} from "lucide-react";
import { useDmStore } from "../store/useDmStore";
import { useCommunityStore } from "../store/useCommunityStore";
import { friendsApi, type FriendEntry, type PresenceStatus, type CommunityUser, type Attachment } from "../lib/communityApi";
import { chat } from "../lib/communitySocket";
import { MessageText, LinkPreviews } from "./MessageContent";
import ChatComposer, { type ChatComposerHandle } from "./ChatComposer";
import TransferDetailModal from "./TransferDetailModal";
import ImageLightbox from "./ImageLightbox";
import LevelBadge, { levelNameStyle } from "./LevelBadge";
import RankBadge from "./RankBadge";

const PRESENCE_DOT: Record<PresenceStatus, string> = {
  ONLINE: "bg-emerald-400", IDLE: "bg-amber-400", DND: "bg-rose-500", OFFLINE: "bg-neutral-600",
};
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
function initials(name?: string) { return name ? name.trim().slice(0, 2).toUpperCase() : "?"; }

function Avatar({ name, url, presence, size = 40 }: { name?: string; url?: string; presence?: PresenceStatus; size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div className={`w-full h-full rounded-2xl flex items-center justify-center font-black text-white overflow-hidden ${url ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(name)}`}`} style={{ fontSize: size * 0.34 }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : initials(name)}
      </div>
      {presence && <span className={`absolute -bottom-0.5 -right-0.5 rounded-full ${PRESENCE_DOT[presence]} ring-2 ring-[#08080f]`} style={{ width: size * 0.3, height: size * 0.3 }} />}
    </div>
  );
}

/**
 * Khu "Tin nhắn" — nhắn riêng 1-1 (DM kiểu Discord).
 * Trái: danh sách hội thoại. Phải: khung chat. Realtime qua chat socket.
 */
export default function MessagesView({ onOpenProfile, onOpenWallet }: { onOpenProfile?: (userId: string) => void; onOpenWallet?: () => void }) {
  const me = useCommunityStore((s) => s.user);
  const presenceMap = useCommunityStore((s) => s.presenceMap);
  const {
    conversations, activeId, messagesByConv, typingByConv, loadingConvs, loadingMsgs,
    loadConversations, selectConversation, openConversation, sendMessage, deleteMessage, bindRealtime,
  } = useDmStore();

  const [showNew, setShowNew] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [transferDetailId, setTransferDetailId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: { url: string; name: string }[]; index: number } | null>(null);
  const dragDepth = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const typingTimer = useRef<number | null>(null);

  useEffect(() => { bindRealtime(); loadConversations(); }, [bindRealtime, loadConversations]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages = activeId ? (messagesByConv[activeId] || []) : [];
  const typingUsers = activeId ? Array.from(typingByConv[activeId] || []) : [];

  // cuộn xuống cuối khi có tin mới / đổi hội thoại.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeId]);

  const presOf = (u?: CommunityUser): PresenceStatus =>
    (u && (presenceMap[u.id] || u.presence)) || "OFFLINE";

  const onTyping = () => {
    if (!activeId) return;
    chat.dmTypingStart(activeId);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => { if (activeId) chat.dmTypingStop(activeId); }, 1500);
  };

  const handleSend = async (content: string, attachments?: Attachment[]) => {
    if (!activeId) return;
    if (typingTimer.current) { window.clearTimeout(typingTimer.current); chat.dmTypingStop(activeId); }
    await sendMessage({ content, attachments });
  };

  // kéo-thả tệp vào khung chat.
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragDepth.current++; if (e.dataTransfer?.types?.includes("Files")) setIsDragOver(true); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) { dragDepth.current = 0; setIsDragOver(false); } };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragDepth.current = 0; setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length) composerRef.current?.addFiles(files);
  };

  return (
    <div className="flex-1 min-w-0 min-h-0 flex bg-[#08080f]">
      {/* Danh sách hội thoại */}
      <div className={`flex-shrink-0 w-[280px] flex flex-col border-r border-white/[0.06] bg-[#0a0a14] ${activeId ? "hidden md:flex" : "flex"}`}>
        <div className="h-[52px] flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0">
          <MessageCircle className="w-4.5 h-4.5 text-violet-300" />
          <span className="text-[14px] font-black text-white flex-1">Tin nhắn</span>
          <button
            onClick={() => setShowNew(true)}
            data-tip="Tin nhắn mới" data-tip-pos="bottom"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2">
          {loadingConvs ? (
            <div className="py-10 flex items-center justify-center"><Loader2 className="w-5 h-5 text-violet-400 animate-spin" /></div>
          ) : conversations.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center px-4">
              <MessageCircle className="w-8 h-8 text-violet-500/30" />
              <p className="text-[12px] text-neutral-500">Chưa có cuộc trò chuyện nào.</p>
              <button onClick={() => setShowNew(true)} className="mt-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold cursor-pointer transition-all">Bắt đầu trò chuyện</button>
            </div>
          ) : (
            conversations.map((c) => {
              const active = c.id === activeId;
              const nm = c.user?.displayName || c.user?.username || "Người dùng";
              const preview = c.lastMessage?.content || (c.lastMessage?.attachments?.length ? "[Tệp đính kèm]" : "");
              return (
                <button
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left transition-colors cursor-pointer ${active ? "bg-violet-500/15" : "hover:bg-white/[0.04]"}`}
                >
                  <Avatar name={nm} url={c.user?.avatarUrl} presence={presOf(c.user)} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 text-[13px] font-bold text-white truncate">{nm}</span>
                      {c.unread > 0 && <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black">{c.unread}</span>}
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">{preview}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Khung chat */}
      <div
        className={`relative flex-1 min-w-0 min-h-0 flex flex-col ${activeId ? "flex" : "hidden md:flex"}`}
        onDragEnter={activeConv ? onDragEnter : undefined}
        onDragOver={activeConv ? onDragOver : undefined}
        onDragLeave={activeConv ? onDragLeave : undefined}
        onDrop={activeConv ? onDrop : undefined}
      >
        {activeConv && isDragOver && (
          <div className="absolute inset-2 z-40 rounded-2xl border-2 border-dashed border-violet-400/60 bg-violet-600/15 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/20 flex items-center justify-center">
              <Paperclip className="w-7 h-7 text-violet-200" />
            </div>
            <p className="text-sm font-black text-white">Thả tệp để gửi</p>
          </div>
        )}
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-neutral-600">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center"><MessageCircle className="w-7 h-7 text-violet-500/40" /></div>
            <p className="text-[13px] text-neutral-500">Chọn một cuộc trò chuyện để bắt đầu.</p>
          </div>
        ) : (
          <>
            {/* Header hội thoại */}
            <div className="h-[52px] flex items-center gap-2.5 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
              <button onClick={() => selectConversation(null)} className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button onClick={() => activeConv.user?.id && onOpenProfile?.(activeConv.user.id)} className="flex items-center gap-2.5 cursor-pointer min-w-0">
                <Avatar name={activeConv.user?.displayName || activeConv.user?.username} url={activeConv.user?.avatarUrl} presence={presOf(activeConv.user)} size={32} />
                <div className="min-w-0 text-left">
                  <div className="text-[13px] font-black text-white truncate">{activeConv.user?.displayName || activeConv.user?.username || "Người dùng"}</div>
                  <div className="text-[10px] text-neutral-500">{typingUsers.length > 0 ? "đang nhập..." : "@" + (activeConv.user?.username || "")}</div>
                </div>
              </button>
            </div>

            {/* Tin nhắn */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3 flex flex-col gap-1">
              {loadingMsgs ? (
                <div className="py-10 flex items-center justify-center"><Loader2 className="w-5 h-5 text-violet-400 animate-spin" /></div>
              ) : messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                  <Avatar name={activeConv.user?.displayName || activeConv.user?.username} url={activeConv.user?.avatarUrl} size={56} />
                  <p className="text-[13px] font-bold text-white mt-1">{activeConv.user?.displayName || activeConv.user?.username}</p>
                  <p className="text-[12px] text-neutral-500">Đây là khởi đầu cuộc trò chuyện của bạn.</p>
                </div>
              ) : (
                messages.map((m, i) => {
                  const mine = m.senderId === me?.id;
                  const prev = messages[i - 1];
                  const grouped = !!prev && prev.senderId === m.senderId && (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000);
                  const isSystem = m.type === "SYSTEM";
                  const isCoin = isSystem && m.systemData?.kind === "COIN_TRANSFER";
                  // Ưu tiên card sender đính kèm trong tin (đã có level + rank đầy đủ),
                  // fallback về me / đối phương trong hội thoại.
                  const sender = mine ? (m.sender || me) : (m.sender || activeConv.user);
                  const name = sender?.displayName || sender?.username || "Người dùng";
                  const atts = (m.attachments || []).filter(Boolean);
                  const images = atts.filter((a) => (a.type || "").startsWith("image/"));
                  const videos = atts.filter((a) => (a.type || "").startsWith("video/"));
                  const audios = atts.filter((a) => (a.type || "").startsWith("audio/"));
                  const files = atts.filter((a) => { const t = a.type || ""; return !t.startsWith("image/") && !t.startsWith("video/") && !t.startsWith("audio/"); });

                  return (
                    <div key={m.id} className={`group/msg relative flex gap-3 items-start px-2 -mx-2 rounded-lg hover:bg-white/[0.02] ${grouped ? "mt-0.5 py-0.5" : "mt-3 py-1"}`}>
                      {/* cột avatar */}
                      <div className="w-9 flex-shrink-0 flex justify-center">
                        {grouped ? (
                          <span className="text-[9px] text-neutral-600 opacity-0 group-hover/msg:opacity-100 transition-opacity mt-1 select-none">
                            {new Date(m.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        ) : (
                          <button onClick={() => sender?.id && onOpenProfile?.(sender.id)} className="cursor-pointer hover:opacity-80 transition-opacity">
                            <Avatar name={name} url={sender?.avatarUrl} size={36} />
                          </button>
                        )}
                      </div>
                      {/* nội dung */}
                      <div className="flex-1 min-w-0">
                        {!grouped && (
                          <div className="flex items-baseline gap-2">
                            <button onClick={() => sender?.id && onOpenProfile?.(sender.id)} className="text-[13px] font-bold hover:underline cursor-pointer" style={levelNameStyle(sender?.level, sender?.levelStyle) || { color: mine ? "#c4b5fd" : "#7dd3fc" }}>{name}</button>
                            <LevelBadge level={sender?.level} style={sender?.levelStyle} />
                            <RankBadge rank={sender?.rank} />
                            <span className="text-[10px] text-neutral-600">{new Date(m.createdAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
                          </div>
                        )}

                        {isCoin ? (
                          // Thẻ chuyển xu: số xu lớn + lời nhắn. Bấm → xem chi tiết giao dịch.
                          <button
                            onClick={() => m.systemData?.transferId ? setTransferDetailId(m.systemData.transferId) : onOpenWallet?.()}
                            data-tip="Xem chi tiết giao dịch" data-tip-pos="right"
                            className="mt-1 inline-flex flex-col items-start px-4 py-3 rounded-2xl overflow-hidden border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-600/[0.06] text-left cursor-pointer transition-all hover:brightness-110 active:scale-[0.98] max-w-[280px]"
                          >
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300/80 mb-0.5">
                              <Coins className="w-3.5 h-3.5" /> {mine ? "Đã chuyển xu" : "Đã nhận xu"}
                            </div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[22px] font-black text-amber-300 leading-none tabular-nums">{(m.systemData?.amount ?? 0).toLocaleString("vi-VN")}</span>
                              <span className="text-[11px] font-bold text-amber-400/70">xu</span>
                            </div>
                            {(m.systemData?.note || m.content) && (
                              <div className="mt-1.5 pt-1.5 border-t border-amber-500/15 text-[12px] text-amber-100/90 break-words w-full">{m.systemData?.note || m.content}</div>
                            )}
                          </button>
                        ) : isSystem ? (
                          <div className="mt-1 inline-block px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[12px] text-neutral-300 break-words">{m.content || "Thông báo hệ thống"}</div>
                        ) : (
                          <>
                            {m.content && (
                              <div className="text-[13px] text-neutral-200 leading-relaxed break-words">
                                <MessageText content={m.content} />
                                {m.editedAt && <span className="text-[9px] text-neutral-600 ml-1.5">(đã sửa)</span>}
                              </div>
                            )}
                            {m.content && <LinkPreviews content={m.content} />}
                            {images.length > 0 && (
                              <div className={`mt-1.5 grid gap-1.5 ${images.length === 1 ? "grid-cols-1 max-w-[400px]" : "grid-cols-2 max-w-[420px]"}`}>
                                {images.map((a, ai) => (
                                  <button
                                    key={ai}
                                    onClick={() => setLightbox({ images: images.map((x) => ({ url: x.url, name: x.name })), index: ai })}
                                    className="block rounded-xl overflow-hidden border border-white/[0.08] bg-black/30 hover:border-violet-500/40 transition-all cursor-zoom-in"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={a.url} alt={a.name} className="w-full max-h-[300px] object-cover" loading="lazy" />
                                  </button>
                                ))}
                              </div>
                            )}
                            {videos.length > 0 && (
                              <div className="mt-1.5 flex flex-col gap-1.5 max-w-[400px]">
                                {videos.map((a, ai) => (<video key={ai} src={a.url} controls preload="metadata" className="w-full max-h-[320px] rounded-xl border border-white/[0.08] bg-black/40" />))}
                              </div>
                            )}
                            {audios.length > 0 && (
                              <div className="mt-1.5 flex flex-col gap-1.5 max-w-[360px]">
                                {audios.map((a, ai) => (
                                  <div key={ai} className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                                    <div className="flex items-center gap-2 mb-1.5"><FileAudio className="w-4 h-4 text-emerald-300 flex-shrink-0" /><span className="text-[12px] font-semibold text-neutral-200 truncate">{a.name}</span></div>
                                    <audio src={a.url} controls className="w-full h-8" />
                                  </div>
                                ))}
                              </div>
                            )}
                            {files.length > 0 && (
                              <div className="mt-1.5 flex flex-col gap-1.5 max-w-[360px]">
                                {files.map((a, ai) => (
                                  <a key={ai} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-violet-500/40 hover:bg-white/[0.06] transition-all">
                                    <FileText className="w-4 h-4 text-sky-300 flex-shrink-0" />
                                    <span className="text-[12px] font-semibold text-neutral-200 truncate">{a.name}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {/* nút xóa (chỉ tin thường của mình) */}
                      {mine && !isSystem && (
                        <button onClick={() => deleteMessage(m.id).catch(() => {})} data-tip="Xoá" data-tip-pos="left" className="opacity-0 group-hover/msg:opacity-100 transition-opacity text-neutral-600 hover:text-rose-400 cursor-pointer flex-shrink-0 mt-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  );
                })
              )}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-1 px-10 py-1 text-[11px] text-neutral-500">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: "120ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: "240ms" }} />
                  </span>
                </div>
              )}
            </div>

            {/* Khung nhập (dùng chung với chat cộng đồng) */}
            <ChatComposer
              ref={composerRef}
              autoFocus
              onSend={handleSend}
              onTyping={onTyping}
              placeholder={`Nhắn cho ${activeConv.user?.displayName || activeConv.user?.username || ""} · Markdown & Ctrl+V để dán tệp`}
            />
          </>
        )}
      </div>

      {showNew && (
        <NewDmModal
          onClose={() => setShowNew(false)}
          onPick={async (u) => { setShowNew(false); await openConversation(u); }}
        />
      )}

      {transferDetailId && (
        <TransferDetailModal transferId={transferDetailId} onClose={() => setTransferDetailId(null)} />
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
        />
      )}
    </div>
  );
}

// Modal chọn bạn để bắt đầu DM (chỉ trong danh sách bạn bè).
function NewDmModal({ onClose, onPick }: { onClose: () => void; onPick: (u: CommunityUser) => void }) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const presenceMap = useCommunityStore((s) => s.presenceMap);

  useEffect(() => {
    friendsApi.list().then(setFriends).catch(() => setFriends([])).finally(() => setLoading(false));
  }, []);

  const filtered = friends.filter((f) => {
    const nm = (f.user?.displayName || f.user?.username || "").toLowerCase();
    return nm.includes(q.trim().toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="relative w-full max-w-[420px] max-h-[70vh] glass rounded-2xl p-4 shadow-2xl animate-pop-in flex flex-col overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-black text-white">Tin nhắn mới</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Tìm bạn bè..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 transition-all" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="py-10 flex items-center justify-center"><Loader2 className="w-5 h-5 text-violet-400 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-neutral-600">{friends.length === 0 ? "Bạn chưa có bạn bè nào để nhắn tin." : "Không tìm thấy."}</p>
          ) : (
            filtered.map((f) => f.user && (
              <button key={f.id} onClick={() => onPick(f.user!)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer text-left">
                <Avatar name={f.user.displayName || f.user.username} url={f.user.avatarUrl} presence={(presenceMap[f.user.id] || f.user.presence) as PresenceStatus} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-white truncate">{f.user.displayName || f.user.username}</div>
                  <div className="text-[11px] text-neutral-500 truncate">@{f.user.username}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
