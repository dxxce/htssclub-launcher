const headers = {
  "accept": "*/*",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  "origin": "https://ushort.cloud",
  "pragma": "no-cache",
  "referer": "https://ushort.cloud/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
};

async function test() {
  const url = `https://api.ushort.cloud/freereels/video/info?series_id=2WNQrvybk4`;
  console.log("Fetching url:", url);
  const res = await fetch(url, { headers });
  const data = await res.json();
  const info = data.data.data.info;
  console.log("Series Name:", info.name);
  console.log("Total Episodes:", info.episode_list.length);
  
  if (info.episode_list.length > 0) {
    const firstEp = info.episode_list[0];
    console.log("\nFirst Episode Details:");
    console.log("  ID:", firstEp.id);
    console.log("  Name:", firstEp.name);
    console.log("  Index:", firstEp.index);
    console.log("  Unlock:", firstEp.unlock);
    console.log("  Video URL:", firstEp.video_url);
    console.log("  M3U8 URL:", firstEp.m3u8_url);
    console.log("  Ext Audio H264 M3U8:", firstEp.external_audio_h264_m3u8);
    console.log("  Ext Audio H265 M3U8:", firstEp.external_audio_h265_m3u8);
    console.log("  Video Type:", firstEp.video_type);
    console.log("  Subtitle count:", firstEp.subtitle_list ? firstEp.subtitle_list.length : 0);
    if (firstEp.subtitle_list && firstEp.subtitle_list.length > 0) {
      console.log("  Sample Subtitles:", firstEp.subtitle_list.slice(0, 3).map(s => `${s.display_name} -> ${s.subtitle}`));
    }
  }

  // Find an episode that might be locked or free and see if there are any differences
  const lastEp = info.episode_list[info.episode_list.length - 1];
  if (lastEp) {
    console.log("\nLast Episode Details:");
    console.log("  ID:", lastEp.id);
    console.log("  Name:", lastEp.name);
    console.log("  Index:", lastEp.index);
    console.log("  Unlock:", lastEp.unlock);
    console.log("  Video URL:", lastEp.video_url);
    console.log("  M3U8 URL:", lastEp.m3u8_url);
    console.log("  Ext Audio H264 M3U8:", lastEp.external_audio_h264_m3u8);
    console.log("  Ext Audio H265 M3U8:", lastEp.external_audio_h265_m3u8);
    console.log("  Video Type:", lastEp.video_type);
  }
}

test().catch(console.error);
