import {
  EvaluationType,
  EvaluationV2,
  LogSources,
  Providers,
  SpanType,
} from '@latitude-data/constants'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { database } from '../../../client'
import { UnprocessableEntityError } from '../../../lib/errors'
import { issues } from '../../../schema/models/issues'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Issue } from '../../../schema/models/types/Issue'
import { type Project } from '../../../schema/models/types/Project'
import { type Workspace } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import { validateResultForIssue } from './validate'

describe('validateResultForIssue', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2
  let issue: Issue

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

    const issueResult = await factories.createIssue({
      workspace,
      project,
      document,
    })
    issue = issueResult.issue
  })

  describe('error validation', () => {
    it('fails when result has an error', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const errorResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        error: { message: 'Some error occurred' },
      })

      const result = await validateResultForIssue({
        result: { result: errorResult, evaluation },
        issue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe('Cannot use a result that has errored')
    })
  })

  describe('passed result validation', () => {
    it('fails when result has passed', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const passedResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 1,
        normalizedScore: 100,
        hasPassed: true,
      })

      const result = await validateResultForIssue({
        result: { result: passedResult, evaluation },
        issue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe('Cannot use a result that has passed')
    })
  })

  describe('already belongs to active issue validation', () => {
    it('fails when result already belongs to an active issue', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create the association - result is now assigned to an active issue
      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult,
      })

      // Try to validate for any issue (or even a different issue)
      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe(
        'Cannot use a result that already belongs to an issue',
      )
    })

    it('passes when result belongs to a merged issue (not active)', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create the association with issue
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

      // Should pass because the result only belongs to a merged (inactive) issue
      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
      })

      expect(result.ok).toBe(true)
    })

    it('passes when result belongs to issue but skipBelongsCheck is true', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create the association first
      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult,
      })

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
        skipBelongsCheck: true,
      })

      expect(result.ok).toBe(true)
    })

    it('runs belongs check even when no issue is provided', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create the association - result belongs to an active issue
      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult,
      })

      // Should fail even when no issue is provided because result belongs to an active issue
      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe(
        'Cannot use a result that already belongs to an issue',
      )
    })
  })

  // TODO(AO): Review why do we want to allow results from experiments to be added to issues?
  describe.skip('experiment result validation', () => {
    it('fails when result is from an experiment', async () => {
      // Create a simple experiment by setting experimentId directly
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Create the evaluation result
      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Manually set experimentId to simulate it being from an experiment
      const experimentResult = {
        ...evaluationResult,
        experimentId: 999,
      }

      const result = await validateResultForIssue({
        result: { result: experimentResult as any, evaluation },
        issue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe(
        'Cannot use a result from an experiment',
      )
    })
  })

  describe('composite evaluation validation', () => {
    it('fails when evaluation is composite type', async () => {
      // Create a simple result and manually set the evaluation type to composite
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Manually override evaluation type to composite for testing
      const compositeEvaluation = {
        ...evaluation,
        type: EvaluationType.Composite,
      }

      const result = await validateResultForIssue({
        result: {
          result: evaluationResult,
          evaluation: compositeEvaluation as any,
        },
        issue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe(
        'Cannot use a result from a composite evaluation',
      )
    })
  })

  describe('reasoning validation', () => {
    // Note: Testing the case where resultReason returns undefined is difficult because
    // the default Rule evaluation always returns a reason string. This validation
    // is primarily for evaluation types that might not have reasoning (e.g., LLM evals
    // that fail to generate reasoning). The skipReasonCheck flag is tested below.

    it('skipReasonCheck allows bypassing reasoning validation', async () => {
      // This tests that skipReasonCheck works - in a real scenario where resultReason
      // returns undefined, this flag would allow the validation to pass
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
        skipReasonCheck: true,
      })

      expect(result.ok).toBe(true)
    })

    it('passes when result has reasoning', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('merged issue validation', () => {
    it('fails when issue has been merged', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Mark the issue as merged
      await database
        .update(issues)
        .set({ mergedAt: new Date() })
        .where(eq(issues.id, issue.id))

      // Refresh the issue to get the updated mergedAt
      issue = { ...issue, mergedAt: new Date() }

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe(
        'Cannot use an issue that has been merged',
      )
    })

    it('passes when issue has not been merged', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
      })

      expect(result.ok).toBe(true)
    })

    it('skips merged check when no issue is provided', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Should pass when no issue is provided
      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('optimization result validation', () => {
    it('fails when result is from an optimization', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Optimization,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe(
        'Cannot use a result from an optimization',
      )
    })

    it('passes when result is not from an optimization', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('successful validation', () => {
    it('passes all validations for a valid result', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBe(true)
    })

    it('passes all validations when issue is not provided', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBe(true)
    })

    it('passes with skip flags enabled', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evaluationResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      // Create association to test skipBelongsCheck
      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult,
      })

      const result = await validateResultForIssue({
        result: { result: evaluationResult, evaluation },
        issue,
        skipBelongsCheck: true,
        skipReasonCheck: true,
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBe(true)
    })
  })
})
