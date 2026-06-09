import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { SsoProvider } from "../entities/sso-provider.ts"
import type { SsoProviderRepositoryShape } from "../ports/sso-provider-repository.ts"

export const createFakeSsoProviderRepository = () => {
  /** Keyed by provider id. */
  const providers = new Map<string, SsoProvider>()

  const repository: SsoProviderRepositoryShape = {
    findForOrganization: () =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        return [...providers.values()].find((p) => p.organizationId === organizationId) ?? null
      }),

    findVerifiedByDomain: (domain) =>
      Effect.gen(function* () {
        yield* SqlClient
        return [...providers.values()].find((p) => p.domain === domain && p.domainVerified) ?? null
      }),

    setEnforced: (enforced) =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        const provider = [...providers.values()].find((p) => p.organizationId === organizationId)
        if (provider) providers.set(provider.id, { ...provider, enforced })
      }),

    deleteForOrganization: () =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        for (const provider of providers.values()) {
          if (provider.organizationId === organizationId) providers.delete(provider.id)
        }
      }),
  }

  return { repository, providers }
}
