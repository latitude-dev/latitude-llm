import {
  type DestinationId,
  destinationIdSchema,
  generateId,
  type OrganizationId,
  organizationIdSchema,
  type ProjectId,
  projectIdSchema,
  type UserId,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"
import {
  DESTINATION_INTERVAL_MS_DEFAULT,
  DESTINATION_INTERVAL_MS_MAX,
  DESTINATION_INTERVAL_MS_MIN,
  DESTINATION_MAX_SPANS_PER_RUN_DEFAULT,
  DESTINATION_MAX_SPANS_PER_RUN_MAX,
  DESTINATION_MAX_SPANS_PER_RUN_MIN,
} from "../constants.ts"

export const DESTINATION_KINDS = ["posthog"] as const
export const destinationKindSchema = z.enum(DESTINATION_KINDS)
export type DestinationKind = z.infer<typeof destinationKindSchema>

export const DESTINATION_STATUSES = ["active", "paused", "quarantined"] as const
export const destinationStatusSchema = z.enum(DESTINATION_STATUSES)
export type DestinationStatus = z.infer<typeof destinationStatusSchema>

// Dotted named host; the lookaheads exclude IPv4 literals and bracketed IPv6.
const NAMED_HOSTNAME = /^(?!\[)(?!\d{1,3}(\.\d{1,3}){3}$)[^.]+(\.[^.]+)+$/

const hasNoCredentialsQueryOrHash = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.username === "" && url.password === "" && url.search === "" && url.hash === ""
  } catch {
    return false
  }
}

/**
 * Schema-level shape check only (https, named host — no IP literals, no
 * credentials/query). The runtime SSRF guard — public-IP resolution at
 * request time, no redirects — lives in the deliverer adapter.
 */
export const destinationHostSchema = z
  .url({ protocol: /^https$/, hostname: NAMED_HOSTNAME })
  .refine(hasNoCredentialsQueryOrHash, { message: "Host must not carry credentials, query, or fragment" })

export const posthogDestinationConfigSchema = z.object({
  kind: z.literal("posthog"),
  host: destinationHostSchema,
  excludePayloads: z.boolean().default(false),
  intervalMs: z
    .number()
    .int()
    .min(DESTINATION_INTERVAL_MS_MIN)
    .max(DESTINATION_INTERVAL_MS_MAX)
    .default(DESTINATION_INTERVAL_MS_DEFAULT),
  maxSpansPerRun: z
    .number()
    .int()
    .min(DESTINATION_MAX_SPANS_PER_RUN_MIN)
    .max(DESTINATION_MAX_SPANS_PER_RUN_MAX)
    .default(DESTINATION_MAX_SPANS_PER_RUN_DEFAULT),
})
export type PosthogDestinationConfig = z.infer<typeof posthogDestinationConfigSchema>

export const destinationConfigSchema = z.discriminatedUnion("kind", [posthogDestinationConfigSchema])
export type DestinationConfig = z.infer<typeof destinationConfigSchema>

export const posthogDestinationCredentialsSchema = z.object({
  kind: z.literal("posthog"),
  apiKey: z.string().min(1),
})
export type PosthogDestinationCredentials = z.infer<typeof posthogDestinationCredentialsSchema>

/**
 * Per-kind secret object, AES-256-GCM-encrypted as a whole at the repository
 * boundary. A future kind can hold multiple secrets without schema changes here.
 */
export const destinationCredentialsSchema = z.discriminatedUnion("kind", [posthogDestinationCredentialsSchema])
export type DestinationCredentials = z.infer<typeof destinationCredentialsSchema>

export const destinationSchema = z
  .object({
    id: destinationIdSchema,
    organizationId: organizationIdSchema,
    projectId: projectIdSchema,
    kind: destinationKindSchema,
    name: z.string().min(1),
    config: destinationConfigSchema,
    credentials: destinationCredentialsSchema,
    status: destinationStatusSchema,
    consecutiveFailures: z.number().int().min(0),
    /** Sanitized: HTTP status + our error taxonomy, never upstream response bodies. */
    lastFailureMessage: z.string().nullable(),
    createdByUserId: userIdSchema,
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .refine((d) => d.config.kind === d.kind && d.credentials.kind === d.kind, {
    message: "config and credentials kind must match the destination kind",
  })

export type Destination = z.infer<typeof destinationSchema>

export const createDestination = (params: {
  id?: DestinationId | undefined
  organizationId: OrganizationId
  projectId: ProjectId
  name: string
  config: DestinationConfig
  credentials: DestinationCredentials
  createdByUserId: UserId
  createdAt?: Date
}): Destination => {
  const now = params.createdAt ?? new Date()
  return destinationSchema.parse({
    id: params.id ?? generateId<"DestinationId">(),
    organizationId: params.organizationId,
    projectId: params.projectId,
    kind: params.config.kind,
    name: params.name,
    config: params.config,
    credentials: params.credentials,
    status: "active",
    consecutiveFailures: 0,
    lastFailureMessage: null,
    createdByUserId: params.createdByUserId,
    createdAt: now,
    updatedAt: now,
  })
}
