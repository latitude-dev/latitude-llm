import type { ApiKey, Workspace } from '@latitude-data/core/browser'
import {
  unsafelyFindWorkspace,
  unsafelyGetApiKeyByToken,
} from '@latitude-data/core/data-access'
import { Result } from '@latitude-data/core/lib/Result'
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
      try {
        const apiKeyResult = await unsafelyGetApiKeyByToken({ token })
        if (!Result.isOk(apiKeyResult)) return false

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
