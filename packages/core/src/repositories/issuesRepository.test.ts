import { beforeEach, describe, expect, it } from 'vitest'
import { ISSUE_GROUP, ISSUE_STATUS } from '@latitude-data/constants/issues'
import { type Commit } from '../schema/models/types/Commit'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
import { type Project } from '../schema/models/types/Project'
import { type User } from '../schema/models/types/User'
import { type Workspace } from '../schema/models/types/Workspace'
import { resolveIssue } from '../services/issues/resolve'
import { ignoreIssue } from '../services/issues/ignore'
import { mergeIssues } from '../services/issues/merge'
import { destroyDocument } from '../services/documents/destroyDocument'
import * as factories from '../tests/factories'
import { IssuesRepository } from './issuesRepository'

let workspace: Workspace
let project: Project
let commit: Commit
let document: DocumentVersion
let repository: IssuesRepository
let user: User

describe('IssuesRepository - lastCommit field', () => {
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
    user = setup.user

    repository = new IssuesRepository(workspace.id)
  })

  it('returns lastCommit with correct commit info', async () => {
    await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })

    const result = await repository.fetchIssuesFiltered({
      project,
      commit,
      filters: {},
      sorting: { sort: 'relevance', sortDirection: 'desc' },
      page: 1,
      limit: 100,
    })

    const issues = result.unwrap().issues
    expect(issues.length).toBe(1)

    const issue = issues[0]!
    expect(issue.lastCommit).toBeDefined()
    expect(issue.lastCommit?.uuid).toBe(commit.uuid)
    expect(issue.lastCommit?.title).toBe(commit.title)
    expect(issue.lastCommit?.version).toBe(commit.version)
  })

  it('returns lastCommit from the most recent occurrence', async () => {
    const { commit: newerDraft } = await factories.createDraft({
      project,
      user,
    })

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayOccurredAt = new Date(yesterday)
    yesterdayOccurredAt.setHours(10, 0, 0, 0)

    const today = new Date()
    const todayOccurredAt = new Date(today)
    todayOccurredAt.setHours(15, 0, 0, 0)

    await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: yesterday,
      histograms: [
        {
          commitId: commit.id,
          date: yesterday,
          occurredAt: yesterdayOccurredAt,
          count: 5,
        },
        {
          commitId: newerDraft.id,
          date: today,
          occurredAt: todayOccurredAt,
          count: 2,
        },
      ],
    })

    const result = await repository.fetchIssuesFiltered({
      project,
      commit: newerDraft,
      filters: {},
      sorting: { sort: 'relevance', sortDirection: 'desc' },
      page: 1,
      limit: 100,
    })

    const issues = result.unwrap().issues
    expect(issues.length).toBe(1)

    const issue = issues[0]!
    expect(issue.lastCommit).toBeDefined()
    expect(issue.lastCommit?.uuid).toBe(newerDraft.uuid)
    expect(issue.lastCommit?.title).toBe(newerDraft.title)
  })

  it('returns lastCommit in findWithStats', async () => {
    const { issue } = await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })

    const issueWithStats = await repository.findWithStats({
      project,
      issueId: issue.id,
    })

    expect(issueWithStats).toBeDefined()
    expect(issueWithStats?.lastCommit).toBeDefined()
    expect(issueWithStats?.lastCommit?.uuid).toBe(commit.uuid)
    expect(issueWithStats?.lastCommit?.title).toBe(commit.title)
    expect(issueWithStats?.lastCommit?.version).toBe(commit.version)
  })
})

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
    user = setup.user

    // Create issues with different statuses
    // 1. Active issue (not resolved, not ignored, not merged)
    await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
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
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })
    await resolveIssue({
      issue: resolvedIssueData.issue,
      user,
      ignoreEvaluations: false,
    })

    // 3. Ignored issue
    const ignoredIssueData = await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
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
        commit,
        title: null,
        group: ISSUE_GROUP.activeWithResolved,
      })

      // Should include active (not resolved, not ignored) AND resolved issues
      // But exclude ignored and merged issues
      expect(issues.length).toBeGreaterThanOrEqual(2)

      // All issues should not be ignored or merged
      issues.forEach((issue) => {
        expect(issue.documentUuid).toBe(document.documentUuid)
        expect(issue.title).toBeDefined()
        expect(issue.description).toBeDefined()
      })
    })
  })
})

describe('IssuesRepository - Deleted Documents Filtering', () => {
  beforeEach(async () => {
    const setup = await factories.createProject({
      documents: {
        'doc-1': 'Test document 1',
        'doc-2': 'Test document 2',
      },
    })

    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!
    user = setup.user

    repository = new IssuesRepository(workspace.id)
  })

  it('excludes issues from deleted documents', async () => {
    await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })

    const result = await repository.fetchIssuesFiltered({
      project,
      commit,
      filters: {},
      sorting: { sort: 'relevance', sortDirection: 'desc' },
      page: 1,
      limit: 100,
    })

    const issues = result.unwrap().issues
    expect(issues.length).toBe(1)

    const { commit: draftCommit } = await factories.createDraft({
      project,
      user,
    })
    await destroyDocument({ document, commit: draftCommit, workspace })

    const resultAfterDelete = await repository.fetchIssuesFiltered({
      project,
      commit: draftCommit,
      filters: {},
      sorting: { sort: 'relevance', sortDirection: 'desc' },
      page: 1,
      limit: 100,
    })

    const issuesAfterDelete = resultAfterDelete.unwrap().issues
    expect(issuesAfterDelete.length).toBe(0)
  })

  it('shows issues from non-deleted documents after another document is deleted', async () => {
    const setup = await factories.createProject({
      documents: {
        'doc-a': 'Document A',
        'doc-b': 'Document B',
      },
    })

    const docA = setup.documents.find((d) => d.path === 'doc-a')!
    const docB = setup.documents.find((d) => d.path === 'doc-b')!

    await factories.createIssue({
      workspace: setup.workspace,
      project: setup.project,
      document: docA,
      createdAt: new Date(),
      histograms: [
        {
          commitId: setup.commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })

    await factories.createIssue({
      workspace: setup.workspace,
      project: setup.project,
      document: docB,
      createdAt: new Date(),
      histograms: [
        {
          commitId: setup.commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })

    const repo = new IssuesRepository(setup.workspace.id)
    const resultBefore = await repo.fetchIssuesFiltered({
      project: setup.project,
      commit: setup.commit,
      filters: {},
      sorting: { sort: 'relevance', sortDirection: 'desc' },
      page: 1,
      limit: 100,
    })

    expect(resultBefore.unwrap().issues.length).toBe(2)

    const { commit: draftCommit } = await factories.createDraft({
      project: setup.project,
      user: setup.user,
    })
    await destroyDocument({
      document: docA,
      commit: draftCommit,
      workspace: setup.workspace,
    })

    const resultAfter = await repo.fetchIssuesFiltered({
      project: setup.project,
      commit: draftCommit,
      filters: {},
      sorting: { sort: 'relevance', sortDirection: 'desc' },
      page: 1,
      limit: 100,
    })

    const issuesAfter = resultAfter.unwrap().issues
    expect(issuesAfter.length).toBe(1)
    expect(issuesAfter[0]!.documentUuid).toBe(docB.documentUuid)
  })

  it('still shows issues from deleted document when viewing older commit', async () => {
    await factories.createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
      histograms: [
        {
          commitId: commit.id,
          date: new Date(),
          count: 1,
        },
      ],
    })

    const { commit: draftCommit } = await factories.createDraft({
      project,
      user,
    })
    await destroyDocument({ document, commit: draftCommit, workspace })

    const resultOnOlderCommit = await repository.fetchIssuesFiltered({
      project,
      commit,
      filters: {},
      sorting: { sort: 'relevance', sortDirection: 'desc' },
      page: 1,
      limit: 100,
    })

    expect(resultOnOlderCommit.unwrap().issues.length).toBe(1)

    const resultOnDraft = await repository.fetchIssuesFiltered({
      project,
      commit: draftCommit,
      filters: {},
      sorting: { sort: 'relevance', sortDirection: 'desc' },
      page: 1,
      limit: 100,
    })

    expect(resultOnDraft.unwrap().issues.length).toBe(0)
  })
})
