import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { type NextRequest, NextResponse } from 'next/server'

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
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!user.admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 })
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
