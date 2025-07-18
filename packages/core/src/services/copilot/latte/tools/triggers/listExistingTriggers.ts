import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import { defineLatteTool } from '../types'
import { DocumentTriggersRepository } from '../../../../../repositories'

const listExistingTriggers = defineLatteTool(
  async ({ promptUuid }, { workspace }) => {
    const documentTriggerScope = new DocumentTriggersRepository(workspace.id)
    const existingTriggers =
      await documentTriggerScope.findByDocumentUuid(promptUuid)
    return Result.ok(existingTriggers)
  },
  z.object({
    promptUuid: z.string(),
  }),
)

export default listExistingTriggers
