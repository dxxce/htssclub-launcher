"use client";

import {
  forwardRef, useImperativeHandle, useRef, useState,
} from "react";
import {
  Paperclip, Send, Loader2, Smile, Eye, EyeOff, X, Plus,
  Bold, Italic, Strikethrough, Code, Link2, Quote, List,
  FileVideo, FileAudio, FileText,
} from "lucide-react";
import { uploadsApi, type Attachment } from "../lib/communityApi";
import { MessageText } from "./MessageContent";
import { toast } from "./Toast";

export interface ChatComposerHandle {
  addFiles: (files: FileList | File[]) => void;
  focus: () => void;
}

interface PendingFile { id: string; file: File; preview: string; isImage: boolean }

const MAX_FILES = 10;
const VIDEO_MAX = 200 * 1024 * 1024;
const FILE_MAX = 25 * 1024 * 1024;
const sizeLimitFor = (f: File) => (f.type.startsWith("video/") ? VIDEO_MAX : FILE_MAX);
const fmtMB = (n: number) => `${Math.round(n / 1024 / 1024)}MB`;

/**
 * Khung soạn tin dùng chung cho cả chat cộng đồng và DM:
 * - Thanh định dạng Markdown + xem trước.
 * - Đính kèm tệp (nút, dán Ctrl+V, kéo-thả qua ref.addFiles).
 * - Tự upload tệp rồi gọi onSend(content, attachments).
 */
const ChatComposer = forwardRef<ChatComposerHandle, {
  placeholder?: string;
  onSend: (content: string, attachments?: Attachment[]) => Promise<void> | void;
  onTyping?: () => void;
  autoFocus?: boolean;
}>(function ChatComposer({ placeholder, onSend, onTyping, autoFocus }, ref) {
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    if (!el.value) { el.style.height = ""; return; }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const focus = () => {
    requestAnimationFrame(() => taRef.current?.focus({ preventScroll: true }));
  };

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setPendingFiles((prev) => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) { toast.error(`Tối đa ${MAX_FILES} tệp mỗi tin nhắn.`); return prev; }
      const next = [...prev];
      for (const f of arr.slice(0, room)) {
        const limit = sizeLimitFor(f);
        if (f.size > limit) { toast.error(`"${f.name}" quá lớn (tối đa ${fmtMB(limit)}).`); continue; }
        const isImage = f.type.startsWith("image/");
        next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, preview: isImage ? URL.createObjectURL(f) : "", isImage });
      }
      return next;
    });
    focus();
  };

  useImperativeHandle(ref, () => ({ addFiles, focus }));

  const removeFile = (id: string) => {
    setPendingFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
    focus();
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const fs: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") { const f = it.getAsFile(); if (f) fs.push(f); }
    }
    if (fs.length) { e.preventDefault(); addFiles(fs); }
  };

  // Chèn/bọc cú pháp Markdown quanh đoạn đang chọn.
  const applyMarkdown = (kind: "bold" | "italic" | "strike" | "code" | "link" | "quote" | "list") => {
    const el = taRef.current;
    if (!el) return;
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const sel = draft.slice(start, end);
    const wrap = (l: string, r = l, ph = "text") => {
      const body = sel || ph;
      const next = draft.slice(0, start) + l + body + r + draft.slice(end);
      setDraft(next);
      const selStart = start + l.length;
      const selEnd = selStart + body.length;
      requestAnimationFrame(() => { const t = taRef.current; if (t) { t.focus({ preventScroll: true }); t.setSelectionRange(selStart, selEnd); autoGrow(); } });
    };
    const linePrefix = (pfx: string, ph = "text") => {
      const body = sel || ph;
      const next = draft.slice(0, start) + pfx + body + draft.slice(end);
      setDraft(next);
      const selStart = start + pfx.length;
      const selEnd = selStart + body.length;
      requestAnimationFrame(() => { const t = taRef.current; if (t) { t.focus({ preventScroll: true }); t.setSelectionRange(selStart, selEnd); autoGrow(); } });
    };
    switch (kind) {
      case "bold": return wrap("**");
      case "italic": return wrap("*");
      case "strike": return wrap("~~");
      case "code": return wrap("`", "`", "code");
      case "link": { const body = sel || "text"; const ins = `[${body}](url)`; const next = draft.slice(0, start) + ins + draft.slice(end); setDraft(next); requestAnimationFrame(() => { const t = taRef.current; if (t) { const us = start + body.length + 3; t.focus({ preventScroll: true }); t.setSelectionRange(us, us + 3); autoGrow(); } }); return; }
      case "quote": return linePrefix("> ");
      case "list": return linePrefix("- ");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && pendingFiles.length === 0) || sending) return;
    setSending(true);
    const files = pendingFiles;
    setDraft(""); setPendingFiles([]);
    try {
      let attachments: Attachment[] | undefined;
      if (files.length > 0) {
        const id = toast.loading(`Đang tải ${files.length} tệp...`);
        try {
          attachments = await Promise.all(files.map(async (pf) => {
            const a = await uploadsApi.attachment(pf.file);
            return { url: a.url, type: a.type || pf.file.type, name: a.name || pf.file.name, size: a.size ?? pf.file.size } as Attachment;
          }));
          toast.dismiss(id);
        } catch (e: any) { toast.dismiss(id); throw e; }
      }
      await onSend(text, attachments);
      files.forEach((pf) => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
      requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = ""; });
    } catch (err: any) {
      setDraft(text); setPendingFiles(files);
      if (err?.message) toast.error(err.message);
    } finally { setSending(false); }
  };

  return (
    <div className="px-4 pb-4 pt-1 flex-shrink-0">
      {/* preview tệp đang chờ gửi */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
          {pendingFiles.map((pf) => (
            <div key={pf.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-white/[0.04]">
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
              <button onClick={() => removeFile(pf.id)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-rose-500 transition-colors cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {pendingFiles.length < MAX_FILES && (
            <button onMouseDown={(e) => e.preventDefault()} onClick={openFilePicker} className="w-20 h-20 rounded-xl border-2 border-dashed border-white/15 flex items-center justify-center text-neutral-500 hover:text-violet-300 hover:border-violet-500/40 transition-all cursor-pointer">
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
            <button key={k} type="button" onMouseDown={(e) => { e.preventDefault(); applyMarkdown(k); }} data-tip={tip} data-tip-pos="top" className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-500 hover:text-violet-300 hover:bg-white/[0.06] transition-all cursor-pointer">
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
          <div className="flex-1" />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowPreview((v) => !v); }} data-tip={showPreview ? "Ẩn xem trước" : "Xem trước Markdown"} data-tip-pos="top" className={`flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${showPreview ? "bg-violet-500/20 text-violet-200" : "text-neutral-500 hover:text-violet-300 hover:bg-white/[0.06]"}`}>
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            Xem trước
          </button>
        </div>

        {showPreview && draft.trim() && (
          <div className="mx-2 mt-1.5 p-2.5 rounded-xl bg-black/30 border border-white/[0.08] max-h-48 overflow-y-auto custom-scrollbar">
            <div className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-1">Xem trước</div>
            <div className="text-[13px] text-neutral-200 leading-relaxed break-words">
              <MessageText content={draft} />
            </div>
          </div>
        )}

        <div className="flex items-end gap-2 px-2 pb-1.5 pt-1.5">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          <button onMouseDown={(e) => e.preventDefault()} onClick={openFilePicker} className="p-2 rounded-xl text-neutral-500 hover:text-violet-300 hover:bg-white/[0.05] transition-all cursor-pointer flex-shrink-0" data-tip="Đính kèm tệp" data-tip-pos="top">
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            ref={taRef}
            value={draft}
            autoFocus={autoFocus}
            onChange={(e) => { setDraft(e.target.value); autoGrow(); onTyping?.(); }}
            onPaste={handlePaste}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder={placeholder || "Nhắn tin · Markdown & Ctrl+V để dán tệp"}
            className="flex-1 bg-transparent resize-none outline-none text-[13px] text-neutral-100 placeholder:text-neutral-600 min-h-[24px] max-h-40 py-2 leading-relaxed custom-scrollbar"
          />
          <button className="p-2 rounded-xl text-neutral-500 hover:text-amber-300 hover:bg-white/[0.05] transition-all cursor-pointer flex-shrink-0" data-tip="Cảm xúc (sắp có)" data-tip-pos="top">
            <Smile className="w-4 h-4" />
          </button>
          <button onClick={send} disabled={(!draft.trim() && pendingFiles.length === 0) || sending} className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white transition-all cursor-pointer active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ChatComposer;
