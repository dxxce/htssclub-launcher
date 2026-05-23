# Short Reels Mobile (Next.js) - Spec & Cookbook

Tài liệu này mô tả cách dựng lại web mobile xem phim ngắn bằng **Next.js (App Router)**, dùng luôn route handlers của Next làm API/proxy. Agent làm theo file này là có thể build app standalone, không cần backend riêng, không cần Tauri/Cloudflared.

---

## 1. Mục tiêu

- Next.js (App Router) trên Node 20+. Triple deploy ok: Vercel, Docker, VPS.
- Một app duy nhất vừa serve UI (`/`) vừa serve API (`/api/...`).
- Tối ưu cho điện thoại: max-width 480px, safe-area, status bar tối.
- Dữ liệu từ `https://api.ushort.cloud/...` (CORS chặn browser) → mọi request từ client đi qua route handler của Next.
- HLS/m3u8/subtitle cũng pass qua proxy để gắn `Origin`/`Referer` upstream.

---

## 2. Stack & dependencies

```bash
npx create-next-app@latest short-reels --typescript --eslint --tailwind --app --src-dir --import-alias "@/*"
cd short-reels
npm i hls.js lucide-react
```

`package.json` (rough):

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "next": "^16",
    "react": "^19",
    "react-dom": "^19",
    "hls.js": "^1.6",
    "lucide-react": "^1"
  }
}
```

`next.config.ts`:

```ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.mydramawave.com' }] },
};
export default nextConfig;
```

Tuỳ chọn: thêm `serverRuntimeConfig` cho `USHORT_TOKEN` (xem §3.3).

---

## 3. Route handlers (Next.js App Router)

Tất cả dùng `app/api/.../route.ts`. Phải `export const dynamic = 'force-dynamic'` để không bị cache build-time.

### 3.1 `app/api/short-reels/route.ts`

Một endpoint, phân nhánh bằng query `action`.

| Method | Query / Body | Mục đích |
|--------|--------------|-----------|
| GET    | `?action=index&tabKey=503\|547` | Trang chủ theo tab. |
| POST   | `?action=feed`  body `{ module_key, next }` | Load-more 1 module. |
| POST   | `?action=search` body `{ keyword, next }` | Tìm kiếm. Cần Bearer token. |
| GET    | `?action=detail&seriesId=<id>` | Chi tiết + danh sách tập. |
| POST   | `?action=hot` body rỗng | Hot list. |

```ts
// app/api/short-reels/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // cần stream/binary => không dùng edge

const UPSTREAM = 'https://api.ushort.cloud';
const COMMON_HEADERS: Record<string, string> = {
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  origin: 'https://ushort.cloud',
  pragma: 'no-cache',
  referer: 'https://ushort.cloud/',
  'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  if (action === 'index') {
    const tabKey = searchParams.get('tabKey') ?? '503';
    const r = await fetch(
      `${UPSTREAM}/freereels/homepage/tab/index?tab_key=${tabKey}&position_index=10001`,
      { headers: COMMON_HEADERS, cache: 'no-store' },
    );
    return NextResponse.json(await r.json(), { status: r.status });
  }
  if (action === 'detail') {
    const id = searchParams.get('seriesId');
    if (!id) return NextResponse.json({ error: 'Missing seriesId' }, { status: 400 });
    const r = await fetch(`${UPSTREAM}/freereels/video/info?series_id=${id}`, {
      headers: COMMON_HEADERS,
      cache: 'no-store',
    });
    return NextResponse.json(await r.json(), { status: r.status });
  }
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const body = await req.json().catch(() => ({}));

  if (action === 'feed') {
    const r = await fetch(`${UPSTREAM}/freereels/homepage/tab/feed`, {
      method: 'POST',
      headers: { ...COMMON_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({
        module_key: body.module_key ?? body.moduleKey ?? '',
        next: body.next ?? '',
      }),
      cache: 'no-store',
    });
    return NextResponse.json(await r.json(), { status: r.status });
  }

  if (action === 'search') {
    const token = process.env.USHORT_TOKEN;
    const r = await fetch(`${UPSTREAM}/freereels/search/drama`, {
      method: 'POST',
      headers: {
        ...COMMON_HEADERS,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        keyword: body.keyword ?? body.query ?? '',
        next: body.next ?? '',
      }),
      cache: 'no-store',
    });
    return NextResponse.json(await r.json(), { status: r.status });
  }

  if (action === 'hot') {
    const r = await fetch(`${UPSTREAM}/freereels/search/hot-list`, {
      method: 'POST',
      headers: { ...COMMON_HEADERS, 'content-length': '0' },
      cache: 'no-store',
    });
    return NextResponse.json(await r.json(), { status: r.status });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
```

### 3.2 `app/api/v-stream/route.ts`

Generic streaming proxy. Nhận `?url=<percent-encoded>`, forward `Range`, rewrite m3u8, convert SRT → VTT.

```ts
// app/api/v-stream/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function pickHeaders(target: string): Record<string, string> {
  const isUshort = /ushort\.cloud|freereels/.test(target) || !/anime/.test(target);
  return {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    referer: isUshort ? 'https://ushort.cloud/' : 'https://anime47.best/',
    origin: isUshort ? 'https://ushort.cloud' : 'https://anime47.best',
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
  };
}

export async function GET(req: NextRequest) {
  const target = new URL(req.url).searchParams.get('url');
  if (!target)
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });

  const headers = pickHeaders(target);
  const range = req.headers.get('range');
  if (range) headers.range = range;

  const upstream = await fetch(target, { headers, cache: 'no-store' });
  const ct = upstream.headers.get('content-type') ?? '';

  // 1) m3u8 → rewrite
  if (target.includes('.m3u8') || ct.includes('mpegurl')) {
    let text = await upstream.text();
    const u = new URL(target);
    const base = target.slice(0, target.lastIndexOf('/') + 1);
    const toAbs = (raw: string) => {
      const t = raw.trim();
      if (!t) return raw;
      if (t.startsWith('http')) return t;
      if (t.startsWith('/')) return `${u.origin}${t}`;
      return `${base}${t}`;
    };
    text = text
      .replace(/^(?!\s*#)(.+)$/gm, (m, line) => {
        const abs = toAbs(line);
        return abs ? `/api/v-stream?url=${encodeURIComponent(abs)}` : m;
      })
      .replace(/URI="([^"]+)"/g, (_m, p) => {
        return `URI="/api/v-stream?url=${encodeURIComponent(toAbs(p))}"`;
      });
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'access-control-allow-origin': '*',
        'cache-control': 'no-cache',
      },
    });
  }

  // 2) subtitle
  const isSub = /\.vtt$|\.srt$|subtitle/i.test(target) || /text\/vtt|x-subrip/.test(ct);
  if (isSub) {
    let text = await upstream.text();
    if (!text.startsWith('WEBVTT')) {
      text = 'WEBVTT\n\n' + text
        .replace(/\r/g, '')
        .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
    }
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': 'text/vtt; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=3600',
      },
    });
  }

  // 3) binary segments / mp4 / m4s
  const buf = Buffer.from(await upstream.arrayBuffer());
  const headersOut: Record<string, string> = {
    'content-type': ct || 'application/octet-stream',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=3600',
    'accept-ranges': 'bytes',
    'content-length': buf.length.toString(),
  };
  const cr = upstream.headers.get('content-range');
  if (cr) headersOut['content-range'] = cr;

  return new NextResponse(buf, { status: upstream.status, headers: headersOut });
}
```

Lưu ý quan trọng:

- Không scan TS sync byte cho `.mp4`/`.m4s` (sẽ vỡ fragmented MP4). Chỉ chuyển nguyên buffer.
- Nếu segment không phải `mpegurl` và cũng không `mp4`, bạn có thể bổ sung scan TS sync byte (hiếm). Phiên bản tối thiểu trên đủ cho upstream `ushort.cloud`.
- Nếu muốn stream không buffer toàn bộ segment (để tiết kiệm RAM): trả `new NextResponse(upstream.body, ...)` thay vì `Buffer.from(...)`. Phải copy `accept-ranges`, `content-range`, `content-length` từ upstream.

### 3.3 Token search

- Tạo `.env.local`: `USHORT_TOKEN=eyJhbGciOi...`. Token là JWT supabase, có expiry ~1h. Cách dài hạn là cho phép user dán token vào hoặc implement OAuth supabase thật.
- Nếu không set, search vẫn chạy nhưng có thể bị 401.

---

## 4. UI - `app/page.tsx` (mobile)

Đây là trang mặc định; nếu muốn tách route mobile có thể đặt ở `app/(mobile)/page.tsx`. Cả phần này là client component (`'use client'`).

### 4.1 Layout & state

```tsx
'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Search, RefreshCw, Film, Sparkles, Heart, Tv, ArrowRight, ChevronLeft, List, Volume2, VolumeX } from 'lucide-react';

const PROXY_BASE = '/api/v-stream';

type ReelItem = { key: string; cover: string; title: string; desc: string; episode_count: number; follow_count: number; tag: string[]; content_tags: string[]; hot_score?: string };
type ReelModule = { type: string; module_name: string; module_key: string; items: ReelItem[] };
type Episode = { id: number; name: string; cover: string; external_audio_h264_m3u8: string; external_audio_h265_m3u8: string; subtitle_list?: { file: string; label: string; type?: string; default?: boolean }[] };
type SeriesDetail = { id: string; name: string; cover: string; desc: string; episode_count: number; follow_count: number; tag: string[]; content_tags: string[]; episode_list: Episode[] };

export default function MobileReelsPage() {
  const [activeTab, setActiveTab] = useState<'503' | '547'>('503');
  const [modules, setModules] = useState<ReelModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ... feed cursors, search, selected series, player state như §6 của doc trước.
}
```

### 4.2 Gọi API

```ts
async function apiCall(action: 'index' | 'feed' | 'search' | 'detail' | 'hot', payload: any) {
  const base = '/api/short-reels';
  if (action === 'index')
    return (await fetch(`${base}?action=index&tabKey=${payload.tabKey}`)).json();
  if (action === 'detail')
    return (await fetch(`${base}?action=detail&seriesId=${payload.seriesId}`)).json();
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      action === 'feed'
        ? { module_key: payload.moduleKey, next: payload.next }
        : action === 'search'
        ? { keyword: payload.keyword, next: payload.next }
        : {}
    ),
  };
  return (await fetch(`${base}?action=${action}`, init)).json();
}
```

### 4.3 Render khung mobile

- Cố định vùng `max-w-[480px] mx-auto`.
- Sticky header: logo + nút refresh + search input.
- Tab pills: 503/547. Khi đổi tab → reset modules + gọi `index`.
- Body: `modules.map((mod) => (<Section name=mod.module_name items=mod.items />))`. Section render grid 3 cột poster.
- Sentinel `<div ref={loadMoreRef} className="h-1" />` cuối module recommend để IntersectionObserver gọi `feed`.

### 4.4 Skeleton

Khi `loading || (selectedSeries && detailLoading)` show grid pulse:

```tsx
<div className="grid grid-cols-3 gap-2">
  {Array.from({ length: 6 }).map((_, i) => (
    <div key={i} className="aspect-[3/4] rounded-xl bg-white/5 animate-pulse" />
  ))}
</div>
```

### 4.5 Detail/Player

- Khi click poster: `setSelectedSeries(item); apiCall('detail', { seriesId: item.key })` → set `seriesDetail`, chọn `currentEpisode = episode_list[0]`.
- Render fullscreen overlay với `<video>` và drawer chọn tập.

---

## 5. Player HLS

Tạo file `src/lib/player.ts`:

```ts
import Hls from 'hls.js';

export function canUseHevc(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof MediaSource === 'undefined') return false;
  return [
    'video/mp4; codecs="hvc1.1.6.L93.B0"',
    'video/mp4; codecs="hev1.1.6.L93.B0"',
    'video/mp4; codecs="hvc1.1.6.L120.B0"',
    'video/mp4; codecs="hev1.1.6.L120.B0"',
  ].some((c) => MediaSource.isTypeSupported(c));
}

export type AttachOptions = {
  video: HTMLVideoElement;
  rawUrl: string;
  proxyBase?: string; // default '/api/v-stream'
  onError?: (e: any) => void;
};

export function attachHls({ video, rawUrl, proxyBase = '/api/v-stream', onError }: AttachOptions) {
  const proxyUrl = `${proxyBase}?url=${encodeURIComponent(rawUrl)}`;
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = proxyUrl;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }
  if (!Hls.isSupported()) throw new Error('HLS not supported');
  const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
  hls.loadSource(proxyUrl);
  hls.attachMedia(video);
  hls.on(Hls.Events.ERROR, (_e, data) => {
    if (data.fatal) {
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else { hls.destroy(); onError?.(data); }
    }
  });
  return () => hls.destroy();
}
```

Sử dụng:

```tsx
useEffect(() => {
  if (!videoRef.current || !currentEpisode) return;
  const useHevc = canUseHevc() && !!currentEpisode.external_audio_h265_m3u8;
  const raw = useHevc
    ? currentEpisode.external_audio_h265_m3u8
    : currentEpisode.external_audio_h264_m3u8;
  if (!raw) return;
  const detach = attachHls({ video: videoRef.current, rawUrl: raw });
  return () => detach();
}, [currentEpisode]);
```

### 5.1 Subtitle

- Disable native textTracks ngay khi load: `for (const t of video.textTracks) t.mode = 'disabled'`.
- Tải `subtitle_list[i].file` qua `${PROXY_BASE}?url=${encodeURIComponent(file)}` (route sẽ convert sang VTT).
- Parse cues:

```ts
export type Cue = { start: number; end: number; text: string };
const TIME = /(\d\d):(\d\d):(\d\d)\.(\d{3})/g;
function toSec(h: string, m: string, s: string, ms: string) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}
export function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.split(/\n\n+/)) {
    const ms = [...block.matchAll(TIME)];
    if (ms.length < 2) continue;
    const [a, b] = ms;
    const start = toSec(a[1], a[2], a[3], a[4]);
    const end = toSec(b[1], b[2], b[3], b[4]);
    const lines = block.split('\n').slice(block.indexOf('-->') >= 0 ? 1 : 2);
    cues.push({ start, end, text: lines.join('\n').trim() });
  }
  return cues;
}
```

- Trong `<video>` `onTimeUpdate`, tìm cue active bằng binary search hoặc linear, set `currentCueText`. Render overlay `<div className="absolute bottom-16 ...">{currentCueText}</div>`.

### 5.2 Controls / gesture

- `showControls` tự ẩn sau 3.5s khi play. Khi pause hoặc mở popover sub: luôn hiện.
- Cử chỉ gợi ý:
  - Tap → toggle controls.
  - Double tap → fav/heart animation.
  - Long press → set `playbackRate = 2`. Thả ra → về `speed` gốc.
  - Vuốt ngang → tua. Vuốt dọc trái → brightness CSS filter, phải → volume.

---

## 6. Lưu ý vận hành

- **HTTPS**: `MediaSource Extensions` chỉ hoạt động trên `https://` (trừ `localhost`). Khi deploy dùng Vercel/Cloudflare/HTTPS reverse proxy.
- **Edge runtime**: không đặt `runtime = 'edge'` cho `/api/v-stream` vì bạn cần `Buffer`/`stream` Node. Edge không forward `Range` với hiệu năng ổn.
- **Cache**: API metadata không cache (`cache: 'no-store'`). Subtitle có thể cache 1h. Segment cache 1h giúp CDN thô đỡ tải.
- **Rate limit / abuse**: thêm middleware kiểm IP/Bot để tránh upstream block IP server.
- **CORS**: app và API cùng origin nên không cần preflight. Nếu muốn share cho tunnel/embed khác, giữ `access-control-allow-origin: *` trên `/api/v-stream`.
- **TS path alias**: import `@/lib/player`, `@/components/...` cho gọn.

---

## 7. Schema upstream tham chiếu

### 7.1 `index`

```
GET https://api.ushort.cloud/freereels/homepage/tab/index?tab_key=503&position_index=10001
→ { success: true, data: { code: 200, data: { items: ReelModuleRaw[], page_info } } }
```

`tab_key`: `503` (Phim ngắn), `547` (Phim bộ). Mỗi `ReelModuleRaw` có `type`, `module_key`, `module_name`, `items`. Module có `type === 'recommend'` chính là module "Lựa chọn phổ biến" cho infinite scroll.

### 7.2 `feed`

```
POST https://api.ushort.cloud/freereels/homepage/tab/feed
Body: { "module_key": "<id>", "next": "<cursor or empty>" }
→ { success: true, data: { code, data: { items: RawReel[], page_info: { next, has_more } } } }
```

### 7.3 `detail`

```
GET https://api.ushort.cloud/freereels/video/info?series_id=<id>
→ { success, data: { code, data: SeriesDetailRaw } }
```

`SeriesDetailRaw.episode_list[]` cần `external_audio_h264_m3u8`, `external_audio_h265_m3u8`, `subtitle_list[]`.

### 7.4 `search`

```
POST https://api.ushort.cloud/freereels/search/drama
Headers: authorization: Bearer <jwt>
Body: { "keyword": "...", "next": "..." }
```

### 7.5 `hot-list`

```
POST https://api.ushort.cloud/freereels/search/hot-list
Body: empty (Content-Length: 0)
```

---

## 8. Test checklist

- [ ] `npm run dev` → mở `/`. Tải được modules tab 503.
- [ ] Lăn cuối → `feed` nạp thêm, `next` đổi, không trùng items.
- [ ] Search "romance" trả kết quả (nếu có token).
- [ ] Click poster → detail có `episode_list`. Player phát được m3u8.
- [ ] DevTools Network: không request nào thẳng `api.ushort.cloud`; mọi thứ đi `/api/short-reels` hoặc `/api/v-stream`.
- [ ] Mở m3u8 qua proxy → mọi dòng segment và `URI=` đều bắt đầu bằng `/api/v-stream?url=`.
- [ ] Subtitle SRT từ upstream trả về client đúng định dạng VTT (header `WEBVTT`).
- [ ] Tua thanh time (request có `Range: bytes=...`) trả status 206 và `Content-Range` hợp lệ.

---

## 9. Deploy nhanh

- **Vercel**: import repo, set env `USHORT_TOKEN`. Mặc định `runtime = 'nodejs'`. Static export: không bật `output: 'export'` (route handlers cần server).
- **Docker**: `docker build` với `node:20-alpine`, `next start -p 3000`. Reverse proxy nginx để enable HTTP/2 + cache segment.
- **Self-host VPS**: `pm2 start "npm start" -i max`.

---

## 10. Mở rộng gợi ý

- Thêm `app/api/short-reels/route.ts` cache bằng `unstable_cache` hoặc Redis cho `index`/`feed`/`detail`.
- Trên route `v-stream`, nếu muốn stream giảm RAM: trả `new NextResponse(upstream.body, { headers })`. Cần forward `accept-ranges`, `content-range`, `content-length`, `content-type`.
- Lưu hồ sơ user (favorite, lịch sử) trong `localStorage` hoặc `app/api/me` + database (Postgres/SQLite).
- Server actions cho favorite: `'use server'` async function trong component, không cần route riêng.
- A/B switch h264/h265 dựa trên device family (`navigator.userAgentData`).

---

## 11. Pháp lý

- API `api.ushort.cloud` thuộc bên thứ ba; đảm bảo có quyền sử dụng nội dung trước khi public service.
- Gắn rate limit + abuse detection để tránh upstream block IP.
