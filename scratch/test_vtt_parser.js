const fs = require('fs');

const parseTimestamp = (str) => {
  const cleanStr = str.trim().replace(',', '.');
  const parts = cleanStr.split(':');
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = parseFloat(parts[0]) || 0;
    minutes = parseFloat(parts[1]) || 0;
    seconds = parseFloat(parts[2]) || 0;
  } else if (parts.length === 2) {
    minutes = parseFloat(parts[0]) || 0;
    seconds = parseFloat(parts[1]) || 0;
  } else {
    seconds = parseFloat(cleanStr) || 0;
  }

  return hours * 3600 + minutes * 60 + seconds;
};

const parseSubtitles = (text) => {
  const cues = [];
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = cleanText.split('\n\n');

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    let timeLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx !== -1) {
      const timeLine = lines[timeLineIdx];
      const parts = timeLine.split('-->');
      if (parts.length === 2) {
        const startStr = parts[0].trim().split(/\s+/)[0];
        const endStr = parts[1].trim().split(/\s+/)[0];
        const start = parseTimestamp(startStr);
        const end = parseTimestamp(endStr);
        const textLines = lines.slice(timeLineIdx + 1);
        const cueText = textLines.join('\n').trim();
        const cleanCueText = cueText.replace(/<[^>]+>/g, '');

        cues.push({ start, end, text: cleanCueText });
      }
    }
  }
  return cues;
};

async function run() {
  const url = 'https://video-v6.mydramawave.com/ut/15784/1_73dd71b8-8b82-432d-86ea-3426c94e4917.vtt';
  const res = await fetch(url);
  const text = await res.text();
  const cues = parseSubtitles(text);
  console.log("Parsed first 5 cues:", cues.slice(0, 5));
}
run().catch(console.error);
