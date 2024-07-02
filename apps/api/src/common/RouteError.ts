import HttpStatusCodes from '@src/common/HttpStatusCodes'

/**
 * Error with status code and message
 */
class RouteError extends Error {
  public status: HttpStatusCodes

  public constructor(status: HttpStatusCodes, message: string) {
    super(message)
    this.status = status
  }
}

// **** Export default **** //

export default RouteError
