import { existsSync } from "node:fs"
import { createWeaviateClient } from "../client.ts"
import { allSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"

const envFilePath = new URL("../../../../../.env.development", import.meta.url)
if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath)
}

const main = async () => {
  console.log("Seeding Weaviate...")
  const client = await createWeaviateClient()

  try {
    await import("effect").then(({ Effect }) => Effect.runPromise(runSeeders(allSeeders, { client })))
    console.log("Seed complete.")
  } catch (error) {
    console.error("Seed failed:", error)
    process.exitCode = 1
  }
}

void main()
