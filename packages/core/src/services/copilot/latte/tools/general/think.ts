import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import { defineLatteTool } from '../types'

const think = defineLatteTool(
  async () => {
    return Result.ok({})
  },
  z.object({
    action: z.enum(['understand', 'plan', 'reflect']),
    thought: z.string(),
  }),
)

export default think
