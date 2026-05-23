import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  try {
    const range = request.headers.get('range');
    const isUshort = targetUrl.includes('ushort.cloud') || targetUrl.includes('freereels') || !targetUrl.includes('anime');
    const fetchHeaders: any = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      'Referer': isUshort ? 'https://ushort.cloud/' : 'https://anime47.best/',
      'Origin': isUshort ? 'https://ushort.cloud' : 'https://anime47.best',
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
      return NextResponse.json({ error: `Remote server responded with ${response.status}` }, { 
        status: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const contentType = response.headers.get('Content-Type') || '';
    const isManifest = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL');

    if (isManifest) {
      let text = await response.text();
      
      const urlObj = new URL(targetUrl);
      const baseUrl = urlObj.origin;
      const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

      // Rewrite URLs
      text = text.replace(/^(?!\s*#)(.+)$/gm, (match, p1) => {
        const rawUrl = p1.trim();
        if (!rawUrl) return match;
        let absoluteUrl = rawUrl;
        if (!rawUrl.startsWith('http')) {
          absoluteUrl = rawUrl.startsWith('/') ? (baseUrl + rawUrl) : (basePath + rawUrl);
        }
        return `/api/v-stream?url=${encodeURIComponent(absoluteUrl)}`;
      });

      text = text.replace(/URI=["']([^"']+)["']/g, (match, p1) => {
        let absoluteUrl = p1.trim();
        if (!absoluteUrl.startsWith('http')) {
          absoluteUrl = absoluteUrl.startsWith('/') ? (baseUrl + absoluteUrl) : (basePath + absoluteUrl);
        }
        return `URI="/api/v-stream?url=${encodeURIComponent(absoluteUrl)}"`;
      });

      return new NextResponse(text, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }

    const isSubtitle = targetUrl.includes('.vtt') || targetUrl.includes('.srt') || contentType.includes('text/vtt') || contentType.includes('application/x-subrip') || targetUrl.toLowerCase().includes('subtitle');

    if (isSubtitle) {
      let text = await response.text();
      const isSrt = targetUrl.toLowerCase().includes('.srt') || text.trim().startsWith('1') || !text.includes('WEBVTT');
      
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

    // 2. For video segments, preserve upstream bytes exactly.
    // Some short-reels sources use fMP4/adaptive fragments; scanning for TS sync bytes
    // can accidentally trim valid binary data and cause Hls.js fragParsingError loops.
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const responseHeaders: any = {
      'Content-Type': contentType || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
      'Content-Length': buffer.length.toString(),
    };

    if (response.status === 206) {
      responseHeaders['Content-Range'] = response.headers.get('Content-Range');
    }

    return new NextResponse(buffer, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ error: error.message }, { 
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
