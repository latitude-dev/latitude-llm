import { parseArgs } from "node:util"
import { OrganizationId } from "@domain/shared"
import { SEED_ORG_ID } from "@domain/shared/seeding"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { getAdminPostgresClient } from "../clients.ts"

const USAGE = `
Usage: pnpm --filter @app/workers test-emails:incidents [options]

Publishes notification-email:send tasks for seeded incident notifications
so the templates land in Mailpit (localhost:8025). Requires the
notification-emailer worker to be running (\`pnpm --filter @app/workers
dev\`) and the email-notifications feature flag enabled.

Options:
  --organization-id <id>   Target organization (default: SEED_ORG_ID — Acme)
  --force                  Clear emailed_at on matched rows first so
                           previously-sent notifications fire again
  --help                   Show this help
`.trim()

const INCIDENT_KINDS = ["incident.event", "incident.opened", "incident.closed"] as const

// Pass a synthetic URL one level up so `loadDevelopmentEnvironments`'s
// `../../../.env.<NODE_ENV>` traversal lands at the monorepo root —
// scripts live one directory deeper than `server.ts`. Same trick the
// `backfill-trace-search` script uses.
loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      "organization-id": { type: "string" },
      force: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  })

  if (parsed.values.help) {
    console.log(USAGE)
    return
  }

  const orgId = OrganizationId(parsed.values["organization-id"] ?? SEED_ORG_ID)
  const force = parsed.values.force === true

  console.log(`Sending test incident emails for org ${orgId}${force ? " (force)" : ""}`)

  // Admin client to bypass RLS — no session context here, and the
  // script is dev-only.
  const pgClient = getAdminPostgresClient()
  const pool = pgClient.pool

  if (force) {
    const cleared = await pool.query<{ id: string }>(
      `UPDATE latitude.notifications
         SET emailed_at = NULL
       WHERE organization_id = $1
         AND kind = ANY($2::text[])
       RETURNING id`,
      [orgId, INCIDENT_KINDS],
    )
    console.log(`  cleared emailed_at on ${cleared.rowCount ?? 0} row(s)`)
  }

  const pending = await pool.query<{ id: string; kind: string }>(
    `SELECT id, kind FROM latitude.notifications
      WHERE organization_id = $1
        AND kind = ANY($2::text[])
        AND emailed_at IS NULL`,
    [orgId, INCIDENT_KINDS],
  )

  if (pending.rows.length === 0) {
    console.log("  no pending incident notifications found — try `pnpm db:reset && pnpm seed`, or pass --force")
    await pool.end()
    return
  }

  console.log(`  publishing notification-email:send for ${pending.rows.length} row(s)`)

  const bullMqConfig = Effect.runSync(loadBullMqConfig())
  const publisher = await Effect.runPromise(createBullMqQueuePublisher({ redis: bullMqConfig }))

  for (const row of pending.rows) {
    await Effect.runPromise(
      publisher.publish(
        "notification-email",
        "send",
        { organizationId: orgId, notificationId: row.id },
        { dedupeKey: `notification-email:send:${row.id}` },
      ),
    )
    console.log(`  → ${row.kind} ${row.id}`)
  }

  await Effect.runPromise(publisher.close())
  await pool.end()
  console.log(
    "\nDone. Check Mailpit at http://localhost:8025 — the email worker should pick up the jobs within a second.",
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
