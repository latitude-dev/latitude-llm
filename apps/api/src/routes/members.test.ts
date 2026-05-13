import { generateId } from "@domain/shared"
import { invitations as invitationsTable, members, users } from "@platform/db-postgres/schema/better-auth"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createOAuthAuthHeaders,
  createOAuthTenantSetup,
  createTenantSetup,
  setupTestApi,
} from "../test-utils/create-test-app.ts"

const seedExtraMember = async (
  database: InMemoryPostgres,
  organizationId: string,
  options: { role?: "member" | "admin" | "owner"; email?: string; name?: string | null } = {},
) => {
  const userId = generateId()
  const memberId = generateId()
  const email = options.email ?? `${userId}@example.com`

  await database.db.insert(users).values({
    id: userId,
    email,
    name: options.name ?? "Extra User",
    emailVerified: true,
    role: "user",
  })

  await database.db.insert(members).values({
    id: memberId,
    organizationId,
    userId,
    role: options.role ?? "member",
  })

  return { userId, memberId, email }
}

const seedPendingInvitation = async (
  database: InMemoryPostgres,
  organizationId: string,
  inviterUserId: string,
  options: {
    email?: string
    role?: "admin" | "member"
    status?: "pending" | "accepted" | "rejected" | "canceled"
  } = {},
) => {
  const invitationId = generateId()
  const email = options.email ?? `pending-${invitationId}@example.com`
  const fortyEightHours = 48 * 60 * 60 * 1000

  await database.db.insert(invitationsTable).values({
    id: invitationId,
    organizationId,
    email,
    role: options.role ?? "member",
    status: options.status ?? "pending",
    expiresAt: new Date(Date.now() + fortyEightHours),
    inviterId: inviterUserId,
  })

  return { invitationId, email }
}

interface MemberRow {
  readonly id: string
  readonly status: "active" | "invited"
  readonly userId: string | null
  readonly email: string
  readonly role: string | null
  readonly organizationId: string
}

const listMembersJson = async (
  app: ApiTestContext["app"],
  headers: Record<string, string>,
): Promise<ReadonlyArray<MemberRow>> => {
  const res = await app.fetch(new Request("http://localhost/v1/members", { headers }))
  expect(res.status).toBe(200)
  return ((await res.json()) as { members: ReadonlyArray<MemberRow> }).members
}

describe("Members routes — reads", () => {
  setupTestApi()

  it<ApiTestContext>("returns 401 without a bearer token", async ({ app }) => {
    const response = await app.fetch(new Request("http://localhost/v1/members"))
    expect(response.status).toBe(401)
  })

  it<ApiTestContext>("GET /v1/members lists active members + pending invitations together", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const extra = await seedExtraMember(database, tenant.organizationId, { role: "admin", email: "extra@example.com" })
    const pending = await seedPendingInvitation(database, tenant.organizationId, tenant.userId, {
      email: "pending@example.com",
    })

    const rows = await listMembersJson(app, createApiKeyAuthHeaders(tenant.apiKeyToken))

    expect(rows).toHaveLength(3)
    const active = rows.filter((r) => r.status === "active")
    const invited = rows.filter((r) => r.status === "invited")
    expect(active.map((m) => m.userId)).toContain(tenant.userId)
    expect(active.map((m) => m.userId)).toContain(extra.userId)
    expect(invited.map((m) => m.id)).toContain(pending.invitationId)
    expect(invited.find((m) => m.id === pending.invitationId)?.userId).toBeNull()
    expect(invited.find((m) => m.id === pending.invitationId)?.email).toBe("pending@example.com")
  })

  it<ApiTestContext>("filters out pending invitations whose email already belongs to an active member", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    await seedExtraMember(database, tenant.organizationId, { email: "alice@example.com" })
    // Pending invite for an email that's already a member — must be hidden.
    await seedPendingInvitation(database, tenant.organizationId, tenant.userId, { email: "alice@example.com" })
    // A second pending for a different email — must appear.
    const trueInvite = await seedPendingInvitation(database, tenant.organizationId, tenant.userId, {
      email: "bob@example.com",
    })

    const rows = await listMembersJson(app, createApiKeyAuthHeaders(tenant.apiKeyToken))

    const invited = rows.filter((r) => r.status === "invited")
    expect(invited.map((r) => r.email)).toEqual(["bob@example.com"])
    expect(invited.map((r) => r.id)).toEqual([trueInvite.invitationId])
  })

  it<ApiTestContext>("GET /v1/members is org-scoped (cross-tenant isolation)", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    await seedExtraMember(database, tenantB.organizationId, { email: "leak@example.com" })
    await seedPendingInvitation(database, tenantB.organizationId, tenantB.userId, { email: "invited-leak@example.com" })

    const rows = await listMembersJson(app, createApiKeyAuthHeaders(tenantA.apiKeyToken))

    expect(rows.map((r) => r.email)).not.toContain("leak@example.com")
    expect(rows.map((r) => r.email)).not.toContain("invited-leak@example.com")
  })

  it<ApiTestContext>("GET /v1/members/:id returns the active member by membership id", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const extra = await seedExtraMember(database, tenant.organizationId, {
      role: "admin",
      email: "the-one@example.com",
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/members/${extra.memberId}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { id: string; status: string; userId: string; email: string; role: string }
    expect(body.id).toBe(extra.memberId)
    expect(body.status).toBe("active")
    expect(body.userId).toBe(extra.userId)
    expect(body.email).toBe("the-one@example.com")
    expect(body.role).toBe("admin")
  })

  it<ApiTestContext>("GET /v1/members/:id is org-scoped (404 across tenants)", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    const inTenantB = await seedExtraMember(database, tenantB.organizationId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/members/${inTenantB.memberId}`, {
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(404)
  })
})

describe("Members routes — mutations require OAuth", () => {
  setupTestApi()

  it<ApiTestContext>("POST /v1/members refuses API-key callers (403)", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)

    const response = await app.fetch(
      new Request("http://localhost/v1/members", {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ email: "denied@example.com" }),
      }),
    )

    expect(response.status).toBe(403)
  })

  it<ApiTestContext>("PATCH /v1/members/:id refuses API-key callers (403)", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const target = await seedExtraMember(database, tenant.organizationId, { role: "member" })

    const response = await app.fetch(
      new Request(`http://localhost/v1/members/${target.memberId}`, {
        method: "PATCH",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      }),
    )

    expect(response.status).toBe(403)
  })

  it<ApiTestContext>("DELETE /v1/members/:id refuses API-key callers (403)", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const target = await seedExtraMember(database, tenant.organizationId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/members/${target.memberId}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(403)
  })
})

describe("Members routes — OAuth mutations happy path", () => {
  setupTestApi()

  it<ApiTestContext>("POST /v1/members creates a pending invitation and lists it under `invited`", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)

    const response = await app.fetch(
      new Request("http://localhost/v1/members", {
        method: "POST",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ email: "newbie@example.com" }),
      }),
    )

    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      id: string
      status: string
      organizationId: string
      email: string
      role: string | null
    }
    expect(body.status).toBe("invited")
    expect(body.email).toBe("newbie@example.com")
    expect(body.role).toBe("member")
    expect(body.organizationId).toBe(tenant.organizationId)

    // Shows up in the list as an invited row.
    const rows = await listMembersJson(app, createOAuthAuthHeaders(tenant.oauthAccessToken))
    expect(rows.find((r) => r.id === body.id && r.status === "invited")).toBeDefined()
  })

  it<ApiTestContext>("PATCH /v1/members/:id promotes a member to admin", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const target = await seedExtraMember(database, tenant.organizationId, { role: "member" })

    const response = await app.fetch(
      new Request(`http://localhost/v1/members/${target.memberId}`, {
        method: "PATCH",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { id: string; status: string; role: string }
    expect(body.id).toBe(target.memberId)
    expect(body.status).toBe("active")
    expect(body.role).toBe("admin")
  })

  it<ApiTestContext>("DELETE /v1/members/:id removes a member", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const target = await seedExtraMember(database, tenant.organizationId)

    const before = await listMembersJson(app, createOAuthAuthHeaders(tenant.oauthAccessToken))
    expect(before.find((m) => m.id === target.memberId)).toBeDefined()

    const response = await app.fetch(
      new Request(`http://localhost/v1/members/${target.memberId}`, {
        method: "DELETE",
        headers: createOAuthAuthHeaders(tenant.oauthAccessToken),
      }),
    )
    expect(response.status).toBe(204)

    const after = await listMembersJson(app, createOAuthAuthHeaders(tenant.oauthAccessToken))
    expect(after.find((m) => m.id === target.memberId)).toBeUndefined()
  })

  it<ApiTestContext>("DELETE /v1/members/:id rejects removing the owner (4xx)", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    // Caller is an admin; seed a separate owner so caller isn't blocked by self-removal.
    await seedExtraMember(database, tenant.organizationId, { role: "admin" })
    const owner = await seedExtraMember(database, tenant.organizationId, { role: "owner" })

    const response = await app.fetch(
      new Request(`http://localhost/v1/members/${owner.memberId}`, {
        method: "DELETE",
        headers: createOAuthAuthHeaders(tenant.oauthAccessToken),
      }),
    )
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)

    const after = await listMembersJson(app, createOAuthAuthHeaders(tenant.oauthAccessToken))
    expect(after.find((m) => m.id === owner.memberId)).toBeDefined()
  })

  it<ApiTestContext>("PATCH /v1/members/:id rejects changing the owner's role (4xx)", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const owner = await seedExtraMember(database, tenant.organizationId, { role: "owner" })

    const response = await app.fetch(
      new Request(`http://localhost/v1/members/${owner.memberId}`, {
        method: "PATCH",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      }),
    )
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
  })

  it<ApiTestContext>("DELETE /v1/members/:id rejects self-removal (4xx)", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const all = await listMembersJson(app, createOAuthAuthHeaders(tenant.oauthAccessToken))
    const ownMembership = all.find((m) => m.status === "active" && m.userId === tenant.userId)
    expect(ownMembership).toBeDefined()

    const response = await app.fetch(
      new Request(`http://localhost/v1/members/${ownMembership?.id}`, {
        method: "DELETE",
        headers: createOAuthAuthHeaders(tenant.oauthAccessToken),
      }),
    )
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
  })
})
