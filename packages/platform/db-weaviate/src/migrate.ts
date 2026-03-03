import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import { createWeaviateClient } from "./client.ts"

type ClosableClient = {
  close?: () => Promise<void> | void
}

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath)
}

const migrateCollections = async (): Promise<void> => {
  const client = await createWeaviateClient()
  const closableClient = client as ClosableClient

  if (typeof closableClient.close === "function") {
    await closableClient.close()
  }
}

void migrateCollections().catch((error: unknown) => {
  console.error("Failed to migrate Weaviate collections", error)
  process.exitCode = 1
})
