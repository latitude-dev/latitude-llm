import { beforeEach, describe, expect, it } from 'vitest'
import { subDays } from 'date-fns'
import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationBinaryConfiguration,
  HumanEvaluationRatingConfiguration,
  LogSources,
  SpanType,
} from '@latitude-data/constants'
import {
  createCommit,
  createEvaluationResultV2,
  createEvaluationV2,
  createProject,
  createSpan,
} from '../../tests/factories'
import { createWorkspace } from '../../tests/factories/workspaces'
import {
  getAnnotationsProgress,
  getAnnotationsProgressCount,
} from './getAnnotationsProgress'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { User } from '../../schema/models/types/User'
import type { Commit } from '../../schema/models/types/Commit'
import type { Project } from '../../schema/models/types/Project'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'

const BINARY_CONFIGURATION: HumanEvaluationBinaryConfiguration = {
  reverseScale: false,
  actualOutput: {
    messageSelection: 'last',
    parsingFormat: 'string',
  },
}

const RATING_CONFIGURATION: HumanEvaluationRatingConfiguration = {
  reverseScale: false,
  actualOutput: {
    messageSelection: 'last',
    parsingFormat: 'string',
  },
  minRating: 1,
  maxRating: 5,
}

describe('getAnnotationsProgress', () => {
  let workspace: Workspace
  let user: User
  let project: Project
  let commit: Commit
  let document: DocumentVersion

  beforeEach(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    workspace = setup.workspace
    user = setup.user
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!
  })

  describe('getAnnotationsProgressCount', () => {
    it('returns 0 when there are no HITL evaluations', async () => {
      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(0)
    })

    it('counts passing HITL results', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Create a passing result
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: true,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'This passed',
        },
      })

      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(1)
    })

    it('counts failed HITL results with reason', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Create a failed result with reason
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'This is a valid annotation reason',
        },
      })

      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(1)
    })

    it('does NOT count failed HITL results without reason', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Create a failed result without reason
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          // No reason provided
        },
      })

      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(0)
    })

    it('does NOT count failed HITL results with empty string reason', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Create a failed result with empty string reason
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: '',
        },
      })

      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(0)
    })

    it('counts passing HITL results even without reason', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Create a passing result without reason
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: true,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          // No reason provided
        },
      })

      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(1)
    })

    it('counts mixed passing and failed with reason results', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const span1 = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const span3 = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const span4 = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Passing with reason - should count
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: span1,
        hasPassed: true,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'Good result',
        },
      })

      // Passing without reason - should count
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: span2,
        hasPassed: true,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
        },
      })

      // Failed with reason - should count
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: span3,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'Bad result',
        },
      })

      // Failed without reason - should NOT count
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: span4,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
        },
      })

      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(3)
    })

    it('does not count results from non-HITL evaluations', async () => {
      // Create a Rule evaluation (not HITL)
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: false,
      })

      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(0)
    })

    it('only counts results from specified commits', async () => {
      const commit2 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date(),
      })

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const span1 = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit2.uuid,
        type: SpanType.Prompt,
      })

      // Result in commit1 (failed with reason - should count)
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: span1,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'Reason 1',
        },
      })

      // Result in commit2 (failed with reason - should count)
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit2,
        span: span2,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'Reason 2',
        },
      })

      // Only count commit1
      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(1)

      // Count both commits
      const countBoth = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id, commit2.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(countBoth).toBe(2)
    })

    it('filters results by fromDate', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const span1 = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Recent result (failed with reason - should be counted)
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: span1,
        hasPassed: false,
        createdAt: new Date(),
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'Recent annotation',
        },
      })

      // Old result (failed with reason but too old - should not be counted)
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: span2,
        hasPassed: false,
        createdAt: subDays(new Date(), 60),
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'Old annotation',
        },
      })

      const count = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count).toBe(1)
    })

    it('respects workspace isolation', async () => {
      const workspace2Setup = await createWorkspace()
      const workspace2 = workspace2Setup.workspace

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'Valid annotation',
        },
      })

      // Count for workspace1 should be 1
      const count1 = await getAnnotationsProgressCount({
        workspace,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count1).toBe(1)

      // Count for workspace2 should be 0
      const count2 = await getAnnotationsProgressCount({
        workspace: workspace2,
        commitIds: [commit.id],
        fromDate: subDays(new Date(), 30),
      })

      expect(count2).toBe(0)
    })
  })

  describe('getAnnotationsProgress', () => {
    it('returns zero counts when there are no runs or annotations', async () => {
      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
      })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({
        totalRuns: 0,
        currentAnnotations: 0,
      })
    })

    it('counts spans with Prompt type', async () => {
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: new Date(),
      })

      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Playground,
        startedAt: new Date(),
      })

      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.totalRuns).toBe(2)
      expect(result.value!.currentAnnotations).toBe(0)
    })

    it('filters spans by log sources', async () => {
      // Span with API source (included by default)
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: new Date(),
      })

      // Span with Playground source (included by default)
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Playground,
        startedAt: new Date(),
      })

      // Span with Experiment source (not included by default)
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Experiment,
        startedAt: new Date(),
      })

      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.totalRuns).toBe(2)
    })

    it('allows custom log sources', async () => {
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Experiment,
        startedAt: new Date(),
      })

      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
        logSources: [LogSources.Experiment],
      })

      expect(result.ok).toBe(true)
      expect(result.value!.totalRuns).toBe(1)
    })

    it('filters spans by fromDate', async () => {
      // Recent span
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: new Date(),
      })

      // Old span
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: subDays(new Date(), 60),
      })

      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
        fromDate: subDays(new Date(), 30),
      })

      expect(result.ok).toBe(true)
      expect(result.value!.totalRuns).toBe(1)
    })

    it('returns both totalRuns and currentAnnotations correctly', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      // Create 3 spans (runs)
      for (let i = 0; i < 3; i++) {
        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          source: LogSources.API,
          startedAt: new Date(),
        })
      }

      // Create 2 valid annotations (failed with reason)
      for (let i = 0; i < 2; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          source: LogSources.API,
          startedAt: new Date(),
        })

        await createEvaluationResultV2({
          workspace,
          evaluation,
          commit,
          span,
          hasPassed: false,
          metadata: {
            actualOutput: 'test output',
            configuration: evaluation.configuration,
            reason: `Annotation reason ${i}`,
          },
        })
      }

      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
      })

      expect(result.ok).toBe(true)
      // 3 + 2 spans created
      expect(result.value!.totalRuns).toBe(5)
      expect(result.value!.currentAnnotations).toBe(2)
    })

    it('includes spans from commit history', async () => {
      // Create a second commit that is merged
      const commit2 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date(),
      })

      // Span in first commit
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: new Date(),
      })

      // Span in second commit
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit2.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: new Date(),
      })

      // Query from commit2 should include spans from commit1 (in history)
      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit2.uuid,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.totalRuns).toBe(2)
    })

    it('includes spans with null source', async () => {
      // Span with null source (legacy spans)
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: undefined as unknown as LogSources,
        startedAt: new Date(),
      })

      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.totalRuns).toBe(1)
    })

    it('respects workspace isolation', async () => {
      const workspace2Setup = await createWorkspace()
      const workspace2 = workspace2Setup.workspace

      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: new Date(),
      })

      // Result for workspace1
      const result1 = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
      })

      expect(result1.ok).toBe(true)
      expect(result1.value!.totalRuns).toBe(1)

      // Result for workspace2 (should not see workspace1's spans)
      const project2Setup = await createProject({
        workspace: workspace2,
        documents: {
          'test-doc': 'Test content',
        },
      })

      const result2 = await getAnnotationsProgress({
        workspace: workspace2,
        projectId: project2Setup.project.id,
        commitUuid: project2Setup.commit.uuid,
      })

      expect(result2.ok).toBe(true)
      expect(result2.value!.totalRuns).toBe(0)
    })

    it('handles Rating metric HITL evaluations', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Rating,
        configuration: RATING_CONFIGURATION,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: new Date(),
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation.configuration,
          reason: 'Rating annotation reason',
        },
      })

      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.totalRuns).toBe(1)
      expect(result.value!.currentAnnotations).toBe(1)
    })

    it('returns error for non-existent commit', async () => {
      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: '00000000-0000-0000-0000-000000000000', // Valid UUID format but doesn't exist
      })

      expect(result.ok).toBe(false)
    })

    it('counts multiple HITL evaluations separately', async () => {
      const evaluation1 = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: BINARY_CONFIGURATION,
      })

      const evaluation2 = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Rating,
        configuration: RATING_CONFIGURATION,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: new Date(),
      })

      // Annotation from first evaluation (failed with reason)
      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit,
        span,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation1.configuration,
          reason: 'Binary annotation',
        },
      })

      // Annotation from second evaluation (failed with reason)
      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation2,
        commit,
        span,
        hasPassed: false,
        metadata: {
          actualOutput: 'test output',
          configuration: evaluation2.configuration,
          reason: 'Rating annotation',
        },
      })

      const result = await getAnnotationsProgress({
        workspace,
        projectId: project.id,
        commitUuid: commit.uuid,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.totalRuns).toBe(1)
      expect(result.value!.currentAnnotations).toBe(2)
    })
  })
})
