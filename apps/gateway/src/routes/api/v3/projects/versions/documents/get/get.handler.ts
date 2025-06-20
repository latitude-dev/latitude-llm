import { getData } from '$/common/documents/getData'
import { AppRouteHandler } from '$/openApi/types'
import { documentPresenter } from '$/presenters/documentPresenter'
import { GetRoute } from './get.route'

// @ts-expect-error: broken types
export const getHandler: AppRouteHandler<GetRoute> = async (c) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid, documentPath } = c.req.valid('param')
  const { document, commit } = await getData({
    workspace,
    projectId: Number(projectId!),
    commitUuid: versionUuid!,
    documentPath: documentPath!,
  }).then((r) => r.unwrap())

  const data = await documentPresenter({ document, commit, workspace })
  return c.json(data, 200)
}
