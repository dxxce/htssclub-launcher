import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Dedicated streaming proxy for anime sources (anime47, vlogphim, etc.)
 * Separated from /api/v-stream which is shared with short-reels/ushort.cloud.
 * Always uses anime-specific Origin/Referer headers.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  try {
    const range = request.headers.get('range');

    // Always use anime-specific headers — no ushort detection
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      'Referer': 'https://anime47.best/',
      'Origin': 'https://anime47.best',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not:A-Brand";v="99", "Google Chrome";v="148", "Chromium";v="148"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Priority': 'u=1, i',
    };

    if (range) {
      fetchHeaders['Range'] = range;
    }

    const response = await fetch(targetUrl, {
      headers: fetchHeaders,
    });

    if (!response.ok && response.status !== 206) {
      return NextResponse.json(
        { error: `Remote server responded with ${response.status}` },
        { status: response.status, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const contentType = response.headers.get('Content-Type') || '';
    const isManifest =
      targetUrl.includes('.m3u8') ||
      contentType.includes('mpegurl') ||
      contentType.includes('application/x-mpegURL');

    // 1) m3u8 manifest — rewrite segment/key URLs to go through this proxy
    if (isManifest) {
      let text = await response.text();

      const urlObj = new URL(targetUrl);
      const baseUrl = urlObj.origin;
      const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

      text = text.replace(/^(?!\s*#)(.+)$/gm, (_match, p1) => {
        const rawUrl = p1.trim();
        if (!rawUrl) return _match;
        let absoluteUrl = rawUrl;
        if (!rawUrl.startsWith('http')) {
          absoluteUrl = rawUrl.startsWith('/') ? baseUrl + rawUrl : basePath + rawUrl;
        }
        return `/api/anime-stream?url=${encodeURIComponent(absoluteUrl)}`;
      });

      text = text.replace(/URI=["']([^"']+)["']/g, (_match, p1) => {
        let absoluteUrl = p1.trim();
        if (!absoluteUrl.startsWith('http')) {
          absoluteUrl = absoluteUrl.startsWith('/') ? baseUrl + absoluteUrl : basePath + absoluteUrl;
        }
        return `URI="/api/anime-stream?url=${encodeURIComponent(absoluteUrl)}"`;
      });

      return new NextResponse(text, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // 2) Subtitles — convert SRT to VTT if needed
    const isSubtitle =
      targetUrl.includes('.vtt') ||
      targetUrl.includes('.srt') ||
      contentType.includes('text/vtt') ||
      contentType.includes('application/x-subrip') ||
      targetUrl.toLowerCase().includes('subtitle');

    if (isSubtitle) {
      let text = await response.text();
      const isSrt =
        targetUrl.toLowerCase().includes('.srt') ||
        text.trim().startsWith('1') ||
        !text.includes('WEBVTT');

      if (isSrt) {
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!text.trim().startsWith('WEBVTT')) {
          text = 'WEBVTT\n\n' + text;
        }
        text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }

      return new NextResponse(text, {
        headers: {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // 3) Binary video segments (TS / fMP4) — pass through unchanged
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType || 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
      'Content-Length': buffer.length.toString(),
    };

    if (response.status === 206) {
      const cr = response.headers.get('Content-Range');
      if (cr) responseHeaders['Content-Range'] = cr;
    }

    return new NextResponse(buffer, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('Anime Stream Proxy Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
