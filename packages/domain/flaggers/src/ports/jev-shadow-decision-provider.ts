import { Context, type Effect } from "effect"
import { z } from "zod"
import { JEV_SHADOW_PROVIDER_FAILURE_KINDS } from "../constants.ts"
import type { FlaggerConversation } from "../conversation.ts"

export { JEV_SHADOW_PROVIDER_FAILURE_KINDS }
export type JevShadowProviderFailureKind = (typeof JEV_SHADOW_PROVIDER_FAILURE_KINDS)[number]

export const jevShadowProviderAuditMetadataSchema = z.object({
  provider: z.string().min(1),
  requestedModel: z.string().min(1).nullable(),
  resolvedModel: z.string().min(1).nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
})
export type JevShadowProviderAuditMetadata = z.infer<typeof jevShadowProviderAuditMetadataSchema>

export interface JevShadowQuestion {
  readonly id: string
  readonly version: string
  readonly prompt: string
}

export interface JevShadowDecisionProviderRequest {
  readonly question: JevShadowQuestion
  readonly state: {
    readonly conversation: FlaggerConversation
  }
}

export const jevShadowProviderResultSchema = z.discriminatedUnion("kind", [
  jevShadowProviderAuditMetadataSchema.extend({
    kind: z.literal("success"),
    probability: z.number().finite().min(0).max(1),
  }),
  jevShadowProviderAuditMetadataSchema.extend({
    kind: z.literal("failure"),
    errorCategory: z.enum(JEV_SHADOW_PROVIDER_FAILURE_KINDS),
  }),
])
export type JevShadowProviderResult = z.infer<typeof jevShadowProviderResultSchema>

export interface JevShadowDecisionProviderShape {
  decide(input: JevShadowDecisionProviderRequest): Effect.Effect<JevShadowProviderResult>
}

export class JevShadowDecisionProvider extends Context.Service<
  JevShadowDecisionProvider,
  JevShadowDecisionProviderShape
>()("@domain/flaggers/JevShadowDecisionProvider") {}
