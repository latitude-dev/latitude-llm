/**
 * Manual test for the issue-discovery workflow.
 *
 * Prerequisites:
 *   - Temporal server running (docker compose up -d temporal)
 *   - Workflows dev server running (pnpm --filter @app/workflows dev)
 *
 * Run:
 *   pnpm --filter @app/workflows trigger-test
 *
 * What happens:
 *   1. This script starts the issueDiscoveryWorkflow via the Temporal client
 *   2. The Temporal server schedules it on the "latitude-workflows" task queue
 *   3. The workflows dev server picks it up and runs 4 activities in sequence:
 *      - recheckEligibility:  checks if the score is eligible for discovery (~0.5s)
 *      - retrieveAndRerank:   searches Weaviate for similar issues (~1s)
 *      - createOrAssignIssue: creates a new issue or assigns to existing (~0.5s)
 *      - syncProjections:     syncs Weaviate centroid + ClickHouse analytics (~0.5s)
 *   4. Each use-case writes a "guest book" line to workflow-test-output.txt at the repo root
 *   5. This script prints the workflow result and exits
 *
 * Expected output in workflow-test-output.txt:
 *   [timestamp] 1/4 recheckEligibility: I am score score-123, checking if I'm eligible...
 *   [timestamp] 1/4 recheckEligibility: I am score score-123, verdict: eligible=true
 *   [timestamp] 2/4 retrieveAndRerank: I am score score-123, searching Weaviate...
 *   [timestamp] 2/4 retrieveAndRerank: I am score score-123, found matchedIssueId=none...
 *   [timestamp] 3/4 createOrAssignIssue: I am score score-123, no match, creating new issue...
 *   [timestamp] 3/4 createOrAssignIssue: I am score score-123, result: action=created...
 *   [timestamp] 4/4 syncProjections: I am issue ..., syncing Weaviate + ClickHouse...
 *   [timestamp] 4/4 syncProjections: I am issue ..., projections up to date. Discovery complete!
 */

import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createTemporalClient, loadTemporalConfig } from "@platform/workflows-temporal"
import { config as loadDotenv } from "dotenv"

const nodeEnv = process.env.NODE_ENV || "development"
for (const envPath of [join(process.cwd(), `.env.${nodeEnv}`), join(process.cwd(), "..", "..", `.env.${nodeEnv}`)]) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, quiet: true })
    break
  }
}

const repoRoot = join(process.cwd(), "..", "..")
const logFile = join(repoRoot, "workflow-test-output.txt")
writeFileSync(logFile, `=== issue-discovery workflow test run ===\n\n`)

const config = loadTemporalConfig()
const client = await createTemporalClient(config)

const handle = await client.workflow.start("issueDiscoveryWorkflow", {
  workflowId: `test-issue-discovery-${Date.now()}`,
  taskQueue: config.taskQueue,
  args: [{ organizationId: "org-test", scoreId: "score-123", logFile }],
})

console.log(`Started workflow ${handle.workflowId}`)
console.log(`Run ID: ${handle.firstExecutionRunId}`)
console.log(
  `Temporal UI: http://localhost:8233/namespaces/default/workflows/${handle.workflowId}/${handle.firstExecutionRunId}`,
)
console.log("\nWaiting for completion...")

const result = await handle.result()

console.log("\nWorkflow completed:", JSON.stringify(result, null, 2))
console.log(`\nActivity guest book written to: ${logFile}`)
