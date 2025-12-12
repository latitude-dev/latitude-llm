import { beforeAll, describe, expect, it } from 'vitest'
import { LogSources, SpanType } from '../../../constants'
import { createWorkspace } from '../../../tests/factories'
import { createProject } from '../../../tests/factories/projects'
import { createSpan } from '../../../tests/factories/spans'
import { Workspace } from '../../../schema/models/types/Workspace'
import { getLogsData } from './index'

// Static date for testing:
// Monday, January 8, 2024 at 10:00 AM UTC
// This represents a date in the "last week" range when
// running on Sunday, January 14, 2024
const STATIC_TEST_DATE = new Date('2024-01-08T10:00:00Z')

// Date range for testing (last week): Sunday Jan 7, 2024 to Sunday Jan 14, 2024
const LAST_WEEK_START = new Date('2024-01-07T00:00:00Z')
const LAST_WEEK_END = new Date('2024-01-14T00:00:00Z')

let workspace: Workspace
describe('getLogsData', () => {
  beforeAll(async () => {
    const { workspace: ws } = await createWorkspace()
    workspace = ws
  })

  describe('when workspace has never used production', () => {
    it('returns usedInProduction: false but shows non-production stats', async () => {
      const { workspace: freshWorkspace } = await createWorkspace()

      // Create playground spans (non-production)
      await createSpan({
        workspaceId: freshWorkspace.id,
        traceId: 'playground-trace-1',
        type: SpanType.Prompt,
        source: LogSources.Playground,
        startedAt: STATIC_TEST_DATE,
      })

      await createSpan({
        workspaceId: freshWorkspace.id,
        traceId: 'playground-trace-1',
        type: SpanType.Completion,
        source: LogSources.Playground,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 100,
        tokensCompletion: 200,
        cost: 5000, // $0.05 in millicents
      })

      await createSpan({
        workspaceId: freshWorkspace.id,
        traceId: 'experiment-trace-1',
        type: SpanType.Prompt,
        source: LogSources.Experiment,
        startedAt: STATIC_TEST_DATE,
      })

      const result = await getLogsData({
        workspace: freshWorkspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        usedInProduction: false,
        logsCount: 2, // 2 distinct traces
        tokensSpent: 300, // 100 + 200
        tokensCost: 0.05, // 5000 / 100000
        topProjects: [],
      })
    })
  })

  describe('when workspace has used production but no logs in last week', () => {
    it('returns usedInProduction: true with zero counts for last week', async () => {
      const outsideRange = new Date('2024-01-01T10:00:00Z')

      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: outsideRange,
      })

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        usedInProduction: true,
        logsCount: 0,
        tokensSpent: 0,
        tokensCost: 0,
        topProjects: [],
      })
    })
  })

  describe('when no date range is provided', () => {
    it('fetches logs from previous calendar week by default and ignores older logs', async () => {
      // Create a fresh workspace for this test to avoid interference
      const { workspace: freshWorkspace } = await createWorkspace()

      // Calculate the previous calendar week (Sunday to Sunday)
      const now = new Date()
      const lastSunday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - now.getDay(),
      )
      const previousSunday = new Date(
        lastSunday.getFullYear(),
        lastSunday.getMonth(),
        lastSunday.getDate() - 7,
      )

      // Create a span within previous calendar week (Wednesday of that week)
      const dateInRange = new Date(
        previousSunday.getFullYear(),
        previousSunday.getMonth(),
        previousSunday.getDate() + 3, // Wednesday
        12, // noon
      )

      await createSpan({
        workspaceId: freshWorkspace.id,
        traceId: 'recent-trace',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: dateInRange,
      })

      await createSpan({
        workspaceId: freshWorkspace.id,
        traceId: 'recent-trace', // Same trace ID as the prompt
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: dateInRange,
        tokensPrompt: 100,
        tokensCompletion: 200,
        cost: 1000,
      })

      // Create a span older than previous calendar week (2 weeks ago)
      const dateOutOfRange = new Date(
        previousSunday.getFullYear(),
        previousSunday.getMonth(),
        previousSunday.getDate() - 10, // 10 days before previous Sunday
        12,
      )

      await createSpan({
        workspaceId: freshWorkspace.id,
        traceId: 'old-trace',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: dateOutOfRange,
      })

      await createSpan({
        workspaceId: freshWorkspace.id,
        traceId: 'old-trace', // Same trace ID as the prompt
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: dateOutOfRange,
        tokensPrompt: 500,
        tokensCompletion: 1000,
        cost: 5000,
      })

      // Call without dateRange - should use default previous calendar week range
      const result = await getLogsData({ workspace: freshWorkspace })

      expect(result.usedInProduction).toEqual(true)
      // Should only count the trace in previous calendar week, not the old one
      expect(result.logsCount).toEqual(1)
      // Should only count tokens from completion span in range
      expect(result.tokensSpent).toEqual(300) // 100 + 200
      // Should only count cost from completion span in range
      expect(result.tokensCost).toEqual(0.01) // 1000 / 100000
    })
  })

  describe('when workspace has logs in last week', () => {
    it('counts distinct trace IDs for logs count (all sources)', async () => {
      const traceId1 = 'trace-1'
      const traceId2 = 'trace-2'
      const traceId3 = 'trace-3'

      // Create multiple spans with same trace ID (should count as 1 log)
      // This also serves to enable usedInProduction
      await createSpan({
        workspaceId: workspace.id,
        traceId: traceId1,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })
      await createSpan({
        workspaceId: workspace.id,
        traceId: traceId1,
        type: SpanType.Step,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      // Create another trace from playground (should count as 2nd log)
      await createSpan({
        workspaceId: workspace.id,
        traceId: traceId2,
        type: SpanType.Prompt,
        source: LogSources.Playground,
        startedAt: STATIC_TEST_DATE,
      })

      // Create another trace from experiment (should count as 3rd log)
      await createSpan({
        workspaceId: workspace.id,
        traceId: traceId3,
        type: SpanType.Prompt,
        source: LogSources.Experiment,
        startedAt: STATIC_TEST_DATE,
      })

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.usedInProduction).toEqual(true)
      expect(result.logsCount).toEqual(3) // 3 distinct trace IDs (all sources)
    })

    it('sums tokens from completion spans only (all sources)', async () => {
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      // Create prompt span (should NOT be counted for tokens)
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 1000,
        tokensCompletion: 500,
      })

      // Create completion spans from production (should be counted)
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 100,
        tokensCompletion: 200,
        tokensCached: 50,
        tokensReasoning: 25,
      })

      // Create completion spans from playground (should ALSO be counted)
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Completion,
        source: LogSources.Playground,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 150,
        tokensCompletion: 250,
        tokensCached: 75,
        tokensReasoning: 30,
      })

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.usedInProduction).toEqual(true)
      // Total: (100 + 200 + 50 + 25) + (150 + 250 + 75 + 30) = 375 + 505 = 880
      expect(result.tokensSpent).toEqual(880)
    })

    it('sums cost from completion spans only and converts from millicents (all sources)', async () => {
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        cost: 5000000, // $50.00 in millicents
      })

      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        cost: 1234000, // $12.34 in millicents
      })

      // Create completion spans from playground (should ALSO be counted)
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Completion,
        source: LogSources.Playground,
        startedAt: STATIC_TEST_DATE,
        cost: 5678000, // $56.78 in millicents
      })

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.usedInProduction).toEqual(true)
      // Total: (1234000 + 5678000) / 100000 = 6912000 / 100000 = 69.12
      expect(result.tokensCost).toEqual(69.12)
    })

    it('handles null/undefined token and cost values', async () => {
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      // Create completion span with no tokens or cost
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      // Create completion span with some tokens
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 100,
        cost: 500,
      })

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.usedInProduction).toEqual(true)
      expect(result.tokensSpent).toEqual(100)
      expect(result.tokensCost).toEqual(0.005)
    })

    it('counts all sources for logs/tokens/cost', async () => {
      const sharedTraceId = 'shared-trace-id'
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'prod-trace-1',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: sharedTraceId,
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 100,
        cost: 1000,
      })

      // Create playground spans (should ALSO be counted)
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'playground-trace-1',
        type: SpanType.Prompt,
        source: LogSources.Playground,
        startedAt: STATIC_TEST_DATE,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: sharedTraceId,
        type: SpanType.Completion,
        source: LogSources.Playground,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 500,
        cost: 5000,
      })

      // Create experiment spans (should ALSO be counted)
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'experiment-trace-1',
        type: SpanType.Prompt,
        source: LogSources.Experiment,
        startedAt: STATIC_TEST_DATE,
      })

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.usedInProduction).toEqual(true)
      expect(result.logsCount).toEqual(4) // 4 distinct traces: prod-trace-1, shared-trace-id, playground-trace-1, experiment-trace-1
      expect(result.tokensSpent).toEqual(600) // 100 + 500
      expect(result.tokensCost).toEqual(0.06) // (1000 + 5000) / 100000
    })

    it('respects custom date range when provided', async () => {
      const customRangeStart = new Date('2024-01-08T00:00:00Z') // Jan 8
      const customRangeEnd = new Date('2024-01-11T00:00:00Z') // Jan 11
      const dateInRange = new Date('2024-01-09T10:00:00Z') // Jan 9 (within range)
      const dateOutOfRange = new Date('2024-01-05T10:00:00Z') // Jan 5 (before range)

      // Create span within custom range
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-in-range',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: dateInRange,
      })

      // Create span outside custom range
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-out-of-range',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: dateOutOfRange,
      })

      const result = await getLogsData({
        workspace,
        dateRange: {
          from: customRangeStart,
          to: customRangeEnd,
        },
      })

      expect(result.usedInProduction).toEqual(true)
      expect(result.logsCount).toEqual(1) // Only trace-in-range
    })

    it('handles all source types', async () => {
      const allSources = [
        LogSources.API,
        LogSources.Copilot,
        LogSources.EmailTrigger,
        LogSources.IntegrationTrigger,
        LogSources.ScheduledTrigger,
        LogSources.SharedPrompt,
        LogSources.User,
        LogSources.Playground,
        LogSources.Experiment,
      ]

      // Create a span for each source
      for (const source of allSources) {
        await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${source}`,
          type: SpanType.Prompt,
          source,
          startedAt: STATIC_TEST_DATE,
        })
      }

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.usedInProduction).toEqual(true)
      expect(result.logsCount).toEqual(allSources.length)
    })
  })

  describe('edge cases', () => {
    it('handles workspace with only completion spans (no prompt spans)', async () => {
      // Create only completion spans
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'completion-only-trace',
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 100,
        cost: 1000,
      })

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      // Even without prompt spans, completion spans still count for tokens/cost
      // But usedInProduction is false since there are no production prompt spans
      expect(result).toEqual({
        usedInProduction: false,
        logsCount: 1, // Completion span has a trace ID
        tokensSpent: 100,
        tokensCost: 0.01, // 1000 / 100000
        topProjects: [],
      })
    })

    it('handles very large token and cost values', async () => {
      // Create production prompt span to enable usedInProduction
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 1_000_000,
        tokensCompletion: 2_000_000,
        cost: 999_999_900, // $9,999.999 in millicents (within integer range)
      })

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result).toEqual({
        usedInProduction: true,
        logsCount: expect.any(Number),
        tokensSpent: 3_000_000,
        tokensCost: 9_999.999,
        topProjects: expect.any(Array),
      })
    })

    it('handles zero cost and zero tokens', async () => {
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 0,
        tokensCompletion: 0,
        cost: 0,
      })

      const result = await getLogsData({
        workspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.usedInProduction).toEqual(true)
      expect(result.tokensSpent).toEqual(0)
      expect(result.tokensCost).toEqual(0)
    })
  })

  describe('top projects', () => {
    it('returns top projects ordered by logs count respecting limit', async () => {
      const { workspace: freshWorkspace } = await createWorkspace()

      // Enable production usage (outside date range to not affect counts)
      const outsideRange = new Date('2024-01-01T10:00:00Z')
      await createSpan({
        workspaceId: freshWorkspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: outsideRange,
      })

      // Create 2 projects with different log counts
      const { project: project1 } = await createProject({
        workspace: freshWorkspace,
        documents: { doc1: 'content' },
      })
      const { project: project2 } = await createProject({
        workspace: freshWorkspace,
        documents: { doc2: 'content' },
      })

      // Project 1: 2 logs
      for (let j = 0; j < 2; j++) {
        const traceId = `project-${project1.id}-trace-${j}`
        await createSpan({
          workspaceId: freshWorkspace.id,
          projectId: project1.id,
          traceId,
          type: SpanType.Prompt,
          source: LogSources.API,
          startedAt: STATIC_TEST_DATE,
        })
        await createSpan({
          workspaceId: freshWorkspace.id,
          projectId: project1.id,
          traceId,
          type: SpanType.Completion,
          source: LogSources.API,
          startedAt: STATIC_TEST_DATE,
          tokensPrompt: 10,
          tokensCompletion: 20,
          cost: 100000, // $1.00 per trace
        })
      }

      // Project 2: 1 log
      await createSpan({
        workspaceId: freshWorkspace.id,
        projectId: project2.id,
        traceId: `project-${project2.id}-trace-0`,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })
      await createSpan({
        workspaceId: freshWorkspace.id,
        projectId: project2.id,
        traceId: `project-${project2.id}-trace-0`,
        type: SpanType.Completion,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
        tokensPrompt: 10,
        tokensCompletion: 20,
        cost: 100000,
      })

      const result = await getLogsData({
        workspace: freshWorkspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
        projectsLimit: 1,
      })

      // Should return only top 1 (respecting projectsLimit)
      expect(result.topProjects).toHaveLength(1)

      // Should be the project with most logs (project1 with 2 logs)
      expect(result.topProjects[0]?.projectId).toEqual(project1.id)
      expect(result.topProjects[0]?.logsCount).toEqual(2)
      expect(result.topProjects[0]?.tokensSpent).toEqual(2 * 30) // 2 traces * 30 tokens
      expect(result.topProjects[0]?.tokensCost).toEqual(2 * 1) // 2 traces * $1.00

      // Global count should include all 3 logs (2 from project1 + 1 from project2)
      expect(result.logsCount).toEqual(3)
    })

    it('includes project name in top projects', async () => {
      const { workspace: freshWorkspace } = await createWorkspace()

      // Enable production usage (outside date range to not affect counts)
      const outsideRange = new Date('2024-01-01T10:00:00Z')
      await createSpan({
        workspaceId: freshWorkspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: outsideRange,
      })

      const { project } = await createProject({
        workspace: freshWorkspace,
        name: 'Test Project Name',
        documents: { doc: 'content' },
      })

      await createSpan({
        workspaceId: freshWorkspace.id,
        projectId: project.id,
        traceId: 'test-trace',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      const result = await getLogsData({
        workspace: freshWorkspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.topProjects).toHaveLength(1)
      expect(result.topProjects[0]?.projectId).toEqual(project.id)
      expect(result.topProjects[0]?.projectName).toEqual('Test Project Name')
    })

    it('excludes spans without projectId from top projects', async () => {
      const { workspace: freshWorkspace } = await createWorkspace()

      // Enable production usage (outside date range to not affect counts)
      const outsideRange = new Date('2024-01-01T10:00:00Z')
      await createSpan({
        workspaceId: freshWorkspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: outsideRange,
      })

      const { project } = await createProject({
        workspace: freshWorkspace,
        documents: { doc: 'content' },
      })

      // Create spans with projectId
      await createSpan({
        workspaceId: freshWorkspace.id,
        projectId: project.id,
        traceId: 'with-project',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      // Create spans without projectId (should not appear in top projects)
      await createSpan({
        workspaceId: freshWorkspace.id,
        projectId: undefined,
        traceId: 'without-project',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      const result = await getLogsData({
        workspace: freshWorkspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      // Global count includes both
      expect(result.logsCount).toEqual(2)

      // Top projects only includes the one with projectId
      expect(result.topProjects).toHaveLength(1)
      expect(result.topProjects[0]?.projectId).toEqual(project.id)
    })

    it('handles projects with no completion spans (zero tokens/cost)', async () => {
      const { workspace: freshWorkspace } = await createWorkspace()

      // Enable production usage (outside date range to not affect counts)
      const outsideRange = new Date('2024-01-01T10:00:00Z')
      await createSpan({
        workspaceId: freshWorkspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: outsideRange,
      })

      const { project } = await createProject({
        workspace: freshWorkspace,
        documents: { doc: 'content' },
      })

      // Create only prompt span (no completion span)
      await createSpan({
        workspaceId: freshWorkspace.id,
        projectId: project.id,
        traceId: 'test-trace',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: STATIC_TEST_DATE,
      })

      const result = await getLogsData({
        workspace: freshWorkspace,
        dateRange: { from: LAST_WEEK_START, to: LAST_WEEK_END },
      })

      expect(result.topProjects).toHaveLength(1)
      expect(result.topProjects[0]?.logsCount).toEqual(1)
      expect(result.topProjects[0]?.tokensSpent).toEqual(0)
      expect(result.topProjects[0]?.tokensCost).toEqual(0)
    })

    it('respects date range for top projects', async () => {
      const { workspace: freshWorkspace } = await createWorkspace()

      // Enable production usage (outside date range to not affect counts)
      const enableProductionDate = new Date('2024-01-01T10:00:00Z')
      await createSpan({
        workspaceId: freshWorkspace.id,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: enableProductionDate,
      })

      const { project } = await createProject({
        workspace: freshWorkspace,
        documents: { doc: 'content' },
      })

      const dateInRange = new Date('2024-01-09T10:00:00Z')
      const dateOutOfRange = new Date('2024-01-15T10:00:00Z')

      // Create span in range
      await createSpan({
        workspaceId: freshWorkspace.id,
        projectId: project.id,
        traceId: 'in-range',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: dateInRange,
      })

      // Create span out of range
      await createSpan({
        workspaceId: freshWorkspace.id,
        projectId: project.id,
        traceId: 'out-of-range',
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: dateOutOfRange,
      })

      const result = await getLogsData({
        workspace: freshWorkspace,
        dateRange: {
          from: new Date('2024-01-08T00:00:00Z'),
          to: new Date('2024-01-11T00:00:00Z'),
        },
      })

      expect(result.topProjects).toHaveLength(1)
      expect(result.topProjects[0]?.logsCount).toEqual(1) // Only the one in range
    })
  })
})
