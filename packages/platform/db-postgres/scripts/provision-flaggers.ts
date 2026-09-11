import { closePostgres, createPostgresClient } from "../src/client.ts"
import { provisionFlaggersForAllProjects } from "../src/provision-flaggers-backfill.ts"

const client = createPostgresClient()

try {
  const result = await provisionFlaggersForAllProjects(client)
  console.log(
    `Flagger provisioning completed: ${result.provisionedCount} rows added across ${result.projectCount} projects`,
  )
  if (result.failedProjectIds.length > 0) {
    console.error(`Failed for ${result.failedProjectIds.length} projects: ${result.failedProjectIds.join(", ")}`)
    process.exitCode = 1
  }
} finally {
  await closePostgres(client.pool)
}
