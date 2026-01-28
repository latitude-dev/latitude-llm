import { Context } from 'hono'
import { z } from '@hono/zod-openapi'
import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
import { findFirstUserInWorkspace } from '@latitude-data/core/data-access/users'
import { Providers } from '@latitude-data/constants'

const createProviderApiKeySchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  provider: z.nativeEnum(Providers),
  token: z.string().min(1, 'Token is required'),
  url: z.string().optional(),
  defaultModel: z.string().optional(),
  configuration: z.record(z.string(), z.any()).optional(),
})

export const createProviderApiKeyHandler = async (c: Context) => {
  const workspace = c.get('workspace')

  try {
    const body = await c.req.json()
    const validation = createProviderApiKeySchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.format(),
        },
        400,
      )
    }

    const { name, provider, token, url, defaultModel, configuration } =
      validation.data

    const user = await findFirstUserInWorkspace(workspace)
    if (!user) {
      return c.json({ error: 'No users found in workspace' }, 400)
    }

    try {
      const result = await createProviderApiKey({
        workspace,
        author: user,
        name,
        provider,
        token,
        url,
        defaultModel,
        configuration,
      })

      if (result.error) {
        return c.json({ error: result.error.message }, 400)
      }

      return c.json(result.value, 201)
    } catch (serviceError) {
      const errorMessage =
        serviceError instanceof Error
          ? serviceError.message
          : String(serviceError || 'Unknown error')
      return c.json({ error: errorMessage }, 400)
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error || 'Unknown error')
    console.error('Unexpected error:', error)
    return c.json({ error: errorMessage }, 500)
  }
}
