import { getDataFromSession } from '$/data-access'
import { NextRequest, NextResponse } from 'next/server'

export function authHandler(handler: any) {
  return async (
    req: NextRequest,
    {
      params,
      ...rest
    }: {
      params: Promise<Record<string, string>>
    },
  ) => {
    const { user, workspace } = await getDataFromSession()
    if (!user || !workspace) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    return await handler(req, {
      ...rest,
      params: await params,
      user,
      workspace,
    })
  }
}
