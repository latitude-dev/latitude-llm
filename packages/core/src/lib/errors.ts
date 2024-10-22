export type LatitudeErrorDetails = {
  [key: string]: string[] | string | undefined
  [key: number]: string[] | string | undefined
  [key: symbol]: string[] | string | undefined
}

export class LatitudeError extends Error {
  statusCode: number = 500
  name: string = 'UnexpectedError'
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
  public name = 'ConflictError'
}

export class UnprocessableEntityError extends LatitudeError {
  public statusCode = 422
  public name = 'UnprocessableEntityError'

  constructor(message: string, details: LatitudeErrorDetails) {
    super(message, details)
  }
}

export class NotFoundError extends LatitudeError {
  public statusCode = 404
  public name = 'NotFoundError'
}

export class BadRequestError extends LatitudeError {
  public statusCode = 400
  public name = 'BadRequestError'
}

export class ForbiddenError extends LatitudeError {
  public statusCode = 403
  public name = 'ForbiddenError'
}

export class UnauthorizedError extends LatitudeError {
  public statusCode = 401
  public name = 'UnauthorizedError'
}
export class RateLimitError extends LatitudeError {
  public statusCode = 429
  public name = 'RateLimitError'

  constructor(
    message: string,
    retryAfter: number,
    limit: number,
    remaining: number,
    resetTime: number,
  ) {
    super(message)
    this.headers = {
      'Retry-After': retryAfter.toString(),
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': resetTime.toString(),
    }
  }
}

export const databaseErrorCodes = {
  foreignKeyViolation: '23503',
  uniqueViolation: '23505',
}
