#!/usr/bin/env tsx
/**
 * Enqueue a scoped `taxonomy/gardenCustomBehavior` job for one custom behavior,
 * mirroring `triggerProjectGardeningUseCase` (which the Phase-3b Generate button
 * will call). QA-repeatable: run it, then watch the workflow in the Temporal UI
 * (http://localhost:8080) and inspect `taxonomy_clusters` (custom_behavior_id) +
 * `custom_behavior_assignments`.
 *
 * The `taxonomy` worker must be running to consume the job
 * (`pnpm --filter @app/workers dev`).
 *
 * Examples:
 *   # By slug (resolves the id via Postgres) — works with the seeded QA behaviors
 *   pnpm exec tsx scripts/taxonomy/garden-custom-behavior.ts --slug qa-retail-support
 *   pnpm exec tsx scripts/taxonomy/garden-custom-behavior.ts --slug qa-coyote-behaviors
 *
 *   # By explicit id
 *   pnpm exec tsx scripts/taxonomy/garden-custom-behavior.ts --custom-behavior-id <id>
 */
import { CustomBehaviorId, OrganizationId, ProjectId } from "@domain/shared"
import { SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { CustomBehaviorRepository, taxonomyGardenCustomBehaviorDedupeKey } from "@domain/taxonomy"
import { CustomBehaviorRepositoryLive, createPostgresClient, SqlClientLive } from "@platform/db-postgres"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"

loadDevelopmentEnvironments(new URL("../../apps/workers/src/server.ts", import.meta.url).href)

interface Args {
  readonly organizationId: string
  readonly projectId: string
  readonly customBehaviorId: string | undefined
  readonly slug: string | undefined
  readonly reason: "manual" | "cron"
}

const usage = () =>
  `Usage: pnpm exec tsx scripts/taxonomy/garden-custom-behavior.ts (--custom-behavior-id <id> | --slug <slug>) [--organization-id <id>] [--project-id <id>] [--reason manual|cron]

Defaults: --organization-id ${SEED_ORG_ID}, --project-id ${SEED_PROJECT_ID} (the seed project).
`

const parseArgs = (argv: readonly string[]): Args => {
  let organizationId: string = SEED_ORG_ID
  let projectId: string = SEED_PROJECT_ID
  let customBehaviorId: string | undefined
  let slug: string | undefined
  let reason: "manual" | "cron" = "manual"

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
      case "--custom-behavior-id":
        customBehaviorId = argv[++index] ?? ""
        break
      case "--slug":
        slug = argv[++index] ?? ""
        break
      case "--reason": {
        const value = argv[++index] ?? ""
        if (value !== "manual" && value !== "cron") throw new Error("--reason must be 'manual' or 'cron'")
        reason = value
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

  if (!customBehaviorId && !slug) throw new Error("one of --custom-behavior-id or --slug is required")
  if (customBehaviorId && slug) throw new Error("pass only one of --custom-behavior-id or --slug")
  return { organizationId, projectId, customBehaviorId, slug, reason }
}

const resolveBehaviorId = async (args: Args): Promise<string> => {
  if (args.customBehaviorId) return args.customBehaviorId
  const client = createPostgresClient()
  try {
    const behavior = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        return yield* repo.findBySlug({ projectId: ProjectId(args.projectId), slug: args.slug ?? "" })
      }).pipe(
        Effect.provide(CustomBehaviorRepositoryLive),
        Effect.provide(SqlClientLive(client, OrganizationId(args.organizationId))),
      ),
    )
    if (!behavior) throw new Error(`no custom behavior with slug "${args.slug}" in project ${args.projectId}`)
    return behavior.id
  } finally {
    await client.pool.end()
  }
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const organizationId = OrganizationId(args.organizationId)
  const projectId = ProjectId(args.projectId)
  const customBehaviorId = CustomBehaviorId(await resolveBehaviorId(args))
  const dedupeKey = taxonomyGardenCustomBehaviorDedupeKey({ organizationId, customBehaviorId })

  const bullMqConfig = Effect.runSync(loadBullMqConfig())
  const publisher = await Effect.runPromise(createBullMqQueuePublisher({ redis: bullMqConfig }))
  try {
    await Effect.runPromise(
      publisher.publish(
        "taxonomy",
        "gardenCustomBehavior",
        { organizationId, projectId, customBehaviorId, reason: args.reason },
        { dedupeKey },
      ),
    )
  } finally {
    await Effect.runPromise(publisher.close())
  }

  console.log(
    `Enqueued taxonomy/gardenCustomBehavior for ${customBehaviorId} (reason=${args.reason}).\n` +
      `  workflowId/dedupeKey: ${dedupeKey}\n` +
      `  Ensure the taxonomy worker is running, then watch http://localhost:8080`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  console.error(usage())
  process.exit(1)
})
