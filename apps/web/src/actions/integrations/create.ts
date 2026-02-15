'use server'

import { createIntegration } from '@latitude-data/core/services/integrations/create'
import { returnValidationErrors } from 'next-safe-action'
import { z } from 'zod'

import { IntegrationType } from '@latitude-data/constants'
import {
  externalMcpIntegrationConfigurationSchema,
  pipedreamIntegrationConfigurationSchema,
} from '@latitude-data/core/services/integrations/helpers/schema'
import { findIntegrationByName } from '@latitude-data/core/queries/integrations/findByName'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authProcedure } from '../procedures'

const nameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((name) => !name.includes(' '), {
    error: 'Name cannot contain spaces',
  })
  .refine((name) => !name.includes('/'), {
    error: 'Name cannot contain slashes',
  })

async function validateNameUnique(
  name: string,
  workspace: Workspace,
): Promise<boolean> {
  try {
    await findIntegrationByName({ workspaceId: workspace.id, name })
    return false
  } catch (e) {
    if (e instanceof NotFoundError) return true
    throw e
  }
}

const integrationSchema = z.discriminatedUnion('type', [
  z.object({
    name: nameSchema,
    type: z.literal(IntegrationType.ExternalMCP),
    configuration: externalMcpIntegrationConfigurationSchema,
  }),
  z.object({
    name: nameSchema,
    type: z.literal(IntegrationType.Pipedream),
    configuration: pipedreamIntegrationConfigurationSchema,
  }),
])

export const createIntegrationAction = authProcedure
  .inputSchema(integrationSchema)
  .action(async ({ parsedInput, ctx }) => {
    const uniqueName = await validateNameUnique(parsedInput.name, ctx.workspace)

    if (!uniqueName) {
      return returnValidationErrors(integrationSchema, {
        name: {
          _errors: ['An integration with this name already exists'],
        },
      })
    }

    const result = await createIntegration<typeof parsedInput.type>({
      workspace: ctx.workspace,
      name: parsedInput.name,
      type: parsedInput.type,
      configuration: parsedInput.configuration,
      author: ctx.user,
    }).then((r) => r.unwrap())

    return result
  })
