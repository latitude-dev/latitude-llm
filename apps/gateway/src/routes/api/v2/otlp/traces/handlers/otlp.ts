import { chunk } from 'lodash-es'

import { zValidator } from '@hono/zod-validator'
import { setupJobs } from '@latitude-data/core/jobs'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { Factory } from 'hono/factory'
import { z } from 'zod'

const factory = new Factory()

// OTLP schema based on OpenTelemetry specification
const otlpTraceSchema = z.object({
  projectId: z.number(),
  resourceSpans: z.array(
    z.object({
      resource: z.object({
        attributes: z.array(
          z.object({
            key: z.string(),
            value: z.object({
              stringValue: z.string().optional(),
              intValue: z.number().optional(),
              boolValue: z.boolean().optional(),
            }),
          }),
        ),
      }),
      scopeSpans: z.array(
        z.object({
          spans: z.array(
            z.object({
              traceId: z.string(),
              spanId: z.string(),
              parentSpanId: z.string().optional(),
              name: z.string(),
              kind: z.number(), // SpanKind enum in OTLP
              startTimeUnixNano: z.string(),
              endTimeUnixNano: z.string().optional(),
              attributes: z
                .array(
                  z.object({
                    key: z.string(),
                    value: z.object({
                      stringValue: z.string().optional(),
                      intValue: z.number().optional(),
                      boolValue: z.boolean().optional(),
                    }),
                  }),
                )
                .optional(),
              status: z
                .object({
                  code: z.number(),
                  message: z.string().optional(),
                })
                .optional(),
              events: z
                .array(
                  z.object({
                    timeUnixNano: z.string(),
                    name: z.string(),
                    attributes: z
                      .array(
                        z.object({
                          key: z.string(),
                          value: z.object({
                            stringValue: z.string().optional(),
                            intValue: z.number().optional(),
                            boolValue: z.boolean().optional(),
                          }),
                        }),
                      )
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
                      .array(
                        z.object({
                          key: z.string(),
                          value: z.object({
                            stringValue: z.string().optional(),
                            intValue: z.number().optional(),
                            boolValue: z.boolean().optional(),
                          }),
                        }),
                      )
                      .optional(),
                  }),
                )
                .optional(),
            }),
          ),
        }),
      ),
    }),
  ),
})

const BATCH_SIZE = 50 // Adjust based on your needs

export const otlpTraceHandler = factory.createHandlers(
  zValidator('json', otlpTraceSchema),
  async (c) => {
    const body = c.req.valid('json')
    const workspace = c.get('workspace')
    const project = await new ProjectsRepository(workspace.id)
      .find(body.projectId)
      .then((result) => result.unwrap())

    // Flatten the spans array and include resource attributes
    const allSpans = body.resourceSpans.flatMap((resourceSpan) =>
      resourceSpan.scopeSpans.flatMap((scopeSpan) =>
        scopeSpan.spans.map((span) => ({
          span,
          resourceAttributes: resourceSpan.resource.attributes,
        })),
      ),
    )

    // Process spans in batches
    const batches = chunk(allSpans, BATCH_SIZE)
    const queues = await setupJobs()

    await Promise.all(
      batches.map((batch) =>
        queues.defaultQueue.jobs.enqueueProcessOtlpTracesJob({
          spans: batch,
          project,
        }),
      ),
    )

    return c.json({ status: 'ok' })
  },
)
