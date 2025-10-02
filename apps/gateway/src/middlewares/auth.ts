import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { unsafelyGetApiKeyByToken } from '@latitude-data/core/data-access/apiKeys'
import { bearerAuth } from 'hono/bearer-auth'
import { type ApiKey, type Workspace } from '@latitude-data/core/schema/types'

declare module 'hono' {
  interface ContextVariableMap {
    workspace: Workspace
    apiKey: ApiKey
  }
}

const authMiddleware = () =>
  bearerAuth({
    verifyToken: async (token: string, c) => {
      try {
        const apiKeyResult = await unsafelyGetApiKeyByToken({ token })
        if (apiKeyResult.error) return false

        const workspace = await unsafelyFindWorkspace(
          apiKeyResult.value.workspaceId,
        )
        if (!workspace) return false

        c.set('workspace', workspace)
        c.set('apiKey', apiKeyResult.value)

        return true
      } catch (error) {
        return false
      }
    },
  })

export default authMiddleware
