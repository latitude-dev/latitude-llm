import { AppRouteHandler } from '$/openApi/types'
import { unsafelyFindActiveRun } from '@latitude-data/core/data-access/runs'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { StopRoute } from './stop.route'
import { stopRunByDocument } from '@latitude-data/core/services/runs/active/byDocument/stop'

export const stopHandler: AppRouteHandler<StopRoute> = async (ctx) => {
  const { conversationUuid } = ctx.req.valid('param')
  const workspace = ctx.get('workspace')

  const run = await unsafelyFindActiveRun(conversationUuid).then((r) =>
    r.unwrap(),
  )
  if (run.workspaceId !== workspace.id) {
    throw new NotFoundError(
      `Active run with uuid ${conversationUuid} not found`,
    )
  }

  const repository = new ProjectsRepository(workspace.id)
  const project = await repository
    .getProjectById(run.projectId)
    .then((r) => r.unwrap())

  await stopRunByDocument({
    run,
    project,
    workspace,
    documentUuid: run.documentUuid,
  }).then((r) => r.unwrap())

  return ctx.body(null, 200)
}
