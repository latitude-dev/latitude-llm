#!/usr/bin/env tsx
/**
 * Trigger session-intelligence + taxonomy backfill for one project.
 *
 * Default mode re-analyzes every session (slow: ~25 min for 1500 sessions
 * because of the per-session LLM analyze call). Use --garden-only to skip
 * analyze entirely and only rebuild the taxonomy tree from observations that
 * already exist in ClickHouse — the right mode for iterating on the
 * clustering algorithm itself.
 *
 * Examples:
 *   # Full backfill (analyze + garden)
 *   pnpm exec tsx scripts/taxonomy/rebuild.ts --organization-id <id> --project-id <id>
 *
 *   # Garden-only: re-run clustering on existing taxonomy_observations
 *   pnpm exec tsx scripts/taxonomy/rebuild.ts --organization-id <id> --project-id <id> --garden-only
 */
import { OrganizationId, ProjectId } from "@domain/shared"
import { createTemporalClient, loadTemporalConfig } from "@platform/workflows-temporal"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Client as PgClient } from "pg"

loadDevelopmentEnvironments(new URL("../../apps/workers/src/server.ts", import.meta.url).href)

interface Args {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionLimit: number
  readonly wait: boolean
  readonly gardenOnly: boolean
}

const parseArgs = (argv: readonly string[]): Args => {
  let organizationId = ""
  let projectId = ""
  let sessionLimit = 1500
  let wait = true
  let gardenOnly = false
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    switch (arg) {
      case "--organization-id":
      case "--org-id":
        organizationId = argv[++index] ?? ""
        break
      case "--project-id":
        projectId = argv[++index] ?? ""
        break
      case "--session-limit":
        sessionLimit = Number.parseInt(argv[++index] ?? "1500", 10)
        break
      case "--no-wait":
        wait = false
        break
      case "--garden-only":
        gardenOnly = true
        break
      default:
        throw new Error(`unknown arg: ${arg}`)
    }
  }
  if (!organizationId || !projectId) {
    throw new Error("--organization-id and --project-id are required")
  }
  return { organizationId, projectId, sessionLimit, wait, gardenOnly }
}

const dumpTree = async (projectId: string) => {
  const url = process.env.LAT_DATABASE_URL ?? process.env.LAT_ADMIN_DATABASE_URL
  if (!url) throw new Error("LAT_DATABASE_URL / LAT_ADMIN_DATABASE_URL not set")
  const client = new PgClient({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query(
      `SELECT id, parent_cluster_id, depth, name, description, observation_count, split_link_threshold, state
       FROM latitude.taxonomy_clusters
       WHERE project_id = $1 AND state = 'active'
       ORDER BY depth ASC, observation_count DESC`,
      [projectId],
    )
    const byParent = new Map<string | null, typeof rows>()
    for (const row of rows) {
      const parent = row.parent_cluster_id as string | null
      const bucket = byParent.get(parent) ?? []
      bucket.push(row)
      byParent.set(parent, bucket)
    }
    const print = (parent: string | null, indent: string) => {
      const children = byParent.get(parent) ?? []
      for (const child of children) {
        const slt = child.split_link_threshold === null ? "" : ` linkθ=${Number(child.split_link_threshold).toFixed(3)}`
        const name = child.name === "Pending" ? "[Pending naming]" : child.name
        console.log(
          `${indent}- ${name} · n=${child.observation_count}${slt}\n${indent}   ${(child.description as string).slice(0, 200)}`,
        )
        print(child.id, `${indent}  `)
      }
    }
    console.log(`\nActive taxonomy tree for project ${projectId} (${rows.length} clusters)\n`)
    print(null, "")
  } finally {
    await client.end()
  }
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const config = loadTemporalConfig()
  const client = await createTemporalClient(config)
  try {
    const handle = args.gardenOnly
      ? await client.workflow.start("gardenTaxonomyWorkflow", {
          taskQueue: config.taskQueue,
          workflowId: `org:${args.organizationId}:taxonomy:garden:${args.projectId}:rerun-${Date.now()}`,
          args: [
            {
              organizationId: OrganizationId(args.organizationId),
              projectId: ProjectId(args.projectId),
              dimension: "topic" as const,
              trigger: "manual" as const,
            },
          ],
        })
      : await client.workflow.start("backfillSessionIntelligenceWorkflow", {
          taskQueue: config.taskQueue,
          workflowId: `org:${args.organizationId}:session-intelligence:backfill:${args.projectId}:${Date.now()}`,
          args: [
            {
              organizationId: OrganizationId(args.organizationId),
              projectId: ProjectId(args.projectId),
              sessionLimit: args.sessionLimit,
              reason: "backoffice" as const,
            },
          ],
        })
    console.log(`Started workflow ${handle.workflowId} (run ${handle.firstExecutionRunId})`)
    if (args.wait) {
      console.log("Waiting for completion...")
      const result = await handle.result()
      console.log("Workflow result:", JSON.stringify(result, null, 2))
      await dumpTree(args.projectId)
    } else {
      console.log(`Detached. Inspect via Temporal UI: http://localhost:8080`)
    }
  } finally {
    client.connection.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
