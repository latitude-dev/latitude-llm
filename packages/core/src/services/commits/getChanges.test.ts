import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Project } from '../../schema/models/types/Project'
import type { User } from '../../schema/models/types/User'
import type { Workspace } from '../../schema/models/types/Workspace'
import {
  Providers,
  DocumentTriggerType,
  ModifiedDocumentType,
  DocumentTriggerStatus,
  EvaluationType,
  DocumentType,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { destroyDocument, updateDocument } from '../documents'
import * as factories from '../../tests/factories'
import { createDocumentTrigger } from '../documentTriggers/create'
import { database } from '../../client'
import { documentTriggers } from '../../schema/models/documentTriggers'
import { commits } from '../../schema/models/commits'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
  createEvaluationV2,
} from '../../tests/factories'
import { getCommitChanges, changesPresenter } from './getChanges'
import { mergeCommit } from './merge'
import { deleteDocumentTrigger } from '../documentTriggers/delete'

let project: Project
let draftCommit: Commit
let documents: Record<string, DocumentVersion>
let workspace: Workspace
let user: User

describe('getCommitChanges', () => {
  beforeEach(async () => {
    const {
      project: prj,
      user: usr,
      workspace: ws,
      documents: docs,
    } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        folder1: {
          doc1: helpers.createPrompt({
            provider: 'openai',
            content: 'content1',
          }),
        },
        doc2: helpers.createPrompt({ provider: 'openai', content: 'content2' }),
      },
    })
    workspace = ws
    user = usr
    project = prj
    const { commit: draft } = await createDraft({ project, user })
    draftCommit = draft
    documents = docs.reduce(
      (acc, doc) => {
        acc[doc.path] = doc
        return acc
      },
      {} as Record<string, DocumentVersion>,
    )
  })

  describe('document changes', () => {
    it('returns no changes when commit is unchanged', async () => {
      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(false)
      expect(changes.hasIssues).toBe(false)
      expect(changes.documents.all).toEqual([])
      expect(changes.documents.clean).toEqual([])
      expect(changes.documents.errors).toEqual([])
      expect(changes.documents.hasErrors).toBe(false)
    })

    it('shows changed documents', async () => {
      await updateDocument({
        document: documents['folder1/doc1']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: 'content1.1',
        }),
        commit: draftCommit,
      }).then((r) => r.unwrap())

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(true)
      expect(changes.hasIssues).toBe(false)

      expect(changes.documents.hasErrors).toBe(false)
      expect(changes.documents.all).toEqual([
        {
          documentUuid: documents['folder1/doc1']!.documentUuid,
          path: 'folder1/doc1',
          changeType: ModifiedDocumentType.Updated,
          errors: 0,
        },
      ])
      expect(changes.documents.clean).toEqual(changes.documents.all)
      expect(changes.documents.errors).toEqual([])
    })

    it('shows created documents', async () => {
      const { documentVersion: newDoc } = await createDocumentVersion({
        workspace: workspace,
        user: user,
        commit: draftCommit,
        path: 'folder1/doc3',
        content: helpers.createPrompt({
          provider: 'openai',
          content: 'content3',
        }),
      })

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.documents.all).toEqual([
        {
          documentUuid: newDoc.documentUuid,
          path: 'folder1/doc3',
          changeType: ModifiedDocumentType.Created,
          errors: 0,
        },
      ])
    })

    it('shows deleted documents', async () => {
      await destroyDocument({
        document: documents['folder1/doc1']!,
        commit: draftCommit,
        workspace: workspace,
      }).then((r) => r.unwrap())

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.documents.all).toEqual([
        {
          documentUuid: documents['folder1/doc1']!.documentUuid,
          path: 'folder1/doc1',
          changeType: ModifiedDocumentType.Deleted,
          errors: 0,
        },
      ])
    })

    it('shows path changes as UpdatedPath', async () => {
      await updateDocument({
        document: documents['folder1/doc1']!,
        path: 'folder2/doc1-renamed',
        commit: draftCommit,
      }).then((r) => r.unwrap())

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.documents.all).toEqual([
        {
          documentUuid: documents['folder1/doc1']!.documentUuid,
          path: 'folder2/doc1-renamed',
          changeType: ModifiedDocumentType.UpdatedPath,
          errors: 0,
        },
      ])
    })

    it('shows documents with errors sorted by error count', async () => {
      await updateDocument({
        document: documents['folder1/doc1']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: 'Content doc1 changed',
        }),
        commit: draftCommit,
      }).then((r) => r.unwrap())
      await updateDocument({
        document: documents['doc2']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: '{{ WRONG ',
        }),
        commit: draftCommit,
      }).then((r) => r.unwrap())

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(true)
      expect(changes.hasIssues).toBe(true)

      expect(changes.documents.hasErrors).toBe(true)
      expect(changes.documents.all).toEqual([
        {
          documentUuid: documents['doc2']!.documentUuid,
          path: 'doc2',
          changeType: ModifiedDocumentType.Updated,
          errors: 1,
        },
        {
          documentUuid: documents['folder1/doc1']!.documentUuid,
          path: 'folder1/doc1',
          changeType: ModifiedDocumentType.Updated,
          errors: 0,
        },
      ])
      expect(changes.documents.errors).toEqual([
        {
          documentUuid: documents['doc2']!.documentUuid,
          path: 'doc2',
          changeType: ModifiedDocumentType.Updated,
          errors: 1,
        },
      ])
      expect(changes.documents.clean).toEqual([
        {
          documentUuid: documents['folder1/doc1']!.documentUuid,
          path: 'folder1/doc1',
          changeType: ModifiedDocumentType.Updated,
          errors: 0,
        },
      ])
    })

    it('does not include errors from deleted documents', async () => {
      await updateDocument({
        document: documents['folder1/doc1']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: '<prompt path="../doc2" />',
        }),
        commit: draftCommit,
      }).then((r) => r.unwrap())

      await mergeCommit(draftCommit).then((r) => r.unwrap())

      const { commit: newCommit } = await createDraft({
        project: project,
        user: user,
      })

      // Renaming the doc2 will make the doc1 to contain errors
      await updateDocument({
        document: documents['doc2']!,
        path: 'new-doc2',
        commit: newCommit,
      }).then((r) => r.unwrap())

      // Now this doc contains errors, but we remove it anyways
      await destroyDocument({
        document: documents['folder1/doc1']!,
        commit: newCommit,
        workspace: workspace,
      }).then((r) => r.unwrap())

      const changes = await getCommitChanges({
        commit: newCommit,
        workspace,
      }).then((r) => r.unwrap())

      // There should be no errors from deleted documents
      expect(changes.documents.all).toEqual(
        expect.arrayContaining([
          {
            documentUuid: documents['doc2']!.documentUuid,
            path: 'new-doc2',
            changeType: ModifiedDocumentType.UpdatedPath,
            errors: 0,
          },
          {
            documentUuid: documents['folder1/doc1']!.documentUuid,
            path: 'folder1/doc1',
            changeType: ModifiedDocumentType.Deleted,
            errors: 0,
          },
        ]),
      )
    })
  })

  describe('trigger changes', () => {
    it('shows no trigger changes when none exist', async () => {
      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(false)
      expect(changes.hasIssues).toBe(false)

      expect(changes.triggers.hasPending).toBe(false)
      expect(changes.triggers.all).toEqual([])
      expect(changes.triggers.clean).toEqual([])
      expect(changes.triggers.pending).toEqual([])
    })

    it('shows created document triggers', async () => {
      const trigger = await createDocumentTrigger({
        workspace,
        project,
        commit: draftCommit,
        document: documents['folder1/doc1']!,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Test Email Trigger',
          replyWithResponse: true,
          emailWhitelist: [],
          domainWhitelist: [],
          parameters: {},
        },
      }).then((r) => r.unwrap())

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(true)
      expect(changes.hasIssues).toBe(false)

      const expectedTrigger = {
        triggerUuid: trigger.uuid,
        documentUuid: documents['folder1/doc1']!.documentUuid,
        triggerType: DocumentTriggerType.Email,
        changeType: ModifiedDocumentType.Created,
        status: DocumentTriggerStatus.Deployed,
      }

      expect(changes.triggers.hasPending).toBe(false)
      expect(changes.triggers.all).toEqual([expectedTrigger])
      expect(changes.triggers.clean).toEqual([expectedTrigger])
      expect(changes.triggers.pending).toEqual([])
    })

    it('shows trigger errors when trigger status is pending', async () => {
      const trigger = await createDocumentTrigger({
        workspace,
        project,
        commit: draftCommit,
        document: documents['folder1/doc1']!,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: {
          cronExpression: '0 * * * *',
        },
      }).then((r) => r.unwrap())

      // Manually update the trigger status to 'pending' to simulate an error state
      await database
        .update(documentTriggers)
        .set({ triggerStatus: 'pending' })
        .where(eq(documentTriggers.uuid, trigger.uuid))

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(true)
      expect(changes.hasIssues).toBe(true)

      const expectedTrigger = {
        triggerUuid: trigger.uuid,
        documentUuid: documents['folder1/doc1']!.documentUuid,
        triggerType: DocumentTriggerType.Scheduled,
        changeType: ModifiedDocumentType.Created,
        status: DocumentTriggerStatus.Pending,
      }

      expect(changes.triggers.hasPending).toBe(true)
      expect(changes.triggers.all).toEqual([expectedTrigger])
      expect(changes.triggers.clean).toEqual([])
      expect(changes.triggers.pending).toEqual([expectedTrigger])
    })

    it('shows triggers sorted by status (pending first)', async () => {
      const deployedTrigger = await createDocumentTrigger({
        workspace,
        project,
        commit: draftCommit,
        document: documents['folder1/doc1']!,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Deployed Email Trigger',
          replyWithResponse: true,
          emailWhitelist: [],
          domainWhitelist: [],
          parameters: {},
        },
      }).then((r) => r.unwrap())

      const pendingTrigger = await createDocumentTrigger({
        workspace,
        project,
        commit: draftCommit,
        document: documents['doc2']!,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: {
          cronExpression: '0 * * * *',
        },
      }).then((r) => r.unwrap())

      await database
        .update(documentTriggers)
        .set({ triggerStatus: 'pending' })
        .where(eq(documentTriggers.uuid, pendingTrigger.uuid))

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(true)
      expect(changes.hasIssues).toBe(true)

      const pendingTriggerData = {
        triggerUuid: pendingTrigger.uuid,
        documentUuid: documents['doc2']!.documentUuid,
        triggerType: DocumentTriggerType.Scheduled,
        changeType: ModifiedDocumentType.Created,
        status: DocumentTriggerStatus.Pending,
      }

      const deployedTriggerData = {
        triggerUuid: deployedTrigger.uuid,
        documentUuid: documents['folder1/doc1']!.documentUuid,
        triggerType: DocumentTriggerType.Email,
        changeType: ModifiedDocumentType.Created,
        status: DocumentTriggerStatus.Deployed,
      }

      expect(changes.triggers.hasPending).toBe(true)
      expect(changes.triggers.all).toEqual([
        pendingTriggerData,
        deployedTriggerData,
      ])
      expect(changes.triggers.clean).toEqual([deployedTriggerData])
      expect(changes.triggers.pending).toEqual([pendingTriggerData])
    })

    it('shows deleted triggers in changes', async () => {
      const trigger = await factories.createEmailDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: draftCommit.id,
        documentUuid: documents['folder1/doc1']!.documentUuid,
        name: 'Email Trigger to be deleted',
      })

      await mergeCommit(draftCommit).then((r) => r.unwrap())

      const { commit: newDraft } = await createDraft({ project, user })

      await deleteDocumentTrigger({
        workspace,
        commit: newDraft,
        triggerUuid: trigger.uuid,
      }).then((r) => r.unwrap())

      const changes = await getCommitChanges({
        commit: newDraft,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.triggers.clean).toEqual([
        {
          triggerUuid: trigger.uuid,
          documentUuid: documents['folder1/doc1']!.documentUuid,
          triggerType: DocumentTriggerType.Email,
          changeType: ModifiedDocumentType.Deleted,
          status: DocumentTriggerStatus.Deprecated,
        },
      ])
    })
  })

  describe('evaluation changes', () => {
    it('shows no evaluation changes when none exist', async () => {
      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.evaluations.all).toEqual([])
    })

    it('shows created evaluations', async () => {
      const result = await createEvaluationV2({
        workspace,
        document: documents['folder1/doc1']!,
        commit: draftCommit,
        name: 'Test Evaluation',
        type: EvaluationType.Rule,
        metric: RuleEvaluationMetric.ExactMatch,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          expectedOutput: {
            parsingFormat: 'string',
          },
          caseInsensitive: false,
        },
      })

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(true)
      expect(changes.hasIssues).toBe(false)

      expect(changes.evaluations.all).toEqual([
        {
          evaluationUuid: result.uuid,
          documentUuid: documents['folder1/doc1']!.documentUuid,
          name: 'Test Evaluation',
          type: EvaluationType.Rule,
          changeType: ModifiedDocumentType.Created,
        },
      ])
    })
  })

  describe('main document changes', () => {
    it('detects main document changes', async () => {
      // Set a main document in the original commit
      await database
        .update(commits)
        .set({ mainDocumentUuid: documents['folder1/doc1']!.documentUuid })
        .where(eq(commits.id, draftCommit.id))

      // Make a change and merge
      await updateDocument({
        document: documents['folder1/doc1']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: 'initial update',
        }),
        commit: draftCommit,
      }).then((r) => r.unwrap())

      await mergeCommit(draftCommit).then((r) => r.unwrap())

      // Now create a new draft and change the main document
      const { commit: newDraft } = await createDraft({ project, user })

      // Set the main document to a different one
      await database
        .update(commits)
        .set({ mainDocumentUuid: documents['doc2']!.documentUuid })
        .where(eq(commits.id, newDraft.id))

      // Refresh newDraft from DB to get updated values
      const updatedDraft = await database
        .select()
        .from(commits)
        .where(eq(commits.id, newDraft.id))
        .then((c) => c[0]!)

      const changes = await getCommitChanges({
        commit: updatedDraft,
        workspace,
      }).then((r) => r.unwrap())

      // Main document change should be detected and reported
      expect(changes.mainDocumentUuid).toBe(documents['doc2']!.documentUuid)
      expect(changes.anyChanges).toBe(true)
    })

    it('does not report main document change when unchanged', async () => {
      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.mainDocumentUuid).toBeUndefined()
    })
  })

  describe('combined changes', () => {
    it('correctly identifies hasIssues when there are document errors, pending triggers, and evaluation issues', async () => {
      // Add document with error
      await updateDocument({
        document: documents['folder1/doc1']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: '{{ WRONG ',
        }),
        commit: draftCommit,
      }).then((r) => r.unwrap())

      // Add pending trigger
      const trigger = await createDocumentTrigger({
        workspace,
        project,
        commit: draftCommit,
        document: documents['doc2']!,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: {
          cronExpression: '0 * * * *',
        },
      }).then((r) => r.unwrap())

      await database
        .update(documentTriggers)
        .set({ triggerStatus: 'pending' })
        .where(eq(documentTriggers.uuid, trigger.uuid))

      // Add evaluation
      await createEvaluationV2({
        workspace,
        document: documents['folder1/doc1']!,
        commit: draftCommit,
        name: 'Evaluation with Issue',
        type: EvaluationType.Rule,
        metric: RuleEvaluationMetric.ExactMatch,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          expectedOutput: {
            parsingFormat: 'string',
          },
          caseInsensitive: false,
        },
      })

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(true)
      expect(changes.hasIssues).toBe(true)
      expect(changes.documents.hasErrors).toBe(true)
      expect(changes.triggers.hasPending).toBe(true)
    })

    it('correctly identifies anyChanges with multiple types of changes', async () => {
      await updateDocument({
        document: documents['folder1/doc1']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: 'updated content',
        }),
        commit: draftCommit,
      }).then((r) => r.unwrap())

      await createDocumentTrigger({
        workspace,
        project,
        commit: draftCommit,
        document: documents['doc2']!,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Test',
          replyWithResponse: true,
          emailWhitelist: [],
          domainWhitelist: [],
          parameters: {},
        },
      }).then((r) => r.unwrap())

      await createEvaluationV2({
        workspace,
        document: documents['folder1/doc1']!,
        commit: draftCommit,
        name: 'Test Evaluation',
        type: EvaluationType.Rule,
        metric: RuleEvaluationMetric.ExactMatch,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          expectedOutput: {
            parsingFormat: 'string',
          },
          caseInsensitive: false,
        },
      })

      const changes = await getCommitChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.anyChanges).toBe(true)
      expect(changes.documents.all.length).toBeGreaterThan(0)
      expect(changes.triggers.all.length).toBeGreaterThan(0)
      expect(changes.evaluations.all.length).toBeGreaterThan(0)
    })
  })

  describe('merged commits', () => {
    it('handles merged commits correctly', async () => {
      await updateDocument({
        document: documents['folder1/doc1']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: 'updated content',
        }),
        commit: draftCommit,
      }).then((r) => r.unwrap())

      const mergedCommit = await mergeCommit(draftCommit).then((r) =>
        r.unwrap(),
      )

      const changes = await getCommitChanges({
        commit: mergedCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes.documents.all).toEqual([
        {
          documentUuid: documents['folder1/doc1']!.documentUuid,
          path: 'folder1/doc1',
          changeType: ModifiedDocumentType.Updated,
          errors: 0,
        },
      ])
    })

    it('compares merged commit against previous merged commit', async () => {
      await updateDocument({
        document: documents['folder1/doc1']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: 'first update',
        }),
        commit: draftCommit,
      }).then((r) => r.unwrap())

      await mergeCommit(draftCommit).then((r) => r.unwrap())

      const { commit: newDraft } = await createDraft({ project, user })

      await updateDocument({
        document: documents['doc2']!,
        content: helpers.createPrompt({
          provider: 'openai',
          content: 'second update',
        }),
        commit: newDraft,
      }).then((r) => r.unwrap())

      const newMergedCommit = await mergeCommit(newDraft).then((r) =>
        r.unwrap(),
      )

      const changes = await getCommitChanges({
        commit: newMergedCommit,
        workspace,
      }).then((r) => r.unwrap())

      // Should only show changes from the new commit
      expect(changes.documents.all).toEqual([
        {
          documentUuid: documents['doc2']!.documentUuid,
          path: 'doc2',
          changeType: ModifiedDocumentType.Updated,
          errors: 0,
        },
      ])
    })
  })
})

describe('changesPresenter', () => {
  it('transforms document changes correctly', () => {
    const currentDoc: DocumentVersion = {
      id: 1,
      documentUuid: 'doc-uuid',
      path: 'test/path',
      content: 'content',
      resolvedContent: 'resolved',
      contentHash: 'hash',
      commitId: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      datasetId: null,
      datasetV2Id: null,
      promptlVersion: 1,
      documentType: DocumentType.Prompt,
      linkedDataset: {},
      linkedDatasetAndRow: {},
      mainEvaluationUuid: null,
    }

    const result = changesPresenter({
      currentCommitChanges: [currentDoc],
      previousCommitDocuments: [],
      errors: {},
    })

    expect(result).toEqual([
      {
        documentUuid: 'doc-uuid',
        path: 'test/path',
        errors: 0,
        changeType: ModifiedDocumentType.Created,
      },
    ])
  })

  it('identifies updated documents', () => {
    const doc: DocumentVersion = {
      id: 1,
      documentUuid: 'doc-uuid',
      path: 'test/path',
      content: 'new content',
      resolvedContent: 'resolved',
      contentHash: 'hash2',
      commitId: 2,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      datasetId: null,
      datasetV2Id: null,
      promptlVersion: 1,
      documentType: DocumentType.Prompt,
      linkedDataset: {},
      linkedDatasetAndRow: {},
      mainEvaluationUuid: null,
    }

    const previousDoc: DocumentVersion = {
      ...doc,
      id: 0,
      content: 'old content',
      contentHash: 'hash1',
      commitId: 1,
    }

    const result = changesPresenter({
      currentCommitChanges: [doc],
      previousCommitDocuments: [previousDoc],
      errors: {},
    })

    expect(result[0]!.changeType).toBe(ModifiedDocumentType.Updated)
  })

  it('identifies deleted documents', () => {
    const deletedDoc: DocumentVersion = {
      id: 1,
      documentUuid: 'doc-uuid',
      path: 'test/path',
      content: 'content',
      resolvedContent: 'resolved',
      contentHash: 'hash',
      commitId: 2,
      deletedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      datasetId: null,
      datasetV2Id: null,
      promptlVersion: 1,
      documentType: DocumentType.Prompt,
      linkedDataset: {},
      linkedDatasetAndRow: {},
      mainEvaluationUuid: null,
    }

    const previousDoc: DocumentVersion = {
      ...deletedDoc,
      deletedAt: null,
      commitId: 1,
    }

    const result = changesPresenter({
      currentCommitChanges: [deletedDoc],
      previousCommitDocuments: [previousDoc],
      errors: {},
    })

    expect(result[0]!.changeType).toBe(ModifiedDocumentType.Deleted)
  })

  it('identifies path changes', () => {
    const doc: DocumentVersion = {
      id: 1,
      documentUuid: 'doc-uuid',
      path: 'new/path',
      content: 'content',
      resolvedContent: 'resolved',
      contentHash: 'hash',
      commitId: 2,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      datasetId: null,
      datasetV2Id: null,
      promptlVersion: 1,
      documentType: DocumentType.Prompt,
      linkedDataset: {},
      linkedDatasetAndRow: {},
      mainEvaluationUuid: null,
    }

    const previousDoc: DocumentVersion = {
      ...doc,
      id: 0,
      path: 'old/path',
      commitId: 1,
    }

    const result = changesPresenter({
      currentCommitChanges: [doc],
      previousCommitDocuments: [previousDoc],
      errors: {},
    })

    expect(result[0]!.changeType).toBe(ModifiedDocumentType.UpdatedPath)
  })

  it('sorts documents by error count (documents with errors first)', () => {
    const doc1: DocumentVersion = {
      id: 1,
      documentUuid: 'doc-1',
      path: 'doc1',
      content: 'content',
      resolvedContent: 'resolved',
      contentHash: 'hash1',
      commitId: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      datasetId: null,
      datasetV2Id: null,
      promptlVersion: 1,
      documentType: DocumentType.Prompt,
      linkedDataset: {},
      linkedDatasetAndRow: {},
      mainEvaluationUuid: null,
    }

    const doc2: DocumentVersion = {
      ...doc1,
      id: 2,
      documentUuid: 'doc-2',
      path: 'doc2',
      contentHash: 'hash2',
    }

    const doc3: DocumentVersion = {
      ...doc1,
      id: 3,
      documentUuid: 'doc-3',
      path: 'doc3',
      contentHash: 'hash3',
    }

    const errors = {
      'doc-1': [{ message: 'error1' }] as any[],
      'doc-3': [{ message: 'error1' }, { message: 'error2' }] as any[],
    }

    const result = changesPresenter({
      currentCommitChanges: [doc1, doc2, doc3],
      previousCommitDocuments: [],
      errors,
    })

    expect(result[0]!.documentUuid).toBe('doc-3')
    expect(result[0]!.errors).toBe(2)
    expect(result[1]!.documentUuid).toBe('doc-1')
    expect(result[1]!.errors).toBe(1)
    expect(result[2]!.documentUuid).toBe('doc-2')
    expect(result[2]!.errors).toBe(0)
  })

  it('includes error counts in the result', () => {
    const doc: DocumentVersion = {
      id: 1,
      documentUuid: 'doc-uuid',
      path: 'test/path',
      content: 'content',
      resolvedContent: 'resolved',
      contentHash: 'hash',
      commitId: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      datasetId: null,
      datasetV2Id: null,
      promptlVersion: 1,
      documentType: DocumentType.Prompt,
      linkedDataset: {},
      linkedDatasetAndRow: {},
      mainEvaluationUuid: null,
    }

    const errors = {
      'doc-uuid': [
        { message: 'error1' },
        { message: 'error2' },
        { message: 'error3' },
      ] as any[],
    }

    const result = changesPresenter({
      currentCommitChanges: [doc],
      previousCommitDocuments: [],
      errors,
    })

    expect(result[0]!.errors).toBe(3)
  })
})
