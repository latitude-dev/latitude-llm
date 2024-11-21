import { zValidator } from '@hono/zod-validator'
import { SpanMetadataTypes } from '@latitude-data/core/browser'
import { createSpan } from '@latitude-data/core/services/spans/create'
import { Factory } from 'hono/factory'
import { z } from 'zod'

const createSpanSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  kind: z.enum(['internal', 'server', 'client', 'producer', 'consumer']),
  startTime: z.string().transform((str) => new Date(str)),
  endTime: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  attributes: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  status: z.string().optional(),
  statusMessage: z.string().optional(),
  events: z
    .array(
      z.object({
        name: z.string(),
        timestamp: z.string(),
        attributes: z
          .record(z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
      }),
    )
    .optional(),
  links: z
    .array(
      z.object({
        traceId: z.string(),
        spanId: z.string(),
        attributes: z
          .record(z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
      }),
    )
    .optional(),
  metadataType: z.nativeEnum(SpanMetadataTypes),
  metadataId: z.number(),
})

const factory = new Factory()

export const createHandler = factory.createHandlers(
  zValidator('json', createSpanSchema),
  async (c) => {
    const body = c.req.valid('json')

    const result = await createSpan({
      traceId: body.traceId,
      spanId: body.spanId,
      parentSpanId: body.parentSpanId,
      name: body.name,
      kind: body.kind,
      startTime: body.startTime,
      endTime: body.endTime,
      attributes: body.attributes,
      status: body.status,
      statusMessage: body.statusMessage,
      events: body.events,
      links: body.links,
      metadataType: body.metadataType,
      metadataId: body.metadataId,
    })

    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    return c.json(result.value)
  },
)
