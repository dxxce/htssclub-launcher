// E2E: 2 participant thật kết nối vào cùng room qua @livekit/rtc-node, một bên
// publish audio track, bên kia phải "thấy" participant + track đó.
// Usage: node scratch/livekit_e2e.mjs [key] [secret] [wsUrl]

import { AccessToken } from "livekit-server-sdk";
import {
  Room,
  RoomEvent,
  AudioSource,
  AudioFrame,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
  dispose,
} from "@livekit/rtc-node";

const KEY = process.argv[2] || "devkey";
const SECRET = process.argv[3] || "secret";
const WS = process.argv[4] || "ws://192.168.1.86:7880";
const ROOM = "e2e-" + Date.now();

async function tokenFor(identity, name) {
  const at = new AccessToken(KEY, SECRET, { identity, name });
  at.addGrant({ roomJoin: true, room: ROOM, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

async function main() {
  console.log("WS =", WS, "ROOM =", ROOM);

  const listener = new Room();
  const publisher = new Room();

  let sawParticipant = false;
  let sawTrack = false;

  listener.on(RoomEvent.ParticipantConnected, (p) => {
    console.log("[listener] participant connected:", p.identity);
    sawParticipant = true;
  });
  listener.on(RoomEvent.TrackSubscribed, (track, pub, p) => {
    console.log("[listener] track subscribed from", p.identity, "kind=", track.kind);
    sawTrack = true;
  });

  // listener vào trước
  await listener.connect(WS, await tokenFor("listener", "Listener"), { autoSubscribe: true, dynacast: false });
  console.log("[listener] connected, state:", listener.connectionState);

  // publisher vào sau + publish audio
  await publisher.connect(WS, await tokenFor("publisher", "Publisher"), { autoSubscribe: true });
  console.log("[publisher] connected, state:", publisher.connectionState);

  const source = new AudioSource(48000, 1);
  const track = LocalAudioTrack.createAudioTrack("mic", source);
  const opts = new TrackPublishOptions();
  opts.source = TrackSource.SOURCE_MICROPHONE;
  await publisher.localParticipant.publishTrack(track, opts);
  console.log("[publisher] published audio track");

  // bơm vài frame im lặng để track "sống"
  const frames = 10;
  for (let i = 0; i < frames; i++) {
    const samples = new Int16Array(480); // 10ms @ 48k mono
    const frame = new AudioFrame(samples, 48000, 1, 480);
    await source.captureFrame(frame);
    await new Promise((r) => setTimeout(r, 100));
  }

  await new Promise((r) => setTimeout(r, 1500));

  console.log("\n=== KẾT QUẢ ===");
  console.log("listener thấy participant publisher:", sawParticipant ? "OK" : "KHÔNG");
  console.log("listener subscribe được audio track:", sawTrack ? "OK" : "KHÔNG");
  console.log("remoteParticipants ở listener:", [...listener.remoteParticipants.keys()]);

  await publisher.disconnect();
  await listener.disconnect();
  await dispose();

  if (sawParticipant && sawTrack) {
    console.log("\n✅ LiveKit hoạt động: kết nối, publish & subscribe đều OK.");
    process.exit(0);
  } else {
    console.log("\n❌ Có vấn đề ở bước media (xem log trên).");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
