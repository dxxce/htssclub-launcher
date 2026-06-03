// Test LiveKit server connectivity + token signing + 2-client room join.
// Usage: node scratch/livekit_test.mjs [apiKey] [apiSecret] [wsUrl]
//
// Mặc định dùng cặp dev của `livekit-server --dev`: devkey / secret.

import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const API_KEY = process.argv[2] || process.env.LIVEKIT_API_KEY || "devkey";
const API_SECRET = process.argv[3] || process.env.LIVEKIT_API_SECRET || "secret";
const WS_URL = process.argv[4] || process.env.LIVEKIT_URL || "ws://192.168.1.86:7880";
const HTTP_URL = WS_URL.replace(/^ws/, "http");
const ROOM = "test-channel-" + Date.now();

function makeToken(identity, displayName) {
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity,
    name: displayName,
    metadata: JSON.stringify({ displayName, username: identity }),
  });
  at.addGrant({ roomJoin: true, room: ROOM, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

async function main() {
  console.log("WS_URL =", WS_URL);
  console.log("ROOM   =", ROOM);

  // 1) Mint token (xác nhận key/secret ký được)
  const token = await makeToken("alice", "Alice");
  console.log("\n[OK] Token minted (len " + token.length + ")");
  console.log("TOKEN:\n" + token);

  // 2) Dùng RoomServiceClient để xác thực key/secret với server qua API.
  try {
    const svc = new RoomServiceClient(HTTP_URL, API_KEY, API_SECRET);
    await svc.createRoom({ name: ROOM, emptyTimeout: 60 });
    console.log("\n[OK] createRoom thành công → key/secret hợp lệ với server.");
    const rooms = await svc.listRooms();
    console.log("[OK] listRooms:", rooms.map((r) => r.name));
  } catch (e) {
    console.log("\n[ERR] RoomService thất bại:", e?.message || e);
    console.log("→ Nhiều khả năng sai API key/secret. Hãy chạy lại với: node scratch/livekit_test.mjs <KEY> <SECRET> " + WS_URL);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
