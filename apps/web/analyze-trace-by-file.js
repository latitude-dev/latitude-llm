// analyze-trace-by-file.js
import fs from "fs";

const file = "./tsc-tracing/trace.json";
const raw = fs.readFileSync(file, "utf8");
const events = JSON.parse(raw); // raw array

const durations = new Map();

for (const e of events) {
  if (e.cat === "check" && e.dur && e.args && e.args.file) {
    const path = e.args.file;
    durations.set(path, (durations.get(path) || 0) + e.dur);
  }
}

const sorted = [...durations.entries()].sort((a, b) => b[1] - a[1]);

console.log("Top 10 slowest files by total check time:");
for (const [path, dur] of sorted.slice(0, 10)) {
  console.log(`${(dur / 1000).toFixed(2)} ms  -  ${path}`);
}

