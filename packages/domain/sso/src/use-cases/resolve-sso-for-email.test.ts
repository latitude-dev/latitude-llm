import { generateId, OrganizationId, SqlClient, SsoProviderId, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createSsoProvider, type SsoProvider } from "../entities/sso-provider.ts"
import { SsoProviderRepository } from "../ports/sso-provider-repository.ts"
import { createFakeSsoProviderRepository } from "../testing/index.ts"
import { isSsoEnforcedForEmailUseCase } from "./is-sso-enforced-for-email.ts"
import { resolveSsoForEmailUseCase } from "./resolve-sso-for-email.ts"

const ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")

const buildProvider = (params: { domain: string; domainVerified?: boolean; enforced?: boolean }): SsoProvider => {
  const now = new Date()
  return createSsoProvider({
    id: SsoProviderId(generateId()),
    organizationId: ORG_ID,
    providerId: `acme-${params.domain}`,
    issuer: "https://idp.example.com",
    domain: params.domain,
    kind: "saml",
    domainVerified: params.domainVerified ?? true,
    enforced: params.enforced ?? false,
    registeredByUserId: UserId(generateId()),
    createdAt: now,
    updatedAt: now,
  })
}

const buildLayer = (providers: SsoProvider[]) => {
  const { repository, providers: store } = createFakeSsoProviderRepository()
  for (const provider of providers) store.set(provider.id, provider)
  return Layer.mergeAll(
    Layer.succeed(SsoProviderRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
  )
}

describe("resolveSsoForEmailUseCase", () => {
  it("returns the provider for a verified domain match", async () => {
    const provider = buildProvider({ domain: "acme.com", domainVerified: true })
    const result = await Effect.runPromise(
      resolveSsoForEmailUseCase({ email: "jane@acme.com" }).pipe(Effect.provide(buildLayer([provider]))),
    )
    expect(result?.providerId).toBe(provider.providerId)
  })

  it("matches the email domain case-insensitively", async () => {
    const provider = buildProvider({ domain: "acme.com" })
    const result = await Effect.runPromise(
      resolveSsoForEmailUseCase({ email: "Jane@ACME.COM" }).pipe(Effect.provide(buildLayer([provider]))),
    )
    expect(result?.providerId).toBe(provider.providerId)
  })

  it("returns null for an unverified domain", async () => {
    const provider = buildProvider({ domain: "acme.com", domainVerified: false })
    const result = await Effect.runPromise(
      resolveSsoForEmailUseCase({ email: "jane@acme.com" }).pipe(Effect.provide(buildLayer([provider]))),
    )
    expect(result).toBeNull()
  })

  it("returns null for an unknown domain", async () => {
    const provider = buildProvider({ domain: "acme.com" })
    const result = await Effect.runPromise(
      resolveSsoForEmailUseCase({ email: "jane@other.com" }).pipe(Effect.provide(buildLayer([provider]))),
    )
    expect(result).toBeNull()
  })

  it.each(["not-an-email", "@acme.com", "jane@", ""])("returns null for malformed email %j", async (email) => {
    const provider = buildProvider({ domain: "acme.com" })
    const result = await Effect.runPromise(
      resolveSsoForEmailUseCase({ email }).pipe(Effect.provide(buildLayer([provider]))),
    )
    expect(result).toBeNull()
  })
})

describe("isSsoEnforcedForEmailUseCase", () => {
  it("is true only when the matching provider is verified AND enforced", async () => {
    const provider = buildProvider({ domain: "acme.com", domainVerified: true, enforced: true })
    const result = await Effect.runPromise(
      isSsoEnforcedForEmailUseCase({ email: "jane@acme.com" }).pipe(Effect.provide(buildLayer([provider]))),
    )
    expect(result).toBe(true)
  })

  it("is false when the provider is verified but not enforced", async () => {
    const provider = buildProvider({ domain: "acme.com", domainVerified: true, enforced: false })
    const result = await Effect.runPromise(
      isSsoEnforcedForEmailUseCase({ email: "jane@acme.com" }).pipe(Effect.provide(buildLayer([provider]))),
    )
    expect(result).toBe(false)
  })

  it("is false when the provider is enforced but the domain is unverified", async () => {
    const provider = buildProvider({ domain: "acme.com", domainVerified: false, enforced: true })
    const result = await Effect.runPromise(
      isSsoEnforcedForEmailUseCase({ email: "jane@acme.com" }).pipe(Effect.provide(buildLayer([provider]))),
    )
    expect(result).toBe(false)
  })

  it("is false for non-matching domains", async () => {
    const provider = buildProvider({ domain: "acme.com", domainVerified: true, enforced: true })
    const result = await Effect.runPromise(
      isSsoEnforcedForEmailUseCase({ email: "jane@personal.com" }).pipe(Effect.provide(buildLayer([provider]))),
    )
    expect(result).toBe(false)
  })
})
