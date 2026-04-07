import type { ApiKeyId } from "@domain/shared"
import { Data } from "effect"

export class InvalidApiKeyNameError extends Data.TaggedError("InvalidApiKeyNameError")<{
  readonly name: string
  readonly reason: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.reason
  }
}

export class ApiKeyNotFoundError extends Data.TaggedError("ApiKeyNotFoundError")<{
  readonly id: ApiKeyId
}> {
  readonly httpStatus = 404
  readonly httpMessage = "API key not found"
}

export class ApiKeyAlreadyRevokedError extends Data.TaggedError("ApiKeyAlreadyRevokedError")<{
  readonly id: ApiKeyId
}> {
  readonly httpStatus = 409
  readonly httpMessage = "API key already revoked"
}
