import type { SignalPriority } from "@domain/signals"

export interface CeilingSlot {
  /** Position in the deck. Duplicated cases occupy two slots with one `caseId`. */
  readonly slot: number
  readonly caseId: string
  readonly feedback: string
  readonly tags: string
}

const LEVELS: readonly SignalPriority[] = ["low", "medium", "high", "urgent"]

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * Rating page for the human-human agreement ceiling. Self-contained and local by
 * design: every card is real customer feedback, so this is never published.
 *
 * Measures the ceiling rather than anyone's correctness, which drives four
 * choices. Raters see the rubric the model is given verbatim, or the comparison
 * comes out as intuition-versus-rubric. Nothing is ever revealed — no model
 * answer, no stored label, no running tally — because a second rater who has
 * seen either is anchored. Order is shuffled per rater from their name, so
 * position effects do not correlate between people. And a few cases appear twice
 * so self-consistency can be separated from disagreement: a rater who contradicts
 * themselves sets a floor no model can be blamed for crossing.
 */
export const renderCeilingPage = (slots: readonly CeilingSlot[], rubric: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Signal priority — rating</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --muted:#666; --line:#e5e5e5; --card:#fafafa; --accent:#2563eb; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d0d0d; --fg:#eee; --muted:#999; --line:#262626; --card:#161616; --accent:#60a5fa; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:1.5rem 1rem 4rem; background:var(--bg); color:var(--fg);
         font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size:1.25rem; margin:0 0 .25rem; }
  .muted { color:var(--muted); font-size:.875rem; }
  .panel { background:var(--card); border:1px solid var(--line); border-radius:.6rem; padding:1rem; margin:1rem 0; }
  details summary { cursor:pointer; font-weight:600; }
  pre { white-space:pre-wrap; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; margin:.75rem 0 0; color:var(--muted); }
  input[type=text] { width:100%; padding:.5rem .6rem; border:1px solid var(--line); border-radius:.4rem;
                     background:var(--bg); color:var(--fg); font:inherit; }
  .feedback { font-size:1.05rem; margin:.5rem 0 1rem; }
  .tags { font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--muted); }
  .choices { display:flex; gap:.5rem; flex-wrap:wrap; }
  button { padding:.55rem 1rem; border:1px solid var(--line); border-radius:.4rem; background:var(--bg);
           color:var(--fg); font:inherit; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  button.primary { background:var(--accent); color:#fff; border-color:var(--accent); }
  .bar { height:4px; background:var(--line); border-radius:2px; overflow:hidden; margin:.75rem 0; }
  .bar > div { height:100%; background:var(--accent); width:0; transition:width .2s; }
  .row { display:flex; justify-content:space-between; align-items:center; gap:1rem; }
  .hidden { display:none; }
</style>
</head>
<body>
<main>
  <h1>Signal priority — rating</h1>
  <p class="muted">Read one occurrence and pick the level. There is no feedback and no score:
  this measures how much two people agree, not whether you are right.</p>

  <div class="panel">
    <label for="rater"><strong>Your name</strong></label>
    <p class="muted" style="margin:.25rem 0 .5rem">Sets your shuffle order and labels the export. Any short handle.</p>
    <input type="text" id="rater" autocomplete="off" placeholder="e.g. andres" />
    <p style="margin:.75rem 0 0"><button id="start" class="primary">Start</button></p>
  </div>

  <details class="panel">
    <summary>The rubric (the same text the model is given)</summary>
    <pre>${escapeHtml(rubric)}</pre>
  </details>

  <div id="deck" class="hidden">
    <div class="bar"><div id="fill"></div></div>
    <div class="row muted"><span id="progress"></span><span id="who"></span></div>
    <div class="panel">
      <div class="tags" id="tags"></div>
      <p class="feedback" id="feedback"></p>
      <div class="choices" id="choices"></div>
    </div>
    <p class="muted">Some cases repeat on purpose. Answer each as you see it; do not try to recall an earlier answer.</p>
  </div>

  <div id="done" class="panel hidden">
    <h1>Done</h1>
    <p class="muted">Send the downloaded file back. It contains your levels and the case ids, no other data.</p>
    <p><button id="download" class="primary">Download my ratings</button></p>
  </div>
</main>
<script>
const SLOTS = ${JSON.stringify(slots)};
const LEVELS = ${JSON.stringify(LEVELS)};

// Deterministic per-rater shuffle: same name always yields the same order, so a
// reload resumes rather than reshuffling, while two raters get different orders.
const hash = (text) => { let h = 2166136261; for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const shuffle = (items, seed) => {
  const out = items.slice();
  let state = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

let rater = "";
let deck = [];
let position = 0;
let answers = {};
let storageKey = "";

const save = () => localStorage.setItem(storageKey, JSON.stringify({ answers, position }));

const showCard = () => {
  if (position >= deck.length) {
    document.getElementById("deck").classList.add("hidden");
    document.getElementById("done").classList.remove("hidden");
    return;
  }
  const card = deck[position];
  document.getElementById("tags").textContent = card.tags;
  document.getElementById("feedback").textContent = card.feedback;
  document.getElementById("progress").textContent = (position + 1) + " of " + deck.length;
  document.getElementById("who").textContent = rater;
  document.getElementById("fill").style.width = ((position / deck.length) * 100) + "%";
  document.getElementById("choices").innerHTML = LEVELS
    .map((level) => '<button data-level="' + level + '">' + level + "</button>")
    .join("");
};

document.getElementById("start").addEventListener("click", () => {
  const name = document.getElementById("rater").value.trim().toLowerCase();
  if (!name) return;
  rater = name;
  storageKey = "severity-ceiling:" + rater;
  deck = shuffle(SLOTS, hash(rater));
  const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (saved) { answers = saved.answers || {}; position = saved.position || 0; }
  document.querySelector(".panel").classList.add("hidden");
  document.getElementById("deck").classList.remove("hidden");
  showCard();
});

document.getElementById("choices").addEventListener("click", (event) => {
  const level = event.target.dataset && event.target.dataset.level;
  if (!level) return;
  answers[deck[position].slot] = level;
  position += 1;
  save();
  showCard();
});

document.getElementById("download").addEventListener("click", () => {
  const payload = {
    rater,
    ratings: deck
      .filter((card) => answers[card.slot])
      .map((card) => ({ slot: card.slot, caseId: card.caseId, level: answers[card.slot] })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "severity-ceiling-" + rater + ".json";
  link.click();
  URL.revokeObjectURL(link.href);
});
</script>
</body>
</html>
`
