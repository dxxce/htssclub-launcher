                activeStreamKindRef.current = 'h264';
                setVideoError(null);
                setIsVideoLoading(true);
                hls.destroy();
                hlsRef.current = null;
                const fallbackUrl = `${PROXY_BASE_URL}?url=${encodeURIComponent(currentEpisode.external_audio_h264_m3u8)}`;
                  fallbackHls.loadSource(fallbackUrl);
                });
                fallbackHls.on(HlsClass.Events.MANIFEST_PARSED, () => {
                  resumePlayback();
                });
                fallbackHls.on(HlsClass.Events.ERROR, (_fallbackEvent: unknown, fallbackData: any) => {
                  console.warn('[MobileReelsPage] H264 fallback HLS event:', fallbackData?.type, fallbackData?.details, 'fatal:', fallbackData?.fatal);