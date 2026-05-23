const headers = {
  "accept": "*/*",
  "origin": "https://ushort.cloud",
  "referer": "https://ushort.cloud/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
};

async function getManifest(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function checkAllUrls(urls, type) {
  console.log(`Checking ${urls.length} urls for ${type}...`);
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const res = await fetch(url, { method: 'HEAD', headers });
      if (res.ok) {
        successCount++;
      } else {
        failCount++;
        console.log(`Failed URL [${res.status} ${res.statusText}]: ${url}`);
      }
    } catch (err) {
      failCount++;
      console.log(`Failed URL [Error: ${err.message}]: ${url}`);
    }
  }
  console.log(`${type} results: Success: ${successCount}, Fail: ${failCount}`);
}

async function run() {
  try {
    const masterUrl = 'https://video-v6.mydramawave.com/vt/dc0f6349-c370-4f54-a557-75af68f7736c/h264-b317e5d2-f40c-4dfa-868f-a6539e898365.m3u8';
    const master = await getManifest(masterUrl);
    
    // Video subplaylist
    const videoSubUrl = new URL('1_898f6b37-f6ae-4556-a420-fa70d54ad55a_transcode_1309546_adaptiveDynamicStreaming_1519066_0.m3u8', masterUrl).toString();
    const videoPlaylist = await getManifest(videoSubUrl);
    const videoSegments = [];
    
    // Add init segment
    videoSegments.push(new URL('1_898f6b37-f6ae-4556-a420-fa70d54ad55a_transcode_1309546_adaptiveDynamicStreaming_1519066_0_init.mp4', videoSubUrl).toString());
    
    videoPlaylist.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        videoSegments.push(new URL(line, videoSubUrl).toString());
      }
    });

    // Vi Audio subplaylist
    const audioSubUrl = new URL('vi-VN-69c154c6-1f5c-4543-b39c-697680ece156/vi-VN-2be80216-8b33-464d-88cf-4d0f32f958b0.m3u8', masterUrl).toString();
    const audioPlaylist = await getManifest(audioSubUrl);
    const audioSegments = [];
    
    // Add init segment
    audioSegments.push(new URL('init.mp4', audioSubUrl).toString());
    
    audioPlaylist.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        audioSegments.push(new URL(line, audioSubUrl).toString());
      }
    });

    await checkAllUrls(videoSegments, "Video Segments");
    await checkAllUrls(audioSegments, "Audio Segments");

  } catch (err) {
    console.error("Error in run:", err);
  }
}

run();
