import { Result } from '../../../../../lib/Result'
import { CommitsRepository } from '../../../../../repositories'
import { versionPresenter } from '../presenters'
import { defineLatteTool } from '../types'

const listDrafts = defineLatteTool(async (_args, { workspace, project }) => {
  const commitsScope = new CommitsRepository(workspace.id)
  const drafts = await commitsScope.getDrafts(project.id)

  return Result.ok(drafts.map(versionPresenter))
})

export default listDrafts
