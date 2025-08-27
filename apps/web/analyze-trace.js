// analyze-trace.js
import fs from "fs";

const file = "./tsc-tracing/trace.json";
const raw = fs.readFileSync(file, "utf8");
const events = JSON.parse(raw); // it's a raw array in your case

const durations = new Map();

for (const e of events) {
  // We care about type-checking work
  if (e.cat === "check" && e.dur && e.name) {
    durations.set(e.name, (durations.get(e.name) || 0) + e.dur);
  }
}

const sorted = [...durations.entries()].sort((a, b) => b[1] - a[1]);

console.log("Top 20 slowest types by total check time:");
for (const [name, dur] of sorted.slice(0, 20)) {
  console.log(`${(dur / 1000).toFixed(2)} ms  -  ${name}`);
}

