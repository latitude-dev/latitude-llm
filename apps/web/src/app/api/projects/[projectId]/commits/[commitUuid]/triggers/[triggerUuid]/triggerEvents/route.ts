import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import {
  CommitsRepository,
  DocumentTriggersRepository,
  DocumentTriggerEventsRepository,
} from '@latitude-data/core/repositories'

export const GET = errorHandler(
  authHandler(
    async (
      _r: NextRequest,
      {
        params: { projectId: _projectId, commitUuid, triggerUuid },
        workspace,
      }: {
        params: { projectId: string; commitUuid: string; triggerUuid: string }
        workspace: Workspace
      },
    ) => {
      const projectId = parseInt(_projectId)

      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({
          uuid: commitUuid,
          projectId,
        })
        .then((r) => r.unwrap())

      // Validate that the trigger exists
      const documentTriggersScope = new DocumentTriggersRepository(workspace.id)
      await documentTriggersScope
        .getTriggerByUuid({ commit, uuid: triggerUuid })
        .then((r) => r.unwrap())

      // Get trigger events for this specific trigger
      const triggerEventsScope = new DocumentTriggerEventsRepository(
        workspace.id,
      )
      // Hard limit to avoid sending too many events. Maybe implement
      // pagination but the UI for now is to consume latest events
      const limit = 200
      const triggerEvents = await triggerEventsScope
        .getTriggerEventsInTrigger({ triggerUuid, commit, limit })
        .then((r) => r.unwrap())

      return NextResponse.json(triggerEvents, { status: 200 })
    },
  ),
)
