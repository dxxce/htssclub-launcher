"use client";

// ──────────────────────────────────────────────────────────────────────────
// CHỈ DÙNG ĐỂ TEST CỤC BỘ. Ký LiveKit access token ngay trong trình duyệt bằng
// API key/secret dev (devkey/secret của `livekit-server --dev`).
//
// KHÔNG dùng ở production: không bao giờ nhúng API secret thật vào client.
// Kích hoạt bằng cách đặt trong DevTools console:
//   localStorage.setItem("htss_livekit_dev", JSON.stringify({
//     url: "ws://192.168.1.86:7880", key: "devkey", secret: "secret"
//   }))
// rồi mở kênh thoại. Xoá để tắt: localStorage.removeItem("htss_livekit_dev")
// ──────────────────────────────────────────────────────────────────────────

interface DevCfg {
  url: string;
  key: string;
  secret: string;
}

const DEV_KEY = "htss_livekit_dev";

export function getLivekitDevConfig(): DevCfg | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEV_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (cfg?.url && cfg?.key && cfg?.secret) return cfg as DevCfg;
  } catch {
    /* ignore */
  }
  return null;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

/** Ký LiveKit JWT (HS256) ngay trong browser bằng WebCrypto. */
export async function signLivekitDevToken(
  cfg: DevCfg,
  opts: { identity: string; room: string; name?: string; metadata?: string; ttlSec?: number }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSec ?? 6 * 60 * 60;
  const header = { alg: "HS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    iss: cfg.key,
    sub: opts.identity,
    nbf: now - 5,
    exp: now + ttl,
    name: opts.name,
    metadata: opts.metadata,
    video: {
      roomJoin: true,
      room: opts.room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };

  const head = b64urlStr(JSON.stringify(header));
  const body = b64urlStr(JSON.stringify(payload));
  const signingInput = `${head}.${body}`;

  const keyData = new TextEncoder().encode(cfg.secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}
