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

  const [currentUrl, setCurrentUrl] = useState<string | null>(searchParams.get('url'));
  const [currentSub, setCurrentSub] = useState<string | null>(searchParams.get('sub'));
  const [currentPoster, setCurrentPoster] = useState<string | null>(searchParams.get('poster'));
  const startTime = searchParams.get('time');

  useEffect(() => {
    if (!playerRef.current || !currentUrl) return;

    const art = new Artplayer({
      container: playerRef.current,
      url: currentUrl,
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
      poster: currentPoster || '',
      subtitle: currentSub ? {
        url: currentSub,
        type: currentSub.toLowerCase().includes('.srt') ? 'srt' : 'vtt',
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
      if (playerRef.current) {
        playerRef.current.innerHTML = '';
      }
    };
  }, [currentUrl, currentSub, currentPoster, startTime]);

  // Listen for episode switch from main window
  useEffect(() => {
    let unlistenUpdateFn: (() => void) | undefined;
    const setupUpdateListener = async () => {
      try {
        unlistenUpdateFn = await listen<{url: string, sub: string, poster: string}>('pip-update-url', (event) => {
          const { url, sub, poster } = event.payload;
          // Updating state triggers the other useEffect to destroy and recreate the player from scratch
          setCurrentUrl(url);
          setCurrentSub(sub);
          setCurrentPoster(poster);
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

  if (!currentUrl) return <div className="text-white p-4">Loading...</div>;

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
        .art-video-player, .art-video-player video, .art-video-player .art-video, .art-video-player .art-poster {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
        }
        video::-webkit-media-text-track-container { display: none !important; }
      `}} />
      <div className="absolute inset-0 w-full h-full [&_.art-video-player]:!w-full [&_.art-video-player]:!h-full [&_video]:!object-contain [&_video]:!w-full [&_video]:!h-full">
        <div ref={playerRef} className="w-full h-full !w-full !h-full" style={{ width: '100%', height: '100%' }} />
      </div>
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
