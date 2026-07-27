import { Data } from "effect"

export class SpanDecodingError extends Data.TaggedError("SpanDecodingError")<{
  readonly reason: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.reason
  }
}

/**
 * Redaction failed for a batch. This must stay fatal to the ingest job: the
 * alternative is writing unredacted content for a project that asked us not to,
 * and because redaction is non-retroactive and there is no delete path, such a
 * write is permanent. Retrying and ultimately dropping the batch is the correct
 * trade for a compliance control.
 */
export class RedactionError extends Data.TaggedError("RedactionError")<{
  readonly reason: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return this.reason
  }
}
