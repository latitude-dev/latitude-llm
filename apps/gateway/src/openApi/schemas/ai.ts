import { z } from '@hono/zod-openapi'
import {
  LegacyChainEventTypes,
  StreamEventTypes,
  traceContextSchema,
} from '@latitude-data/constants'
import { messageSchema } from '@latitude-data/core/browser'

export const languageModelUsageSchema = z.object({
  completionTokens: z.number().optional(),
  promptTokens: z.number().optional(),
  totalTokens: z.number().optional(),
})

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.any()),
})

export const configSchema = z.object({}).passthrough()
export const providerLogSchema = z.object({}).passthrough()
export const chainStepResponseSchema = z.discriminatedUnion('streamType', [
  z.object({
    streamType: z.literal('text'),
    text: z.string(),
    usage: languageModelUsageSchema,
    toolCalls: z.array(toolCallSchema),
    documentLogUuid: z.string().optional(),
    providerLog: providerLogSchema.optional(),
  }),
  z.object({
    streamType: z.literal('object'),
    object: z.any(),
    text: z.string(),
    usage: languageModelUsageSchema,
    documentLogUuid: z.string().optional(),
    providerLog: providerLogSchema.optional(),
  }),
])

export const chainCallResponseDtoSchema = z.discriminatedUnion('streamType', [
  chainStepResponseSchema.options[0].omit({
    documentLogUuid: true,
    providerLog: true,
  }),
  chainStepResponseSchema.options[1].omit({
    documentLogUuid: true,
    providerLog: true,
  }),
])

export const chainEventDtoResponseSchema = z.discriminatedUnion('streamType', [
  chainStepResponseSchema.options[0].omit({ providerLog: true }),
  chainStepResponseSchema.options[1].omit({ providerLog: true }),
])

export const legacyChainEventDtoSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal(StreamEventTypes.Provider),
    data: z.object({}).passthrough(),
  }),
  z.object({
    event: z.literal(StreamEventTypes.Latitude),
    data: z.discriminatedUnion('type', [
      z.object({
        type: z.literal(LegacyChainEventTypes.Step),
        config: configSchema,
        isLastStep: z.boolean(),
        messages: z.array(messageSchema),
        uuid: z.string().optional(),
      }),
      z.object({
        type: z.literal(LegacyChainEventTypes.StepComplete),
        response: chainEventDtoResponseSchema,
        uuid: z.string().optional(),
      }),
      z.object({
        type: z.literal(LegacyChainEventTypes.Complete),
        config: configSchema,
        messages: z.array(messageSchema).optional(),
        object: z.object({}).passthrough().optional(),
        response: chainEventDtoResponseSchema,
        uuid: z.string().optional(),
      }),
      z.object({
        type: z.literal(LegacyChainEventTypes.Error),
        error: z.object({
          name: z.string(),
          message: z.string(),
          stack: z.string().optional(),
        }),
      }),
    ]),
  }),
])

export const runSyncAPIResponseSchema = z.object({
  uuid: z.string(),
  conversation: z.array(messageSchema),
  response: chainCallResponseDtoSchema,
  trace: traceContextSchema,
})

export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  workspaceId: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastEditedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
})
