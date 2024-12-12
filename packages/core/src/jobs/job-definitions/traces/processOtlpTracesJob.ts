import { Job } from 'bullmq'

import { Workspace } from '../../../browser'
import { bulkCreateTracesAndSpans } from '../../../services/traces/bulkCreateTracesAndSpans'
import {
  convertOtlpAttributes,
  OtlpSpan,
  processSpan,
  ResourceSpan,
} from '../../../services/traces/otlp'

export type ProcessOtlpTracesJobData = {
  spans: {
    span: OtlpSpan
    resourceAttributes: ResourceSpan['resource']['attributes']
  }[]
  workspace: Workspace
}

export const processOtlpTracesJob = async (
  job: Job<ProcessOtlpTracesJobData>,
) => {
  const { spans, workspace } = job.data

  // Group spans by traceId for efficient trace creation
  const traceGroups = spans.reduce(
    (acc, { span, resourceAttributes }) => {
      const key = span.traceId

      if (!acc[key]) {
        acc[key] = {
          traceId: span.traceId,
          startTime: new Date(parseInt(span.startTimeUnixNano) / 1_000_000),
          endTime: span.endTimeUnixNano
            ? new Date(parseInt(span.endTimeUnixNano) / 1_000_000)
            : undefined,
          attributes: convertOtlpAttributes({ attributes: resourceAttributes }),
          spans: [],
        }
      }
      acc[key].spans.push(span)

      return acc
    },
    {} as Record<
      string,
      {
        traceId: string
        startTime: Date
        endTime?: Date
        attributes: Record<string, string | number | boolean>
        spans: OtlpSpan[]
      }
    >,
  )

  const tracesToCreate = Object.values(traceGroups).map(
    ({ traceId, startTime, endTime, attributes }) => ({
      traceId,
      startTime,
      endTime,
      attributes,
    }),
  )

  // Create all traces and spans in a single transaction, skipping existing traces
  await bulkCreateTracesAndSpans({
    workspace,
    traces: tracesToCreate,
    // @ts-expect-error - Fix when we fix types in compiler
    spans: spans.map(({ span }) => processSpan({ span })),
  })
}
