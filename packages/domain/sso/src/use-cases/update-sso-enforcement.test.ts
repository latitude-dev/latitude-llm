import { generateId, OrganizationId, SqlClient, SsoProviderId, UserId, ValidationError } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createSsoProvider, type SsoProvider } from "../entities/sso-provider.ts"
import { SsoProviderRepository } from "../ports/sso-provider-repository.ts"
import { createFakeSsoProviderRepository } from "../testing/index.ts"
import { updateSsoEnforcementUseCase } from "./update-sso-enforcement.ts"

const ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
const OTHER_ORG_ID = OrganizationId("ye9d77pxi50nh1gyqljkffnb")

const buildProvider = (params: {
  organizationId?: typeof ORG_ID
  domainVerified?: boolean
  enforced?: boolean
}): SsoProvider => {
  const now = new Date()
  return createSsoProvider({
    id: SsoProviderId(generateId()),
    organizationId: params.organizationId ?? ORG_ID,
    providerId: "acme-saml",
    issuer: "https://idp.example.com",
    domain: "acme.com",
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
  const layer = Layer.mergeAll(
    Layer.succeed(SsoProviderRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
  )
  return { layer, store }
}

describe("updateSsoEnforcementUseCase", () => {
  it("enables enforcement on a verified provider", async () => {
    const provider = buildProvider({ domainVerified: true })
    const { layer, store } = buildLayer([provider])

    await Effect.runPromise(updateSsoEnforcementUseCase({ enforced: true }).pipe(Effect.provide(layer)))

    expect(store.get(provider.id)?.enforced).toBe(true)
  })

  it("rejects enabling enforcement on an unverified domain", async () => {
    const provider = buildProvider({ domainVerified: false })
    const { layer, store } = buildLayer([provider])

    const result = await Effect.runPromiseExit(
      updateSsoEnforcementUseCase({ enforced: true }).pipe(Effect.provide(layer)),
    )

    expect(result._tag).toBe("Failure")
    expect(store.get(provider.id)?.enforced).toBe(false)
  })

  it("allows disabling enforcement even when the domain is unverified", async () => {
    const provider = buildProvider({ domainVerified: false, enforced: true })
    const { layer, store } = buildLayer([provider])

    await Effect.runPromise(updateSsoEnforcementUseCase({ enforced: false }).pipe(Effect.provide(layer)))

    expect(store.get(provider.id)?.enforced).toBe(false)
  })

  it("fails with ValidationError when the org has no provider", async () => {
    const { layer } = buildLayer([buildProvider({ organizationId: OTHER_ORG_ID })])

    const error = await Effect.runPromise(
      updateSsoEnforcementUseCase({ enforced: true }).pipe(Effect.flip, Effect.provide(layer)),
    )

    expect(error).toBeInstanceOf(ValidationError)
  })
})
