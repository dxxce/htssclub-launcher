async function check() {
  const res = await fetch('http://localhost:3066/api/short-reels?action=detail&seriesId=qTpuV5g7f0');
  const data = await res.json();
  const info = data.data.data.info;
  const ep = info.episode_list[0];
  console.log("SUBTITLE LIST:", JSON.stringify(ep.subtitle_list, null, 2));
}
check().catch(console.error);
