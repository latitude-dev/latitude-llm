import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ service: "ingest", status: "ok" }));

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3002),
  },
  (info) => {
    console.log(`ingest listening on http://localhost:${info.port}`);
  },
);
