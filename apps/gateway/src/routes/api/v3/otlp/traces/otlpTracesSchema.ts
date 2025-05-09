import { z } from '@hono/zod-openapi'

// OTLP schema based on OpenTelemetry specification
export const otlpTraceSchema = z.object({
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
