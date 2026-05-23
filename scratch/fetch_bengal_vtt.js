async function run() {
  const url = 'https://video-v6.mydramawave.com/ut/15784/1_73dd71b8-8b82-432d-86ea-3426c94e4917.vtt';
  const res = await fetch(url);
  const text = await res.text();
  console.log("VTT CONTENT (2000-4000):\n", text.slice(2000, 4000));
}
run().catch(console.error);
