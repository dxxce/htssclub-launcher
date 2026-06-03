"use client";

import { invoke } from "@tauri-apps/api/core";

// Regex nhận diện URL http/https trong văn bản.
export const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/gi;

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  site_name?: string;
}

/** Trích toàn bộ URL (http/https) xuất hiện trong một đoạn text. */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX) || [];
  // loại bỏ dấu câu dính ở cuối + trùng lặp
  const cleaned = matches.map((u) => u.replace(/[.,;:!?)]+$/, ""));
  return Array.from(new Set(cleaned));
}

/** Mở URL bằng trình duyệt mặc định của hệ điều hành (Tauri). */
export async function openExternal(url: string) {
  try {
    await invoke("open_in_browser", { url });
  } catch {
    // fallback web
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* ignore */
    }
  }
}

// Cache preview theo URL để không fetch lại nhiều lần.
const previewCache = new Map<string, LinkPreviewData | null>();

// Lấy YouTube video id từ nhiều dạng URL.
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/?]+)/);
      if (m) return m[2];
    }
  } catch {/* ignore */}
  return null;
}

/** Lấy Open Graph preview của 1 URL (qua Rust). Trả null nếu thất bại. */
export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  if (previewCache.has(url)) return previewCache.get(url) ?? null;

  // YouTube: dùng thumbnail + oEmbed (ổn định hơn parse OG vì YouTube chặn bot).
  const ytId = youtubeId(url);
  if (ytId) {
    let preview: LinkPreviewData = {
      url,
      siteName: "YouTube",
      image: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      title: "YouTube",
    };
    // Lấy tiêu đề thật qua oEmbed (YouTube cho phép gọi oEmbed công khai).
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
      if (res.ok) {
        const j = await res.json();
        preview = {
          url,
          siteName: "YouTube",
          title: j.title || "YouTube",
          description: j.author_name ? `Kênh: ${j.author_name}` : undefined,
          image: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        };
      }
    } catch {/* vẫn còn thumbnail + title mặc định */}
    previewCache.set(url, preview);
    return preview;
  }

  try {
    const data = await invoke<LinkPreviewData>("fetch_link_preview", { url });
    const normalized: LinkPreviewData = {
      url: data.url || url,
      title: data.title || undefined,
      description: data.description || undefined,
      image: data.image || undefined,
      siteName: data.siteName || (data as any).site_name || undefined,
    };
    // chỉ cache khi có dữ liệu hữu ích
    previewCache.set(url, normalized.title || normalized.description || normalized.image ? normalized : null);
    return previewCache.get(url) ?? null;
  } catch {
    previewCache.set(url, null);
    return null;
  }
}
