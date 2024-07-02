import HttpStatusCodes from '@src/common/HttpStatusCodes'
import { Request, Response } from 'express'

export function completions(_: Request, res: Response) {
  return res.status(HttpStatusCodes.OK).json()
}
