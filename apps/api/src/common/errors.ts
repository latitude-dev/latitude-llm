import HttpStatusCodes from './HttpStatusCodes'

type ErrorType = {
  [key: string]: string[] | undefined
  [key: number]: string[] | undefined
  [key: symbol]: string[] | undefined
}

export class LatitudeError extends Error {
  statusCode: number = HttpStatusCodes.BAD_REQUEST
  name: string = 'UnexpectedError'

  public details: ErrorType

  constructor(message: string, details: ErrorType = {}) {
    super(message)
    this.details = details
  }
}

export class ConflictError extends LatitudeError {
  public statusCode = HttpStatusCodes.CONFLICT
  public name = 'ConflictError'
}

export class UnprocessableEntityError extends LatitudeError {
  public statusCode = HttpStatusCodes.UNPROCESSABLE_ENTITY
  public name = 'UnprocessableEntityError'
  constructor(message: string, details: ErrorType) {
    super(message, details)
  }
}

export class NotFoundError extends LatitudeError {
  public statusCode = HttpStatusCodes.NOT_FOUND
  public name = 'NotFoundError'
}

export class ForbiddenError extends LatitudeError {
  public statusCode = HttpStatusCodes.FORBIDDEN
  public name = 'ForbiddenError'
}

export class UnauthorizedError extends LatitudeError {
  public statusCode = HttpStatusCodes.UNAUTHORIZED
  public name = 'UnauthorizedError'
}
