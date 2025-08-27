// inspect-args.cjs
const fs = require("fs");

const file = "./tsc-tracing/trace.json";
const raw = fs.readFileSync(file, "utf8");
const events = JSON.parse(raw);

for (const e of events) {
  if (e.cat === "check" && e.args && Object.keys(e.args).length > 0) {
    console.log(e);
    break; // show just the first one
  }
}

