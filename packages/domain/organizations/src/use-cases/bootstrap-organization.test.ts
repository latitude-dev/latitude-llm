import { ApiKeyRepository, DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import { createFakeApiKeyRepository } from "@domain/api-keys/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { ProjectRepository } from "@domain/projects"
import { createFakeProjectRepository } from "@domain/projects/testing"
import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { hash } from "@repo/utils"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { OrganizationClaimRepository } from "../ports/organization-claim-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { createFakeOrganizationClaimRepository } from "../testing/fake-organization-claim-repository.ts"
import { createFakeOrganizationRepository } from "../testing/fake-organization-repository.ts"
import {
  bootstrapOrganizationUseCase,
  DEFAULT_TEMPORARY_ORGANIZATION_NAME,
  DEFAULT_TEMPORARY_PROJECT_NAME,
  TEMPORARY_ACCOUNT_TTL_MS,
} from "./bootstrap-organization.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const WEB_URL = "https://app.latitude.so"

const setup = () => {
  let transactionCalls = 0
  let inTransaction = false
  const writtenEvents: OutboxWriteEvent[] = []

  const sqlClient: SqlClientShape = {
    organizationId: ORG_ID,
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      inTransaction
        ? effect
        : Effect.gen(function* () {
            transactionCalls += 1
            inTransaction = true
            try {
              return yield* effect
            } finally {
              inTransaction = false
            }
          }),
    query: () => Effect.die(new Error("unexpected query")),
  }

  const { repository: apiKeyRepo, apiKeys } = createFakeApiKeyRepository()
  const { repository: projectRepo, rows: projects } = createFakeProjectRepository()
  const { repository: organizationRepo, organizations } = createFakeOrganizationRepository()
  const { repository: claimRepo, claims } = createFakeOrganizationClaimRepository()

  const run = (input: Parameters<typeof bootstrapOrganizationUseCase>[0]) =>
    Effect.runPromise(
      bootstrapOrganizationUseCase(input).pipe(
        Effect.provideService(SqlClient, sqlClient),
        Effect.provideService(OutboxEventWriter, {
          write: (event: OutboxWriteEvent) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provideService(ApiKeyRepository, apiKeyRepo),
        Effect.provideService(ProjectRepository, projectRepo),
        Effect.provideService(OrganizationRepository, organizationRepo),
        Effect.provideService(OrganizationClaimRepository, claimRepo),
      ),
    )

  return { run, get: () => ({ transactionCalls, writtenEvents, apiKeys, projects, organizations, claims }) }
}

describe("bootstrapOrganizationUseCase", () => {
  it("provisions an owner-less org, one API key, one named project, and a claim in a single transaction", async () => {
    const { run, get } = setup()

    const result = await run({
      organizationId: ORG_ID,
      organizationName: "Acme",
      projectName: "Checkout Bot",
      userEmail: "founder@acme.com",
      webUrl: WEB_URL,
    })

    const { transactionCalls, writtenEvents, apiKeys, projects, organizations, claims } = get()

    expect(transactionCalls).toBe(1)

    const savedOrgs = [...organizations.values()]
    expect(savedOrgs).toHaveLength(1)
    expect(savedOrgs[0]).toMatchObject({ id: ORG_ID, name: "Acme", slug: "acme" })
    expect(savedOrgs[0]?.expiresAt).toEqual(result.claimExpiresAt)

    const savedProjects = [...projects.values()]
    expect(savedProjects).toHaveLength(1)
    expect(savedProjects[0]).toMatchObject({ name: "Checkout Bot", slug: "checkout-bot", organizationId: ORG_ID })

    const savedApiKeys = [...apiKeys.values()]
    expect(savedApiKeys).toHaveLength(1)
    expect(savedApiKeys[0]?.name).toBe(DEFAULT_API_KEY_NAME)

    expect(claims).toHaveLength(1)
    expect(claims[0]?.email).toBe("founder@acme.com")
    expect(claims[0]?.claimedAt).toBeNull()
    const ttlMs = (claims[0]?.expiresAt.getTime() ?? 0) - Date.now()
    expect(ttlMs).toBeGreaterThan(TEMPORARY_ACCOUNT_TTL_MS - 60_000)
    expect(ttlMs).toBeLessThanOrEqual(TEMPORARY_ACCOUNT_TTL_MS)

    expect(result.claimUrl.startsWith(`${WEB_URL}/claim/`)).toBe(true)
    const rawToken = result.claimUrl.slice(`${WEB_URL}/claim/`.length)
    expect(rawToken.length).toBeGreaterThan(0)
    expect(claims[0]?.tokenHash).not.toBe(rawToken)
    expect(await Effect.runPromise(hash(rawToken))).toBe(claims[0]?.tokenHash)

    const eventNames = writtenEvents.map((e) => e.eventName)
    expect(eventNames).toContain("ApiKeyCreated")
    expect(eventNames).toContain("ProjectCreated")
    expect(eventNames).not.toContain("OrganizationCreated")
    expect(eventNames).not.toContain("SampleProjectCreated")
    expect(eventNames).toContain("ClaimEmailRequested")
    const claimEmailEvent = writtenEvents.find((e) => e.eventName === "ClaimEmailRequested")
    expect(claimEmailEvent?.payload).toMatchObject({
      email: "founder@acme.com",
      organizationName: "Acme",
      expiresAt: result.claimExpiresAt.toISOString(),
    })

    expect(result.organization).toMatchObject({ id: ORG_ID, slug: "acme" })
    expect(result.project).toMatchObject({ slug: "checkout-bot" })
    expect(result.apiKey.length).toBeGreaterThan(0)
    expect(result.claimEmail).toBe("founder@acme.com")
    expect(result.claimExpiresAt).toEqual(claims[0]?.expiresAt)
  })

  it("falls back to default names and null email when the agent infers nothing", async () => {
    const { run, get } = setup()

    const result = await run({ organizationId: ORG_ID, webUrl: WEB_URL })

    const { organizations, projects, claims, writtenEvents } = get()
    expect(writtenEvents.map((e) => e.eventName)).not.toContain("ClaimEmailRequested")
    expect([...organizations.values()][0]).toMatchObject({
      name: DEFAULT_TEMPORARY_ORGANIZATION_NAME,
      slug: "my-organization",
    })
    expect([...projects.values()][0]).toMatchObject({ name: DEFAULT_TEMPORARY_PROJECT_NAME, slug: "my-project" })
    expect(claims[0]?.email).toBeNull()
    expect(result.claimEmail).toBeNull()
    expect(result.claimUrl.startsWith(`${WEB_URL}/claim/`)).toBe(true)
  })
})
