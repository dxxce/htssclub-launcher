async function test() {
  const res = await fetch('http://localhost:3066/api/short-reels?action=detail&seriesId=qTpuV5g7f0');
  const data = await res.json();
  const info = data.data.data.info;
  
  console.log(`Checking ${info.episode_list.length} episodes:`);
  
  info.episode_list.forEach((ep, idx) => {
    const viSub = (ep.subtitle_list || []).find(s => s.language === "vi-VN" || s.language === "vi" || s.display_name === "Việt");
    if (!viSub) {
      console.log(`Ep ${idx + 1} (${ep.name}): NO VIET SUBTITLE AT ALL!`);
    } else {
      console.log(`Ep ${idx + 1} (${ep.name}): Viet Sub URL: ${viSub.subtitle || viSub.vtt || 'EMPTY'}`);
    }
  });
}
test().catch(console.error);
