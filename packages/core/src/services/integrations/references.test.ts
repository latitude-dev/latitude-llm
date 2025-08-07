import {
  DocumentVersion,
  IntegrationType,
  Providers,
} from '@latitude-data/constants'
import { ForbiddenError } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'
import { IntegrationDto, Project, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import * as factories from '../../tests/factories'
import { destroyIntegration } from './destroy'
import { listReferences } from './references'

describe('listReferences', () => {
  let workspace: Workspace
  let project: Project
  let document: DocumentVersion
  let integration: IntegrationDto

  beforeEach(async () => {
    const {
      workspace: createdWorkspace,
      project: createdProject,
      documents,
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
    const result = await listReferences(integration)

    expect(Result.isOk(result)).toBe(true)
    expect(result.unwrap()).toEqual([])
  })

  it('should find references for an integration with configured triggers', async () => {
    const trigger = await factories.createIntegrationDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      integrationId: integration.id,
    })

    const result = await listReferences(integration)

    expect(Result.isOk(result)).toBe(true)
    expect(result.unwrap()).toEqual([
      {
        projectId: trigger.projectId,
        documentUuid: trigger.documentUuid,
        asTrigger: true,
      },
    ])
  })

  it('cannot destroy integration with references', async () => {
    await factories.createIntegrationDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      integrationId: integration.id,
    })

    const destroyResult = await destroyIntegration(integration)
    expect(Result.isOk(destroyResult)).toBe(false)
    expect(destroyResult.error).toBeInstanceOf(ForbiddenError)
  })
})
