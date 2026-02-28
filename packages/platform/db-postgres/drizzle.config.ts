import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "@platform/env";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { Effect } from "effect";

const nodeEnv = Effect.runSync(parseEnv(process.env.NODE_ENV, "string", "development"));
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const url = Effect.runSync(parseEnv(process.env.DATABASE_URL, "string"));

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema/workspaces.ts", "./src/schema/outbox-events.ts"],
  out: "./drizzle",
  dbCredentials: {
    url,
  },
});
