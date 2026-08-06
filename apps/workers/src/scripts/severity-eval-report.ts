import type { SignalPriority } from "@domain/signals"

export interface ReportCase {
  readonly id: string
  readonly feedback: string
  readonly sourceType: string
  readonly value: number
  readonly flaggerSlug?: string
  /** The stored label: a human's triage level in production mode, the fixture's expectation otherwise. */
  readonly label: SignalPriority
  readonly model: SignalPriority | null
  readonly floored: boolean
}

const LEVELS: readonly SignalPriority[] = ["low", "medium", "high", "urgent"]

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * A single self-contained file, written to disk and opened locally — never
 * published. In production mode every card holds real customer feedback, which
 * is the whole reason this is not an artifact and not committed.
 *
 * Blind by construction: the reader rates each case before the model's answer
 * and the stored label are revealed, so their judgement cannot anchor on either.
 * Verdicts persist in localStorage.
 *
 * The export is the `--cases-file` shape with the reader's verdict as `priority`,
 * which closes the loop: production triage levels were set from the full signal
 * page — impact, trend, every occurrence — while the rubric sees only the one
 * creating occurrence, so those levels are not predictable from its input. Rating
 * the same single occurrence produces a target that is.
 */
export const renderReport = (cases: readonly ReportCase[], source: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Severity rubric — blind review</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --muted:#666; --line:#e5e5e5; --card:#fafafa; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d0d0d; --fg:#eee; --muted:#999; --line:#262626; --card:#161616; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:2rem 1rem 6rem; background:var(--bg); color:var(--fg);
         font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size:1.35rem; margin:0 0 .25rem; }
  .sub { color:var(--muted); margin:0 0 2rem; font-size:.9rem; }
  .card { border:1px solid var(--line); border-radius:12px; padding:1.1rem 1.2rem; margin-bottom:1rem; background:var(--card); }
  .tags { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:.7rem; }
  .tag { font:12px ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--muted);
         border:1px solid var(--line); border-radius:999px; padding:.1rem .55rem; }
  .feedback { margin:0 0 1rem; }
  .choices { display:flex; gap:.4rem; flex-wrap:wrap; }
  button.level { font:inherit; cursor:pointer; border:1px solid var(--line); background:transparent;
                 color:var(--fg); border-radius:8px; padding:.35rem .8rem; }
  button.level:hover { border-color:var(--fg); }
  button.level[aria-pressed="true"] { background:var(--fg); color:var(--bg); border-color:var(--fg); }
  .reveal { margin-top:.9rem; padding-top:.9rem; border-top:1px dashed var(--line); font-size:.92rem; display:none; }
  .card.answered .reveal { display:block; }
  .row { display:flex; gap:.5rem; align-items:baseline; }
  .row + .row { margin-top:.2rem; }
  .k { color:var(--muted); min-width:8.5rem; }
  .agree { color:#15803d; } .differ { color:#b45309; } .bad { color:#b91c1c; font-weight:600; }
  footer { position:fixed; inset:auto 0 0 0; background:var(--bg); border-top:1px solid var(--line);
           padding:.75rem 1rem; display:flex; gap:1.25rem; justify-content:center; font-size:.9rem; }
  code { font:12px ui-monospace,SFMono-Regular,Menlo,monospace; }
</style>
</head>
<body>
<main>
  <h1>Severity rubric — blind review</h1>
  <p class="sub">
    ${escapeHtml(source)} · ${cases.length} cases. Rate each one yourself, then the model's answer and the stored
    label appear. Your verdicts stay in this browser; nothing is uploaded.
  </p>
  <div id="cards"></div>
</main>
<footer>
  <span id="progress">0 / ${cases.length} rated</span>
  <span id="vsModel"></span>
  <span id="vsLabel"></span>
  <button id="export" class="level">Download re-labelled cases</button>
</footer>
<script>
const CASES = ${JSON.stringify(cases)};
const LEVELS = ${JSON.stringify(LEVELS)};
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
const KEY = "severity-review:" + ${JSON.stringify(source)};
const verdicts = JSON.parse(localStorage.getItem(KEY) || "{}");

const cmp = (mine, other) => {
  if (other === null) return ['<span class="differ">no answer</span>', false];
  if (mine === other) return ['<span class="agree">agrees</span>', true];
  const drop = RANK[mine] >= RANK.high && other === "low";
  const cls = drop ? "bad" : "differ";
  const note = drop ? " — would be filtered out" : "";
  return ['<span class="' + cls + '">' + other + note + "</span>", false];
};

function render() {
  document.getElementById("cards").innerHTML = CASES.map((c, i) => {
    const mine = verdicts[c.id];
    const tags = ['source=' + c.sourceType, 'score=' + c.value.toFixed(2)]
      .concat(c.flaggerSlug ? ['detector=' + c.flaggerSlug] : [])
      .concat(c.floored ? ['floored'] : [])
      .map(t => '<span class="tag">' + t + "</span>").join("");
    const buttons = LEVELS.map(l =>
      '<button class="level" data-id="' + c.id + '" data-level="' + l + '" aria-pressed="' +
      (mine === l) + '">' + l + "</button>").join("");
    const reveal = mine
      ? '<div class="row"><span class="k">model said</span><span>' + cmp(mine, c.model)[0] + "</span></div>" +
        '<div class="row"><span class="k">stored label</span><span>' + cmp(mine, c.label)[0] + "</span></div>"
      : "";
    return '<div class="card' + (mine ? " answered" : "") + '">' +
      '<div class="tags">' + tags + "</div>" +
      '<p class="feedback">' + c.feedback + "</p>" +
      '<div class="choices">' + buttons + "</div>" +
      '<div class="reveal">' + reveal + "</div></div>";
  }).join("");

  const rated = Object.keys(verdicts).length;
  const scored = CASES.filter(c => verdicts[c.id]);
  const agreeModel = scored.filter(c => verdicts[c.id] === c.model).length;
  const agreeLabel = scored.filter(c => verdicts[c.id] === c.label).length;
  const missed = scored.filter(c => RANK[verdicts[c.id]] >= RANK.high && c.model === "low").length;
  document.getElementById("progress").textContent = rated + " / " + CASES.length + " rated";
  document.getElementById("vsModel").innerHTML = scored.length
    ? "you vs model " + agreeModel + "/" + scored.length + (missed ? ' · <span class="bad">' + missed + " would be filtered out</span>" : "")
    : "";
  document.getElementById("vsLabel").textContent = scored.length ? "you vs stored label " + agreeLabel + "/" + scored.length : "";
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button.level");
  if (button && button.dataset.level) {
    verdicts[button.dataset.id] = button.dataset.level;
    localStorage.setItem(KEY, JSON.stringify(verdicts));
    render();
  }
  if (event.target.id === "export") {
    // Emits the --cases-file shape with your verdict as the priority, so a blind
    // pass feeds straight back into severity:eval as a re-labelled dataset.
    // Unrated cases are dropped rather than kept at their stored label.
    const relabelled = CASES.filter(c => verdicts[c.id]).map(c => ({
      id: c.id,
      feedback: c.feedback,
      source_type: c.sourceType,
      value: c.value,
      flagger_slug: c.flaggerSlug ?? null,
      priority: verdicts[c.id],
    }));
    const blob = new Blob([JSON.stringify(relabelled, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "severity-cases-relabelled.json";
    link.click();
    URL.revokeObjectURL(link.href);
    event.target.textContent = "Downloaded " + relabelled.length + " case(s)";
    setTimeout(() => { event.target.textContent = "Download re-labelled cases"; }, 2000);
  }
});

render();
</script>
</body>
</html>
`
