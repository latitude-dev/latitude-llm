import { z } from '@hono/zod-openapi'
import {
  LegacyChainEventTypes,
  StreamEventTypes,
  traceContextSchema,
} from '@latitude-data/constants'

export const languageModelUsageSchema = z.object({
  completionTokens: z.number().optional(),
  promptTokens: z.number().optional(),
  totalTokens: z.number().optional(),
})

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).openapi({
    type: 'object',
    additionalProperties: true,
    description: 'Tool call arguments as key-value pairs',
  }),
})

const textContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

const imageContentSchema = z.object({
  type: z.literal('image'),
  image: z
    .string()
    .or(z.instanceof(Uint8Array))
    .or(z.instanceof(ArrayBuffer))
    .or(z.instanceof(URL))
    .openapi({
      type: 'string',
      description:
        'Image data as string (URL, base64), Uint8Array, ArrayBuffer, or URL object',
      format: 'binary',
    }),
  mimeType: z.string().optional(),
})

const fileContentSchema = z.object({
  type: z.literal('file'),
  file: z
    .string()
    .or(z.instanceof(Uint8Array))
    .or(z.instanceof(ArrayBuffer))
    .or(z.instanceof(URL))
    .openapi({
      type: 'string',
      description:
        'File data as string (URL, base64), Uint8Array, ArrayBuffer, or URL object',
      format: 'binary',
    }),
  mimeType: z.string(),
})

const toolCallContentSchema = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).openapi({
    type: 'object',
    additionalProperties: true,
    description: 'Tool call arguments as key-value pairs',
  }),
})

const toolResultContentSchema = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown().openapi({
    type: 'object',
    additionalProperties: true,
    description: 'Tool result as any JSON-serializable value',
  }),
  isError: z.boolean().optional(),
})

export const messageSchema = z
  .object({
    role: z.literal('system'),
    content: z.string().or(z.array(textContentSchema)),
  })
  .or(
    z.object({
      role: z.literal('user'),
      content: z
        .string()
        .or(
          z.array(
            textContentSchema.or(imageContentSchema).or(fileContentSchema),
          ),
        ),
      name: z.string().optional(),
    }),
  )
  .or(
    z.object({
      role: z.literal('assistant'),
      content: z
        .string()
        .or(z.array(textContentSchema.or(toolCallContentSchema))),
      toolCalls: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            arguments: z.record(z.string(), z.unknown()).openapi({
              type: 'object',
              additionalProperties: true,
              description: 'Tool call arguments as key-value pairs',
            }),
          }),
        )
        .optional(),
    }),
  )
  .or(
    z.object({
      role: z.literal('tool'),
      content: z.array(toolResultContentSchema),
    }),
  )
  .openapi({
    description: 'A message in the conversation',
    oneOf: [
      {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['system'] },
          content: { type: 'string' },
        },
        required: ['role', 'content'],
      },
      {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['user'] },
          content: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['role', 'content'],
      },
      {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['assistant'] },
          content: { type: 'string' },
          toolCalls: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                arguments: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
        required: ['role', 'content'],
      },
      {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['tool'] },
          content: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['tool-result'] },
                toolCallId: { type: 'string' },
                toolName: { type: 'string' },
                result: { type: 'object', additionalProperties: true },
                isError: { type: 'boolean' },
              },
            },
          },
        },
        required: ['role', 'content'],
      },
    ],
  })

export const messagesSchema = z.array(messageSchema)

export const configSchema = z.record(z.string(), z.any()).openapi({
  type: 'object',
  additionalProperties: true,
  description: 'Configuration as key-value pairs',
})
export const providerLogSchema = z.record(z.string(), z.any()).openapi({
  type: 'object',
  additionalProperties: true,
  description: 'Provider log as key-value pairs',
})
export const chainStepResponseSchema = z
  .discriminatedUnion('streamType', [
    z.object({
      streamType: z.literal('text'),
      text: z.string(),
      usage: languageModelUsageSchema,
      toolCalls: z.array(toolCallSchema),
      documentLogUuid: z.string().optional(),
      providerLog: providerLogSchema.optional(),
      cost: z.number(),
    }),
    z.object({
      streamType: z.literal('object'),
      object: z.any().openapi({
        type: 'object',
        additionalProperties: true,
        description: 'Stream object data (any JSON-serializable value)',
      }),
      text: z.string(),
      usage: languageModelUsageSchema,
      documentLogUuid: z.string().optional(),
      providerLog: providerLogSchema.optional(),
      cost: z.number(),
    }),
  ])
  .openapi({
    description: 'Chain step response with text or object stream type',
    discriminator: { propertyName: 'streamType' },
  })

export const chainCallResponseDtoSchema = z
  .discriminatedUnion('streamType', [
    chainStepResponseSchema.options[0].omit({
      documentLogUuid: true,
      providerLog: true,
    }),
    chainStepResponseSchema.options[1].omit({
      documentLogUuid: true,
      providerLog: true,
    }),
  ])
  .openapi({
    description: 'Chain call response DTO',
    discriminator: { propertyName: 'streamType' },
  })

export const chainEventDtoResponseSchema = z
  .discriminatedUnion('streamType', [
    chainStepResponseSchema.options[0].omit({ providerLog: true }),
    chainStepResponseSchema.options[1].omit({ providerLog: true }),
  ])
  .openapi({
    description: 'Chain event DTO response',
    discriminator: { propertyName: 'streamType' },
  })

export const legacyChainEventDtoSchema = z
  .discriminatedUnion('event', [
    z.object({
      event: z.literal(StreamEventTypes.Provider),
      data: z.record(z.string(), z.any()).openapi({
        type: 'object',
        additionalProperties: true,
        description: 'Provider event data as key-value pairs',
      }),
    }),
    z.object({
      event: z.literal(StreamEventTypes.Latitude),
      data: z
        .discriminatedUnion('type', [
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
            object: z.record(z.string(), z.any()).optional().openapi({
              type: 'object',
              additionalProperties: true,
              description: 'Complete event object data as key-value pairs',
            }),
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
        ])
        .openapi({
          description: 'Latitude event data',
          discriminator: { propertyName: 'type' },
        }),
    }),
  ])
  .openapi({
    description: 'Legacy chain event DTO',
    discriminator: { propertyName: 'event' },
  })

export const runBackgroundAPIResponseSchema = z.object({
  uuid: z.string(),
})

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
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastEditedAt: z.iso.datetime().optional(),
  deletedAt: z.iso.datetime().nullable().optional(),
})
