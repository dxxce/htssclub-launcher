"use client";

// ──────────────────────────────────────────────────────────────────────────
// Chia sẻ màn hình kiểu Discord trong Tauri: Rust capture nguồn → đẩy frame
// (JPEG data URL) qua event "screen-frame" → vẽ lên <canvas> → captureStream()
// cho ra MediaStreamTrack để publish lên LiveKit.
// KHÔNG dùng getDisplayMedia → không có hộp thoại / thanh "đang chia sẻ".
// ──────────────────────────────────────────────────────────────────────────

export interface CaptureSource {
  id: string;        // "monitor:0" | "window:123"
  kind: "monitor" | "window";
  name: string;
  thumbnail: string; // data URL
}

function hasTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

/** Liệt kê màn hình + cửa sổ kèm ảnh thu nhỏ (qua Rust). */
export async function listCaptureSources(): Promise<CaptureSource[]> {
  if (!hasTauri()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CaptureSource[]>("list_capture_sources");
}

export interface TauriCapture {
  track: MediaStreamTrack;
  stop: () => Promise<void>;
}

/**
 * Bắt đầu capture 1 nguồn và trả về 1 video MediaStreamTrack (từ canvas).
 * fps/maxWidth/quality giới hạn tải IPC.
 */
export async function startTauriCapture(opts: {
  sourceId: string;
  fps?: number;
  maxWidth?: number;
  quality?: number;
}): Promise<TauriCapture> {
  if (!hasTauri()) throw new Error("Chia sẻ màn hình tích hợp chỉ chạy trong ứng dụng.");
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không tạo được canvas để chia sẻ.");
  // kích thước canvas đặt theo frame đầu tiên
  let sized = false;

  const img = new Image();
  let pendingSrc: string | null = null;
  let decoding = false;

  const drawNext = () => {
    if (decoding || !pendingSrc) return;
    decoding = true;
    const src = pendingSrc;
    pendingSrc = null;
    img.onload = () => {
      if (!sized || canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        sized = true;
      }
      try { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); } catch {/* ignore */}
      decoding = false;
      if (pendingSrc) drawNext();
    };
    img.onerror = () => { decoding = false; if (pendingSrc) drawNext(); };
    img.src = src;
  };

  const unlisten = await listen<string>("screen-frame", (e) => {
    pendingSrc = e.payload;
    drawNext();
  });

  const fps = opts.fps ?? 15;
  // captureStream với fps để track có khung hình đều.
  const stream = (canvas as HTMLCanvasElement).captureStream(fps);
  const track = stream.getVideoTracks()[0];
  if (!track) {
    unlisten();
    throw new Error("Không tạo được luồng video từ canvas.");
  }

  await invoke("start_screen_capture", {
    sourceId: opts.sourceId,
    fps,
    maxWidth: opts.maxWidth ?? 1280,
    quality: opts.quality ?? 55,
  });

  const stop = async () => {
    try { await invoke("stop_screen_capture"); } catch {/* ignore */}
    try { unlisten(); } catch {/* ignore */}
    try { track.stop(); } catch {/* ignore */}
  };

  // Khi track bị dừng từ nơi khác (LiveKit unpublish) → dọn Rust capture.
  track.addEventListener("ended", () => { void stop(); });

  return { track, stop };
}
