"use client";

import { useEffect, useState } from "react";
import { Monitor, AppWindow, X, ScreenShare, Check, Loader2, RefreshCw } from "lucide-react";
import { listCaptureSources, type CaptureSource } from "../lib/voice/tauriScreenCapture";

export interface ScreenShareConfirm {
  sourceId: string;
  width: number;
  height: number;
  fps: number;
}

const RESOLUTIONS = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "1440p", width: 2560, height: 1440 },
] as const;

const FPS_OPTIONS = [15, 30, 60] as const;

/**
 * Picker chia sẻ màn hình kiểu Discord: liệt kê màn hình + cửa sổ (ảnh thu nhỏ
 * lấy từ Rust), chọn nguồn + chất lượng. KHÔNG dùng hộp thoại native của WebView2.
 */
export default function ScreenSharePicker({
  onClose, onConfirm,
}: {
  onClose: () => void;
  onConfirm: (cfg: ScreenShareConfirm) => void;
}) {
  const [tab, setTab] = useState<"monitor" | "window">("monitor");
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [resIdx, setResIdx] = useState(1); // 1080p
  const [fps, setFps] = useState<number>(30);
  const [unsupported, setUnsupported] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await listCaptureSources();
      setSources(list);
      if (list.length === 0) setUnsupported(true);
    } catch {
      setUnsupported(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = sources.filter((s) => s.kind === tab);

  const confirm = () => {
    if (!selected) return;
    const r = RESOLUTIONS[resIdx];
    onConfirm({ sourceId: selected, width: r.width, height: r.height, fps });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-[680px] glass rounded-2xl p-5 shadow-2xl animate-pop-in overflow-hidden max-h-[88vh] flex flex-col"
      >
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <ScreenShare className="w-4 h-4 text-violet-300" /> Chia sẻ màn hình
          </h3>
          <div className="flex items-center gap-1">
            <button onClick={load} data-tip="Làm mới" data-tip-pos="bottom" className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {unsupported ? (
          <div className="py-10 text-center text-neutral-400 text-[13px]">
            Chia sẻ màn hình tích hợp chỉ hoạt động trong ứng dụng HTSS (không chạy trên trình duyệt thường).
          </div>
        ) : (
          <>
            {/* Tabs nguồn */}
            <div className="flex items-center gap-1 mb-3 p-1 rounded-xl bg-white/[0.04] flex-shrink-0">
              {([
                { id: "monitor", label: "Toàn màn hình", Icon: Monitor },
                { id: "window", label: "Cửa sổ ứng dụng", Icon: AppWindow },
              ] as const).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setSelected(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                    tab === id ? "bg-violet-500/20 text-violet-100" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>

            {/* Lưới nguồn */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar -mx-1 px-1">
              {loading ? (
                <div className="py-12 flex items-center justify-center"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 text-[13px]">Không tìm thấy nguồn nào.</div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                  {filtered.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelected(s.id)}
                      className={`group/src flex flex-col rounded-xl overflow-hidden border transition-all cursor-pointer ${
                        selected === s.id ? "border-violet-500/70 ring-2 ring-violet-500/30" : "border-white/[0.08] hover:border-white/20"
                      }`}
                    >
                      <div className="aspect-video bg-black/40 overflow-hidden flex items-center justify-center">
                        {s.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Monitor className="w-7 h-7 text-neutral-700" />
                        )}
                      </div>
                      <div className="px-2 py-1.5 text-[11px] font-semibold text-neutral-300 truncate bg-white/[0.03]">{s.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Chất lượng */}
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06] flex-shrink-0">
              <div className="flex items-center gap-1">
                {RESOLUTIONS.map((r, i) => (
                  <button
                    key={r.label}
                    onClick={() => setResIdx(i)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      resIdx === i ? "bg-violet-500/20 text-violet-100" : "bg-white/[0.04] text-neutral-400 hover:text-white"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {FPS_OPTIONS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFps(f)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      fps === f ? "bg-violet-500/20 text-violet-100" : "bg-white/[0.04] text-neutral-400 hover:text-white"
                    }`}
                  >
                    {f}fps
                  </button>
                ))}
              </div>
              <button
                onClick={confirm}
                disabled={!selected}
                className="ml-auto flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-[13px] font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" /> Chia sẻ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
