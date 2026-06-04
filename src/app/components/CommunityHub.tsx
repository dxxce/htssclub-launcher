"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Hash, Volume2, Plus, Send, Loader2, LogOut, Users,
  Crown, Shield, Circle, Trash2, Copy, ChevronDown, MessageSquare,
  Coins, X, DoorOpen, Sparkles, Mic, MicOff, Headphones, VolumeX, PhoneOff, Signal, Settings,
  UserPlus, Smile, ChevronLeft, ChevronRight, ImagePlus, FileText, Download, Pencil, GripVertical,
  Paperclip, FileVideo, FileAudio, Bold, Italic, Strikethrough, Code, Link2, Quote, List, Eye, EyeOff, Reply, SmilePlus,
  ScreenShare, ScreenShareOff, Video, Maximize2, Minimize2, MonitorPlay, Camera,
  Users2, MessageCircle, Check, Trophy,
} from "lucide-react";
import { useCommunityStore } from "../store/useCommunityStore";
import { useVoiceStore, type VoiceParticipantState } from "../store/useVoiceStore";
import { serversApi, uploadsApi, type PresenceStatus, type MemberRole, type Attachment } from "../lib/communityApi";
import ContextMenu, { ContextMenuState } from "./ContextMenu";
import { toast } from "./Toast";
import CommunityAccountSettings from "./CommunityAccountSettings";
import ServerSettings from "./ServerSettings";
import UserProfileModal from "./UserProfileModal";
import FriendsView from "./FriendsView";
import MessagesView from "./MessagesView";
import LeaderboardView from "./LeaderboardView";
import LevelUpOverlay from "./LevelUpOverlay";
import LevelBadge, { levelNameStyle, levelColors } from "./LevelBadge";
import RankBadge from "./RankBadge";
import { useDmStore } from "../store/useDmStore";
import { useLevelStore } from "../store/useLevelStore";
import WalletModal from "./WalletModal";
import VoiceSettingsModal from "./VoiceSettingsModal";
import ScreenSharePicker from "./ScreenSharePicker";
import { MessageText, LinkPreviews } from "./MessageContent";
import { openExternal } from "../lib/linkUtils";

interface CommunityHubProps {
  reloadKey?: number;
}

const PRESENCE_COLOR: Record<PresenceStatus, string> = {
  ONLINE: "text-emerald-400",
  IDLE: "text-amber-400",
  DND: "text-rose-400",
  OFFLINE: "text-neutral-600",
};
const PRESENCE_DOT_BG: Record<PresenceStatus, string> = {
  ONLINE: "bg-emerald-400",
  IDLE: "bg-amber-400",
  DND: "bg-rose-400",
  OFFLINE: "bg-neutral-600",
};
const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  ONLINE: "Trực tuyến",
  IDLE: "Chờ",
  DND: "Bận",
  OFFLINE: "Ngoại tuyến",
};
const ROLE_ICON: Record<MemberRole, typeof Crown> = {
  OWNER: Crown,
  ADMIN: Shield,
  MEMBER: Circle,
};

// bảng màu gradient avatar suy ra từ tên (cho đa dạng, không đơn điệu)
const AVATAR_GRADIENTS = [
  "from-indigo-500 to-fuchsia-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-purple-500",
];

// Bộ emoji thả nhanh khi hover/chuột phải tin nhắn.
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
function gradientFor(seed?: string) {
  if (!seed) return AVATAR_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function initials(name?: string) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

// ── Avatar tái sử dụng ───────────────────────────────────────────────────────
function Avatar({
  name, url, size = 36, presence, ring,
}: {
  name?: string;
  url?: string;
  size?: number;
  presence?: PresenceStatus;
  ring?: boolean;
}) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className={`w-full h-full rounded-2xl flex items-center justify-center font-black text-white overflow-hidden ${url ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(name)}`} ${ring ? "ring-2 ring-emerald-400" : ""}`}
        style={{ fontSize: size * 0.34 }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          initials(name)
        )}
      </div>
      {presence && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full ${PRESENCE_DOT_BG[presence]} ring-2 ring-[#0a0a14]`}
          style={{ width: size * 0.3, height: size * 0.3 }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal nhỏ dùng chung
// ─────────────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-[400px] glass rounded-2xl p-6 shadow-2xl animate-pop-in overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub chính — layout messenger hiện đại (KHÔNG theo kiểu Discord)
// ─────────────────────────────────────────────────────────────────────────────
export default function CommunityHub({ reloadKey }: CommunityHubProps) {
  const {
    user, authChecked, authLoading, bootstrap, logout, setPresence,
    servers, activeServerId, activeServer, channels, activeChannelId,
    messages, loadingServers, loadingMessages, socketConnected, presenceMap,
    unreadByChannel, voiceOccupancy, loadVoiceOccupancy,
    selectServer, selectChannel, createServer, joinServer, createChannel,
    updateChannel, deleteChannel, reorderChannels,
    sendMessage, deleteMessage, refreshMe, openAuthModal, reorderServers, toggleReaction,
  } = useCommunityStore();

  const voice = useVoiceStore();

  const [draft, setDraft] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [watchingStream, setWatchingStream] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<import("../lib/communityApi").Message | null>(null);
  const dragDepthRef = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Tự điều chỉnh chiều cao khung nhập theo nội dung (tối đa ~160px).
  // Khi rỗng → bỏ height inline để dùng chiều cao 1 dòng tự nhiên (tránh lỗi cao bất thường).
  const autoGrow = () => {
    const el = composerRef.current;
    if (!el) return;
    if (!el.value) { el.style.height = ""; return; }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // focus khung nhập chat ngay lập tức.
  const focusComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== el && active !== document.body && typeof active.blur === "function") {
      try { active.blur(); } catch {/* ignore */}
    }
    el.focus({ preventScroll: true });
    const len = el.value.length;
    try { el.setSelectionRange(len, len); } catch {/* ignore */}
  };

  // Focus bền hơn cho trường hợp sau hộp thoại native (WebView2 trả focus trễ):
  // thử ngay + vài mốc delay ngắn.
  const focusComposerSoon = () => {
    focusComposer();
    requestAnimationFrame(focusComposer);
    [50, 150, 300, 500].forEach((ms) => setTimeout(focusComposer, ms));
  };

  // Cờ: vừa mở hộp thoại chọn tệp → khi cửa sổ lấy lại focus thì focus ô chat.
  const wantFocusAfterDialogRef = useRef(false);
  useEffect(() => {
    const onWinFocus = () => {
      if (!wantFocusAfterDialogRef.current) return;
      wantFocusAfterDialogRef.current = false;
      focusComposerSoon();
    };
    window.addEventListener("focus", onWinFocus);
    return () => window.removeEventListener("focus", onWinFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đính kèm tệp: focus ô chat TRƯỚC rồi mới mở hộp thoại, đánh dấu để focus lại
  // khi cửa sổ giành lại focus sau khi dialog đóng.
  const openFilePicker = () => {
    wantFocusAfterDialogRef.current = true;
    focusComposer();
    fileInputRef.current?.click();
  };

  // ── Kéo-thả tệp vào khu chat ──────────────────────────────────────────────
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "copy"; } catch {/* ignore */}
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length) addFiles(files);
  };

  // Chèn/bọc cú pháp Markdown quanh đoạn đang chọn trong khung nhập.
  const applyMarkdown = (kind: "bold" | "italic" | "strike" | "code" | "codeblock" | "link" | "quote" | "list") => {
    const el = composerRef.current;
    if (!el) return;
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const sel = draft.slice(start, end);
    let before = "";
    let after = "";
    let block = false;
    let placeholder = sel;
    switch (kind) {
      case "bold": before = "**"; after = "**"; if (!sel) placeholder = "đậm"; break;
      case "italic": before = "*"; after = "*"; if (!sel) placeholder = "nghiêng"; break;
      case "strike": before = "~~"; after = "~~"; if (!sel) placeholder = "gạch"; break;
      case "code": before = "`"; after = "`"; if (!sel) placeholder = "mã"; break;
      case "codeblock": before = "```\n"; after = "\n```"; if (!sel) placeholder = "code"; block = true; break;
      case "link": before = "["; after = "](https://)"; if (!sel) placeholder = "nội dung"; break;
      case "quote": before = "> "; after = ""; if (!sel) placeholder = "trích dẫn"; block = true; break;
      case "list": before = "- "; after = ""; if (!sel) placeholder = "mục"; block = true; break;
    }
    const insert = `${before}${placeholder}${after}`;
    const next = draft.slice(0, start) + insert + draft.slice(end);
    setDraft(next);
    // đặt lại con trỏ: bọc quanh placeholder để gõ đè ngay
    const selStart = start + before.length;
    const selEnd = selStart + placeholder.length;
    requestAnimationFrame(() => {
      const t = composerRef.current;
      if (t) {
        t.focus({ preventScroll: true });
        try { t.setSelectionRange(selStart, selEnd); } catch {/* ignore */}
        autoGrow();
      }
    });
    void block;
  };
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File; preview: string; isImage: boolean }[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [showServerModal, setShowServerModal] = useState<null | "create" | "join">(null);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [editChannel, setEditChannel] = useState<import("../lib/communityApi").Channel | null>(null);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showSharePicker, setShowSharePicker] = useState(false);
  // View switcher: cộng đồng (server/chat) | bạn bè | tin nhắn | bảng xếp hạng.
  const [view, setView] = useState<"community" | "friends" | "messages" | "leaderboard">("community");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [hasNewWhileScrolled, setHasNewWhileScrolled] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: { url: string; name: string }[]; index: number } | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [walletTarget, setWalletTarget] = useState<import("../lib/communityApi").CommunityUser | null | undefined>(undefined);
  const atBottomRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [draggedServer, setDraggedServer] = useState<string | null>(null);
  const serverPillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const serverDragInfo = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const suppressServerClick = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Bind DM realtime + tải inbox khi đã đăng nhập (để badge chưa đọc cập nhật toàn cục).
  const dmUnread = useDmStore((s) => s.totalUnread());
  useEffect(() => {
    if (!user) return;
    const dm = useDmStore.getState();
    dm.bindRealtime();
    dm.loadConversations();
    // Level/XP realtime + tải tiến trình cấp độ của mình.
    const lv = useLevelStore.getState();
    lv.bindRealtime();
    lv.loadMyLevel();
  }, [user]);

  useEffect(() => {
    if (reloadKey && user) refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const channelMessages = activeChannelId ? messages[activeChannelId] || [] : [];

  // tự cuộn xuống cuối khi có tin mới — chỉ khi người dùng đang ở đáy.
  // Nếu đang cuộn lên xem tin cũ mà có tin mới → hiện chỉ báo "có tin nhắn mới".
  useEffect(() => {
    if (atBottomRef.current) {
      // dùng rAF để chờ DOM cập nhật xong
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
      });
    } else if (channelMessages.length > 0) {
      setHasNewWhileScrolled(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelMessages.length]);

  // khi đổi kênh: cuộn thẳng xuống đáy và coi như đang ở đáy.
  useEffect(() => {
    atBottomRef.current = true;
    setShowJump(false);
    setHasNewWhileScrolled(false);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    // mở kênh nào đó → tự focus vào khung nhập để gõ ngay.
    if (activeChannelId) focusComposer();
  }, [activeChannelId]);

  // mỗi khi danh sách tệp đính kèm thay đổi (thêm/xoá) → focus lại khung nhập.
  useEffect(() => {
    if (activeChannel) focusComposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles.length]);

  // đồng bộ chiều cao khung nhập theo nội dung (kể cả khi xoá hết sau khi gửi).
  useEffect(() => {
    autoGrow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const handleMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distanceFromBottom < 80;
    setShowJump(distanceFromBottom > 240);
    if (distanceFromBottom < 80) setHasNewWhileScrolled(false);
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      atBottomRef.current = true;
      setShowJump(false);
      setHasNewWhileScrolled(false);
    }
  };

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) || null,
    [channels, activeChannelId]
  );

  const isAdmin = useMemo(() => {
    if (!activeServer || !user) return false;
    const me = activeServer.members.find((m) => m.userId === user.id);
    return me?.role === "OWNER" || me?.role === "ADMIN";
  }, [activeServer, user]);

  const myRole: MemberRole = useMemo(() => {
    if (!activeServer || !user) return "MEMBER";
    return activeServer.members.find((m) => m.userId === user.id)?.role ?? "MEMBER";
  }, [activeServer, user]);

  // Server mặc định (isDefault): KHÔNG cho mời / rời / sao chép mã mời cho mọi người (kể cả admin).
  const canManageMembership = !activeServer?.isDefault;
  // Nút menu "⌄" chỉ hiện khi thực sự có mục nào đó để chọn.
  const hasServerMenu = canManageMembership || isAdmin;

  const userMap = useMemo(() => {
    const map: Record<string, { displayName?: string; username?: string; avatarUrl?: string }> = {};
    if (user) map[user.id] = user;
    activeServer?.members.forEach((mem) => {
      if (mem.user) map[mem.userId] = mem.user;
    });
    return map;
  }, [activeServer, user]);

  if (!authChecked || authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/25 to-fuchsia-500/10 border border-white/10 flex items-center justify-center shadow-[0_0_24px_rgba(139,92,246,0.25)]">
          <MessageSquare className="w-8 h-8 text-violet-300" />
        </div>
        <div>
          <h2 className="text-lg font-black text-white">Cộng đồng HTSS Club</h2>
          <p className="text-[13px] text-neutral-500 mt-1 max-w-[320px]">
            Đăng nhập để trò chuyện realtime, tham gia server và sử dụng ví xu cộng đồng.
          </p>
        </div>
        <button
          onClick={() => openAuthModal()}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold transition-all cursor-pointer active:scale-[0.98]"
        >
          Đăng nhập / Đăng ký
        </button>
      </div>
    );
  }

  const myPresence = presenceMap[user.id] || user.presence;

  const joinVoice = async (channelId: string, channelName: string) => {
    if (!activeServerId) return;
    try {
      await voice.join({
        channelId, channelName, serverId: activeServerId, myUserId: user.id,
        getSelf: () => ({ userId: user.id, displayName: user.displayName, username: user.username, avatarUrl: user.avatarUrl }),
      });
    } catch (err: any) {
      if (err?.message && err.message !== "mic-denied") toast.error(err.message);
    }
  };

  const MAX_FILES = 10;
  const VIDEO_MAX = 200 * 1024 * 1024; // 200MB cho video
  const FILE_MAX = 25 * 1024 * 1024;   // 25MB cho ảnh/âm thanh/tệp khác

  const sizeLimitFor = (f: File) => (f.type.startsWith("video/") ? VIDEO_MAX : FILE_MAX);
  const fmtMB = (n: number) => `${Math.round(n / 1024 / 1024)}MB`;

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setPendingFiles((prev) => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) {
        toast.error(`Tối đa ${MAX_FILES} tệp mỗi tin nhắn.`);
        return prev;
      }
      const next = [...prev];
      for (const f of arr.slice(0, room)) {
        const limit = sizeLimitFor(f);
        if (f.size > limit) {
          toast.error(`"${f.name}" quá lớn (tối đa ${fmtMB(limit)}).`);
          continue;
        }
        const isImage = f.type.startsWith("image/");
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file: f,
          preview: isImage ? URL.createObjectURL(f) : "",
          isImage,
        });
      }
      return next;
    });
    // sau khi thêm tệp → focus lại khung nhập để gõ kèm chú thích.
    focusComposerSoon();
  };

  const removeFile = (id: string) => {
    setPendingFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
    focusComposer();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const fs: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) fs.push(f);
      }
    }
    if (fs.length) {
      e.preventDefault();
      addFiles(fs);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if ((!text && pendingFiles.length === 0) || sending) return;
    setSending(true);
    const filesToSend = pendingFiles;
    const replyId = replyingTo?.id;
    setDraft("");
    setPendingFiles([]);
    setReplyingTo(null);
    try {
      let attachments: Attachment[] | undefined;
      if (filesToSend.length > 0) {
        const id = toast.loading(`Đang tải ${filesToSend.length} tệp...`);
        try {
          attachments = await Promise.all(
            filesToSend.map(async (pf) => {
              const a = await uploadsApi.attachment(pf.file);
              // backend trả {url,type,name,size}; bù dữ liệu nếu thiếu
              return {
                url: (a as any).url,
                type: (a as any).type || pf.file.type,
                name: (a as any).name || pf.file.name,
                size: (a as any).size || pf.file.size,
              } as Attachment;
            })
          );
          toast.update(id, "success", "Đã tải tệp xong.");
        } catch (err: any) {
          toast.update(id, "error", err?.message || "Tải tệp thất bại.");
          throw err;
        }
      }
      await sendMessage(text, attachments, replyId);
      filesToSend.forEach((pf) => URL.revokeObjectURL(pf.preview));
    } catch (err: any) {
      // khôi phục để người dùng thử lại
      setDraft(text);
      setPendingFiles(filesToSend);
      if (replyId && replyingTo) setReplyingTo(replyingTo);
      if (err?.message) toast.error(err.message);
    } finally {
      setSending(false);
      // sau khi gửi xong → focus lại khung nhập để gõ tiếp.
      focusComposer();
    }
  };

  // Bắt đầu trả lời 1 tin nhắn → hiện thanh trích dẫn + focus ô nhập.
  const startReply = (m: import("../lib/communityApi").Message) => {
    setReplyingTo(m);
    focusComposerSoon();
  };

  const handleLogout = () => {
    toast.promise(logout(), { loading: "Đang đăng xuất...", success: "Đã đăng xuất.", error: "Đăng xuất thất bại." });
  };

  const copyInvite = async () => {
    if (!activeServer) return;
    try {
      const r = await serversApi.invite(activeServer.id);
      await navigator.clipboard.writeText(r.inviteCode);
      toast.success("Đã sao chép mã mời.");
    } catch (err: any) {
      toast.error(err?.message || "Không tạo được mã mời.");
    }
  };

  const textChannels = channels.filter((c) => c.type === "TEXT");
  const voiceChannels = channels.filter((c) => c.type === "VOICE");

  // Kéo đổi vị trí server (pointer-based, hợp WebView2). Thứ tự được lưu trong store.
  const startServerDrag = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    serverDragInfo.current = { id, startX: e.clientX, moved: false };
    const handleMove = (ev: PointerEvent) => {
      const info = serverDragInfo.current;
      if (!info) return;
      if (!info.moved && Math.abs(ev.clientX - info.startX) < 5) return;
      info.moved = true;
      setDraggedServer(info.id);
      for (const [sid, el] of Object.entries(serverPillRefs.current)) {
        if (!el || sid === info.id) continue;
        const rect = el.getBoundingClientRect();
        if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
          reorderServers(info.id, sid);
          break;
        }
      }
    };
    const handleUp = () => {
      const info = serverDragInfo.current;
      if (info?.moved) suppressServerClick.current = true;
      serverDragInfo.current = null;
      setDraggedServer(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  // Menu chuột phải cho kênh (ADMIN+): sửa / xoá.
  const openChannelMenu = (ch: import("../lib/communityApi").Channel, e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setMenu({
      x: e.clientX, y: e.clientY, header: ch.name,
      items: [
        { label: "Sửa kênh", icon: Pencil, accent: "sky", onClick: () => setEditChannel(ch) },
        { type: "separator" },
        {
          label: "Xoá kênh", icon: Trash2, danger: true,
          onClick: () => toast.promise(deleteChannel(ch.id), {
            loading: "Đang xoá kênh...", success: "Đã xoá kênh.", error: (er) => er?.message || "Xoá kênh thất bại.",
          }),
        },
      ],
    });
  };

  const members = activeServer?.members || [];
  const onlineCount = members.filter((m) => (presenceMap[m.userId] || m.user?.presence) === "ONLINE").length;

  const openProfile = (userId: string) => { if (userId) setProfileId(userId); };

  // Menu chuột phải cho 1 người dùng (ở tin nhắn, danh sách thành viên, danh sách thoại).
  const openUserMenu = (e: React.MouseEvent, target: { userId: string; name?: string; avatarUrl?: string }) => {
    e.preventDefault();
    e.stopPropagation();
    const uid = target.userId;
    if (!uid) return;
    const isMe = uid === user.id;
    const inVoiceWithUser = (voice.connected || voice.connecting) && !!voice.participants[uid] && !isMe;
    const curVol = Math.round((voice.userVolumes[uid] ?? 1) * 100);

    const items: ContextMenuState["items"] = [
      { label: "Xem hồ sơ", icon: Users, accent: "violet", onClick: () => openProfile(uid) },
    ];

    if (!isMe) {
      items.push({ label: "Chuyển xu", icon: Coins, accent: "amber", onClick: () => {
        const mem = activeServer?.members.find((m) => m.userId === uid);
        const u = mem?.user || userMap[uid];
        setWalletTarget((u as any) ?? null);
      } });
    }

    // Điều khiển âm lượng khi đang chung kênh thoại với người này.
    if (inVoiceWithUser) {
      items.push({ type: "separator" });
      items.push({ type: "label", label: "Kênh thoại" });
      items.push({
        type: "slider",
        label: "Âm lượng",
        icon: Volume2,
        value: curVol,
        onValueChange: (v) => voice.setUserVolume(uid, v / 100),
      });
      const muted = curVol === 0;
      items.push({
        label: muted ? "Bật tiếng" : "Tắt tiếng người này",
        icon: muted ? Volume2 : VolumeX,
        accent: muted ? "emerald" : "rose",
        onClick: () => voice.setUserVolume(uid, muted ? 1 : 0),
      });
    }

    if (!isMe) {
      items.push({ type: "separator" });
      items.push({ label: "Sao chép ID", icon: Copy, onClick: () => { navigator.clipboard.writeText(uid); toast.success("Đã sao chép ID."); } });
    }

    setMenu({ x: e.clientX, y: e.clientY, header: target.name || "Người dùng", items });
  };

  return (
    <div
      className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden border border-white/[0.06] bg-[#08080f] relative"
      onContextMenu={(e) => {
        // Chặn menu chuột phải mặc định của WebView trong khu cộng đồng,
        // trừ khi đang ở ô nhập liệu (để vẫn dán/sao chép văn bản được).
        const el = e.target as HTMLElement;
        if (!el.closest("input, textarea")) e.preventDefault();
      }}
    >
      {/* ════════════ THANH "SPACES" NGANG TRÊN CÙNG ════════════ */}
      <div className="h-[60px] flex items-center gap-2 px-3 border-b border-white/[0.06] bg-[#0b0b16] flex-shrink-0 relative z-20">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex-shrink-0"
          data-tip={sidebarOpen ? "Ẩn danh sách kênh" : "Hiện danh sách kênh"}
          data-tip-pos="bottom"
        >
          <ChevronLeft className={`w-5 h-5 transition-transform ${sidebarOpen ? "" : "rotate-180"}`} />
        </button>

        {/* Bộ chọn khu vực (Cộng đồng / Bạn bè / Tin nhắn) — bấm để đổi màn hình */}
        <div className="relative pr-2 mr-1 border-r border-white/[0.06] flex-shrink-0">
          <button
            onClick={() => setViewMenuOpen((v) => !v)}
            className="group flex items-center gap-2 cursor-pointer"
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-[0_0_14px_rgba(139,92,246,0.4)] transition-transform group-hover:scale-105 ${
              view === "community" ? "bg-gradient-to-br from-violet-600 to-fuchsia-600"
              : view === "friends" ? "bg-gradient-to-br from-emerald-600 to-teal-600"
              : view === "leaderboard" ? "bg-gradient-to-br from-amber-500 to-orange-600"
              : "bg-gradient-to-br from-sky-600 to-indigo-600"
            }`}>
              {view === "community" ? <Sparkles className="w-4 h-4 text-white" />
                : view === "friends" ? <Users2 className="w-4 h-4 text-white" />
                : view === "leaderboard" ? <Trophy className="w-4 h-4 text-white" />
                : <MessageCircle className="w-4 h-4 text-white" />}
            </div>
            <span className="text-[13px] font-black text-white hidden md:block">
              {view === "community" ? "Cộng đồng" : view === "friends" ? "Bạn bè" : view === "leaderboard" ? "Xếp hạng" : "Tin nhắn"}
            </span>
            {dmUnread > 0 && view !== "messages" && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">{dmUnread > 99 ? "99+" : dmUnread}</span>
            )}
            <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${viewMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {viewMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setViewMenuOpen(false)} />
              <div className="absolute left-0 top-full mt-2 w-52 z-40 glass rounded-xl p-1.5 shadow-2xl animate-pop-in overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
                {([
                  { id: "community", label: "Cộng đồng", desc: "Server, kênh & thoại", Icon: Sparkles, grad: "from-violet-600 to-fuchsia-600" },
                  { id: "friends", label: "Bạn bè", desc: "Danh sách & lời mời", Icon: Users2, grad: "from-emerald-600 to-teal-600" },
                  { id: "messages", label: "Tin nhắn", desc: "Nhắn riêng 1-1", Icon: MessageCircle, grad: "from-sky-600 to-indigo-600" },
                  { id: "leaderboard", label: "Bảng xếp hạng", desc: "Cấp độ & xu", Icon: Trophy, grad: "from-amber-500 to-orange-600" },
                ] as const).map(({ id, label, desc, Icon, grad }) => (
                  <button
                    key={id}
                    onClick={() => { setView(id); setViewMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all cursor-pointer ${
                      view === id ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className={`relative w-8 h-8 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                      {id === "messages" && dmUnread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-[#0b0b16]">{dmUnread > 99 ? "99+" : dmUnread}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-white">{label}</div>
                      <div className="text-[10px] text-neutral-500 truncate">{desc}</div>
                    </div>
                    {view === id && <Check className="w-4 h-4 text-violet-300 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Danh sách spaces (server) dạng pill ngang — chỉ ở khu Cộng đồng */}
        {view === "community" ? (
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-1">
          {loadingServers ? (
            <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
          ) : servers.length === 0 ? (
            <span className="text-[12px] text-neutral-600">Chưa tham gia server nào</span>
          ) : (
            servers.map((srv, si) => {
              const active = srv.id === activeServerId;
              const isDragging = draggedServer === srv.id;
              return (
                <button
                  key={srv.id || `srv-${si}`}
                  ref={(el) => { serverPillRefs.current[srv.id] = el; }}
                  onPointerDown={(e) => startServerDrag(srv.id, e)}
                  onClick={() => {
                    if (suppressServerClick.current) { suppressServerClick.current = false; return; }
                    selectServer(srv.id);
                  }}
                  style={{ touchAction: "none" }}
                  className={`group flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border whitespace-nowrap flex-shrink-0 ${
                    isDragging
                      ? "transition-none opacity-80 scale-105 cursor-grabbing z-10 shadow-xl shadow-black/50"
                      : "transition-all cursor-grab"
                  } ${
                    active
                      ? "bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 border-violet-500/50 text-white shadow-[0_0_14px_rgba(139,92,246,0.2)]"
                      : "bg-white/[0.03] border-white/[0.06] text-neutral-400 hover:text-white hover:bg-white/[0.07]"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white overflow-hidden pointer-events-none ${srv.iconUrl ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(srv.name)}`}`}>
                    {srv.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={srv.iconUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initials(srv.name)
                    )}
                  </span>
                  <span className="text-[12px] font-bold pointer-events-none">{srv.name}</span>
                </button>
              );
            })
          )}
          <button
            onClick={() => setShowServerModal("create")}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.03] border border-dashed border-white/15 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/40 transition-all cursor-pointer flex-shrink-0"
            data-tip="Tạo / tham gia server"
            data-tip-pos="bottom"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        ) : (
          <div className="flex-1 min-w-0" />
        )}
      </div>

      {/* ════════════ THÂN: theo khu vực đang chọn ════════════ */}
      {view === "friends" ? (
        <FriendsView onOpenProfile={openProfile} />
      ) : view === "messages" ? (
        <MessagesView onOpenProfile={openProfile} onOpenWallet={() => setWalletTarget(null)} />
      ) : view === "leaderboard" ? (
        <LeaderboardView onOpenProfile={openProfile} />
      ) : (
      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar kênh ── */}
        <div
          className={`flex-shrink-0 flex flex-col bg-[#0a0a14] border-r border-white/[0.06] transition-all duration-300 overflow-hidden ${
            sidebarOpen ? "w-[260px]" : "w-0 border-r-0"
          }`}
        >
          {!activeServer ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-violet-500/50" />
              </div>
              <p className="text-[12px] text-neutral-500">Chọn một server ở trên hoặc tạo mới để bắt đầu.</p>
              <button
                onClick={() => setShowServerModal("create")}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-bold transition-all cursor-pointer"
              >
                Tạo server
              </button>
            </div>
          ) : (
            <>
              {/* Hero server */}
              <div className="p-3.5 border-b border-white/[0.06] flex-shrink-0">
                <div className="relative rounded-2xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/10 border border-white/[0.08] p-3 overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
                  <div className="flex items-center gap-2.5">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white overflow-hidden flex-shrink-0 ${activeServer.iconUrl ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(activeServer.name)}`}`}>
                      {activeServer.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={activeServer.iconUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        initials(activeServer.name)
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-black text-white truncate">{activeServer.name}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{onlineCount} online</span>
                        <span>·</span>
                        <span>{members.length} thành viên</span>
                      </div>
                    </div>
                  </div>
                  {hasServerMenu && (
                  <div className="flex items-center gap-1.5 mt-3">
                    {canManageMembership && (
                      <button
                        onClick={copyInvite}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[11px] font-bold text-neutral-200 transition-all cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Mời
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => setShowChannelModal(true)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[11px] font-bold text-neutral-200 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Kênh
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => setShowServerSettings(true)}
                        data-tip="Quản trị server"
                        data-tip-pos="bottom"
                        className="w-8 flex items-center justify-center py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 hover:text-violet-300 transition-all cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {hasServerMenu && (
                      <button
                        onClick={(e) => {
                          setMenu({
                            x: e.clientX, y: e.clientY, header: activeServer.name,
                            items: [
                              ...(canManageMembership ? [{ label: "Sao chép mã mời", icon: Copy, accent: "sky" as const, onClick: copyInvite }] : []),
                              ...(isAdmin ? [{ label: "Quản trị server", icon: Settings, accent: "violet" as const, onClick: () => setShowServerSettings(true) }] : []),
                              ...(isAdmin ? [{ label: "Tạo kênh", icon: Plus, accent: "emerald" as const, onClick: () => setShowChannelModal(true) }] : []),
                              ...(canManageMembership ? [
                                { type: "separator" as const },
                                {
                                  label: "Rời server", icon: DoorOpen, danger: true,
                                  onClick: () => toast.promise(serversApi.leave(activeServer.id).then(() => useCommunityStore.getState().loadServers()), { loading: "Đang rời server...", success: "Đã rời server.", error: "Rời server thất bại." }),
                                },
                              ] : []),
                            ],
                          });
                        }}
                        className="w-8 flex items-center justify-center py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 transition-all cursor-pointer"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  )}
                </div>
              </div>

              {/* Danh sách kênh */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2.5 py-3">
                <ChannelGroup
                  title="Văn bản"
                  icon={Hash}
                  channels={textChannels}
                  activeChannelId={activeChannelId}
                  unreadMap={unreadByChannel}
                  onSelect={(id) => { selectChannel(id); setShowMembers(false); }}
                  canAdd={isAdmin}
                  onAdd={() => setShowChannelModal(true)}
                  isAdmin={isAdmin}
                  onContextMenu={openChannelMenu}
                  onReorder={(s, t) => reorderChannels(s, t).catch((er: any) => toast.error(er?.message || "Sắp xếp thất bại."))}
                />
                <VoiceChannelGroup
                  channels={voiceChannels}
                  activeVoiceChannelId={voice.connected || voice.connecting ? voice.channelId : null}
                  participants={voice.participants}
                  occupancy={voiceOccupancy}
                  myUserId={user.id}
                  userVolumes={voice.userVolumes}
                  onJoin={joinVoice}
                  onUserClick={openProfile}
                  onUserContextMenu={openUserMenu}
                  onWatchStream={(uid) => setWatchingStream(uid)}
                  canAdd={isAdmin}
                  onAdd={() => setShowChannelModal(true)}
                  isAdmin={isAdmin}
                  onContextMenu={openChannelMenu}
                  onReorder={(s, t) => reorderChannels(s, t).catch((er: any) => toast.error(er?.message || "Sắp xếp thất bại."))}
                />
              </div>

              {/* Điều khiển thoại khi đang kết nối */}
              {(voice.connected || voice.connecting) && voice.channelId && (
                <VoiceControlBar
                  channelName={voice.channelName || "Kênh thoại"}
                  connecting={voice.connecting}
                  connected={voice.connected}
                  muted={voice.selfMuted}
                  deafened={voice.selfDeafened}
                  streaming={voice.selfStreaming}
                  onToggleMute={voice.toggleMute}
                  onToggleDeafen={voice.toggleDeafen}
                  onLeave={() => voice.leave()}
                  onOpenSettings={() => setShowVoiceSettings(true)}
                  onStartScreen={() => setShowSharePicker(true)}
                  onStartCamera={() => voice.startCamera().catch(() => {})}
                  onStopStream={() => voice.stopStream().catch(() => {})}
                />
              )}
            </>
          )}
        </div>

        {/* ── Khu chat (giữa) ── */}
        <div
          className="relative flex-1 min-w-0 min-h-0 flex flex-col bg-[#08080f]"
          onDragEnter={activeChannel ? onDragEnter : undefined}
          onDragOver={activeChannel ? onDragOver : undefined}
          onDragLeave={activeChannel ? onDragLeave : undefined}
          onDrop={activeChannel ? onDrop : undefined}
        >
          {/* Lớp phủ khi kéo tệp vào */}
          {activeChannel && isDragOver && (
            <div className="absolute inset-2 z-40 rounded-2xl border-2 border-dashed border-violet-400/60 bg-violet-600/15 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/20 flex items-center justify-center">
                <Paperclip className="w-7 h-7 text-violet-200" />
              </div>
              <p className="text-sm font-black text-white">Thả tệp để đính kèm</p>
              <p className="text-[12px] text-violet-200/80">Ảnh, video, âm thanh hoặc tệp bất kỳ</p>
            </div>
          )}
          {/* Trình xem chia sẻ màn hình / camera */}
          {watchingStream && voice.videos[watchingStream] && (
            <StreamViewer
              video={voice.videos[watchingStream]}
              name={voice.participants[watchingStream]?.displayName || voice.participants[watchingStream]?.username || userMap[watchingStream]?.displayName || userMap[watchingStream]?.username || "Người dùng"}
              onClose={() => setWatchingStream(null)}
            />
          )}
          {!activeChannel ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-neutral-600 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center">
                <MessageSquare className="w-7 h-7 text-violet-500/40" />
              </div>
              <p className="text-sm font-semibold">{activeServer ? "Chọn một kênh để bắt đầu trò chuyện." : "Chào mừng đến HTSS Community."}</p>
            </div>
          ) : (
            <>
              {/* Header kênh */}
              <div className="h-[52px] flex items-center gap-3 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
                <div className="w-8 h-8 rounded-xl bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                  <Hash className="w-4 h-4 text-violet-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-black text-white leading-tight truncate">{activeChannel.name}</div>
                  {activeChannel.topic && <div className="text-[10px] text-neutral-500 truncate">{activeChannel.topic}</div>}
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.04] text-[10px] font-bold">
                    <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? "bg-emerald-400" : "bg-neutral-600"}`} />
                    <span className={socketConnected ? "text-emerald-400" : "text-neutral-500"}>{socketConnected ? "Realtime" : "Offline"}</span>
                  </span>
                  {/* Avatar chồng + mở panel thành viên */}
                  <button
                    onClick={() => setShowMembers((v) => !v)}
                    className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                      showMembers ? "bg-violet-500/15 border-violet-500/40 text-violet-200" : "bg-white/[0.04] border-white/[0.08] text-neutral-300 hover:bg-white/[0.08]"
                    }`}
                    data-tip="Thành viên"
                    data-tip-pos="bottom"
                  >
                    <div className="flex -space-x-2">
                      {members.slice(0, 3).map((m, i) => (
                        <div key={m.id || m.userId || i} className="ring-2 ring-[#0a0a14] rounded-full">
                          <Avatar name={m.user?.displayName || m.user?.username} url={m.user?.avatarUrl} size={20} />
                        </div>
                      ))}
                    </div>
                    <span className="text-[11px] font-bold">{members.length}</span>
                  </button>
                </div>
              </div>

              {/* Tin nhắn — dạng bong bóng */}
              <div className="relative flex-1 min-h-0">
              <div ref={scrollRef} onScroll={handleMessagesScroll} className="absolute inset-0 overflow-y-auto custom-scrollbar px-4 py-4 flex flex-col">
                {loadingMessages && channelMessages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                  </div>
                ) : channelMessages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                      <Hash className="w-6 h-6 text-violet-400/60" />
                    </div>
                    <p className="text-[13px] text-neutral-400">Mở đầu cuộc trò chuyện tại <span className="text-violet-300 font-bold">#{activeChannel.name}</span></p>
                  </div>
                ) : (
                  <>
                  {/* spacer đẩy tin xuống đáy khi ít tin */}
                  <div className="flex-1 min-h-0" />
                  {channelMessages.map((m, i) => {
                    const prev = channelMessages[i - 1];
                    const grouped = !!prev && prev.authorId === m.authorId &&
                      new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
                    const author = m.author || userMap[m.authorId];
                    const name = author?.displayName || author?.username || "Người dùng";
                    const mine = m.authorId === user.id;
                    const atts = (m.attachments || []).filter(Boolean);
                    const images = atts.filter((a) => (a.type || "").startsWith("image/"));
                    const videos = atts.filter((a) => (a.type || "").startsWith("video/"));
                    const audios = atts.filter((a) => (a.type || "").startsWith("audio/"));
                    const files = atts.filter((a) => {
                      const t = a.type || "";
                      return !t.startsWith("image/") && !t.startsWith("video/") && !t.startsWith("audio/");
                    });
                    return (
                      <div
                        key={m.id || `msg-${i}`}
                        id={`msg-${m.id}`}
                        className={`group/msg relative flex gap-3 items-start px-2 -mx-2 rounded-lg hover:bg-white/[0.02] ${grouped ? "mt-0.5 py-0.5" : "mt-3 py-1"}`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({
                            x: e.clientX, y: e.clientY, header: name,
                            items: [
                              { label: "Trả lời", icon: Reply, accent: "violet" as const, onClick: () => startReply(m) },
                              ...REACTION_EMOJIS.map((em) => ({
                                label: `Thả ${em}`, onClick: () => toggleReaction(m.id, em),
                              })),
                              ...(m.content ? [{ type: "separator" as const }, { label: "Sao chép nội dung", icon: Copy, onClick: () => { navigator.clipboard.writeText(m.content); toast.success("Đã sao chép."); } }] : []),
                              ...(mine || isAdmin ? [
                                { type: "separator" as const },
                                { label: "Xoá tin nhắn", icon: Trash2, danger: true, onClick: () => deleteMessage(m.id).catch((err: any) => toast.error(err?.message || "Xoá thất bại.")) },
                              ] : []),
                            ],
                          });
                        }}
                      >
                        {/* cột avatar: avatar khi không nhóm, giờ mờ khi nhóm */}
                        <div className="w-9 flex-shrink-0 flex justify-center">
                          {grouped ? (
                            <span className="text-[9px] text-neutral-600 opacity-0 group-hover/msg:opacity-100 transition-opacity mt-1 select-none">
                              {new Date(m.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : (
                            <button
                              onClick={() => openProfile(m.authorId)}
                              onContextMenu={(e) => openUserMenu(e, { userId: m.authorId, name, avatarUrl: author?.avatarUrl })}
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                            >
                              <Avatar name={name} url={author?.avatarUrl} size={36} />
                            </button>
                          )}
                        </div>
                        {/* nội dung */}
                        <div className="flex-1 min-w-0">
                          {/* khối trích dẫn tin được trả lời */}
                          {m.replyToId && (
                            <button
                              onClick={() => {
                                const el = document.getElementById(`msg-${m.replyToId}`);
                                if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("reply-flash"); setTimeout(() => el.classList.remove("reply-flash"), 1200); }
                              }}
                              className="flex items-center gap-1.5 mb-0.5 max-w-full text-left cursor-pointer group/rep"
                            >
                              <span className="w-4 h-3 border-l-2 border-t-2 border-white/20 rounded-tl-md flex-shrink-0 ml-1" />
                              {m.replyTo === null ? (
                                <span className="text-[11px] text-neutral-600 italic truncate">Tin nhắn đã bị xoá</span>
                              ) : m.replyTo ? (
                                <>
                                  <Avatar name={m.replyTo.author?.displayName || m.replyTo.author?.username} url={m.replyTo.author?.avatarUrl} size={14} />
                                  <span className="text-[11px] font-bold text-neutral-400 group-hover/rep:text-neutral-200 flex-shrink-0">{m.replyTo.author?.displayName || m.replyTo.author?.username || "Người dùng"}</span>
                                  <span className="text-[11px] text-neutral-600 group-hover/rep:text-neutral-400 truncate">
                                    {m.replyTo.content ? m.replyTo.content.slice(0, 120) : (m.replyTo.hasAttachments ? "📎 đính kèm" : "")}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[11px] text-neutral-600 italic truncate">Trả lời một tin nhắn</span>
                              )}
                            </button>
                          )}
                          {!grouped && (
                            <div className="flex items-baseline gap-2">
                              <button
                                onClick={() => openProfile(m.authorId)}
                                onContextMenu={(e) => openUserMenu(e, { userId: m.authorId, name, avatarUrl: author?.avatarUrl })}
                                className="text-[13px] font-bold hover:underline cursor-pointer"
                                style={levelNameStyle((author as any)?.level, (author as any)?.levelStyle) || { color: mine ? "#c4b5fd" : "#7dd3fc" }}
                              >{name}</button>
                              <LevelBadge level={(author as any)?.level} style={(author as any)?.levelStyle} />
                              <RankBadge rank={(author as any)?.rank} />
                              <span className="text-[10px] text-neutral-600">
                                {new Date(m.createdAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                              </span>
                            </div>
                          )}
                          {m.content && (
                            <div className="text-[13px] text-neutral-200 leading-relaxed break-words">
                              <MessageText content={m.content} />
                              {m.editedAt && <span className="text-[9px] text-neutral-600 ml-1.5">(đã sửa)</span>}
                            </div>
                          )}
                          {/* xem trước link (Open Graph) */}
                          {m.content && <LinkPreviews content={m.content} />}
                          {/* ảnh đính kèm */}
                          {images.length > 0 && (
                            <div className={`mt-1.5 grid gap-1.5 ${images.length === 1 ? "grid-cols-1 max-w-[400px]" : "grid-cols-2 max-w-[420px]"}`}>
                              {images.map((a, ai) => (
                                <button
                                  key={ai}
                                  onClick={() => setLightbox({ images: images.map((x) => ({ url: x.url, name: x.name })), index: ai })}
                                  className="block rounded-xl overflow-hidden border border-white/[0.08] bg-black/30 hover:border-violet-500/40 transition-all cursor-zoom-in"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={a.url} alt={a.name} className="w-full max-h-[300px] object-cover" loading="lazy" onLoad={() => { if (atBottomRef.current) bottomRef.current?.scrollIntoView({ block: "end" }); }} />
                                </button>
                              ))}
                            </div>
                          )}
                          {/* video đính kèm */}
                          {videos.length > 0 && (
                            <div className="mt-1.5 flex flex-col gap-1.5 max-w-[400px]">
                              {videos.map((a, ai) => (
                                <video key={ai} src={a.url} controls preload="metadata" className="w-full max-h-[320px] rounded-xl border border-white/[0.08] bg-black/40" />
                              ))}
                            </div>
                          )}
                          {/* âm thanh đính kèm */}
                          {audios.length > 0 && (
                            <div className="mt-1.5 flex flex-col gap-1.5 max-w-[360px]">
                              {audios.map((a, ai) => (
                                <div key={ai} className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <FileAudio className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                                    <span className="text-[12px] font-semibold text-neutral-200 truncate">{a.name}</span>
                                  </div>
                                  <audio src={a.url} controls className="w-full h-8" />
                                </div>
                              ))}
                            </div>
                          )}
                          {/* tệp khác */}
                          {files.length > 0 && (
                            <div className="mt-1.5 flex flex-col gap-1.5 max-w-[360px]">
                              {files.map((a, ai) => (
                                <a
                                  key={ai}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-violet-500/40 hover:bg-white/[0.06] transition-all group/file"
                                >
                                  <FileText className="w-5 h-5 text-violet-300 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[12px] font-semibold text-neutral-200 truncate">{a.name}</div>
                                    <div className="text-[10px] text-neutral-500">{(a.size / 1024).toFixed(0)} KB</div>
                                  </div>
                                  <Download className="w-4 h-4 text-neutral-500 group-hover/file:text-white transition-colors flex-shrink-0" />
                                </a>
                              ))}
                            </div>
                          )}
                          {/* chip reactions */}
                          {m.reactions && m.reactions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {m.reactions.map((r) => (
                                <button
                                  key={r.emoji}
                                  onClick={() => toggleReaction(m.id, r.emoji)}
                                  className={`flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-[12px] font-bold border transition-all cursor-pointer ${
                                    r.me ? "bg-violet-500/20 border-violet-500/50 text-violet-100" : "bg-white/[0.04] border-white/[0.08] text-neutral-300 hover:bg-white/[0.08]"
                                  }`}
                                  data-tip={r.userIds.length ? `${r.count} người` : undefined}
                                >
                                  <span className="text-[13px] leading-none">{r.emoji}</span>
                                  <span className="leading-none">{r.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* nút thao tác nổi khi hover (góc phải trên) */}
                        <div className="absolute -top-3 right-2 hidden group-hover/msg:flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#15151f] shadow-lg p-0.5 z-10">
                          {REACTION_EMOJIS.slice(0, 4).map((em) => (
                            <button
                              key={em}
                              onClick={() => toggleReaction(m.id, em)}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-[15px] hover:bg-white/[0.08] transition-colors cursor-pointer"
                              data-tip={`Thả ${em}`}
                              data-tip-pos="top"
                            >
                              {em}
                            </button>
                          ))}
                          <button
                            onClick={(e) => {
                              setMenu({
                                x: e.clientX, y: e.clientY, header: "Thả cảm xúc",
                                items: REACTION_EMOJIS.map((em) => ({ label: `Thả ${em}`, onClick: () => toggleReaction(m.id, em) })),
                              });
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                            data-tip="Cảm xúc khác"
                            data-tip-pos="top"
                          >
                            <SmilePlus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => startReply(m)}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-400 hover:text-violet-300 hover:bg-white/[0.08] transition-colors cursor-pointer"
                            data-tip="Trả lời"
                            data-tip-pos="top"
                          >
                            <Reply className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} className="h-0" />
                  </>
                )}
              </div>
              {/* Nút nhảy xuống tin mới nhất */}
              {(showJump || hasNewWhileScrolled) && (
                <button
                  onClick={jumpToBottom}
                  className={`absolute bottom-4 right-5 z-10 flex items-center gap-1.5 pl-3 pr-3.5 py-2 rounded-full text-white text-[12px] font-bold transition-all cursor-pointer animate-pop-in ${
                    hasNewWhileScrolled
                      ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-[0_8px_24px_rgba(139,92,246,0.5)]"
                      : "bg-violet-600 hover:bg-violet-500 shadow-[0_8px_24px_rgba(139,92,246,0.4)]"
                  }`}
                >
                  {hasNewWhileScrolled ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Có tin nhắn mới
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Xuống cuối
                    </>
                  )}
                </button>
              )}
              </div>

              {/* Composer */}
              <div className="px-4 pb-4 pt-1 flex-shrink-0">
                {/* thanh trả lời */}
                {replyingTo && (
                  <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                    <Reply className="w-3.5 h-3.5 text-violet-300 flex-shrink-0" />
                    <span className="text-[11px] text-neutral-400 flex-shrink-0">Đang trả lời</span>
                    <span className="text-[11px] font-bold text-violet-300 flex-shrink-0">
                      {replyingTo.author?.displayName || replyingTo.author?.username || userMap[replyingTo.authorId]?.displayName || userMap[replyingTo.authorId]?.username || "Người dùng"}
                    </span>
                    <span className="text-[11px] text-neutral-500 truncate flex-1 min-w-0">
                      {replyingTo.content ? replyingTo.content.slice(0, 120) : ((replyingTo.attachments?.length) ? "📎 đính kèm" : "")}
                    </span>
                    <button
                      onClick={() => setReplyingTo(null)}
                      className="w-5 h-5 flex items-center justify-center rounded-md text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {/* preview tệp đang chờ gửi */}
                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                    {pendingFiles.map((pf) => (
                      <div key={pf.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 group/pf bg-white/[0.04]">
                        {pf.isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pf.preview} alt={pf.file.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center px-1 gap-1">
                            {pf.file.type.startsWith("video/") ? <FileVideo className="w-6 h-6 text-violet-300" />
                              : pf.file.type.startsWith("audio/") ? <FileAudio className="w-6 h-6 text-emerald-300" />
                              : <FileText className="w-6 h-6 text-sky-300" />}
                            <span className="text-[8px] text-neutral-400 text-center leading-tight line-clamp-2 break-all">{pf.file.name}</span>
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(pf.id)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-rose-500 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {pendingFiles.length < MAX_FILES && (
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={openFilePicker}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-white/15 flex items-center justify-center text-neutral-500 hover:text-violet-300 hover:border-violet-500/40 transition-all cursor-pointer"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                )}

                <div className="rounded-2xl bg-white/[0.04] border border-white/10 focus-within:border-violet-500/50 transition-all overflow-hidden">
                  {/* Thanh định dạng Markdown */}
                  <div className="flex items-center gap-0.5 px-2 pt-1.5">
                    {([
                      { k: "bold", Icon: Bold, tip: "Đậm  **text**" },
                      { k: "italic", Icon: Italic, tip: "Nghiêng  *text*" },
                      { k: "strike", Icon: Strikethrough, tip: "Gạch ngang  ~~text~~" },
                      { k: "code", Icon: Code, tip: "Mã  `text`" },
                      { k: "link", Icon: Link2, tip: "Liên kết  [text](url)" },
                      { k: "quote", Icon: Quote, tip: "Trích dẫn  > text" },
                      { k: "list", Icon: List, tip: "Danh sách  - text" },
                    ] as const).map(({ k, Icon, tip }) => (
                      <button
                        key={k}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyMarkdown(k); }}
                        data-tip={tip}
                        data-tip-pos="top"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-500 hover:text-violet-300 hover:bg-white/[0.06] transition-all cursor-pointer"
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                    <div className="flex-1" />
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setShowPreview((v) => !v); }}
                      data-tip={showPreview ? "Ẩn xem trước" : "Xem trước Markdown"}
                      data-tip-pos="top"
                      className={`flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        showPreview ? "bg-violet-500/20 text-violet-200" : "text-neutral-500 hover:text-violet-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      Xem trước
                    </button>
                  </div>

                  {/* Bảng xem trước Markdown */}
                  {showPreview && draft.trim() && (
                    <div className="mx-2 mt-1.5 p-2.5 rounded-xl bg-black/30 border border-white/[0.08] max-h-48 overflow-y-auto custom-scrollbar">
                      <div className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-1">Xem trước</div>
                      <div className="text-[13px] text-neutral-200 leading-relaxed break-words">
                        <MessageText content={draft} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-end gap-2 px-2 pb-1.5 pt-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                    />
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={openFilePicker}
                      className="p-2 rounded-xl text-neutral-500 hover:text-violet-300 hover:bg-white/[0.05] transition-all cursor-pointer flex-shrink-0"
                      data-tip="Đính kèm tệp"
                      data-tip-pos="top"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <textarea
                      ref={composerRef}
                      value={draft}
                      autoFocus
                      onChange={(e) => { setDraft(e.target.value); autoGrow(); }}
                      onPaste={handlePaste}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      rows={1}
                      placeholder={`Nhắn tin tới #${activeChannel.name} · Markdown & Ctrl+V để dán tệp`}
                      className="flex-1 bg-transparent resize-none outline-none text-[13px] text-neutral-100 placeholder:text-neutral-600 min-h-[24px] max-h-40 py-2 leading-relaxed custom-scrollbar"
                    />
                    <button className="p-2 rounded-xl text-neutral-500 hover:text-amber-300 hover:bg-white/[0.05] transition-all cursor-pointer flex-shrink-0" data-tip="Cảm xúc (sắp có)" data-tip-pos="top">
                      <Smile className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={(!draft.trim() && pendingFiles.length === 0) || sending}
                      className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white transition-all cursor-pointer active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Panel thành viên (trượt từ phải, overlay) ── */}
          {activeServer && (
            <>
              {showMembers && <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setShowMembers(false)} />}
              <div
                className={`absolute top-0 right-0 bottom-0 z-30 w-[260px] bg-[#0b0b16] border-l border-white/[0.08] shadow-2xl flex flex-col transition-transform duration-300 ${
                  showMembers ? "translate-x-0" : "translate-x-full"
                }`}
              >
                <div className="h-[52px] flex items-center justify-between px-4 border-b border-white/[0.06] flex-shrink-0">
                  <span className="flex items-center gap-2 text-[12px] font-black text-white">
                    <Users className="w-4 h-4 text-violet-300" /> Thành viên — {members.length}
                  </span>
                  <button onClick={() => setShowMembers(false)} className="p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-2.5 py-3 flex flex-col gap-0.5">
                  <MemberSection label={`Trực tuyến — ${onlineCount}`} members={members.filter((m) => (presenceMap[m.userId] || m.user?.presence) === "ONLINE")} presenceMap={presenceMap} onSelect={openProfile} onContextMenu={openUserMenu} />
                  <MemberSection label="Khác" members={members.filter((m) => (presenceMap[m.userId] || m.user?.presence) !== "ONLINE")} presenceMap={presenceMap} dim onSelect={openProfile} onContextMenu={openUserMenu} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {/* Menu chuột phải */}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />

      {/* Hiệu ứng Level Up toàn cục */}
      <LevelUpOverlay />

      {/* Cài đặt tài khoản */}
      {showAccountSettings && <CommunityAccountSettings onClose={() => setShowAccountSettings(false)} />}

      {/* Cài đặt thoại (thiết bị + lọc âm) */}
      {showVoiceSettings && <VoiceSettingsModal onClose={() => setShowVoiceSettings(false)} />}

      {/* Chọn nguồn + chất lượng chia sẻ màn hình (kiểu Discord) */}
      {showSharePicker && (
        <ScreenSharePicker
          onClose={() => setShowSharePicker(false)}
          onConfirm={(cfg) => { setShowSharePicker(false); voice.startScreenShare(cfg).catch(() => {}); }}
        />
      )}

      {/* Lightbox xem ảnh full */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
        />
      )}

      {/* Hồ sơ người dùng */}
      {profileId && (
        <UserProfileModal
          userId={profileId}
          onClose={() => setProfileId(null)}
          onTransfer={(u) => { setProfileId(null); setWalletTarget(u); }}
          onMessage={(u) => { setProfileId(null); setView("messages"); useDmStore.getState().openConversation(u); }}
        />
      )}

      {/* Ví xu / chuyển xu (mở từ hồ sơ với người nhận sẵn) */}
      {walletTarget !== undefined && (
        <WalletModal presetTarget={walletTarget} onClose={() => setWalletTarget(undefined)} />
      )}

      {/* Quản trị server */}
      {showServerSettings && activeServer && (
        <ServerSettings
          server={activeServer}
          myUserId={user.id}
          myRole={myRole}
          onClose={() => setShowServerSettings(false)}
        />
      )}

      {/* Modal tạo / tham gia server */}
      {showServerModal && (
        <ServerModal mode={showServerModal} setMode={setShowServerModal} onClose={() => setShowServerModal(null)} createServer={createServer} joinServer={joinServer} />
      )}

      {/* Modal tạo / sửa kênh */}
      {showChannelModal && <ChannelModal onClose={() => setShowChannelModal(false)} createChannel={createChannel} />}
      {editChannel && (
        <ChannelModal
          onClose={() => setEditChannel(null)}
          editing={editChannel}
          updateChannel={updateChannel}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function MemberSection({
  label, members, presenceMap, dim, onSelect, onContextMenu,
}: {
  label: string;
  members: { id?: string; userId: string; role: MemberRole; nickname?: string; user?: { displayName?: string; username?: string; avatarUrl?: string; presence?: PresenceStatus; statusMessage?: string; level?: number; levelStyle?: import("../lib/communityApi").LevelStyle; rank?: import("../lib/communityApi").RankInfo } }[];
  presenceMap: Record<string, PresenceStatus>;
  dim?: boolean;
  onSelect?: (userId: string) => void;
  onContextMenu?: (e: React.MouseEvent, target: { userId: string; name?: string; avatarUrl?: string }) => void;
}) {
  if (members.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 px-2 mb-1.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{label}</span>
        <span className="text-[10px] font-bold text-neutral-600">{members.length}</span>
        <span className="flex-1 h-px bg-white/[0.06]" />
      </div>
      <div className="flex flex-col gap-0.5">
        {members.map((mem, mi) => {
          const RoleIcon = ROLE_ICON[mem.role];
          const nm = mem.nickname || mem.user?.displayName || mem.user?.username || "Người dùng";
          const pres = presenceMap[mem.userId] || mem.user?.presence || "OFFLINE";
          const status = mem.user?.statusMessage;
          const lvl = mem.user?.level;
          const lvlStyle = mem.user?.levelStyle;
          const lc = levelColors(lvl, lvlStyle);
          const nameStyle = levelNameStyle(lvl, lvlStyle);
          const isStaff = mem.role !== "MEMBER";
          return (
            <button
              key={mem.id || mem.userId || `mem-${mi}`}
              onClick={() => onSelect?.(mem.userId)}
              onContextMenu={(e) => onContextMenu?.(e, { userId: mem.userId, name: nm, avatarUrl: mem.user?.avatarUrl })}
              className={`group/mem relative flex items-center gap-2.5 w-full px-2 py-1.5 rounded-xl border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06] transition-all cursor-pointer text-left ${dim ? "opacity-55 hover:opacity-90" : ""}`}
            >
              {/* vạch sáng theo màu level ở mép trái khi hover */}
              {lc && <span className="pointer-events-none absolute inset-y-1.5 left-0 w-0.5 rounded-full opacity-0 group-hover/mem:opacity-100 transition-opacity" style={{ background: `linear-gradient(to bottom, ${lc.color}, ${lc.color2})` }} />}
              <Avatar name={nm} url={mem.user?.avatarUrl} size={36} presence={pres} />
              <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[12.5px] font-bold truncate leading-tight" style={nameStyle || { color: "#e5e5e5" }}>{nm}</span>
                  {isStaff && (
                    <RoleIcon className={`w-3.5 h-3.5 flex-shrink-0 ${mem.role === "OWNER" ? "text-amber-400" : "text-sky-400"}`} />
                  )}
                </span>
                <span className="flex items-center gap-1 min-w-0 flex-wrap">
                  <LevelBadge level={lvl} style={lvlStyle} />
                  <RankBadge rank={mem.user?.rank} />
                </span>
                {status && <span className="text-[10px] text-neutral-500 truncate leading-tight italic">{status}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function ChannelGroup({
  title, icon: Icon, channels, activeChannelId, unreadMap, onSelect, canAdd, onAdd, isAdmin, onContextMenu, onReorder,
}: {
  title: string;
  icon: typeof Hash;
  channels: import("../lib/communityApi").Channel[];
  activeChannelId: string | null;
  unreadMap?: Record<string, number>;
  onSelect: (id: string) => void;
  canAdd: boolean;
  onAdd: () => void;
  isAdmin?: boolean;
  onContextMenu?: (ch: import("../lib/communityApi").Channel, e: React.MouseEvent) => void;
  onReorder?: (sourceId: string, targetId: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragInfo = useRef<{ id: string; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const startDrag = (id: string, e: React.PointerEvent) => {
    if (!isAdmin || !onReorder || e.button !== 0) return;
    dragInfo.current = { id, startY: e.clientY, moved: false };
    const move = (ev: PointerEvent) => {
      const info = dragInfo.current;
      if (!info) return;
      if (!info.moved && Math.abs(ev.clientY - info.startY) < 5) return;
      info.moved = true;
      setDragId(info.id);
      for (const [cid, el] of Object.entries(rowRefs.current)) {
        if (!el || cid === info.id) continue;
        const r = el.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) { onReorder(info.id, cid); break; }
      }
    };
    const up = () => {
      const info = dragInfo.current;
      if (info?.moved) suppressClick.current = true;
      dragInfo.current = null;
      setDragId(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-2 mb-1.5 group/grp">
        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-600">{title}</span>
        {canAdd && (
          <button onClick={onAdd} className="p-0.5 rounded text-neutral-600 hover:text-white opacity-0 group-hover/grp:opacity-100 transition-all cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {channels.length === 0 ? (
        <div className="px-2 text-[11px] text-neutral-700 italic">Chưa có kênh</div>
      ) : (
        channels.map((c, ci) => {
          const active = c.id === activeChannelId;
          const dragging = dragId === c.id;
          const unreadCount = !active ? (unreadMap?.[c.id] || 0) : 0;
          const unread = unreadCount > 0;
          return (
            <div
              key={c.id || `ch-${ci}`}
              ref={(el) => { rowRefs.current[c.id] = el; }}
              onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onSelect(c.id); }}
              onContextMenu={(e) => onContextMenu?.(c, e)}
              style={{ touchAction: "none" }}
              className={`group/ch flex items-center gap-2 w-full pl-2.5 pr-1.5 py-2 mb-0.5 rounded-xl text-[13px] cursor-pointer ${
                dragging ? "opacity-70 scale-[1.02] transition-none" : "transition-all"
              } ${
                active
                  ? "bg-gradient-to-r from-violet-600/25 to-fuchsia-600/10 text-white font-semibold shadow-[inset_0_0_0_1px_rgba(139,92,246,0.3)]"
                  : unread
                    ? "text-white font-bold hover:bg-white/[0.05]"
                    : "text-neutral-400 font-semibold hover:bg-white/[0.05] hover:text-neutral-200"
              }`}
            >
              {unread && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0 -ml-1 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />}
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-violet-300" : unread ? "text-violet-300" : "opacity-60"}`} />
              <span className="flex-1 truncate">{c.name}</span>
              {unread && (
                <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 flex items-center justify-center rounded-full bg-violet-500 text-white text-[10px] font-black leading-none shadow-[0_0_10px_rgba(139,92,246,0.6)]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              {isAdmin && (
                <span
                  onPointerDown={(e) => { e.stopPropagation(); startDrag(c.id, e); }}
                  className="opacity-0 group-hover/ch:opacity-100 text-neutral-600 hover:text-neutral-300 cursor-grab active:cursor-grabbing flex-shrink-0"
                  data-tip="Kéo để sắp xếp"
                  data-tip-pos="right"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function VoiceChannelGroup({
  channels, activeVoiceChannelId, participants, occupancy, myUserId, userVolumes, onJoin, canAdd, onAdd, isAdmin, onContextMenu, onReorder, onUserClick, onUserContextMenu, onWatchStream,
}: {
  channels: import("../lib/communityApi").Channel[];
  activeVoiceChannelId: string | null;
  participants: Record<string, VoiceParticipantState>;
  occupancy: Record<string, import("../lib/communityApi").VoiceMember[]>;
  myUserId: string;
  userVolumes: Record<string, number>;
  onJoin: (id: string, name: string) => void;
  canAdd: boolean;
  onAdd: () => void;
  isAdmin?: boolean;
  onContextMenu?: (ch: import("../lib/communityApi").Channel, e: React.MouseEvent) => void;
  onReorder?: (sourceId: string, targetId: string) => void;
  onUserClick?: (userId: string) => void;
  onUserContextMenu?: (e: React.MouseEvent, target: { userId: string; name?: string; avatarUrl?: string }) => void;
  onWatchStream?: (userId: string) => void;
}) {
  // Thành viên trực tiếp (khi mình đang ở trong kênh) — có trạng thái nói/mic/loa thời gian thực.
  const liveList = Object.values(participants);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-2 mb-1.5 group/grp">
        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-600">Thoại</span>
        {canAdd && (
          <button onClick={onAdd} className="p-0.5 rounded text-neutral-600 hover:text-white opacity-0 group-hover/grp:opacity-100 transition-all cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {channels.length === 0 ? (
        <div className="px-2 text-[11px] text-neutral-700 italic">Chưa có kênh</div>
      ) : (
        channels.map((c, ci) => {
          const active = c.id === activeVoiceChannelId;
          // Kênh đang tham gia → dùng danh sách trực tiếp; kênh khác → dùng occupancy từ server.
          const occ = occupancy[c.id] || [];
          const rows: {
            userId: string; name: string; avatarUrl?: string; speaking?: boolean; muted?: boolean; deafened?: boolean; streaming?: boolean;
          }[] = active
            ? liveList.map((p) => ({
                userId: p.userId,
                name: p.displayName || p.username || (p.userId === myUserId ? "Bạn" : "Người dùng"),
                avatarUrl: p.avatarUrl,
                speaking: p.speaking,
                muted: p.muted,
                deafened: p.deafened,
                streaming: p.streaming,
              }))
            : occ.map((m) => ({
                userId: m.userId,
                name: m.user?.displayName || m.user?.username || (m.userId === myUserId ? "Bạn" : "Người dùng"),
                avatarUrl: m.user?.avatarUrl,
                speaking: m.speaking,
                muted: m.muted,
                deafened: m.deafened,
                streaming: m.streaming,
              }));
          const count = rows.length;
          return (
            <div key={c.id || `vc-${ci}`} className="mb-0.5">
              <div
                onClick={() => onJoin(c.id, c.name)}
                onContextMenu={(e) => onContextMenu?.(c, e)}
                className={`group/ch flex items-center gap-2 w-full pl-2.5 pr-1.5 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                  active ? "bg-emerald-500/10 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.25)]" : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
                }`}
              >
                <Volume2 className={`w-4 h-4 flex-shrink-0 ${active ? "text-emerald-300" : "opacity-60"}`} />
                <span className="flex-1 truncate">{c.name}</span>
                {count > 0 && (
                  <span
                    className={`flex-shrink-0 flex items-center gap-1 mr-0.5 pl-1.5 pr-2 py-0.5 rounded-full text-[10px] font-black leading-none ${
                      active ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.06] text-neutral-400"
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    {count}
                  </span>
                )}
                {isAdmin && onReorder && (
                  <span
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onContextMenu?.(c, e); }}
                    className="opacity-0 group-hover/ch:opacity-100 text-neutral-600 hover:text-neutral-300 cursor-pointer flex-shrink-0"
                    data-tip="Tuỳ chọn"
                    data-tip-pos="right"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
              {count > 0 && (
                <div className={`ml-3.5 mt-1 mb-1 flex flex-col gap-0.5 border-l-2 pl-2.5 ${active ? "border-emerald-500/20" : "border-white/[0.06]"}`}>
                  {rows.map((p, ri) => {
                    const locallyMuted = p.userId !== myUserId && (userVolumes[p.userId] ?? 1) === 0;
                    return (
                    <button
                      key={p.userId || `vp-${ri}`}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (p.userId) onUserClick?.(p.userId); }}
                      onContextMenu={(e) => { e.stopPropagation(); if (p.userId) onUserContextMenu?.(e, { userId: p.userId, name: p.name, avatarUrl: p.avatarUrl }); }}
                      className="flex items-center gap-2 px-1 py-1 rounded-lg w-full text-left hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      <div className={`relative w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white overflow-hidden ring-2 transition-all ${p.avatarUrl ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(p.name)}`} ${p.speaking ? "ring-emerald-400" : "ring-transparent"}`}>
                        {p.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (p.name || "?").slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <span className={`flex-1 min-w-0 text-[11px] font-semibold truncate ${locallyMuted ? "text-rose-300/70" : p.speaking ? "text-emerald-200" : "text-neutral-400"}`}>{p.name}</span>
                      {p.streaming && (
                        <span
                          onClick={(e) => { e.stopPropagation(); if (p.userId) onWatchStream?.(p.userId); }}
                          data-tip="Đang chia sẻ — bấm để xem"
                          data-tip-pos="left"
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[8px] font-black flex-shrink-0 hover:bg-rose-500/30"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> LIVE
                        </span>
                      )}
                      {locallyMuted && (
                        <span data-tip="Bạn đã tắt tiếng người này" data-tip-pos="left" className="flex-shrink-0">
                          <VolumeX className="w-3 h-3 text-rose-400" />
                        </span>
                      )}
                      {!locallyMuted && p.muted && <MicOff className="w-3 h-3 text-rose-400 flex-shrink-0" />}
                      {!locallyMuted && p.deafened && <VolumeX className="w-3 h-3 text-rose-400 flex-shrink-0" />}
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function VoiceControlBar({
  channelName, connecting, connected, muted, deafened, streaming, onToggleMute, onToggleDeafen, onLeave, onOpenSettings, onStartScreen, onStartCamera, onStopStream,
}: {
  channelName: string;
  connecting: boolean;
  connected: boolean;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
  onOpenSettings: () => void;
  onStartScreen: () => void;
  onStartCamera: () => void;
  onStopStream: () => void;
}) {
  return (
    <div className="mx-2.5 mb-2.5 p-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06]">
      <div className="flex items-center gap-2 mb-2">
        <Signal className={`w-4 h-4 flex-shrink-0 ${connected ? "text-emerald-400" : "text-amber-400 animate-pulse"}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-[12px] font-bold truncate ${connected ? "text-emerald-300" : "text-amber-300"}`}>
            {connecting ? "Đang kết nối..." : "Thoại đã kết nối"}
          </div>
          <div className="text-[10px] text-neutral-500 truncate">{channelName}</div>
        </div>
        <button
          onClick={onOpenSettings}
          data-tip="Cài đặt thoại"
          data-tip-pos="top"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-violet-300 hover:bg-white/[0.06] transition-all cursor-pointer flex-shrink-0"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
      {/* hàng chia sẻ màn hình / camera */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {streaming ? (
          <button
            onClick={onStopStream}
            data-tip="Dừng chia sẻ"
            data-tip-pos="top"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition-all cursor-pointer text-[11px] font-bold"
          >
            <ScreenShareOff className="w-4 h-4" /> Dừng chia sẻ
          </button>
        ) : (
          <>
            <button
              onClick={onStartScreen}
              data-tip="Chia sẻ màn hình"
              data-tip-pos="top"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/10 bg-white/[0.05] text-neutral-200 hover:bg-white/[0.1] transition-all cursor-pointer text-[11px] font-bold"
            >
              <ScreenShare className="w-4 h-4" /> Màn hình
            </button>
            <button
              onClick={onStartCamera}
              data-tip="Bật camera"
              data-tip-pos="top"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/10 bg-white/[0.05] text-neutral-200 hover:bg-white/[0.1] transition-all cursor-pointer text-[11px] font-bold"
            >
              <Video className="w-4 h-4" /> Camera
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleMute}
          data-tip={muted ? "Bật micro" : "Tắt micro"}
          data-tip-pos="top"
          className={`flex-1 flex items-center justify-center py-2 rounded-xl border transition-all cursor-pointer ${
            muted ? "bg-rose-500/15 border-rose-500/40 text-rose-300" : "bg-white/[0.05] border-white/10 text-neutral-200 hover:bg-white/[0.1]"
          }`}
        >
          {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button
          onClick={onToggleDeafen}
          data-tip={deafened ? "Bật loa" : "Tắt loa"}
          data-tip-pos="top"
          className={`flex-1 flex items-center justify-center py-2 rounded-xl border transition-all cursor-pointer ${
            deafened ? "bg-rose-500/15 border-rose-500/40 text-rose-300" : "bg-white/[0.05] border-white/10 text-neutral-200 hover:bg-white/[0.1]"
          }`}
        >
          {deafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </button>
        <button
          onClick={onLeave}
          data-tip="Rời kênh thoại"
          data-tip-pos="top"
          className="flex-1 flex items-center justify-center py-2 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition-all cursor-pointer"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trình xem chia sẻ màn hình / camera (overlay trong khu chat).
function StreamViewer({
  video, name, onClose,
}: {
  video: { userId: string; track: MediaStreamTrack; source: "screen" | "camera" };
  name: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [fs, setFs] = useState(false);
  const [hideBars, setHideBars] = useState(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = new MediaStream([video.track]);
    el.play().catch(() => {/* ignore */});
    return () => { try { el.srcObject = null; } catch {/* ignore */} };
  }, [video.track]);

  // đếm thời lượng xem.
  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [video.userId, video.source]);

  // ESC để đóng.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleFs = () => {
    const node = wrapRef.current;
    if (!node) return;
    if (!document.fullscreenElement) node.requestFullscreen?.().then(() => setFs(true)).catch(() => {});
    else document.exitFullscreen?.().then(() => setFs(false)).catch(() => {});
  };
  useEffect(() => {
    const onFsChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // tự ẩn thanh điều khiển khi không di chuột.
  const poke = () => {
    setHideBars(false);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHideBars(true), 2600);
  };
  useEffect(() => { poke(); return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }; }, []);

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const SourceIcon = video.source === "camera" ? Camera : MonitorPlay;

  return (
    <div
      ref={wrapRef}
      onMouseMove={poke}
      className="absolute inset-0 z-40 bg-[#05050a] flex flex-col animate-fade-in"
    >
      {/* Header nổi */}
      <div className={`absolute top-0 inset-x-0 z-10 transition-all duration-300 ${hideBars ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}>
        <div className="h-14 flex items-center gap-3 px-4 bg-gradient-to-b from-black/80 to-transparent">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/90 text-white text-[10px] font-black shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> TRỰC TIẾP
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <SourceIcon className="w-4 h-4 text-violet-300 flex-shrink-0" />
            <span className="text-[13px] font-bold text-white truncate">
              {video.source === "camera" ? "Camera của" : "Màn hình của"} {name}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-white/10 text-[11px] font-bold text-neutral-300 tabular-nums flex-shrink-0">{mmss}</span>
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            <button
              onClick={toggleFs}
              data-tip={fs ? "Thoát toàn màn hình" : "Toàn màn hình"}
              data-tip-pos="bottom"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {fs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              data-tip="Đóng (Esc)"
              data-tip-pos="bottom"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-neutral-300 hover:text-white hover:bg-rose-500/30 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Video */}
      <div className="flex-1 min-h-0 flex items-center justify-center" onClick={poke}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={ref} autoPlay playsInline className="max-w-full max-h-full object-contain" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function ServerModal({
  mode, setMode, onClose, createServer, joinServer,
}: {
  mode: "create" | "join";
  setMode: (m: "create" | "join") => void;
  onClose: () => void;
  createServer: (name: string) => Promise<void>;
  joinServer: (code: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "create") {
        if (!name.trim()) return;
        await toast.promise(createServer(name.trim()), { loading: "Đang tạo server...", success: "Đã tạo server!", error: (e) => e?.message || "Tạo server thất bại." });
      } else {
        if (!code.trim()) return;
        await toast.promise(joinServer(code.trim()), { loading: "Đang tham gia...", success: "Đã tham gia server!", error: (e) => e?.message || "Tham gia thất bại." });
      }
      onClose();
    } catch {
      /* toast đã báo */
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 transition-all";

  return (
    <Modal title={mode === "create" ? "Tạo server mới" : "Tham gia server"} onClose={onClose}>
      <div className="flex gap-1.5 p-1 rounded-xl bg-white/[0.04] mb-4">
        {(["create", "join"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${mode === m ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"}`}
          >
            {m === "create" ? "Tạo mới" : "Tham gia"}
          </button>
        ))}
      </div>
      {mode === "create" ? (
        <input className={inputCls} placeholder="Tên server" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && submit()} />
      ) : (
        <input className={inputCls} placeholder="Nhập mã mời" value={code} onChange={(e) => setCode(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && submit()} />
      )}
      <button
        onClick={submit}
        disabled={busy}
        className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {mode === "create" ? "Tạo server" : "Tham gia"}
      </button>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function ChannelModal({
  onClose, createChannel, editing, updateChannel,
}: {
  onClose: () => void;
  createChannel?: (name: string, type: "TEXT" | "VOICE", topic?: string, userLimit?: number) => Promise<void>;
  editing?: import("../lib/communityApi").Channel;
  updateChannel?: (channelId: string, input: { name?: string; topic?: string; userLimit?: number }) => Promise<void>;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<"TEXT" | "VOICE">(editing?.type ?? "TEXT");
  const [topic, setTopic] = useState(editing?.topic ?? "");
  const [userLimit, setUserLimit] = useState<string>(editing?.userLimit ? String(editing.userLimit) : "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const lim = userLimit.trim() ? Math.max(0, parseInt(userLimit, 10) || 0) : undefined;
      if (isEdit && editing && updateChannel) {
        await toast.promise(
          updateChannel(editing.id, {
            name: name.trim(),
            topic: topic.trim() || undefined,
            userLimit: type === "VOICE" ? lim : undefined,
          }),
          { loading: "Đang lưu...", success: "Đã cập nhật kênh!", error: (e) => e?.message || "Cập nhật thất bại." }
        );
      } else if (createChannel) {
        await toast.promise(
          createChannel(name.trim(), type, topic.trim() || undefined, type === "VOICE" ? lim : undefined),
          { loading: "Đang tạo kênh...", success: "Đã tạo kênh!", error: (e) => e?.message || "Tạo kênh thất bại." }
        );
      }
      onClose();
    } catch {
      /* toast đã báo */
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 transition-all";

  return (
    <Modal title={isEdit ? "Sửa kênh" : "Tạo kênh mới"} onClose={onClose}>
      {/* Loại kênh: chỉ chọn khi tạo mới (không đổi loại khi sửa) */}
      {!isEdit && (
        <div className="flex gap-2 mb-4">
          {([
            { v: "TEXT" as const, icon: Hash, label: "Văn bản" },
            { v: "VOICE" as const, icon: Volume2, label: "Thoại" },
          ]).map(({ v, icon: Icon, label }) => (
            <button
              key={v}
              onClick={() => setType(v)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold border transition-all cursor-pointer ${
                type === v ? "bg-violet-500/15 border-violet-500/50 text-violet-200" : "bg-white/[0.03] border-white/10 text-neutral-400 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      )}
      <input className={inputCls} placeholder="Tên kênh" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && submit()} />
      {type === "TEXT" && (
        <input className={`${inputCls} mt-3`} placeholder="Chủ đề (tuỳ chọn)" value={topic} onChange={(e) => setTopic(e.target.value)} />
      )}
      {type === "VOICE" && (
        <div className="mt-3">
          <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">Giới hạn người (0 = không giới hạn)</label>
          <input type="number" min={0} className={inputCls} placeholder="0" value={userLimit} onChange={(e) => setUserLimit(e.target.value.replace(/[^0-9]/g, ""))} />
        </div>
      )}
      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {isEdit ? "Lưu thay đổi" : "Tạo kênh"}
      </button>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lightbox xem ảnh full màn hình (điều hướng trái/phải, mở ngoài, tải về).
function ImageLightbox({
  images, index, onClose, onIndex,
}: {
  images: { url: string; name: string }[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const cur = images[index];
  const hasMany = images.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasMany) onIndex((index - 1 + images.length) % images.length);
      else if (e.key === "ArrowRight" && hasMany) onIndex((index + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, hasMany, onClose, onIndex]);

  if (!cur) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      {/* thanh công cụ */}
      <div className="absolute top-0 inset-x-0 h-14 flex items-center justify-between px-5 z-10" onMouseDown={(e) => e.stopPropagation()}>
        <span className="text-[12px] font-semibold text-neutral-300 truncate max-w-[60%]">
          {cur.name}{hasMany ? `  ·  ${index + 1}/${images.length}` : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => openExternal(cur.url)} data-tip="Mở trong trình duyệt" data-tip-pos="bottom" className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* điều hướng trái */}
      {hasMany && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onIndex((index - 1 + images.length) % images.length)}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.15] text-white transition-colors cursor-pointer z-10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* ảnh */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cur.url}
        alt={cur.name}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[86vh] object-contain rounded-lg shadow-2xl animate-pop-in"
      />

      {/* điều hướng phải */}
      {hasMany && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onIndex((index + 1) % images.length)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.15] text-white transition-colors cursor-pointer z-10"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* dải thumbnail */}
      {hasMany && (
        <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-2 px-4 overflow-x-auto custom-scrollbar" onMouseDown={(e) => e.stopPropagation()}>
          {images.map((im, i) => (
            <button
              key={i}
              onClick={() => onIndex(i)}
              className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all cursor-pointer ${i === index ? "border-violet-400" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
