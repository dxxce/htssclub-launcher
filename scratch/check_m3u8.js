async function test() {
  const res = await fetch('http://localhost:3066/api/short-reels?action=detail&seriesId=qTpuV5g7f0');
  const data = await res.json();
  const info = data.data.data.info;
  const ep = info.episode_list[0];
  const m3u8Url = ep.external_audio_h264_m3u8 || ep.external_audio_h265_m3u8;
  console.log("M3U8 URL:", m3u8Url);
  
  if (m3u8Url) {
    const m3u8Res = await fetch(m3u8Url);
    const m3u8Text = await m3u8Res.text();
    console.log("M3U8 CONTENT START:\n", m3u8Text.slice(0, 1000));
  }
}
test().catch(console.error);
