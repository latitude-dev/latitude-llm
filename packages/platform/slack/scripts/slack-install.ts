import { createInterface } from "node:readline/promises"
import { parseArgs } from "node:util"
import { installSlackIntegrationUseCase } from "@domain/integrations"
import { OrganizationId, UserId } from "@domain/shared"
import { SEED_ORG_ID, SEED_OWNER_USER_ID } from "@domain/shared/seeding"
import {
  closePostgres,
  createPostgresClient,
  findActiveSlackIntegrationByTeamIdAcrossOrgs,
  SlackIntegrationRepositoryLive,
  SqlClientLive,
  softRevokeSlackIntegrationAcrossOrgs,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { buildSlackAuthorizeUrl, exchangeOAuthCode, loadSlackConfig } from "../src/index.ts"

const DEFAULT_REDIRECT_URI = "http://localhost:3000/integrations/slack/oauth/callback"

const USAGE = `
Usage: pnpm --filter @platform/slack slack:install [options]

Drives the Phase 1 OAuth exchange interactively:

  1. Prints the Slack authorize URL.
  2. Waits for you to paste the URL Slack redirects you to after
     approving (or just the \`code\` query value).
  3. Exchanges the code, resolves any cross-org conflict, and persists
     an encrypted slack_integrations row.

If \`--code\` is passed, the prompt is skipped — useful for scripted
runs. \`--force\` soft-revokes a conflicting active install in another
Latitude organization before retrying. The redirect URI must match the
one configured on the Slack app — the default mirrors the value baked
into the manifest.

Options:
  --code <code>             Skip the prompt and use this code directly
  --organization-id <id>    Target Latitude organization (default: SEED_ORG_ID — Acme)
  --user-id <id>            User credited as the installer (default: SEED_OWNER_USER_ID)
  --redirect-uri <url>      Override the OAuth redirect URI
  --force                   Soft-revoke a conflicting active install first
  --help                    Show this help
`.trim()

// `loadDevelopmentEnvironments` walks `../../../.env.${NODE_ENV}` from the
// anchor URL's directory. Our actual script sits at `slack/scripts/`, which
// is one level too deep — anchoring at the package's `package.json`
// (directory `slack/`) puts the resolved root at the monorepo root.
loadDevelopmentEnvironments(new URL("../package.json", import.meta.url).href)

interface ParsedArgs {
  readonly code: string | undefined
  readonly organizationId: string
  readonly userId: string
  readonly redirectUri: string
  readonly force: boolean
  readonly help: boolean
}

const parseCliArgs = (): ParsedArgs => {
  const parsed = parseArgs({
    options: {
      code: { type: "string" },
      "organization-id": { type: "string" },
      "user-id": { type: "string" },
      "redirect-uri": { type: "string" },
      force: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  })

  return {
    code: parsed.values.code,
    organizationId: parsed.values["organization-id"] ?? SEED_ORG_ID,
    userId: parsed.values["user-id"] ?? SEED_OWNER_USER_ID,
    redirectUri: parsed.values["redirect-uri"] ?? DEFAULT_REDIRECT_URI,
    force: parsed.values.force === true,
    help: parsed.values.help === true,
  }
}

/**
 * Accepts either the full redirect URL Slack sent the browser to or the
 * bare `code` value. URL form is the common case — what shows in the
 * 404'd browser tab — but a raw paste also works for the user who
 * already extracted the param.
 */
const extractCode = (input: string): string | null => {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  try {
    const url = new URL(trimmed)
    const codeParam = url.searchParams.get("code")
    if (codeParam) return codeParam
  } catch {
    // Not a URL — fall through and treat the whole string as the code.
  }
  return trimmed
}

const promptForCode = async (): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question("\nPaste the URL Slack redirected you to (or just the code): ")
    const code = extractCode(answer)
    if (!code) throw new Error("No code provided")
    return code
  } finally {
    rl.close()
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs()

  if (args.help) {
    console.log(USAGE)
    return
  }

  const config = await Effect.runPromise(loadSlackConfig)
  if (!config) {
    console.error(
      "Slack is not configured: set LAT_SLACK_CLIENT_ID, LAT_SLACK_CLIENT_SECRET, LAT_SLACK_SIGNING_SECRET.",
    )
    process.exit(1)
  }

  // Resolve the OAuth code: either from --code (scripted) or via the
  // interactive prompt (the default dev flow). The Phase 2 web route will
  // be the production replacement.
  let code = args.code
  if (!code) {
    // CLI-only state token. The Phase 2 web flow will write a CSRF-bound
    // state into Redis with the org + user; here we just include enough
    // context for a developer to recognise the redirect.
    const state = `cli:${args.organizationId}:${Date.now()}`
    const url = await Effect.runPromise(
      buildSlackAuthorizeUrl({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: args.redirectUri,
        state,
      }),
    )
    console.log("\nOpen this URL in your browser to approve the install:\n")
    console.log(url)
    console.log("\nSlack will redirect to your callback URL — that page will 404 (no route exists yet),")
    console.log("but the `code` is in the URL bar. Paste the whole URL below.")
    code = await promptForCode()
  }

  // Phase 1 CLI uses the admin URL so cross-org lookups and the
  // org-scoped install run on a single connection. With RLS not forced,
  // the per-org repository queries still filter by organization_id in
  // their WHERE clauses; the admin role just lets us reach across orgs
  // for the conflict-resolution path.
  const adminUrl = await Effect.runPromise(parseEnv("LAT_ADMIN_DATABASE_URL", "string"))
  const pgClient = createPostgresClient({ databaseUrl: adminUrl })

  try {
    console.log(`\nExchanging OAuth code with Slack…`)
    const oauth = await Effect.runPromise(
      exchangeOAuthCode({
        code,
        redirectUri: args.redirectUri,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      }),
    )

    console.log(`  workspace:   ${oauth.teamName} (${oauth.teamId})`)
    console.log(`  bot user id: ${oauth.botUserId}`)
    console.log(`  scopes:      ${oauth.botTokenScopes}`)

    const conflict = await Effect.runPromise(findActiveSlackIntegrationByTeamIdAcrossOrgs(pgClient.db, oauth.teamId))
    if (conflict && conflict.organizationId !== args.organizationId) {
      if (!args.force) {
        // Throw rather than `process.exit(1)` so the outer `finally`
        // closes the Postgres pool. `main().catch` maps the throw to
        // exit code 1.
        throw new Error(
          `Workspace ${oauth.teamId} is already linked to organization ${conflict.organizationId}. ` +
            `Re-run with --force to soft-revoke that install before continuing.`,
        )
      }
      console.log(
        `Force flag set — soft-revoking conflicting install ${conflict.id} in org ${conflict.organizationId}…`,
      )
      const revoked = await Effect.runPromise(
        softRevokeSlackIntegrationAcrossOrgs(pgClient.db, conflict.id, new Date()),
      )
      if (!revoked) {
        console.warn(`  (no row was revoked — it may have been cleared concurrently)`)
      }
    }

    const orgId = OrganizationId(args.organizationId)
    const installedByUserId = UserId(args.userId)

    const integration = await Effect.runPromise(
      installSlackIntegrationUseCase({
        organizationId: orgId,
        teamId: oauth.teamId,
        teamName: oauth.teamName,
        appId: oauth.appId,
        botUserId: oauth.botUserId,
        botAccessToken: oauth.botAccessToken,
        botTokenScopes: oauth.botTokenScopes,
        refreshToken: oauth.refreshToken ?? null,
        tokenExpiresAt: oauth.expiresIn ? new Date(Date.now() + oauth.expiresIn * 1000) : null,
        installedByUserId,
      }).pipe(Effect.provide(SlackIntegrationRepositoryLive), Effect.provide(SqlClientLive(pgClient, orgId))),
    )

    console.log(`\n✓ Installed Latitude in workspace ${integration.teamName} (${integration.teamId})`)
    console.log(`  integration id:      ${integration.id}`)
    console.log(`  organization:        ${integration.organizationId}`)
    console.log(`  installed by user:   ${integration.installedByUserId}`)
    console.log(`  token (encrypted):   stored, AES-256-GCM via LAT_MASTER_ENCRYPTION_KEY`)
  } finally {
    await closePostgres(pgClient.pool)
  }
}

main().catch((error) => {
  console.error("\nslack:install failed:")
  console.error(error)
  process.exit(1)
})
