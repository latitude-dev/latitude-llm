#!/usr/bin/env tsx
import { OrganizationId, ProjectId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import { createClickhouseClient, SessionRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createTemporalClient, createWorkflowStarter, loadTemporalConfig } from "@platform/workflows-temporal"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"

loadDevelopmentEnvironments(new URL("../../apps/workers/src/server.ts", import.meta.url).href)

interface Args {
  readonly organizationId: string
  readonly projectId: string
  readonly dryRun: boolean
  readonly limit: number | undefined
  readonly manualReprocess: boolean
}

const usage =
  () => `Usage: pnpm --dir apps/workers exec tsx ../../scripts/taxonomy/rerun-project.ts --organization-id <orgId> --project-id <projectId> [--dry-run] [--limit <n>] [--manual-reprocess]

Starts AnalyzeSessionWorkflow for every ClickHouse session in a project. The old taxonomy:observeSession queue path was removed by the session-moment taxonomy redesign.
`

const parseArgs = (argv: readonly string[]): Args => {
  let organizationId = ""
  let projectId = ""
  let dryRun = false
  let manualReprocess = false
  let limit: number | undefined

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
      case "--dry-run":
        dryRun = true
        break
      case "--manual-reprocess":
        manualReprocess = true
        break
      case "--limit": {
        const parsed = Number.parseInt(argv[++index] ?? "", 10)
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("--limit must be a positive integer")
        limit = parsed
        break
      }
      case "--help":
      case "-h":
        console.log(usage())
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!organizationId || !projectId) throw new Error("--organization-id and --project-id are required")
  return { organizationId, projectId, dryRun, limit, manualReprocess }
}

const enqueueProjectSessions = (args: Args) =>
  Effect.gen(function* () {
    const organizationId = OrganizationId(args.organizationId)
    const projectId = ProjectId(args.projectId)
    const sessions = yield* SessionRepository
    const temporalConfig = yield* Effect.sync(() => loadTemporalConfig())
    const temporalClient = yield* Effect.promise(() => createTemporalClient(temporalConfig))
    const workflowStarter = createWorkflowStarter(temporalClient, temporalConfig)

    let cursor: { readonly sortValue: string; readonly sessionId: string } | undefined
    let scanned = 0
    let started = 0

    try {
      do {
        const page = yield* sessions.listByProjectId({
          organizationId,
          projectId,
          options: { limit: 500, cursor, sortBy: "lastActivity", sortDirection: "asc" },
        })
        for (const session of page.items) {
          scanned++
          if (args.limit !== undefined && scanned > args.limit) break
          const triggeringTraceId = session.traceIds[0]
          if (!triggeringTraceId) continue
          if (!args.dryRun) {
            yield* workflowStarter.signalWithStart(
              "analyzeSessionWorkflow",
              {
                organizationId,
                projectId,
                sessionId: session.sessionId,
                triggeringTraceId,
                triggeringStartTime: session.startTime.toISOString(),
                reason: args.manualReprocess ? "manual_reprocess" : "backfill",
              },
              {
                workflowId: `org:${organizationId}:conversation-intelligence:analyzeSession:${projectId}:${session.sessionId}`,
                signal: "refresh",
                signalArgs: [],
              },
            )
          }
          started++
        }
        if (args.limit !== undefined && scanned >= args.limit) break
        cursor = page.nextCursor
      } while (cursor !== undefined)
    } finally {
      temporalClient.connection.close()
    }

    return { scanned: Math.min(scanned, args.limit ?? scanned), started, dryRun: args.dryRun }
  })

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const clickhouse = createClickhouseClient()
  try {
    const result = await Effect.runPromise(
      enqueueProjectSessions(args).pipe(withClickHouse(SessionRepositoryLive, clickhouse, OrganizationId(args.organizationId))),
    )
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await clickhouse.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  console.error(usage())
  process.exit(1)
})
