import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const nodeEnv = process.env.NODE_ENV ?? "development";
const envFilePath = fileURLToPath(new URL(`../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const webPort = process.env.WEB_PORT;

if (webPort === undefined) {
  throw new Error("WEB_PORT must be declared");
}

const webPortNumber = Number(webPort);

if (Number.isNaN(webPortNumber)) {
  throw new Error("WEB_PORT must be a number");
}

export default defineConfig({
  plugins: [solid()],
  server: {
    port: webPortNumber,
    strictPort: true,
    allowedHosts: nodeEnv === "development" ? true : undefined,
  },
});
