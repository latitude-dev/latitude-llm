import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "@platform/env";
import { Queue, Worker } from "bullmq";
import { config as loadDotenv } from "dotenv";
import { Effect } from "effect";

const nodeEnv = Effect.runSync(parseEnv(process.env.NODE_ENV, "string", "development"));
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const connection = Effect.runSync(
  Effect.all({
    host: parseEnv(process.env.REDIS_HOST, "string"),
    port: parseEnv(process.env.REDIS_PORT, "number"),
  }),
);

const queue = new Queue("events", { connection });
const worker = new Worker(
  "events",
  async () => {
    return { ok: true };
  },
  { connection },
);

worker.on("ready", async () => {
  await Effect.runPromise(
    Effect.tryPromise(() =>
      queue.add("bootstrap", { startedAt: new Date().toISOString() }, { jobId: "bootstrap" }),
    ),
  );
  Effect.runSync(Effect.logInfo("workers ready"));
});
