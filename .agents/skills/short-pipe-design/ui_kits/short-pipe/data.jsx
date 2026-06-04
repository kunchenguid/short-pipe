/* Short Pipe UI kit — data + shared primitives. Exposed on window for screens.jsx */

/* ---------- Icons: real Lucide path data (lucide.dev, ISC) ---------- */
const ICON_PATHS = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  fileVideo: '<path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="m10 11 5 3-5 3z"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  rotateCw: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>',
  captions: '<rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15h4"/><path d="M15 15h2"/><path d="M7 11h2"/><path d="M13 11h4"/>',
  layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
};

function Icon({ name, className }) {
  return (
    <svg className={"lucide " + (className || "")} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || "" }} />
  );
}

function Spinner() { return <span className="spinner" />; }

function Pill({ status, children }) {
  return <span className={"pill " + status}>{children || status}</span>;
}

/* ---------- Transcript ---------- */
const TRANSCRIPT_TEXT =
  "So here's the thing nobody tells you about running out of money. " +
  "The real reason most layoffs happen has nothing to do with performance. " +
  "It's almost always a forecasting failure that started two quarters earlier. " +
  "You hired against a revenue line you hadn't actually closed yet. " +
  "And once the runway drops below twelve months, the math stops being about people and starts being about survival. " +
  "The honest move is to cut early and cut once. " +
  "Everyone says they'll do that, and almost nobody does, because the first cut feels like admitting the plan was wrong. " +
  "But here's what I learned the hard way: your team can survive a layoff. " +
  "What they cannot survive is watching you pretend everything is fine while the numbers say otherwise. " +
  "Tell them the truth, give them the runway number, and let them help you fix it.";

const WORDS = (() => {
  const toks = TRANSCRIPT_TEXT.trim().split(/\s+/);
  let t = 0.6;
  return toks.map((text, i) => {
    const dur = 0.22 + Math.min(0.42, text.length * 0.045);
    const w = { id: "w" + i, text, start: Math.round(t * 100) / 100, end: Math.round((t + dur) * 100) / 100 };
    t += dur + (/[.,:]$/.test(text) ? 0.16 : 0.04);
    return w;
  });
})();

const idx = (id) => WORDS.findIndex((w) => w.id === id);
const timeOf = (id, edge) => { const w = WORDS[idx(id)]; return w ? w[edge] : 0; };
function fmt(sec) {
  if (sec == null) return "0:00";
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

/* find word id by matching text sequence — keeps candidate defs readable */
function range(startText, endText, occStart, occEnd) {
  const find = (txt, occ) => {
    let seen = 0;
    for (let i = 0; i < WORDS.length; i++) {
      if (WORDS[i].text.replace(/[^a-zA-Z']/g, "").toLowerCase() === txt) {
        seen++; if (seen === (occ || 1)) return i;
      }
    }
    return 0;
  };
  return { s: find(startText, occStart), e: find(endText, occEnd) };
}

const CANDIDATES = [
  {
    id: "c1", rank: 1, title: "The real reason layoffs happen",
    reason: "Strong cold-open claim that pays off in one sentence — drops a stranger straight into a contrarian idea with zero setup.",
    ...range("the", "performance", 2, 1),
    layout: "full-bleed", captionStyle: "bold-pop",
    keywords: ["layoffs", "performance"], status: "proposed",
  },
  {
    id: "c2", rank: 2, title: "Cut early, cut once",
    reason: "Clean, quotable principle with a built-in tension — most people agree and still don't do it. Lands on a complete thought.",
    ...range("the", "does", 5, 1),
    layout: "card", captionStyle: "clean",
    keywords: ["early", "once"], status: "proposed",
  },
  {
    id: "c3", rank: 3, title: "What a team can't survive",
    reason: "Emotional payoff about honesty under pressure. Rhythmic, list-like delivery suits a karaoke treatment.",
    ...range("your", "otherwise", 1, 1),
    layout: "full-bleed", captionStyle: "karaoke",
    keywords: ["survive", "truth"], status: "proposed",
  },
];

const PROJECTS = [
  { id: "p1", title: "Seed-stage AMA — full cut", dur: "1:04:22", w: 1920, h: 1080, fps: 30, status: "ready", count: 3, path: "~/Movies/seed-ama.mp4" },
  { id: "p2", title: "Design review walkthrough", dur: "38:11", w: 2560, h: 1440, fps: 60, status: "none", count: 0, path: "~/Movies/design-review.mov" },
  { id: "p3", title: "Podcast ep. 47 — runway math", dur: "52:40", w: 1920, h: 1080, fps: 30, status: "running", count: 0, path: "~/Movies/pod-47.mp4" },
];

const STEPS = ["Reading the video", "Transcribing (local Whisper)", "Reading the transcript", "Scanning the transcript", "Choosing the best shorts"];

Object.assign(window, {
  Icon, Spinner, Pill, WORDS, CANDIDATES, PROJECTS, STEPS,
  idx, timeOf, fmt,
});
