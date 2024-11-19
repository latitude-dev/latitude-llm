import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(async (_: NextRequest, _res: NextResponse, { workspace }) => {
    const providerApiKeysScope = new ProviderApiKeysRepository(workspace.id)
    const rows = await providerApiKeysScope
      .findAll()
      .then((r) => r.unwrap())
      .then((r) => r.map(providerApiKeyPresenter))

    return NextResponse.json(rows, { status: 200 })
  }),
)
