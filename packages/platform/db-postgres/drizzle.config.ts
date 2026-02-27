import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

const nodeEnv = process.env.NODE_ENV ?? "development";
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is required for Drizzle config");
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema/workspaces.ts", "./src/schema/outbox-events.ts"],
  out: "./drizzle",
  dbCredentials: {
    url,
  },
});
