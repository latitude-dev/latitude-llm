#!/usr/bin/env tsx
import { QueuePublisher } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import { TAXONOMY_OBSERVATION_DEBOUNCE_MS } from "@domain/taxonomy"
import { createClickhouseClient, SessionRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect, Layer } from "effect"

loadDevelopmentEnvironments(import.meta.url)

interface Args {
  readonly organizationId: string
  readonly projectId: string
  readonly dryRun: boolean
  readonly limit: number | undefined
}

const usage =
  () => `Usage: pnpm --dir apps/workers exec tsx ../../scripts/taxonomy/rerun-project.ts --organization-id <orgId> --project-id <projectId> [--dry-run] [--limit <n>]

Re-enqueues every ClickHouse session in a project through taxonomy:observeSession.
`

const parseArgs = (argv: readonly string[]): Args => {
  let organizationId = ""
  let projectId = ""
  let dryRun = false
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
  return { organizationId, projectId, dryRun, limit }
}

const enqueueProjectSessions = (args: Args) =>
  Effect.gen(function* () {
    const organizationId = OrganizationId(args.organizationId)
    const projectId = ProjectId(args.projectId)
    const sessions = yield* SessionRepository
    const publisher = yield* QueuePublisher

    let cursor: { readonly sortValue: string; readonly sessionId: string } | undefined
    let scanned = 0
    let enqueued = 0

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
        if (!triggeringTraceId) {
          // recordSessionObservationUseCase requires a real trace anchor — an
          // empty string flows through and corrupts the resulting CH row.
          continue
        }
        if (!args.dryRun) {
          yield* publisher.publish(
            "taxonomy",
            "observeSession",
            {
              organizationId,
              projectId,
              sessionId: session.sessionId,
              triggeringTraceId,
              triggeringStartTime: session.startTime.toISOString(),
            },
            {
              dedupeKey: `org:${organizationId}:taxonomy:observeSession:${projectId}:${session.sessionId}`,
              debounceMs: TAXONOMY_OBSERVATION_DEBOUNCE_MS,
            },
          )
        }
        enqueued++
      }
      if (args.limit !== undefined && scanned >= args.limit) break
      cursor = page.nextCursor
    } while (cursor !== undefined)

    return { scanned: Math.min(scanned, args.limit ?? scanned), enqueued, dryRun: args.dryRun }
  })

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const clickhouse = createClickhouseClient()
  const publisher = await Effect.runPromise(createBullMqQueuePublisher({ redis: Effect.runSync(loadBullMqConfig()) }))
  try {
    const result = await Effect.runPromise(
      enqueueProjectSessions(args).pipe(
        withClickHouse(SessionRepositoryLive, clickhouse, OrganizationId(args.organizationId)),
        Effect.provide(Layer.succeed(QueuePublisher, publisher)),
      ),
    )
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await Effect.runPromise(publisher.close())
    await clickhouse.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  console.error(usage())
  process.exit(1)
})
