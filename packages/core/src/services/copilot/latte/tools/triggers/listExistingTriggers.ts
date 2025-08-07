import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import { DocumentTriggersRepository } from '../../../../../repositories'
import { defineLatteTool } from '../types'

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
