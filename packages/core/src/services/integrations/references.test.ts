import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Project, IntegrationDto, Workspace, Commit } from '../../browser'
import { listIntegrationReferences } from './references'
import {
  DocumentVersion,
  IntegrationType,
  Providers,
} from '@latitude-data/constants'
import * as factories from '../../tests/factories'
import { Result } from '../../lib/Result'
import { destroyIntegration } from './destroy'
import { ForbiddenError } from '@latitude-data/constants/errors'

const mocks = vi.hoisted(() => ({
  deployDocumentTrigger: vi.fn(),
  undeployDocumentTrigger: vi.fn(),
}))

vi.mock('../documentTriggers/deploy', () => ({
  deployDocumentTrigger: mocks.deployDocumentTrigger,
  undeployDocumentTrigger: mocks.undeployDocumentTrigger,
}))

describe('listReferences', () => {
  let workspace: Workspace
  let project: Project
  let document: DocumentVersion
  let integration: IntegrationDto
  let commit: Commit

  beforeEach(async () => {
    const {
      workspace: createdWorkspace,
      project: createdProject,
      documents,
      commit: createdCommit,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'content',
        }),
      },
    })
    workspace = createdWorkspace
    document = documents[0]!
    project = createdProject
    commit = createdCommit

    integration = await factories.createIntegration({
      workspace,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'app-name',
        connectionId: 'connection-id',
        externalUserId: 'external-user-id',
        authType: 'oauth',
        oauthAppId: 'oauth-app-id',
      },
    })
  })

  it('should not find any references for an integration with no configured triggers', async () => {
    const result = await listIntegrationReferences(integration)

    expect(Result.isOk(result)).toBe(true)
    expect(result.unwrap()).toEqual([])
  })

  it('should find references for an integration with configured triggers', async () => {
    const trigger = await factories.createIntegrationDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      integrationId: integration.id,
    })

    const result = await listIntegrationReferences(integration)

    expect(Result.isOk(result)).toBe(true)
    expect(result.unwrap()).toEqual([
      {
        integrationName: integration.name,
        projectId: trigger.projectId,
        commitId: commit.id,
        documentUuid: trigger.documentUuid,
        triggerUuid: trigger.uuid,
        type: 'trigger',
      },
    ])
  })

  it('cannot destroy integration with references', async () => {
    await factories.createIntegrationDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      integrationId: integration.id,
    })

    const destroyResult = await destroyIntegration(integration)
    expect(Result.isOk(destroyResult)).toBe(false)
    expect(destroyResult.error).toBeInstanceOf(ForbiddenError)
  })
})
