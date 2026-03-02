import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "@platform/env";
import react from "@vitejs/plugin-react";
import { config as loadDotenv } from "dotenv";
import { Effect } from "effect";
import { defineConfig } from "vite";

const nodeEnv = Effect.runSync(parseEnv(process.env.NODE_ENV, "string", "development"));
const envFilePath = fileURLToPath(new URL(`../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const webPortNumber = Effect.runSync(parseEnv(process.env.WEB_PORT, "number", 3000));

export default defineConfig({
  plugins: [react()],
  server:
    nodeEnv === "development"
      ? {
          port: webPortNumber,
          strictPort: true,
          allowedHosts: true,
        }
      : {
          port: webPortNumber,
          strictPort: true,
        },
});
