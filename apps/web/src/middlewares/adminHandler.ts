import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { notFound } from 'next/navigation'
import type { NextRequest } from 'next/server'

export function adminHandler(handler: any) {
  return async (
    req: NextRequest,
    { params, ...rest }: { params?: Promise<Record<string, string>> } = {},
  ) => {
    // biome-ignore lint/suspicious/noImplicitAnyLet: ignored using `--suppress`
    let user, workspace
    try {
      const { user: uzer, workspace: workzpace } = await getCurrentUserOrRedirect()
      user = uzer
      workspace = workzpace
    } catch (_error) {
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
