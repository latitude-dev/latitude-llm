import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { DocumentLogsWithMetadataAndErrorsRepository } from '@latitude-data/core/repositories/documentLogsWithMetadataAndErrorsRepository/index'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { uuid: string }
        workspace: Workspace
      },
    ) => {
      const uuid = params.uuid
      const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspace.id)
      const documentLog = await repo.findByUuid(uuid).then((r) => r.unwrap())

      return NextResponse.json(documentLog, { status: 200 })
    },
  ),
)
