import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { User } from '@latitude-data/core/schema/models/types/User'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { NextRequest, NextResponse } from 'next/server'
import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
import { Providers } from '@latitude-data/constants'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const providerApiKeysScope = new ProviderApiKeysRepository(workspace.id)
      const rows = await providerApiKeysScope
        .findAll()
        .then((r) => r.unwrap())
        .then((r) => r.map(providerApiKeyPresenter))

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)

export const POST = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
        user,
      }: {
        workspace: Workspace
        user: User
      },
    ) => {
      const body = await req.json()
      const { name, provider, token, url, defaultModel, configuration } = body

      if (!name || !provider || !token) {
        return NextResponse.json(
          { message: 'Name, provider, and token are required' },
          { status: 400 },
        )
      }

      if (!Object.values(Providers).includes(provider)) {
        return NextResponse.json(
          { message: 'Invalid provider' },
          { status: 400 },
        )
      }

      const result = await createProviderApiKey({
        workspace,
        author: user,
        name,
        provider,
        token,
        url,
        defaultModel,
        configuration,
      })

      if (result.error) {
        return NextResponse.json(
          { message: result.error.message },
          { status: 400 },
        )
      }

      return NextResponse.json(
        providerApiKeyPresenter(result.value),
        { status: 201 },
      )
    },
  ),
)
