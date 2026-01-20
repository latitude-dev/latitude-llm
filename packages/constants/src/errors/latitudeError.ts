import {
  LatitudeErrorCodes,
  LatitudeErrorDetails,
  RunErrorCodes,
} from './constants'

export type LatitudeErrorDto = {
  name: LatitudeErrorCodes
  code: RunErrorCodes
  status: number
  message: string
  details: Record<string, unknown>
}

export class LatitudeError extends Error {
  statusCode: number = 500
  name: string = LatitudeErrorCodes.UnexpectedError
  headers: Record<string, string> = {}

  public details: LatitudeErrorDetails

  constructor(
    message: string,
    details?: LatitudeErrorDetails,
    status?: number,
    name?: string,
  ) {
    super(message)
    this.details = details ?? {}
    this.statusCode = status ?? this.statusCode
    this.name = name ?? this.constructor.name
  }

  serialize(): LatitudeErrorDto {
    return {
      name: this.name as LatitudeErrorCodes,
      code: this.name as RunErrorCodes,
      status: this.statusCode,
      message: this.message,
      details: this.details,
    }
  }

  static deserialize(json: LatitudeErrorDto): LatitudeError {
    return new LatitudeError(
      json.message,
      json.details as LatitudeErrorDetails,
      json.status,
      json.name,
    )
  }
}

export class OverloadedError extends LatitudeError {
  public statusCode = 429
  public name = LatitudeErrorCodes.OverloadedError
}

export class AbortedError extends LatitudeError {
  public statusCode = 499
  public reason = 'Client Closed Request'
  public name = LatitudeErrorCodes.AbortedError
  constructor(message: string = 'Operation was aborted') {
    super(message)
    this.reason = message
  }
}

export class ConflictError extends LatitudeError {
  public statusCode = 409
  public name = LatitudeErrorCodes.ConflictError
}

export class UnprocessableEntityError extends LatitudeError {
  public statusCode = 422
  public name = LatitudeErrorCodes.UnprocessableEntityError

  constructor(message: string, details: LatitudeErrorDetails = {}) {
    super(message, details)
  }
}

export class NotFoundError extends LatitudeError {
  public statusCode = 404
  public name = LatitudeErrorCodes.NotFoundError
}

export class BadRequestError extends LatitudeError {
  public statusCode = 400
  public name = LatitudeErrorCodes.BadRequestError
}

export class ForbiddenError extends LatitudeError {
  public statusCode = 403
  public name = LatitudeErrorCodes.ForbiddenError
}

export class UnauthorizedError extends LatitudeError {
  public statusCode = 401
  public name = LatitudeErrorCodes.UnauthorizedError
}
export class RateLimitError extends LatitudeError {
  public statusCode = 429
  public name = LatitudeErrorCodes.RateLimitError

  constructor(
    message: string,
    retryAfter?: number,
    limit?: number,
    remaining?: number,
    resetTime?: number,
  ) {
    super(message)

    this.headers = {}
    if (retryAfter !== undefined) {
      this.headers['Retry-After'] = retryAfter.toString()
    }
    if (limit !== undefined) {
      this.headers['X-RateLimit-Limit'] = limit.toString()
    }
    if (remaining !== undefined) {
      this.headers['X-RateLimit-Remaining'] = remaining.toString()
    }
    if (resetTime !== undefined) {
      this.headers['X-RateLimit-Reset'] = resetTime.toString()
    }
  }
}

export class NotImplementedError extends LatitudeError {
  public statusCode = 501
  public name = LatitudeErrorCodes.NotImplementedError
}

export class PaymentRequiredError extends LatitudeError {
  public statusCode = 402
  public name = LatitudeErrorCodes.PaymentRequiredError
}

export type BillingErrorTags = {
  workspaceId?: number
  userEmail?: string
  stripeCustomerId?: string
  plan?: string
}

/**
 * Error class for billing-related failures (Stripe API errors, etc.).
 * Includes tags for error tracking in Datadog.
 */
export class BillingError extends LatitudeError {
  public statusCode = 400
  public name = LatitudeErrorCodes.BillingError
  public tags: BillingErrorTags
  public originalError?: Error

  constructor(
    message: string,
    {
      tags = {},
      originalError,
    }: {
      tags?: BillingErrorTags
      originalError?: Error
    } = {},
  ) {
    super(message, {
      workspaceId: tags.workspaceId?.toString(),
      userEmail: tags.userEmail,
      stripeCustomerId: tags.stripeCustomerId,
      plan: tags.plan,
    })
    this.tags = tags
    this.originalError = originalError
  }
}

export const databaseErrorCodes = {
  foreignKeyViolation: '23503',
  uniqueViolation: '23505',
  lockNotAvailable: '55P03',
}
