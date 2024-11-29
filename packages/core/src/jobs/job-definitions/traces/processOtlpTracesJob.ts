import { Job } from 'bullmq'

import { Project } from '../../../browser'
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
  project: Project
}

export const processOtlpTracesJob = async (
  job: Job<ProcessOtlpTracesJobData>,
) => {
  const { spans, project } = job.data

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

  const s = spans.map(({ span }) => processSpan({ span }))

  // Create all traces and spans in a single transaction, skipping existing traces
  await bulkCreateTracesAndSpans({
    project,
    traces: tracesToCreate,
    // @ts-ignore - Fix when we fix types in compiler
    spans: s,
  })
}
