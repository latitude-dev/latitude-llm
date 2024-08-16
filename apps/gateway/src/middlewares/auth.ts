import {
  unsafelyFindWorkspace,
  unsafelyGetApiKeyByToken,
} from '@latitude-data/core'
import type { ApiKey, Workspace } from '@latitude-data/core/browser'
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
      if (apiKeyResult.error) return false

      const workspaceResult = await unsafelyFindWorkspace(
        apiKeyResult.value.workspaceId,
      )
      if (workspaceResult.error) return false

      c.set('workspace', workspaceResult.value)
      c.set('apiKey', apiKeyResult.value)

      return true
    },
  })

export default authMiddleware
