import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { notFound } from 'next/navigation'
import { NextRequest } from 'next/server'
import { RouteHandler } from './types'

export function adminHandler<T>(handler: RouteHandler<T>) {
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
    } catch (error) {
      return notFound()
    }

    if (!user.admin) {
      return notFound()
    }

    const resolvedParams = params ? await params : {}

    return await handler(req, {
      ...rest,
      params: resolvedParams,
      user,
      workspace,
    })
  }
}
