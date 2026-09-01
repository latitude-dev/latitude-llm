import { randomUUID } from "node:crypto"
import { buildPartnerStringToSign, PARTNER_SCOPES, type PartnerScope } from "@domain/partners"
import { generateId } from "@domain/shared"
import { eq } from "@platform/db-postgres"
import {
  members,
  oauthAccessTokens,
  oauthApplications,
  organizations,
  users,
} from "@platform/db-postgres/schema/better-auth"
import { partners } from "@platform/db-postgres/schema/partners"
import type { InMemoryPostgres } from "@platform/testkit"
import { encrypt, hash, hmacSha256Hex } from "@repo/utils"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { type ApiTestContext, setupTestApi, TEST_ENCRYPTION_KEY } from "../test-utils/create-test-app.ts"

const PARTNER_SECRET = "0".repeat(64)

interface SeededPartner {
  readonly id: string
  readonly secret: string
}

const seedPartner = async (
  database: InMemoryPostgres,
  overrides: {
    readonly secret?: string
    readonly scopes?: readonly PartnerScope[]
    readonly allowedIps?: readonly string[]
    readonly enabled?: boolean
    readonly deletedAt?: Date | null
  } = {},
): Promise<SeededPartner> => {
  const id = generateId()
  const secret = overrides.secret ?? PARTNER_SECRET
  await database.db.insert(partners).values({
    id,
    name: "Longitude",
    iconUrl: "https://longitude.example/icon.png",
    redirectUrls: ["https://longitude.example/oauth/callback"],
    hmacSecret: await Effect.runPromise(encrypt(secret, TEST_ENCRYPTION_KEY)),
    scopes: overrides.scopes ?? PARTNER_SCOPES,
    allowedIps: overrides.allowedIps ?? [],
    enabled: overrides.enabled ?? true,
    deletedAt: overrides.deletedAt ?? null,
  })
  return { id, secret }
}

/** Mirrors the quota `registerPartnerRoutes` declares for the provisioning route. */
const PARTNER_PROVISION_RATE_LIMIT = 100

/** Unsigned, so it is refused at authentication — before either rate limiter runs. */
const unsignedRequest = (partner: SeededPartner): Request =>
  new Request(`http://localhost/v1/private/partners/${partner.id}/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Partner-Timestamp": String(Math.floor(Date.now() / 1000)),
      "X-Partner-Signature": `v1=${"0".repeat(64)}`,
      "X-Partner-Nonce": `unsigned-${randomUUID()}`,
    },
    body: JSON.stringify({ user: { email: "rejected@longitude.example" } }),
  })

const provisionRequest = async (
  partner: SeededPartner,
  overrides: {
    readonly body?: unknown
    readonly rawBody?: string
    readonly signWith?: string
    readonly timestamp?: number
    readonly signedPath?: string
    readonly path?: string
    readonly omitSignature?: boolean
    readonly omitTimestamp?: boolean
    readonly nonce?: string
    readonly omitNonce?: boolean
    readonly forwardedFor?: string
  } = {},
): Promise<Request> => {
  const body =
    overrides.rawBody ??
    JSON.stringify(
      overrides.body ?? { user: { email: "founder@longitude.example" }, organization: { name: "Courtesy" } },
    )
  const path = overrides.path ?? `/v1/private/partners/${partner.id}/accounts`
  const timestamp = String(overrides.timestamp ?? Math.floor(Date.now() / 1000))
  // Unique per request by default: the nonce is single-use, so a shared one would make
  // every test after the first in a file fail as a replay.
  const nonce = overrides.nonce ?? `test-${randomUUID()}`
  const signature = await Effect.runPromise(
    hmacSha256Hex(
      overrides.signWith ?? partner.secret,
      buildPartnerStringToSign({
        timestamp,
        method: "POST",
        pathname: overrides.signedPath ?? path,
        nonce,
        bodyHash: await Effect.runPromise(hash(body)),
      }),
    ),
  )

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (!overrides.omitTimestamp) headers["X-Partner-Timestamp"] = timestamp
  if (!overrides.omitSignature) headers["X-Partner-Signature"] = `v1=${signature}`
  if (!overrides.omitNonce) headers["X-Partner-Nonce"] = nonce
  if (overrides.forwardedFor) headers["X-Forwarded-For"] = overrides.forwardedFor

  return new Request(`http://localhost${path}`, { method: "POST", headers, body })
}

interface ProvisionResponseBody {
  readonly access_token: string
  readonly refresh_token: string
  readonly token_type: string
  readonly expires_in: number
  readonly scope: string
  readonly client_id: string
  readonly organization_id: string
  readonly organization_slug: string
  readonly user_id: string
}

describe("Private partner API — account provisioning", () => {
  setupTestApi()

  beforeEach<ApiTestContext>(async ({ database, redis }) => {
    await database.db.delete(partners)
    await database.db.delete(oauthAccessTokens)
    await database.db.delete(oauthApplications)
    await database.db.delete(members)
    await database.db.delete(users)
    await database.db.delete(organizations)
    await redis.flushall?.()
  })

  it<ApiTestContext>("provisions a user, organization and OAuth grant, returning an OAuth-shaped token payload", async ({
    app,
    database,
  }) => {
    const partner = await seedPartner(database)

    const response = await app.fetch(
      await provisionRequest(partner, {
        body: { user: { email: "Founder@Longitude.Example", name: "Alex" }, organization: { name: "Courtesy" } },
      }),
    )

    expect(response.status).toBe(201)
    const body = (await response.json()) as ProvisionResponseBody
    expect(body).toMatchObject({
      token_type: "bearer",
      expires_in: 3600,
      scope: "openid offline_access",
      organization_slug: "courtesy",
    })
    expect(body.access_token).toMatch(/^[a-zA-Z]{32}$/)
    expect(body.refresh_token).toMatch(/^[a-zA-Z]{32}$/)

    const [user] = await database.db.select().from(users).where(eq(users.id, body.user_id))
    expect(user).toMatchObject({ email: "founder@longitude.example", name: "Alex", emailVerified: false })

    const [membership] = await database.db.select().from(members).where(eq(members.userId, body.user_id))
    expect(membership).toMatchObject({ organizationId: body.organization_id, role: "owner" })

    const [organization] = await database.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.organization_id))
    expect(organization?.expiresAt).toBeNull()

    const [application] = await database.db
      .select()
      .from(oauthApplications)
      .where(eq(oauthApplications.clientId, body.client_id))
    expect(application).toMatchObject({
      name: "Longitude",
      type: "public",
      clientSecret: "",
      redirectUrls: "https://longitude.example/oauth/callback",
      disabled: false,
      organizationId: body.organization_id,
    })
    expect(JSON.parse(application?.metadata ?? "{}")).toMatchObject({ partnerId: partner.id, provisioned: true })
  })

  it<ApiTestContext>("stores the profile fields the onboarding form would have collected", async ({
    app,
    database,
  }) => {
    const partner = await seedPartner(database)

    const response = await app.fetch(
      await provisionRequest(partner, {
        body: {
          user: {
            email: "founder@longitude.example",
            name: "Ada",
            image: "https://longitude.example/ada.png",
            phone: "+15550100",
            job: "Founder",
          },
          organization: { name: "Courtesy" },
        },
      }),
    )

    expect(response.status).toBe(201)
    const { user_id } = (await response.json()) as ProvisionResponseBody
    const [user] = await database.db.select().from(users).where(eq(users.id, user_id))
    expect(user).toMatchObject({
      name: "Ada",
      image: "https://longitude.example/ada.png",
      phoneNumber: "+15550100",
      jobTitle: "Founder",
      // The partner is the acquisition source; onboarding will never ask this user.
      heardAboutUs: "Longitude",
    })
  })

  it<ApiTestContext>("derives the user and organization names when only an email is given", async ({
    app,
    database,
  }) => {
    const partner = await seedPartner(database)

    const response = await app.fetch(
      await provisionRequest(partner, { body: { user: { email: "ada.lovelace@longitude.example" } } }),
    )

    expect(response.status).toBe(201)
    const body = (await response.json()) as ProvisionResponseBody
    expect(body.organization_slug).toBe("ada-lovelace-s-organization")

    const [user] = await database.db.select().from(users).where(eq(users.id, body.user_id))
    expect(user?.name).toBe("Ada Lovelace")
  })

  it<ApiTestContext>("rejects profile fields that are malformed", async ({ app, database }) => {
    const partner = await seedPartner(database)

    const cases = [
      { user: { email: "founder@longitude.example", image: "javascript:alert(1)" } },
      { user: { email: "founder@longitude.example", phone: "555-0100" } },
      { user: {} },
      { organization: { name: "Courtesy" } },
    ]

    for (const body of cases) {
      const response = await app.fetch(await provisionRequest(partner, { body }))
      expect(response.status, JSON.stringify(body)).toBe(400)
    }
  })

  it<ApiTestContext>("returns a token that authenticates against a protected route", async ({ app, database }) => {
    const partner = await seedPartner(database)

    const provisioned = await app.fetch(await provisionRequest(partner))
    const { access_token } = (await provisioned.json()) as ProvisionResponseBody

    const response = await app.fetch(
      new Request("http://localhost/v1/projects", { headers: { Authorization: `Bearer ${access_token}` } }),
    )

    expect(response.status).toBe(200)
  })

  it<ApiTestContext>("returns 409 when the email already belongs to a Latitude user", async ({ app, database }) => {
    const partner = await seedPartner(database)
    await database.db.insert(users).values({
      id: generateId(),
      email: "founder@longitude.example",
      name: "Existing",
      emailVerified: true,
    })

    const response = await app.fetch(await provisionRequest(partner))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "account_already_exists" })
  })

  it<ApiTestContext>("returns a uniform 401 for every pre-scope refusal", async ({ app, database }) => {
    const partner = await seedPartner(database)
    const disabled = await seedPartner(database, { enabled: false })
    const deleted = await seedPartner(database, { deletedAt: new Date() })
    const unknown = { id: generateId(), secret: PARTNER_SECRET }
    const staleTimestamp = Math.floor(Date.now() / 1000) - 301

    const requests = {
      "unknown partner": await provisionRequest(unknown),
      "malformed partner id": await provisionRequest({ id: "not-a-cuid", secret: PARTNER_SECRET }),
      "disabled partner": await provisionRequest(disabled),
      "soft-deleted partner": await provisionRequest(deleted),
      "wrong secret": await provisionRequest(partner, { signWith: "f".repeat(64) }),
      "stale timestamp": await provisionRequest(partner, { timestamp: staleTimestamp }),
      "missing signature": await provisionRequest(partner, { omitSignature: true }),
      "missing timestamp": await provisionRequest(partner, { omitTimestamp: true }),
      "signature over a different path": await provisionRequest(partner, {
        signedPath: "/v1/private/partners/other/accounts",
      }),
    }

    for (const [label, request] of Object.entries(requests)) {
      const response = await app.fetch(request)
      expect(response.status, label).toBe(401)
      expect(await response.json(), label).toEqual({ error: "unauthorized" })
    }
  })

  it<ApiTestContext>("rejects a body tampered with after signing", async ({ app, database }) => {
    const partner = await seedPartner(database)
    const request = await provisionRequest(partner)

    const tampered = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ user: { email: "attacker@longitude.example" }, organization: { name: "Courtesy" } }),
    })

    const response = await app.fetch(tampered)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
  })

  it<ApiTestContext>("accepts any source IP when the partner has no allowlist", async ({ app, database }) => {
    const partner = await seedPartner(database)

    const response = await app.fetch(await provisionRequest(partner, { forwardedFor: "198.51.100.4" }))

    expect(response.status).toBe(201)
  })

  it<ApiTestContext>("does not let a caller name its own address in X-Forwarded-For", async ({ app, database }) => {
    const partner = await seedPartner(database, { allowedIps: ["203.0.113.0/24"] })

    // `X-Forwarded-For` is append-only: everything left of the final entry came from the
    // caller. Trusting the first hop would make the allowlist a formality.
    const spoofed = await app.fetch(await provisionRequest(partner, { forwardedFor: "203.0.113.7, 198.51.100.4" }))

    expect(spoofed.status).toBe(401)
    expect(await spoofed.json()).toEqual({ error: "unauthorized" })
  })

  it<ApiTestContext>("enforces a partner's IP allowlist, with the same uniform 401", async ({ app, database }) => {
    const partner = await seedPartner(database, { allowedIps: ["203.0.113.0/24"] })

    // The address our own proxy appended is the last hop, so that is the one checked.
    const allowed = await app.fetch(
      await provisionRequest(partner, {
        forwardedFor: "10.0.0.1, 203.0.113.7",
        body: { user: { email: "allowed@longitude.example" }, organization: { name: "Allowed" } },
      }),
    )
    expect(allowed.status).toBe(201)

    for (const forwardedFor of ["198.51.100.4", "203.0.114.7"]) {
      const refused = await app.fetch(
        await provisionRequest(partner, {
          forwardedFor,
          body: { user: { email: `blocked-${forwardedFor}@longitude.example` }, organization: { name: "Blocked" } },
        }),
      )
      expect(refused.status, forwardedFor).toBe(401)
      expect(await refused.json(), forwardedFor).toEqual({ error: "unauthorized" })
    }

    // No `X-Forwarded-For` at all is a refusal too — an unidentifiable caller isn't waved through.
    const unidentified = await app.fetch(
      await provisionRequest(partner, {
        body: { user: { email: "none@longitude.example" }, organization: { name: "None" } },
      }),
    )
    expect(unidentified.status).toBe(401)
  })

  it<ApiTestContext>("returns 403 when the partner lacks the required scope", async ({ app, database }) => {
    const partner = await seedPartner(database, { scopes: [] })

    const response = await app.fetch(await provisionRequest(partner))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "insufficient_scope" })
  })

  it<ApiTestContext>("returns 400 for an invalid body, but only after authentication", async ({ app, database }) => {
    const partner = await seedPartner(database)

    const invalidEmail = await app.fetch(
      await provisionRequest(partner, { body: { user: { email: "nope" }, organization: { name: "Courtesy" } } }),
    )
    expect(invalidEmail.status).toBe(400)
    expect((await invalidEmail.json()) as { error: string }).toMatchObject({ error: "invalid_request" })

    const notJson = await app.fetch(await provisionRequest(partner, { rawBody: "{not json" }))
    expect(notJson.status).toBe(400)

    // The same invalid body without a signature must still read as 401, not 400.
    const unauthenticated = await app.fetch(
      await provisionRequest(partner, { body: { user: { email: "nope" } }, omitSignature: true }),
    )
    expect(unauthenticated.status).toBe(401)
  })

  it<ApiTestContext>("requires a nonce and rejects a replay of the same signed request", async ({ app, database }) => {
    const partner = await seedPartner(database)
    const nonce = "replay-me-0001"

    const first = await app.fetch(await provisionRequest(partner, { nonce }))
    expect(first.status).toBe(201)

    // Byte-identical retry: same nonce, same signature. The replay store is what stops it.
    const replayed = await app.fetch(await provisionRequest(partner, { nonce }))
    expect(replayed.status).toBe(401)
    expect(await replayed.json()).toEqual({ error: "unauthorized" })

    const missingNonce = await app.fetch(
      await provisionRequest(partner, {
        omitNonce: true,
        body: { user: { email: "second@longitude.example" }, organization: { name: "Second" } },
      }),
    )
    expect(missingNonce.status).toBe(401)

    const freshNonce = await app.fetch(
      await provisionRequest(partner, {
        nonce: "fresh-nonce-0002",
        body: { user: { email: "third@longitude.example" }, organization: { name: "Third" } },
      }),
    )
    expect(freshNonce.status).toBe(201)
  })

  it<ApiTestContext>("does not let an unauthenticated caller burn a nonce a real request needs", async ({
    app,
    database,
  }) => {
    const partner = await seedPartner(database)
    const nonce = "predictable-nonce-1"

    // Signed with the wrong secret: refused, and must not have reserved the nonce on the way out.
    const forged = await app.fetch(await provisionRequest(partner, { nonce, signWith: "f".repeat(64) }))
    expect(forged.status).toBe(401)

    const genuine = await app.fetch(await provisionRequest(partner, { nonce }))
    expect(genuine.status).toBe(201)
  })

  it<ApiTestContext>("rate-limits per partner, leaving other partners unaffected", async ({ app, database }) => {
    const partner = await seedPartner(database)
    const other = await seedPartner(database)

    // The per-partner bucket sits behind authentication, so quota is only spent by requests
    // that proved who they are. Exhaust it with correctly signed requests carrying a body the
    // route rejects, which is far cheaper than 100 real provisions.
    const spent = await Promise.all(
      Array.from({ length: PARTNER_PROVISION_RATE_LIMIT }, (_, index) =>
        provisionRequest(partner, { body: { user: { email: `not-an-email-${index}` } } }).then((request) =>
          app.fetch(request),
        ),
      ),
    )
    expect(new Set(spent.map((response) => response.status))).toEqual(new Set([400]))

    const overLimit = await app.fetch(
      await provisionRequest(partner, {
        body: { user: { email: "over@longitude.example" }, organization: { name: "Over" } },
      }),
    )
    expect(overLimit.status).toBe(429)
    expect(overLimit.headers.get("Retry-After")).toBeTruthy()

    const otherResponse = await app.fetch(
      await provisionRequest(other, {
        body: { user: { email: "other@longitude.example" }, organization: { name: "Other" } },
      }),
    )
    expect(otherResponse.status).toBe(201)
  })

  it<ApiTestContext>("does not let unauthenticated traffic spend a partner's quota", async ({ app, database }) => {
    const partner = await seedPartner(database)

    // Anyone can put any partner id in the path. If either bucket were charged before the
    // signature check, this loop alone would 429 the partner out of its own quota.
    const refused = await Promise.all(
      Array.from({ length: PARTNER_PROVISION_RATE_LIMIT }, () => app.fetch(unsignedRequest(partner))),
    )
    expect(new Set(refused.map((response) => response.status))).toEqual(new Set([401]))

    const genuine = await app.fetch(await provisionRequest(partner))
    expect(genuine.status).toBe(201)
  })

  // Emitted the same way `scripts/emit-openapi.ts` does, so this is the exact document Fern reads.
  it<ApiTestContext>("stays out of the generated OpenAPI document", ({ app }) => {
    const document = app.getOpenAPI31Document({ openapi: "3.1.0", info: { title: "test", version: "0" } })

    const paths = Object.keys(document.paths ?? {})
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.filter((path) => path.includes("private") || path.includes("partner"))).toEqual([])
  })
})
