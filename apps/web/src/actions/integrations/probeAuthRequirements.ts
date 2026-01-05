'use server'

import { probeAuthRequirements } from '@latitude-data/core/services/integrations/index'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const probeAuthRequirementsAction = authProcedure
  .inputSchema(z.object({ url: z.string() }))
  .action(
    async ({ parsedInput }) =>
      await probeAuthRequirements(parsedInput.url).then((r) => r.unwrap()),
  )
