async function test() {
  const res = await fetch('http://localhost:3066/api/v-stream?url=https://video-v6.mydramawave.com/ut/15784/1_88cc7fa9-aebc-405f-8013-aefc84408d5a.srt');
  const text = await res.text();
  console.log("STATUS:", res.status);
  console.log("HEADERS:", Object.fromEntries(res.headers.entries()));
  console.log("TEXT START:\n", text.slice(0, 500));
}
test().catch(console.error);
