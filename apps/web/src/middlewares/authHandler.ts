import { User, WorkspaceDto } from '@latitude-data/core/browser'
import { UnauthorizedError } from '@latitude-data/core/lib/errors'
import { getCurrentUserOrError } from '$/services/auth/getCurrentUser'
import { NextRequest, NextResponse } from 'next/server'

export type DefaultParams = Record<string, unknown>
export type AuthContext<IReq extends DefaultParams> = {
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
  context: AuthContext<IReq>,
) => Promise<NextResponse<IResp>>

export function authHandler<
  IReq extends DefaultParams,
  IResp extends object = {},
>(handler: HandlerFn<IReq, IResp>) {
  return async (req: NextRequest, { ...rest }: AuthContext<IReq>) => {
    const { user, workspace } = await getUserOrUnauthorized()

    // We lie to TypeScript here because we know
    // that the params are actually a promise
    // But we want to pass the params resolved to the rest of the middlewares
    // and routes
    const promiseParams = rest.params as unknown as Promise<IReq>
    const params = await promiseParams
    return await handler(req, {
      ...rest,
      params,
      user,
      workspace,
    })
  }
}
