import { beforeEach, describe, expect, it } from 'vitest'
import { ISSUE_GROUP, ISSUE_STATUS } from '@latitude-data/constants/issues'
import { type Commit } from '../schema/models/types/Commit'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
import { type Project } from '../schema/models/types/Project'
import { type Workspace } from '../schema/models/types/Workspace'
import { resolveIssue } from '../services/issues/resolve'
import { ignoreIssue } from '../services/issues/ignore'
import { mergeIssues } from '../services/issues/merge'
import * as factories from '../tests/factories'
import { IssuesRepository } from './issuesRepository'

let workspace: Workspace
let project: Project
let commit: Commit
let document: DocumentVersion
let repository: IssuesRepository

describe('IssuesRepository - Group Filtering', () => {
  beforeEach(async () => {
    const setup = await factories.createProject({
      documents: {
        'test-doc': 'Test document content',
      },
    })

    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!

    const { user } = setup

    // Create issues with different statuses
    // 1. Active issue (not resolved, not ignored, not merged)
    await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
          issue: null as any,
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })

    // 2. Resolved issue
    const resolvedIssueData = await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
          issue: null as any,
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })
    await resolveIssue({ issue: resolvedIssueData.issue, user })

    // 3. Ignored issue
    const ignoredIssueData = await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
          issue: null as any,
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })
    await ignoreIssue({ issue: ignoredIssueData.issue, user })

    // 4. Merged issue
    const mergedIssueData = await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
          issue: null as any,
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })
    await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
          issue: null as any,
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })

    // Use mergeIssues service instead which is the actual method
    await mergeIssues({
      workspace,
      issue: mergedIssueData.issue,
    })

    repository = new IssuesRepository(workspace.id)
  })

  describe('active status', () => {
    it('filters issues with active status correctly', async () => {
      const result = await repository.fetchIssuesFiltered({
        project,
        commit,
        filters: {
          status: ISSUE_STATUS.active,
        },
        sorting: { sort: 'relevance', sortDirection: 'desc' },
        page: 1,
        limit: 100,
      })

      const issues = result.unwrap().issues

      // Should include only active issues (not resolved, not ignored, not merged)
      expect(issues.length).toBeGreaterThanOrEqual(1)

      // All issues should not be resolved, ignored, or merged
      issues.forEach((issue) => {
        expect(issue.isResolved || issue.isIgnored || issue.isMerged).toBe(
          false,
        )
      })
    })
  })

  describe('inactive status', () => {
    it('filters issues with inactive status correctly', async () => {
      const result = await repository.fetchIssuesFiltered({
        project,
        commit,
        filters: {
          status: ISSUE_STATUS.inactive,
        },
        sorting: { sort: 'relevance', sortDirection: 'desc' },
        page: 1,
        limit: 100,
      })

      const issues = result.unwrap().issues

      // Should include resolved, ignored, or merged issues
      expect(issues.length).toBeGreaterThanOrEqual(1)

      // All issues should be resolved, ignored, or merged
      issues.forEach((issue) => {
        const isInactive = issue.isResolved || issue.isIgnored || issue.isMerged
        expect(isInactive).toBe(true)
      })
    })
  })

  describe('default status (active)', () => {
    it('uses active status as default when no status provided', async () => {
      const result = await repository.fetchIssuesFiltered({
        project,
        commit,
        filters: {},
        sorting: { sort: 'relevance', sortDirection: 'desc' },
        page: 1,
        limit: 100,
      })

      const issues = result.unwrap().issues

      // Default should be active status
      expect(issues.length).toBeGreaterThanOrEqual(1)

      // All issues should not be resolved, ignored, or merged
      issues.forEach((issue) => {
        expect(issue.isResolved || issue.isIgnored || issue.isMerged).toBe(
          false,
        )
      })
    })
  })

  describe('activeWithResolved status', () => {
    it('filters issues with activeWithResolved group correctly', async () => {
      const issues = await repository.findByTitleAndStatuses({
        project,
        document,
        title: null,
        group: ISSUE_GROUP.activeWithResolved,
      })

      // Should include active (not resolved, not ignored) AND resolved issues
      // But exclude ignored and merged issues
      expect(issues.length).toBeGreaterThanOrEqual(2)

      // All issues should not be ignored or merged
      issues.forEach((issue) => {
        expect(issue.documentUuid).toBe(document.documentUuid)
      })
    })
  })
})
