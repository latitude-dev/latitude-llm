import { FeatureFlagRepository } from "@domain/feature-flags"
import { MembershipRepository } from "@domain/organizations"
import { ForbiddenError, type OrganizationId, ValidationError } from "@domain/shared"
import {
  resolveSsoForEmailUseCase,
  type SsoProvider,
  SsoProviderRepository,
  updateSsoEnforcementUseCase,
} from "@domain/sso"
import {
  FeatureFlagRepositoryLive,
  MembershipRepositoryLive,
  SsoProviderRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getBetterAuth, getPostgresClient } from "../../server/clients.ts"

/**
 * Enterprise SSO server fns.
 *
 * Provider registration/mutation is exclusively server-side: the Better Auth
 * HTTP endpoints for these operations are in `disabledPaths`, and BA 1.6.9
 * only checks org *membership* (not role) at registration — the owner/admin
 * check below is the real authorization layer. SAML certs and OIDC client
 * secrets only ever transit these fns; DTOs returned to the browser carry
 * non-secret fields plus computed URLs.
 */

const AUTH_BASE_PATH = "/api/auth"

/** TXT host prefix must match the plugin's `domainVerification.tokenPrefix` default. */
const DOMAIN_VERIFICATION_TOKEN_PREFIX = "better-auth-token"

export interface SsoProviderDto {
  readonly providerId: string
  readonly issuer: string
  readonly domain: string
  readonly kind: "saml" | "oidc"
  readonly domainVerified: boolean
  readonly enforced: boolean
  /** SP metadata XML download URL — what the IdP asks for when importing the SP. */
  readonly spMetadataUrl: string
  /** SAML Assertion Consumer Service URL ("Single sign-on URL" in Okta). */
  readonly acsUrl: string
  /** SP EntityID / Audience URI the IdP must be configured with. */
  readonly spEntityId: string
  /** OIDC redirect URL (only meaningful for kind=oidc). */
  readonly oidcCallbackUrl: string
}

export interface SsoDomainVerificationRecordDto {
  /** DNS TXT record host, e.g. `_better-auth-token-acme-com.acme.com`. */
  readonly host: string
  readonly value: string
}

const requireWebUrl = (): string => {
  const url = process.env.LAT_WEB_URL
  if (!url) throw new Error("LAT_WEB_URL is required to build SSO URLs")
  return url
}

const buildSpEntityId = (webUrl: string, providerId: string): string =>
  `${webUrl}${AUTH_BASE_PATH}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId)}`

const toDto = (provider: SsoProvider): SsoProviderDto => {
  const webUrl = requireWebUrl()
  const base = `${webUrl}${AUTH_BASE_PATH}`
  // In SAML, the SP metadata URL and EntityID are the same URL by convention.
  // We expose both fields because IdP setup wizards ask for them under different labels.
  const entityId = buildSpEntityId(webUrl, provider.providerId)
  return {
    providerId: provider.providerId,
    issuer: provider.issuer,
    domain: provider.domain,
    kind: provider.kind,
    domainVerified: provider.domainVerified,
    enforced: provider.enforced,
    spMetadataUrl: entityId,
    acsUrl: `${base}/sso/saml2/sp/acs/${encodeURIComponent(provider.providerId)}`,
    spEntityId: entityId,
    oidcCallbackUrl: `${base}/sso/callback/${encodeURIComponent(provider.providerId)}`,
  }
}

const requireSsoFeature = async (organizationId: OrganizationId): Promise<void> => {
  const client = getPostgresClient()
  const enabled = await Effect.runPromise(
    Effect.gen(function* () {
      const flags = yield* FeatureFlagRepository
      return yield* flags.isEnabledForOrganization("sso")
    }).pipe(withPostgres(FeatureFlagRepositoryLive, client, organizationId), withTracing),
  )
  if (!enabled) {
    throw new ForbiddenError({
      message: "Enterprise SSO is not enabled for this organization",
    })
  }
}

const requireSsoAdmin = async (): Promise<{
  userId: string
  organizationId: OrganizationId
}> => {
  const { userId, organizationId } = await requireSession()
  await requireSsoFeature(organizationId)

  const client = getPostgresClient()
  const isAdmin = await Effect.runPromise(
    Effect.gen(function* () {
      const memberships = yield* MembershipRepository
      return yield* memberships.isAdmin(organizationId, userId)
    }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId), withTracing),
  )
  if (!isAdmin) {
    throw new ForbiddenError({
      message: "Only organization owners and admins can manage SSO",
    })
  }

  return { userId, organizationId }
}

const findOrgProvider = async (organizationId: OrganizationId): Promise<SsoProvider | null> => {
  const client = getPostgresClient()
  return await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* SsoProviderRepository
      return yield* repo.findForOrganization()
    }).pipe(withPostgres(SsoProviderRepositoryLive, client, organizationId), withTracing),
  )
}

export const getOrgSsoProvider = createServerFn({ method: "GET" }).handler(async (): Promise<SsoProviderDto | null> => {
  const { organizationId } = await requireSession()
  await requireSsoFeature(organizationId)

  const provider = await findOrgProvider(organizationId)
  return provider ? toDto(provider) : null
})

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/, "Enter a valid domain, e.g. acme.com")

const registerSsoProviderSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("saml"),
    domain: domainSchema,
    /** IdP issuer / EntityID. */
    issuer: z.string().trim().min(1, "IdP issuer is required"),
    /** IdP SSO URL (HTTP-Redirect binding). */
    entryPoint: z.url("Enter the IdP single sign-on URL"),
    /** IdP X.509 signing certificate (PEM). */
    idpCert: z.string().trim().min(1, "IdP certificate is required"),
  }),
  z.object({
    kind: z.literal("oidc"),
    domain: domainSchema,
    /** OIDC issuer URL — discovery is fetched from `<issuer>/.well-known/openid-configuration`. */
    issuer: z.url("Enter the OIDC issuer URL"),
    clientId: z.string().trim().min(1, "Client ID is required"),
    clientSecret: z.string().trim().min(1, "Client secret is required"),
  }),
])

export const registerSsoProvider = createServerFn({ method: "POST" })
  .inputValidator(registerSsoProviderSchema)
  .handler(
    async ({
      data,
    }): Promise<{
      provider: SsoProviderDto
      verificationRecord: SsoDomainVerificationRecordDto
    }> => {
      const { organizationId } = await requireSsoAdmin()

      const existing = await findOrgProvider(organizationId)
      if (existing) {
        throw new ValidationError({
          field: "domain",
          message: "This organization already has an SSO provider",
        })
      }

      // Deterministic, URL-safe slug; the unique constraint on `provider_id`
      // surfaces cross-org domain squatting as a conflict at registration time.
      const providerId = data.domain.replace(/\./g, "-")
      const auth = getBetterAuth()
      const headers = getRequestHeaders()

      const webUrl = requireWebUrl()
      const entityId = buildSpEntityId(webUrl, providerId)

      let domainVerificationToken: string | undefined
      try {
        const result = await auth.api.registerSSOProvider({
          body: {
            providerId,
            issuer: data.issuer,
            domain: data.domain,
            organizationId,
            ...(data.kind === "saml"
              ? {
                  samlConfig: {
                    entryPoint: data.entryPoint,
                    cert: data.idpCert,
                    callbackUrl: `${webUrl}${AUTH_BASE_PATH}/sso/saml2/sp/acs/${encodeURIComponent(providerId)}`,
                    audience: entityId,
                    wantAssertionsSigned: true,
                    spMetadata: { entityID: entityId },
                  },
                }
              : {
                  oidcConfig: {
                    clientId: data.clientId,
                    clientSecret: data.clientSecret,
                    pkce: true,
                  },
                }),
          },
          headers,
        })
        const parsed = z.object({ domainVerificationToken: z.string().optional() }).safeParse(result)
        domainVerificationToken = parsed.success ? parsed.data.domainVerificationToken : undefined
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not register the SSO provider"
        if (message.toLowerCase().includes("unique") || message.toLowerCase().includes("duplicate")) {
          throw new ValidationError({
            field: "domain",
            message: "This domain is already registered by another organization",
          })
        }
        throw new ValidationError({ field: "domain", message })
      }

      const provider = await findOrgProvider(organizationId)
      if (!provider) throw new Error("SSO provider was registered but could not be read back")

      if (domainVerificationToken === undefined) {
        console.warn(
          "[registerSsoProvider] registerSSOProvider did not return a domainVerificationToken; " +
            "falling back to requestDomainVerification for provider %s",
          provider.providerId,
        )
        try {
          const fallback = await auth.api.requestDomainVerification({
            body: { providerId: provider.providerId },
            headers,
          })
          domainVerificationToken = fallback.domainVerificationToken
        } catch (_fallbackError) {
          throw new Error(
            "SSO provider was registered but the domain verification token could not be retrieved. " +
              "Please refresh the page to obtain your DNS TXT record.",
          )
        }
      }

      return {
        provider: toDto(provider),
        verificationRecord: {
          host: `_${DOMAIN_VERIFICATION_TOKEN_PREFIX}-${provider.providerId}.${provider.domain}`,
          value: domainVerificationToken,
        },
      }
    },
  )

export const getSsoDomainVerificationRecord = createServerFn({
  method: "POST",
}).handler(async (): Promise<SsoDomainVerificationRecordDto> => {
  const { organizationId } = await requireSsoAdmin()

  const provider = await findOrgProvider(organizationId)
  if (!provider) {
    throw new ValidationError({
      field: "domain",
      message: "No SSO provider is configured for this organization",
    })
  }

  const auth = getBetterAuth()
  // Returns the active token, or mints a new one when the previous expired.
  const { domainVerificationToken } = await auth.api.requestDomainVerification({
    body: { providerId: provider.providerId },
    headers: getRequestHeaders(),
  })

  return {
    host: `_${DOMAIN_VERIFICATION_TOKEN_PREFIX}-${provider.providerId}.${provider.domain}`,
    value: domainVerificationToken,
  }
})

export const verifySsoDomain = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ verified: boolean; message?: string }> => {
    const { organizationId } = await requireSsoAdmin()

    const provider = await findOrgProvider(organizationId)
    if (!provider) {
      throw new ValidationError({
        field: "domain",
        message: "No SSO provider is configured for this organization",
      })
    }

    const auth = getBetterAuth()
    try {
      await auth.api.verifyDomain({
        body: { providerId: provider.providerId },
        headers: getRequestHeaders(),
      })
      return { verified: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Domain verification failed"
      return { verified: false, message }
    }
  },
)

export const updateSsoEnforcement = createServerFn({ method: "POST" })
  .inputValidator(z.object({ enforced: z.boolean() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSsoAdmin()
    const client = getPostgresClient()

    await Effect.runPromise(
      updateSsoEnforcementUseCase({ enforced: data.enforced }).pipe(
        withPostgres(SsoProviderRepositoryLive, client, organizationId),
        withTracing,
      ),
    )
  })

export const deleteSsoProvider = createServerFn({ method: "POST" }).handler(async (): Promise<void> => {
  const { organizationId } = await requireSsoAdmin()
  const client = getPostgresClient()

  await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* SsoProviderRepository
      yield* repo.deleteForOrganization()
    }).pipe(withPostgres(SsoProviderRepositoryLive, client, organizationId), withTracing),
  )
})

/**
 * Pre-auth login lookup: matches the entered email's domain against a
 * **verified** SSO provider so the login page can redirect to the IdP
 * instead of sending a magic link.
 *
 * Unauthenticated by design, so it runs on the admin client (the tenant
 * role sees nothing pre-auth under RLS). Returns only the provider id —
 * nothing else leaks to anonymous callers.
 */
export const lookupSsoForEmail = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.email() }))
  .handler(async ({ data }): Promise<{ providerId: string } | null> => {
    const provider = await Effect.runPromise(
      resolveSsoForEmailUseCase({ email: data.email }).pipe(
        withPostgres(SsoProviderRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    return provider ? { providerId: provider.providerId } : null
  })
