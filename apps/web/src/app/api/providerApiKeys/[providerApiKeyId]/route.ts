import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { NextRequest, NextResponse } from 'next/server'
import { updateProviderApiKeyName } from '@latitude-data/core/services/providerApiKeys/updateName'
import { destroyProviderApiKey } from '@latitude-data/core/services/providerApiKeys/destroy'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { providerApiKeyId: string }
        workspace: Workspace
      },
    ) => {
      const { providerApiKeyId } = params
      const repo = new ProviderApiKeysRepository(workspace.id)
      const providerApiKey = await repo
        .find(providerApiKeyId)
        .then((r) => r.unwrap())

      return NextResponse.json(providerApiKeyPresenter(providerApiKey), {
        status: 200,
      })
    },
  ),
)

export const PUT = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { providerApiKeyId: string }
        workspace: Workspace
      },
    ) => {
      const { providerApiKeyId } = params
      const body = await req.json()
      const { name } = body

      if (!name) {
        return NextResponse.json(
          { message: 'Name is required' },
          { status: 400 },
        )
      }

      const repo = new ProviderApiKeysRepository(workspace.id)
      const providerApiKeyResult = await repo.find(providerApiKeyId)

      if (providerApiKeyResult.error) {
        return NextResponse.json(
          { message: 'Provider API key not found' },
          { status: 404 },
        )
      }

      const result = await updateProviderApiKeyName({
        providerApiKey: providerApiKeyResult.value,
        workspaceId: workspace.id,
        name,
      })

      if (result.error) {
        return NextResponse.json(
          { message: result.error.message },
          { status: 400 },
        )
      }

      return NextResponse.json(providerApiKeyPresenter(result.value), {
        status: 200,
      })
    },
  ),
)

export const DELETE = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { providerApiKeyId: string }
        workspace: Workspace
      },
    ) => {
      const { providerApiKeyId } = params
      const repo = new ProviderApiKeysRepository(workspace.id)
      const providerApiKeyResult = await repo.find(providerApiKeyId)

      if (providerApiKeyResult.error) {
        return NextResponse.json(
          { message: 'Provider API key not found' },
          { status: 404 },
        )
      }

      const result = await destroyProviderApiKey(providerApiKeyResult.value)

      if (result.error) {
        return NextResponse.json(
          { message: result.error.message },
          { status: 400 },
        )
      }

      return NextResponse.json(providerApiKeyPresenter(result.value), {
        status: 200,
      })
    },
  ),
)
