"use client";

import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Languages, Mic, Volume2, VolumeX, Play, Trash2, Plus, 
  Volume1, RotateCw, Settings, Save, ShieldAlert, Sparkles, Check, ChevronDown, Copy,
  Radio, MicOff, Music, Upload, Wand2, Square
} from "lucide-react";
import { Jungle, semitonesToMult } from "./voiceFx";

interface PresetItem {
  id: string;
  originalText: string;
  translatedText: string;
  srcLang: string;
  targetLang: string;
}

const SUPPORTED_LANGUAGES = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "Tiếng Anh (English)" },
  { code: "ja", label: "Tiếng Nhật (Japanese)" },
  { code: "zh-CN", label: "Tiếng Trung (Chinese)" },
  { code: "ko", label: "Tiếng Hàn (Korean)" },
  { code: "fr", label: "Tiếng Pháp (French)" },
  { code: "es", label: "Tiếng Tây Ban Nha (Spanish)" },
  { code: "ru", label: "Tiếng Nga (Russian)" },
];

const DEFAULT_PRESETS: PresetItem[] = [
  { id: "p1", originalText: "Bắn hay quá bạn ơi!", translatedText: "Nice play, my friend!", srcLang: "vi", targetLang: "en" },
  { id: "p2", originalText: "Thả cho mình khẩu súng với.", translatedText: "Can you drop me a weapon, please?", srcLang: "vi", targetLang: "en" },
  { id: "p3", originalText: "Làm tốt lắm mọi người!", translatedText: "お疲れ様でした！", srcLang: "vi", targetLang: "ja" },
  { id: "p4", originalText: "Xin chào cả team nhé.", translatedText: "大家好，很高兴 và các bạn một đội.", srcLang: "vi", targetLang: "zh-CN" },
];

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { code: string; label: string }[];
  disabled?: boolean;
}

function CustomSelect({ value, onChange, options, disabled }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeOption = options.find(o => o.code === value);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 rounded-2xl px-4 py-3 text-xs font-black text-white flex items-center justify-between transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed select-none shadow-md
          ${isOpen ? 'ring-1 ring-cyan-500/30 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] bg-white/[0.06]' : ''}`}
      >
        <span className="flex items-center gap-2.5 truncate text-neutral-200">
          {activeOption?.label || "Chọn..."}
        </span>
        <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-cyan-400' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-2.5 z-50 bg-[#0b0b11]/98 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200 p-1.5 max-h-[260px] overflow-y-auto custom-scrollbar flex flex-col gap-1">
          {options.map((opt, idx) => {
            const isSelected = opt.code === value;
            return (
              <button
                key={`${opt.code}-${idx}`}
                type="button"
                onClick={() => {
                  onChange(opt.code);
                  setIsOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-black transition-all duration-200 flex items-center justify-between select-none
                  ${isSelected
                    ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/10'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] hover:translate-x-0.5'
                  }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-black shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CustomInlineSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { code: string; label: string }[];
  labelPrefix: string;
}

function CustomInlineSelect({ value, onChange, options, labelPrefix }: CustomInlineSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeOption = options.find(o => o.code === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`bg-white/5 border border-white/5 hover:bg-white/[0.08] hover:border-white/10 rounded-xl px-3 py-1.5 text-[10px] font-black text-neutral-300 flex items-center gap-1.5 transition-all duration-300 cursor-pointer select-none shadow-md
          ${isOpen ? 'ring-1 ring-cyan-500/30 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.2)] bg-white/[0.08] text-white' : ''}`}
      >
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{labelPrefix}:</span>
        <span className="truncate max-w-[100px]">{activeOption?.label || "Chọn..."}</span>
        <ChevronDown className={`w-3 h-3 text-neutral-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-cyan-400' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 bottom-full mb-2 w-[160px] z-50 bg-[#0b0b11]/98 border border-white/10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 p-1 flex flex-col gap-0.5">
          {options.map((opt, idx) => {
            const isSelected = opt.code === value;
            return (
              <button
                key={`${opt.code}-${idx}`}
                type="button"
                onClick={() => {
                  onChange(opt.code);
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-left text-[10px] font-black transition-all duration-200 flex items-center justify-between select-none cursor-pointer
                  ${isSelected
                    ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/10'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] hover:translate-x-0.5'
                  }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3 h-3 text-black shrink-0 ml-1" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  activeColorClass?: string;
}

function CustomCheckbox({ checked, onChange, disabled, activeColorClass = "bg-cyan-500 border-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.35)]" }: CheckboxProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all duration-300 select-none cursor-pointer focus:outline-none shrink-0
        ${disabled 
          ? 'border-white/5 bg-white/[0.01] opacity-30 cursor-not-allowed' 
          : checked 
            ? `${activeColorClass} shadow-lg scale-105` 
            : 'border-white/15 bg-black/40 hover:border-white/30 hover:bg-white/[0.04] hover:scale-105 active:scale-95'
        }`}
    >
      {checked && (
        <Check className="w-3 h-3 stroke-[4] animate-in zoom-in-50 duration-200" />
      )}
    </button>
  );
}

export default function TranslationHub({ reloadKey }: { reloadKey?: number }) {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  
  const [srcLang, setSrcLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("vi");
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem("htss_playback_speed");
      return val === null ? 1.0 : parseFloat(val);
    }
    return 1.0;
  });

  // Audio Device Configuration State
  const [hasPermission, setHasPermission] = useState(false);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  
  const [selectedMonitorId, setSelectedMonitorId] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("htss_selected_monitor_id") || "";
    return "";
  });
  
  const [selectedVirtualMicId, setSelectedVirtualMicId] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("htss_selected_virtual_mic_id") || "";
    return "";
  });
  
  const [selectedMicInputId, setSelectedMicInputId] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("htss_selected_mic_input_id") || "default";
    return "default";
  });
  
  const [enableMonitor, setEnableMonitor] = useState(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem("htss_enable_monitor");
      return val === null ? true : val === "true";
    }
    return true;
  });
  
  const [enableVirtualMic, setEnableVirtualMic] = useState(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem("htss_enable_virtual_mic");
      return val === null ? false : val === "true";
    }
    return false;
  });
  
  const [enableMicLoopback, setEnableMicLoopback] = useState(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem("htss_enable_mic_loopback");
      return val === null ? false : val === "true";
    }
    return false;
  });
  
  // Volume state
  const [volume, setVolume] = useState(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem("htss_volume");
      return val === null ? 0.8 : parseFloat(val);
    }
    return 0.8;
  });

  const [playTarget, setPlayTarget] = useState<"original" | "translated">(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem("htss_play_target");
      return (val as any) || "translated";
    }
    return "translated";
  });

  const [voiceTone, setVoiceTone] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("htss_voice_tone") || "default";
    }
    return "default";
  });

  // ── Voice changer (Edge neural voices + server-side pitch/rate) ──
  const [voiceList, setVoiceList] = useState<{ id: string; label: string; locale: string; gender: string; flag: string }[]>([]);
  const [useVoiceChanger, setUseVoiceChanger] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("htss_use_voice_changer") === "true";
    return false;
  });
  const [selectedVoice, setSelectedVoice] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("htss_selected_voice") || "vi-VN-HoaiMyNeural";
    return "vi-VN-HoaiMyNeural";
  });
  const [voicePitch, setVoicePitch] = useState(() => {
    if (typeof window !== "undefined") {
      const v = localStorage.getItem("htss_voice_pitch");
      return v === null ? 0 : parseInt(v, 10);
    }
    return 0;
  });
  const [voiceRate, setVoiceRate] = useState(() => {
    if (typeof window !== "undefined") {
      const v = localStorage.getItem("htss_voice_rate");
      return v === null ? 0 : parseInt(v, 10);
    }
    return 0;
  });

  // ── Live mic voice changer (real-time) ──
  const [liveActive, setLiveActive] = useState(false);
  const [liveSemitones, setLiveSemitones] = useState(() => {
    if (typeof window !== "undefined") {
      const v = localStorage.getItem("htss_live_semitones");
      return v === null ? -4 : parseInt(v, 10);
    }
    return -4;
  });
  const [liveStatus, setLiveStatus] = useState("");
  const liveCtxRef = useRef<AudioContext | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveJungleRef = useRef<Jungle | null>(null);

  // ── MP3 Soundboard ──
  interface SoundClip { id: string; name: string; dataUrl: string; }
  const [soundClips, setSoundClips] = useState<SoundClip[]>([]);
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Soundboard Presets
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [showNotification, setShowNotification] = useState("");

  const activeAudiosRef = useRef<HTMLAudioElement[]>([]);
  const activeContextsRef = useRef<AudioContext[]>([]);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const [copied, setCopied] = useState(false);
  const [isInstallingMic, setIsInstallingMic] = useState(false);
  const [installMicStatus, setInstallMicStatus] = useState("");

  // Persist settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem("htss_enable_monitor", String(enableMonitor));
  }, [enableMonitor]);

  useEffect(() => {
    localStorage.setItem("htss_enable_virtual_mic", String(enableVirtualMic));
  }, [enableVirtualMic]);

  useEffect(() => {
    localStorage.setItem("htss_enable_mic_loopback", String(enableMicLoopback));
  }, [enableMicLoopback]);

  useEffect(() => {
    localStorage.setItem("htss_volume", String(volume));
  }, [volume]);

  useEffect(() => {
    localStorage.setItem("htss_playback_speed", String(playbackSpeed));
  }, [playbackSpeed]);

  useEffect(() => {
    if (selectedMonitorId) localStorage.setItem("htss_selected_monitor_id", selectedMonitorId);
  }, [selectedMonitorId]);

  useEffect(() => {
    if (selectedVirtualMicId) localStorage.setItem("htss_selected_virtual_mic_id", selectedVirtualMicId);
  }, [selectedVirtualMicId]);

  useEffect(() => {
    if (selectedMicInputId) localStorage.setItem("htss_selected_mic_input_id", selectedMicInputId);
  }, [selectedMicInputId]);

  useEffect(() => {
    localStorage.setItem("htss_play_target", playTarget);
  }, [playTarget]);

  useEffect(() => {
    localStorage.setItem("htss_voice_tone", voiceTone);
  }, [voiceTone]);

  // Voice changer persistence
  useEffect(() => { localStorage.setItem("htss_use_voice_changer", String(useVoiceChanger)); }, [useVoiceChanger]);
  useEffect(() => { localStorage.setItem("htss_selected_voice", selectedVoice); }, [selectedVoice]);
  useEffect(() => { localStorage.setItem("htss_voice_pitch", String(voicePitch)); }, [voicePitch]);
  useEffect(() => { localStorage.setItem("htss_voice_rate", String(voiceRate)); }, [voiceRate]);

  // Load the available neural voices from the backend.
  useEffect(() => {
    invoke<{ id: string; label: string; locale: string; gender: string; flag: string }[]>("list_tts_voices")
      .then((voices) => setVoiceList(voices))
      .catch((err) => console.error("Lỗi tải danh sách giọng:", err));
  }, []);

  // Live voice changer persistence
  useEffect(() => { localStorage.setItem("htss_live_semitones", String(liveSemitones)); }, [liveSemitones]);

  // When the live pitch changes while active, update the running shifter.
  useEffect(() => {
    if (liveActive && liveJungleRef.current) {
      liveJungleRef.current.setPitchOffset(semitonesToMult(liveSemitones));
    }
  }, [liveSemitones, liveActive]);

  // Load saved soundboard clips
  useEffect(() => {
    try {
      const saved = localStorage.getItem("htss_sound_clips");
      if (saved) setSoundClips(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const persistClips = (clips: SoundClip[]) => {
    setSoundClips(clips);
    try { localStorage.setItem("htss_sound_clips", JSON.stringify(clips)); } catch { /* ignore */ }
  };

  // ── Live mic voice changer ──────────────────────────────────────────────
  const stopLiveVoiceChanger = async () => {
    if (liveJungleRef.current) {
      try { liveJungleRef.current.dispose(); } catch { /* ignore */ }
      liveJungleRef.current = null;
    }
    if (liveStreamRef.current) {
      try { liveStreamRef.current.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
      liveStreamRef.current = null;
    }
    if (liveCtxRef.current) {
      try { await liveCtxRef.current.close(); } catch { /* ignore */ }
      liveCtxRef.current = null;
    }
    setLiveActive(false);
    setLiveStatus("");
  };

  const startLiveVoiceChanger = async () => {
    // Determine destination device: prefer virtual mic, else monitor.
    const sinkId =
      (enableVirtualMic && selectedVirtualMicId) ? selectedVirtualMicId :
      (enableMonitor && selectedMonitorId) ? selectedMonitorId : "";

    try {
      setLiveStatus("Đang khởi tạo...");
      // 1. Capture mic input
      const constraints: MediaStreamConstraints = {
        audio: selectedMicInputId && selectedMicInputId !== "default"
          ? { deviceId: { exact: selectedMicInputId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      liveStreamRef.current = stream;

      // 2. Create routed AudioContext
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      let ctx: AudioContext;
      if (sinkId && sinkId !== "default") {
        try {
          ctx = new AudioCtx({ sinkId } as any);
        } catch {
          ctx = new AudioCtx();
          if ((ctx as any).setSinkId) { try { await (ctx as any).setSinkId(sinkId); } catch { /* ignore */ } }
        }
      } else {
        ctx = new AudioCtx();
      }
      liveCtxRef.current = ctx;
      if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* ignore */ } }

      // 3. Build the pitch-shift graph: mic → jungle → gain → destination
      const source = ctx.createMediaStreamSource(stream);
      const jungle = new Jungle(ctx);
      jungle.setPitchOffset(semitonesToMult(liveSemitones));
      liveJungleRef.current = jungle;

      const outGain = ctx.createGain();
      outGain.gain.value = volume;

      source.connect(jungle.input);
      jungle.output.connect(outGain);
      outGain.connect(ctx.destination);

      setLiveActive(true);
      const where = (enableVirtualMic && selectedVirtualMicId) ? "Mic ảo (Discord/Game)"
        : (enableMonitor && selectedMonitorId) ? "loa/tai nghe" : "thiết bị mặc định";
      setLiveStatus(`Đang đổi giọng trực tiếp → ${where}`);
    } catch (err: any) {
      console.error("Live voice changer error:", err);
      triggerNotification("Không thể bật đổi giọng real-time: " + (err?.message || err));
      await stopLiveVoiceChanger();
    }
  };

  const toggleLiveVoiceChanger = () => {
    if (liveActive) stopLiveVoiceChanger();
    else startLiveVoiceChanger();
  };

  // Cleanup live changer on unmount
  useEffect(() => {
    return () => { stopLiveVoiceChanger(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── MP3 Soundboard ──────────────────────────────────────────────────────
  const handleAddSoundClips = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newClips: SoundClip[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|webm)$/i.test(file.name)) continue;
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        newClips.push({
          id: "clip_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          name: file.name.replace(/\.[^.]+$/, ""),
          dataUrl,
        });
      } catch (e) {
        console.error("Lỗi đọc file âm thanh:", e);
      }
    }
    if (newClips.length) {
      persistClips([...soundClips, ...newClips]);
      triggerNotification(`Đã thêm ${newClips.length} âm thanh vào Soundboard!`);
    }
  };

  const handleDeleteClip = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    persistClips(soundClips.filter(c => c.id !== id));
  };

  const handleStopClip = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    stopAllAudio();
    setPlayingClipId(null);
  };

  const handlePlayClip = async (clip: SoundClip) => {
    // Toggle: nếu clip này đang phát thì bấm lại để dừng
    if (playingClipId === clip.id) {
      handleStopClip();
      return;
    }
    stopAllAudio();
    setPlayingClipId(clip.id);
    try {
      const playPromises: Promise<any>[] = [];
      if (enableMonitor && selectedMonitorId) playPromises.push(playToDevice(clip.dataUrl, selectedMonitorId, volume));
      if (enableVirtualMic && selectedVirtualMicId) playPromises.push(playToDevice(clip.dataUrl, selectedVirtualMicId, volume));
      if (playPromises.length === 0) playPromises.push(playToDevice(clip.dataUrl, "", volume));
      await Promise.all(playPromises);
    } catch (err: any) {
      console.error("Soundboard playback failed:", err);
      triggerNotification("Lỗi phát âm thanh: " + (err?.message || err));
    } finally {
      setPlayingClipId((cur) => (cur === clip.id ? null : cur));
    }
  };

  const handleInstallVirtualMic = async () => {    if (isInstallingMic) return;
    setIsInstallingMic(true);
    setInstallMicStatus("Đang tải xuống bộ cài đặt driver Mic ảo...");
    try {
      const result = await invoke<string>("install_virtual_mic");
      setInstallMicStatus(result);
      triggerNotification("Đã mở trình cài đặt driver Mic ảo!");
      
      // Tự động quét lại các thiết bị âm thanh sau khi cài đặt
      setTimeout(() => {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(() => navigator.mediaDevices.enumerateDevices())
          .then(devices => {
            const outputs = devices.filter(d => d.kind === "audiooutput");
            setOutputDevices(outputs);
          })
          .catch(err => console.error(err));
      }, 10000);
    } catch (err) {
      console.error(err);
      setInstallMicStatus(`Lỗi cài đặt: ${err}`);
      triggerNotification("Không thể tự động cài đặt driver!");
    } finally {
      setIsInstallingMic(false);
    }
  };

  const handleCopy = async () => {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      triggerNotification("Đã sao chép văn bản dịch!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const updateMicLoopback = async () => {
    // Clean up existing context/stream first
    if (micContextRef.current) {
      try {
        await micContextRef.current.close();
      } catch (e) {}
      micContextRef.current = null;
    }
    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {}
      micStreamRef.current = null;
    }

    if (!enableMicLoopback || !enableVirtualMic || !selectedVirtualMicId || liveActive) {
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMicInputId === "default" 
          ? true 
          : { deviceId: { exact: selectedMicInputId } }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      // Tạo AudioContext định tuyến duy nhất tới Mic ảo
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      let ctx: AudioContext;

      if (typeof (AudioContextClass.prototype as any).setSinkId === "function") {
        ctx = new AudioContextClass({ sinkId: selectedVirtualMicId } as any);
      } else {
        ctx = new AudioContextClass();
        if ((ctx as any).setSinkId) {
          await (ctx as any).setSinkId(selectedVirtualMicId);
        }
      }

      const source = ctx.createMediaStreamSource(stream);
      source.connect(ctx.destination);
      micContextRef.current = ctx;
    } catch (err) {
      console.error("Failed to start mic loopback with AudioContext:", err);
      triggerNotification("Không thể tự động trộn Mic thật: " + err);
      setEnableMicLoopback(false);
    }
  };

  useEffect(() => {
    updateMicLoopback();
    return () => {
      if (micContextRef.current) {
        try {
          micContextRef.current.close();
        } catch (e) {}
      }
      if (micStreamRef.current) {
        try {
          micStreamRef.current.getTracks().forEach(track => track.stop());
        } catch (e) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableMicLoopback, selectedMicInputId, selectedVirtualMicId, enableVirtualMic, liveActive]);

  // Load Presets and Enumerate Devices
  useEffect(() => {
    const saved = localStorage.getItem("htss_translation_presets");
    if (saved) {
      try {
        setPresets(JSON.parse(saved));
      } catch (e) {
        setPresets(DEFAULT_PRESETS);
      }
    } else {
      setPresets(DEFAULT_PRESETS);
      localStorage.setItem("htss_translation_presets", JSON.stringify(DEFAULT_PRESETS));
    }

    // Auto-detect devices in webview
    checkAudioPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Request audio permission and enumerate devices
  const checkAudioPermissions = async (request = false) => {
    try {
      if (request) {
        // Triggers the OS media prompt inside Tauri/WebView2
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasPermission(true);
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === "audiooutput");
      const inputs = devices.filter(d => d.kind === "audioinput");
      setOutputDevices(outputs);
      setInputDevices(inputs);
      
      // Auto-configure devices with local storage fallback
      const savedMonitorId = localStorage.getItem("htss_selected_monitor_id");
      const monitorExists = outputs.some(d => d.deviceId === savedMonitorId);
      if (savedMonitorId && monitorExists) {
        setSelectedMonitorId(savedMonitorId);
      } else {
        const defaultOut = outputs.find(d => d.deviceId === "default") || outputs[0];
        if (defaultOut) {
          setSelectedMonitorId(defaultOut.deviceId);
        }
      }

      const savedMicInputId = localStorage.getItem("htss_selected_mic_input_id");
      const micInputExists = inputs.some(d => d.deviceId === savedMicInputId);
      if (savedMicInputId && micInputExists) {
        setSelectedMicInputId(savedMicInputId);
      } else {
        const defaultIn = inputs.find(d => d.deviceId === "default") || inputs[0];
        if (defaultIn) {
          setSelectedMicInputId(defaultIn.deviceId);
        }
      }

      // Look for Virtual Cable, VB-Audio or Soundboard outputs
      const savedVirtualMicId = localStorage.getItem("htss_selected_virtual_mic_id");
      const virtualMicExists = outputs.some(d => d.deviceId === savedVirtualMicId);
      if (savedVirtualMicId && virtualMicExists) {
        setSelectedVirtualMicId(savedVirtualMicId);
      } else {
        const virtualMic = outputs.find(d => 
          d.label.toLowerCase().includes("cable") || 
          d.label.toLowerCase().includes("virtual") ||
          d.label.toLowerCase().includes("vb-audio")
        );
        if (virtualMic) {
          setSelectedVirtualMicId(virtualMic.deviceId);
          const savedEnableVirtualMic = localStorage.getItem("htss_enable_virtual_mic");
          if (savedEnableVirtualMic === null) {
            setEnableVirtualMic(true); // Auto-enable if found first time
          }
        } else if (outputs.length > 0) {
          const fallback = outputs.find(d => d.deviceId !== "default" && d.deviceId !== "");
          if (fallback) {
            setSelectedVirtualMicId(fallback.deviceId);
          }
        }
      }

      // Check if permission is already granted by looking at labels
      const hasLabels = outputs.some(d => d.label !== "");
      if (hasLabels) {
        setHasPermission(true);
      }
    } catch (err) {
      console.error("Error checking audio devices:", err);
    }
  };

  // Perform translation
  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    try {
      setIsTranslating(true);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(inputText)}`;
      const res = await fetch(url);
      const json = await res.json();
      
      let translated = "";
      if (json && json[0]) {
        json[0].forEach((item: any) => {
          if (item[0]) translated += item[0];
        });
      }
      setTranslatedText(translated);
    } catch (err) {
      console.error("Translation error:", err);
      setTranslatedText("Lỗi dịch thuật. Vui lòng kiểm tra lại kết nối mạng!");
    } finally {
      setIsTranslating(false);
    }
  };

  // Play Speech/TTS audio
  const handlePlayVoice = async (textToPlay?: string, langToUse?: string) => {
    let finalSelectionText = "";
    let finalSelectionLang = "";

    if (textToPlay !== undefined && langToUse !== undefined) {
      finalSelectionText = textToPlay;
      finalSelectionLang = langToUse;
    } else {
      if (playTarget === "original") {
        finalSelectionText = inputText;
        finalSelectionLang = srcLang === "auto" ? "vi" : srcLang;
      } else {
        finalSelectionText = translatedText;
        finalSelectionLang = targetLang;
      }
    }

    if (!finalSelectionText || !finalSelectionText.trim()) {
      triggerNotification("Không có nội dung để phát!");
      return;
    }
    
    // Stop all active playbacks first
    stopAllAudio();
    setIsPlaying(true);

    try {
      let langParam = finalSelectionLang;
      let pitchParam = 0;
      let rateParam = 0;

      if (useVoiceChanger && selectedVoice) {
        // Voice changer: use the chosen neural voice with server-side pitch/rate.
        langParam = selectedVoice;
        pitchParam = voicePitch;
        rateParam = voiceRate;
      } else if (finalSelectionLang === "vi") {
        if (voiceTone === "edge_female") {
          langParam = "edge-HoaiMyNeural";
        } else if (voiceTone === "edge_male") {
          langParam = "edge-NamMinhNeural";
        }
      } else if (finalSelectionLang === "en") {
        if (voiceTone === "edge_female") {
          langParam = "edge-EmmaNeural";
        } else if (voiceTone === "edge_male") {
          langParam = "edge-GuyNeural";
        }
      }

      // Gọi backend để lấy audio dạng Base64 nhằm tránh CORS và các hạn chế của WebView
      const audioUrl = await invoke<string>("get_tts_audio", { 
        text: finalSelectionText, 
        lang: langParam,
        pitch: pitchParam,
        rate: rateParam
      });
      
      const playPromises: Promise<any>[] = [];

      // 1. Play on Monitor (speakers)
      if (enableMonitor && selectedMonitorId) {
        playPromises.push(playToDevice(audioUrl, selectedMonitorId, volume));
      }

      // 2. Play on Virtual Mic (VB-Cable CABLE Input)
      if (enableVirtualMic && selectedVirtualMicId) {
        playPromises.push(playToDevice(audioUrl, selectedVirtualMicId, volume));
      }

      if (playPromises.length === 0) {
        // Default fallback
        playPromises.push(playToDevice(audioUrl, "", volume));
      }

      await Promise.all(playPromises);
    } catch (err: any) {
      console.error("Playback failed:", err);
      triggerNotification("Lỗi phát giọng nói: " + (err?.message || err || "Vui lòng thử lại"));
    } finally {
      setIsPlaying(false);
    }
  };

  // Helper function to handle Web Audio setSinkId playback
  const playToDevice = async (url: string, deviceId: string, playVolume: number): Promise<void> => {
    // 1. Create AudioContext
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    activeContextsRef.current.push(audioCtx);

    // 2. Set Sink ID (routing to specific audio device)
    if (deviceId && deviceId !== "default" && (audioCtx as any).setSinkId) {
      try {
        await (audioCtx as any).setSinkId(deviceId);
      } catch (err) {
        console.warn(`Failed to set sink ID ${deviceId} on AudioContext:`, err);
      }
    }

    // 3. Fetch and decode audio data
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    return new Promise((resolve, reject) => {
      // 4. Create source node
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = playbackSpeed;

      // 5. Apply Voice Tone (Pitch Shifting using detune AudioParam)
      if (voiceTone === "deep_male") {
        source.detune.value = -350; // lower pitch by 3.5 semitones for a deep male sound
      } else if (voiceTone === "high_female") {
        source.detune.value = 350; // raise pitch by 3.5 semitones for a clear female sound
      } else if (voiceTone === "chipmunk") {
        source.detune.value = 750; // raise pitch by 7.5 semitones for child/cute voice
      } else if (voiceTone === "giant") {
        source.detune.value = -600; // lower pitch by 6 semitones for a heavy giant voice
      } else if (voiceTone === "robot") {
        source.detune.value = -150;
      }

      // 6. Create volume gain node
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = playVolume;

      // 7. Route and connect nodes
      if (voiceTone === "robot") {
        // Sci-fi metallic delay feedback loop
        const delay = audioCtx.createDelay();
        delay.delayTime.value = 0.015; // 15ms delay

        const feedback = audioCtx.createGain();
        feedback.gain.value = 0.6; // High feedback for metallic ringing

        // Connect feedback loop
        source.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);

        // Mix both direct and delayed signals
        source.connect(gainNode);
        delay.connect(gainNode);
      } else {
        source.connect(gainNode);
      }

      gainNode.connect(audioCtx.destination);
      activeSourcesRef.current.push(source);

      // 8. Playback lifecycle handlers
      source.onended = () => {
        // Clean up tracking refs
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
        activeContextsRef.current = activeContextsRef.current.filter(c => c !== audioCtx);
        try {
          audioCtx.close();
        } catch (e) {}
        resolve();
      };

      try {
        source.start(0);
      } catch (err) {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
        activeContextsRef.current = activeContextsRef.current.filter(c => c !== audioCtx);
        try {
          audioCtx.close();
        } catch (e) {}
        reject(err);
      }
    });
  };

  const stopAllAudio = () => {
    // 1. Stop all Web Audio API sources
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });
    activeSourcesRef.current = [];

    // 2. Close all active contexts
    activeContextsRef.current.forEach(ctx => {
      try {
        ctx.close();
      } catch (e) {}
    });
    activeContextsRef.current = [];

    // 3. Pause any HTML5 Audio tag elements
    activeAudiosRef.current.forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}
    });
    activeAudiosRef.current = [];

    setIsPlaying(false);
  };

  // Preset management
  const handleSavePreset = () => {
    if (!inputText.trim() || !translatedText.trim()) return;
    
    const newPreset: PresetItem = {
      id: "preset_" + Date.now(),
      originalText: inputText,
      translatedText: translatedText,
      srcLang,
      targetLang
    };

    const updated = [newPreset, ...presets];
    setPresets(updated);
    localStorage.setItem("htss_translation_presets", JSON.stringify(updated));
    triggerNotification("Đã lưu cụm từ vào danh sách Soundboard!");
  };

  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem("htss_translation_presets", JSON.stringify(updated));
    triggerNotification("Đã xóa cụm từ khỏi danh sách.");
  };

  const handlePlayPreset = (preset: PresetItem) => {
    handlePlayVoice(preset.translatedText, preset.targetLang);
    triggerNotification(`Đang phát: "${preset.translatedText}"`);
  };

  const triggerNotification = (msg: string) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(""), 3000);
  };

  const swapLanguages = () => {
    const newSrc = targetLang === "auto" ? "en" : targetLang;
    const newTarget = srcLang === "auto" ? "vi" : srcLang;
    setSrcLang(newSrc);
    setTargetLang(newTarget);
    setInputText(translatedText);
    setTranslatedText(inputText);
  };

  return (
    <div className="flex flex-col w-full min-h-screen relative z-10 animate-in fade-in zoom-in-95 duration-300 select-none pb-12">
      
      {/* Toast Notification */}
      {showNotification && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl bg-cyan-950/90 border border-cyan-500/30 backdrop-blur-md shadow-2xl flex items-center gap-2 text-xs font-bold text-cyan-300 animate-in slide-in-from-bottom-5 duration-300">
          <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>{showNotification}</span>
        </div>
      )}

      {/* Main Layout Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Languages className="w-8 h-8 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.3)] animate-pulse" /> 
            Dịch Thuật & Soundboard Mic
          </h1>
          <p className="text-neutral-400 text-sm mt-1">
            Dịch ngôn ngữ cực nhanh, tạo giọng đọc chuyên nghiệp và inject trực tiếp vào Mic trong Discord hoặc Game.
          </p>
        </div>

        {/* Audio Access Banner */}
        {!hasPermission ? (
          <button
            onClick={() => checkAudioPermissions(true)}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/25 rounded-2xl text-xs font-black transition-all cursor-pointer shadow-md shadow-yellow-500/5 animate-pulse"
          >
            <ShieldAlert className="w-4 h-4" />
            Cấp Quyền Âm Thanh
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500/5 border border-cyan-500/15 text-cyan-400 rounded-full text-[10px] font-black uppercase tracking-wider">
            <Check className="w-3.5 h-3.5" />
            Đã đồng bộ Microphone
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        
        {/* Top: Translation Panels */}
        <div className="bg-[#0c0c12]/60 border border-white/5 backdrop-blur-md rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            {/* Lang select header */}
            <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-white/5">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">Ngôn ngữ nguồn</label>
                <CustomSelect
                  value={srcLang}
                  onChange={setSrcLang}
                  options={[
                    { code: "auto", label: "🔎 Phát hiện ngôn ngữ (Auto)" },
                    ...SUPPORTED_LANGUAGES
                  ]}
                />
              </div>

              {/* Swap Button */}
              <button 
                onClick={swapLanguages}
                className="w-9 h-9 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-neutral-400 hover:text-cyan-400 hover:bg-white/10 hover:border-cyan-500/30 cursor-pointer mt-5 transition-all duration-300 hover:rotate-180 animate-in fade-in"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              <div className="flex-1">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">Ngôn ngữ đích</label>
                <CustomSelect
                  value={targetLang}
                  onChange={setTargetLang}
                  options={SUPPORTED_LANGUAGES}
                />
              </div>
            </div>

            {/* Translation Box Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Source Textarea */}
              <div className="flex flex-col relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Nhập nội dung cần dịch hoặc phát giọng nói tại đây..."
                  rows={6}
                  className="w-full bg-[#030305]/40 border border-white/5 rounded-2xl p-4 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-cyan-500/30 focus:bg-[#030305]/60 resize-none transition-all custom-scrollbar leading-relaxed"
                />
                <span className="absolute bottom-3 right-3 text-[10px] text-neutral-500 font-bold">
                  {inputText.length} ký tự
                </span>
              </div>

               {/* Translation Output */}
              <div className="flex flex-col relative">
                <div className={`w-full h-full min-h-[148px] bg-cyan-950/[0.05] border border-white/5 rounded-2xl p-4 pr-16 text-sm leading-relaxed overflow-y-auto custom-scrollbar transition-all
                  ${translatedText ? 'text-white' : 'text-neutral-500 italic'}`}>
                  {isTranslating ? (
                    <div className="flex items-center gap-2 text-xs text-cyan-400 font-bold animate-pulse py-2">
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      Đang biên dịch...
                    </div>
                  ) : (
                    translatedText || "Kết quả dịch sẽ tự động hiển thị tại đây khi bạn bấm nút Dịch."
                  )}
                </div>

                {translatedText && !isTranslating && (
                  <button
                    onClick={handleCopy}
                    className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 hover:bg-cyan-500 hover:text-black hover:border-cyan-500 text-neutral-400 hover:shadow-[0_0_10px_rgba(34,211,238,0.25)] text-[10px] font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-1.5 cursor-pointer z-10 animate-in fade-in zoom-in-90"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Đã chép!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Translate Button below textareas */}
            <div className="mt-5">
              <button
                onClick={handleTranslate}
                disabled={!inputText.trim() || isTranslating}
                className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl border text-xs font-black uppercase tracking-wider transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]
                  ${inputText.trim()
                    ? 'bg-cyan-500 text-black border-cyan-500 hover:bg-cyan-400 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(6,182,212,0.35)] cursor-pointer'
                    : 'border-white/5 text-neutral-600 bg-white/[0.01] cursor-not-allowed opacity-50'
                  }`}
              >
                {isTranslating ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin text-black" />
                    <span>Đang biên dịch...</span>
                  </>
                ) : (
                  <>
                    <Languages className="w-4.5 h-4.5 text-black" />
                    <span>Dịch Thuật</span>
                  </>
                )}
              </button>
            </div>

            {/* Symmetrical Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-5 border-t border-white/5">
              
              <div className="flex items-center gap-3">
                {/* Playback speed presets */}
                <div className="flex items-center gap-1.5 bg-white/5 border border-white/5 rounded-xl px-2 py-1.5">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider ml-1 mr-1">Tốc độ:</span>
                  {[0.8, 1.0, 1.25].map(speed => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer
                        ${playbackSpeed === speed 
                          ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/10' 
                          : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                    >
                      {speed.toFixed(2)}x
                    </button>
                  ))}
                </div>

                {/* Voice Tone selector */}
                <CustomInlineSelect
                  value={voiceTone}
                  onChange={setVoiceTone}
                  labelPrefix="Tông giọng"
                  options={[
                    { code: "default", label: "Mặc định (Google)" },
                    { code: "edge_female", label: "Nữ Edge (Neural)" },
                    { code: "edge_male", label: "Nam Edge (Neural)" },
                    { code: "deep_male", label: "Giọng Nam trầm" },
                    { code: "high_female", label: "Giọng Nữ cao" },
                    { code: "chipmunk", label: "Giọng Con nít" },
                    { code: "giant", label: "Giọng Khổng lồ" },
                    { code: "robot", label: "Giọng Robot" }
                  ]}
                />
              </div>

              <div className="flex items-center gap-3">
                
                {/* Save to Presets */}
                <button
                  disabled={!inputText.trim() || !translatedText.trim()}
                  onClick={handleSavePreset}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all
                    ${inputText.trim() && translatedText.trim()
                      ? 'bg-white/[0.02] border-white/5 text-neutral-300 hover:text-white hover:bg-white/[0.08] hover:border-white/10 cursor-pointer'
                      : 'border-white/5 text-neutral-600 bg-white/[0.01] cursor-not-allowed opacity-50'
                    }`}
                >
                  <Save className="w-4 h-4 text-cyan-400" />
                  <span>Lưu Preset</span>
                </button>

                {/* Play source target selector */}
                <div className="flex items-center gap-1 bg-white/5 border border-white/5 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setPlayTarget("original")}
                    className={`px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer select-none hover:scale-105 active:scale-95
                      ${playTarget === "original"
                        ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/10'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                  >
                    Chưa dịch
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayTarget("translated")}
                    className={`px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer select-none hover:scale-105 active:scale-95
                      ${playTarget === "translated"
                        ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/10'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                  >
                    Đã dịch
                  </button>
                </div>

                {/* Primary Action: Play / Inject Mic */}
                <button
                  onClick={() => handlePlayVoice()}
                  disabled={playTarget === "original" ? !inputText.trim() : !translatedText.trim()}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all duration-300 hover:scale-105 active:scale-95
                    ${(playTarget === "original" ? inputText.trim() : translatedText.trim())
                      ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-500 hover:border-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.25)] cursor-pointer'
                      : 'border-white/5 text-neutral-600 bg-white/[0.01] cursor-not-allowed opacity-50'
                    }`}
                >
                  {isPlaying ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin text-white" />
                      <span>Đang phát...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-white" />
                      <span>Phát ra Mic</span>
                    </>
                  )}
                </button>

                {isPlaying && (
                  <button 
                    onClick={stopAllAudio}
                    className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 cursor-pointer transition-all"
                  >
                    <VolumeX className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

        {/* Voice Changer Panel */}
        <div className="bg-[#0c0c12]/60 border border-white/5 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-4 mb-1 flex-wrap">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Mic className="w-5 h-5 text-fuchsia-400" /> Đổi Giọng Nói (Voice Changer)
            </h3>
            {/* Enable toggle */}
            <button
              type="button"
              onClick={() => setUseVoiceChanger(v => !v)}
              role="switch"
              aria-checked={useVoiceChanger}
              className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ${useVoiceChanger ? "bg-fuchsia-500 shadow-[0_0_12px_rgba(217,70,239,0.4)]" : "bg-white/10"}`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${useVoiceChanger ? "translate-x-[22px]" : "translate-x-0.5"}`}
              />
            </button>
          </div>
          <p className="text-[11px] text-neutral-500 mb-5">
            Chọn nhiều loại giọng nói (nam/nữ, nhiều ngôn ngữ) và tinh chỉnh cao độ / tốc độ. Khi bật, mọi lượt phát sẽ dùng giọng này.
          </p>

          <div className={`transition-opacity duration-300 ${useVoiceChanger ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            {/* Voice grid */}
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Chọn giọng</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
              {voiceList.map((voice) => {
                const isSel = selectedVoice === voice.id;
                return (
                  <button
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer select-none
                      ${isSel
                        ? "bg-fuchsia-500/15 border-fuchsia-500/40 shadow-[0_0_12px_rgba(217,70,239,0.15)]"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/10"}`}
                  >
                    <span className="text-base leading-none">{voice.flag}</span>
                    <span className="min-w-0 flex flex-col">
                      <span className={`text-[11px] font-black truncate ${isSel ? "text-fuchsia-200" : "text-neutral-200"}`}>{voice.label}</span>
                      <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wide">{voice.locale}</span>
                    </span>
                    {isSel && <Check className="w-3.5 h-3.5 text-fuchsia-400 ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Pitch & Rate sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Cao độ (Pitch)</span>
                  <span className="text-[11px] font-black text-fuchsia-300">{voicePitch > 0 ? `+${voicePitch}` : voicePitch} Hz</span>
                </div>
                <input
                  type="range" min={-50} max={50} step={1}
                  value={voicePitch}
                  onChange={(e) => setVoicePitch(parseInt(e.target.value, 10))}
                  className="w-full accent-fuchsia-500 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-600 font-bold mt-1">
                  <span>Trầm</span><span>Gốc</span><span>Cao</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Tốc độ (Rate)</span>
                  <span className="text-[11px] font-black text-fuchsia-300">{voiceRate > 0 ? `+${voiceRate}` : voiceRate}%</span>
                </div>
                <input
                  type="range" min={-50} max={50} step={1}
                  value={voiceRate}
                  onChange={(e) => setVoiceRate(parseInt(e.target.value, 10))}
                  className="w-full accent-fuchsia-500 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-600 font-bold mt-1">
                  <span>Chậm</span><span>Gốc</span><span>Nhanh</span>
                </div>
              </div>
            </div>

            {/* Quick presets + test */}
            <div className="flex items-center gap-2 mt-5 flex-wrap">
              {[
                { label: "Gốc", p: 0, r: 0 },
                { label: "Nam trầm", p: -25, r: -5 },
                { label: "Nữ cao", p: 30, r: 5 },
                { label: "Con nít", p: 45, r: 8 },
                { label: "Khổng lồ", p: -45, r: -12 },
              ].map((pre) => (
                <button
                  key={pre.label}
                  onClick={() => { setVoicePitch(pre.p); setVoiceRate(pre.r); }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-white/[0.03] border border-white/5 text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                >
                  {pre.label}
                </button>
              ))}
              <button
                onClick={() => {
                  const sample = (playTarget === "original" ? inputText : translatedText).trim() || "Xin chào, đây là giọng nói thử nghiệm.";
                  handlePlayVoice(sample, selectedVoice);
                }}
                className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer hover:shadow-[0_0_15px_rgba(217,70,239,0.3)]"
              >
                <Play className="w-3.5 h-3.5" /> Nghe thử
              </button>
            </div>
          </div>
        </div>

        {/* Live Mic Voice Changer + MP3 Soundboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Real-time mic voice changer */}
          <div className="bg-[#0c0c12]/60 border border-white/5 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            <div className={`absolute top-[-10%] right-[-10%] w-[40%] h-[40%] blur-[55px] rounded-full pointer-events-none transition-colors ${liveActive ? "bg-rose-600/20" : "bg-rose-600/5"}`} />
            <div className="flex items-center justify-between gap-3 mb-1 relative z-10 flex-wrap">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Radio className={`w-5 h-5 ${liveActive ? "text-rose-400 animate-pulse" : "text-rose-400/70"}`} /> Đổi Giọng Real-time
              </h3>
              {liveActive && (
                <span className="flex items-center gap-1.5 text-[10px] font-black text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> ĐANG CHẠY
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500 mb-5 relative z-10">
              Biến đổi giọng nói từ Mic của bạn ngay lập tức và đẩy vào Discord/Game (bật "Inject vào Mic ảo" ở bên dưới).
            </p>

            {/* Pitch slider */}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Cao độ giọng</span>
                <span className="text-[11px] font-black text-rose-300">{liveSemitones > 0 ? `+${liveSemitones}` : liveSemitones} nửa cung</span>
              </div>
              <input
                type="range" min={-12} max={12} step={1}
                value={liveSemitones}
                onChange={(e) => setLiveSemitones(parseInt(e.target.value, 10))}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-neutral-600 font-bold mt-1">
                <span>Trầm (Khổng lồ)</span><span>Gốc</span><span>Cao (Con nít)</span>
              </div>
            </div>

            {/* Quick presets */}
            <div className="flex items-center gap-2 mt-4 flex-wrap relative z-10">
              {[
                { label: "Nam trầm", s: -5 },
                { label: "Khổng lồ", s: -10 },
                { label: "Nữ cao", s: 5 },
                { label: "Con nít", s: 9 },
                { label: "Gốc", s: 0 },
              ].map((pre) => (
                <button
                  key={pre.label}
                  onClick={() => setLiveSemitones(pre.s)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black border transition-all cursor-pointer
                    ${liveSemitones === pre.s ? "bg-rose-500/20 border-rose-500/40 text-rose-200" : "bg-white/[0.03] border-white/5 text-neutral-300 hover:text-white hover:bg-white/[0.08]"}`}
                >
                  {pre.label}
                </button>
              ))}
            </div>

            {/* Start/stop */}
            <button
              onClick={toggleLiveVoiceChanger}
              className={`w-full mt-5 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer relative z-10
                ${liveActive
                  ? "bg-rose-600 text-white hover:bg-rose-500 hover:shadow-[0_0_18px_rgba(244,63,94,0.35)]"
                  : "bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white hover:shadow-[0_0_18px_rgba(217,70,239,0.35)]"}`}
            >
              {liveActive ? (<><MicOff className="w-4 h-4" /> Tắt đổi giọng</>) : (<><Wand2 className="w-4 h-4" /> Bật đổi giọng từ Mic</>)}
            </button>
            {liveStatus && (
              <p className="text-[10px] text-rose-300/80 font-bold mt-2.5 text-center relative z-10">{liveStatus}</p>
            )}
            {!enableVirtualMic && (
              <p className="text-[10px] text-amber-400/80 font-semibold mt-2 text-center relative z-10 flex items-center justify-center gap-1.5">
                <ShieldAlert className="w-3 h-3" /> Bật "Inject vào Mic ảo" bên dưới để người khác nghe được.
              </p>
            )}
          </div>

          {/* MP3 Soundboard */}
          <div className="bg-[#0c0c12]/60 border border-white/5 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/8 blur-[55px] rounded-full pointer-events-none" />
            <div className="flex items-center justify-between gap-3 mb-1 relative z-10 flex-wrap">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Music className="w-5 h-5 text-emerald-400" /> Soundboard MP3
              </h3>
              <div className="flex items-center gap-2">
                {playingClipId && (
                  <button
                    onClick={handleStopClip}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-wider hover:bg-red-500/25 transition-all cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" /> Dừng
                  </button>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/25 transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Thêm MP3
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a"
                multiple
                className="hidden"
                onChange={(e) => { handleAddSoundClips(e.target.files); e.target.value = ""; }}
              />
            </div>
            <p className="text-[11px] text-neutral-500 mb-4 relative z-10">
              Tải file MP3 lên và phát ngay vào Mic ảo / loa. Hoàn hảo cho meme, hiệu ứng âm thanh trong game.
            </p>

            <div className="relative z-10">
              {soundClips.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/10 hover:border-emerald-500/40 rounded-2xl py-10 text-center cursor-pointer transition-colors group"
                >
                  <Music className="w-8 h-8 text-neutral-600 group-hover:text-emerald-400 mx-auto mb-2 transition-colors" />
                  <p className="text-xs text-neutral-500 font-semibold">Bấm để thêm file âm thanh (MP3, WAV...)</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
                  {soundClips.map((clip) => {
                    const isPlaying = playingClipId === clip.id;
                    return (
                      <div
                        key={clip.id}
                        onClick={() => handlePlayClip(clip)}
                        className={`group relative flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border cursor-pointer transition-all select-none aspect-square
                          ${isPlaying ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_14px_rgba(16,185,129,0.2)]" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-emerald-500/30"}`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isPlaying ? "bg-emerald-500 text-black" : "bg-emerald-500/10 text-emerald-400 group-hover:scale-110"}`}>
                          {isPlaying
                            ? (<><Volume2 className="w-5 h-5 animate-pulse group-hover:hidden" /><Square className="w-4 h-4 fill-current hidden group-hover:block" /></>)
                            : <Play className="w-5 h-5" />}
                        </div>
                        <span className="text-[10px] font-black text-neutral-300 text-center line-clamp-2 leading-tight">{clip.name}</span>
                        {isPlaying && (
                          <span className="absolute bottom-1.5 left-1.5 text-[8px] font-black uppercase text-emerald-300/80 tracking-wider">Bấm để dừng</span>
                        )}
                        <button
                          onClick={(e) => handleDeleteClip(clip.id, e)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section: Presets & Audio Router Panel */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Preset Soundboard List */}
          <div className="bg-[#0c0c12]/60 border border-white/5 backdrop-blur-md rounded-3xl p-6 shadow-2xl h-fit xl:col-span-2">
            <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" /> Presets / Soundboard Quick-Play
            </h3>
            
            {presets.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 italic text-xs">
                Chưa có Preset nào được lưu. Bạn hãy viết gì đó, bấm Dịch rồi bấm "Lưu Preset" nhé!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {presets.map(item => {
                  const srcLabel = SUPPORTED_LANGUAGES.find(l => l.code === item.srcLang)?.label.split(" (")[0] || item.srcLang;
                  const targetLabel = SUPPORTED_LANGUAGES.find(l => l.code === item.targetLang)?.label.split(" (")[0] || item.targetLang;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handlePlayPreset(item)}
                      className="group flex flex-col justify-between p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-cyan-500/30 cursor-pointer shadow-md hover:shadow-cyan-500/5 transition-all duration-300 relative overflow-hidden"
                    >
                      {/* Interactive hover glowing line */}
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-500/40 group-hover:bg-cyan-400 transition-colors" />
                      
                      <div className="pl-1 mb-2">
                        <div className="flex items-center gap-2 text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                          <span>{srcLabel}</span>
                          <span className="text-cyan-500">➔</span>
                          <span className="text-cyan-400">{targetLabel}</span>
                        </div>
                        <p className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                          {item.translatedText}
                        </p>
                        <p className="text-xs text-neutral-500 line-clamp-1 italic mt-0.5">
                          "{item.originalText}"
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-1">
                          <Play className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] text-cyan-400/80 font-bold group-hover:text-cyan-300">Click để phát</span>
                        </div>

                        <button
                          onClick={(e) => handleDeletePreset(item.id, e)}
                          className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Audio Router Panel */}
          <div className="space-y-6">
          <div className="bg-[#0c0c12]/60 border border-white/5 backdrop-blur-md rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[50px] rounded-full pointer-events-none" />
            
            <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2 pb-3 border-b border-white/5 relative z-10">
              <Settings className="w-5 h-5 text-indigo-400" /> Định Tuyến Mic & Monitor
            </h3>

            {/* General Router State Switches */}
            <div className="space-y-4 relative z-10 mb-6">
              
              {/* Monitor Option */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                    <Volume2 className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white">Nghe thử cục bộ</h4>
                    <p className="text-[10px] text-neutral-500">Phát ra loa/tai nghe cá nhân của bạn</p>
                  </div>
                </div>
                
                <CustomCheckbox
                  checked={enableMonitor}
                  onChange={setEnableMonitor}
                  activeColorClass="bg-cyan-500 border-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.35)]"
                />
              </div>

              {/* Virtual Mic Option */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                    <Mic className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white">Inject vào Mic ảo</h4>
                    <p className="text-[10px] text-neutral-500">Truyền thẳng âm thanh vào Discord/Game</p>
                  </div>
                </div>
                
                <CustomCheckbox
                  checked={enableVirtualMic}
                  onChange={(checked) => {
                    setEnableVirtualMic(checked);
                    if (!checked) setEnableMicLoopback(false);
                  }}
                  activeColorClass="bg-indigo-500 border-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)]"
                />
              </div>

              {/* Auto-mix Real Mic Option */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Mic className="w-4.5 h-4.5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white">Tự động trộn Mic thật</h4>
                    <p className="text-[10px] text-neutral-500">Nói bằng Mic thật song song vào cổng Mic ảo</p>
                  </div>
                </div>
                
                <CustomCheckbox
                  disabled={!enableVirtualMic}
                  checked={enableMicLoopback}
                  onChange={setEnableMicLoopback}
                  activeColorClass="bg-emerald-500 border-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                />
              </div>
            </div>

            {/* Output Device Selectors */}
            <div className="space-y-4 relative z-20">
              
              {/* Local Monitor device selector */}
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">Thiết bị Nghe thử (Monitor)</label>
                <CustomSelect
                  disabled={!enableMonitor}
                  value={selectedMonitorId}
                  onChange={setSelectedMonitorId}
                  options={[
                    { code: "default", label: "Thiết bị mặc định hệ thống" },
                    ...outputDevices
                      .filter(device => device.deviceId !== "default")
                      .map(device => ({
                        code: device.deviceId,
                        label: device.label || `Device ${device.deviceId.substring(0, 8)}...`
                      }))
                  ]}
                />
              </div>

              {/* Virtual mic / VB cable selector */}
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">Ngõ vào Mic ảo (Virtual Cable Input)</label>
                <CustomSelect
                  disabled={!enableVirtualMic}
                  value={selectedVirtualMicId}
                  onChange={setSelectedVirtualMicId}
                  options={
                    outputDevices.length === 0
                      ? [{ code: "", label: "Chưa tìm thấy thiết bị đầu ra nào" }]
                      : outputDevices.map(device => ({
                          code: device.deviceId,
                          label: device.label || `Device ${device.deviceId.substring(0, 8)}...`
                        }))
                  }
                />
              </div>

              {/* Real mic input selector */}
              {enableMicLoopback && enableVirtualMic && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">Thiết bị Mic thật của bạn (Microphone Input)</label>
                  <CustomSelect
                    value={selectedMicInputId}
                    onChange={setSelectedMicInputId}
                    options={[
                      { code: "default", label: "Microphone mặc định hệ thống" },
                      ...inputDevices
                        .filter(device => device.deviceId !== "default")
                        .map(device => ({
                          code: device.deviceId,
                          label: device.label || `Mic ${device.deviceId.substring(0, 8)}...`
                        }))
                    ]}
                  />
                </div>
              )}

              {/* Volume Slider */}
              <div className="pt-3">
                <div className="flex justify-between items-center text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  <span>Âm lượng phát</span>
                  <span className="text-white">{Math.round(volume * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <Volume1 className="w-4 h-4 text-neutral-500" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                </div>
              </div>
            </div>

            {/* Instruction Panel */}
            <div className="mt-8 p-4 bg-[#030305]/80 border border-white/5 rounded-2xl relative z-10 space-y-4">
              <div className="text-[10px] font-bold text-neutral-500 tracking-wider uppercase flex items-center gap-1.5 justify-between">
                <span className="flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-cyan-500 animate-spin-reverse" /> Hướng dẫn tích hợp Mic ảo
                </span>
                <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 font-black">Khuyên dùng</span>
              </div>

              {/* 1-Click Auto Installer Section */}
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h5 className="text-[11px] font-black text-white flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-pulse" /> Tự động cài đặt Mic ảo
                    </h5>
                    <p className="text-[9px] text-neutral-500 leading-relaxed">Tự động tải driver, giải nén & khởi chạy bộ cài đặt chỉ với 1 click.</p>
                  </div>
                  
                  <button
                    disabled={isInstallingMic}
                    onClick={handleInstallVirtualMic}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1.5 transition-all select-none duration-300 cursor-pointer shrink-0
                      ${isInstallingMic 
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-black hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                  >
                    {isInstallingMic ? (
                      <>
                        <RotateCw className="w-3 h-3 animate-spin" />
                        <span>Đang tải...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-black animate-pulse" />
                        <span>Cài đặt ngay</span>
                      </>
                    )}
                  </button>
                </div>

                {installMicStatus && (
                  <div className="text-[9px] p-2 bg-indigo-950/20 border border-indigo-500/10 rounded-lg text-indigo-300 font-bold leading-normal animate-in fade-in slide-in-from-top-1">
                    ℹ️ {installMicStatus}
                  </div>
                )}
              </div>

              <ul className="text-[11px] text-neutral-400 leading-relaxed space-y-1.5 list-decimal pl-4">
                <li>Bấm nút **Cài đặt ngay** ở trên để tự động mở bộ cài đặt driver.</li>
                <li>Cấp quyền Admin (chọn **Yes** khi Windows hỏi), sau đó click **Install Driver** trong bảng cài đặt hiện ra.</li>
                <li>Khởi động lại máy tính của bạn sau khi bộ cài đặt hoàn tất.</li>
                <li>Bật **Inject vào Mic ảo** ở trên, thiết lập **Ngõ vào Mic ảo** là **CABLE Input**.</li>
                <li>**Trộn Mic thật của bạn:** Nhấn tổ hợp `Win + R` ➔ gõ `mmsys.cpl` (Enter) để mở Sound Panel ➔ Chọn tab **Recording** ➔ Click đúp **Mic thật** của bạn ➔ Chọn tab **Listen** ➔ Tích chọn **"Listen to this device"** ➔ Chọn cổng phát ra là **CABLE Input** ➔ Nhấn **Apply**.</li>
                <li>Mở **Discord** hoặc **Game** ➔ Cài đặt Âm thanh ➔ Thiết lập thiết bị ghi âm đầu vào (**Microphone / Input Device**) là **CABLE Output** là xong! Bạn sẽ nói được bằng cả mic thật và phát được giọng dịch/soundboard cùng lúc!</li>
              </ul>
            </div>
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}
