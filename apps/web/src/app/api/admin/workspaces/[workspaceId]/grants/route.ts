import { adminHandler } from '$/middlewares/adminHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { BadRequestError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { GrantsRepository } from '@latitude-data/core/repositories'
import { findWorkspaceSubscription } from '@latitude-data/core/services/subscriptions/data-access/find'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(
    async (
      _: NextRequest,
      {
        params,
      }: {
        params: {
          workspaceId: number
        }
      },
    ) => {
      const { workspaceId } = params

      const workspace = await unsafelyFindWorkspace(workspaceId)
      if (!workspace) {
        throw new BadRequestError('Workspace not found')
      }

      const subscription = await findWorkspaceSubscription({ workspace }).then(
        (r) => r.unwrap(),
      )

      const repository = new GrantsRepository(workspace.id)
      const grants = await repository
        .listApplicable(subscription.billableFrom)
        .then((r) => r.unwrap())

      return NextResponse.json(grants, { status: 200 })
    },
  ),
)
