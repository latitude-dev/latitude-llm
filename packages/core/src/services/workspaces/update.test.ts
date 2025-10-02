import { beforeEach, describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { User, Workspace } from '../../schema/types'
import { WorkspacesRepository } from '../../repositories'
import { createProject, createProviderApiKey } from '../../tests/factories'
import { updateWorkspace } from './update'

describe('updateWorkspace', () => {
  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    const { workspace: w, user: u } = await createProject({
      workspace: {
        name: 'workspace',
        defaultProviderId: null,
      },
    })
    workspace = w
    user = u
  })

  it('should update the workspace', async () => {
    const provider = await createProviderApiKey({
      workspace,
      user,
      name: 'provider',
      type: Providers.OpenAI,
    })

    const result = await updateWorkspace(workspace, {
      name: 'new-name',
      defaultProviderId: provider.id,
    })

    expect(result.ok).toBe(true)

    workspace = result.unwrap()

    expect(workspace.name).toBe('new-name')
    expect(workspace.defaultProviderId).toBe(provider.id)

    const workspacesScope = new WorkspacesRepository(user.id)
    workspace = await workspacesScope.find(workspace.id).then((r) => r.unwrap())

    expect(workspace.name).toBe('new-name')
    expect(workspace.defaultProviderId).toBe(provider.id)
  })
})
