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
    const fetchHeaders: any = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/145.0.0.0 Safari/537.36',
      'Referer': 'https://anime47.best/',
      'Origin': 'https://anime47.best',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
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
      return NextResponse.json({ error: `Remote server responded with ${response.status}` }, { status: response.status });
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

    // 2. For video segments, sanitize and support Range
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Dynamic Video Extraction: look for MPEG-TS sync pattern (0x47 every 188 bytes)
    let videoOffset = -1;
    const searchLimit = Math.min(buffer.length - 188 * 3, 8000); 
    
    for (let i = 0; i < searchLimit; i++) {
      if (buffer[i] === 0x47 && buffer[i + 188] === 0x47 && buffer[i + 376] === 0x47) {
        videoOffset = i;
        break;
      }
    }

    const videoData = videoOffset !== -1 ? buffer.subarray(videoOffset) : buffer;

    const responseHeaders: any = {
      'Content-Type': contentType || 'video/MP2T',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    };

    if (response.status === 206) {
      responseHeaders['Content-Range'] = response.headers.get('Content-Range');
      responseHeaders['Content-Length'] = videoData.length.toString();
    }

    return new NextResponse(videoData, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
