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

export type HandlerFn<IReq extends DefaultParams, IResp extends object = {}> = (
  req: NextRequest,
  context: AuthContext<IReq>,
) => Promise<NextResponse<IResp>>

export function authHandler<
  IReq extends DefaultParams,
  IResp extends object = {},
>(handler: HandlerFn<IReq, IResp>) {
  return async (req: NextRequest, { ...rest }: AuthContext<IReq>) => {
    try {
      const { user: uzer, workspace: workzpace } = await getCurrentUserOrError()
      const user = uzer
      const workspace = workzpace
      return await handler(req, {
        ...rest,
        params: rest.params ?? {},
        user,
        workspace,
      })
    } catch (error) {
      throw new UnauthorizedError('Unauthorized')
    }
  }
}
