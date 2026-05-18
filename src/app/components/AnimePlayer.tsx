"use client";

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { createPortal } from 'react-dom';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface Subtitle {
  file: string;
  label: string;
  default?: boolean;
}

interface AnimePlayerProps {
  url: string;
  episodeId: string | number;
  poster?: string;
  title?: string;
  subtitles?: Subtitle[];
  aspectRatio?: string;
  onEnded?: () => void;
  subtitleSize?: string;
  pip?: boolean;
}

const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__tauri !== undefined);
const PROXY_BASE_URL = isTauri ? 'http://vstream.localhost/' : '/api/v-stream';

export default function AnimePlayer({ url, episodeId, poster, title, subtitles = [], aspectRatio, onEnded, subtitleSize, pip }: AnimePlayerProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<any>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const cleanUrl = url?.replace(/^"|"$/g, '').trim();

  const initializedRef = useRef(false);
  const [isPipActive, setIsPipActive] = useState(false);
  
  // Track the most recent active properties to prevent stale closures and blob: URLs
  const activeUrlRef = useRef<string>('');
  const activeSubRef = useRef<{ file: string; label: string; default?: boolean } | undefined>(undefined);
  const activePosterRef = useRef<string | undefined>(poster);

  useEffect(() => {
    const isHls = cleanUrl?.includes('m3u8') || cleanUrl?.includes('vlogphim') || cleanUrl?.includes('v-stream');
    const finalUrl = (cleanUrl && isHls && !cleanUrl.includes(PROXY_BASE_URL))
      ? `${PROXY_BASE_URL}?url=${encodeURIComponent(cleanUrl)}`
      : cleanUrl;
    activeUrlRef.current = finalUrl;
    activeSubRef.current = subtitles?.find(s => s.default) || subtitles?.[0];
    activePosterRef.current = poster;
  }, [cleanUrl, subtitles, poster]);

  // Handle SSR: Only render player on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (artRef.current) {
        artRef.current.destroy();
        artRef.current = null;
      }
      initializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isClient || !cleanUrl || !playerRef.current) return;

    const isHls = cleanUrl.includes('m3u8') || cleanUrl.includes('vlogphim') || cleanUrl.includes('v-stream');
    const finalUrl = (isHls && !cleanUrl.includes(PROXY_BASE_URL))
      ? `${PROXY_BASE_URL}?url=${encodeURIComponent(cleanUrl)}`
      : cleanUrl;

    const defaultSub = subtitles.find(s => s.default) || subtitles[0];

    // If Artplayer is already initialized, switch source dynamically
    if (initializedRef.current && artRef.current) {
      if (isPipActive) {
        let activeSubUrl = '';
        if (defaultSub && defaultSub.file) {
          activeSubUrl = defaultSub.file.includes(PROXY_BASE_URL) ? defaultSub.file : `${PROXY_BASE_URL}?url=${encodeURIComponent(defaultSub.file)}`;
        }
        emit('pip-update-url', {
          url: finalUrl,
          sub: activeSubUrl,
          poster: poster || ''
        }).catch(console.error);
        return; // Skip updating local player while PiP is active
      }

      // Switch URL smoothly using Artplayer's official API
      artRef.current.switchUrl(finalUrl);

      // Wait for video metadata to load before injecting the new subtitle
      // This prevents the Array.from(null) crash by ensuring the video and textTrack are ready
      if (defaultSub && defaultSub.file) {
        const subUrl = defaultSub.file.includes(PROXY_BASE_URL) ? defaultSub.file : `${PROXY_BASE_URL}?url=${encodeURIComponent(defaultSub.file)}`;
        const subType = defaultSub.file.toLowerCase().includes('.srt') ? 'srt' : 'vtt';
        
        artRef.current.once('video:loadedmetadata', () => {
          if (artRef.current && artRef.current.subtitle) {
            try {
              artRef.current.subtitle.switch(subUrl, {
                type: subType,
                style: {
                  color: '#fff',
                  fontSize: subtitleSize || '24px',
                },
                encoding: 'utf-8',
                escape: false,
              });
              artRef.current.subtitle.show = true;
            } catch (err) {
              console.error("Subtitle switch error:", err);
            }
          }
        });
      } else {
        artRef.current.once('video:loadedmetadata', () => {
          if (artRef.current) {
            artRef.current.subtitle.show = false;
            // Clear native track safely
            const video = artRef.current.video;
            if (video && video.textTracks) {
              for (let i = 0; i < video.textTracks.length; i++) {
                if (video.textTracks[i].label === 'HTSS-PiP') {
                  const nativeTrack = video.textTracks[i];
                  if (nativeTrack && nativeTrack.cues) {
                    const cuesToRemove = [];
                    for (let j = 0; j < nativeTrack.cues.length; j++) {
                      cuesToRemove.push(nativeTrack.cues[j]);
                    }
                    cuesToRemove.forEach(c => {
                      try { nativeTrack.removeCue(c); } catch (e) {}
                    });
                  }
                  break;
                }
              }
            }
          }
        });
      }

      if (poster) artRef.current.poster = poster;
      artRef.current.play().catch(() => {});
      return;
    }

    const initPlayer = async () => {
      try {
        setIsLoading(true);
        const Artplayer = (await import('artplayer')).default;

        const playerOptions: any = {
          container: playerRef.current!,
          url: finalUrl,
          type: isHls ? 'm3u8' : 'mp4',
          customType: {
            m3u8: function (video: HTMLMediaElement, url: string, art: any) {
              // Destroy previous Hls.js instance if present on this player to prevent leaks
              if (art.hls) {
                art.hls.destroy();
                art.hls = null;
              }

              if (Hls.isSupported()) {
                const hls = new Hls({
                  maxBufferLength: 60,            // Buffer up to 60 seconds ahead
                  maxMaxBufferLength: 180,        // Maximum allowed buffer up to 180s
                  maxBufferSize: 200 * 1024 * 1024, // Increase buffer capacity to 200MB
                  maxBufferHole: 0.5,             // Automatically skip small buffer gaps
                  enableWorker: true,             // Multi-thread demuxing via Web Workers
                  lowLatencyMode: false,          // Disable low latency mode for pre-recorded anime (deep buffering)
                  fragLoadingTimeOut: 30000,      // Allow up to 30s for a segment to load
                  manifestLoadingTimeOut: 30000,
                  levelLoadingTimeOut: 30000,
                  
                  // Extremely robust retry strategy for weak or fluctuating CDN segments
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

                // Properly destroy Hls.js instance when Artplayer is destroyed
                art.on('destroy', () => {
                  if (art.hls) {
                    art.hls.destroy();
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
          isLive: false,
          autoSize: false,
          autoMini: false,
          screenshot: true,
          setting: true,
          pip: false, // Force disable default PiP to use custom Tauri PiP
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
          theme: '#ff4757', // Sleek red accent from VideoPlayer
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
                  url: s.file.includes(PROXY_BASE_URL) ? s.file : `${PROXY_BASE_URL}?url=${encodeURIComponent(s.file)}`,
                  type: s.file.toLowerCase().includes('.srt') ? 'srt' : 'vtt',
                  default: s.default
                }))
              ],
              onSelect: function (item: any) {
                if (item.url) {
                  art.subtitle.switch(item.url, {
                    type: item.type || 'vtt',
                  });
                  art.subtitle.show = true;
                } else {
                  art.subtitle.show = false;
                  // Clear native track if turned off
                  const video = art.video;
                  if (video) {
                    const nativeTrack = Array.from(video.textTracks || []).find(t => (t as TextTrack).label === 'HTSS-PiP') as TextTrack;
                    if (nativeTrack && nativeTrack.cues) {
                      const oldCues = Array.from(nativeTrack.cues || []);
                      oldCues.forEach(c => {
                        try { nativeTrack.removeCue(c); } catch (e) {}
                      });
                    }
                  }
                }
                return item.html;
              },
            },
          ] : [],
          controls: (pip !== undefined && pip) ? [
            {
              position: 'right',
              html: '<i class="art-icon" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="14" rx="2" ry="2"></rect><rect x="12" y="11" width="7" height="4" rx="1" ry="1"></rect></svg></i>',
              tooltip: 'Picture-in-Picture',
              click: async function () {
                const art = artRef.current;
                const video = art?.video;
                if (!art || !video || !activeUrlRef.current) return;

                const currentTime = video.currentTime;
                // Pause the main video
                art.pause();

                // Get current active states from refs to avoid blob: URLs and stale closures
                const currentUrl = activeUrlRef.current;
                let currentSubUrl = '';
                if (activeSubRef.current && activeSubRef.current.file) {
                  currentSubUrl = activeSubRef.current.file.includes(PROXY_BASE_URL) 
                    ? activeSubRef.current.file 
                    : `${PROXY_BASE_URL}?url=${encodeURIComponent(activeSubRef.current.file)}`;
                }
                const currentPoster = activePosterRef.current || '';

                // Build the Tauri Window URL with params
                const pipUrl = `/pip?url=${encodeURIComponent(currentUrl)}&time=${currentTime}&sub=${encodeURIComponent(currentSubUrl)}&poster=${encodeURIComponent(currentPoster)}`;

                  // Calculate precise dimensions to eliminate black bars
                  const vWidth = video.videoWidth || video.clientWidth || 1920;
                  const vHeight = video.videoHeight || video.clientHeight || 1080;
                  const aspect = vWidth / vHeight;
                  
                  let targetWidth, targetHeight;
                  if (aspect < 1) {
                    // Vertical video (Shorts)
                    targetHeight = 700; // Much larger
                    targetWidth = Math.round(targetHeight * aspect);
                  } else {
                    // Horizontal video
                    targetWidth = 640; // Standard medium-large PiP
                    targetHeight = Math.round(targetWidth / aspect);
                  }

                  // [CACHE BUST 3] Create PiP window via Rust Backend
                  try {
                    setIsPipActive(true);
                    await invoke('create_pip_window', {
                      url: pipUrl,
                      width: targetWidth,
                      height: targetHeight
                    });
                  } catch (err) {
                    setIsPipActive(false);
                    console.error('Failed to create PiP window via Rust:', err);
                  }

                  // Listen for PiP window closing to resume playback
                  const unlisten = await listen<{ time: number }>('pip-closed', (event) => {
                    if (artRef.current) {
                      artRef.current.seek = event.payload.time;
                      artRef.current.play();
                    }
                    setIsPipActive(false);
                    unlisten();
                  });
                }
              }
            ] : [],
          moreVideoAttr: {
            crossOrigin: 'anonymous',
            playsInline: true,
            'webkit-playsinline': true,
          } as any,
        };

        // Subtitle default setup with escape: false to preserve HTML formatting
        if (defaultSub && defaultSub.file) {
          const subUrl = defaultSub.file.includes(PROXY_BASE_URL) ? defaultSub.file : `${PROXY_BASE_URL}?url=${encodeURIComponent(defaultSub.file)}`;
          const subType = defaultSub.file.toLowerCase().includes('.srt') ? 'srt' : 'vtt';
          playerOptions.subtitle = {
            url: subUrl,
            type: subType,
            style: {
              color: '#fff',
              fontSize: subtitleSize || '24px',
            },
            encoding: 'utf-8',
            escape: false, // Allows HTML tags like <i>, <b>, <u> to render correctly in subtitles
          };
        }

        if (poster) playerOptions.poster = poster;
        if (title) playerOptions.title = title;

        const art = artRef.current = new Artplayer(playerOptions);
        initializedRef.current = true;

        art.on('ready', () => {
          setIsLoading(false);
          const video = art.video;
          if (!video) return;

          // Register PiP subtitle toggle listeners
          video.addEventListener('enterpictureinpicture', () => {
            // Forcefully hide Artplayer's overlay using DOM CSS
            const subtitleEl = playerRef.current?.querySelector('.art-subtitle') as HTMLElement;
            if (subtitleEl) subtitleEl.style.display = 'none';
            
            const currentTrack = video.querySelector('#pip-subtitle-track') as HTMLTrackElement;
            if (currentTrack && currentTrack.track) {
              currentTrack.track.mode = 'showing'; // Enable native track for PiP
            }
          });

          video.addEventListener('leavepictureinpicture', () => {
            // Restore Artplayer's overlay
            const subtitleEl = playerRef.current?.querySelector('.art-subtitle') as HTMLElement;
            if (subtitleEl) subtitleEl.style.display = '';
            
            const currentTrack = video.querySelector('#pip-subtitle-track') as HTMLTrackElement;
            if (currentTrack && currentTrack.track) {
              currentTrack.track.mode = 'hidden'; // Disable native track on main screen
            }
          });
        });

        art.on('subtitleLoad', (cues: VTTCue[]) => {
          const video = art.video;
          if (!video) return;

          // Remove old track if exists
          const oldTrackEl = video.querySelector('#pip-subtitle-track');
          if (oldTrackEl) {
            oldTrackEl.remove();
          }

          if (cues && cues.length > 0) {
            const generateVtt = (cues: VTTCue[]) => {
              let vtt = 'WEBVTT\n\n';
              const formatTime = (time: number) => {
                const h = Math.floor(time / 3600);
                const m = Math.floor((time % 3600) / 60);
                const s = Math.floor(time % 60);
                const ms = Math.floor((time % 1) * 1000);
                const pad = (n: number, z = 2) => String(n).padStart(z, '0');
                return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
              };
              cues.forEach((cue) => {
                vtt += `${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n`;
                // Strip HTML tags for maximum native PiP compatibility
                const cleanText = cue.text.replace(/<[^>]+>/g, '');
                vtt += `${cleanText}\n\n`;
              });
              return vtt;
            };

            const vttString = generateVtt(cues);
            // Base64 encode for 100% safe Data URI parsing across all Chromium versions
            const base64Vtt = btoa(unescape(encodeURIComponent(vttString)));
            const dataUri = 'data:text/vtt;base64,' + base64Vtt;

            const trackEl = document.createElement('track');
            trackEl.id = 'pip-subtitle-track';
            trackEl.kind = 'subtitles';
            trackEl.label = 'HTSS-PiP';
            trackEl.srclang = 'vi';
            trackEl.src = dataUri;
            trackEl.default = true;

            video.appendChild(trackEl);

            // Inherit mode based on PiP state
            const inPiP = document.pictureInPictureElement === video;
            setTimeout(() => {
              if (trackEl.track) {
                trackEl.track.mode = inPiP ? 'showing' : 'hidden';
              }
            }, 50);
          }
        });

        art.on('video:canplay', () => {
          setIsLoading(false);
        });

        art.on('video:ended', () => {
          if (onEnded) {
            onEnded();
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
  }, [isClient, cleanUrl, episodeId, subtitles, poster, title, subtitleSize, pip]);

  if (!cleanUrl) {
    return (
      <div className={`w-full ${aspectRatio || 'aspect-video bg-bg-card rounded-2xl border border-border-subtle'} flex items-center justify-center text-text-secondary`}>
        <p>Không tìm thấy link video cho tập phim này.</p>
      </div>
    );
  }

  return (
    <div className={`relative ${aspectRatio || 'w-full aspect-video rounded-2xl'} overflow-hidden shadow-glow-lg border border-white/5 bg-black`}>
      <div ref={playerRef} className="w-full h-full [&_.art-loading]:!hidden [&_.art-state]:!hidden" />
      
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-[#ff4757]/30 border-t-[#ff4757] rounded-full animate-spin" />
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

      {/* PiP Overlay */}
      {isPipActive && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-white/10 p-5 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><rect x="8" y="21" width="8" height="0"></rect><line x1="12" y1="17" x2="12" y2="21"></line><path d="M14 13h4v4h-4z"></path></svg>
          </div>
          <h3 className="text-xl text-white font-bold mb-2">Đang phát trong cửa sổ thu nhỏ (PiP)</h3>
          <p className="text-white/60 text-sm max-w-sm text-center">
            Trình phát chính đã được tạm dừng để nhường tài nguyên cho cửa sổ phụ.
          </p>
        </div>
      )}

      {/* Error display */}
      {debugInfo && !isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
          <svg className="w-12 h-12 text-[#ff4757] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <p className="text-white font-bold">{debugInfo}</p>
        </div>
      )}
    </div>
  );
}
