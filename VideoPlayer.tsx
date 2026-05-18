'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { createPortal } from 'react-dom';

interface Subtitle {
  file: string;
  label: string;
  default: boolean;
}

interface Props {
  streamUrl: string;
  episodeId: string;
  subtitles?: Subtitle[];
}

export default function VideoPlayer({ streamUrl, episodeId, subtitles = [] }: Props) {
  const playerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<any>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [resumeInfo, setResumeInfo] = useState<{ show: boolean; time: number }>({ show: false, time: 0 });
  
  const cleanUrl = streamUrl?.replace(/^"|"$/g, '').trim();

  // Handle SSR: Only render player on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Prevent scrolling when popup is shown
  useEffect(() => {
    if (resumeInfo.show) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [resumeInfo.show]);

  useEffect(() => {
    if (!isClient || !cleanUrl || !playerRef.current) return;

    const initPlayer = async () => {
      try {
        setIsLoading(true);
        const Artplayer = (await import('artplayer')).default;
        
        if (artRef.current) {
          artRef.current.destroy();
        }

        const isHls = cleanUrl.includes('m3u8') || cleanUrl.includes('vlogphim') || cleanUrl.includes('v-stream');
        const finalUrl = (isHls && !cleanUrl.includes('/api/v-stream'))
          ? `/api/v-stream?url=${encodeURIComponent(cleanUrl)}`
          : cleanUrl;

        const storageKey = `playback_time_${episodeId}`;
        const savedTime = parseFloat(localStorage.getItem(storageKey) || '0');

        // Find default subtitle
        const defaultSub = subtitles.find(s => s.default) || subtitles[0];

        const playerOptions: any = {
          container: playerRef.current!,
          url: finalUrl,
          type: isHls ? 'm3u8' : 'mp4',
          customType: {
            m3u8: function (video: HTMLMediaElement, url: string) {
              if (Hls.isSupported()) {
                const hls = new Hls({
                  maxBufferLength: 30,
                  maxMaxBufferLength: 60,
                  maxBufferSize: 60 * 1024 * 1024,
                  enableWorker: true,
                  lowLatencyMode: true,
                  backBufferLength: 90,
                  xhrSetup: (xhr) => {
                    xhr.withCredentials = false;
                  }
                });
                hls.loadSource(url);
                hls.attachMedia(video);
              } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
              }
            },
          },
          autoplay: true,
          muted: false,
          volume: 0.7,
          isLive: false,
          autoSize: false,
          autoMini: false,
          screenshot: true,
          setting: true,
          pip: false,
          loop: false,
          flip: true,
          playbackRate: true,
          aspectRatio: true,
          fullscreen: true,
          fullscreenWeb: true,
          subtitleOffset: true,
          miniProgressBar: true,
          mutex: true,
          backdrop: true,
          playsInline: true,
          autoPlayback: false, // Disable native to use our custom popup logic
          airplay: true,
          theme: '#ff4757',
          lang: 'vi',
          settings: subtitles.length > 0 ? [
            {
              width: 200,
              html: 'Phụ đề',
              tooltip: defaultSub?.label || 'Tắt',
              selector: [
                {
                  html: 'Tắt',
                  url: '',
                },
                ...subtitles.map(s => ({
                  html: s.label,
                  url: s.file.includes('/api/v-stream') ? s.file : `/api/v-stream?url=${encodeURIComponent(s.file)}`,
                  default: s.default
                }))
              ],
              onSelect: function (item: any) {
                if (item.url) {
                  art.subtitle.url = item.url;
                  art.subtitle.show = true;
                } else {
                  art.subtitle.show = false;
                }
                return item.html;
              },
            },
          ] : [],
          moreVideoAttr: {
            crossOrigin: 'anonymous',
            playsInline: true,
            'webkit-playsinline': true,
          } as any,
        };

        if (defaultSub) {
          playerOptions.subtitle = {
            url: defaultSub.file.includes('/api/v-stream') ? defaultSub.file : `/api/v-stream?url=${encodeURIComponent(defaultSub.file)}`,
            type: 'vtt',
            style: {
              color: '#fff',
              fontSize: '24px',
            },
            encoding: 'utf-8',
          };
        }

        const art = artRef.current = new Artplayer(playerOptions);

        art.on('ready', () => {
          setIsLoading(false);
          
          if (savedTime > 15) {
            // Small delay to ensure player is fully initialized
            setTimeout(() => {
              // Pause video while asking to resume
              art.pause();
              setResumeInfo({ show: true, time: savedTime });
            }, 500);
          }
        });

        art.on('video:canplay', () => {
          setIsLoading(false);
        });

        art.on('video:timeupdate', () => {
          const currentTime = art.video.currentTime;
          if (currentTime > 5 && (art.video.duration - currentTime > 15)) {
            localStorage.setItem(storageKey, currentTime.toString());
          }
        });

        art.on('error', (error) => {
          console.error('ArtPlayer Error:', error);
          setDebugInfo(`LỖI: ${error.message || 'Lỗi phát video'}`);
          setIsLoading(false);
        });

      } catch (err: any) {
        console.error('Failed to init ArtPlayer:', err);
        setDebugInfo(`LỖI: ${err.message || 'Không xác định'}`);
        setIsLoading(false);
      }
    };

    initPlayer();

    return () => {
      if (artRef.current) {
        artRef.current.destroy();
      }
    };
  }, [isClient, cleanUrl, episodeId]);

  const handleResume = () => {
    if (artRef.current && resumeInfo.time) {
      artRef.current.currentTime = resumeInfo.time;
      artRef.current.play();
      artRef.current.notice.show = 'Đang tiếp tục phát...';
    }
    setResumeInfo({ show: false, time: 0 });
  };

  const handleStartOver = () => {
    if (artRef.current) {
      artRef.current.currentTime = 0;
      artRef.current.play();
    }
    setResumeInfo({ show: false, time: 0 });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const rs = Math.floor(s % 60);
    return `${m}:${rs < 10 ? '0' : ''}${rs}`;
  };

  if (!cleanUrl) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-bg-card rounded-2xl border border-border-subtle text-text-secondary">
        <p>Không tìm thấy link video cho tập phim này.</p>
      </div>
    );
  }

  return (
    <>
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-glow-lg border border-white/5 bg-black">
        <div ref={playerRef} className="w-full h-full [&_.art-loading]:!hidden [&_.art-state]:!hidden" />
        
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
              <div className="absolute w-10 h-10 border-4 border-white/10 border-b-white/50 rounded-full animate-spin-reverse" />
            </div>
            <p className="mt-6 text-white/80 font-medium tracking-wide">Đang tải video...</p>
            {debugInfo && (
              <p className="mt-2 text-[10px] text-white/40 max-w-[80%] break-all font-mono">
                {debugInfo}
              </p>
            )}
          </div>
        )}

        {/* Error display */}
        {debugInfo && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
            <svg className="w-12 h-12 text-red-500 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <p className="text-white font-bold">{debugInfo}</p>
          </div>
        )}
      </div>

      {/* Resume Popup Modal via Portal to avoid clipping */}
      {resumeInfo.show && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div 
            className="w-full max-w-[360px] bg-[#0d121c] border border-white/10 rounded-[32px] p-8 text-center shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
            style={{ fontFamily: 'var(--font-quicksand), sans-serif' }}
          >
             <div className="bg-cyan-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <div className="bg-cyan-500/20 w-11 h-11 rounded-full flex items-center justify-center border-2 border-[#ff4757]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff4757" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
              </div>
              
              <h3 className="text-white text-2xl font-extrabold mb-3 tracking-tight">Tiếp tục xem?</h3>
              <p className="text-white/60 text-[0.95rem] leading-relaxed mb-8 font-medium">
                Hệ thống ghi nhận bạn đã xem đến <b className="text-cyan-400">{formatTime(resumeInfo.time)}</b>.<br/>Tiếp tục xem từ vị trí này?
              </p>

              <div className="flex flex-col gap-4">
                <button 
                  onClick={handleResume}
                  className="w-full py-4 bg-gradient-to-r from-sky-500 to-cyan-400 text-white rounded-2xl font-extrabold text-[1.05rem] shadow-[0_10px_30px_rgba(14,165,233,0.4)] transition-transform active:scale-95"
                >
                  Tiếp tục từ {formatTime(resumeInfo.time)}
                </button>
                <button 
                  onClick={handleStartOver}
                  className="w-full py-2 text-white/30 font-bold text-xs uppercase tracking-[0.2em] hover:text-white/50 transition-colors"
                >
                  Xem lại từ đầu
                </button>
              </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
