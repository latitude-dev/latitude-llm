import { getAllDocumentsAtCommitWithMetadata } from '$/common/documents/getData'
import { AppRouteHandler } from '$/openApi/types'
import { GetRoute } from './getAll.route'

// @ts-expect-error: broken types
export const getAllHandler: AppRouteHandler<GetRoute> = async (c) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid } = c.req.valid('param')
  const data = await getAllDocumentsAtCommitWithMetadata({
    workspace,
    projectId: Number(projectId!),
    commitUuid: versionUuid!,
  }).then((r) => r.unwrap())

  return c.json(data, 200)
}
