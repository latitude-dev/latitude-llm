'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { findProviderApiKeyById } from '@latitude-data/core/queries/providerApiKeys/findById'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { updateProviderApiKeyName } from '@latitude-data/core/services/providerApiKeys/updateName'

export const updateProviderApiKeyAction = authProcedure
  .inputSchema(z.object({ id: z.coerce.number(), name: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const providerApiKey = await findProviderApiKeyById({
      workspaceId: ctx.workspace.id,
      id: parsedInput.id,
    })

    return await updateProviderApiKeyName({
      providerApiKey,
      name: parsedInput.name,
      workspaceId: ctx.workspace.id,
    })
      .then((r) => r.unwrap())
      .then(providerApiKeyPresenter)
  })
