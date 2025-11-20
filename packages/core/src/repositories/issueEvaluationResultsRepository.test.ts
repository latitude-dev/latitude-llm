import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Providers, SpanType, EvaluationV2 } from '@latitude-data/constants'
import { database } from '../client'
import { issues } from '../schema/models/issues'
import { type Commit } from '../schema/models/types/Commit'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
import { type Project } from '../schema/models/types/Project'
import { type Workspace } from '../schema/models/types/Workspace'
import * as factories from '../tests/factories'
import { IssueEvaluationResultsRepository } from './issueEvaluationResultsRepository'

describe('IssueEvaluationResultsRepository', () => {
  let workspace: Workspace
  let otherWorkspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2
  let repository: IssueEvaluationResultsRepository
  let otherRepository: IssueEvaluationResultsRepository

  beforeEach(async () => {
    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Test prompt',
        }),
      },
    })

    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!

    evaluation = await factories.createEvaluationV2({
      workspace,
      document,
      commit,
    })

    repository = new IssueEvaluationResultsRepository(workspace.id)

    // Create another workspace for scoping tests
    const otherSetup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Test prompt',
        }),
      },
    })
    otherWorkspace = otherSetup.workspace
    otherRepository = new IssueEvaluationResultsRepository(otherWorkspace.id)
  })

  describe('findLastActiveAssignedIssue', () => {
    it('finds the last active assigned issue for an evaluation result', async () => {
      const { issue } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as any,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create the association
      const association = await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult,
      })

      const result = await repository.findLastActiveAssignedIssue({
        result: evaluationResult,
      })

      expect(result).toBeDefined()
      expect(result?.id).toBe(association.id)
      expect(result?.issueId).toBe(issue.id)
      expect(result?.evaluationResultId).toBe(evaluationResult.id)
    })

    it('returns the most recent active assignment when result is assigned to multiple issues', async () => {
      const { issue: issue1 } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      const { issue: issue2 } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as any,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create first association (older) with issue1
      await factories.createIssueEvaluationResult({
        workspace,
        issue: issue1,
        evaluationResult,
        createdAt: new Date('2024-01-01'),
      })

      // Create second association (newer) with issue2
      const newerAssociation = await factories.createIssueEvaluationResult({
        workspace,
        issue: issue2,
        evaluationResult,
        createdAt: new Date('2024-01-02'),
      })

      // Should return the newer association (issue2)
      const result = await repository.findLastActiveAssignedIssue({
        result: evaluationResult,
      })

      expect(result).toBeDefined()
      expect(result?.id).toBe(newerAssociation.id)
      expect(result?.issueId).toBe(issue2.id)
      expect(result?.evaluationResultId).toBe(evaluationResult.id)
      expect(result?.createdAt).toEqual(new Date('2024-01-02'))
    })

    it('filters by workspace scope', async () => {
      const { issue } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as any,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create association in workspace
      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult,
      })

      // Try to find from other workspace - should not find it
      const result = await otherRepository.findLastActiveAssignedIssue({
        result: evaluationResult,
      })

      expect(result).toBeUndefined()
    })

    it('excludes merged issues', async () => {
      const { issue: activeIssue } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      const { issue: mergedIssue } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as any,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create older association with merged issue
      await factories.createIssueEvaluationResult({
        workspace,
        issue: mergedIssue,
        evaluationResult,
        createdAt: new Date('2024-01-01'),
      })

      // Mark the issue as merged
      await database
        .update(issues)
        .set({ mergedAt: new Date() })
        .where(eq(issues.id, mergedIssue.id))

      // Create newer association with active issue
      const activeAssociation = await factories.createIssueEvaluationResult({
        workspace,
        issue: activeIssue,
        evaluationResult,
        createdAt: new Date('2024-01-02'),
      })

      // Should return the active issue, ignoring the merged one
      const result = await repository.findLastActiveAssignedIssue({
        result: evaluationResult,
      })

      expect(result).toBeDefined()
      expect(result?.id).toBe(activeAssociation.id)
      expect(result?.issueId).toBe(activeIssue.id)
    })

    it('returns undefined when only merged issues exist', async () => {
      const { issue } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as any,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create the association
      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult,
      })

      // Mark the issue as merged
      await database
        .update(issues)
        .set({ mergedAt: new Date() })
        .where(eq(issues.id, issue.id))

      // Should return undefined because the only assigned issue is merged
      const result = await repository.findLastActiveAssignedIssue({
        result: evaluationResult,
      })

      expect(result).toBeUndefined()
    })

    it('returns undefined when no association exists', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as any,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await repository.findLastActiveAssignedIssue({
        result: evaluationResult,
      })

      expect(result).toBeUndefined()
    })

    it('filters by specific evaluation result', async () => {
      const { issue } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      const span1 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
      })

      const span2 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
      })

      const result1 = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as any,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result2 = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create association for result1
      const association1 = await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: result1,
      })

      // Create association for result2
      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: result2,
      })

      // Should only find result1's association
      const foundResult1 = await repository.findLastActiveAssignedIssue({
        result: result1,
      })

      expect(foundResult1).toBeDefined()
      expect(foundResult1?.id).toBe(association1.id)
      expect(foundResult1?.evaluationResultId).toBe(result1.id)
    })
  })
})
