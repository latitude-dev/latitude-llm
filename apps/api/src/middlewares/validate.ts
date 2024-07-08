import { UnprocessableEntityError } from '@src/common/errors'
import Result from '@src/services/result'
import { NextFunction, Request, Response } from 'express'
import { ZodError, ZodSchema } from 'zod'

export default function validate<D>(schema: ZodSchema<D>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.body)
      return next(Result.ok(parsed))
    } catch (err) {
      const error = err as ZodError
      const errorDetails = error.flatten().fieldErrors

      throw new UnprocessableEntityError('Validation failed', errorDetails)
    }
  }
}
