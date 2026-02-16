import { SpanStatus } from '@latitude-data/constants'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getUsageOverview } from './getUsageOverview'
import { buildAllData, onlyOverviewWorkspaces } from './testHelper'
import { database } from '../../../client'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { spans } from '../../../schema/models/spans'
import { eq, inArray } from 'drizzle-orm'

let targetDate: Date
let data: Awaited<ReturnType<typeof buildAllData>>

describe('getUsageOverview', () => {
  beforeAll(async () => {
    // CI uses UTC timezone
    vi.stubEnv('TZ', 'UTC')

    targetDate = new Date(Date.UTC(2025, 1, 2, 0, 0, 0, 0))
    data = await buildAllData(targetDate)
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('returns all workspaces ordered by usage of traces', async () => {
    const result = await getUsageOverview({
      page: 1,
      pageSize: 10,
      targetDate,
    })

    expect(onlyOverviewWorkspaces(result)).toEqual([
      {
        ...data.workspaces.workspaceA.expectedData,
        emails: expect.any(String), // TODO: fix troll tests
        lastMonthTraces: '4',
        lastTwoMonthsTraces: '1',
        latestTraceAt: expect.any(String),
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        emails: expect.any(String),
        lastMonthTraces: '3',
        lastTwoMonthsTraces: '2',
        latestTraceAt: expect.any(String),
      },
    ])
  })

  it('filter spans with errors', async () => {
    const span = data.workspaces.workspaceB.info.spans[0]!
    await database
      .update(spans)
      .set({ status: SpanStatus.Error })
      .where(eq(spans.id, span.id))

    const result = await getUsageOverview({
      page: 1,
      pageSize: 10,
      targetDate,
    })

    expect(onlyOverviewWorkspaces(result)).toEqual([
      {
        ...data.workspaces.workspaceA.expectedData,
        emails: expect.any(String),
        lastMonthTraces: '4',
        lastTwoMonthsTraces: '1',
        latestTraceAt: expect.any(String),
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        emails: expect.any(String),
        name: data.workspaces.workspaceB.expectedData.name,
        lastMonthTraces: '3',
        lastTwoMonthsTraces: '2',
        latestTraceAt: expect.any(String),
      },
    ])
  })

  it('filter evaluation results with errors', async () => {
    const evaluationResultV21 =
      data.workspaces.workspaceB.info.evaluationResultsV2[0]
    const evaluationResultV22 =
      data.workspaces.workspaceB.info.evaluationResultsV2[1]
    await database
      .update(evaluationResultsV2)
      .set({
        error: { message: 'Error message' },
      })
      .where(
        inArray(evaluationResultsV2.id, [
          evaluationResultV21.id,
          evaluationResultV22.id,
        ]),
      )

    const result = await getUsageOverview({
      page: 1,
      pageSize: 10,
      targetDate,
    })

    expect(onlyOverviewWorkspaces(result)).toEqual([
      {
        ...data.workspaces.workspaceA.expectedData,
        emails: expect.any(String),
        lastMonthTraces: '4',
        lastTwoMonthsTraces: '1',
        latestTraceAt: expect.any(String),
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        emails: expect.any(String),
        subscriptionCreatedAt: '2024-07-19 00:00:00',
        lastMonthTraces: '2',
        lastTwoMonthsTraces: '1',
        latestTraceAt: expect.any(String),
      },
    ])
  })
})
