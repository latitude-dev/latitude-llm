import { createFactory } from 'hono/factory'

import { getData } from './_shared'

const factory = createFactory()

export const getHandler = factory.createHandlers(async (c) => {
  const workspace = c.get('workspace')
  const { projectId, commitUuid, documentPath } = c.req.param()

  const { document } = await getData({
    workspace,
    projectId: Number(projectId!),
    commitUuid: commitUuid!,
    documentPath: documentPath!,
  })

  return c.json(document)
})
