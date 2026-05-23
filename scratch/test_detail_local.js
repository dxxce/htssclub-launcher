async function test() {
  const res = await fetch('http://localhost:3066/api/short-reels?action=detail&seriesId=qTpuV5g7f0');
  const data = await res.json();
  const info = data.data.data.info;
  console.log("TITLE:", info.name);
  const ep = info.episode_list[0];
  ep.subtitle_list.forEach(s => {
    console.log(`- Language: ${s.language}, Display: ${s.display_name}`);
  });
}
test().catch(console.error);
