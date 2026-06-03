"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { URL_REGEX, extractUrls, openExternal, fetchLinkPreview, type LinkPreviewData } from "../lib/linkUtils";

// ── Inline parser: in đậm / nghiêng / gạch / code / link / URL trần ──────────
// Trả về mảng ReactNode. An toàn vì dựng bằng React (không dùng innerHTML).
function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let k = 0;

  // thứ tự ưu tiên: code `...`, link [text](url), bold **/__, strike ~~, italic *​/_
  const patterns: { re: RegExp; render: (m: RegExpExecArray, key: string) => ReactNode }[] = [
    {
      re: /`([^`]+)`/,
      render: (m, key) => (
        <code key={key} className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[12px] font-mono text-amber-200">{m[1]}</code>
      ),
    },
    {
      re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/,
      render: (m, key) => (
        <a
          key={key}
          href={m[2]}
          onClick={(e) => { e.preventDefault(); openExternal(m[2]); }}
          className="text-sky-400 hover:text-sky-300 cursor-pointer break-all"
        >
          {m[1]}
        </a>
      ),
    },
    {
      re: /\*\*([^*]+)\*\*|__([^_]+)__/,
      render: (m, key) => <strong key={key} className="font-bold text-white">{m[1] ?? m[2]}</strong>,
    },
    {
      re: /~~([^~]+)~~/,
      render: (m, key) => <span key={key} className="line-through opacity-80">{m[1]}</span>,
    },
    {
      re: /(?<![A-Za-z0-9])\*([^*\n]+)\*(?![A-Za-z0-9])|(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/,
      render: (m, key) => <em key={key} className="italic">{m[1] ?? m[2]}</em>,
    },
  ];

  // lặp: tìm pattern khớp sớm nhất trong `rest`
  while (rest.length > 0) {
    let best: { idx: number; len: number; node: ReactNode } | null = null;
    for (const p of patterns) {
      const m = p.re.exec(rest);
      if (m && (best === null || m.index < best.idx)) {
        best = { idx: m.index, len: m[0].length, node: p.render(m, `${keyPrefix}-md-${k}`) };
      }
    }
    if (!best) {
      // không còn markdown → phần còn lại xử lý URL trần
      nodes.push(...linkifyPlain(rest, `${keyPrefix}-t-${k}`));
      break;
    }
    if (best.idx > 0) {
      nodes.push(...linkifyPlain(rest.slice(0, best.idx), `${keyPrefix}-t-${k}`));
    }
    nodes.push(best.node);
    rest = rest.slice(best.idx + best.len);
    k++;
  }
  return nodes;
}

// Biến URL trần thành link bấm được (mở trình duyệt ngoài).
function linkifyPlain(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const m = part.match(/^([\s\S]*?)([.,;:!?)]*)$/);
      const link = m ? m[1] : part;
      const trail = m ? m[2] : "";
      return (
        <span key={`${keyPrefix}-${i}`}>
          <a
            href={link}
            onClick={(e) => { e.preventDefault(); openExternal(link); }}
            className="text-sky-400 hover:text-sky-300 cursor-pointer break-all"
          >
            {link}
          </a>
          {trail}
        </span>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

/**
 * Render nội dung tin nhắn dạng Markdown nhẹ:
 * heading (#), trích dẫn (>), danh sách (- / * / 1.), khối mã (```),
 * cùng định dạng inline (**đậm**, *nghiêng*, ~~gạch~~, `mã`, [text](url)).
 */
export function MessageText({ content }: { content: string }) {
  if (!content) return null;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // khối mã ```
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++; // bỏ dòng đóng ```
      blocks.push(
        <pre key={`b-${key++}`} className="my-1 p-2.5 rounded-lg bg-black/40 border border-white/[0.08] overflow-x-auto custom-scrollbar">
          {lang && <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mb-1">{lang}</div>}
          <code className="text-[12px] font-mono text-emerald-200 whitespace-pre">{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // heading
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl === 1 ? "text-[16px]" : lvl === 2 ? "text-[15px]" : "text-[14px]";
      blocks.push(<div key={`b-${key++}`} className={`font-black text-white mt-1 ${cls}`}>{parseInline(h[2], `b${key}`)}</div>);
      i++;
      continue;
    }

    // trích dẫn >
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      blocks.push(
        <blockquote key={`b-${key++}`} className="my-0.5 pl-2.5 border-l-2 border-violet-500/40 text-neutral-300">
          {buf.map((b, bi) => <div key={bi}>{parseInline(b, `b${key}-${bi}`)}</div>)}
        </blockquote>
      );
      continue;
    }

    // danh sách (gạch đầu dòng hoặc số)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: { ordered: boolean; text: string }[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const ordered = /^\s*\d+\.\s+/.test(lines[i]);
        items.push({ ordered, text: lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "") });
        i++;
      }
      blocks.push(
        <ul key={`b-${key++}`} className="my-0.5 pl-1 flex flex-col gap-0.5">
          {items.map((it, ii) => (
            <li key={ii} className="flex gap-2">
              <span className="text-violet-400 flex-shrink-0 select-none">{it.ordered ? `${ii + 1}.` : "•"}</span>
              <span className="flex-1 min-w-0">{parseInline(it.text, `b${key}-${ii}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // dòng trống → khoảng cách nhỏ
    if (line.trim() === "") {
      blocks.push(<div key={`b-${key++}`} className="h-1.5" />);
      i++;
      continue;
    }

    // đoạn văn thường
    blocks.push(<div key={`b-${key++}`}>{parseInline(line, `b${key}`)}</div>);
    i++;
  }

  return <div className="whitespace-pre-wrap break-words">{blocks}</div>;
}

/** Hiển thị thẻ xem trước (Open Graph) cho các URL trong tin nhắn. */
export function LinkPreviews({ content }: { content: string }) {
  const [previews, setPreviews] = useState<LinkPreviewData[]>([]);

  useEffect(() => {
    const urls = extractUrls(content).slice(0, 3); // tối đa 3 preview
    if (urls.length === 0) { setPreviews([]); return; }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(urls.map((u) => fetchLinkPreview(u)));
      if (cancelled) return;
      setPreviews(results.filter((r): r is LinkPreviewData => !!r && !!(r.title || r.description || r.image)));
    })();
    return () => { cancelled = true; };
  }, [content]);

  if (previews.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 max-w-[440px]">
      {previews.map((p, i) => (
        <div
          key={i}
          onClick={() => openExternal(p.url)}
          className="group/lp relative rounded-xl bg-white/[0.03] border-l-[3px] border-l-sky-500/60 border border-white/[0.08] hover:border-sky-500/40 hover:bg-white/[0.05] transition-all overflow-hidden cursor-pointer p-2.5 pl-3"
        >
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              {p.siteName && <div className="text-[10px] font-bold text-sky-400/80 uppercase tracking-wide truncate">{p.siteName}</div>}
              {p.title && <div className="text-[12px] font-bold text-neutral-100 leading-snug line-clamp-2 group-hover/lp:text-sky-200">{p.title}</div>}
              {p.description && <div className="text-[11px] text-neutral-500 leading-snug line-clamp-2 mt-0.5">{p.description}</div>}
              <div className="flex items-center gap-1 text-[10px] text-neutral-600 mt-1 truncate">
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{prettyUrl(p.url)}</span>
              </div>
            </div>
            {p.image ? (
              <PreviewImage url={p.image} />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                <Globe className="w-6 h-6 text-sky-400/60" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Ảnh preview tự ẩn nếu tải lỗi.
function PreviewImage({ url }: { url: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div className="w-16 h-16 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
        <Globe className="w-6 h-6 text-sky-400/60" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" onError={() => setErr(true)} className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-black/30" loading="lazy" />
  );
}

// Bỏ scheme + cắt gọn URL cho dễ đọc.
function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}
