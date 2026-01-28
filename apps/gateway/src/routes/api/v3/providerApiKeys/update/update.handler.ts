import { Context } from 'hono'
import { z } from '@hono/zod-openapi'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { updateProviderApiKeyName } from '@latitude-data/core/services/providerApiKeys/updateName'

const updateProviderApiKeySchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
})

// @ts-expect-error: broken types
export const updateProviderApiKeyHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { providerApiKeyId } = c.req.param()

  try {
    const body = await c.req.json()
    const validation = updateProviderApiKeySchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.format(),
        },
        400,
      )
    }

    const { name } = validation.data

    const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
    const providerApiKeyResult = await providerApiKeysRepository.find(
      Number(providerApiKeyId),
    )

    if (providerApiKeyResult.error) {
      return c.json({ error: 'Provider API key not found' }, 404)
    }

    const result = await updateProviderApiKeyName({
      providerApiKey: providerApiKeyResult.value,
      workspaceId: workspace.id,
      name,
    })

    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    const updatedProviderApiKey = {
      ...result.value,
      token: '***masked***',
    }

    return c.json(updatedProviderApiKey, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
