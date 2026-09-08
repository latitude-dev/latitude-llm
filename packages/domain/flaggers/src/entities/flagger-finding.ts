import { organizationIdSchema, projectIdSchema, sessionIdSchema } from "@domain/shared"
import { z } from "zod"

export const flaggerFindingScopeSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,
})
export type FlaggerFindingScope = z.infer<typeof flaggerFindingScopeSchema>

const baseFlaggerFindingFields = {
  findingKey: z.string().regex(/^[0-9a-f]{64}$/),
  feedback: z.string().min(1),
} as const

const messageAnchorFields = {
  messageIndex: z.number().int().nonnegative(),
  partIndex: z.number().int().nonnegative().optional(),
} as const

const emptyResponseFindingSchema = z
  .object({
    ...baseFlaggerFindingFields,
    ...messageAnchorFields,
    flaggerSlug: z.literal("empty-response"),
    findingKind: z.enum(["blank", "confirmedUnusablePattern", "unconfirmedPattern"]),
  })
  .strict()

const outputSchemaValidationFindingSchema = z
  .object({
    ...baseFlaggerFindingFields,
    ...messageAnchorFields,
    flaggerSlug: z.literal("output-schema-validation"),
    findingKind: z.enum(["trailingComma", "unclosedString", "invalidJson"]),
    generationPosition: z.enum(["final", "intermediate"]),
  })
  .strict()

const malformedToolCallFindingSchema = z
  .object({
    ...baseFlaggerFindingFields,
    ...messageAnchorFields,
    flaggerSlug: z.literal("tool-call-errors"),
    findingKind: z.literal("malformed"),
    toolName: z.string().min(1).optional(),
    toolCallId: z.string().min(1).optional(),
  })
  .strict()

const identifiedStructuralToolFindingSchema = z
  .object({
    ...baseFlaggerFindingFields,
    ...messageAnchorFields,
    flaggerSlug: z.literal("tool-call-errors"),
    findingKind: z.enum(["duplicate", "undeclared"]),
    toolName: z.string().min(1),
    toolCallId: z.string().min(1),
  })
  .strict()

const unknownToolResponseFindingSchema = z
  .object({
    ...baseFlaggerFindingFields,
    ...messageAnchorFields,
    flaggerSlug: z.literal("tool-call-errors"),
    findingKind: z.literal("unknown-id"),
    toolCallId: z.string().min(1).optional(),
  })
  .strict()

const failedToolCallFindingSchema = z
  .object({
    ...baseFlaggerFindingFields,
    ...messageAnchorFields,
    flaggerSlug: z.literal("tool-call-errors"),
    findingKind: z.literal("error"),
    toolName: z.string().min(1),
    toolCallId: z.string().min(1),
    responseMessageIndex: z.number().int().nonnegative(),
    responsePartIndex: z.number().int().nonnegative().optional(),
    recovered: z.boolean().optional(),
    sameSubjectRecovered: z.boolean().optional(),
    terminal: z.boolean().optional(),
  })
  .strict()

const thrashingFindingSchema = z
  .object({
    ...baseFlaggerFindingFields,
    ...messageAnchorFields,
    flaggerSlug: z.literal("trashing"),
    findingKind: z.literal("identicalCallLoop"),
    occurrenceCount: z.number().int().min(3),
  })
  .strict()

const lowCacheHitRateFindingSchema = z
  .object({
    ...baseFlaggerFindingFields,
    flaggerSlug: z.literal("low-cache-hit-rate"),
    findingKind: z.literal("lowCacheHitRate"),
  })
  .strict()

export const flaggerFindingSchema = z.union([
  emptyResponseFindingSchema,
  outputSchemaValidationFindingSchema,
  malformedToolCallFindingSchema,
  identifiedStructuralToolFindingSchema,
  unknownToolResponseFindingSchema,
  failedToolCallFindingSchema,
  thrashingFindingSchema,
  lowCacheHitRateFindingSchema,
])
export type FlaggerFinding = z.infer<typeof flaggerFindingSchema>
export type FlaggerFindingKind = FlaggerFinding["findingKind"]
export type FlaggerFindingDraft = FlaggerFinding extends infer Finding
  ? Finding extends FlaggerFinding
    ? Omit<Finding, "findingKey">
    : never
  : never

export const deterministicFlaggerFindingReadSchema = z.discriminatedUnion("readable", [
  z
    .object({
      readable: z.literal(true),
      findings: z.array(flaggerFindingSchema).readonly(),
    })
    .strict(),
  z
    .object({
      readable: z.literal(false),
      findings: z.tuple([]),
    })
    .strict(),
])
export type DeterministicFlaggerFindingRead = z.infer<typeof deterministicFlaggerFindingReadSchema>

export const unreadableDeterministicFlaggerFindingRead = {
  readable: false,
  findings: [],
} as const satisfies DeterministicFlaggerFindingRead
