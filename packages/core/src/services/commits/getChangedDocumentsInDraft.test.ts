import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  Commit,
  DocumentVersion,
  Project,
  User,
  Workspace,
} from '../../schema/types'
import { Providers } from '@latitude-data/constants'
import {
  DocumentTriggerType,
  ModifiedDocumentType,
  DocumentTriggerStatus,
} from '@latitude-data/constants'
import { destroyDocument, updateDocument } from '../documents'
import * as factories from '../../tests/factories'
import { createDocumentTrigger } from '../documentTriggers/create'
import { database } from '../../client'
import { documentTriggers } from '../../schema/models/documentTriggers'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '../../tests/factories'
import { getCommitChanges } from './getChanges'
import { mergeCommit } from './merge'
import { deleteDocumentTrigger } from '../documentTriggers/delete'

let project: Project
let draftCommit: Commit
let documents: Record<string, DocumentVersion>
let workspace: Workspace
let user: User

describe('publishDraftCommit', () => {
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

  it('show changed documents', async () => {
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

    expect(changes.triggers.hasPending).toBe(false)
    expect(changes.triggers.all).toEqual([])
    expect(changes.triggers.clean).toEqual([])
    expect(changes.triggers.pending).toEqual([])
  })

  it('show created documents', async () => {
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

  it('show deleted documents', async () => {
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

  it('show documents with number of errors sorted by errors', async () => {
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
    expect(changes.hasIssues).toBe(true) // There are errors

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

    expect(changes.triggers.hasPending).toBe(false)
    expect(changes.triggers.all).toEqual([])
    expect(changes.triggers.clean).toEqual([])
    expect(changes.triggers.pending).toEqual([])
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

  it('show no trigger changes when none exist', async () => {
    const changes = await getCommitChanges({
      commit: draftCommit,
      workspace,
    }).then((r) => r.unwrap())

    expect(changes.anyChanges).toBe(false)
    expect(changes.hasIssues).toBe(false)

    expect(changes.documents.hasErrors).toBe(false)
    expect(changes.documents.all).toEqual([])
    expect(changes.documents.clean).toEqual([])
    expect(changes.documents.errors).toEqual([])

    expect(changes.triggers.hasPending).toBe(false)
    expect(changes.triggers.all).toEqual([])
    expect(changes.triggers.clean).toEqual([])
    expect(changes.triggers.pending).toEqual([])
  })

  it('show created document triggers', async () => {
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

    expect(changes.documents.hasErrors).toBe(false)
    expect(changes.documents.all).toEqual([])
    expect(changes.documents.clean).toEqual([])
    expect(changes.documents.errors).toEqual([])

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

  it('show trigger errors when trigger status is pending', async () => {
    // Create a trigger that will be deployed initially
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
    expect(changes.hasIssues).toBe(true) // Has pending trigger

    expect(changes.documents.hasErrors).toBe(false)
    expect(changes.documents.all).toEqual([])
    expect(changes.documents.clean).toEqual([])
    expect(changes.documents.errors).toEqual([])

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

  it('show triggers sorted by errors count', async () => {
    // Create first trigger (deployed - no errors)
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

    // Create second trigger and set to pending (with errors)
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

    // Set the second trigger to pending status to create an error
    await database
      .update(documentTriggers)
      .set({ triggerStatus: 'pending' })
      .where(eq(documentTriggers.uuid, pendingTrigger.uuid))

    const changes = await getCommitChanges({
      commit: draftCommit,
      workspace,
    }).then((r) => r.unwrap())

    expect(changes.anyChanges).toBe(true)
    expect(changes.hasIssues).toBe(true) // Has pending trigger

    expect(changes.documents.hasErrors).toBe(false)
    expect(changes.documents.all).toEqual([])
    expect(changes.documents.clean).toEqual([])
    expect(changes.documents.errors).toEqual([])

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
    // Should be sorted by status (pending trigger first, then deployed)
    expect(changes.triggers.all).toEqual([
      pendingTriggerData,
      deployedTriggerData,
    ])
    expect(changes.triggers.clean).toEqual([deployedTriggerData])
    expect(changes.triggers.pending).toEqual([pendingTriggerData])
  })

  it('should show deleted triggers in changes', async () => {
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
