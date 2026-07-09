import { Data } from "effect"

export class InvalidElevenlabsSignatureError extends Data.TaggedError("InvalidElevenlabsSignatureError")<{
  readonly reason: "format" | "stale" | "mismatch"
}> {}
