'use server'

import { pingCustomMCPServer } from '@latitude-data/core/services/integrations/index'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const pingCustomMcpAction = authProcedure
  .inputSchema(z.object({ url: z.string() }))
  .action(
    async ({ parsedInput }) =>
      await pingCustomMCPServer(parsedInput.url).then((r) => r.unwrap()),
  )
