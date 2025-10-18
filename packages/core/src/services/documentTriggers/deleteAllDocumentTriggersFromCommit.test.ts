import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType, Providers } from '@latitude-data/constants'
import { type Commit } from '../../schema/models/types/Commit'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type DocumentTrigger } from '../../schema/models/types/DocumentTrigger'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type User } from '../../schema/models/types/User'
import { Result } from '../../lib/Result'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits'
import { createDocumentTrigger } from './create'
import { DocumentTriggersRepository } from '../../repositories'

const mocks = vi.hoisted(() => ({
  deployDocumentTrigger: vi.fn(),
  undeployDocumentTrigger: vi.fn(),
}))

vi.mock('./deploy', () => ({
  deployDocumentTrigger: mocks.deployDocumentTrigger,
  undeployDocumentTrigger: mocks.undeployDocumentTrigger,
}))

describe('deleting documents...', () => {
  let workspace: Workspace
  let project: Project
  let draft: Commit
  let document: DocumentVersion
  let user: User
  let deleteDocumentTriggersFromDocuments: typeof import('./deleteDocumentTriggersFromDocuments').deleteDocumentTriggersFromDocuments

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.resetModules()
    const deleteModule = await import('./deleteDocumentTriggersFromDocuments')
    deleteDocumentTriggersFromDocuments =
      deleteModule.deleteDocumentTriggersFromDocuments

    const {
      workspace: w,
      project: p,
      commit: c,
      documents,
      user: u,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        foo: factories.helpers.createPrompt({ provider: 'openai' }),
      },
      skipMerge: true,
    })

    workspace = w
    project = p
    draft = c
    document = documents[0]!
    user = u
  })

  describe('delete all triggers from commit', () => {
    it('returns ok and hard deletes all triggers in the draft commit', async () => {
      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings: {},
          triggerStatus: 'deployed',
        }),
      )
      // Create two triggers in the draft commit
      const created1 = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Email Trigger 1',
          emailWhitelist: ['a@example.com'],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
      }).then((r) => r.unwrap())

      const created2 = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: { cronExpression: '0 * * * *' },
      }).then((r) => r.unwrap())

      mocks.undeployDocumentTrigger
        .mockResolvedValueOnce(
          Result.ok(
            created1 as unknown as DocumentTrigger<DocumentTriggerType.Email>,
          ),
        )
        .mockResolvedValueOnce(
          Result.ok(
            created2 as unknown as DocumentTrigger<DocumentTriggerType.Scheduled>,
          ),
        )
      const result = await deleteDocumentTriggersFromDocuments({
        workspace,
        commit: draft,
        documents: [document],
      })

      expect(result.ok).toBeTruthy()

      const triggersScope = new DocumentTriggersRepository(workspace.id)
      const triggers = await triggersScope
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: draft,
        })
        .then((r) => r.unwrap())
      expect(triggers.find((t) => t.uuid === created1.uuid)).toBeUndefined()
      expect(triggers.find((t) => t.uuid === created2.uuid)).toBeUndefined()
    })

    it('returns ok when there are no triggers in the commit', async () => {
      const result = await deleteDocumentTriggersFromDocuments({
        workspace,
        commit: draft,
        documents: [document],
      })
      expect(result.ok).toBeTruthy()
    })

    it('deletes only triggers in the given commit, not in other commits', async () => {
      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings: {},
          triggerStatus: 'deployed',
        }),
      )

      const createdDraft = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Draft Trigger',
          emailWhitelist: [],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
      }).then((r) => r.unwrap())

      // Merge draft to create a live commit
      const merged = await mergeCommit(draft).then((r) => r.unwrap())

      // Create a new draft and a trigger in the new draft
      const { commit: newDraft } = await factories.createDraft({
        project,
        user,
      })

      mocks.undeployDocumentTrigger.mockResolvedValue(Result.ok(undefined))

      const createdNewDraft = await createDocumentTrigger({
        workspace,
        project,
        commit: newDraft,
        document,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: { cronExpression: '0 * * * *' },
      }).then((r) => r.unwrap())

      mocks.undeployDocumentTrigger.mockResolvedValueOnce(
        Result.ok(
          createdNewDraft as unknown as DocumentTrigger<DocumentTriggerType.Scheduled>,
        ),
      )

      const result = await deleteDocumentTriggersFromDocuments({
        workspace,
        commit: newDraft,
        documents: [document],
      })
      expect(result.ok).toBeTruthy()

      const triggersScope = new DocumentTriggersRepository(workspace.id)
      const triggersInNewDraft = await triggersScope
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: newDraft,
        })
        .then((r) => r.unwrap())
      expect(
        triggersInNewDraft.find((t) => t.uuid === createdNewDraft.uuid),
      ).toBeUndefined()

      // The trigger in the merged commit should still exist
      const triggersInMerged = await triggersScope
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: merged,
        })
        .then((r) => r.unwrap())
      expect(
        triggersInMerged.find((t) => t.uuid === createdDraft.uuid),
      ).toBeTruthy()
    })

    it('returns error if delete of any trigger fails', async () => {
      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings: {},
          triggerStatus: 'deployed',
        }),
      )

      // Create two triggers in the draft commit
      const created1 = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: { cronExpression: '0 * * * *' },
      }).then((r) => r.unwrap())

      const undeployError = new Error('Undeploy failed')
      mocks.undeployDocumentTrigger.mockResolvedValue(
        Result.error(undeployError),
      )

      const result = await deleteDocumentTriggersFromDocuments({
        workspace,
        commit: draft,
        documents: [document],
      })

      expect(result.ok).toBeFalsy()
      expect(result.error).toBe(undeployError)
      const triggersScope = new DocumentTriggersRepository(workspace.id)
      const triggers = await triggersScope
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: draft,
        })
        .then((r) => r.unwrap())
      // None should be deleted since the operation should have aborted on error
      expect(triggers.find((t) => t.uuid === created1.uuid)).toBeTruthy()
    })
  })
})
