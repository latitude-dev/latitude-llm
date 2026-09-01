/**
 * Local-only fixtures for the six integrations, so the organization and per-project
 * Integrations settings can be exercised in their connected state without a real
 * Slack workspace, GitHub App install, or vendor API key.
 *
 * Not part of `pnpm seed`: the credentials are decryptable but worthless, so any
 * call that actually reaches a vendor still fails. Run it with
 * `pnpm --filter @platform/db-postgres pg:seed:integrations`.
 */
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { DEFAULT_GITHUB_MONITOR_SETTINGS } from "@domain/github"
import { bootstrapSeedScope, SEED_ORG_ID, SEED_OWNER_USER_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { parseEnv } from "@platform/env"
import { config as loadDotenv } from "dotenv"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { Effect } from "effect"
import { closePostgres, createPostgresClient, type PostgresDb } from "../client.ts"
import { encryptField, getEncryptionKey } from "../encryption-key.ts"
import { agentDispatchConfigs } from "../schema/agent-dispatch-configs.ts"
import { agentDispatchCredentials } from "../schema/agent-dispatch-credentials.ts"
import { githubDeliveries } from "../schema/github-deliveries.ts"
import { githubIntegrationDetails } from "../schema/github-integration-details.ts"
import { githubSyncConfigs } from "../schema/github-sync-configs.ts"
import { integrations } from "../schema/integrations.ts"
import { slackIntegrationDetails } from "../schema/slack-integration-details.ts"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../../../.env.${nodeEnv}`, import.meta.url))
if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const KINDS = ["slack", "github", "cursor", "claude_code", "linear", "webhook"] as const
type Kind = (typeof KINDS)[number]

const integrationId = (kind: Kind) => bootstrapSeedScope.cuid(`dev-integration:${kind}`)
const configId = (kind: Kind) => bootstrapSeedScope.cuid(`dev-integration-config:${kind}`)

const DEV_REPO = { id: 902_144_557, fullName: "acme-eng/support-agent", branch: "main" }

/**
 * What the settings repository pickers offer. The app reads this from Redis before
 * calling GitHub, and a fixture installation has no real token to mint — but this
 * package has no Redis client, so the command is printed for the operator to run.
 */
const DEV_REPOS = [
  { id: DEV_REPO.id, fullName: DEV_REPO.fullName, defaultBranch: DEV_REPO.branch },
  { id: 902_144_558, fullName: "acme-eng/billing-service", defaultBranch: "main" },
  { id: 902_144_559, fullName: "acme-eng/telemetry-sdk", defaultBranch: "develop" },
  { id: 902_144_560, fullName: "acme-eng/docs", defaultBranch: "main" },
]

const printRepoCacheCommand = () => {
  const key = `latitude:org:${SEED_ORG_ID}:github:repos:${VENDOR_ACCOUNT_IDS.github}`
  console.log("\n  Repository pickers read this cache before calling GitHub. To populate it:")
  console.log(`  docker exec latitude-llm-redis-1 redis-cli SET '${key}' '${JSON.stringify(DEV_REPOS)}'\n`)
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

const VENDOR_ACCOUNT_IDS: Record<Kind, string> = {
  slack: "T0DEVACME",
  github: String(70_412_339),
  cursor: "cursor:acme-engineering",
  claude_code: "claude:trig_dev_acme_reliability",
  linear: "linear:8f3f0c1e-1f3a-4a2c-9a6f-0d0f9b7c2a11",
  webhook: "webhook:hooks.acme.dev",
}

/** Org-wide dispatch default per kind, mirroring what the connect modal would write. */
const DISPATCH_DEFAULTS: Record<
  Exclude<Kind, "slack" | "github">,
  { triggers: readonly string[]; target: Record<string, unknown> }
> = {
  cursor: {
    triggers: ["signal.discovered", "signal.regressed"],
    target: { repoUrl: "https://github.com/acme-eng/support-agent", startingRef: "main" },
  },
  claude_code: {
    triggers: ["signal.discovered", "incident.opened"],
    target: { routineTriggerId: "trig_dev_acme_reliability" },
  },
  linear: {
    triggers: ["signal.discovered"],
    target: { teamId: "8f3f0c1e-1f3a-4a2c-9a6f-0d0f9b7c2a11", assigneeId: "6b2d5a90-77c1-4d1e-8f0a-2c4b9e1d3f77" },
  },
  webhook: {
    triggers: ["signal.discovered", "incident.opened", "monitor.incident"],
    target: { webhookUrl: "https://hooks.acme.dev/latitude/dispatch" },
  },
}

const GITHUB_DELIVERY_FIXTURES = [
  { event: "pull_request", action: "closed", status: "processed", prNumber: 4128, hoursAgo: 3 },
  { event: "push", action: null, status: "processed", prNumber: null, hoursAgo: 9 },
  { event: "pull_request", action: "opened", status: "processed", prNumber: 4131, hoursAgo: 26 },
  { event: "push", action: null, status: "skipped", prNumber: null, hoursAgo: 31, skipReason: "branch not watched" },
  {
    event: "pull_request",
    action: "synchronize",
    status: "failed",
    prNumber: 4119,
    hoursAgo: 52,
    errorCategory: "transport",
    errorDetail: "GitHub API timed out while fetching commits.",
  },
] as const

/** Leaves a real connection alone; only the fixture rows this script owns are replaced. */
const claimableKinds = async (db: PostgresDb): Promise<readonly Kind[]> => {
  const active = await db
    .select({ id: integrations.id, kind: integrations.kind })
    .from(integrations)
    .where(and(eq(integrations.organizationId, SEED_ORG_ID), isNull(integrations.revokedAt)))

  return KINDS.filter((kind) => {
    const existing = active.find((row) => row.kind === kind)
    if (!existing || existing.id === integrationId(kind)) return true
    console.log(`  -> ${kind}: already connected by something else, skipping`)
    return false
  })
}

const clearFixtures = async (db: PostgresDb, kinds: readonly Kind[]) => {
  const ids = kinds.map(integrationId)
  await db.delete(agentDispatchCredentials).where(inArray(agentDispatchCredentials.integrationId, ids))
  await db.delete(agentDispatchConfigs).where(inArray(agentDispatchConfigs.integrationId, ids))
  await db.delete(githubDeliveries).where(inArray(githubDeliveries.integrationId, ids))
  await db.delete(githubSyncConfigs).where(inArray(githubSyncConfigs.integrationId, ids))
  await db.delete(githubIntegrationDetails).where(inArray(githubIntegrationDetails.integrationId, ids))
  await db.delete(slackIntegrationDetails).where(inArray(slackIntegrationDetails.integrationId, ids))
  await db.delete(integrations).where(inArray(integrations.id, ids))
}

const insertIntegration = (db: PostgresDb, kind: Kind, installedDaysAgo: number) =>
  db.insert(integrations).values({
    id: integrationId(kind),
    organizationId: SEED_ORG_ID,
    kind,
    vendorAccountId: VENDOR_ACCOUNT_IDS[kind],
    installedByUserId: SEED_OWNER_USER_ID,
    installedAt: daysAgo(installedDaysAgo),
  })

const seedSlack = async (db: PostgresDb, encrypt: (value: string) => Promise<string>) => {
  await insertIntegration(db, "slack", 26)
  await db.insert(slackIntegrationDetails).values({
    integrationId: integrationId("slack"),
    organizationId: SEED_ORG_ID,
    teamName: "Acme Engineering",
    appId: "A0DEVLATITUDE",
    botUserId: "U0DEVLATBOT",
    botAccessToken: await encrypt("xoxb-dev-fixture-not-a-real-token"),
    botTokenScopes: "chat:write,channels:read,groups:read",
    // Every routable group, so each row renders a channel. The picker's other options
    // come from a live Slack call, but "Don't send" is always there — enough to dirty
    // the form and exercise the save.
    routes: {
      signals: [
        {
          channelId: "C0DEVSIGNALS",
          channelName: "eng-signals",
          minSeverity: "medium",
          topics: { "signal.regressed": false },
        },
      ],
      monitors: [{ channelId: "C0DEVALERTS", channelName: "eng-alerts", minSeverity: "medium" }],
      wrapped_reports: [{ channelId: "C0DEVWRAPPED", channelName: "eng-weekly" }],
      custom_messages: [{ channelId: "C0DEVANNOUNCE", channelName: "acme-announcements" }],
      destinations: [{ channelId: "C0DEVDATA", channelName: "data-platform" }],
    },
  })
  console.log("  -> slack: Acme Engineering, all 5 notification groups routed")
}

const seedGithub = async (db: PostgresDb) => {
  await insertIntegration(db, "github", 19)
  await db.insert(githubIntegrationDetails).values({
    integrationId: integrationId("github"),
    organizationId: SEED_ORG_ID,
    installationId: Number(VENDOR_ACCOUNT_IDS.github),
    accountLogin: "acme-eng",
    accountType: "Organization",
    repositorySelection: "all",
  })

  await db.insert(githubSyncConfigs).values([
    {
      id: configId("github"),
      organizationId: SEED_ORG_ID,
      projectId: null,
      integrationId: integrationId("github"),
      repoId: DEV_REPO.id,
      repoFullName: DEV_REPO.fullName,
      branch: DEV_REPO.branch,
      monitorPullRequests: DEFAULT_GITHUB_MONITOR_SETTINGS.monitorPullRequests,
      monitorCommits: false,
      sources: DEFAULT_GITHUB_MONITOR_SETTINGS.sources,
      rules: DEFAULT_GITHUB_MONITOR_SETTINGS.rules,
    },
    // Binds the seed project to its own repo, so the monitoring override is savable
    // (the form disables saving without a binding) while still inheriting behavior.
    {
      id: bootstrapSeedScope.cuid("dev-integration-config:github-project"),
      organizationId: SEED_ORG_ID,
      projectId: SEED_PROJECT_ID,
      integrationId: integrationId("github"),
      repoId: DEV_REPO.id,
      repoFullName: DEV_REPO.fullName,
      branch: DEV_REPO.branch,
    },
  ])

  await db.insert(githubDeliveries).values(
    GITHUB_DELIVERY_FIXTURES.map((fixture, index) => ({
      id: bootstrapSeedScope.cuid(`dev-integration-delivery:${index}`),
      organizationId: SEED_ORG_ID,
      integrationId: integrationId("github"),
      deliveryId: `dev-fixture-delivery-${index}`,
      event: fixture.event,
      action: fixture.action,
      repoId: DEV_REPO.id,
      status: fixture.status,
      skipReason: "skipReason" in fixture ? fixture.skipReason : null,
      errorCategory: "errorCategory" in fixture ? fixture.errorCategory : null,
      errorDetail: "errorDetail" in fixture ? fixture.errorDetail : null,
      prNumber: fixture.prNumber,
      receivedAt: new Date(Date.now() - fixture.hoursAgo * 60 * 60 * 1000),
    })),
  )
  console.log(`  -> github: acme-eng, org default + ${DEV_REPO.fullName} bound to the seed project`)
}

const seedDispatchKind = async (
  db: PostgresDb,
  kind: Exclude<Kind, "slack" | "github">,
  encrypt: (value: string) => Promise<string>,
  installedDaysAgo: number,
) => {
  await insertIntegration(db, kind, installedDaysAgo)
  await db.insert(agentDispatchCredentials).values({
    integrationId: integrationId(kind),
    organizationId: SEED_ORG_ID,
    cursorApiKey: kind === "cursor" ? await encrypt("key_dev_fixture_cursor") : null,
    claudeRoutineToken: kind === "claude_code" ? await encrypt("sk-ant-dev-fixture-routine") : null,
    linearApiKey: kind === "linear" ? await encrypt("lin_api_dev_fixture") : null,
    webhookSecret: kind === "webhook" ? await encrypt("whsec_dev_fixture_secret") : null,
  })

  const { triggers, target } = DISPATCH_DEFAULTS[kind]
  await db.insert(agentDispatchConfigs).values({
    id: configId(kind),
    organizationId: SEED_ORG_ID,
    projectId: null,
    integrationId: integrationId(kind),
    kind,
    enabled: true,
    triggers,
    target,
    guardrails: { maxDispatchesPerDay: 10, cooldownMinutes: 60 },
  })
  console.log(`  -> ${kind}: connected, org default with ${triggers.length} trigger(s)`)
}

const main = async () => {
  const adminUrl = Effect.runSync(parseEnv("LAT_ADMIN_DATABASE_URL", "string"))
  const client = createPostgresClient({ databaseUrl: adminUrl })
  const encryptionKey = await Effect.runPromise(getEncryptionKey())
  const encrypt = (value: string) => Effect.runPromise(encryptField(value, encryptionKey, "seedDevIntegration"))

  console.log("Seeding development integrations...")

  try {
    const kinds = await claimableKinds(client.db)
    await clearFixtures(client.db, kinds)

    if (kinds.includes("slack")) await seedSlack(client.db, encrypt)
    if (kinds.includes("github")) await seedGithub(client.db)
    if (kinds.includes("cursor")) await seedDispatchKind(client.db, "cursor", encrypt, 12)
    if (kinds.includes("claude_code")) await seedDispatchKind(client.db, "claude_code", encrypt, 8)
    if (kinds.includes("linear")) await seedDispatchKind(client.db, "linear", encrypt, 5)
    if (kinds.includes("webhook")) await seedDispatchKind(client.db, "webhook", encrypt, 2)

    console.log("Development integrations seeded.")
    if (kinds.includes("github")) printRepoCacheCommand()
  } catch (error) {
    console.error("Seeding development integrations failed:", error)
    process.exitCode = 1
  } finally {
    await closePostgres(client.pool)
  }
}

main()
