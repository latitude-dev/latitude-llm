import { Queue, Worker } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
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
