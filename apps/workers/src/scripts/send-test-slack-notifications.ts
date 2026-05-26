import { parseArgs } from "node:util"
import { generateId, OrganizationId } from "@domain/shared"
import { SEED_ORG_ID } from "@domain/shared/seeding"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { getAdminPostgresClient } from "../clients.ts"

const USAGE = `
Usage: pnpm --filter @app/workers test-slack:notifications [options]

Publishes notification-slack:send tasks with synthetic payloads for each
NotificationKind. The running notification-slack worker picks them up and
posts to whatever channels are configured for the org's Slack integration.

Requires:
  - Workers running: pnpm --filter @app/workers dev
  - Slack integration connected and channels configured in settings
  - "slack" feature flag on for the target org

Options:
  --organization-id <id>  Target org (default: SEED_ORG_ID — Acme)
  --channel-id <id>       Override channel (skips org routes, useful when
                          no routes are configured yet)
  --kind <k>              Only send one kind: incident.event | incident.opened |
                          incident.closed | wrapped.report | custom.message
                          (default: all five in sequence)
  --help                  Show this help
`.trim()

loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

// Generate per-run IDs inside main() so every invocation gets fresh
// idempotency keys and the delivery repo doesn't skip them as duplicates.
const makeIncidentBase = (alertIncidentId: string) => ({
  alertIncidentId,
  sourceType: "issue" as const,
  sourceId: generateId(),
  incidentKind: "issue.escalating" as const,
  severity: "high" as const,
})

// Built inside main() so IDs are fresh on every invocation.
const buildSyntheticPayloads = (): Record<string, unknown> => {
  // incident.opened and incident.closed share an alertIncidentId so
  // the threading lookup finds the opened message when posting closed.
  const sharedAlertIncidentId = generateId()
  const baseSustained = makeIncidentBase(sharedAlertIncidentId)

  return {
    "incident.event": {
      ...makeIncidentBase(generateId()),
      incidentKind: "issue.new",
      severity: "high",
      sampleExcerpt: {
        text: "The model returned 'cancel' but the workflow expected 'proceed'",
        truncated: false,
        author: { kind: "user", name: "Carlos", imageUrl: null },
      },
    },
    "incident.opened": {
      ...baseSustained,
      trend: {
        bucketDurationMs: 600_000,
        points: Array.from({ length: 18 }, (_, i) => ({
          t: new Date(Date.now() - (17 - i) * 600_000).toISOString(),
          count: Math.max(0, Math.round(8 + i * 2.1 + Math.random() * 3)),
          threshold: 14,
        })),
      },
      breach: { triggerRate: 47.2, baselineRate: 14.0, threshold: 14.0 },
      sampleExcerpt: {
        text: "Responses consistently missing required JSON fields in 'address' key",
        truncated: false,
        author: { kind: "system" },
      },
    },
    "incident.closed": {
      ...baseSustained,
      trend: {
        bucketDurationMs: 600_000,
        points: Array.from({ length: 18 }, (_, i) => ({
          t: new Date(Date.now() - (17 - i) * 600_000).toISOString(),
          count: Math.max(0, Math.round(47 - i * 2.5 + Math.random() * 3)),
          threshold: 14,
        })),
      },
      recovery: { durationMs: 38 * 60_000 },
    },
    "wrapped.report": {
      wrappedReportId: generateId(),
      link: "https://localhost:3000/wrapped/demo",
    },
    "custom.message": {
      title: "Planned maintenance tonight",
      content: "The platform will be offline 23:00–01:00 UTC for a database upgrade.",
      link: "https://status.latitude.so",
    },
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      "organization-id": { type: "string" },
      "channel-id": { type: "string" },
      kind: { type: "string" },
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
  const overrideChannelId = parsed.values["channel-id"]
  const kindFilter = parsed.values.kind

  const SYNTHETIC_PAYLOADS = buildSyntheticPayloads()
  const allKinds = Object.keys(SYNTHETIC_PAYLOADS)
  const kinds = kindFilter ? [kindFilter] : allKinds

  for (const k of kinds) {
    if (!SYNTHETIC_PAYLOADS[k]) {
      console.error(`Unknown kind: ${k}. Valid: ${allKinds.join(", ")}`)
      process.exit(1)
    }
  }

  const pgClient = getAdminPostgresClient()
  const pool = pgClient.pool

  // Look up the active Slack integration for the org.
  const integrationRow = await pool.query<{ id: string; routes: unknown }>(
    `SELECT i.id, sd.routes
       FROM latitude.integrations i
       JOIN latitude.slack_integration_details sd ON sd.integration_id = i.id
      WHERE i.organization_id = $1
        AND i.kind = 'slack'
        AND i.revoked_at IS NULL
      LIMIT 1`,
    [orgId],
  )

  if (integrationRow.rows.length === 0) {
    console.error(`No active Slack integration found for org ${orgId}.`)
    console.error("Connect Slack in Settings → Integrations first.")
    await pool.end()
    process.exit(1)
  }

  const integration = integrationRow.rows[0]!
  const routes = (integration.routes as Record<string, Array<{ channelId: string; channelName: string }>> | null) ?? {}

  const bullMqConfig = Effect.runSync(loadBullMqConfig())
  const publisher = await Effect.runPromise(createBullMqQueuePublisher({ redis: bullMqConfig }))

  let published = 0

  for (const kind of kinds) {
    // Resolve which channels to post to for this kind.
    const group = kind.startsWith("incident")
      ? "incidents"
      : kind === "wrapped.report"
        ? "wrapped_reports"
        : "custom_messages"
    const routeChannels = routes[group] ?? []

    const channels: Array<{ channelId: string; channelName: string }> = overrideChannelId
      ? [{ channelId: overrideChannelId, channelName: overrideChannelId }]
      : routeChannels

    if (channels.length === 0) {
      console.log(`  ${kind}: no channels configured for group "${group}" — skipping`)
      console.log(`    → Configure channels in Settings → Integrations, or pass --channel-id <id>`)
      continue
    }

    for (const { channelId, channelName } of channels) {
      const idempotencyKey = `${kind}:test-${generateId()}`
      await Effect.runPromise(
        publisher.publish(
          "notification-slack",
          "send",
          {
            organizationId: orgId,
            integrationId: integration.id,
            channelId,
            kind,
            payload: SYNTHETIC_PAYLOADS[kind] as Record<string, unknown>,
            idempotencyKey,
            projectId: generateId(),
            notificationId: null,
          },
          { dedupeKey: idempotencyKey },
        ),
      )
      console.log(`  → ${kind} → #${channelName} (${channelId})`)
      published++
    }
  }

  await Effect.runPromise(publisher.close())
  await pool.end()

  if (published === 0) {
    console.log("\nNothing published. Configure Slack channels in Settings → Integrations.")
  } else {
    console.log(`\nPublished ${published} job(s). The notification-slack worker should post to Slack within a second.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
