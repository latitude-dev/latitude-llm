import { documentPresenter } from '$/presenters/documentPresenter'
import { createFactory } from 'hono/factory'

import { getData } from './_shared'

const factory = createFactory()

export const getHandler = factory.createHandlers(async (c) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid, documentPath } = c.req.param()
  const { document } = await getData({
    workspace,
    projectId: Number(projectId!),
    commitUuid: versionUuid!,
    documentPath: documentPath!,
  }).then((r) => r.unwrap())

  return c.json(await documentPresenter(document))
})
