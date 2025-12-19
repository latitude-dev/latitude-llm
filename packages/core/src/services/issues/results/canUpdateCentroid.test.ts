import { beforeEach, describe, expect, it } from 'vitest'
import { Providers, SpanType, EvaluationV2 } from '@latitude-data/constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Issue } from '../../../schema/models/types/Issue'
import { type Project } from '../../../schema/models/types/Project'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { type User } from '../../../schema/models/types/User'
import * as factories from '../../../tests/factories'
import { canUpdateCentroid } from './canUpdateCentroid'

const MOCK_EMBEDDING = [0.1, 0.2, 0.3]

describe('canUpdateCentroid', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2
  let issue: Issue
  let user: User

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
    user = setup.user

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

  describe('when embedding is undefined', () => {
    it('returns false regardless of other conditions', async () => {
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

      const result = await canUpdateCentroid({
        result: evaluationResult,
        commit,
        issue,
        embedding: undefined,
        issueWasNew: true,
      })

      expect(result).toBe(false)
    })
  })

  describe('when result is from an experiment', () => {
    it('returns false regardless of commit merge status', async () => {
      const { experiment } = await factories.createExperiment({
        workspace,
        user,
        document,
        commit,
        evaluations: [evaluation],
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const experimentResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        experiment,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await canUpdateCentroid({
        result: experimentResult,
        commit,
        issue,
        embedding: MOCK_EMBEDDING,
        issueWasNew: false,
      })

      expect(result).toBe(false)
    })

    it('returns false even when issue is new', async () => {
      const { experiment } = await factories.createExperiment({
        workspace,
        user,
        document,
        commit,
        evaluations: [evaluation],
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const experimentResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        experiment,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const result = await canUpdateCentroid({
        result: experimentResult,
        commit,
        issue,
        embedding: MOCK_EMBEDDING,
        issueWasNew: true,
      })

      expect(result).toBe(false)
    })
  })

  describe('when result is NOT from an experiment', () => {
    describe('when commit is merged (live)', () => {
      it('returns true', async () => {
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

        const result = await canUpdateCentroid({
          result: evaluationResult,
          commit,
          issue,
          embedding: MOCK_EMBEDDING,
          issueWasNew: false,
        })

        expect(result).toBe(true)
      })
    })

    describe('when issue is new', () => {
      it('returns true even if commit is not merged', async () => {
        const { commit: draft } = await factories.createDraft({ project, user })

        const span = await factories.createSpan({
          workspaceId: workspace.id,
          commitUuid: draft.uuid,
          type: SpanType.Prompt,
        })

        const evaluationResult = await factories.createEvaluationResultV2({
          workspace,
          evaluation,
          commit: draft,
          span,
          score: 0,
          normalizedScore: 0,
          hasPassed: false,
        })

        const result = await canUpdateCentroid({
          result: evaluationResult,
          commit: draft,
          issue,
          embedding: MOCK_EMBEDDING,
          issueWasNew: true,
        })

        expect(result).toBe(true)
      })
    })

    describe('when commit is not merged and issue is not new', () => {
      it('returns true when issue has no results from other commits', async () => {
        const { commit: draft } = await factories.createDraft({ project, user })

        const span = await factories.createSpan({
          workspaceId: workspace.id,
          commitUuid: draft.uuid,
          type: SpanType.Prompt,
        })

        const evaluationResult = await factories.createEvaluationResultV2({
          workspace,
          evaluation,
          commit: draft,
          span,
          score: 0,
          normalizedScore: 0,
          hasPassed: false,
        })

        const result = await canUpdateCentroid({
          result: evaluationResult,
          commit: draft,
          issue,
          embedding: MOCK_EMBEDDING,
          issueWasNew: false,
        })

        expect(result).toBe(true)
      })

      it('returns false when issue has results from other commits', async () => {
        const { commit: draft } = await factories.createDraft({ project, user })

        const spanFromMerged = await factories.createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
        })

        const resultFromMerged = await factories.createEvaluationResultV2({
          workspace,
          evaluation,
          commit,
          span: spanFromMerged,
          score: 0,
          normalizedScore: 0,
          hasPassed: false,
        })

        await factories.createIssueEvaluationResult({
          workspace,
          issue,
          evaluationResult: resultFromMerged,
        })

        const spanFromDraft = await factories.createSpan({
          workspaceId: workspace.id,
          commitUuid: draft.uuid,
          type: SpanType.Prompt,
        })

        const resultFromDraft = await factories.createEvaluationResultV2({
          workspace,
          evaluation,
          commit: draft,
          span: spanFromDraft,
          score: 0,
          normalizedScore: 0,
          hasPassed: false,
        })

        const result = await canUpdateCentroid({
          result: resultFromDraft,
          commit: draft,
          issue,
          embedding: MOCK_EMBEDDING,
          issueWasNew: false,
        })

        expect(result).toBe(false)
      })

      it('returns true when issue only has results from the same commit', async () => {
        const { commit: draft } = await factories.createDraft({ project, user })

        const spanFromDraft1 = await factories.createSpan({
          workspaceId: workspace.id,
          commitUuid: draft.uuid,
          type: SpanType.Prompt,
        })

        const resultFromDraft1 = await factories.createEvaluationResultV2({
          workspace,
          evaluation,
          commit: draft,
          span: spanFromDraft1,
          score: 0,
          normalizedScore: 0,
          hasPassed: false,
        })

        await factories.createIssueEvaluationResult({
          workspace,
          issue,
          evaluationResult: resultFromDraft1,
        })

        const spanFromDraft2 = await factories.createSpan({
          workspaceId: workspace.id,
          commitUuid: draft.uuid,
          type: SpanType.Prompt,
        })

        const resultFromDraft2 = await factories.createEvaluationResultV2({
          workspace,
          evaluation,
          commit: draft,
          span: spanFromDraft2,
          score: 0,
          normalizedScore: 0,
          hasPassed: false,
        })

        const result = await canUpdateCentroid({
          result: resultFromDraft2,
          commit: draft,
          issue,
          embedding: MOCK_EMBEDDING,
          issueWasNew: false,
        })

        expect(result).toBe(true)
      })
    })
  })

  describe('issueWasNew default value', () => {
    it('defaults to false when not provided', async () => {
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

      const result = await canUpdateCentroid({
        result: evaluationResult,
        commit,
        issue,
        embedding: MOCK_EMBEDDING,
      })

      expect(result).toBe(true)
    })
  })
})
