import { Data } from "effect"

export class MarketingContactsError extends Data.TaggedError("MarketingContactsError")<{
  readonly operation: "createContact" | "updateContact"
  readonly userId: string
  readonly cause: unknown
}> {
  override get message() {
    return `Marketing contacts ${this.operation} failed for ${this.userId}`
  }
}
