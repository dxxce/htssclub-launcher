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
  const url = `https://api.ushort.cloud/freereels/video/info?series_id=qTpuV5g7f0`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  const info = data.data.data.info;
  console.log("SERIES TITLE:", info.name);
  const ep = info.episode_list[0];
  console.log("EPISODE 1 SUBTITLE LIST:");
  ep.subtitle_list.forEach(s => {
    console.log(`- Language: ${s.language}, Display: ${s.display_name}, Type: ${s.type}, URL: ${s.subtitle}`);
  });
}

test().catch(console.error);
