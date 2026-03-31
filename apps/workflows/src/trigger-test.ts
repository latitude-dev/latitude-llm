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
 *      - checkEligibility:    checks if the score is eligible for discovery
 *      - retrieveAndRerank:   searches Weaviate for similar issues (~1s)
 *      - createOrAssignIssue: creates a new issue or assigns to existing (~0.5s)
 *      - syncProjections:     syncs Weaviate centroid + ClickHouse analytics (~0.5s)
 *   4. This script prints the workflow result and exits
 */

import { createTemporalClient, loadTemporalConfig } from "@platform/workflows-temporal"
import { loadDevelopmentEnvironments } from "@repo/utils/env"

loadDevelopmentEnvironments(import.meta.url)

const config = loadTemporalConfig()
const client = await createTemporalClient(config)

const handle = await client.workflow.start("issueDiscoveryWorkflow", {
  workflowId: `test-issue-discovery-${Date.now()}`,
  taskQueue: config.taskQueue,
  args: [{ organizationId: "org-test", projectId: "project-test", scoreId: "score-123" }],
})

console.log(`Started workflow ${handle.workflowId}`)
console.log(`Run ID: ${handle.firstExecutionRunId}`)
console.log(
  `Temporal UI: http://localhost:8233/namespaces/default/workflows/${handle.workflowId}/${handle.firstExecutionRunId}`,
)
console.log("\nWaiting for completion...")

const result = await handle.result()

console.log("\nWorkflow completed:", JSON.stringify(result, null, 2))
