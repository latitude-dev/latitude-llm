import { organizationIdSchema, type SsoProviderId, ssoProviderIdSchema, userIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * Which protocol the provider speaks. Derived from whichever config blob
 * (`saml_config` / `oidc_config`) is present on the row — never from
 * user input at read time.
 */
export const ssoProviderKindSchema = z.enum(["saml", "oidc"])
export type SsoProviderKind = z.infer<typeof ssoProviderKindSchema>

/**
 * Non-secret projection of a `sso_providers` row.
 *
 * Deliberately excludes `samlConfig` / `oidcConfig`: those blobs carry IdP
 * certs, SP keys, and the OIDC client secret, and must never travel past the
 * repository layer. Anything the settings UI needs (SP metadata URL, ACS URL)
 * is computed from `providerId`, not read from the config.
 */
export const ssoProviderSchema = z.object({
  id: ssoProviderIdSchema,
  /** Better Auth rows are created with an org binding by our server fns; never null in practice. */
  organizationId: organizationIdSchema,
  /** Slug used in the SP metadata / ACS / OIDC callback URLs. */
  providerId: z.string().min(1),
  issuer: z.string().min(1),
  /** Email domain this provider claims, lowercase. */
  domain: z.string().min(1),
  kind: ssoProviderKindSchema,
  domainVerified: z.boolean(),
  enforced: z.boolean(),
  registeredByUserId: userIdSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type SsoProvider = z.infer<typeof ssoProviderSchema>

export const createSsoProvider = (params: {
  readonly id: SsoProviderId
  readonly organizationId: string
  readonly providerId: string
  readonly issuer: string
  readonly domain: string
  readonly kind: SsoProviderKind
  readonly domainVerified: boolean
  readonly enforced: boolean
  readonly registeredByUserId: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}): SsoProvider => ssoProviderSchema.parse(params)

/** Lowercased domain part of an email address, or null when there is none. */
export const emailDomain = (email: string): string | null => {
  const atIndex = email.lastIndexOf("@")
  if (atIndex <= 0 || atIndex === email.length - 1) return null
  return email.slice(atIndex + 1).toLowerCase()
}
