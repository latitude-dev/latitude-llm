import { zValidator } from '@hono/zod-validator'
import { createTrace } from '@latitude-data/core/services/traces/create'
import { Factory } from 'hono/factory'
import { z } from 'zod'

const factory = new Factory()

const createTraceSchema = z.object({
  projectId: z.number(),
  traceId: z.string(),
  name: z.string().optional(),
  startTime: z.string().transform((str) => new Date(str)),
  endTime: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  attributes: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  status: z.string().optional(),
})

export const createHandler = factory.createHandlers(
  zValidator('json', createTraceSchema),
  async (c) => {
    const body = c.req.valid('json')
    const project = { id: body.projectId }

    const result = await createTrace({
      project,
      traceId: body.traceId,
      name: body.name,
      startTime: body.startTime,
      endTime: body.endTime,
      attributes: body.attributes,
      status: body.status,
    })

    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    return c.json(result.value)
  },
)
