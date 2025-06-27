'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { listApps } from '@latitude-data/core/services/integrations/pipedream/apps'

export const listPipedreamIntegrationsAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      query: z.string().optional(),
      cursor: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    return listApps({ query: input.query, cursor: input.cursor }).then((r) =>
      r.unwrap(),
    )
  })
