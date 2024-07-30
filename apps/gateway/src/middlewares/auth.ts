import {
  unsafelyFindWorkspace,
  unsafelyGetApiKeyByToken,
  Workspace,
} from '@latitude-data/core'
import { Context } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'

declare module 'hono' {
  interface ContextVariableMap {
    workspace: Workspace
  }
}

const authMiddleware = () =>
  bearerAuth({
    verifyToken: async (token: string, c: Context) => {
      const apiKeyResult = await unsafelyGetApiKeyByToken({ token })
      if (apiKeyResult.error) return false

      const workspaceResult = await unsafelyFindWorkspace(
        apiKeyResult.value.workspaceId,
      )
      if (workspaceResult.error) return false

      c.set('workspace', workspaceResult.value)

      return true
    },
  })

export default authMiddleware
