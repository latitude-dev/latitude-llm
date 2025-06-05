import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import { CommitsRepository } from '../../../../../repositories'
import { versionPresenter } from '../presenters'
import { defineLatteTool } from '../types'

const listDrafts = defineLatteTool(
  async ({ projectId }, { workspace }) => {
    const commitsScope = new CommitsRepository(workspace.id)
    const drafts = await commitsScope.getDrafts(projectId)

    return Result.ok(drafts.map(versionPresenter))
  },
  z.object({
    projectId: z.number(),
  }),
)

export default listDrafts
