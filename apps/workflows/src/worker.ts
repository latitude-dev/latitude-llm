import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "@platform/env";
import { config as loadDotenv } from "dotenv";
import { Effect } from "effect";

const nodeEnv = Effect.runSync(parseEnv(process.env.NODE_ENV, "string", "development"));
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

Effect.runSync(Effect.logInfo("workflows worker bootstrap"));
