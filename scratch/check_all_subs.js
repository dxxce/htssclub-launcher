async function test() {
  const res = await fetch('http://localhost:3066/api/short-reels?action=detail&seriesId=qTpuV5g7f0');
  const data = await res.json();
  const info = data.data.data.info;
  const ep = info.episode_list[0];
  console.log("EP 1 SUBTITLE LIST KEYS:");
  console.log(JSON.stringify(ep.subtitle_list[18], null, 2)); // Index 18 should be Việt
}
test().catch(console.error);
