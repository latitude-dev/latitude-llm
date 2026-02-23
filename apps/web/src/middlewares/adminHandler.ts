import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ForbiddenError, NotFoundError } from '@latitude-data/constants/errors'
import { NextRequest } from 'next/server'

export function adminHandler(handler: any) {
  return async (
    req: NextRequest,
    { params, ...rest }: { params?: Promise<Record<string, string>> } = {},
  ) => {
    let user, workspace
    try {
      const { user: uzer, workspace: workzpace } =
        await getCurrentUserOrRedirect()
      user = uzer
      workspace = workzpace
    } catch (_error) {
      throw new NotFoundError('User not found')
    }

    if (!user.admin) throw new ForbiddenError('Not an admin')

    const resolvedParams = params ? await params : {}

    return await handler(req, {
      ...rest,
      params: resolvedParams,
      user,
      workspace,
    })
  }
}
