import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * CI guard: the OTLP `partial_success.errorMessage` in `traces.ts` hard-codes
 * https://docs.latitude.so/telemetry/project-scoping, and customer exporters log that URL on
 * rejection. If anyone moves the docs page or drops it from the nav, these tests fail loudly
 * so the author can coordinate a server-side error-message update before the page 404s.
 */

const repoRoot = resolve(__dirname, "../../../..")
const docsPath = resolve(repoRoot, "docs/telemetry/project-scoping.md")
const docsConfigPath = resolve(repoRoot, "docs/docs.json")

describe("project-scoping docs integrity", () => {
  it("docs/telemetry/project-scoping.md still exists", () => {
    if (!existsSync(docsPath)) {
      throw new Error(
        `Missing ${docsPath}. The ingest service references https://docs.latitude.so/telemetry/project-scoping ` +
          "in its OTLP error response — please restore the page or coordinate a server-side error-message update.",
      )
    }
  })

  it("`telemetry/project-scoping` is wired into docs.json under the Telemetry group", () => {
    const config = JSON.parse(readFileSync(docsConfigPath, "utf-8")) as {
      navigation?: { groups?: Array<{ group: string; pages: unknown[] }> }
    }
    const groups = config.navigation?.groups ?? []
    const telemetryGroup = groups.find((g) => g.group === "Telemetry")

    if (!telemetryGroup) {
      throw new Error(
        "Could not find the `Telemetry` group in docs/docs.json. The ingest service expects " +
          "the `telemetry/project-scoping` page to live there — coordinate a server-side update " +
          "if the nav was restructured.",
      )
    }

    expect(telemetryGroup.pages).toContain("telemetry/project-scoping")
  })
})
