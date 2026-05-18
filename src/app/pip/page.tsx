'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

function PipPlayerInner() {
  const searchParams = useSearchParams();
  const playerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);

  const videoUrl = searchParams.get('url');
  const subUrl = searchParams.get('sub');
  const poster = searchParams.get('poster');
  const startTime = searchParams.get('time');

  useEffect(() => {
    if (!playerRef.current || !videoUrl) return;

    const art = new Artplayer({
      container: playerRef.current,
      url: videoUrl,
      type: 'm3u8',
      customType: {
        m3u8: function (video: HTMLMediaElement, url: string, art: Artplayer) {
          if (Hls.isSupported()) {
            if (art.hls) art.hls.destroy();
            const hls = new Hls({
              maxBufferLength: 60,
              maxMaxBufferLength: 180,
              maxBufferSize: 200 * 1024 * 1024,
              maxBufferHole: 0.5,
              enableWorker: true,
              lowLatencyMode: false,
              fragLoadingTimeOut: 30000,
              manifestLoadingTimeOut: 30000,
              levelLoadingTimeOut: 30000,
              manifestLoadingMaxRetry: 6,
              manifestLoadingRetryDelay: 1000,
              levelLoadingMaxRetry: 6,
              levelLoadingRetryDelay: 1000,
              fragLoadingMaxRetry: 10,
              fragLoadingRetryDelay: 500,
              xhrSetup: (xhr) => {
                xhr.withCredentials = false;
              }
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            art.hls = hls;
            art.on('destroy', () => {
              if (art.hls) {
                (art.hls as Hls).destroy();
                art.hls = null;
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
          }
        },
      },
      autoplay: true,
      muted: false,
      volume: 0.7,
      setting: true,
      pip: false,
      fullscreen: false,
      fullscreenWeb: false,
      subtitleOffset: true,
      miniProgressBar: true,
      backdrop: true,
      playsInline: true,
      autoSize: false,
      theme: '#ff4757',
      poster: poster || '',
      subtitle: subUrl ? {
        url: subUrl,
        type: subUrl.toLowerCase().includes('.srt') ? 'srt' : 'vtt',
        style: {
          color: '#fff',
          fontSize: '20px',
        },
        encoding: 'utf-8',
        escape: false,
      } : undefined,
      controls: [
        {
          position: 'right',
          html: '<i class="art-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></i>',
          tooltip: 'Trở lại màn hình chính',
          click: async function () {
            try {
              await closeAndSync();
            } catch (err: any) {
              alert("Lỗi khi đóng cửa sổ: " + err.message);
            }
          }
        }
      ]
    });

    artRef.current = art;

    art.on('ready', () => {

      if (startTime) {
        art.seek = parseFloat(startTime);
      }
    });

    // Listen to OS window close
    const setupCloseListener = async () => {
      try {
        const appWindow = getCurrentWebviewWindow();
        await appWindow.onCloseRequested(async () => {
          const time = artRef.current?.video.currentTime || 0;
          await emit('pip-closed', { time });
        });
      } catch (err: any) {
        console.error("Lỗi đăng ký sự kiện đóng:", err);
      }
    };
    setupCloseListener();

    return () => {
      if (artRef.current) {
        artRef.current.destroy(true);
        artRef.current = null;
      }
      if (playerRef.current) playerRef.current.innerHTML = '';
    };
  }, [videoUrl, subUrl, poster, startTime]);

  // Listen for episode switch from main window
  useEffect(() => {
    let unlistenUpdateFn: (() => void) | undefined;
    const setupUpdateListener = async () => {
      try {
        unlistenUpdateFn = await listen<{url: string, sub: string, poster: string}>('pip-update-url', (event) => {
          const { url, sub, poster } = event.payload;
          
          // Show black overlay to hide the resize glitch
          const overlay = document.getElementById('pip-loading-overlay');
          if (overlay) overlay.style.opacity = '1';

          if (artRef.current) {
            artRef.current.switchUrl(url);
            
            artRef.current.once('video:loadedmetadata', () => {
              if (!artRef.current) return;
              if (sub) {
                const subType = sub.toLowerCase().includes('.srt') ? 'srt' : 'vtt';
                try {
                  artRef.current.subtitle.switch(sub, {
                    type: subType,
                    style: { color: '#fff', fontSize: '24px' },
                    encoding: 'utf-8', escape: false,
                  });
                  artRef.current.subtitle.show = true;
                } catch(e) {}
              } else {
                artRef.current.subtitle.show = false;
              }
              if (poster) artRef.current.poster = poster;
              artRef.current.play().catch(() => {});
            });

            // Hide overlay only after video starts playing and layout has settled
            artRef.current.once('video:playing', () => {
              // Also forcefully trigger a resize just in case
              artRef.current?.emit('resize');
              setTimeout(() => {
                const overlay = document.getElementById('pip-loading-overlay');
                if (overlay) overlay.style.opacity = '0';
              }, 250);
            });
          }
        });
      } catch (err) {
        console.error("Lỗi đăng ký cập nhật PiP:", err);
      }
    };
    setupUpdateListener();

    return () => {
      if (unlistenUpdateFn) unlistenUpdateFn();
    };
  }, []);

  const closeAndSync = async () => {
    try {
      const time = artRef.current?.video.currentTime || 0;
      await emit('pip-closed', { time });
      
      const appWindow = getCurrentWebviewWindow();
      await appWindow.close();
    } catch (err: any) {
      alert("Không thể đóng cửa sổ: " + (err?.message || err || "Lỗi không xác định"));
    }
  };

  if (!videoUrl) return <div className="text-white p-4">Loading...</div>;

  return (
    <div className="w-screen h-screen bg-black group relative">
      {/* Drag region header for borderless window */}
      <div 
        data-tauri-drag-region
        className="absolute top-0 left-0 right-0 h-16 z-[9999] bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-start justify-end p-3 cursor-move pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      >
        <button 
          onClick={closeAndSync}
          className="text-white/70 hover:text-white bg-black/40 hover:bg-red-500/80 backdrop-blur-md rounded-full p-2.5 transition-all cursor-pointer shadow-lg"
          title="Đóng (Trở lại màn hình chính)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      {/* playerRef MUST be absolute to force dimensions against Artplayer's dynamic sizing */}
      <style dangerouslySetInnerHTML={{ __html: `
        .art-video-player video, .art-video-player .art-video, .art-video-player .art-poster {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          min-width: 100% !important;
          min-height: 100% !important;
          object-fit: contain !important;
          transform: none !important;
          margin: 0 !important;
          padding: 0 !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          position: absolute !important;
        }
        video::-webkit-media-text-track-container { display: none !important; }
      `}} />
      <div className="absolute inset-0 w-full h-full [&_.art-video-player]:!w-full [&_.art-video-player]:!h-full [&_video]:!object-contain [&_video]:!w-full [&_video]:!h-full">
        <div ref={playerRef} className="w-full h-full !w-full !h-full" style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Black overlay to mask Artplayer layout shift glitches during switchUrl */}
      <div 
        id="pip-loading-overlay"
        className="absolute inset-0 z-[9998] bg-black transition-opacity duration-300 pointer-events-none opacity-0"
      />
    </div>
  );
}

export default function PipPage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <PipPlayerInner />
    </Suspense>
  );
}
