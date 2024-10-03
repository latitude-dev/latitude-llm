import type { ApiKey, Workspace } from '@latitude-data/core/browser'
import {
  unsafelyFindWorkspace,
  unsafelyGetApiKeyByToken,
} from '@latitude-data/core/data-access'
import { bearerAuth } from 'hono/bearer-auth'

declare module 'hono' {
  interface ContextVariableMap {
    workspace: Workspace
    apiKey: ApiKey
  }
}

const authMiddleware = () =>
  bearerAuth({
    verifyToken: async (token: string, c) => {
      const apiKeyResult = await unsafelyGetApiKeyByToken({ token })

      console.log('apiKeyResult', apiKeyResult)

      if (apiKeyResult.error) return false

      const workspace = await unsafelyFindWorkspace(
        apiKeyResult.value.workspaceId,
      )
      if (!workspace) return false

      c.set('workspace', workspace)
      c.set('apiKey', apiKeyResult.value)

      return true
    },
  })

export default authMiddleware
