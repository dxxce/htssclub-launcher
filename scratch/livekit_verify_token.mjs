// Xác minh token kiểu "client tự ký" (giống livekitDevToken.ts) có hợp lệ với
// LiveKit không, bằng cách ký HS256 thuần rồi nhờ TokenVerifier kiểm tra.
import crypto from "node:crypto";
import { TokenVerifier } from "livekit-server-sdk";

const KEY = process.argv[2] || "devkey";
const SECRET = process.argv[3] || "secret";
const ROOM = "verify-room";
const IDENTITY = "tester-1";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  iss: KEY,
  sub: IDENTITY,
  nbf: now - 5,
  exp: now + 3600,
  name: "Tester",
  metadata: JSON.stringify({ displayName: "Tester" }),
  video: { roomJoin: true, room: ROOM, canPublish: true, canSubscribe: true, canPublishData: true },
};

const head = b64url(JSON.stringify(header));
const body = b64url(JSON.stringify(payload));
const signingInput = `${head}.${body}`;
const sig = crypto.createHmac("sha256", SECRET).update(signingInput).digest();
const token = `${signingInput}.${b64url(sig)}`;

console.log("Self-signed token:\n" + token + "\n");

const verifier = new TokenVerifier(KEY, SECRET);
try {
  const claims = await verifier.verify(token);
  console.log("[OK] Token hợp lệ. Claims:");
  console.log(JSON.stringify(claims, null, 2));
} catch (e) {
  console.log("[ERR] Token KHÔNG hợp lệ:", e?.message || e);
  process.exit(1);
}
