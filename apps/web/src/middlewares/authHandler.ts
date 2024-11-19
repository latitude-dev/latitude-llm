import { User, WorkspaceDto } from '@latitude-data/core/browser'
import { UnauthorizedError } from '@latitude-data/core/lib/errors'
import { getCurrentUserOrError } from '$/services/auth/getCurrentUser'
import { NextRequest, NextResponse } from 'next/server'

export type DefaultParams = Record<string, unknown>
export type Context<IReq extends DefaultParams> = {
  user: User
  workspace: WorkspaceDto
  params: IReq
}

async function getUserOrUnauthorized() {
  try {
    const { user, workspace } = await getCurrentUserOrError()
    return { user, workspace }
  } catch (error) {
    throw new UnauthorizedError('Unauthorized')
  }
}

export type HandlerFn<IReq extends DefaultParams, IResp extends object = {}> = (
  req: NextRequest,
  res: NextResponse<IResp>,
  context: Context<IReq>,
) => Promise<NextResponse<IResp>>

export function authHandler<
  IReq extends DefaultParams,
  IResp extends object = {},
>(handler: HandlerFn<IReq, IResp>) {
  return async (
    req: NextRequest,
    res: NextResponse<IResp>,
    _context: Context<IReq>,
  ) => {
    const { user, workspace } = await getUserOrUnauthorized()
    // This is Typescript lie, we know that res is NextResponse<IResp>
    // But because we want the return signature of the handler to be
    // (req: NextRequest, res: NextResponse<IResp>)
    // So in runtime we know params is a Promise<IReq>
    const requestContext = res as unknown as { params: Promise<IReq> }
    const params = await requestContext.params

    return await handler(req, res, {
      params,
      user,
      workspace,
    })
  }
}
