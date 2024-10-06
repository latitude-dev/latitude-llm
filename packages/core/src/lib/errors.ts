type ErrorType = {
  [key: string]: string[] | undefined
  [key: number]: string[] | undefined
  [key: symbol]: string[] | undefined
}

export class LatitudeError extends Error {
  statusCode: number = 500
  name: string = 'UnexpectedError'

  public details: ErrorType

  constructor(message: string, details: ErrorType = {}) {
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

  constructor(message: string, details: ErrorType) {
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

export const databaseErrorCodes = {
  foreignKeyViolation: '23503',
  uniqueViolation: '23505',
}
