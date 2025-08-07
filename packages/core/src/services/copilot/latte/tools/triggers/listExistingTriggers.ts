import { z } from 'zod'
import { defineLatteTool } from '../types'
import { CommitsRepository, DocumentTriggersRepository } from '../../../../../repositories'

const listExistingTriggers = defineLatteTool(
  async ({ promptUuid, versionUuid }, { workspace }) => {
    const commitsScope = new CommitsRepository(workspace.id)
    const commit = await commitsScope
      .getCommitByUuid({
        uuid: versionUuid,
      })
      .then((r) => r.unwrap())

    const documentTriggerScope = new DocumentTriggersRepository(workspace.id)
    return await documentTriggerScope.getTriggersInDocument({
      documentUuid: promptUuid,
      commit,
    })
  },
  z.object({
    promptUuid: z.string(),
    versionUuid: z.string(),
  }),
)

export default listExistingTriggers
