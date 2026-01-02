'use server'

import { pingCustomMCPServer } from '@latitude-data/core/services/integrations/index'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const pingCustomMcpAction = authProcedure
  .inputSchema(
    z.object({
      url: z.string(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
  )
  .action(
    async ({ parsedInput }) =>
      await pingCustomMCPServer(parsedInput.url, {
        headers: parsedInput.headers,
      }).then((r) => r.unwrap()),
  )
