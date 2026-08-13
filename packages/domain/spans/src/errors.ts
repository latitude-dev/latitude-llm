import { Data } from "effect"

export class SpanDecodingError extends Data.TaggedError("SpanDecodingError")<{
  readonly reason: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.reason
  }
}

/** Must stay fatal to the ingest job: inserting unredacted content is permanent, since redaction has no delete path. */
export class RedactionError extends Data.TaggedError("RedactionError")<{
  readonly reason: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return this.reason
  }
}
