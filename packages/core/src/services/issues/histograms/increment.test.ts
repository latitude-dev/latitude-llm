import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { format } from 'date-fns'
import { createProject, createIssue } from '../../../tests/factories'
import { incrementIssueHistogram } from './increment'
import * as publisherModule from '../../../events/publisher'
import type { Workspace } from '../../../schema/models/types/Workspace'
import type { Project } from '../../../schema/models/types/Project'
import type { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import type { Commit } from '../../../schema/models/types/Commit'
import type { EvaluationResultV2 } from '../../../constants'

// Mock the publisher
vi.mock('../../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('incrementIssueHistogram', () => {
  let workspace: Workspace
  let project: Project
  let documents: DocumentVersion[]
  let commit: Commit

  beforeAll(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Hello world',
      },
    })
    workspace = setup.workspace
    project = setup.project
    documents = setup.documents
    commit = setup.commit
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when creating a new histogram', () => {
    it('should create histogram with count 1', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const evaluationResult = {
        id: 1,
        createdAt: new Date(),
      } as EvaluationResultV2

      const result = await incrementIssueHistogram({
        result: evaluationResult,
        issue,
        commit,
        workspace,
      })

      const histogram = result.unwrap().histogram

      expect(histogram).toBeDefined()
      expect(histogram.issueId).toBe(issue.id)
      expect(histogram.commitId).toBe(commit.id)
      expect(histogram.workspaceId).toBe(workspace.id)
      expect(histogram.projectId).toBe(commit.projectId)
      expect(histogram.documentUuid).toBe(issue.documentUuid)
      expect(histogram.count).toBe(1)
      expect(histogram.date).toBe(
        format(evaluationResult.createdAt, 'yyyy-MM-dd'),
      )
      expect(histogram.occurredAt).toEqual(evaluationResult.createdAt)
    })

    it('should publish issueIncremented event', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const evaluationResult = {
        id: 1,
        createdAt: new Date(),
      } as EvaluationResultV2

      const result = await incrementIssueHistogram({
        result: evaluationResult,
        issue,
        commit,
        workspace,
      })

      const histogram = result.unwrap().histogram

      expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith({
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: histogram.id,
          commitUuid: commit.uuid,
          projectId: commit.projectId,
        },
      })
    })
  })

  describe('when incrementing existing histogram', () => {
    it('should increment count for same issue/commit/date', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const evaluationResult = {
        id: 1,
        createdAt: new Date(),
      } as EvaluationResultV2

      // First increment
      const firstResult = await incrementIssueHistogram({
        result: evaluationResult,
        issue,
        commit,
        workspace,
      })
      const firstHistogram = firstResult.unwrap().histogram

      expect(firstHistogram.count).toBe(1)

      // Second increment (same date)
      const secondResult = await incrementIssueHistogram({
        result: { ...evaluationResult, id: 2 },
        issue,
        commit,
        workspace,
      })
      const secondHistogram = secondResult.unwrap().histogram

      expect(secondHistogram.id).toBe(firstHistogram.id)
      expect(secondHistogram.count).toBe(2)
    })

    it('should update occurredAt to latest time', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const now = new Date()
      const later = new Date(now.getTime() + 60000) // 1 minute later

      const firstResult = {
        id: 1,
        createdAt: now,
      } as EvaluationResultV2

      const secondResult = {
        id: 2,
        createdAt: later,
      } as EvaluationResultV2

      // First increment
      await incrementIssueHistogram({
        result: firstResult,
        issue,
        commit,
        workspace,
      })

      // Second increment with later time
      const result = await incrementIssueHistogram({
        result: secondResult,
        issue,
        commit,
        workspace,
      })

      const histogram = result.unwrap().histogram

      expect(histogram.occurredAt).toEqual(later)
    })

    it('should keep earlier occurredAt when new event is older', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const now = new Date()
      const earlier = new Date(now.getTime() - 60000) // 1 minute earlier

      const firstResult = {
        id: 1,
        createdAt: now,
      } as EvaluationResultV2

      const secondResult = {
        id: 2,
        createdAt: earlier,
      } as EvaluationResultV2

      // First increment
      await incrementIssueHistogram({
        result: firstResult,
        issue,
        commit,
        workspace,
      })

      // Second increment with earlier time
      const result = await incrementIssueHistogram({
        result: secondResult,
        issue,
        commit,
        workspace,
      })

      const histogram = result.unwrap().histogram

      // Should keep the latest time (now)
      expect(histogram.occurredAt).toEqual(now)
    })
  })

  describe('when incrementing on different dates', () => {
    it('should create separate histograms for different dates', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const todayResult = {
        id: 1,
        createdAt: today,
      } as EvaluationResultV2

      const yesterdayResult = {
        id: 2,
        createdAt: yesterday,
      } as EvaluationResultV2

      // Increment for today
      const todayIncrement = await incrementIssueHistogram({
        result: todayResult,
        issue,
        commit,
        workspace,
      })

      // Increment for yesterday
      const yesterdayIncrement = await incrementIssueHistogram({
        result: yesterdayResult,
        issue,
        commit,
        workspace,
      })

      const todayHistogram = todayIncrement.unwrap().histogram
      const yesterdayHistogram = yesterdayIncrement.unwrap().histogram

      expect(todayHistogram.id).not.toBe(yesterdayHistogram.id)
      expect(todayHistogram.date).toBe(format(today, 'yyyy-MM-dd'))
      expect(yesterdayHistogram.date).toBe(format(yesterday, 'yyyy-MM-dd'))
      expect(todayHistogram.count).toBe(1)
      expect(yesterdayHistogram.count).toBe(1)
    })
  })

  describe('event publishing', () => {
    it('should publish event after transaction completes', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const evaluationResult = {
        id: 1,
        createdAt: new Date(),
      } as EvaluationResultV2

      await incrementIssueHistogram({
        result: evaluationResult,
        issue,
        commit,
        workspace,
      })

      // Verify event was published
      expect(publisherModule.publisher.publishLater).toHaveBeenCalledTimes(1)
    })

    it('should publish event with correct histogram ID', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const evaluationResult = {
        id: 1,
        createdAt: new Date(),
      } as EvaluationResultV2

      const result = await incrementIssueHistogram({
        result: evaluationResult,
        issue,
        commit,
        workspace,
      })

      const histogram = result.unwrap().histogram

      expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith({
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: histogram.id,
          commitUuid: commit.uuid,
          projectId: commit.projectId,
        },
      })
    })

    it('should publish event even when incrementing existing histogram', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const evaluationResult = {
        id: 1,
        createdAt: new Date(),
      } as EvaluationResultV2

      // First increment
      await incrementIssueHistogram({
        result: evaluationResult,
        issue,
        commit,
        workspace,
      })

      vi.clearAllMocks()

      // Second increment
      await incrementIssueHistogram({
        result: { ...evaluationResult, id: 2 },
        issue,
        commit,
        workspace,
      })

      // Event should still be published
      expect(publisherModule.publisher.publishLater).toHaveBeenCalledTimes(1)
    })
  })

  describe('data integrity', () => {
    it('should set correct workspace and project IDs', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const evaluationResult = {
        id: 1,
        createdAt: new Date(),
      } as EvaluationResultV2

      const result = await incrementIssueHistogram({
        result: evaluationResult,
        issue,
        commit,
        workspace,
      })

      const histogram = result.unwrap().histogram

      expect(histogram.workspaceId).toBe(workspace.id)
      expect(histogram.projectId).toBe(project.id)
      expect(histogram.projectId).toBe(commit.projectId)
    })

    it('should set correct timestamps', async () => {
      const doc = documents[0]!
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      const before = new Date()

      const evaluationResult = {
        id: 1,
        createdAt: new Date(),
      } as EvaluationResultV2

      const result = await incrementIssueHistogram({
        result: evaluationResult,
        issue,
        commit,
        workspace,
      })

      const after = new Date()
      const histogram = result.unwrap().histogram

      expect(histogram.createdAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      )
      expect(histogram.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
      expect(histogram.updatedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      )
      expect(histogram.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })
})
