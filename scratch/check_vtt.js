async function test() {
  const res = await fetch('http://localhost:3066/api/short-reels?action=detail&seriesId=qTpuV5g7f0');
  const data = await res.json();
  const info = data.data.data.info;
  
  let totalSubs = 0;
  let hasVtt = 0;
  let hasSubtitle = 0;
  
  info.episode_list.forEach((ep) => {
    (ep.subtitle_list || []).forEach(s => {
      totalSubs++;
      if (s.vtt) hasVtt++;
      if (s.subtitle) hasSubtitle++;
    });
  });
  
  console.log(`Total subtitle tracks: ${totalSubs}`);
  console.log(`Has vtt field: ${hasVtt}`);
  console.log(`Has subtitle (srt) field: ${hasSubtitle}`);
}
test().catch(console.error);
