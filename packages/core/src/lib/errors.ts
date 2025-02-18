import { LatitudeErrorCodes } from '@latitude-data/constants/errors'

export type LatitudeErrorDetails = {
  [key: string]: string[] | string | undefined
  [key: number]: string[] | string | undefined
  [key: symbol]: string[] | string | undefined
}

export class LatitudeError extends Error {
  statusCode: number = 500
  name: string = LatitudeErrorCodes.UnexpectedError
  headers: Record<string, string> = {}

  public details: LatitudeErrorDetails

  constructor(message: string, details: LatitudeErrorDetails = {}) {
    super(message)
    this.details = details
    this.name = this.constructor.name
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

export const databaseErrorCodes = {
  foreignKeyViolation: '23503',
  uniqueViolation: '23505',
  lockNotAvailable: '55P03',
}
