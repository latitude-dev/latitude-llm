import { and, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { database } from '../../client'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { issues } from '../../schema/models/issues'
import { createEvaluationResultV2 } from '../../tests/factories/evaluationResultsV2'
import { createEvaluationV2 } from '../../tests/factories/evaluationsV2'
import { createIssueEvaluationResult } from '../../tests/factories/issueEvaluationResults'
import { createIssue } from '../../tests/factories/issues'
import { createProject } from '../../tests/factories/projects'
import { createSpan } from '../../tests/factories/spans'
import { createWorkspace } from '../../tests/factories/workspaces'
import { DocumentsDeletedEvent } from '../events'
import { unassignIssuesOnDocumentsDeleted } from './unassignIssuesOnDocumentsDeleted'

describe('unassignIssuesOnDocumentsDeleted', () => {
  it('does nothing when documentUuids is empty', async () => {
    const { workspace } = await createWorkspace({ features: ['issues'] })
    const { project } = await createProject({ workspace })

    const event: DocumentsDeletedEvent = {
      type: 'documentsDeleted',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: 'some-uuid',
        documentUuids: [],
        softDeletedDocumentUuids: [],
        hardDeletedDocumentUuids: [],
      },
    }

    await expect(
      unassignIssuesOnDocumentsDeleted({ data: event }),
    ).resolves.not.toThrow()
  })

  it('does nothing when commit is not found', async () => {
    const { workspace } = await createWorkspace({ features: ['issues'] })
    const { project, documents } = await createProject({
      workspace,
      documents: { 'test-doc': 'test content' },
    })
    const document = documents[0]!

    const event: DocumentsDeletedEvent = {
      type: 'documentsDeleted',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: 'non-existent-uuid',
        documentUuids: [document.documentUuid],
        softDeletedDocumentUuids: [],
        hardDeletedDocumentUuids: [],
      },
    }

    await expect(
      unassignIssuesOnDocumentsDeleted({ data: event }),
    ).resolves.not.toThrow()
  })

  it('unassigns issueEvaluationResults for deleted documents in the commit', async () => {
    const { workspace } = await createWorkspace({ features: ['issues'] })
    const { project, documents, commit } = await createProject({
      workspace,
      documents: { 'test-doc': 'test content' },
    })
    const document = documents[0]!

    const { issue } = await createIssue({
      workspace,
      project,
      document,
    })

    const evaluation = await createEvaluationV2({
      workspace,
      document,
      commit,
    })

    const span = await createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
    })

    const evalResult = await createEvaluationResultV2({
      workspace,
      evaluation,
      span,
      commit,
    })

    await createIssueEvaluationResult({
      workspace,
      issue,
      evaluationResult: evalResult,
    })

    const beforeDelete = await database
      .select()
      .from(issueEvaluationResults)
      .where(eq(issueEvaluationResults.issueId, issue.id))
    expect(beforeDelete).toHaveLength(1)

    const event: DocumentsDeletedEvent = {
      type: 'documentsDeleted',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuids: [document.documentUuid],
        softDeletedDocumentUuids: [],
        hardDeletedDocumentUuids: [document.documentUuid],
      },
    }

    await unassignIssuesOnDocumentsDeleted({ data: event })

    const afterDelete = await database
      .select()
      .from(issueEvaluationResults)
      .where(eq(issueEvaluationResults.issueId, issue.id))
    expect(afterDelete).toHaveLength(0)
  })

  it('deletes histograms for issues in the commit where documents are deleted', async () => {
    const { workspace } = await createWorkspace({ features: ['issues'] })
    const { project, documents, commit } = await createProject({
      workspace,
      documents: { 'test-doc': 'test content' },
    })
    const document = documents[0]!

    const histogramData = {
      commitId: commit.id,
      date: new Date(),
      count: 5,
    }

    const { issue, histograms } = await createIssue({
      workspace,
      project,
      document,
      histograms: [histogramData],
    })

    expect(histograms).toHaveLength(1)

    const beforeDelete = await database
      .select()
      .from(issueHistograms)
      .where(
        and(
          eq(issueHistograms.issueId, issue.id),
          eq(issueHistograms.commitId, commit.id),
        ),
      )
    expect(beforeDelete).toHaveLength(1)

    const event: DocumentsDeletedEvent = {
      type: 'documentsDeleted',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuids: [document.documentUuid],
        softDeletedDocumentUuids: [],
        hardDeletedDocumentUuids: [document.documentUuid],
      },
    }

    await unassignIssuesOnDocumentsDeleted({ data: event })

    const afterDelete = await database
      .select()
      .from(issueHistograms)
      .where(
        and(
          eq(issueHistograms.issueId, issue.id),
          eq(issueHistograms.commitId, commit.id),
        ),
      )
    expect(afterDelete).toHaveLength(0)
  })

  it('updates escalating status for affected issues', async () => {
    const { workspace } = await createWorkspace({ features: ['issues'] })
    const { project, documents, commit } = await createProject({
      workspace,
      documents: { 'test-doc': 'test content' },
    })
    const document = documents[0]!

    const histogramData = {
      commitId: commit.id,
      date: new Date(),
      count: 10,
    }

    const { issue } = await createIssue({
      workspace,
      project,
      document,
      histograms: [histogramData],
      escalatingAt: new Date(),
    })

    expect(issue.escalatingAt).not.toBeNull()

    const event: DocumentsDeletedEvent = {
      type: 'documentsDeleted',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuids: [document.documentUuid],
        softDeletedDocumentUuids: [],
        hardDeletedDocumentUuids: [document.documentUuid],
      },
    }

    await unassignIssuesOnDocumentsDeleted({ data: event })

    const updatedIssue = await database
      .select()
      .from(issues)
      .where(eq(issues.id, issue.id))
      .then((r) => r[0])

    expect(updatedIssue?.escalatingAt).toBeNull()
  })

  it('handles multiple documents and issues', async () => {
    const { workspace } = await createWorkspace({ features: ['issues'] })
    const { project, documents, commit } = await createProject({
      workspace,
      documents: {
        'doc-1': 'content 1',
        'doc-2': 'content 2',
      },
    })
    const doc1 = documents[0]!
    const doc2 = documents[1]!

    const { issue: issue1 } = await createIssue({
      workspace,
      project,
      document: doc1,
      histograms: [{ commitId: commit.id, date: new Date(), count: 3 }],
    })

    const { issue: issue2 } = await createIssue({
      workspace,
      project,
      document: doc2,
      histograms: [{ commitId: commit.id, date: new Date(), count: 5 }],
    })

    const beforeDelete = await database
      .select()
      .from(issueHistograms)
      .where(
        and(
          inArray(issueHistograms.issueId, [issue1.id, issue2.id]),
          eq(issueHistograms.commitId, commit.id),
        ),
      )
    expect(beforeDelete).toHaveLength(2)

    const event: DocumentsDeletedEvent = {
      type: 'documentsDeleted',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuids: [doc1.documentUuid, doc2.documentUuid],
        softDeletedDocumentUuids: [],
        hardDeletedDocumentUuids: [doc1.documentUuid, doc2.documentUuid],
      },
    }

    await unassignIssuesOnDocumentsDeleted({ data: event })

    const afterDelete = await database
      .select()
      .from(issueHistograms)
      .where(
        and(
          inArray(issueHistograms.issueId, [issue1.id, issue2.id]),
          eq(issueHistograms.commitId, commit.id),
        ),
      )
    expect(afterDelete).toHaveLength(0)
  })

  it('only deletes histograms for the specific commit', async () => {
    const { workspace } = await createWorkspace({ features: ['issues'] })
    const { project, documents, commit: commit1 } = await createProject({
      workspace,
      documents: { 'test-doc': 'test content' },
    })
    const document = documents[0]!

    const { commit: commit2 } = await createProject({
      workspace,
      documents: { 'other-doc': 'other content' },
    })

    const { issue, histograms } = await createIssue({
      workspace,
      project,
      document,
      histograms: [
        { commitId: commit1.id, date: new Date(), count: 5 },
        { commitId: commit2.id, date: new Date(), count: 3 },
      ],
    })

    expect(histograms).toHaveLength(2)

    const event: DocumentsDeletedEvent = {
      type: 'documentsDeleted',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: commit1.uuid,
        documentUuids: [document.documentUuid],
        softDeletedDocumentUuids: [],
        hardDeletedDocumentUuids: [document.documentUuid],
      },
    }

    await unassignIssuesOnDocumentsDeleted({ data: event })

    const remainingHistograms = await database
      .select()
      .from(issueHistograms)
      .where(eq(issueHistograms.issueId, issue.id))

    expect(remainingHistograms).toHaveLength(1)
    expect(remainingHistograms[0]!.commitId).toBe(commit2.id)
  })
})
