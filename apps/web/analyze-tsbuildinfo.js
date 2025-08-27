// analyze-tsbuildinfo.js
import fs from "fs";

const raw = fs.readFileSync("./.tsbuildinfo", "utf8");

// Clean: remove comments and trailing commas
const cleaned = raw
  .replace(/^\s*\/\/.*$/gm, "") // strip lines starting with //
  .replace(/,\s*}/g, "}")       // remove trailing commas before }
  .replace(/,\s*]/g, "]");      // remove trailing commas before ]

let data;
try {
  data = JSON.parse(cleaned);
} catch (e) {
  console.error("Could not parse .tsbuildinfo:", e);
  process.exit(1);
}

const files = data.incremental?.files || {};
const times = Object.entries(files)
  .filter(([, v]) => typeof v.checkTime === "number")
  .map(([path, v]) => ({ path, checkTime: v.checkTime }))
  .sort((a, b) => b.checkTime - a.checkTime);

if (times.length === 0) {
  console.log("No checkTime entries found. Maybe TypeScript version doesn’t emit per-file times?");
} else {
  console.log("Top 10 slowest files by checkTime:");
  for (const f of times.slice(0, 10)) {
    console.log(`${f.checkTime} ms  -  ${f.path}`);
  }
}

