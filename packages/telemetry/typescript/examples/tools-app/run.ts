/**
 * Runs one or more provider-executed tool scenarios against a local Latitude instance, then reports
 * what the app process saw versus what telemetry carried.
 *
 * Usage: pnpm tsx --env-file=examples/.env examples/tools-app/run.ts <scenario|all>
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { OpenTelemetry } from "@ai-sdk/otel"
import { registerTelemetry } from "ai7"
import { capture } from "../../src/index.ts"
import { findScenario, MODEL, SCENARIOS, type Scenario, type ScenarioResult } from "./scenarios.ts"
import { setupTelemetry } from "./telemetry.ts"

const AI_SDK_VERSION = (createRequire(import.meta.url)("ai7/package.json") as { version: string }).version
const SESSION_ID = `provider-tools-${randomUUID().slice(0, 8)}`

function requireEnv(name: string): void {
  if (!process.env[name]) {
    console.error(`Missing ${name}. See examples/tools-app/README.md.`)
    process.exit(1)
  }
}

function resolveScenarios(target: string): Scenario[] {
  if (target === "all") return SCENARIOS
  const scenario = findScenario(target)
  if (!scenario) {
    console.error(`Unknown scenario "${target}". Available: ${SCENARIOS.map((s) => s.name).join(", ")}`)
    process.exit(1)
  }
  return [scenario]
}

function printAppSide(result: ScenarioResult): { calls: string[]; results: string[] } {
  console.log(`\n── app process saw (${result.toolParts.length} tool part(s))`)
  for (const part of result.toolParts) {
    const origin = part.providerExecuted ? "provider-executed" : "app-executed"
    const payload = JSON.stringify(part.payload) ?? "undefined"
    console.log(
      `  [${part.kind}] ${part.toolName} (${origin}) ${payload.length > 160 ? `${payload.slice(0, 160)}…` : payload}`,
    )
  }
  console.log(`\n── answer\n  ${result.text.replace(/\n/g, "\n  ")}`)
  return {
    calls: result.toolParts.filter((part) => part.kind === "call").map((part) => part.toolCallId),
    results: result.toolParts.filter((part) => part.kind === "result").map((part) => part.toolCallId),
  }
}

async function main(): Promise<void> {
  requireEnv("LATITUDE_API_KEY")
  requireEnv("OPENAI_API_KEY")

  const scenarios = resolveScenarios(process.argv[2] ?? "all")
  const telemetry = setupTelemetry()

  // Must register after Latitude has registered the global tracer provider.
  registerTelemetry(new OpenTelemetry({ tracer: telemetry.tracer }))

  const inspector = await import("./inspect.ts").catch((error) => {
    console.warn(`\n[warn] could not load the inspector (${error}); dumps are still written to disk.`)
    return undefined
  })

  for (const scenario of scenarios) {
    const unavailable = scenario.unavailable?.()
    if (unavailable) {
      console.log(`\n══ ${scenario.name} — skipped: ${unavailable}`)
      continue
    }

    console.log(`\n══ ${scenario.name} — ${scenario.description}`)
    const meta = { scenario: scenario.name, model: MODEL, aiSdkVersion: AI_SDK_VERSION }
    let result: ScenarioResult
    try {
      result = (await capture(`provider-tools-${scenario.name}`, () => scenario.run(), {
        tags: ["example", "provider-executed-tools", scenario.name],
        sessionId: SESSION_ID,
        userId: "provider-tools-example",
        metadata: meta,
      })) as ScenarioResult
    } catch (error) {
      console.error(`  failed: ${error}`)
      await telemetry.flush()
      telemetry.writeDump(meta)
      continue
    }

    const appSide = printAppSide(result)
    await telemetry.flush()
    const path = telemetry.writeDump(meta)

    if (inspector) {
      inspector.reportTotals(inspector.inspectDump(JSON.parse(readFileSync(path, "utf8"))), appSide)
    }
    console.log(`\n  span dump: ${path}`)
  }

  await telemetry.flush()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
