import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createWorkspace } from '../../../tests/factories'
import { Workspace } from '../../../schema/models/types/Workspace'
import { getIssuesData } from './index'
import { createProject } from '../../../tests/factories/projects'
import { Project } from '../../../schema/models/types/Project'
import { createIssue } from '../../../tests/factories/issues'
import { Commit } from '../../../schema/models/types/Commit'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { issues } from '../../../schema/models/issues'
import { database } from '../../../client'

// Static date for testing: Monday, January 8, 2024 at 10:00 AM UTC
const STATIC_TEST_DATE = new Date('2024-01-08T10:00:00Z')

// Date range for testing (last week): Sunday Jan 7, 2024 to Sunday Jan 14, 2024
const LAST_WEEK_START = new Date('2024-01-07T00:00:00Z')
const LAST_WEEK_END = new Date('2024-01-14T00:00:00Z')

let workspace: Workspace
let project: Project
let commit: Commit
let document: DocumentVersion

describe('getIssuesData', () => {
  beforeAll(async () => {
    const { workspace: ws } = await createWorkspace()
    workspace = ws

    const {
      project: p,
      commit: c,
      documents,
    } = await createProject({
      workspace,
      documents: { 'test-doc': 'test content' },
    })
    project = p
    commit = c
    document = documents[0]!
  })

  describe('when workspace has never created issues', () => {
    it('returns hasIssues: false with zero counts', async () => {
      const { workspace: freshWorkspace } = await createWorkspace()

      const result = await getIssuesData({
        workspace: freshWorkspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        hasIssues: false,
        issuesCount: 0,
        newIssuesCount: 0,
        escalatedIssuesCount: 0,
        resolvedIssuesCount: 0,
        ignoredIssuesCount: 0,
        regressedIssuesCount: 0,
        topProjects: [],
      })
    })
  })

  describe('when workspace has issues but none in last week', () => {
    it('returns hasIssues: true with zero counts for last week', async () => {
      const { project, commit, documents } = await createProject({
        workspace,
        documents: { 'test-doc': 'test content' },
      })

      const outsideRange = new Date('2024-01-01T10:00:00Z')

      // Create issue with histogram outside the date range
      await createIssue({
        workspace,
        project,
        document: documents[0]!,
        createdAt: outsideRange,
        histograms: [
          {
            commitId: commit.id,
            date: outsideRange,
            count: 5,
          },
        ],
      })

      const result = await getIssuesData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        hasIssues: true,
        issuesCount: 0,
        newIssuesCount: 0,
        escalatedIssuesCount: 0,
        resolvedIssuesCount: 0,
        ignoredIssuesCount: 0,
        regressedIssuesCount: 0,
        topProjects: [],
      })
    })
  })

  describe('when workspace has issues in last week', () => {
    it('counts issues correctly', async () => {
      for (let i = 0; i < 3; i++) {
        await createIssue({
          workspace,
          project,
          document,
          createdAt: STATIC_TEST_DATE,
          histograms: [
            {
              commitId: commit.id,
              date: STATIC_TEST_DATE,
              count: 5,
            },
          ],
        })
      }

      const result = await getIssuesData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.hasIssues).toBe(true)
      expect(result.issuesCount).toBe(3)
      expect(result.newIssuesCount).toBe(3) // All created in range
      expect(result.topProjects).toHaveLength(1)
      expect(result.topProjects[0]?.issuesCount).toBe(3)
    })

    it('counts new issues created in date range', async () => {
      const oldDate = new Date('2023-12-01T10:00:00Z')

      // Create old issue (not new) but with histogram in range
      await createIssue({
        workspace,
        project,
        document,
        createdAt: oldDate,
        histograms: [
          {
            commitId: commit.id,
            date: STATIC_TEST_DATE,
            count: 5,
          },
        ],
      })

      // Create new issue in range
      await createIssue({
        workspace,
        project,
        document,
        createdAt: STATIC_TEST_DATE,
        histograms: [
          {
            commitId: commit.id,
            date: STATIC_TEST_DATE,
            count: 3,
          },
        ],
      })

      const result = await getIssuesData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.issuesCount).toBe(2)
      expect(result.newIssuesCount).toBe(1) // Only the one created in range
    })

    it('counts escalated issues in date range', async () => {
      await createIssue({
        workspace,
        project,
        document,
        createdAt: STATIC_TEST_DATE,
        escalatingAt: STATIC_TEST_DATE,
        histograms: [
          {
            commitId: commit.id,
            date: STATIC_TEST_DATE,
            count: 5,
          },
        ],
      })

      const result = await getIssuesData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.issuesCount).toBe(1)
      expect(result.escalatedIssuesCount).toBe(1)
    })

    it('counts resolved issues in date range', async () => {
      const resolvedDate = STATIC_TEST_DATE

      const { issue } = await createIssue({
        workspace,
        project,
        document,
        createdAt: resolvedDate,
        histograms: [
          {
            commitId: commit.id,
            date: STATIC_TEST_DATE,
            count: 5,
          },
        ],
      })

      await database
        .update(issues)
        .set({ resolvedAt: resolvedDate })
        .where(eq(issues.id, issue.id))

      const result = await getIssuesData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.issuesCount).toEqual(1)
      expect(result.resolvedIssuesCount).toEqual(1)
    })

    it('counts regressed issues (resolved but had occurrences after resolution)', async () => {
      const resolvedDate = new Date('2024-01-06T10:00:00Z')
      const { issue } = await createIssue({
        workspace,
        project,
        document,
        createdAt: resolvedDate,
        histograms: [
          {
            commitId: commit.id,
            date: resolvedDate,
            count: 5,
          },
          {
            commitId: commit.id,
            date: STATIC_TEST_DATE, // After resolution
            count: 3,
          },
        ],
      })

      await database
        .update(issues)
        .set({ resolvedAt: resolvedDate })
        .where(eq(issues.id, issue.id))

      const result = await getIssuesData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.issuesCount).toBe(1)
      expect(result.regressedIssuesCount).toBe(1)
    })

    it('respects custom date range when provided', async () => {
      const customRangeStart = new Date('2024-01-08T00:00:00Z')
      const customRangeEnd = new Date('2024-01-11T00:00:00Z')
      const dateInRange = new Date('2024-01-09T10:00:00Z')
      const dateOutOfRange = new Date('2024-01-15T10:00:00Z')

      // Issue with histogram in custom range
      await createIssue({
        workspace,
        project,
        document,
        createdAt: dateInRange,
        histograms: [
          {
            commitId: commit.id,
            date: dateInRange,
            count: 5,
          },
        ],
      })

      await createIssue({
        workspace,
        project,
        document,
        createdAt: dateOutOfRange,
        histograms: [
          {
            commitId: commit.id,
            date: dateOutOfRange,
            count: 3,
          },
        ],
      })

      const result = await getIssuesData({
        workspace,
        dateRange: {
          from: customRangeStart,
          to: customRangeEnd,
        },
      })

      expect(result.issuesCount).toBe(1) // Only the one in range
      expect(result.topProjects[0]?.issuesCount).toBe(1)
    })
  })

  describe('top projects', () => {
    it('returns top 10 projects ordered by issue count', async () => {
      for (let i = 0; i < 12; i++) {
        const {
          project: p,
          commit: c,
          documents,
        } = await createProject({
          workspace,
          documents: { [`doc-${i}`]: 'content' },
        })

        const issueCount = 12 - i // Descending counts: 12, 11, 10, ..., 1

        for (let j = 0; j < issueCount; j++) {
          await createIssue({
            workspace,
            project: p,
            document: documents[0]!,
            createdAt: STATIC_TEST_DATE,
            histograms: [
              {
                commitId: c.id,
                date: STATIC_TEST_DATE,
                count: 1,
              },
            ],
          })
        }
      }

      const result = await getIssuesData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      // Should return only top 10
      expect(result.topProjects).toHaveLength(10)

      // Should be ordered by issue count descending
      expect(result.topProjects[0]?.issuesCount).toBe(12)
      expect(result.topProjects[1]?.issuesCount).toBe(11)
      expect(result.topProjects[9]?.issuesCount).toBe(3)

      // Global count should include all 12 projects
      const totalIssues = ((12 + 1) * 12) / 2 // Sum from 1 to 12
      expect(result.issuesCount).toBe(totalIssues)
    })
  })
})
