"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, Volume2, Sparkles, X, Wand2, Check, ChevronDown } from "lucide-react";
import {
  getVoiceSettings,
  setVoiceSettings,
  listAudioDevices,
  buildAudioConstraints,
  type VoiceSettings,
} from "../lib/voice/voiceSettings";
import { NoiseFilter } from "../lib/voice/noiseFilter";
import { useVoiceStore } from "../store/useVoiceStore";
import { toast } from "./Toast";

// Modal cài đặt thoại: chọn thiết bị đầu vào/ra + bật lọc âm nâng cao (kiểu Krisp).
export default function VoiceSettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<VoiceSettings>(() => getVoiceSettings());
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [supportsOutput] = useState<boolean>(() => typeof (HTMLMediaElement.prototype as any).setSinkId === "function");

  // ── thanh đo mức micro (kiểm tra trực tiếp) ──
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const testStreamRef = useRef<MediaStream | null>(null);
  const filterRef = useRef<NoiseFilter | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  const update = (patch: Partial<VoiceSettings>) => {
    const next = setVoiceSettings(patch);
    setSettings({ ...next });
    if (patch.filterStrength != null && filterRef.current) filterRef.current.setStrength(patch.filterStrength);
    // Áp dụng trực tiếp khi đang ở trong phòng thoại.
    try {
      const vs = useVoiceStore.getState();
      if (patch.filterStrength != null) vs.applyFilterStrength(patch.filterStrength);
      if (patch.advancedFilter != null) vs.applyAdvancedFilter(patch.advancedFilter, next.filterStrength);
      if (patch.outputDeviceId != null) vs.applyOutputDevice(patch.outputDeviceId);
    } catch {/* ignore */}
  };

  // Lấy danh sách thiết bị (cần quyền micro để có nhãn).
  const refreshDevices = async () => {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach((t) => t.stop());
    } catch {
      /* vẫn liệt kê được nhưng không có nhãn */
    }
    const { inputs, outputs } = await listAudioDevices();
    setInputs(inputs);
    setOutputs(outputs);
  };

  useEffect(() => {
    refreshDevices();
    return () => stopTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTest = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    filterRef.current?.dispose();
    filterRef.current = null;
    try { ctxRef.current?.close(); } catch {/* ignore */}
    ctxRef.current = null;
    testStreamRef.current?.getTracks().forEach((t) => t.stop());
    testStreamRef.current = null;
    setTesting(false);
    setLevel(0);
  };

  const startTest = async () => {
    try {
      const raw = await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraints(getVoiceSettings()), video: false });
      testStreamRef.current = raw;
      let analysed: MediaStream = raw;
      if (getVoiceSettings().advancedFilter) {
        filterRef.current = new NoiseFilter(getVoiceSettings().filterStrength);
        analysed = filterRef.current.process(raw);
      }
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      // AudioContext có thể khởi tạo ở trạng thái "suspended" → phải resume mới đo được.
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch {/* ignore */}
      }
      const src = ctx.createMediaStreamSource(analysed);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      setTesting(true);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        // RMS quanh giá trị giữa (128) → biên độ tín hiệu thực.
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(100, Math.round(rms * 240)));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e: any) {
      stopTest();
      toast.error(e?.name === "NotAllowedError" ? "Bạn chưa cấp quyền micro." : "Không truy cập được micro để kiểm tra.");
    }
  };

  // Khi đổi thiết bị input / bật-tắt lọc âm lúc đang test → khởi động lại test.
  useEffect(() => {
    if (testing) { stopTest(); startTest(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.inputDeviceId, settings.advancedFilter]);

  const inputOptions = [
    { value: "", label: "Mặc định hệ thống" },
    ...inputs.map((d) => ({ value: d.deviceId, label: d.label || `Micro ${d.deviceId.slice(0, 6)}` })),
  ];
  const outputOptions = [
    { value: "", label: "Mặc định hệ thống" },
    ...outputs.map((d) => ({ value: d.deviceId, label: d.label || `Loa ${d.deviceId.slice(0, 6)}` })),
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-[460px] glass rounded-2xl p-6 shadow-2xl animate-pop-in max-h-[88vh] overflow-y-auto overflow-x-visible custom-scrollbar"
      >
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <Mic className="w-4 h-4 text-violet-300" /> Cài đặt thoại
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Thiết bị đầu vào */}
        <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">Thiết bị đầu vào (Micro)</label>
        <div className="mb-4">
          <Dropdown
            value={settings.inputDeviceId}
            options={inputOptions}
            onChange={(v) => update({ inputDeviceId: v })}
            placeholder="Mặc định hệ thống"
          />
        </div>

        {/* Thiết bị đầu ra */}
        <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">Thiết bị đầu ra (Loa)</label>
        <div className="mb-1">
          <Dropdown
            value={settings.outputDeviceId}
            options={outputOptions}
            onChange={(v) => update({ outputDeviceId: v })}
            placeholder="Mặc định hệ thống"
            disabled={!supportsOutput}
          />
        </div>
        {!supportsOutput && <p className="text-[10px] text-neutral-600 mb-4">Trình duyệt không hỗ trợ đổi thiết bị đầu ra.</p>}
        {supportsOutput && <div className="mb-4" />}

        {/* Kiểm tra micro */}
        <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-bold text-neutral-300 flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5 text-emerald-300" /> Mức micro</span>
            <button
              onClick={() => (testing ? stopTest() : startTest())}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${testing ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25" : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"}`}
            >
              {testing ? "Dừng" : "Kiểm tra"}
            </button>
          </div>
          {/* dải mức dạng các vạch để dễ thấy */}
          <div className="flex items-center gap-[3px] h-3">
            {Array.from({ length: 28 }).map((_, i) => {
              const on = level >= ((i + 1) / 28) * 100;
              const hot = i > 22;
              return (
                <span
                  key={i}
                  className={`flex-1 h-full rounded-[2px] transition-colors duration-75 ${
                    on ? (hot ? "bg-rose-400" : i > 16 ? "bg-amber-400" : "bg-emerald-400") : "bg-white/10"
                  }`}
                />
              );
            })}
          </div>
          {testing && <p className="text-[10px] text-neutral-500 mt-1.5">Nói thử vào micro — các vạch sẽ sáng theo âm lượng.</p>}
        </div>

        {/* Xử lý âm thanh cơ bản */}
        <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-2">Xử lý âm thanh</label>
        <div className="flex flex-col gap-1.5 mb-4">
          <Toggle label="Khử tiếng vọng" checked={settings.echoCancellation} onChange={(v) => update({ echoCancellation: v })} />
          <Toggle label="Khử ồn (cơ bản)" checked={settings.noiseSuppression} onChange={(v) => update({ noiseSuppression: v })} />
          <Toggle label="Tự cân chỉnh âm lượng" checked={settings.autoGainControl} onChange={(v) => update({ autoGainControl: v })} />
        </div>

        {/* Lọc âm nâng cao (Krisp-like) */}
        <div className={`p-3 rounded-xl border transition-all ${settings.advancedFilter ? "border-violet-500/40 bg-violet-500/[0.08]" : "border-white/[0.08] bg-white/[0.02]"}`}>
          <button
            onClick={() => update({ advancedFilter: !settings.advancedFilter })}
            className="flex items-center gap-2.5 w-full text-left cursor-pointer"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${settings.advancedFilter ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white" : "bg-white/[0.06] text-neutral-400"}`}>
              <Wand2 className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-black text-white flex items-center gap-1.5">
                Lọc âm nâng cao
                <Sparkles className="w-3 h-3 text-violet-300" />
              </div>
              <div className="text-[10px] text-neutral-500">Cắt tạp âm nền (quạt, gõ phím, ồn xung quanh)</div>
            </div>
            <span className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${settings.advancedFilter ? "bg-violet-500" : "bg-white/15"}`}>
              <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${settings.advancedFilter ? "left-[1.15rem]" : "left-0.5"}`} />
            </span>
          </button>

          {settings.advancedFilter && (
            <div className="mt-3 pt-3 border-t border-white/[0.08]">
              <div className="flex items-center justify-between mb-1.5 text-[11px] font-bold text-neutral-300">
                <span>Độ mạnh lọc âm</span>
                <span className="text-violet-300 font-black tabular-nums">{settings.filterStrength}%</span>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={settings.filterStrength}
                onChange={(e) => update({ filterStrength: Number(e.target.value) })}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-violet-500"
              />
              <p className="text-[10px] text-neutral-600 mt-1.5">Càng cao càng cắt mạnh tạp âm, nhưng có thể cắt cụt khi nói nhỏ.</p>
            </div>
          )}
        </div>

        <button
          onClick={() => { toast.success("Đã lưu cài đặt thoại. Áp dụng khi vào kênh thoại."); onClose(); }}
          className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-[13px] font-bold transition-all cursor-pointer active:scale-[0.98]"
        >
          <Check className="w-4 h-4" /> Xong
        </button>
      </div>
    </div>
  );
}

// ── Dropdown tùy biến (render qua portal để KHÔNG bị modal cắt/che) ──────────
function Dropdown({
  value, options, onChange, placeholder, disabled,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; openUp: boolean } | null>(null);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label || placeholder || "Chọn...";

  const computePosition = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const desired = Math.min(260, options.length * 38 + 12);
    const openUp = spaceBelow < desired + 12 && r.top > spaceBelow;
    setRect({ left: r.left, top: openUp ? r.top : r.bottom, width: r.width, openUp });
  };

  useLayoutEffect(() => {
    if (open) computePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onReflow = () => computePosition();
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        disabled={disabled}
        className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border text-[13px] text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? "border-violet-500/60 ring-2 ring-violet-500/20" : "border-white/10 hover:border-white/20"
        }`}
      >
        <span className="flex-1 min-w-0 truncate text-neutral-200">{label}</span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={listRef}
          style={{
            position: "fixed",
            left: rect.left,
            width: rect.width,
            ...(rect.openUp
              ? { bottom: window.innerHeight - rect.top + 6 }
              : { top: rect.top + 6 }),
          }}
          className="z-[10010] max-h-[260px] overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-[#101019]/98 backdrop-blur-xl p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.7)] animate-pop-in"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value || "__default"}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[12px] font-semibold text-left transition-colors cursor-pointer ${
                  active ? "bg-violet-500/20 text-violet-200" : "text-neutral-300 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <span className="flex-1 min-w-0 truncate">{o.label}</span>
                {active && <Check className="w-3.5 h-3.5 flex-shrink-0 text-violet-300" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors cursor-pointer">
      <span className="text-[12px] font-semibold text-neutral-200">{label}</span>
      <span className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-emerald-500" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${checked ? "left-[1.15rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
