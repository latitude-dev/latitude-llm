import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Queue, Worker } from "bullmq";
import { config as loadDotenv } from "dotenv";

const nodeEnv = process.env.NODE_ENV ?? "development";
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`${name} must be declared`);
  }

  return value;
};

const connection = {
  host: requireEnv("REDIS_HOST"),
  port: Number(requireEnv("REDIS_PORT")),
};

const queue = new Queue("events", { connection });

const worker = new Worker(
  "events",
  async () => {
    return { ok: true };
  },
  { connection },
);

worker.on("ready", async () => {
  await queue.add("bootstrap", { startedAt: new Date().toISOString() }, { jobId: "bootstrap" });
  console.log("workers ready");
});
