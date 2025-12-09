import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  EvaluationType,
  SpanType,
  HumanEvaluationMetric,
} from '../../../constants'
import { createWorkspace } from '../../../tests/factories'
import { Workspace } from '../../../schema/models/types/Workspace'
import { getAnnotationsData } from './index'
import { createProject } from '../../../tests/factories/projects'
import { createEvaluationV2 } from '../../../tests/factories/evaluationsV2'
import { createEvaluationResultV2 } from '../../../tests/factories/evaluationResultsV2'
import { createSpan } from '../../../tests/factories/spans'
import { database } from '../../../client'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { Commit } from '../../../schema/models/types/Commit'
import { Project } from '../../../schema/models/types/Project'

// Static date for testing: Monday, January 8, 2024 at 10:00 AM UTC
// This represents a date in the "last week" range when
// running on Sunday, January 14, 2024
const STATIC_TEST_DATE = new Date('2024-01-08T10:00:00Z')

// Date range for testing (last week): Sunday Jan 7, 2024 to Sunday Jan 14, 2024
const LAST_WEEK_START = new Date('2024-01-07T00:00:00Z')
const LAST_WEEK_END = new Date('2024-01-14T00:00:00Z')

let workspace: Workspace
let document: DocumentVersion
let commit: Commit
let project: Project

describe('getAnnotationsData', () => {
  beforeAll(async () => {
    const { workspace: ws } = await createWorkspace()
    workspace = ws

    const {
      project: p,
      documents,
      commit: c,
    } = await createProject({
      workspace,
      documents: { 'test-doc': 'test content' },
    })
    project = p
    document = documents[0]!
    commit = c
  })

  describe('when workspace has never created annotations', () => {
    it('returns hasAnnotations: false with zero counts', async () => {
      const result = await getAnnotationsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        hasAnnotations: false,
        annotationsCount: 0,
        passedCount: 0,
        failedCount: 0,
        passedPercentage: 0,
        failedPercentage: 0,
        topProjects: [],
      })
    })
  })

  describe('when workspace has annotations but none in last week', () => {
    it('returns hasAnnotations: true with zero counts for last week', async () => {
      const outsideRange = new Date('2024-01-01T10:00:00Z')

      const evaluation = await createEvaluationV2({
        workspace: workspace,
        document: document,
        commit: commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace: workspace,
        commit: commit,
        evaluation,
        span,
        hasPassed: true,
        createdAt: outsideRange,
      })

      const result = await getAnnotationsData({
        workspace: workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        hasAnnotations: true,
        annotationsCount: 0,
        passedCount: 0,
        failedCount: 0,
        passedPercentage: 0,
        failedPercentage: 0,
        topProjects: [],
      })
    })
  })

  describe('when workspace has annotations in last week', () => {
    it('counts passed and failed annotations correctly', async () => {
      const evaluation = await createEvaluationV2({
        workspace: workspace,
        document: document,
        commit: commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create 3 passed annotations
      for (let i = 0; i < 3; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
        })
        await createEvaluationResultV2({
          workspace: workspace,
          commit: commit,
          evaluation,
          span,
          hasPassed: true,
          createdAt: STATIC_TEST_DATE,
        })
      }

      // Create 2 failed annotations
      for (let i = 0; i < 2; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
        })
        await createEvaluationResultV2({
          workspace: workspace,
          commit: commit,
          evaluation,
          span,
          hasPassed: false,
          createdAt: STATIC_TEST_DATE,
        })
      }

      const result = await getAnnotationsData({
        workspace: workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        hasAnnotations: true,
        annotationsCount: 5,
        passedCount: 3,
        failedCount: 2,
        passedPercentage: 60, // 3/5 * 100
        failedPercentage: 40, // 2/5 * 100
        topProjects: [
          {
            projectId: project.id,
            projectName: project.name,
            annotationsCount: 5,
            passedCount: 3,
            failedCount: 2,
            passedPercentage: 60,
            failedPercentage: 40,
          },
        ],
      })
    })

    it('calculates 100% passed when all annotations passed', async () => {
      const evaluation = await createEvaluationV2({
        workspace: workspace,
        document: document,
        commit: commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create 5 passed annotations
      for (let i = 0; i < 5; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
        })
        await createEvaluationResultV2({
          workspace: workspace,
          commit: commit,
          evaluation,
          span,
          hasPassed: true,
          createdAt: STATIC_TEST_DATE,
        })
      }

      const result = await getAnnotationsData({
        workspace: workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        hasAnnotations: true,
        annotationsCount: 5,
        passedCount: 5,
        failedCount: 0,
        passedPercentage: 100,
        failedPercentage: 0,
        topProjects: [
          {
            projectId: project.id,
            projectName: project.name,
            annotationsCount: 5,
            passedCount: 5,
            failedCount: 0,
            passedPercentage: 100,
            failedPercentage: 0,
          },
        ],
      })
    })

    it('calculates 100% failed when all annotations failed', async () => {
      const evaluation = await createEvaluationV2({
        workspace: workspace,
        document: document,
        commit: commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create 3 failed annotations
      for (let i = 0; i < 3; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
        })
        await createEvaluationResultV2({
          workspace: workspace,
          commit: commit,
          evaluation,
          span,
          hasPassed: false,
          createdAt: STATIC_TEST_DATE,
        })
      }

      const result = await getAnnotationsData({
        workspace: workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        hasAnnotations: true,
        annotationsCount: 3,
        passedCount: 0,
        failedCount: 3,
        passedPercentage: 0,
        failedPercentage: 100,
        topProjects: [
          {
            projectId: project.id,
            projectName: project.name,
            annotationsCount: 3,
            passedCount: 0,
            failedCount: 3,
            passedPercentage: 0,
            failedPercentage: 100,
          },
        ],
      })
    })

    it('excludes annotations with null hasPassed value', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create annotation with hasPassed = true
      const span1 = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })
      await createEvaluationResultV2({
        workspace,
        commit,
        evaluation,
        span: span1,
        hasPassed: true,
        createdAt: STATIC_TEST_DATE,
      })

      // Create annotation with hasPassed = null (should be excluded)
      // Note: We need to manually insert because the factory doesn't support null hasPassed
      const span2 = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })
      const result2 = await createEvaluationResultV2({
        workspace,
        commit,
        evaluation,
        span: span2,
        hasPassed: true, // Will be updated to null below
        createdAt: STATIC_TEST_DATE,
      })
      // Manually update to null since factory doesn't support it
      await database
        .update(evaluationResultsV2)
        .set({ hasPassed: null })
        .where(eq(evaluationResultsV2.id, result2.id))

      const result = await getAnnotationsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        hasAnnotations: true,
        annotationsCount: 1, // Only the one with hasPassed = true
        passedCount: 1,
        failedCount: 0,
        passedPercentage: 100,
        failedPercentage: 0,
        topProjects: [
          {
            projectId: project.id,
            projectName: project.name,
            annotationsCount: 1,
            passedCount: 1,
            failedCount: 0,
            passedPercentage: 100,
            failedPercentage: 0,
          },
        ],
      })
    })

    it('respects custom date range when provided', async () => {
      const customRangeStart = new Date('2024-01-08T00:00:00Z')
      const customRangeEnd = new Date('2024-01-11T00:00:00Z')
      const dateInRange = new Date('2024-01-09T10:00:00Z')
      const dateOutOfRange = new Date('2024-01-05T10:00:00Z')

      const evaluation = await createEvaluationV2({
        workspace: workspace,
        document: document,
        commit: commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create annotation within custom range
      const span1 = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })
      await createEvaluationResultV2({
        workspace: workspace,
        commit: commit,
        evaluation,
        span: span1,
        hasPassed: true,
        createdAt: dateInRange,
      })

      // Create annotation outside custom range
      const span2 = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })
      await createEvaluationResultV2({
        workspace: workspace,
        commit: commit,
        evaluation,
        span: span2,
        hasPassed: false,
        createdAt: dateOutOfRange,
      })

      const result = await getAnnotationsData({
        workspace: workspace,
        dateRange: {
          from: customRangeStart,
          to: customRangeEnd,
        },
      })

      expect(result).toEqual({
        hasAnnotations: true,
        annotationsCount: 1, // Only the one in range
        passedCount: 1,
        failedCount: 0,
        passedPercentage: 100,
        failedPercentage: 0,
        topProjects: [
          {
            projectId: project.id,
            projectName: project.name,
            annotationsCount: 1,
            passedCount: 1,
            failedCount: 0,
            passedPercentage: 100,
            failedPercentage: 0,
          },
        ],
      })
    })
  })

  describe('when no date range is provided', () => {
    it('fetches annotations from last 7 days by default and ignores older ones', async () => {
      const evaluation = await createEvaluationV2({
        workspace: workspace,
        document: document,
        commit: commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create annotation within last 7 days (3 days ago)
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      const span1 = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })
      await createEvaluationResultV2({
        workspace: workspace,
        commit: commit,
        evaluation,
        span: span1,
        hasPassed: true,
        createdAt: threeDaysAgo,
      })

      // Create annotation older than 7 days (10 days ago)
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

      const span2 = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })
      await createEvaluationResultV2({
        workspace: workspace,
        commit: commit,
        evaluation,
        span: span2,
        hasPassed: false,
        createdAt: tenDaysAgo,
      })

      // Call without dateRange - should use default last week range
      const result = await getAnnotationsData({ workspace: workspace })

      expect(result).toEqual({
        hasAnnotations: true,
        annotationsCount: 1, // Only recent annotation
        passedCount: 1,
        failedCount: 0,
        passedPercentage: 100,
        failedPercentage: 0,
        topProjects: [
          {
            projectId: project.id,
            projectName: project.name,
            annotationsCount: 1,
            passedCount: 1,
            failedCount: 0,
            passedPercentage: 100,
            failedPercentage: 0,
          },
        ],
      })
    })
  })

  describe('edge cases', () => {
    it('handles decimal percentages correctly', async () => {
      const evaluation = await createEvaluationV2({
        workspace: workspace,
        document: document,
        commit: commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create 1 passed and 2 failed (33.33% passed, 66.67% failed)
      const span1 = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })
      await createEvaluationResultV2({
        workspace: workspace,
        commit: commit,
        evaluation,
        span: span1,
        hasPassed: true,
        createdAt: STATIC_TEST_DATE,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })
      await createEvaluationResultV2({
        workspace: workspace,
        commit: commit,
        evaluation,
        span: span2,
        hasPassed: false,
        createdAt: STATIC_TEST_DATE,
      })

      const span3 = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
      })
      await createEvaluationResultV2({
        workspace: workspace,
        commit: commit,
        evaluation,
        span: span3,
        hasPassed: false,
        createdAt: STATIC_TEST_DATE,
      })

      const result = await getAnnotationsData({
        workspace: workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        hasAnnotations: true,
        annotationsCount: 3,
        passedCount: 1,
        failedCount: 2,
        passedPercentage: expect.closeTo(33.33, 2),
        failedPercentage: expect.closeTo(66.67, 2),
        topProjects: [
          {
            projectId: project.id,
            projectName: project.name,
            annotationsCount: 3,
            passedCount: 1,
            failedCount: 2,
            passedPercentage: expect.closeTo(33.33, 2),
            failedPercentage: expect.closeTo(66.67, 2),
          },
        ],
      })
    })
  })
})
