import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { unsafelyGetApiKeyByToken } from '@latitude-data/core/queries/apiKeys/unsafelyGetApiKeyByToken'
import { bearerAuth } from 'hono/bearer-auth'
import { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'
import { ApiKey } from '@latitude-data/core/schema/models/types/ApiKey'

declare module 'hono' {
  interface ContextVariableMap {
    workspace: WorkspaceDto
    apiKey: ApiKey
  }
}

const authMiddleware = () =>
  bearerAuth({
    verifyToken: async (token: string, c) => {
      try {
        const apiKey = await unsafelyGetApiKeyByToken({ token })
        const workspace = await unsafelyFindWorkspace(apiKey.workspaceId)
        if (!workspace) return false

        c.set('workspace', workspace)
        c.set('apiKey', apiKey)

        return true
      } catch (_error) {
        return false
      }
    },
  })

export default authMiddleware
