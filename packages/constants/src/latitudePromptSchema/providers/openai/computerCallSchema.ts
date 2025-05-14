import { z } from 'zod'

export const ComputerCallSchema = z.object({
  type: z.literal('computer_use_preview'),
  display_height: z.number(),
  display_width: z.number(),
  environment: z.enum(['windows', 'mac', 'linux', 'ubuntu', 'browser']),
})
