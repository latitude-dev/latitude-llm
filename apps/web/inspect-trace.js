// inspect-trace.js
import fs from "fs";

const file = "./tsc-tracing/trace.json"; // adjust path if needed
const raw = fs.readFileSync(file, "utf8");
const data = JSON.parse(raw);

console.log("Top-level keys in trace.json:", Object.keys(data));

// If traceEvents exists, show a few
if (Array.isArray(data.traceEvents)) {
  console.log("traceEvents[0..2]:");
  console.log(JSON.stringify(data.traceEvents.slice(0, 3), null, 2));
} else if (Array.isArray(data)) {
  console.log("File is a raw array. First 3 entries:");
  console.log(JSON.stringify(data.slice(0, 3), null, 2));
} else {
  console.log("Unexpected format. Here’s a snippet:");
  console.log(JSON.stringify(data, null, 2).slice(0, 500));
}

