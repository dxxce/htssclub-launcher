"use client";

// ── Cài đặt thiết bị & lọc âm cho thoại ──────────────────────────────────────
// Lưu vào localStorage để giữ giữa các phiên. Engine (mesh/SFU) đọc trực tiếp
// từ đây khi mở micro.

export interface VoiceSettings {
  inputDeviceId: string; // "" = mặc định hệ thống
  outputDeviceId: string; // "" = mặc định (chỉ áp dụng nếu trình duyệt hỗ trợ setSinkId)
  echoCancellation: boolean; // khử vọng
  noiseSuppression: boolean; // khử ồn (trình duyệt)
  autoGainControl: boolean; // tự cân chỉnh âm lượng
  advancedFilter: boolean; // lọc âm nâng cao (high-pass + noise gate, kiểu Krisp)
  filterStrength: number; // độ mạnh noise gate 0..100
}

const KEY = "htss_voice_settings";

const DEFAULTS: VoiceSettings = {
  inputDeviceId: "",
  outputDeviceId: "",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  advancedFilter: false,
  filterStrength: 55,
};

let cached: VoiceSettings | null = null;

export function getVoiceSettings(): VoiceSettings {
  if (cached) return cached;
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached!;
}

export function setVoiceSettings(patch: Partial<VoiceSettings>): VoiceSettings {
  const next = { ...getVoiceSettings(), ...patch };
  cached = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

// Dựng constraints cho getUserMedia từ cài đặt hiện tại.
export function buildAudioConstraints(s: VoiceSettings = getVoiceSettings()): MediaTrackConstraints {
  const c: MediaTrackConstraints = {
    echoCancellation: s.echoCancellation,
    noiseSuppression: s.noiseSuppression,
    autoGainControl: s.autoGainControl,
  };
  if (s.inputDeviceId) c.deviceId = { exact: s.inputDeviceId };
  return c;
}

// Liệt kê thiết bị âm thanh (cần đã có quyền micro để thấy nhãn).
export async function listAudioDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: all.filter((d) => d.kind === "audioinput"),
      outputs: all.filter((d) => d.kind === "audiooutput"),
    };
  } catch {
    return { inputs: [], outputs: [] };
  }
}
