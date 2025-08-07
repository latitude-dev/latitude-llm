'use server'

import { pingCustomMCPServer } from '@latitude-data/core/services/integrations/index'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const pingCustomMcpAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      url: z.string(),
    }),
  )
  .handler(async ({ input }) => await pingCustomMCPServer(input.url).then((r) => r.unwrap()))
