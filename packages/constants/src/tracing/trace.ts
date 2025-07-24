import { Message } from 'promptl-ai'
import { z } from 'zod'
import { SegmentBaggage } from './segment'
import { AssembledSpan } from './span'

// See www.w3.org/TR/trace-context and w3c.github.io/baggage
export const traceContextSchema = z.object({
  traceparent: z.string(), // <version>-<trace-id>-<span-id>-<trace-flags>
  tracestate: z.string().optional(), // <key>=urlencoded(<value>)[,<key>=urlencoded(<value>)]*
  baggage: z.string().optional(), // <key>=urlencoded(<value>)[,<key>=urlencoded(<value>)]*
})
export type TraceContext = z.infer<typeof traceContextSchema>

export type TraceBaggage = {
  segment: Pick<SegmentBaggage, 'id' | 'parentId'> // Note: helper for third-party observability services
  segments: (SegmentBaggage &
    Pick<TraceContext, 'traceparent' | 'tracestate'> & {
      paused?: boolean
    })[]
}

export type TraceMetadata = {
  prompt: string
  configuration: Record<string, unknown>
  parameters: Record<string, unknown>
  input: Message[]
  // Fields below are optional if the spans had an error
  output?: Message[]
}

export const TRACE_METADATA_STORAGE_KEY = (
  workspaceId: number,
  conversationId: string,
  traceId: string,
) =>
  encodeURI(
    `workspaces/${workspaceId}/conversations/${conversationId}/${traceId}/metadata.json`,
  )
export const TRACE_METADATA_CACHE_TTL = 24 * 60 * 60 // 1 day

export type Trace = {
  id: string
  conversationId: string // Alias of logUuid
  workspaceId: number
  apiKeyId: number

  // externalId?: string // Custom user identifier // ??
  // source: SegmentSource // ??

  // status: SpanStatus // From the last span (errored spans have priority)
  // message?: string // From the last span (errored spans have priority)

  commitUuid: string // From current or inherited from parent
  documentUuid: string // From current or inherited from parent. When running an llm evaluation this is the evaluation uuid and source is Evaluation
  documentHash: string // From current run or document
  documentType: DocumentType // From current run or document
  experimentUuid?: string // From current or inherited from parent
  provider: string // From first completion span/segment or current run or document
  model: string // From first completion span/segment or current run or document
  tokens: number // Aggregated tokens from all completion spans/segments
  cost: number // Aggregated cost from all completion spans/segments

  duration: number // Elapsed time between the first and last span
  startedAt: Date // From the first span
  endedAt: Date // From the last span
  createdAt: Date
  updatedAt: Date
}

export type AssembledTrace = Trace & {
  children: AssembledSpan[]
  spans: number
}
