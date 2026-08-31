import { generateId, type PartnerId, partnerIdSchema } from "@domain/shared"
import { z } from "zod"
import { ipMatchesAllowlist, isValidAllowlistEntry } from "../ip-allowlist.ts"

export const PARTNER_SCOPES = ["accounts:provision"] as const

export const partnerScopeSchema = z.enum(PARTNER_SCOPES)

export type PartnerScope = z.infer<typeof partnerScopeSchema>

/** Copied verbatim onto `oauth_applications.icon`, whose CHECK constraint only accepts an http(s) URL. */
export const partnerIconUrlSchema = z.string().regex(/^https?:\/\/\S+$/, "Icon URL must be an http(s) URL")

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname)

/**
 * TLS everywhere except loopback, where a local callback has no certificate to
 * present — the line RFC 8252 §7.3 draws. An authorization code delivered over
 * plaintext HTTP is readable by anyone on the path, and these URLs are stamped
 * onto every grant we mint for the partner.
 *
 * Commas are refused too: the list is stored comma-joined in
 * `oauth_applications.redirect_urls`, so one would split a URL in two.
 */
const isValidPartnerRedirectUrl = (value: string): boolean => {
  if (value.includes(",") || /\s/.test(value)) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol === "https:") return true
  return url.protocol === "http:" && isLoopbackHostname(url.hostname)
}

export const partnerRedirectUrlSchema = z
  .string()
  .refine(isValidPartnerRedirectUrl, "Redirect URL must be an https:// URL without commas (http:// only for localhost)")

export const PARTNER_NAME_MAX_LENGTH = 256

/** A single IP or a CIDR block, in either address family. */
export const partnerAllowedIpSchema = z
  .string()
  .refine(isValidAllowlistEntry, { message: "Must be an IP address or a CIDR block" })

/**
 * A vetted third-party platform allowed to call the private partner API.
 *
 * The HMAC secret is deliberately absent: it travels only through
 * `PartnerRepository.findSecretById` / `save`, never on the entity, so a
 * partner record can be logged or returned to the backoffice UI as-is.
 */
export const partnerSchema = z.object({
  id: partnerIdSchema,
  name: z.string().min(1).max(PARTNER_NAME_MAX_LENGTH),
  iconUrl: partnerIconUrlSchema.nullable(),
  /** The partner's OAuth callbacks, stamped onto every application row minted for them. */
  redirectUrls: z.array(partnerRedirectUrlSchema).min(1),
  scopes: z.array(partnerScopeSchema),
  /** Empty means unrestricted; a non-empty list refuses every caller outside it. */
  allowedIps: z.array(partnerAllowedIpSchema),
  enabled: z.boolean(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Partner = z.infer<typeof partnerSchema>

export const createPartner = (params: {
  id?: PartnerId | undefined
  name: string
  iconUrl?: string | null
  redirectUrls: readonly string[]
  scopes: readonly PartnerScope[]
  allowedIps?: readonly string[] | undefined
  enabled?: boolean
  deletedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}): Partner => {
  const now = new Date()
  return partnerSchema.parse({
    id: params.id ?? generateId<"PartnerId">(),
    name: params.name,
    iconUrl: params.iconUrl ?? null,
    redirectUrls: [...params.redirectUrls],
    scopes: [...params.scopes],
    allowedIps: [...(params.allowedIps ?? [])],
    enabled: params.enabled ?? true,
    deletedAt: params.deletedAt ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}

export const partnerHasScope = (partner: Partner, scope: PartnerScope): boolean => partner.scopes.includes(scope)

export const partnerAllowsIp = (partner: Partner, ip: string | undefined): boolean =>
  ipMatchesAllowlist(ip, partner.allowedIps)
