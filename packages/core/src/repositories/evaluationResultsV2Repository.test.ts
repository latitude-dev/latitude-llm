import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { Providers } from '@latitude-data/constants'

import { type Workspace } from '../schema/models/types/Workspace'
import * as factories from '../tests/factories'
import { EvaluationResultsV2Repository } from './evaluationResultsV2Repository'
import { database } from '../client'
import { commits } from '../schema/models/commits'
import { DocumentVersionsRepository } from '../repositories'

describe('EvaluationResultsV2Repository', () => {
  let workspace: Workspace
  let repository: EvaluationResultsV2Repository

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createProject()
    workspace = createdWorkspace
    repository = new EvaluationResultsV2Repository(workspace.id)
  })

  describe('listPassedByDocumentUuid', () => {
    it('returns only passed evaluation results for the given document', async () => {
      // Create project with multiple documents
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt1: factories.helpers.createPrompt({
            provider: 'openai',
          }),
          prompt2: factories.helpers.createPrompt({
            provider: 'openai',
          }),
        },
      })

      const document1 = documents[0]!
      const document2 = documents[1]!

      // Create evaluations for both documents
      const evaluation1 = await factories.createEvaluationV2({
        document: document1,
        commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: document2,
        commit,
        workspace,
      })

      // Create spans for document1
      const span1 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document1.documentUuid,
      })

      const span2 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document1.documentUuid,
      })

      // Create span for document2
      const span3 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document2.documentUuid,
      })

      // Create passed evaluation result for document1
      const passedResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit,
        span: span1,
        hasPassed: true,
      })

      // Create failed evaluation result for document1 (should not be returned)
      const failedResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit,
        span: span2,
        hasPassed: false,
      })

      // Create passed evaluation result for document2 (should not be returned)
      const otherDocumentResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation: evaluation2,
        commit,
        span: span3,
        hasPassed: true,
      })

      // Fetch passed results for document1
      const results = await repository.listPassedByDocumentUuid(
        document1.documentUuid,
      )

      // Verify only the passed result from document1 is returned
      expect(results.length).toBe(1)
      expect(results[0]?.id).toBe(passedResult.id)
      expect(results.find((r) => r.id === failedResult.id)).toBeUndefined()
      expect(
        results.find((r) => r.id === otherDocumentResult.id),
      ).toBeUndefined()
    })

    it('does not return results from deleted commits', async () => {
      // Create project with documents
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!

      // Create evaluation for the document
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      // Create span
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      // Create passed evaluation result
      const result = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: true,
      })

      // Mark the commit as deleted
      await database
        .update(commits)
        .set({ deletedAt: new Date() })
        .where(eq(commits.id, commit.id))

      // Fetch passed results
      const results = await repository.listPassedByDocumentUuid(
        document.documentUuid,
      )

      // Verify no results are returned
      expect(results.length).toBe(0)
      expect(results.find((r) => r.id === result.id)).toBeUndefined()
    })

    it('does not return results that have not passed', async () => {
      // Create project with documents
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!

      // Create evaluation for the document
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      // Create span
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      // Create evaluation result with hasPassed = false
      const failedResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: false,
      })

      // Fetch passed results
      const results = await repository.listPassedByDocumentUuid(
        document.documentUuid,
      )

      // Verify no results are returned
      expect(results.length).toBe(0)
      expect(results.find((r) => r.id === failedResult.id)).toBeUndefined()
    })

    it('does not return results from other workspaces', async () => {
      // Create first project with documents
      const { commit: commit1, documents: documents1 } =
        await factories.createProject({
          workspace,
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            prompt: factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })

      const document1 = documents1[0]!

      // Create second workspace and project
      const { workspace: workspace2 } = await factories.createProject()
      const { commit: commit2, documents: documents2 } =
        await factories.createProject({
          workspace: workspace2,
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            prompt: factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })

      const document2 = documents2[0]!

      // Create evaluations for both documents
      const evaluation1 = await factories.createEvaluationV2({
        document: document1,
        commit: commit1,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: document2,
        commit: commit2,
        workspace: workspace2,
      })

      // Create spans
      const span1 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit1.uuid,
        documentUuid: document1.documentUuid,
      })

      const span2 = await factories.createSpan({
        workspaceId: workspace2.id,
        commitUuid: commit2.uuid,
        documentUuid: document2.documentUuid,
      })

      // Create passed evaluation results in both workspaces
      const result1 = await factories.createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit: commit1,
        span: span1,
        hasPassed: true,
      })

      const result2 = await factories.createEvaluationResultV2({
        workspace: workspace2,
        evaluation: evaluation2,
        commit: commit2,
        span: span2,
        hasPassed: true,
      })

      // Fetch passed results for document1 in workspace1
      const results = await repository.listPassedByDocumentUuid(
        document1.documentUuid,
      )

      // Verify only results from workspace1 are returned
      expect(results.length).toBe(1)
      expect(results[0]?.id).toBe(result1.id)
      expect(results.find((r) => r.id === result2.id)).toBeUndefined()
    })

    it('returns passed evaluation results from both merged and active commits', async () => {
      // Create project with documents and a merged commit
      const {
        project,
        commit: mergedCommit,
        documents,
        user,
      } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!

      // Create evaluation for the document
      const evaluation = await factories.createEvaluationV2({
        document,
        commit: mergedCommit,
        workspace,
      })

      // Create span for merged commit
      const span1 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: mergedCommit.uuid,
        documentUuid: document.documentUuid,
      })

      // Create passed evaluation result in merged commit
      const mergedResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit: mergedCommit,
        span: span1,
        hasPassed: true,
      })

      // Create a new draft commit (active commit)
      const { commit: draftCommit } = await factories.createDraft({
        project,
        user,
      })

      // Get document at the draft commit
      const docRepo = new DocumentVersionsRepository(workspace.id)
      const documentsAtDraft = await docRepo
        .getDocumentsAtCommit(draftCommit)
        .then((r) => r.unwrap())
      const documentAtDraft = documentsAtDraft.find(
        (d) => d.documentUuid === document.documentUuid,
      )!

      // Create evaluation for the draft commit (should use same evaluation UUID)
      const evaluationAtDraft = await factories.createEvaluationV2({
        document: documentAtDraft,
        commit: draftCommit,
        workspace,
      })

      // Create span for active commit
      const span2 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: draftCommit.uuid,
        documentUuid: document.documentUuid,
      })

      // Create passed evaluation result in active commit
      const activeResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation: evaluationAtDraft,
        commit: draftCommit,
        span: span2,
        hasPassed: true,
      })

      // Fetch passed results for the document
      const results = await repository.listPassedByDocumentUuid(
        document.documentUuid,
      )

      // Verify results from both commits are returned
      expect(results.length).toBe(2)
      expect(results.find((r) => r.id === mergedResult.id)).toBeDefined()
      expect(results.find((r) => r.id === activeResult.id)).toBeDefined()
    })
  })
})
