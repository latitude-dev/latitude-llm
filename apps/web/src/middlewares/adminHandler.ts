import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { notFound } from 'next/navigation'
import { NextRequest } from 'next/server'

export function adminHandler(handler: any) {
  return async (
    req: NextRequest,
    { params, ...rest }: { params?: Promise<Record<string, string>> } = {},
  ) => {
    let user: Awaited<ReturnType<typeof getCurrentUserOrRedirect>>['user']
    let workspace: Awaited<
      ReturnType<typeof getCurrentUserOrRedirect>
    >['workspace']
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
