async function testReferer(origin, referer) {
  const url = 'https://video-v6.mydramawave.com/vt/dc0f6349-c370-4f54-a557-75af68f7736c/h264-b317e5d2-f40c-4dfa-868f-a6539e898365.m3u8';
  const headers = {
    "accept": "*/*",
    "origin": origin,
    "referer": referer,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
  };

  try {
    const res = await fetch(url, { headers });
    console.log(`\nTest with Origin: ${origin}, Referer: ${referer}`);
    console.log(`Status: ${res.status} ${res.statusText}`);
    if (res.ok) {
      const text = await res.text();
      console.log("Response preview (first 5 lines):");
      console.log(text.split('\n').slice(0, 5).join('\n'));
    } else {
      console.log("Error text:", await res.text());
    }
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

async function run() {
  await testReferer("https://anime47.best", "https://anime47.best/");
  await testReferer("https://ushort.cloud", "https://ushort.cloud/");
}

run();
